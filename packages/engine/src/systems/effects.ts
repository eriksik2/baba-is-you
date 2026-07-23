import type { World } from "../world/world";
import type { PropertyRegistry } from "../properties";

/**
 * Apply noun→noun transforms (BABA IS ROCK).
 * Returns whether any entity changed (triggers rule reparse).
 */
export function applyTransforms(world: World): boolean {
  const transforms = world.rules.transformsByNoun;
  if (transforms.size === 0) return false;

  let changed = false;
  for (const e of [...world.entities.values()]) {
    if (!e.alive || e.kind !== "object") continue;
    // X IS X is a no-op (and in real Baba often means "survive transform").
    const target = transforms.get(e.noun);
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
    const props = world.rules.propertiesByNoun.get(world.effectiveNoun(e));
    if (!props) continue;
    for (const p of props) {
      properties.get(p)?.onResolve?.(e, ctx);
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
