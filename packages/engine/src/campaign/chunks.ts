import type { LevelChunk, LevelDocument, LevelEntitySpec } from "./types";
import { DEFAULT_CHUNK_SIZE } from "./types";

export { DEFAULT_CHUNK_SIZE };

const DEFAULT_BG = "grass";

export function fill(w: number, h: number, tile: string): string[] {
  return Array.from({ length: w * h }, () => tile);
}

export function chunkKey(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

export function worldToChunk(
  x: number,
  y: number,
  chunkSize: number,
): { cx: number; cy: number; lx: number; ly: number } {
  const cx = x >= 0 ? Math.floor(x / chunkSize) : -Math.ceil(-x / chunkSize);
  const cy = y >= 0 ? Math.floor(y / chunkSize) : -Math.ceil(-y / chunkSize);
  return {
    cx,
    cy,
    lx: x - cx * chunkSize,
    ly: y - cy * chunkSize,
  };
}

export function emptyChunk(cx: number, cy: number, chunkSize: number, tile = DEFAULT_BG): LevelChunk {
  const n = chunkSize * chunkSize;
  return {
    cx,
    cy,
    background: Array.from({ length: n }, () => tile),
    areaMap: Array.from({ length: n }, () => 0),
  };
}

export interface DenseBounds {
  originX: number;
  originY: number;
  width: number;
  height: number;
  background: string[];
  areaMap: number[];
}

/** Flatten chunks → dense rectangle covering all present chunks (plus optional padChunks). */
export function flattenChunks(
  doc: Pick<LevelDocument, "chunkSize" | "chunks">,
  padChunks = 0,
): DenseBounds {
  const cs = doc.chunkSize || DEFAULT_CHUNK_SIZE;
  const chunks = doc.chunks ?? [];
  if (!chunks.length) {
    const w = cs;
    const h = cs;
    return {
      originX: 0,
      originY: 0,
      width: w,
      height: h,
      background: fill(w, h, DEFAULT_BG),
      areaMap: Array.from({ length: w * h }, () => 0),
    };
  }

  let minCx = Infinity;
  let minCy = Infinity;
  let maxCx = -Infinity;
  let maxCy = -Infinity;
  for (const c of chunks) {
    minCx = Math.min(minCx, c.cx);
    minCy = Math.min(minCy, c.cy);
    maxCx = Math.max(maxCx, c.cx);
    maxCy = Math.max(maxCy, c.cy);
  }
  minCx -= padChunks;
  minCy -= padChunks;
  maxCx += padChunks;
  maxCy += padChunks;

  const width = (maxCx - minCx + 1) * cs;
  const height = (maxCy - minCy + 1) * cs;
  const originX = minCx * cs;
  const originY = minCy * cs;
  const background = fill(width, height, DEFAULT_BG);
  const areaMap = Array.from({ length: width * height }, () => 0);

  const byKey = new Map(chunks.map((c) => [chunkKey(c.cx, c.cy), c]));

  for (let cy = minCy; cy <= maxCy; cy++) {
    for (let cx = minCx; cx <= maxCx; cx++) {
      const chunk = byKey.get(chunkKey(cx, cy)) ?? emptyChunk(cx, cy, cs);
      for (let ly = 0; ly < cs; ly++) {
        for (let lx = 0; lx < cs; lx++) {
          const wx = (cx - minCx) * cs + lx;
          const wy = (cy - minCy) * cs + ly;
          const i = wy * width + wx;
          const li = ly * cs + lx;
          background[i] = chunk.background[li] ?? DEFAULT_BG;
          areaMap[i] = chunk.areaMap[li] ?? 0;
        }
      }
    }
  }

  return { originX, originY, width, height, background, areaMap };
}

/** Convert a legacy dense LevelDocument (width/height arrays) into chunks. */
export function migrateDenseToChunks(doc: LevelDocument): LevelDocument {
  if (doc.chunks && doc.chunks.length > 0) {
    return {
      ...doc,
      chunkSize: doc.chunkSize ?? DEFAULT_CHUNK_SIZE,
      chunks: doc.chunks,
    };
  }
  const w = doc.width ?? 16;
  const h = doc.height ?? 12;
  const bg = doc.background ?? fill(w, h, DEFAULT_BG);
  const areas = doc.areaMap ?? Array.from({ length: w * h }, () => 0);
  const cs = DEFAULT_CHUNK_SIZE;
  const chunks: LevelChunk[] = [];
  const maxCx = Math.ceil(w / cs);
  const maxCy = Math.ceil(h / cs);
  for (let cy = 0; cy < maxCy; cy++) {
    for (let cx = 0; cx < maxCx; cx++) {
      const chunk = emptyChunk(cx, cy, cs);
      let used = false;
      for (let ly = 0; ly < cs; ly++) {
        for (let lx = 0; lx < cs; lx++) {
          const x = cx * cs + lx;
          const y = cy * cs + ly;
          if (x >= w || y >= h) continue;
          const i = y * w + x;
          chunk.background[ly * cs + lx] = bg[i] ?? DEFAULT_BG;
          chunk.areaMap[ly * cs + lx] = areas[i] ?? 0;
          used = true;
        }
      }
      if (used) chunks.push(chunk);
    }
  }
  const { width: _w, height: _h, background: _b, areaMap: _a, ...rest } = doc;
  return {
    ...rest,
    chunkSize: cs,
    chunks,
  };
}

/** Write a world cell into the chunk map (creates chunk if needed). */
export function setChunkCell(
  doc: LevelDocument,
  x: number,
  y: number,
  patch: { background?: string; areaId?: number },
): void {
  const cs = doc.chunkSize || DEFAULT_CHUNK_SIZE;
  doc.chunkSize = cs;
  if (!doc.chunks) doc.chunks = [];
  const { cx, cy, lx, ly } = worldToChunk(x, y, cs);
  let chunk = doc.chunks.find((c) => c.cx === cx && c.cy === cy);
  if (!chunk) {
    chunk = emptyChunk(cx, cy, cs);
    doc.chunks.push(chunk);
  }
  const i = ly * cs + lx;
  if (patch.background !== undefined) chunk.background[i] = patch.background;
  if (patch.areaId !== undefined) chunk.areaMap[i] = patch.areaId;
}

export function getChunkBg(doc: LevelDocument, x: number, y: number): string {
  const cs = doc.chunkSize || DEFAULT_CHUNK_SIZE;
  const { cx, cy, lx, ly } = worldToChunk(x, y, cs);
  const chunk = doc.chunks?.find((c) => c.cx === cx && c.cy === cy);
  if (!chunk) return DEFAULT_BG;
  return chunk.background[ly * cs + lx] ?? DEFAULT_BG;
}

export function shiftEntitiesToOrigin(
  entities: LevelEntitySpec[],
  originX: number,
  originY: number,
): LevelEntitySpec[] {
  return entities.map((e) => ({
    ...e,
    x: e.x - originX,
    y: e.y - originY,
  }));
}
