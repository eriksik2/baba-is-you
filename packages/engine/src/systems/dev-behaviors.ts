/**
 * Dev-tagged property behaviors: GAS, LIFE, FLUX.
 * DYNAMIC / CONFUSED helpers live in sibling modules to avoid import cycles.
 */

import type { PropertyRegistry } from "../properties";
import type { Direction, NounId, Vec2 } from "../types";
import { asNounId } from "../types";
import type { World, FluxLatent } from "../world/world";
import { tryMove } from "./movement";
import { confusedDirection } from "./dev-controls";

const CARDINALS: Direction[] = ["up", "down", "left", "right"];

/** ~1.2% per step ≈ once every ~8–10s at 120ms tick. */
const FLUX_CHANCE = 0.012;

function randomDir(): Direction {
  return CARDINALS[(Math.random() * 4) | 0]!;
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

function isStopCell(world: World, cell: Vec2): boolean {
  if (!world.grid.inBounds(cell)) return true;
  for (const o of world.grid.entitiesAt(cell, world.entities)) {
    if (!o.alive) continue;
    if (world.hasProperty(o, "dynamic")) continue;
    if (world.hasProperty(o, "stop") && !world.hasProperty(o, "push")) return true;
  }
  return false;
}

/**
 * GAS: random-walk one step (CONFUSED reverses the chosen dir).
 */
export function applyGas(world: World, properties: PropertyRegistry): boolean {
  let changed = false;
  const gases = world
    .entitiesWithProperty("gas")
    .filter((e) => e.alive && e.kind === "object" && !world.hasProperty(e, "you"));
  for (let i = gases.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const tmp = gases[i]!;
    gases[i] = gases[j]!;
    gases[j] = tmp;
  }
  for (const e of gases) {
    if (!e.alive) continue;
    let dir = randomDir();
    dir = confusedDirection(world, e, dir);
    const res = tryMove(world, properties, e, dir);
    if (res.moved || res.changed) changed = true;
  }
  return changed;
}

/**
 * LIFE: Conway's Game of Life for each noun that has LIFE objects.
 */
export function applyLife(world: World): boolean {
  const lifeEntities = world
    .entitiesWithProperty("life")
    .filter((e) => e.alive && e.kind === "object");
  if (lifeEntities.length === 0) return false;

  const byNoun = new Map<NounId, typeof lifeEntities>();
  for (const e of lifeEntities) {
    const list = byNoun.get(e.noun) ?? [];
    list.push(e);
    byNoun.set(e.noun, list);
  }

  let changed = false;
  for (const [noun, ents] of byNoun) {
    const live = new Set<string>();
    for (const e of ents) live.add(cellKey(e.position.x, e.position.y));

    const candidates = new Set<string>();
    for (const key of live) {
      const [xs, ys] = key.split(",");
      const x = Number(xs);
      const y = Number(ys);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          candidates.add(cellKey(x + dx, y + dy));
        }
      }
    }

    const births: Vec2[] = [];
    const deaths: string[] = [];
    for (const key of candidates) {
      const [xs, ys] = key.split(",");
      const x = Number(xs);
      const y = Number(ys);
      if (!world.grid.inBounds({ x, y })) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (live.has(cellKey(x + dx, y + dy))) n++;
        }
      }
      const alive = live.has(key);
      if (alive && n !== 2 && n !== 3) deaths.push(key);
      if (!alive && n === 3) births.push({ x, y });
    }

    for (const key of deaths) {
      const [xs, ys] = key.split(",");
      const cell = { x: Number(xs), y: Number(ys) };
      for (const e of [...world.grid.entitiesAt(cell, world.entities)]) {
        if (!e.alive || e.kind !== "object") continue;
        if (e.noun !== noun) continue;
        if (!world.hasProperty(e, "life")) continue;
        world.destroyEntity(e.id);
        changed = true;
      }
    }
    for (const cell of births) {
      if (isStopCell(world, cell)) continue;
      const already = world.grid
        .entitiesAt(cell, world.entities)
        .some((o) => o.alive && o.kind === "object" && o.noun === noun);
      if (already) continue;
      world.spawnObject(noun, cell);
      changed = true;
    }
  }
  return changed;
}

/**
 * FLUX: small chance to vanish (stashed) or reappear.
 */
export function applyFlux(world: World): boolean {
  let changed = false;

  for (const e of [...world.entitiesWithProperty("flux")]) {
    if (!e.alive || e.kind !== "object") continue;
    if (world.hasProperty(e, "you")) continue;
    if (Math.random() >= FLUX_CHANCE) continue;
    const latent: FluxLatent = {
      noun: e.noun,
      x: e.position.x,
      y: e.position.y,
    };
    world.fluxLatent.push(latent);
    world.destroyEntity(e.id);
    changed = true;
  }

  const keep: FluxLatent[] = [];
  for (const lat of world.fluxLatent) {
    if (Math.random() >= FLUX_CHANCE) {
      keep.push(lat);
      continue;
    }
    const cell = { x: lat.x, y: lat.y };
    if (!world.grid.inBounds(cell) || isStopCell(world, cell)) {
      const spot = randomEmptyCell(world);
      if (!spot) {
        keep.push(lat);
        continue;
      }
      world.spawnObject(lat.noun, spot);
    } else {
      world.spawnObject(lat.noun, cell);
    }
    changed = true;
  }
  world.fluxLatent = keep;

  if (Math.random() < FLUX_CHANCE * 0.5) {
    const fluxNouns = new Set<NounId>();
    for (const e of world.entities.values()) {
      if (e.alive && e.kind === "object" && world.hasProperty(e, "flux")) {
        fluxNouns.add(e.noun);
      }
    }
    for (const lat of world.fluxLatent) fluxNouns.add(lat.noun);
    if (fluxNouns.size > 0) {
      const nouns = [...fluxNouns];
      const noun = nouns[(Math.random() * nouns.length) | 0]!;
      const spot = randomEmptyCell(world);
      if (spot) {
        world.spawnObject(asNounId(String(noun)), spot);
        changed = true;
      }
    }
  }

  return changed;
}

function randomEmptyCell(world: World): Vec2 | null {
  for (let attempt = 0; attempt < 40; attempt++) {
    const x = (Math.random() * world.width) | 0;
    const y = (Math.random() * world.height) | 0;
    const cell = { x, y };
    if (isStopCell(world, cell)) continue;
    const objs = world.grid
      .entitiesAt(cell, world.entities)
      .filter((o) => o.alive && o.kind === "object");
    if (objs.length === 0) return cell;
  }
  return null;
}

export { applyDynamic, syncPhysicsBodies } from "./dev-physics";
export {
  applyDynamicImpulse,
  accelerateDynamicYou,
  confusedDirection,
  reverseDirection,
} from "./dev-controls";
