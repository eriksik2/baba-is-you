/**
 * Movement resolution.
 *
 * YOU units attempt to step; PUSH chains recurse;
 * STOP / PULL-without-PUSH block entry;
 * after a successful YOU step, PULL objects behind the mover follow.
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
}

function blocksEntry(world: World, occ: EntityRecord): boolean {
  const push = world.hasProperty(occ, "push");
  if (push) return false;
  // PULL alone acts like STOP when walked into (Baba-accurate).
  return world.hasProperty(occ, "stop") || world.hasProperty(occ, "pull");
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
  if (!entity.alive) return { moved: false, movers: [] };
  if (visiting.has(entity.id)) return { moved: false, movers: [] };
  visiting.add(entity.id);

  const delta = DIRECTION_DELTA[direction];
  const dest = addVec(entity.position, delta);

  if (!world.grid.inBounds(dest)) {
    return { moved: false, movers: [] };
  }

  const occupants = world.grid.entitiesAt(dest, world.entities);
  const ctx = { world, direction };

  for (const occ of occupants) {
    if (blocksEntry(world, occ)) {
      const handler = properties.get("stop");
      if (handler?.onBeforeEnter && !handler.onBeforeEnter(entity, occ, ctx)) {
        return { moved: false, movers: [] };
      }
      return { moved: false, movers: [] };
    }
  }

  const pushables = occupants.filter((o) => world.hasProperty(o, "push"));
  const pushed: EntityRecord[] = [];

  for (const p of pushables) {
    const res = tryMove(world, properties, p, direction, visiting);
    if (!res.moved) {
      return { moved: false, movers: [] };
    }
    pushed.push(...res.movers);
  }

  const afterPushOccupants = world.grid.entitiesAt(dest, world.entities);
  for (const occ of afterPushOccupants) {
    if (occ.id === entity.id) continue;
    for (const handler of properties.all()) {
      if (!world.hasProperty(occ, handler.id)) continue;
      if (handler.onBeforeEnter && !handler.onBeforeEnter(entity, occ, ctx)) {
        return { moved: false, movers: [] };
      }
    }
  }

  world.moveEntity(entity.id, dest);
  const movers = [...pushed, entity];

  const landedWith = world.grid.entitiesAt(dest, world.entities);
  for (const occ of landedWith) {
    if (occ.id === entity.id) continue;
    for (const handler of properties.all()) {
      if (!world.hasProperty(occ, handler.id)) continue;
      handler.onAfterEnter?.(entity, occ, ctx);
    }
  }

  return { moved: true, movers };
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
): EntityRecord[] {
  const behind = addVec(vacated, DIRECTION_DELTA[OPPOSITE_DIRECTION[direction]]);
  if (!world.grid.inBounds(behind)) return [];

  const pulls = world.grid
    .entitiesAt(behind, world.entities)
    .filter((o) => o.alive && world.hasProperty(o, "pull"));

  const movers: EntityRecord[] = [];
  for (const p of pulls) {
    const res = tryMove(world, properties, p, direction, visiting);
    if (!res.moved) continue;
    movers.push(...res.movers);
    // Continue the chain from the cell the pullable just left.
    movers.push(...applyPullChain(world, properties, behind, direction, visiting));
  }
  return movers;
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
  let any = false;
  for (const y of yous) {
    if (!world.entities.get(y.id)?.alive) continue;
    const from = { ...y.position };
    const res = tryMove(world, properties, y, direction);
    if (res.moved) {
      any = true;
      allMovers.push(...res.movers);
      allMovers.push(...applyPullChain(world, properties, from, direction));
    }
  }
  return { moved: any, movers: allMovers };
}

export function stepToward(pos: Vec2, direction: Direction): Vec2 {
  return addVec(pos, DIRECTION_DELTA[direction]);
}
