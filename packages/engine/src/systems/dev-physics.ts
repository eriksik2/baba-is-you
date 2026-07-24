/**
 * DYNAMIC physics integration (grid-free bodies with velocity / inertia).
 */

import type { EntityRecord } from "../entity/store";
import type { Vec2 } from "../types";
import type { World, PhysicsBody } from "../world/world";

const PHYS_DAMPING = 0.92;
const PHYS_MAX_SPEED = 2.2;
const PHYS_RADIUS = 0.42;
const PHYS_SUBSTEPS = 2;

function isStopCell(world: World, cell: Vec2): boolean {
  if (!world.grid.inBounds(cell)) return true;
  for (const o of world.grid.entitiesAt(cell, world.entities)) {
    if (!o.alive) continue;
    if (world.hasProperty(o, "dynamic")) continue;
    if (world.hasProperty(o, "stop") && !world.hasProperty(o, "push")) return true;
  }
  return false;
}

/** Ensure dynamic entities have physics bodies; drop bodies when property lost. */
export function syncPhysicsBodies(world: World): void {
  const live = new Set<number>();
  for (const e of world.entitiesWithProperty("dynamic")) {
    if (!e.alive || e.kind !== "object") continue;
    const id = e.id as unknown as number;
    live.add(id);
    if (!world.physicsBodies.has(e.id)) {
      world.physicsBodies.set(e.id, {
        x: e.position.x + 0.5,
        y: e.position.y + 0.5,
        vx: 0,
        vy: 0,
      });
    }
  }
  for (const id of [...world.physicsBodies.keys()]) {
    if (!live.has(id as unknown as number)) world.physicsBodies.delete(id);
  }
}

function snapBodyToGrid(world: World, e: EntityRecord, body: PhysicsBody): void {
  const gx = Math.max(0, Math.min(world.width - 1, Math.floor(body.x)));
  const gy = Math.max(0, Math.min(world.height - 1, Math.floor(body.y)));
  if (e.position.x !== gx || e.position.y !== gy) {
    world.moveEntity(e.id, { x: gx, y: gy });
  }
}

function resolveWallCollision(world: World, body: PhysicsBody): void {
  for (let iter = 0; iter < 4; iter++) {
    const cell = { x: Math.floor(body.x), y: Math.floor(body.y) };
    if (!isStopCell(world, cell)) break;
    body.x -= body.vx * 0.5;
    body.y -= body.vy * 0.5;
    body.vx *= -0.6;
    body.vy *= -0.6;
  }
  body.x = Math.max(PHYS_RADIUS, Math.min(world.width - PHYS_RADIUS, body.x));
  body.y = Math.max(PHYS_RADIUS, Math.min(world.height - PHYS_RADIUS, body.y));

  const probes: Array<{ dx: number; dy: number; nx: number; ny: number }> = [
    { dx: PHYS_RADIUS, dy: 0, nx: -1, ny: 0 },
    { dx: -PHYS_RADIUS, dy: 0, nx: 1, ny: 0 },
    { dx: 0, dy: PHYS_RADIUS, nx: 0, ny: -1 },
    { dx: 0, dy: -PHYS_RADIUS, nx: 0, ny: 1 },
  ];
  for (const p of probes) {
    const cell = { x: Math.floor(body.x + p.dx), y: Math.floor(body.y + p.dy) };
    if (!isStopCell(world, cell)) continue;
    if (p.nx) {
      body.x = p.nx < 0 ? cell.x - PHYS_RADIUS : cell.x + 1 + PHYS_RADIUS;
      if (body.vx * p.nx < 0) body.vx *= -0.55;
    }
    if (p.ny) {
      body.y = p.ny < 0 ? cell.y - PHYS_RADIUS : cell.y + 1 + PHYS_RADIUS;
      if (body.vy * p.ny < 0) body.vy *= -0.55;
    }
  }
}

function resolveBodyCollisions(world: World): void {
  const entries: Array<{ e: EntityRecord; b: PhysicsBody }> = [];
  for (const e of world.entitiesWithProperty("dynamic")) {
    if (!e.alive) continue;
    const b = world.physicsBodies.get(e.id);
    if (b) entries.push({ e, b });
  }
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i]!;
      const c = entries[j]!;
      const dx = c.b.x - a.b.x;
      const dy = c.b.y - a.b.y;
      const dist = Math.hypot(dx, dy) || 0.0001;
      const min = PHYS_RADIUS * 2;
      if (dist >= min) continue;
      const nx = dx / dist;
      const ny = dy / dist;
      const overlap = min - dist;
      a.b.x -= nx * overlap * 0.5;
      a.b.y -= ny * overlap * 0.5;
      c.b.x += nx * overlap * 0.5;
      c.b.y += ny * overlap * 0.5;
      const va = a.b.vx * nx + a.b.vy * ny;
      const vc = c.b.vx * nx + c.b.vy * ny;
      const impulse = vc - va;
      a.b.vx += impulse * nx;
      a.b.vy += impulse * ny;
      c.b.vx -= impulse * nx;
      c.b.vy -= impulse * ny;
    }
  }
}

/** DYNAMIC: integrate 2D physics (inertia, damping, wall bounce, body forces). */
export function applyDynamic(world: World): boolean {
  syncPhysicsBodies(world);
  if (world.physicsBodies.size === 0) return false;

  let moved = false;
  for (let step = 0; step < PHYS_SUBSTEPS; step++) {
    for (const e of world.entitiesWithProperty("dynamic")) {
      if (!e.alive) continue;
      const body = world.physicsBodies.get(e.id);
      if (!body) continue;
      body.vx *= PHYS_DAMPING;
      body.vy *= PHYS_DAMPING;
      if (Math.abs(body.vx) < 0.001) body.vx = 0;
      if (Math.abs(body.vy) < 0.001) body.vy = 0;
      const sp = Math.hypot(body.vx, body.vy);
      if (sp > PHYS_MAX_SPEED) {
        body.vx = (body.vx / sp) * PHYS_MAX_SPEED;
        body.vy = (body.vy / sp) * PHYS_MAX_SPEED;
      }
      const ox = body.x;
      const oy = body.y;
      body.x += body.vx / PHYS_SUBSTEPS;
      body.y += body.vy / PHYS_SUBSTEPS;
      resolveWallCollision(world, body);
      if (body.x !== ox || body.y !== oy) moved = true;
    }
    resolveBodyCollisions(world);
  }

  for (const e of world.entitiesWithProperty("dynamic")) {
    if (!e.alive) continue;
    const body = world.physicsBodies.get(e.id);
    if (!body) continue;
    const before = { ...e.position };
    snapBodyToGrid(world, e, body);
    if (before.x !== e.position.x || before.y !== e.position.y) moved = true;
  }
  return moved;
}
