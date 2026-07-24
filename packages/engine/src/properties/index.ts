/**
 * Property behavior plugins.
 *
 * Each property can declare hooks into the turn pipeline.
 * New mechanics should land here as handlers rather than hard-coding
 * branches into movement.
 */

import type { EntityRecord } from "../entity/store";
import type { Direction, PropertyId } from "../types";
import { asPropertyId } from "../types";
import type { World } from "../world/world";
import { destroyWithEffects } from "../systems/destroy";

export interface PropertyContext {
  world: World;
  direction: Direction;
}

export interface PropertyHandler {
  readonly id: PropertyId;
  /** Experimental / sandbox-only property. */
  readonly dev?: boolean;
  /**
   * Called when something tries to enter this entity's cell.
   * Return false to block the mover (and any recursive push chain).
   */
  onBeforeEnter?(
    mover: EntityRecord,
    target: EntityRecord,
    ctx: PropertyContext,
  ): boolean;
  /** After a mover successfully lands on / into this entity's cell. */
  onAfterEnter?(mover: EntityRecord, target: EntityRecord, ctx: PropertyContext): void;
  /** End-of-turn / same-cell interactions (YOU+WIN, …). */
  onResolve?(entity: EntityRecord, ctx: Omit<PropertyContext, "direction">): void;
}

export class PropertyRegistry {
  private readonly handlers = new Map<PropertyId, PropertyHandler>();

  register(handler: PropertyHandler): this {
    this.handlers.set(handler.id, handler);
    return this;
  }

  get(id: PropertyId | string): PropertyHandler | undefined {
    return this.handlers.get(typeof id === "string" ? asPropertyId(id) : id);
  }

  all(): PropertyHandler[] {
    return [...this.handlers.values()];
  }
}

export function createDefaultProperties(): PropertyRegistry {
  const reg = new PropertyRegistry();

  reg.register({
    id: asPropertyId("stop"),
    onBeforeEnter: () => false,
  });

  reg.register({
    id: asPropertyId("push"),
  });

  reg.register({
    id: asPropertyId("pull"),
  });

  reg.register({ id: asPropertyId("you") });
  reg.register({ id: asPropertyId("slide") });
  reg.register({ id: asPropertyId("sticky") });
  reg.register({ id: asPropertyId("win") });
  reg.register({ id: asPropertyId("boom") });
  reg.register({ id: asPropertyId("danger") });

  reg.register({
    id: asPropertyId("fragile"),
    onAfterEnter: (_mover, target, ctx) => {
      // Another object moved onto this fragile tile.
      if (target.alive) destroyWithEffects(ctx.world, target.id);
    },
  });

  // Dev-tagged sandbox verbs (behavior in systems/dev-behaviors.ts)
  reg.register({ id: asPropertyId("gas"), dev: true });
  reg.register({ id: asPropertyId("dynamic"), dev: true });
  reg.register({ id: asPropertyId("life"), dev: true });
  reg.register({ id: asPropertyId("flux"), dev: true });
  reg.register({ id: asPropertyId("confused"), dev: true });

  return reg;
}
