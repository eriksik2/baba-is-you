/**
 * DANGER property:
 * - Living nouns (sheep, wolf, …): step toward the nearest YOU each turn;
 *   destroy YOU entities on the same tile (touch).
 * - Inanimate nouns (rock, wall, …): destroy every other entity sharing the tile.
 */

import type { EntityRecord } from "../entity/store";
import type { PropertyRegistry } from "../properties";
import type { Direction, Vec2 } from "../types";
import { DIRECTION_DELTA, addVec } from "../types";
import type { World } from "../world/world";
import { destroyWithEffects } from "./destroy";
import { tryMove } from "./movement";

function manhattan(a: Vec2, b: Vec2): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function isLiving(world: World, e: EntityRecord): boolean {
  return world.lexicon.getNoun(e.noun)?.living === true;
}

function nearestYou(world: World, from: EntityRecord): EntityRecord | null {
  let best: EntityRecord | null = null;
  let bestDist = Infinity;
  for (const you of world.entitiesWithProperty("you")) {
    if (!you.alive) continue;
    if (you.id === from.id) continue;
    const d = manhattan(from.position, you.position);
    if (d < bestDist) {
      bestDist = d;
      best = you;
    }
  }
  return best;
}

/** Prefer the longer axis; fall back to the other cardinal if that step fails. */
function chaseDirections(from: Vec2, to: Vec2): Direction[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return [];
  const horiz: Direction | null = dx === 0 ? null : dx > 0 ? "right" : "left";
  const vert: Direction | null = dy === 0 ? null : dy > 0 ? "down" : "up";
  if (horiz && vert) {
    return Math.abs(dx) >= Math.abs(dy) ? [horiz, vert] : [vert, horiz];
  }
  if (horiz) return [horiz];
  if (vert) return [vert];
  return [];
}

function destroyYousOnTile(world: World, cell: Vec2, exceptId: EntityRecord["id"]): boolean {
  let changed = false;
  for (const o of [...world.grid.entitiesAt(cell, world.entities)]) {
    if (!o.alive || o.id === exceptId) continue;
    if (!world.hasProperty(o, "you")) continue;
    destroyWithEffects(world, o.id);
    changed = true;
  }
  return changed;
}

function destroyOthersOnTile(world: World, cell: Vec2, exceptId: EntityRecord["id"]): boolean {
  let changed = false;
  for (const o of [...world.grid.entitiesAt(cell, world.entities)]) {
    if (!o.alive || o.id === exceptId) continue;
    destroyWithEffects(world, o.id);
    changed = true;
  }
  return changed;
}

/** Inanimate DANGER: wipe other entities sharing the tile. */
export function applyInanimateDanger(world: World): boolean {
  let changed = false;
  for (const e of [...world.entitiesWithProperty("danger")]) {
    if (!e.alive || e.kind !== "object") continue;
    if (isLiving(world, e)) continue;
    if (destroyOthersOnTile(world, e.position, e.id)) changed = true;
  }
  return changed;
}

/**
 * Living DANGER chase + touch-kill. Call once per turn after slide
 * (and after inanimate DANGER so baited hunters die before they step).
 * Skips entities that are also YOU.
 */
export function applyLivingDanger(
  world: World,
  properties: PropertyRegistry,
): boolean {
  let changed = false;
  const dangers = world
    .entitiesWithProperty("danger")
    .filter((e) => e.alive && e.kind === "object" && isLiving(world, e))
    .filter((e) => !world.hasProperty(e, "you"));

  dangers.sort((a, b) => (a.id as unknown as number) - (b.id as unknown as number));

  for (const hunter of dangers) {
    if (!hunter.alive) continue;

    if (destroyYousOnTile(world, hunter.position, hunter.id)) {
      changed = true;
      continue;
    }

    const prey = nearestYou(world, hunter);
    if (!prey) continue;

    const dirs = chaseDirections(hunter.position, prey.position);
    for (const dir of dirs) {
      const dest = addVec(hunter.position, DIRECTION_DELTA[dir]);
      if (!world.grid.inBounds(dest)) continue;
      const res = tryMove(world, properties, hunter, dir);
      if (res.moved || res.changed) {
        changed = true;
        if (hunter.alive && destroyYousOnTile(world, hunter.position, hunter.id)) {
          changed = true;
        }
        break;
      }
    }
  }

  return changed;
}

/**
 * End-of-step DANGER: inanimate wipe + living touch (e.g. YOU stepped onto a wolf).
 */
export function applyDangerResolve(world: World): boolean {
  let changed = applyInanimateDanger(world);
  for (const e of [...world.entitiesWithProperty("danger")]) {
    if (!e.alive || e.kind !== "object") continue;
    if (!isLiving(world, e)) continue;
    if (world.hasProperty(e, "you")) continue;
    if (destroyYousOnTile(world, e.position, e.id)) changed = true;
  }
  return changed;
}
