import type { World } from "../world/world";
import type { PropertyRegistry } from "../properties";

/**
 * Apply noun→noun transforms (BABA IS ROCK).
 * Returns whether any entity changed (triggers rule reparse).
 */
export function applyTransforms(world: World): boolean {
  let changed = false;
  for (const e of [...world.entities.values()]) {
    if (!e.alive || e.kind !== "object") continue;
    const area = world.areaAt(e.position);
    const target = world.transformTarget(e.noun, area);
    // X IS X is a no-op (and in real Baba often means "survive transform").
    if (!target || target === e.noun) continue;
    e.noun = target;
    changed = true;
  }
  return changed;
}

/**
 * Run end-of-turn property resolution (win/defeat/hot/melt on same cell, YOU IS WIN, …).
 */
export function resolveOverlaps(world: World, properties: PropertyRegistry): void {
  const ctx = { world };
  for (const e of [...world.entities.values()]) {
    if (!e.alive) continue;
    // Fire resolve for any property the entity currently has (global ∪ area).
    for (const handler of properties.all()) {
      if (world.hasProperty(e, handler.id)) {
        handler.onResolve?.(e, ctx);
      }
    }
  }

  // Lose if nothing is YOU.
  if (world.status === "playing") {
    const yous = world.entitiesWithProperty("you");
    if (yous.length === 0) {
      world.status = "lost";
    }
  }
}
