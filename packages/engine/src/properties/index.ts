/**
 * Property behavior plugins.
 *
 * Each property can declare hooks into the turn pipeline.
 * New mechanics (OPEN/SHUT, TELE, …) should land here as handlers
 * rather than hard-coding branches into movement.
 */

import type { EntityRecord } from "../entity/store";
import type { Direction, PropertyId } from "../types";
import { asPropertyId } from "../types";
import type { World } from "../world/world";

export interface PropertyContext {
  world: World;
  direction: Direction;
}

export interface PropertyHandler {
  readonly id: PropertyId;
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
  /** End-of-turn / same-cell interactions (HOT/MELT, YOU+WIN on same tile, …). */
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
    // Movement system handles push recursively.
  });

  reg.register({
    id: asPropertyId("pull"),
    // Movement: blocks entry unless also PUSH; applyPullChain follows movers.
  });

  reg.register({ id: asPropertyId("you") });

  return reg;
}
