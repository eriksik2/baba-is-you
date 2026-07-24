import type { World } from "../world/world";
import type { PropertyRegistry } from "../properties";

/**
 * Apply noun→noun transforms (BABA IS ROCK), including conditional features.
 * Returns whether any entity changed (triggers rule reparse).
 */
export function applyTransforms(world: World): boolean {
  let changed = false;
  for (const e of [...world.entities.values()]) {
    if (!e.alive || e.kind !== "object") continue;
    const target = world.transformTargetFor(e);
    if (!target || target === e.noun) continue;
    e.noun = target;
    changed = true;
  }
  return changed;
}

/**
 * End-of-turn status: property hooks, YOU+WIN, exit portals, lose if nothing is YOU.
 */
export function resolveOverlaps(world: World, properties: PropertyRegistry): void {
  const ctx = { world };
  for (const e of [...world.entities.values()]) {
    if (!e.alive) continue;
    for (const handler of properties.all()) {
      if (world.hasProperty(e, handler.id)) {
        handler.onResolve?.(e, ctx);
      }
    }
  }

  if (world.status === "playing") {
    const yous = world.entitiesWithProperty("you");
    for (const you of yous) {
      const here = world.grid.entitiesAt(you.position, world.entities);
      if (here.some((o) => o.alive && world.hasProperty(o, "win"))) {
        world.status = "won";
        break;
      }
      for (const portal of world.portals) {
        if (!portal.exit) continue;
        if (you.position.x === portal.x && you.position.y === portal.y) {
          world.status = "won";
          break;
        }
      }
      if (world.status === "won") break;
    }
  }

  if (world.status === "playing") {
    const yous = world.entitiesWithProperty("you");
    if (yous.length === 0) {
      world.status = "lost";
    }
  }
}
