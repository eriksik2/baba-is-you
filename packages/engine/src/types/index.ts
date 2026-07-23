/**
 * Foundational branded types and shared primitives.
 * Branding prevents accidental mixing of IDs at compile time.
 */

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

/** Opaque entity handle. Never reuse within a session without recycling via EntityStore. */
export type EntityId = Brand<number, "EntityId">;

/** Stable string id for a noun kind (e.g. "baba", "wall", "flag"). */
export type NounId = Brand<string, "NounId">;

/** Stable string id for a property (e.g. "you", "push", "stop"). */
export type PropertyId = Brand<string, "PropertyId">;

/** Stable string id for a verb/operator (e.g. "is", "has", "and"). */
export type OperatorId = Brand<string, "OperatorId">;

/** Stable string id for any lexicon entry. */
export type WordId = Brand<string, "WordId">;

export type Direction = "up" | "down" | "left" | "right";

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export function vec2(x: number, y: number): Vec2 {
  return { x, y };
}

export function addVec(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function eqVec(a: Vec2, b: Vec2): boolean {
  return a.x === b.x && a.y === b.y;
}

export const DIRECTION_DELTA: Record<Direction, Vec2> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export function asEntityId(n: number): EntityId {
  return n as EntityId;
}

export function asNounId(s: string): NounId {
  return s as NounId;
}

export function asPropertyId(s: string): PropertyId {
  return s as PropertyId;
}

export function asOperatorId(s: string): OperatorId {
  return s as OperatorId;
}

export function asWordId(s: string): WordId {
  return s as WordId;
}

export type GameStatus = "playing" | "won" | "lost";

export type Axis = "horizontal" | "vertical";
