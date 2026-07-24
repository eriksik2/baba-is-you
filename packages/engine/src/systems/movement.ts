/**
 * Movement resolution.
 *
 * YOU units attempt to step; PUSH chains recurse;
 * STOP / PULL-without-PUSH block entry;
 * after a successful YOU step, PULL objects behind the mover follow;
 * STICKY neighbors (8-way) snake-follow into vacated cells (never swap);
 * SLIDE advances one tile per turn in facing.
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

/** Vacancy left by something traveling `dir` — sticky snake seed. */
export type StickyVacancy = { cell: Vec2; dir: Direction };

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

function entityNumId(e: EntityRecord): number {
  return e.id as unknown as number;
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
  if (visiting.has(entityNumId(entity))) {
    return { moved: false, movers: [], vacated: [] };
  }
  visiting.add(entityNumId(entity));

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

/** Rank sticky neighbors so the segment trailing the mover claims first (snake). */
function rankStickyCandidates(
  cell: Vec2,
  moveDir: Direction,
  candidates: EntityRecord[],
): EntityRecord[] {
  const behind = DIRECTION_DELTA[OPPOSITE_DIRECTION[moveDir]];
  return [...candidates].sort((a, b) => {
    const oa = { x: a.position.x - cell.x, y: a.position.y - cell.y };
    const ob = { x: b.position.x - cell.x, y: b.position.y - cell.y };
    const sa = oa.x * behind.x + oa.y * behind.y;
    const sb = ob.x * behind.x + ob.y * behind.y;
    if (sb !== sa) return sb - sa;
    const ca = Math.abs(oa.x) + Math.abs(oa.y);
    const cb = Math.abs(ob.x) + Math.abs(ob.y);
    if (ca !== cb) return ca - cb;
    if (a.position.y !== b.position.y) return a.position.y - b.position.y;
    if (a.position.x !== b.position.x) return a.position.x - b.position.x;
    return entityNumId(a) - entityNumId(b);
  });
}

/**
 * STICKY snake-follow: each vacated cell is claimed by at most one sticky neighbor
 * (prefer the one trailing the mover). That sticky's old cell is enqueued so chains
 * follow like a snake. Never swaps — only enters already-vacated cells.
 *
 * Facing is set to the step direction so SLIDE continues that way next.
 */
export function applyStickyFollow(
  world: World,
  properties: PropertyRegistry,
  seeds: readonly StickyVacancy[],
  alreadyMoved: Set<number> = new Set(),
): MoveResult {
  const movers: EntityRecord[] = [];
  const vacated: Vec2[] = [];
  let any = false;

  const queue: StickyVacancy[] = seeds.map((s) => ({
    cell: { x: s.cell.x, y: s.cell.y },
    dir: s.dir,
  }));

  while (queue.length > 0) {
    const { cell, dir } = queue.shift()!;
    if (!world.grid.inBounds(cell)) continue;

    const raw: EntityRecord[] = [];
    for (const off of STICKY_OFFSETS) {
      const n = { x: cell.x + off.x, y: cell.y + off.y };
      if (!world.grid.inBounds(n)) continue;
      for (const e of world.grid.entitiesAt(n, world.entities)) {
        if (!e.alive) continue;
        if (!world.hasProperty(e, "sticky")) continue;
        if (alreadyMoved.has(entityNumId(e))) continue;
        raw.push(e);
      }
    }

    const candidates = rankStickyCandidates(cell, dir, raw);

    for (const sticky of candidates) {
      if (alreadyMoved.has(entityNumId(sticky))) continue;
      const cur = world.entities.get(sticky.id);
      if (!cur?.alive || !world.hasProperty(cur, "sticky")) continue;

      const stepDir = directionToward(cur.position, cell);
      const res = tryEnterCell(world, properties, cur, cell, stepDir);
      if (!res.moved) continue;

      any = true;
      for (const m of res.movers) {
        alreadyMoved.add(entityNumId(m));
      }
      movers.push(...res.movers);
      vacated.push(...res.vacated);

      // Snake tail: the sticky's vacated cell (last in res.vacated is its own `from`).
      const ownFrom = res.vacated[res.vacated.length - 1];
      if (ownFrom) {
        queue.push({ cell: { ...ownFrom }, dir: stepDir });
      }
      // One sticky claims this vacancy.
      break;
    }
  }

  return { moved: any, movers, vacated };
}

/** Build sticky seeds: each cell was left by something traveling `dir`. */
export function stickySeedsFrom(
  cells: readonly Vec2[],
  dir: Direction,
): StickyVacancy[] {
  return cells.map((cell) => ({ cell: { x: cell.x, y: cell.y }, dir }));
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
      for (const m of [...res.movers, ...pull.movers]) {
        stickyMoved.add(entityNumId(m));
      }
      const sticky = applyStickyFollow(
        world,
        properties,
        stickySeedsFrom([...res.vacated, ...pull.vacated], direction),
        stickyMoved,
      );
      allMovers.push(...sticky.movers);
      allVacated.push(...sticky.vacated);
    }
  }
  return { moved: any, movers: allMovers, vacated: allVacated };
}

/**
 * SLIDE: each slide object steps one tile in its facing (per turn).
 * Sticky followers from moveYou already face their follow direction, so they
 * coast one tile here. Mid-phase sticky follows only set facing for later turns.
 */
export function applySlide(
  world: World,
  properties: PropertyRegistry,
): MoveResult {
  const allMovers: EntityRecord[] = [];
  const allVacated: Vec2[] = [];
  let any = false;
  const stickyMoved = new Set<number>();

  const planned = world
    .entitiesWithProperty("slide")
    .filter((e) => e.alive)
    .sort((a, b) => {
      if (a.position.y !== b.position.y) return a.position.y - b.position.y;
      if (a.position.x !== b.position.x) return a.position.x - b.position.x;
      return entityNumId(a) - entityNumId(b);
    })
    .map((e) => e.id);

  for (const id of planned) {
    const cur = world.entities.get(id);
    if (!cur?.alive) continue;
    if (!world.hasProperty(cur, "slide")) continue;
    const facing = cur.facing;
    const res = tryMove(world, properties, cur, facing);
    if (!res.moved) continue;

    any = true;
    allMovers.push(...res.movers);
    allVacated.push(...res.vacated);
    for (const m of res.movers) stickyMoved.add(entityNumId(m));

    const sticky = applyStickyFollow(
      world,
      properties,
      stickySeedsFrom(res.vacated, facing),
      stickyMoved,
    );
    allMovers.push(...sticky.movers);
    allVacated.push(...sticky.vacated);
  }

  return { moved: any, movers: allMovers, vacated: allVacated };
}

export function stepToward(pos: Vec2, direction: Direction): Vec2 {
  return addVec(pos, DIRECTION_DELTA[direction]);
}
