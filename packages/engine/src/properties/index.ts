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
    // Movement system handles push recursively; this marks pushability.
    // onBeforeEnter is not used for push — see tryMove.
  });

  reg.register({
    id: asPropertyId("win"),
    onAfterEnter: (mover, _target, ctx) => {
      if (ctx.world.hasProperty(mover, "you")) {
        ctx.world.status = "won";
      }
    },
    onResolve: (entity, ctx) => {
      if (!ctx.world.hasProperty(entity, "you")) return;
      const here = ctx.world.grid.entitiesAt(entity.position, ctx.world.entities);
      if (here.some((o) => o.id !== entity.id && ctx.world.hasProperty(o, "win"))) {
        ctx.world.status = "won";
      }
      // YOU IS WIN
      if (ctx.world.hasProperty(entity, "win")) {
        ctx.world.status = "won";
      }
    },
  });

  reg.register({
    id: asPropertyId("defeat"),
    onAfterEnter: (mover, _target, ctx) => {
      if (ctx.world.hasProperty(mover, "you")) {
        ctx.world.destroyEntity(mover.id);
      }
    },
    onResolve: (entity, ctx) => {
      const here = ctx.world.grid.entitiesAt(entity.position, ctx.world.entities);
      if (ctx.world.hasProperty(entity, "defeat")) {
        for (const o of here) {
          if (o.id !== entity.id && ctx.world.hasProperty(o, "you")) {
            ctx.world.destroyEntity(o.id);
          }
        }
      }
    },
  });

  reg.register({
    id: asPropertyId("sink"),
    onAfterEnter: (mover, target, ctx) => {
      ctx.world.destroyEntity(mover.id);
      ctx.world.destroyEntity(target.id);
    },
  });

  reg.register({
    id: asPropertyId("hot"),
    onResolve: (entity, ctx) => {
      if (!ctx.world.hasProperty(entity, "hot")) return;
      const here = ctx.world.grid.entitiesAt(entity.position, ctx.world.entities);
      for (const o of here) {
        if (o.id !== entity.id && ctx.world.hasProperty(o, "melt")) {
          ctx.world.destroyEntity(o.id);
        }
      }
    },
  });

  reg.register({
    id: asPropertyId("melt"),
  });

  reg.register({ id: asPropertyId("you") });
  reg.register({ id: asPropertyId("move") });
  reg.register({ id: asPropertyId("open") });
  reg.register({ id: asPropertyId("shut") });
  reg.register({ id: asPropertyId("float") });

  return reg;
}
