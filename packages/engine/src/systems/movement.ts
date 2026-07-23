/**
 * Movement resolution.
 *
 * YOU/MOVE units attempt to step; PUSH chains recurse;
 * STOP (and failed pushes) block the entire chain atomically.
 */

import type { EntityRecord } from "../entity/store";
import type { PropertyRegistry } from "../properties";
import type { Direction, Vec2 } from "../types";
import { DIRECTION_DELTA, addVec } from "../types";
import type { World } from "../world/world";

export interface MoveResult {
  moved: boolean;
  /** Entities that changed cells this attempt (for effects). */
  movers: EntityRecord[];
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

  // First: anything that hard-blocks without being pushable.
  for (const occ of occupants) {
    if (world.hasProperty(occ, "stop") && !world.hasProperty(occ, "push")) {
      const handler = properties.get("stop");
      if (handler?.onBeforeEnter && !handler.onBeforeEnter(entity, occ, ctx)) {
        return { moved: false, movers: [] };
      }
      // default stop
      return { moved: false, movers: [] };
    }
  }

  // Pushables must all successfully move first (atomic chain).
  const pushables = occupants.filter((o) => world.hasProperty(o, "push"));
  const pushed: EntityRecord[] = [];

  for (const p of pushables) {
    const res = tryMove(world, properties, p, direction, visiting);
    if (!res.moved) {
      return { moved: false, movers: [] };
    }
    pushed.push(...res.movers);
  }

  // Enter hooks for remaining occupants (property-plugin based).
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

  // Commit move.
  world.moveEntity(entity.id, dest);
  const movers = [...pushed, entity];

  // After-enter hooks on co-occupants.
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

export function moveAllYou(
  world: World,
  properties: PropertyRegistry,
  direction: Direction,
): MoveResult {
  const yous = world.entitiesWithProperty("you");
  // Sort for determinism: top-to-bottom, left-to-right, higher layer first.
  yous.sort((a, b) => {
    if (a.position.y !== b.position.y) return a.position.y - b.position.y;
    if (a.position.x !== b.position.x) return a.position.x - b.position.x;
    return b.layer - a.layer;
  });

  // When moving right/down, process far side first so chains don't collide with themselves.
  if (direction === "right" || direction === "down") {
    yous.reverse();
  }

  const allMovers: EntityRecord[] = [];
  let any = false;
  for (const y of yous) {
    // Skip if already destroyed mid-turn.
    if (!world.entities.get(y.id)?.alive) continue;
    const res = tryMove(world, properties, y, direction);
    if (res.moved) {
      any = true;
      allMovers.push(...res.movers);
    }
  }
  return { moved: any, movers: allMovers };
}

export function stepToward(pos: Vec2, direction: Direction): Vec2 {
  return addVec(pos, DIRECTION_DELTA[direction]);
}
