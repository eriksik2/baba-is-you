/**
 * CONFUSED helpers + DYNAMIC impulse/accel (no movement imports — avoids cycles).
 */

import type { EntityRecord } from "../entity/store";
import type { Direction } from "../types";
import { DIRECTION_DELTA, OPPOSITE_DIRECTION } from "../types";
import type { World } from "../world/world";
import { syncPhysicsBodies } from "./dev-physics";

export function reverseDirection(dir: Direction): Direction {
  return OPPOSITE_DIRECTION[dir];
}

export function confusedDirection(
  world: World,
  entity: EntityRecord,
  dir: Direction,
): Direction {
  return world.hasProperty(entity, "confused") ? reverseDirection(dir) : dir;
}

const PHYS_PUSH_IMPULSE = 0.55;
const PHYS_ACCEL = 0.35;
const PHYS_MAX_SPEED = 2.2;

/** Apply an impulse to a dynamic body (from a grid move / bump). */
export function applyDynamicImpulse(
  world: World,
  target: EntityRecord,
  dir: Direction,
  strength = PHYS_PUSH_IMPULSE,
): boolean {
  if (!world.hasProperty(target, "dynamic")) return false;
  syncPhysicsBodies(world);
  const body = world.physicsBodies.get(target.id);
  if (!body) return false;
  const d = DIRECTION_DELTA[dir];
  body.vx += d.x * strength;
  body.vy += d.y * strength;
  const sp = Math.hypot(body.vx, body.vy);
  if (sp > PHYS_MAX_SPEED) {
    body.vx = (body.vx / sp) * PHYS_MAX_SPEED;
    body.vy = (body.vy / sp) * PHYS_MAX_SPEED;
  }
  return true;
}

/** Accelerate dynamic YOU in a direction (player intent). */
export function accelerateDynamicYou(world: World, dir: Direction): boolean {
  let any = false;
  for (const e of world.entitiesWithProperty("you")) {
    if (!e.alive || !world.hasProperty(e, "dynamic")) continue;
    syncPhysicsBodies(world);
    const body = world.physicsBodies.get(e.id);
    if (!body) continue;
    const use = confusedDirection(world, e, dir);
    const d = DIRECTION_DELTA[use];
    body.vx += d.x * PHYS_ACCEL;
    body.vy += d.y * PHYS_ACCEL;
    e.facing = use;
    any = true;
  }
  return any;
}
