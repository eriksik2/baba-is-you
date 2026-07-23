import type {
  AreaDef,
  GlobalRuleSpec,
  LevelDocument,
  LevelEntitySpec,
} from "./types";
import { DEFAULT_CHUNK_SIZE } from "./types";

/** Visual-only background tile keys. */
export const BG = {
  grass: "grass",
  grass2: "grass2",
  path: "path",
  water: "water",
  flower: "flower",
  dirt: "dirt",
  stone: "stone",
  bush: "bush",
} as const;

export type BgTile = (typeof BG)[keyof typeof BG];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Fill a width×height background array with a single tile. */
export function fill(w: number, h: number, tile: string): string[] {
  return Array.from({ length: w * h }, () => tile);
}

/** Stamp a rectangle of tiles onto a background array (row-major, width `w`). */
export function stamp(
  bg: string[],
  w: number,
  rect: Rect,
  tile: string,
): void {
  for (let dy = 0; dy < rect.h; dy++) {
    for (let dx = 0; dx < rect.w; dx++) {
      const x = rect.x + dx;
      const y = rect.y + dy;
      const i = y * w + x;
      if (i >= 0 && i < bg.length) {
        bg[i] = tile;
      }
    }
  }
}

/** Stamp a rectangle of area ids onto an areaMap (row-major, width `w`). */
export function stampArea(
  areaMap: number[],
  w: number,
  rect: Rect,
  areaId: number,
): void {
  for (let dy = 0; dy < rect.h; dy++) {
    for (let dx = 0; dx < rect.w; dx++) {
      const x = rect.x + dx;
      const y = rect.y + dy;
      const i = y * w + x;
      if (i >= 0 && i < areaMap.length) {
        areaMap[i] = areaId;
      }
    }
  }
}

function emptyAreaMap(w: number, h: number): number[] {
  return Array.from({ length: w * h }, () => 0);
}

function obj(id: string, x: number, y: number, layer?: number): LevelEntitySpec {
  return layer === undefined
    ? { kind: "object", id, x, y }
    : { kind: "object", id, x, y, layer };
}

function txt(id: string, x: number, y: number, layer?: number): LevelEntitySpec {
  return layer === undefined
    ? { kind: "text", id, x, y }
    : { kind: "text", id, x, y, layer };
}

/** Create an empty pastoral level shell (dense authoring; chunked on load). */
export function createBlankLevel(
  id: string,
  name: string,
  w = DEFAULT_CHUNK_SIZE,
  h = 12,
): LevelDocument {
  return {
    id,
    name,
    width: w,
    height: h,
    chunkSize: DEFAULT_CHUNK_SIZE,
    chunks: [],
    globalRules: [],
    areas: [],
    areaMap: emptyAreaMap(w, h),
    background: fill(w, h, BG.grass),
    entities: [],
  };
}

// ---------------------------------------------------------------------------
// Area ids (0 = none)
// ---------------------------------------------------------------------------

const AREA_GARDEN = 1;
const AREA_ROCK = 2;
const AREA_HOLLOW = 3;

const OVERWORLD_AREAS: AreaDef[] = [
  {
    id: AREA_GARDEN,
    name: "Garden Gate",
    color: "rgba(72, 180, 96, 0.35)",
  },
  {
    id: AREA_ROCK,
    name: "Rock Yard",
    color: "rgba(210, 140, 55, 0.35)",
  },
  {
    id: AREA_HOLLOW,
    name: "Secret Hollow",
    color: "rgba(140, 100, 220, 0.40)",
  },
];

// ---------------------------------------------------------------------------
// Overworld — 24×16 pastoral map with rule areas
// ---------------------------------------------------------------------------

const OW_W = 24;
const OW_H = 16;

const GARDEN_RECT: Rect = { x: 1, y: 1, w: 7, h: 6 };
const ROCK_RECT: Rect = { x: 15, y: 1, w: 8, h: 7 };
const HOLLOW_RECT: Rect = { x: 8, y: 10, w: 8, h: 5 };

function buildOverworldBackground(): string[] {
  const bg = fill(OW_W, OW_H, BG.grass);

  // Soft checker accents (calm procedural grass2)
  for (let y = 0; y < OW_H; y++) {
    for (let x = 0; x < OW_W; x++) {
      if ((x + y) % 5 === 0) {
        bg[y * OW_W + x] = BG.grass2;
      }
    }
  }

  // Flower patches
  stamp(bg, OW_W, { x: 9, y: 1, w: 3, h: 2 }, BG.flower);
  stamp(bg, OW_W, { x: 20, y: 12, w: 2, h: 2 }, BG.flower);

  // Connecting paths between areas
  stamp(bg, OW_W, { x: 4, y: 7, w: 2, h: 3 }, BG.path);
  stamp(bg, OW_W, { x: 4, y: 9, w: 8, h: 1 }, BG.path);
  stamp(bg, OW_W, { x: 11, y: 8, w: 1, h: 2 }, BG.path);
  stamp(bg, OW_W, { x: 8, y: 4, w: 7, h: 1 }, BG.path);
  stamp(bg, OW_W, { x: 18, y: 8, w: 2, h: 2 }, BG.path);

  // Area floors — calm tints, not busy atlas art
  stamp(bg, OW_W, GARDEN_RECT, BG.dirt);
  stamp(bg, OW_W, { x: 2, y: 2, w: 5, h: 4 }, BG.path);
  stamp(bg, OW_W, ROCK_RECT, BG.stone);
  stamp(bg, OW_W, HOLLOW_RECT, BG.bush);
  stamp(bg, OW_W, { x: 9, y: 11, w: 6, h: 3 }, BG.dirt);

  stamp(bg, OW_W, { x: 1, y: 12, w: 4, h: 3 }, BG.water);

  return bg;
}

function buildOverworldAreaMap(): number[] {
  const map = emptyAreaMap(OW_W, OW_H);
  stampArea(map, OW_W, GARDEN_RECT, AREA_GARDEN);
  stampArea(map, OW_W, ROCK_RECT, AREA_ROCK);
  stampArea(map, OW_W, HOLLOW_RECT, AREA_HOLLOW);
  return map;
}

/**
 * Overworld layout sketch (rule text lives only inside matching area cells):
 *
 *  Garden Gate (1,1)–(7,6): WALL IS STOP forms a short corridor to portal L1
 *  Rock Yard (15,1)–(22,7): ROCK IS PUSH; shove rocks aside to reach portal L2
 *  Secret Hollow (8,10)–(15,14): push text to break WALL IS STOP / form PATH;
 *    special portal behind the barrier
 *  Open path between areas; portal to L3 sits on the east path spur
 */
function buildOverworldEntities(): LevelEntitySpec[] {
  const e: LevelEntitySpec[] = [];

  // --- Baba spawn (near garden entrance, outside areas) ---
  e.push(obj("baba", 3, 8));

  // --- Garden Gate: WALL IS STOP + corridor walls ---
  // Rule text (must be inside area 1)
  e.push(txt("wall", 2, 1));
  e.push(txt("is", 3, 1));
  e.push(txt("stop", 4, 1));

  // Corridor: walls form a channel leading to portal at (6,4)
  // Top/bottom walls of corridor
  for (const x of [2, 3, 4, 5, 6]) {
    e.push(obj("wall", x, 2));
    e.push(obj("wall", x, 5));
  }
  // Left mouth partially open at y=3,4; right sealed except portal cell
  e.push(obj("wall", 2, 3));
  e.push(obj("wall", 6, 3));
  // Portal sits at (6,4) — leave clear; side walls guide the walk
  e.push(obj("wall", 5, 3));

  // --- Rock Yard: WALL IS STOP (fence) + ROCK IS PUSH ---
  e.push(txt("wall", 20, 1));
  e.push(txt("is", 21, 1));
  e.push(txt("stop", 22, 1));
  e.push(txt("rock", 16, 2));
  e.push(txt("is", 17, 2));
  e.push(txt("push", 18, 2));

  // Rocks blocking the path to portal at (21,5)
  e.push(obj("rock", 19, 3));
  e.push(obj("rock", 19, 4));
  e.push(obj("rock", 19, 5));
  e.push(obj("rock", 20, 5));
  e.push(obj("rock", 21, 4));

  // Yard fence (still inside Rock Yard area)
  for (const x of [15, 16, 17, 18, 19, 20, 21, 22]) {
    e.push(obj("wall", x, 7));
  }
  for (const y of [3, 4, 5, 6]) {
    e.push(obj("wall", 15, y));
  }

  // --- Path spur toward level-3 portal (decorative scenery, no area rules) ---
  e.push(obj("rock", 13, 4));
  e.push(obj("grass", 10, 2));
  e.push(obj("grass", 12, 3));

  // --- Secret Hollow: harder — WALL IS STOP seals the special portal;
  //     spare text tiles let the player break STOP or form a detour rule. ---
  e.push(txt("wall", 9, 10));
  e.push(txt("is", 10, 10));
  e.push(txt("stop", 11, 10));

  // Barrier wall line in front of special portal (14,13)
  e.push(obj("wall", 12, 11));
  e.push(obj("wall", 12, 12));
  e.push(obj("wall", 12, 13));
  e.push(obj("wall", 13, 11));
  e.push(obj("wall", 14, 11));
  e.push(obj("wall", 15, 11));
  e.push(obj("wall", 15, 12));
  e.push(obj("wall", 15, 13));

  // Pushable rock to help rearrange text; spare "push" / "is" / "rock" words
  e.push(obj("rock", 10, 12));
  e.push(txt("rock", 9, 13));
  e.push(txt("is", 10, 13));
  e.push(txt("push", 11, 13));
  // Orphan "win" / "flag" not needed; player must shove "stop" off the rule
  // or push walls aside after ROCK IS PUSH is formed inside the hollow.

  // Soft outer hedge (still in hollow)
  e.push(obj("wall", 8, 10));
  e.push(obj("wall", 8, 14));
  e.push(obj("wall", 15, 14));

  return e;
}

export const OVERWORLD: LevelDocument = {
  id: "overworld",
  name: "Pastoral Crossroads",
  width: OW_W,
  height: OW_H,
  globalRules: [{ subject: "baba", verb: "is", object: "you" }],
  areas: OVERWORLD_AREAS,
  areaMap: buildOverworldAreaMap(),
  background: buildOverworldBackground(),
  entities: buildOverworldEntities(),
  isOverworld: true,
  spawn: { x: 3, y: 8 },
  portals: [
    {
      id: "portal-level-1",
      x: 6,
      y: 4,
      targetLevelId: "level-1",
      label: "I",
    },
    {
      id: "portal-level-2",
      x: 21,
      y: 5,
      targetLevelId: "level-2",
      requires: "level-1",
      label: "II",
    },
    {
      id: "portal-level-3",
      x: 18,
      y: 9,
      targetLevelId: "level-3",
      requires: "level-2",
      label: "III",
    },
    {
      id: "portal-special",
      x: 14,
      y: 13,
      targetLevelId: "level-special",
      requires: "level-3",
      label: "?",
      special: true,
    },
  ],
};

// ---------------------------------------------------------------------------
// Puzzle levels (classic-ish, no rule areas)
// ---------------------------------------------------------------------------

/** Intro: exit the chamber, walk to the flag (FLAG IS WIN already formed). */
export const LEVEL_1: LevelDocument = {
  id: "level-1",
  name: "Where Do I Go?",
  width: 12,
  height: 9,
  globalRules: [{ subject: "baba", verb: "is", object: "you" }],
  areas: [],
  areaMap: emptyAreaMap(12, 9),
  background: (() => {
    const bg = fill(12, 9, BG.grass);
    stamp(bg, 12, { x: 2, y: 2, w: 8, h: 5 }, BG.path);
    return bg;
  })(),
  entities: [
    // WALL IS STOP along the top (out of the walking path)
    txt("wall", 1, 0),
    txt("is", 2, 0),
    txt("stop", 3, 0),

    // Chamber with an open doorway on the east (x=5, y=4–5)
    obj("wall", 1, 3),
    obj("wall", 2, 3),
    obj("wall", 3, 3),
    obj("wall", 4, 3),
    obj("wall", 5, 3),
    obj("wall", 5, 6),
    obj("wall", 4, 6),
    obj("wall", 3, 6),
    obj("wall", 2, 6),
    obj("wall", 1, 6),
    obj("wall", 1, 5),
    obj("wall", 1, 4),

    obj("baba", 3, 4),

    // FLAG IS WIN already formed on the bottom row — walk the mid path to the flag
    txt("flag", 7, 8),
    txt("is", 8, 8),
    txt("win", 9, 8),
    obj("flag", 9, 5),
  ],
};

/** Rocks block the flag; ROCK IS PUSH lets you clear a path. */
export const LEVEL_2: LevelDocument = {
  id: "level-2",
  name: "Out of Reach",
  width: 14,
  height: 10,
  globalRules: [
    { subject: "baba", verb: "is", object: "you" },
    { subject: "wall", verb: "is", object: "stop" },
  ],
  areas: [],
  areaMap: emptyAreaMap(14, 10),
  background: (() => {
    const bg = fill(14, 10, BG.grass);
    stamp(bg, 14, { x: 1, y: 1, w: 12, h: 8 }, BG.dirt);
    stamp(bg, 14, { x: 3, y: 3, w: 8, h: 4 }, BG.path);
    return bg;
  })(),
  entities: [
    // Outer wall box
    ...perimeterWalls(14, 10),

    obj("baba", 2, 4),

    // ROCK IS PUSH on board
    txt("rock", 2, 2),
    txt("is", 3, 2),
    txt("push", 4, 2),

    // Rock column blocking flag alcove
    obj("rock", 7, 3),
    obj("rock", 7, 4),
    obj("rock", 7, 5),
    obj("rock", 8, 4),

    // FLAG IS WIN
    txt("flag", 9, 2),
    txt("is", 10, 2),
    txt("win", 11, 2),
    obj("flag", 11, 5),
  ],
};

/** Break WALL IS STOP (or rearrange) to reach the flag; text is pushable. */
export const LEVEL_3: LevelDocument = {
  id: "level-3",
  name: "Changing the Rules",
  width: 14,
  height: 11,
  globalRules: [{ subject: "baba", verb: "is", object: "you" }],
  areas: [],
  areaMap: emptyAreaMap(14, 11),
  background: (() => {
    const bg = fill(14, 11, BG.grass2);
    stamp(bg, 14, { x: 0, y: 0, w: 14, h: 11 }, BG.grass);
    stamp(bg, 14, { x: 2, y: 2, w: 10, h: 7 }, BG.path);
    stamp(bg, 14, { x: 10, y: 7, w: 3, h: 3 }, BG.flower);
    return bg;
  })(),
  entities: [
    // WALL IS STOP sealing the right chamber
    txt("wall", 2, 1),
    txt("is", 3, 1),
    txt("stop", 4, 1),

    // Walls forming sealed room for flag
    obj("wall", 8, 3),
    obj("wall", 9, 3),
    obj("wall", 10, 3),
    obj("wall", 11, 3),
    obj("wall", 12, 3),
    obj("wall", 8, 4),
    obj("wall", 12, 4),
    obj("wall", 8, 5),
    obj("wall", 12, 5),
    obj("wall", 8, 6),
    obj("wall", 9, 6),
    obj("wall", 10, 6),
    obj("wall", 11, 6),
    obj("wall", 12, 6),

    obj("baba", 3, 5),
    obj("flag", 10, 4),

    // FLAG IS WIN outside, already formed
    txt("flag", 2, 8),
    txt("is", 3, 8),
    txt("win", 4, 8),

    // Hint rock + ROCK IS PUSH so walls can be moved after rule break,
    // or player simply pushes "stop" away.
    txt("rock", 6, 8),
    txt("is", 7, 8),
    txt("push", 8, 8),
    obj("rock", 5, 5),
  ],
};

/**
 * Special: sparse global rules; must form BABA IS YOU and FLAG IS WIN
 * while dealing with KEKE IS PUSH / skull hazards.
 */
export const LEVEL_SPECIAL: LevelDocument = {
  id: "level-special",
  name: "Hollow Echo",
  width: 16,
  height: 12,
  globalRules: [
    { subject: "wall", verb: "is", object: "stop" },
    { subject: "skull", verb: "is", object: "defeat" },
  ],
  areas: [],
  areaMap: emptyAreaMap(16, 12),
  background: (() => {
    const bg = fill(16, 12, BG.bush);
    stamp(bg, 16, { x: 1, y: 1, w: 14, h: 10 }, BG.dirt);
    stamp(bg, 16, { x: 3, y: 3, w: 10, h: 6 }, BG.stone);
    stamp(bg, 16, { x: 12, y: 8, w: 2, h: 2 }, BG.flower);
    return bg;
  })(),
  entities: [
    ...perimeterWalls(16, 12),

    // Scattered identity — not yet YOU
    obj("baba", 3, 3),
    txt("baba", 2, 5),
    txt("is", 3, 5),
    txt("you", 5, 6), // gap: must push "you" into place

    // Keke distractor
    obj("keke", 7, 4),
    txt("keke", 6, 2),
    txt("is", 7, 2),
    txt("push", 8, 2),

    // Skull between baba and flag chamber
    obj("skull", 9, 5),
    obj("skull", 9, 6),

    // Flag win pieces
    txt("flag", 11, 3),
    txt("is", 12, 3),
    txt("win", 13, 4),
    obj("flag", 13, 8),

    // Inner wall alcove around flag (open from left if skulls avoided)
    obj("wall", 11, 7),
    obj("wall", 12, 7),
    obj("wall", 13, 7),
    obj("wall", 14, 7),
    obj("wall", 14, 8),
    obj("wall", 14, 9),
    obj("wall", 11, 9),
    obj("wall", 12, 9),
    obj("wall", 13, 9),

    // Rock tool
    obj("rock", 4, 8),
    txt("rock", 2, 9),
    txt("is", 3, 9),
    txt("push", 4, 9),
  ],
};

/** Axis-aligned wall ring on the map border (object walls). */
function perimeterWalls(w: number, h: number): LevelEntitySpec[] {
  const out: LevelEntitySpec[] = [];
  for (let x = 0; x < w; x++) {
    out.push(obj("wall", x, 0));
    out.push(obj("wall", x, h - 1));
  }
  for (let y = 1; y < h - 1; y++) {
    out.push(obj("wall", 0, y));
    out.push(obj("wall", w - 1, y));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Campaign registry
// ---------------------------------------------------------------------------

export const CAMPAIGN_LEVELS: LevelDocument[] = [
  OVERWORLD,
  LEVEL_1,
  LEVEL_2,
  LEVEL_3,
  LEVEL_SPECIAL,
];

export const INITIAL_UNLOCKS: string[] = ["overworld", "level-1"];

/** Re-export types commonly needed alongside builtins. */
export type { GlobalRuleSpec, LevelDocument, LevelEntitySpec, AreaDef };
