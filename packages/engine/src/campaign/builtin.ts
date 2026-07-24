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
// L2 — Shove: walk the north deck, push rock into the south pocket, then EXIT.
// No walk-around gap (old bug); pushing rock east softlocks against the exit.
// ---------------------------------------------------------------------------

export const LEVEL_2: LevelDocument = {
  id: "level-2",
  name: "Shove",
  width: 12,
  height: 8,
  globalRules: [
    { subject: "baba", verb: "is", object: "you" },
    { subject: "wall", verb: "is", object: "stop" },
    { subject: "rock", verb: "is", object: "push" },
  ],
  areas: [],
  areaMap: emptyAreaMap(12, 8),
  background: (() => {
    const bg = fill(12, 8, BG.grass);
    stamp(bg, 12, { x: 1, y: 1, w: 5, h: 1 }, BG.path);
    stamp(bg, 12, { x: 1, y: 2, w: 10, h: 1 }, BG.path);
    stamp(bg, 12, { x: 5, y: 3, w: 1, h: 2 }, BG.dirt);
    return bg;
  })(),
  camera: { mode: "follow", zoom: 52 },
  portals: [exitAt(10, 2)],
  entities: [
    ...perimeter(12, 8),
    txt("rock", 1, 6),
    txt("is", 2, 6),
    txt("push", 3, 6),
    ...wallRect(6, 1, 10, 1),
    obj("baba", 1, 2),
    obj("rock", 5, 2),
    ...wallRect(1, 3, 4, 3),
    ...wallRect(6, 3, 10, 3),
    ...wallRect(1, 4, 4, 4),
    ...wallRect(6, 4, 10, 4),
    ...wallRect(1, 5, 10, 5),
  ],
};

// ---------------------------------------------------------------------------
// L3 — Come Along: rock sits on EXIT (PULL blocks entry). Pull it east, then
// loop back through the south hall onto the cleared exit cell.
// ---------------------------------------------------------------------------

export const LEVEL_3: LevelDocument = {
  id: "level-3",
  name: "Come Along",
  width: 12,
  height: 9,
  globalRules: [
    { subject: "baba", verb: "is", object: "you" },
    { subject: "wall", verb: "is", object: "stop" },
    { subject: "rock", verb: "is", object: "pull" },
  ],
  areas: [],
  areaMap: emptyAreaMap(12, 9),
  background: (() => {
    const bg = fill(12, 9, BG.grass);
    stamp(bg, 12, { x: 1, y: 1, w: 1, h: 5 }, BG.path);
    stamp(bg, 12, { x: 4, y: 3, w: 7, h: 1 }, BG.dirt);
    stamp(bg, 12, { x: 1, y: 5, w: 10, h: 1 }, BG.path);
    return bg;
  })(),
  camera: { mode: "follow", zoom: 52 },
  portals: [exitAt(4, 3)],
  entities: [
    ...perimeter(12, 9),
    obj("baba", 1, 1),
    ...wallRect(2, 2, 3, 2),
    ...wallRect(5, 2, 10, 2),
    obj("wall", 2, 3),
    obj("wall", 3, 3),
    obj("rock", 4, 3),
    obj("wall", 2, 4),
    obj("wall", 3, 4),
    ...wallRect(2, 7, 10, 7),
    txt("rock", 6, 6),
    txt("is", 7, 6),
    txt("pull", 8, 6),
  ],
};

// ---------------------------------------------------------------------------
// L4 — Two Ways: PUSH a rock aside (deck → pocket), reach the lower hall,
// then PULL fruit off the EXIT niche and loop back onto it.
// ---------------------------------------------------------------------------

export const LEVEL_4: LevelDocument = {
  id: "level-4",
  name: "Two Ways",
  width: 14,
  height: 10,
  globalRules: [
    { subject: "baba", verb: "is", object: "you" },
    { subject: "wall", verb: "is", object: "stop" },
    { subject: "rock", verb: "is", object: "push" },
    { subject: "fruit", verb: "is", object: "pull" },
  ],
  areas: [],
  areaMap: emptyAreaMap(14, 10),
  background: (() => {
    const bg = fill(14, 10, BG.grass);
    stamp(bg, 14, { x: 1, y: 1, w: 5, h: 2 }, BG.path);
    stamp(bg, 14, { x: 10, y: 2, w: 3, h: 5 }, BG.dirt);
    stamp(bg, 14, { x: 5, y: 3, w: 1, h: 1 }, BG.stone);
    return bg;
  })(),
  camera: { mode: "follow", zoom: 48 },
  portals: [exitAt(11, 5)],
  entities: [
    ...perimeter(14, 10),
    txt("rock", 1, 8),
    txt("is", 2, 8),
    txt("push", 3, 8),
    txt("fruit", 5, 8),
    txt("is", 6, 8),
    txt("pull", 7, 8),
    ...wallRect(6, 1, 12, 1),
    obj("baba", 1, 2),
    obj("rock", 5, 2),
    ...wallRect(1, 3, 4, 3),
    ...wallRect(6, 3, 9, 3),
    ...wallRect(1, 4, 9, 4),
    obj("wall", 11, 4),
    obj("wall", 12, 4),
    obj("fruit", 11, 5),
    obj("wall", 12, 5),
    ...wallRect(1, 6, 8, 6),
    ...wallRect(1, 7, 12, 7),
  ],
};

// ---------------------------------------------------------------------------
// Special — two gated rocks (wall between) then PULL fruit off EXIT.
// ---------------------------------------------------------------------------

export const LEVEL_SPECIAL: LevelDocument = {
  id: "level-special",
  name: "Tug of Rules",
  width: 14,
  height: 11,
  globalRules: [
    { subject: "baba", verb: "is", object: "you" },
    { subject: "wall", verb: "is", object: "stop" },
    { subject: "rock", verb: "is", object: "push" },
    { subject: "fruit", verb: "is", object: "pull" },
  ],
  areas: [],
  areaMap: emptyAreaMap(14, 11),
  background: (() => {
    const bg = fill(14, 11, BG.grass2);
    stamp(bg, 14, { x: 1, y: 1, w: 6, h: 2 }, BG.path);
    stamp(bg, 14, { x: 10, y: 3, w: 3, h: 5 }, BG.dirt);
    return bg;
  })(),
  camera: { mode: "follow", zoom: 48 },
  portals: [exitAt(11, 6)],
  entities: [
    ...perimeter(14, 11),
    ...wallRect(7, 1, 12, 1),
    obj("baba", 1, 2),
    obj("rock", 3, 2),
    obj("wall", 4, 2),
    obj("rock", 6, 2),
    ...wallRect(1, 3, 2, 3),
    obj("wall", 4, 3),
    obj("wall", 5, 3),
    ...wallRect(7, 3, 9, 3),
    ...wallRect(1, 4, 9, 4),
    obj("wall", 11, 5),
    obj("wall", 12, 5),
    obj("fruit", 11, 6),
    obj("wall", 12, 6),
    ...wallRect(1, 7, 8, 7),
    ...wallRect(1, 8, 12, 8),
    txt("rock", 1, 9),
    txt("is", 2, 9),
    txt("push", 3, 9),
    txt("fruit", 5, 9),
    txt("is", 6, 9),
    txt("pull", 7, 9),
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

// ---------------------------------------------------------------------------
// Dev World — sandbox for testing properties & combinations (editable globals)
// ---------------------------------------------------------------------------

const DEV_W = 32;
const DEV_H = 16;

export const DEV_WORLD: LevelDocument = {
  id: "dev-world",
  name: "Dev World",
  width: DEV_W,
  height: DEV_H,
  chunkSize: DEFAULT_CHUNK_SIZE,
  globalRules: [
    { subject: "baba", verb: "is", object: "you", words: ["baba", "is", "you"] },
    { subject: "wall", verb: "is", object: "stop", words: ["wall", "is", "stop"] },
    { subject: "tree", verb: "is", object: "stop", words: ["tree", "is", "stop"] },
  ],
  areas: [
    { id: 1, name: "Hub", color: "rgba(80,160,200,0.25)" },
    { id: 2, name: "Sticky+Push", color: "rgba(200,140,60,0.25)" },
    { id: 3, name: "Sticky+Pull", color: "rgba(160,100,200,0.25)" },
    { id: 4, name: "Sticky+Slide", color: "rgba(60,180,120,0.25)" },
    { id: 5, name: "AND / ON", color: "rgba(220,80,120,0.25)" },
    { id: 6, name: "Win lab", color: "rgba(220,200,60,0.25)" },
  ],
  areaMap: (() => {
    const am = emptyAreaMap(DEV_W, DEV_H);
    stampArea(am, DEV_W, { x: 1, y: 1, w: 8, h: 6 }, 1);
    stampArea(am, DEV_W, { x: 11, y: 1, w: 9, h: 6 }, 2);
    stampArea(am, DEV_W, { x: 22, y: 1, w: 9, h: 6 }, 3);
    stampArea(am, DEV_W, { x: 1, y: 9, w: 10, h: 6 }, 4);
    stampArea(am, DEV_W, { x: 13, y: 9, w: 9, h: 6 }, 5);
    stampArea(am, DEV_W, { x: 24, y: 9, w: 7, h: 6 }, 6);
    return am;
  })(),
  background: (() => {
    const bg = fill(DEV_W, DEV_H, BG.grass);
    stamp(bg, DEV_W, { x: 1, y: 1, w: 8, h: 6 }, BG.path);
    stamp(bg, DEV_W, { x: 11, y: 1, w: 9, h: 6 }, BG.dirt);
    stamp(bg, DEV_W, { x: 22, y: 1, w: 9, h: 6 }, BG.stone);
    stamp(bg, DEV_W, { x: 1, y: 9, w: 10, h: 6 }, BG.jungle);
    stamp(bg, DEV_W, { x: 13, y: 9, w: 9, h: 6 }, BG.flower);
    stamp(bg, DEV_W, { x: 24, y: 9, w: 7, h: 6 }, BG.grass2);
    // corridors between rooms
    stamp(bg, DEV_W, { x: 9, y: 3, w: 2, h: 1 }, BG.path);
    stamp(bg, DEV_W, { x: 20, y: 3, w: 2, h: 1 }, BG.path);
    stamp(bg, DEV_W, { x: 4, y: 7, w: 1, h: 2 }, BG.path);
    stamp(bg, DEV_W, { x: 16, y: 7, w: 1, h: 2 }, BG.path);
    stamp(bg, DEV_W, { x: 26, y: 7, w: 1, h: 2 }, BG.path);
    return bg;
  })(),
  camera: { mode: "follow", zoom: 44 },
  spawn: { x: 3, y: 4 },
  entities: (() => {
    const ents: LevelEntitySpec[] = [...perimeter(DEV_W, DEV_H)];
    // Room dividers with doorways
    for (let y = 1; y <= 6; y++) {
      if (y === 3) continue;
      ents.push(obj("wall", 10, y));
      ents.push(obj("wall", 21, y));
    }
    for (let y = 9; y <= 14; y++) {
      if (y === 11) continue;
      ents.push(obj("wall", 12, y));
      ents.push(obj("wall", 23, y));
    }
    for (let x = 1; x <= 30; x++) {
      if (x === 4 || x === 16 || x === 26) continue;
      ents.push(obj("wall", x, 8));
    }

    // Hub
    ents.push(obj("baba", 3, 4));
    ents.push(txt("baba", 2, 1), txt("is", 3, 1), txt("you", 4, 1));

    // Sticky + Push lab — set rock sticky via board; fruit push
    ents.push(
      txt("rock", 12, 1),
      txt("is", 13, 1),
      txt("sticky", 14, 1),
      txt("fruit", 12, 2),
      txt("is", 13, 2),
      txt("push", 14, 2),
      obj("rock", 15, 4),
      obj("fruit", 13, 4),
      obj("rock", 17, 5),
    );

    // Sticky + Pull lab
    ents.push(
      txt("rock", 23, 1),
      txt("is", 24, 1),
      txt("sticky", 25, 1),
      txt("and", 26, 1),
      txt("pull", 27, 1),
      obj("rock", 25, 4),
      obj("rock", 27, 4),
    );

    // Sticky + Slide lab
    ents.push(
      txt("fruit", 2, 9),
      txt("is", 3, 9),
      txt("slide", 4, 9),
      txt("and", 5, 9),
      txt("push", 6, 9),
      txt("rock", 2, 10),
      txt("is", 3, 10),
      txt("sticky", 4, 10),
      obj("fruit", 3, 12),
      obj("rock", 5, 12),
      obj("rock", 6, 11),
      obj("wall", 10, 12),
    );

    // AND / ON showcase (board sentences; win via fruit on door)
    ents.push(
      txt("fruit", 14, 9),
      txt("on", 15, 9),
      txt("door", 16, 9),
      txt("is", 17, 9),
      txt("win", 18, 9),
      txt("fruit", 14, 10),
      txt("is", 15, 10),
      txt("push", 16, 10),
      obj("fruit", 15, 12),
      obj("door", 18, 12),
      obj("tree", 20, 11),
      obj("tree", 20, 12),
      obj("tree", 20, 13),
    );

    // Win / word lab
    ents.push(
      txt("door", 25, 9),
      txt("is", 26, 9),
      txt("win", 27, 9),
      txt("word", 25, 10),
      txt("is", 26, 10),
      txt("push", 27, 10),
      obj("door", 27, 12),
      obj("rock", 25, 12),
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
  DEV_WORLD,
];

export const INITIAL_UNLOCKS: string[] = ["overworld", "level-1", "dev-world"];

export type { GlobalRuleSpec, LevelDocument, LevelEntitySpec, AreaDef };
