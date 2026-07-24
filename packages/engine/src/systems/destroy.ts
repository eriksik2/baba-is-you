/**
 * Destruction + BOOM blast chains.
 */

import type { EntityId, Vec2 } from "../types";
import { addVec } from "../types";
import type { World } from "../world/world";

/** 8-neighborhood used by BOOM blast. */
const BLAST_OFFSETS: ReadonlyArray<Vec2> = [
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: -1, y: 1 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
];

/**
 * Destroy an entity; if it has BOOM, also destroy everything on the same tile
 * and all 8-neighbors (chained). Same-tile blast means walking onto / stacking
 * with boom (including YOU) is lethal.
 */
export function destroyWithEffects(
  world: World,
  id: EntityId,
  seen: Set<number> = new Set(),
): void {
  const num = id as unknown as number;
  if (seen.has(num)) return;
  const e = world.entities.get(id);
  if (!e?.alive) return;

  seen.add(num);
  const pos: Vec2 = { x: e.position.x, y: e.position.y };
  const boom = world.hasProperty(e, "boom");
  world.destroyEntity(id);
  world.physicsBodies.delete(id);

  if (!boom) return;

  // Same cell (YOU / fruit stacked on the charge, etc.)
  for (const n of [...world.grid.entitiesAt(pos, world.entities)]) {
    if (!n.alive) continue;
    destroyWithEffects(world, n.id, seen);
  }

  for (const off of BLAST_OFFSETS) {
    const cell = addVec(pos, off);
    if (!world.grid.inBounds(cell)) continue;
    for (const n of [...world.grid.entitiesAt(cell, world.entities)]) {
      if (!n.alive) continue;
      destroyWithEffects(world, n.id, seen);
    }
  }
}
