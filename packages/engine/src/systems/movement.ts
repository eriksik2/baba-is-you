/**
 * Movement resolution.
 *
 * YOU units attempt to step; PUSH chains recurse;
 * STOP / PULL-without-PUSH block entry;
 * after a successful YOU step, PULL objects behind the mover follow;
 * STICKY neighbors (8-way) then occupy vacated cells (never swap).
 */

import type { EntityRecord } from "../entity/store";
import type { PropertyRegistry } from "../properties";
import type { Direction, Vec2 } from "../types";
import { DIRECTION_DELTA, OPPOSITE_DIRECTION, addVec } from "../types";
import type { World } from "../world/world";

export interface MoveResult {
  moved: boolean;
  /** Entities that changed cells this attempt (for effects). */
  movers: EntityRecord[];
  /** Cells left by movers this attempt (in move order). */
  vacated: Vec2[];
}

/** 8-neighborhood offsets, reading order. */
export const STICKY_OFFSETS: ReadonlyArray<Vec2> = [
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: -1, y: 1 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
];

function blocksEntry(world: World, occ: EntityRecord): boolean {
  const push = world.hasProperty(occ, "push");
  if (push) return false;
  return world.hasProperty(occ, "stop") || world.hasProperty(occ, "pull");
}

function directionToward(from: Vec2, to: Vec2): Direction {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? "right" : "left";
  }
  return dy >= 0 ? "down" : "up";
}

/**
 * Try to move `entity` one step. Handles push chains.
 * Returns whether the original entity moved.
 */
export function tryMove(
  world: World,
  properties: PropertyRegistry,
  entity: EntityRecord,
  direction: Direction,
  visiting: Set<number> = new Set(),
): MoveResult {
  if (!entity.alive) return { moved: false, movers: [], vacated: [] };
  if (visiting.has(entity.id as unknown as number)) {
    return { moved: false, movers: [], vacated: [] };
  }
  visiting.add(entity.id as unknown as number);

  const delta = DIRECTION_DELTA[direction];
  const dest = addVec(entity.position, delta);
  return tryEnterCell(world, properties, entity, dest, direction, visiting);
}

/**
 * Move entity into an absolute cell (cardinal or diagonal).
 * Push chains use `pushDir` (toward the destination).
 */
export function tryEnterCell(
  world: World,
  properties: PropertyRegistry,
  entity: EntityRecord,
  dest: Vec2,
  pushDir: Direction,
  visiting: Set<number> = new Set(),
): MoveResult {
  if (!entity.alive) return { moved: false, movers: [], vacated: [] };

  if (!world.grid.inBounds(dest)) {
    return { moved: false, movers: [], vacated: [] };
  }

  const occupants = world.grid.entitiesAt(dest, world.entities);
  const ctx = { world, direction: pushDir };

  for (const occ of occupants) {
    if (blocksEntry(world, occ)) {
      const handler = properties.get("stop");
      if (handler?.onBeforeEnter && !handler.onBeforeEnter(entity, occ, ctx)) {
        return { moved: false, movers: [], vacated: [] };
      }
      return { moved: false, movers: [], vacated: [] };
    }
  }

  const pushables = occupants.filter((o) => world.hasProperty(o, "push"));
  const pushed: EntityRecord[] = [];
  const vacated: Vec2[] = [];

  for (const p of pushables) {
    const res = tryMove(world, properties, p, pushDir, visiting);
    if (!res.moved) {
      return { moved: false, movers: [], vacated: [] };
    }
    pushed.push(...res.movers);
    vacated.push(...res.vacated);
  }

  const afterPushOccupants = world.grid.entitiesAt(dest, world.entities);
  for (const occ of afterPushOccupants) {
    if (occ.id === entity.id) continue;
    for (const handler of properties.all()) {
      if (!world.hasProperty(occ, handler.id)) continue;
      if (handler.onBeforeEnter && !handler.onBeforeEnter(entity, occ, ctx)) {
        return { moved: false, movers: [], vacated: [] };
      }
    }
  }

  const from = { ...entity.position };
  world.moveEntity(entity.id, dest);
  entity.facing = pushDir;
  vacated.push(from);
  const movers = [...pushed, entity];

  const landedWith = world.grid.entitiesAt(dest, world.entities);
  for (const occ of landedWith) {
    if (occ.id === entity.id) continue;
    for (const handler of properties.all()) {
      if (!world.hasProperty(occ, handler.id)) continue;
      handler.onAfterEnter?.(entity, occ, ctx);
    }
  }

  return { moved: true, movers, vacated };
}

/**
 * After `vacated` is emptied by a mover traveling `direction`, pull any PULL
 * objects that sat on the opposite side so they follow into `vacated`.
 */
export function applyPullChain(
  world: World,
  properties: PropertyRegistry,
  vacated: Vec2,
  direction: Direction,
  visiting: Set<number> = new Set(),
): MoveResult {
  const behind = addVec(vacated, DIRECTION_DELTA[OPPOSITE_DIRECTION[direction]]);
  if (!world.grid.inBounds(behind)) {
    return { moved: false, movers: [], vacated: [] };
  }

  const pulls = world.grid
    .entitiesAt(behind, world.entities)
    .filter((o) => o.alive && world.hasProperty(o, "pull"));

  const movers: EntityRecord[] = [];
  const vacatedCells: Vec2[] = [];
  let any = false;
  for (const p of pulls) {
    const res = tryMove(world, properties, p, direction, visiting);
    if (!res.moved) continue;
    any = true;
    movers.push(...res.movers);
    vacatedCells.push(...res.vacated);
    const more = applyPullChain(world, properties, behind, direction, visiting);
    movers.push(...more.movers);
    vacatedCells.push(...more.vacated);
  }
  return { moved: any, movers, vacated: vacatedCells };
}

/**
 * STICKY: any sticky in the 8-neighborhood of a vacated cell tries to occupy it.
 * Never swaps — only enters cells already vacated. Deterministic offset order.
 */
export function applyStickyFollow(
  world: World,
  properties: PropertyRegistry,
  vacatedCells: readonly Vec2[],
  alreadyMoved: Set<number> = new Set(),
): MoveResult {
  const movers: EntityRecord[] = [];
  const vacated: Vec2[] = [];
  let any = false;

  // Process vacancies in order; each sticky moves at most once per call.
  for (const cell of vacatedCells) {
    if (!world.grid.inBounds(cell)) continue;

    const candidates: EntityRecord[] = [];
    for (const off of STICKY_OFFSETS) {
      const n = { x: cell.x + off.x, y: cell.y + off.y };
      if (!world.grid.inBounds(n)) continue;
      for (const e of world.grid.entitiesAt(n, world.entities)) {
        if (!e.alive) continue;
        if (!world.hasProperty(e, "sticky")) continue;
        if (alreadyMoved.has(e.id as unknown as number)) continue;
        candidates.push(e);
      }
    }

    // Stable: reading order by position then id.
    candidates.sort((a, b) => {
      if (a.position.y !== b.position.y) return a.position.y - b.position.y;
      if (a.position.x !== b.position.x) return a.position.x - b.position.x;
      return (a.id as unknown as number) - (b.id as unknown as number);
    });

    for (const sticky of candidates) {
      if (alreadyMoved.has(sticky.id as unknown as number)) continue;
      const cur = world.entities.get(sticky.id);
      if (!cur?.alive || !world.hasProperty(cur, "sticky")) continue;

      const pushDir = directionToward(cur.position, cell);
      const res = tryEnterCell(world, properties, cur, cell, pushDir);
      if (!res.moved) continue;

      any = true;
      for (const m of res.movers) {
        alreadyMoved.add(m.id as unknown as number);
      }
      movers.push(...res.movers);
      vacated.push(...res.vacated);

      // Sticky itself left a cell — later vacancies in this batch can pull more stickies,
      // and we also recurse sticky-follow on freshly vacated cells (no swap: mover gone).
      const nested = applyStickyFollow(world, properties, res.vacated, alreadyMoved);
      if (nested.moved) {
        any = true;
        movers.push(...nested.movers);
        vacated.push(...nested.vacated);
      }
      // Only one sticky claims this vacated cell.
      break;
    }
  }

  return { moved: any, movers, vacated };
}

export function moveAllYou(
  world: World,
  properties: PropertyRegistry,
  direction: Direction,
): MoveResult {
  const yous = world.entitiesWithProperty("you");
  yous.sort((a, b) => {
    if (a.position.y !== b.position.y) return a.position.y - b.position.y;
    if (a.position.x !== b.position.x) return a.position.x - b.position.x;
    return b.layer - a.layer;
  });

  if (direction === "right" || direction === "down") {
    yous.reverse();
  }

  const allMovers: EntityRecord[] = [];
  const allVacated: Vec2[] = [];
  let any = false;
  const stickyMoved = new Set<number>();

  for (const y of yous) {
    if (!world.entities.get(y.id)?.alive) continue;
    const from = { ...y.position };
    const res = tryMove(world, properties, y, direction);
    if (res.moved) {
      any = true;
      allMovers.push(...res.movers);
      allVacated.push(...res.vacated);
      const pull = applyPullChain(world, properties, from, direction);
      allMovers.push(...pull.movers);
      allVacated.push(...pull.vacated);
      const sticky = applyStickyFollow(
        world,
        properties,
        [...res.vacated, ...pull.vacated],
        stickyMoved,
      );
      allMovers.push(...sticky.movers);
      allVacated.push(...sticky.vacated);
    }
  }
  return { moved: any, movers: allMovers, vacated: allVacated };
}

/**
 * SLIDE: keep stepping in facing until blocked.
 * Runs after player move/wait so pushed + you slides continue the same turn.
 */
export function applySlide(
  world: World,
  properties: PropertyRegistry,
): MoveResult {
  const maxSteps = Math.max(1, world.width * world.height);
  const allMovers: EntityRecord[] = [];
  const allVacated: Vec2[] = [];
  let any = false;
  const stickyMoved = new Set<number>();

  for (let step = 0; step < maxSteps; step++) {
    const sliders = world
      .entitiesWithProperty("slide")
      .filter((e) => e.alive)
      .sort((a, b) => {
        if (a.position.y !== b.position.y) return a.position.y - b.position.y;
        if (a.position.x !== b.position.x) return a.position.x - b.position.x;
        return (a.id as unknown as number) - (b.id as unknown as number);
      });

    let stepped = false;
    for (const e of sliders) {
      const cur = world.entities.get(e.id);
      if (!cur?.alive) continue;
      if (!world.hasProperty(cur, "slide")) continue;
      const res = tryMove(world, properties, cur, cur.facing);
      if (res.moved) {
        stepped = true;
        any = true;
        allMovers.push(...res.movers);
        allVacated.push(...res.vacated);
        const sticky = applyStickyFollow(world, properties, res.vacated, stickyMoved);
        allMovers.push(...sticky.movers);
        allVacated.push(...sticky.vacated);
      }
    }
    if (!stepped) break;
  }

  return { moved: any, movers: allMovers, vacated: allVacated };
}

export function stepToward(pos: Vec2, direction: Direction): Vec2 {
  return addVec(pos, DIRECTION_DELTA[direction]);
}
