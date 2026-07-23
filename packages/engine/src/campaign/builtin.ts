import type {
  AreaDef,
  GlobalRuleSpec,
  LevelDocument,
  LevelEntitySpec,
  LevelPortal,
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

export function fill(w: number, h: number, tile: string): string[] {
  return Array.from({ length: w * h }, () => tile);
}

export function stamp(bg: string[], w: number, rect: Rect, tile: string): void {
  for (let dy = 0; dy < rect.h; dy++) {
    for (let dx = 0; dx < rect.w; dx++) {
      const i = (rect.y + dy) * w + (rect.x + dx);
      if (i >= 0 && i < bg.length) bg[i] = tile;
    }
  }
}

export function stampArea(
  areaMap: number[],
  w: number,
  rect: Rect,
  areaId: number,
): void {
  for (let dy = 0; dy < rect.h; dy++) {
    for (let dx = 0; dx < rect.w; dx++) {
      const i = (rect.y + dy) * w + (rect.x + dx);
      if (i >= 0 && i < areaMap.length) areaMap[i] = areaId;
    }
  }
}

function emptyAreaMap(w: number, h: number): number[] {
  return Array.from({ length: w * h }, () => 0);
}

function obj(id: string, x: number, y: number): LevelEntitySpec {
  return { kind: "object", id, x, y };
}

function txt(id: string, x: number, y: number): LevelEntitySpec {
  return { kind: "text", id, x, y };
}

function exitAt(x: number, y: number): LevelPortal {
  return {
    id: "exit",
    x,
    y,
    targetLevelId: "overworld",
    label: "EXIT",
    exit: true,
  };
}

function perimeter(w: number, h: number): LevelEntitySpec[] {
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

/** Inclusive filled wall rectangle. */
function wallRect(x0: number, y0: number, x1: number, y1: number): LevelEntitySpec[] {
  const out: LevelEntitySpec[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) out.push(obj("wall", x, y));
  }
  return out;
}

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
    camera: { mode: "follow", zoom: 48 },
  };
}

// ---------------------------------------------------------------------------
// Linear overworld — tight 1-cell corridor I → II → III → IV, ? spur south
// Authored as one 16×16 chunk so dense→chunk padding cannot open void.
// ---------------------------------------------------------------------------

const OW_W = 16;
const OW_H = 16;
/** Corridor row. */
const OW_Y = 7;

function overworldWalls(): LevelEntitySpec[] {
  const walk = new Set<string>();
  for (let x = 1; x <= 14; x++) walk.add(`${x},${OW_Y}`);
  // Spur down to special portal
  walk.add(`9,8`);
  walk.add(`9,9`);
  walk.add(`9,10`);
  walk.add(`9,11`);
  const out: LevelEntitySpec[] = [];
  for (let y = 0; y < OW_H; y++) {
    for (let x = 0; x < OW_W; x++) {
      if (walk.has(`${x},${y}`)) continue;
      out.push(obj("wall", x, y));
    }
  }
  return out;
}

export const OVERWORLD: LevelDocument = {
  id: "overworld",
  name: "The Path",
  width: OW_W,
  height: OW_H,
  chunkSize: DEFAULT_CHUNK_SIZE,
  globalRules: [
    { subject: "baba", verb: "is", object: "you" },
    { subject: "wall", verb: "is", object: "stop" },
  ],
  areas: [],
  areaMap: emptyAreaMap(OW_W, OW_H),
  background: (() => {
    const bg = fill(OW_W, OW_H, BG.bush);
    stamp(bg, OW_W, { x: 1, y: OW_Y, w: 14, h: 1 }, BG.path);
    stamp(bg, OW_W, { x: 9, y: 8, w: 1, h: 4 }, BG.path);
    return bg;
  })(),
  entities: [...overworldWalls(), obj("baba", 2, OW_Y)],
  isOverworld: true,
  spawn: { x: 2, y: OW_Y },
  camera: { mode: "follow", zoom: 56 },
  portals: [
    { id: "p1", x: 4, y: OW_Y, targetLevelId: "level-1", label: "I" },
    {
      id: "p2",
      x: 6,
      y: OW_Y,
      targetLevelId: "level-2",
      requires: "level-1",
      label: "II",
    },
    {
      id: "p3",
      x: 9,
      y: OW_Y,
      targetLevelId: "level-3",
      requires: "level-2",
      label: "III",
    },
    {
      id: "p-special",
      x: 9,
      y: 11,
      targetLevelId: "level-special",
      requires: "level-2",
      label: "?",
      special: true,
    },
    {
      id: "p4",
      x: 12,
      y: OW_Y,
      targetLevelId: "level-4",
      requires: "level-3",
      label: "IV",
    },
  ],
};

// ---------------------------------------------------------------------------
// L1 — break WALL IS STOP, cross mid wall, step on EXIT
// ---------------------------------------------------------------------------

export const LEVEL_1: LevelDocument = {
  id: "level-1",
  name: "Still Walls",
  width: 12,
  height: 9,
  globalRules: [{ subject: "baba", verb: "is", object: "you" }],
  areas: [],
  areaMap: emptyAreaMap(12, 9),
  background: (() => {
    const bg = fill(12, 9, BG.grass);
    stamp(bg, 12, { x: 1, y: 1, w: 10, h: 7 }, BG.path);
    return bg;
  })(),
  camera: { mode: "follow", zoom: 52 },
  portals: [exitAt(10, 4)],
  entities: [
    ...perimeter(12, 9),
    // Room above the words so STOP can be pushed up off the sentence
    txt("wall", 2, 2),
    txt("is", 3, 2),
    txt("stop", 4, 2),
    obj("wall", 6, 1),
    obj("wall", 6, 2),
    obj("wall", 6, 3),
    obj("wall", 6, 4),
    obj("wall", 6, 5),
    obj("wall", 6, 6),
    obj("wall", 6, 7),
    obj("baba", 2, 4),
  ],
};

// ---------------------------------------------------------------------------
// L2 — ROCK IS PUSH; push rocks down into pocket via gap above, then EXIT
// ---------------------------------------------------------------------------

export const LEVEL_2: LevelDocument = {
  id: "level-2",
  name: "Shove",
  width: 13,
  height: 9,
  globalRules: [
    { subject: "baba", verb: "is", object: "you" },
    { subject: "wall", verb: "is", object: "stop" },
  ],
  areas: [],
  areaMap: emptyAreaMap(13, 9),
  background: (() => {
    const bg = fill(13, 9, BG.grass);
    stamp(bg, 13, { x: 1, y: 3, w: 11, h: 1 }, BG.path);
    stamp(bg, 13, { x: 6, y: 2, w: 1, h: 4 }, BG.dirt);
    return bg;
  })(),
  camera: { mode: "follow", zoom: 52 },
  portals: [exitAt(11, 3)],
  entities: [
    ...perimeter(13, 9),
    ...wallRect(1, 2, 5, 2),
    ...wallRect(7, 1, 11, 2),
    obj("wall", 6, 1),
    // (6,2) open — stand here to push rocks down
    ...wallRect(1, 4, 5, 7),
    ...wallRect(7, 4, 11, 7),
    obj("wall", 6, 6),
    obj("wall", 6, 7),

    obj("baba", 2, 3),
    txt("rock", 2, 1),
    txt("is", 3, 1),
    txt("push", 4, 1),
    obj("rock", 6, 3),
    obj("rock", 7, 3),
  ],
};

// ---------------------------------------------------------------------------
// L3 — ROCK IS PULL; approach under rock, move south to pull it into pocket
// ---------------------------------------------------------------------------

export const LEVEL_3: LevelDocument = {
  id: "level-3",
  name: "Come Along",
  width: 13,
  height: 9,
  globalRules: [
    { subject: "baba", verb: "is", object: "you" },
    { subject: "wall", verb: "is", object: "stop" },
  ],
  areas: [],
  areaMap: emptyAreaMap(13, 9),
  background: (() => {
    const bg = fill(13, 9, BG.grass);
    stamp(bg, 13, { x: 1, y: 3, w: 11, h: 1 }, BG.path);
    stamp(bg, 13, { x: 5, y: 4, w: 2, h: 2 }, BG.dirt);
    return bg;
  })(),
  camera: { mode: "follow", zoom: 52 },
  portals: [exitAt(11, 3)],
  entities: [
    ...perimeter(13, 9),
    ...wallRect(1, 1, 11, 2),
    // y=4 open at x=5,6 for approach + pocket; sealed elsewhere
    ...wallRect(1, 4, 4, 4),
    ...wallRect(8, 4, 11, 7),
    ...wallRect(1, 5, 4, 6),
    obj("wall", 5, 6),
    obj("wall", 5, 7),
    obj("wall", 6, 6),
    obj("wall", 6, 7),
    obj("wall", 7, 5),
    obj("wall", 7, 6),
    obj("wall", 7, 7),
    ...wallRect(1, 7, 1, 7),

    obj("baba", 2, 3),
    obj("rock", 6, 3),
    txt("rock", 2, 7),
    txt("is", 3, 7),
    txt("pull", 4, 7),
  ],
};

// ---------------------------------------------------------------------------
// L4 — push rock A into pocket, rewrite to PULL, extract rock B, EXIT
// ---------------------------------------------------------------------------

export const LEVEL_4: LevelDocument = {
  id: "level-4",
  name: "Two Ways",
  width: 15,
  height: 10,
  globalRules: [
    { subject: "baba", verb: "is", object: "you" },
    { subject: "wall", verb: "is", object: "stop" },
  ],
  areas: [],
  areaMap: emptyAreaMap(15, 10),
  background: (() => {
    const bg = fill(15, 10, BG.grass);
    stamp(bg, 15, { x: 1, y: 4, w: 13, h: 1 }, BG.path);
    return bg;
  })(),
  camera: { mode: "follow", zoom: 48 },
  portals: [exitAt(13, 4)],
  entities: [
    ...perimeter(15, 10),
    ...wallRect(1, 1, 13, 2),
    ...wallRect(1, 3, 4, 3),
    ...wallRect(6, 3, 8, 3),
    ...wallRect(10, 3, 13, 3),
    // (5,3) open above rock A; (9,3) alcove for rock B
    obj("wall", 8, 3),
    obj("wall", 10, 3),
    ...wallRect(1, 5, 4, 8),
    ...wallRect(6, 5, 8, 8),
    ...wallRect(10, 5, 13, 8),
    // (5,5) pocket for A; (9,5) landing for pulled B
    obj("wall", 5, 6),
    obj("wall", 5, 7),
    obj("wall", 5, 8),
    obj("wall", 9, 6),
    obj("wall", 9, 7),
    obj("wall", 9, 8),

    obj("baba", 2, 4),
    txt("rock", 2, 1),
    txt("is", 3, 1),
    txt("push", 4, 1),
    txt("pull", 6, 1),
    obj("rock", 5, 4),
    obj("rock", 9, 3),
  ],
};

// ---------------------------------------------------------------------------
// Special (‖ III) — swap PUSH/PULL to clear alcove then jam
// ---------------------------------------------------------------------------

export const LEVEL_SPECIAL: LevelDocument = {
  id: "level-special",
  name: "Tug of Rules",
  width: 15,
  height: 10,
  globalRules: [
    { subject: "baba", verb: "is", object: "you" },
    { subject: "wall", verb: "is", object: "stop" },
  ],
  areas: [],
  areaMap: emptyAreaMap(15, 10),
  background: (() => {
    const bg = fill(15, 10, BG.grass2);
    stamp(bg, 15, { x: 1, y: 4, w: 13, h: 1 }, BG.path);
    return bg;
  })(),
  camera: { mode: "follow", zoom: 48 },
  portals: [exitAt(13, 4)],
  entities: [
    ...perimeter(15, 10),
    ...wallRect(1, 1, 13, 2),
    ...wallRect(1, 3, 5, 3),
    ...wallRect(7, 3, 13, 3),
    // (6,3) alcove
    obj("wall", 5, 3),
    obj("wall", 7, 3),
    ...wallRect(1, 5, 8, 8),
    ...wallRect(11, 5, 13, 8),
    // pocket (9,5)(10,5) open
    obj("wall", 9, 6),
    obj("wall", 10, 6),
    obj("wall", 9, 7),
    obj("wall", 10, 7),
    obj("wall", 9, 8),
    obj("wall", 10, 8),

    obj("baba", 2, 4),
    txt("rock", 2, 1),
    txt("is", 3, 1),
    txt("push", 4, 1),
    txt("pull", 8, 1),
    obj("rock", 6, 3),
    obj("rock", 9, 4),
    obj("rock", 10, 4),
  ],
};

export const CAMPAIGN_LEVELS: LevelDocument[] = [
  OVERWORLD,
  LEVEL_1,
  LEVEL_2,
  LEVEL_3,
  LEVEL_4,
  LEVEL_SPECIAL,
];

export const INITIAL_UNLOCKS: string[] = ["overworld", "level-1"];

export type { GlobalRuleSpec, LevelDocument, LevelEntitySpec, AreaDef };
