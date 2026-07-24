import type { World } from "../world/world";
import type { PropertyRegistry } from "../properties";
import { asOperatorId } from "../types";

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
 * Properties that fire a global trigger when a *conditional* rule grants them
 * (e.g. FRUIT ON DOOR IS WIN → win as soon as fruit sits on door).
 * Unconditional / status properties like PUSH still only apply via hasProperty.
 */
const CONDITIONAL_TRIGGERS = new Set(["win"]);

/**
 * End-of-turn / end-of-step status: property hooks, conditional triggers,
 * YOU+WIN, exit portals, lose if nothing is YOU.
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
    // Conditional trigger properties: condition satisfied ⇒ fire (no YOU overlap needed).
    outer: for (const e of [...world.entities.values()]) {
      if (!e.alive) continue;
      const area = world.areaAt(e.position);
      for (const f of world.featuresForAreaPublic(area)) {
        if (f.subject.negated) continue;
        if (f.verb !== asOperatorId("is")) continue;
        if (f.target.kind !== "property" || f.target.negated) continue;
        if (f.conditions.length === 0) continue;
        const prop = String(f.target.property);
        if (!CONDITIONAL_TRIGGERS.has(prop)) continue;
        if (!world.nounsForEntity(e).includes(f.subject.noun)) continue;
        if (!world.conditionsMetPublic(e, f)) continue;
        if (prop === "win") {
          world.status = "won";
          break outer;
        }
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

  void properties;
}
