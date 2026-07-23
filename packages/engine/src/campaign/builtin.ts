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
  jungle: "jungle",
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

function treeRect(x0: number, y0: number, x1: number, y1: number): LevelEntitySpec[] {
  const out: LevelEntitySpec[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) out.push(obj("tree", x, y));
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
// Overworld — pastoral west → jungle east (32×16, two chunks wide)
// ---------------------------------------------------------------------------

const OW_W = 32;
const OW_H = 16;

function overworldSolid(): LevelEntitySpec[] {
  /** Walkable clearings + a short bottleneck with a pushable rock. */
  const walk = new Set<string>();
  const add = (x: number, y: number) => walk.add(`${x},${y}`);
  const addRect = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) add(x, y);
  };

  // West pastoral meadow
  addRect(1, 3, 9, 12);
  // Bottleneck: only (10,8) links west→east; (10,9) is a dead-end pocket
  add(10, 8);
  add(10, 9);
  // Single-cell link into the roomier east path
  add(11, 8);
  // Central path (roomy after the gate)
  addRect(12, 6, 20, 10);
  // Special spur south
  add(15, 11);
  add(15, 12);
  add(15, 13);
  // Jungle clearings east
  addRect(21, 4, 30, 12);
  // Link from path into jungle
  addRect(19, 7, 21, 9);

  const out: LevelEntitySpec[] = [];
  for (let y = 0; y < OW_H; y++) {
    for (let x = 0; x < OW_W; x++) {
      if (walk.has(`${x},${y}`)) continue;
      if (x >= 18) out.push(obj("tree", x, y));
      else out.push(obj("wall", x, y));
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
    { subject: "tree", verb: "is", object: "stop" },
    { subject: "rock", verb: "is", object: "push" },
  ],
  areas: [],
  areaMap: emptyAreaMap(OW_W, OW_H),
  background: (() => {
    const bg = fill(OW_W, OW_H, BG.grass);
    stamp(bg, OW_W, { x: 0, y: 0, w: 18, h: OW_H }, BG.grass);
    stamp(bg, OW_W, { x: 1, y: 3, w: 9, h: 10 }, BG.grass2);
    stamp(bg, OW_W, { x: 3, y: 5, w: 2, h: 2 }, BG.flower);
    stamp(bg, OW_W, { x: 11, y: 6, w: 10, h: 5 }, BG.path);
    stamp(bg, OW_W, { x: 15, y: 11, w: 1, h: 3 }, BG.dirt);
    stamp(bg, OW_W, { x: 18, y: 0, w: 14, h: OW_H }, BG.jungle);
    stamp(bg, OW_W, { x: 21, y: 4, w: 10, h: 9 }, BG.jungle);
    stamp(bg, OW_W, { x: 19, y: 7, w: 3, h: 3 }, BG.path);
    return bg;
  })(),
  entities: [
    ...overworldSolid(),
    obj("baba", 3, 8),
    // Mini puzzle: rock blocks the east passage; push it down into the pocket.
    obj("rock", 10, 8),
  ],
  isOverworld: true,
  spawn: { x: 3, y: 8 },
  camera: { mode: "follow", zoom: 50 },
  portals: [
    { id: "p1", x: 5, y: 7, targetLevelId: "level-1", label: "I" },
    {
      id: "p2",
      x: 12,
      y: 8,
      targetLevelId: "level-2",
      requires: "level-1",
      label: "II",
    },
    {
      id: "p3",
      x: 16,
      y: 8,
      targetLevelId: "level-3",
      requires: "level-2",
      label: "III",
    },
    {
      id: "p-special",
      x: 15,
      y: 13,
      targetLevelId: "level-special",
      requires: "level-2",
      label: "?",
      special: true,
    },
    {
      id: "p4",
      x: 19,
      y: 8,
      targetLevelId: "level-4",
      requires: "level-3",
      label: "IV",
    },
    {
      id: "pj1",
      x: 24,
      y: 8,
      targetLevelId: "level-jungle-1",
      requires: "level-4",
      label: "J1",
    },
    {
      id: "pj2",
      x: 28,
      y: 8,
      targetLevelId: "level-jungle-2",
      requires: "level-jungle-1",
      label: "J2",
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
// L2 — ROCK IS PUSH; one rock into south pocket, then up the shaft to EXIT
// Softlock-safe: wall east of rock blocks shoving it toward the exit path.
// ---------------------------------------------------------------------------

export const LEVEL_2: LevelDocument = {
  id: "level-2",
  name: "Shove",
  width: 11,
  height: 8,
  globalRules: [
    { subject: "baba", verb: "is", object: "you" },
    { subject: "wall", verb: "is", object: "stop" },
  ],
  areas: [],
  areaMap: emptyAreaMap(11, 8),
  background: (() => {
    const bg = fill(11, 8, BG.grass);
    stamp(bg, 11, { x: 1, y: 3, w: 5, h: 1 }, BG.path);
    stamp(bg, 11, { x: 6, y: 1, w: 1, h: 5 }, BG.dirt);
    stamp(bg, 11, { x: 7, y: 1, w: 2, h: 1 }, BG.path);
    return bg;
  })(),
  camera: { mode: "follow", zoom: 52 },
  portals: [exitAt(9, 1)],
  entities: [
    ...perimeter(11, 8),
    // Texts on empty floor (not under walls)
    txt("rock", 1, 1),
    txt("is", 2, 1),
    txt("push", 3, 1),
    obj("wall", 4, 1),
    obj("wall", 5, 1),
    // y=1 shaft/exit lane: (6,1)(7,1)(8,1) open → EXIT (9,1)

    // Ceiling with approach (5,2) + shaft (6,2); wall blocks east of rock
    ...wallRect(1, 2, 4, 2),
    ...wallRect(7, 2, 9, 2),

    // Corridor — rock at shaft; wall blocks east push toward EXIT
    obj("baba", 2, 3),
    obj("rock", 6, 3),
    ...wallRect(7, 3, 9, 3),

    // Pocket shaft under the rock
    ...wallRect(1, 4, 5, 4),
    ...wallRect(7, 4, 9, 4),
    ...wallRect(1, 5, 5, 5),
    ...wallRect(7, 5, 9, 5),
    ...wallRect(1, 6, 9, 6),
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
// All rule texts sit on empty floor (never on STOP walls).
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
    stamp(bg, 15, { x: 2, y: 1, w: 5, h: 1 }, BG.stone);
    return bg;
  })(),
  camera: { mode: "follow", zoom: 48 },
  portals: [exitAt(13, 4)],
  entities: [
    ...perimeter(15, 10),
    // y=1: open floor for words
    txt("rock", 2, 1),
    txt("is", 3, 1),
    txt("push", 4, 1),
    txt("pull", 6, 1),

    // Ceiling / structure below the words
    ...wallRect(1, 2, 8, 2),
    ...wallRect(10, 2, 13, 2),
    // (9,2) alcove for rock B
    ...wallRect(1, 3, 4, 3),
    ...wallRect(6, 3, 8, 3),
    ...wallRect(10, 3, 13, 3),
    // (5,3) open above rock A; (9,3) rock B alcove

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
    obj("rock", 5, 4),
    obj("rock", 9, 3),
  ],
};

// ---------------------------------------------------------------------------
// Special — push/pull swap; texts on empty floor
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
    stamp(bg, 15, { x: 2, y: 1, w: 7, h: 1 }, BG.stone);
    return bg;
  })(),
  camera: { mode: "follow", zoom: 48 },
  portals: [exitAt(13, 4)],
  entities: [
    ...perimeter(15, 10),
    // Words on empty floor
    txt("rock", 2, 1),
    txt("is", 3, 1),
    txt("push", 4, 1),
    txt("pull", 8, 1),

    ...wallRect(1, 2, 13, 2),
    ...wallRect(1, 3, 5, 3),
    ...wallRect(7, 3, 13, 3),
    // (6,3) alcove for jammed rock

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
    obj("rock", 6, 3),
    obj("rock", 9, 4),
    obj("rock", 10, 4),
  ],
};

// ---------------------------------------------------------------------------
// Jungle 1 — Fruit Gate: slide/push fruit onto door; FRUIT ON DOOR IS WIN
// (also forms DOOR IS WIN — walk onto the door to finish)
// ---------------------------------------------------------------------------

export const LEVEL_JUNGLE_1: LevelDocument = {
  id: "level-jungle-1",
  name: "Fruit Gate",
  width: 12,
  height: 9,
  globalRules: [
    { subject: "baba", verb: "is", object: "you" },
    { subject: "wall", verb: "is", object: "stop" },
    { subject: "tree", verb: "is", object: "stop" },
    { subject: "fruit", verb: "is", object: "push" },
    { subject: "fruit", verb: "is", object: "slide" },
  ],
  areas: [],
  areaMap: emptyAreaMap(12, 9),
  background: (() => {
    const bg = fill(12, 9, BG.jungle);
    stamp(bg, 12, { x: 1, y: 5, w: 7, h: 1 }, BG.dirt);
    stamp(bg, 12, { x: 7, y: 1, w: 1, h: 5 }, BG.path);
    return bg;
  })(),
  camera: { mode: "follow", zoom: 50 },
  entities: (() => {
    const walk = new Set<string>([
      // Sentence + door row
      "1,1",
      "2,1",
      "3,1",
      "4,1",
      "5,1",
      "6,1",
      "7,1",
      "8,1",
      "6,2",
      // Shaft (includes cell under fruit so you can push north)
      "7,2",
      "7,3",
      "7,4",
      "7,5",
      "7,6",
      "6,6",
      // Approach corridor — fruit starts here (down blocked by trees)
      "1,5",
      "2,5",
      "3,5",
      "4,5",
      "5,5",
      "6,5",
    ]);
    const ents: LevelEntitySpec[] = [...perimeter(12, 9)];
    for (let y = 1; y <= 7; y++) {
      for (let x = 1; x <= 10; x++) {
        if (!walk.has(`${x},${y}`)) ents.push(obj("tree", x, y));
      }
    }
    ents.push(
      txt("fruit", 1, 1),
      txt("on", 2, 1),
      txt("door", 3, 1),
      txt("is", 4, 1),
      txt("win", 5, 1),
      obj("door", 7, 1),
      // On corridor: facing down is blocked, so it won't drift until pushed
      obj("fruit", 5, 5),
      obj("baba", 2, 5),
    );
    return ents;
  })(),
};

// ---------------------------------------------------------------------------
// Jungle 2 — Slip: baba is you + slide; narrow lanes; reach EXIT
// ---------------------------------------------------------------------------

export const LEVEL_JUNGLE_2: LevelDocument = {
  id: "level-jungle-2",
  name: "Slip",
  width: 12,
  height: 10,
  globalRules: [
    { subject: "baba", verb: "is", object: "you" },
    { subject: "baba", verb: "is", object: "slide" },
    { subject: "wall", verb: "is", object: "stop" },
    { subject: "rock", verb: "is", object: "stop" },
  ],
  areas: [],
  areaMap: emptyAreaMap(12, 10),
  background: (() => {
    const bg = fill(12, 10, BG.jungle);
    stamp(bg, 12, { x: 2, y: 2, w: 1, h: 3 }, BG.path);
    stamp(bg, 12, { x: 2, y: 4, w: 7, h: 1 }, BG.path);
    stamp(bg, 12, { x: 8, y: 2, w: 1, h: 3 }, BG.dirt);
    return bg;
  })(),
  camera: { mode: "follow", zoom: 50 },
  portals: [exitAt(8, 2)],
  entities: (() => {
    const walk = new Set<string>([
      "2,2",
      "2,3",
      "2,4",
      "3,4",
      "4,4",
      "5,4",
      "6,4",
      "7,4",
      "8,4",
      "8,3",
      "8,2",
      "10,3",
      "10,4",
      "10,5",
      "10,6",
      "10,7",
    ]);
    const ents: LevelEntitySpec[] = [...perimeter(12, 10)];
    for (let y = 1; y <= 8; y++) {
      for (let x = 1; x <= 10; x++) {
        if (!walk.has(`${x},${y}`)) ents.push(obj("wall", x, y));
      }
    }
    ents.push(
      obj("rock", 2, 5),
      obj("rock", 9, 4),
      txt("baba", 10, 3),
      txt("is", 10, 4),
      txt("you", 10, 5),
      txt("and", 10, 6),
      txt("slide", 10, 7),
      obj("baba", 2, 2),
    );
    return ents;
  })(),
};

export const CAMPAIGN_LEVELS: LevelDocument[] = [
  OVERWORLD,
  LEVEL_1,
  LEVEL_2,
  LEVEL_3,
  LEVEL_4,
  LEVEL_SPECIAL,
  LEVEL_JUNGLE_1,
  LEVEL_JUNGLE_2,
];

export const INITIAL_UNLOCKS: string[] = ["overworld", "level-1"];

export type { GlobalRuleSpec, LevelDocument, LevelEntitySpec, AreaDef };
