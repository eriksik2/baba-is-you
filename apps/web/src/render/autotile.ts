import type { AssetAtlas } from "./atlas";

/** Bits: N=1 E=2 S=4 W=8 (same-tile neighbors). */
export const MASK_N = 1;
export const MASK_E = 2;
export const MASK_S = 4;
export const MASK_W = 8;

export interface WorldLike {
  width: number;
  height: number;
  bgAt(pos: { x: number; y: number }): string;
}

/**
 * Calm flat ground colors — no atlas sampling.
 * The pastoral sheet is a busy village/roof set; tiling it as floor reads as noise.
 */
const FILL: Record<string, string> = {
  grass: "#5f7d4a",
  grass2: "#567244",
  path: "#c4a882",
  water: "#3a6f8f",
  dirt: "#8a6e4a",
  stone: "#6e7680",
  flower: "#5f7d4a",
  bush: "#4d6a40",
};

const ACCENT: Record<string, string> = {
  grass: "rgba(255,255,255,0.04)",
  grass2: "rgba(0,0,0,0.05)",
  path: "rgba(255,240,200,0.06)",
  water: "rgba(180,220,255,0.08)",
  dirt: "rgba(40,24,8,0.06)",
  stone: "rgba(255,255,255,0.05)",
  flower: "rgba(255,255,255,0.04)",
  bush: "rgba(0,0,0,0.06)",
};

export function neighborMask(
  worldLike: WorldLike,
  x: number,
  y: number,
  tile: string,
): number {
  let mask = 0;
  if (y > 0 && worldLike.bgAt({ x, y: y - 1 }) === tile) mask |= MASK_N;
  if (x < worldLike.width - 1 && worldLike.bgAt({ x: x + 1, y }) === tile) mask |= MASK_E;
  if (y < worldLike.height - 1 && worldLike.bgAt({ x, y: y + 1 }) === tile) mask |= MASK_S;
  if (x > 0 && worldLike.bgAt({ x: x - 1, y }) === tile) mask |= MASK_W;
  return mask;
}

function hash2(x: number, y: number): number {
  let n = x * 374761393 + y * 668265263;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function edgeShade(
  ctx: CanvasRenderingContext2D,
  mask: number,
  dx: number,
  dy: number,
  s: number,
  dark: string,
  light: string,
): void {
  const t = Math.max(1.25, s * 0.07);
  ctx.save();
  if ((mask & MASK_N) === 0) {
    ctx.fillStyle = light;
    ctx.fillRect(dx, dy, s, t);
  }
  if ((mask & MASK_W) === 0) {
    ctx.fillStyle = light;
    ctx.fillRect(dx, dy, t, s);
  }
  if ((mask & MASK_S) === 0) {
    ctx.fillStyle = dark;
    ctx.fillRect(dx, dy + s - t, s, t);
  }
  if ((mask & MASK_E) === 0) {
    ctx.fillStyle = dark;
    ctx.fillRect(dx + s - t, dy, t, s);
  }
  ctx.restore();
}

function softSpeckle(
  ctx: CanvasRenderingContext2D,
  tile: string,
  dx: number,
  dy: number,
  s: number,
  cellX: number,
  cellY: number,
): void {
  const accent = ACCENT[tile] ?? "rgba(255,255,255,0.04)";
  ctx.fillStyle = accent;
  // A few soft dots — variation without zigzag noise.
  for (let i = 0; i < 3; i++) {
    const u = hash2(cellX * 3 + i, cellY * 5 + i);
    const v = hash2(cellY * 7 + i, cellX * 11 + i);
    const r = s * (0.04 + u * 0.05);
    ctx.beginPath();
    ctx.arc(dx + s * (0.2 + v * 0.6), dy + s * (0.2 + u * 0.6), r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function flowerDots(
  ctx: CanvasRenderingContext2D,
  dx: number,
  dy: number,
  s: number,
  cellX: number,
  cellY: number,
): void {
  const n = 2 + Math.floor(hash2(cellX, cellY) * 2);
  for (let i = 0; i < n; i++) {
    const u = hash2(cellX + i * 17, cellY + i * 13);
    const v = hash2(cellY + i * 9, cellX + i * 23);
    const x = dx + s * (0.25 + u * 0.5);
    const y = dy + s * (0.25 + v * 0.5);
    ctx.fillStyle = i % 2 === 0 ? "#d4a0c0" : "#e8d080";
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1.2, s * 0.06), 0, Math.PI * 2);
    ctx.fill();
  }
}

function bushTuft(ctx: CanvasRenderingContext2D, dx: number, dy: number, s: number): void {
  ctx.fillStyle = "rgba(30, 50, 24, 0.35)";
  ctx.beginPath();
  ctx.ellipse(dx + s * 0.5, dy + s * 0.58, s * 0.28, s * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(70, 110, 55, 0.45)";
  ctx.beginPath();
  ctx.ellipse(dx + s * 0.5, dy + s * 0.48, s * 0.22, s * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
}

function waterShimmer(
  ctx: CanvasRenderingContext2D,
  dx: number,
  dy: number,
  s: number,
  phase: number,
): void {
  const wave = (Math.sin(phase * 1.6 + dx * 0.04 + dy * 0.03) + 1) * 0.5;
  ctx.save();
  ctx.globalAlpha = 0.1 + wave * 0.12;
  ctx.fillStyle = "#c8ecff";
  const h = Math.max(1.5, s * (0.08 + wave * 0.1));
  ctx.fillRect(dx + s * 0.15, dy + s * (0.3 + wave * 0.35), s * 0.7, h);
  ctx.restore();
}

/**
 * Calm procedural ground tile. Atlas is unused for floors (kept in signature
 * for call-site compatibility).
 */
export function drawAutotile(
  ctx: CanvasRenderingContext2D,
  _atlas: AssetAtlas,
  tile: string,
  mask: number,
  dx: number,
  dy: number,
  s: number,
  phase: number,
  cellX = 0,
  cellY = 0,
): void {
  ctx.fillStyle = FILL[tile] ?? "#4a5a4a";
  ctx.fillRect(dx, dy, s, s);

  softSpeckle(ctx, tile, dx, dy, s, cellX, cellY);

  if (tile === "flower") flowerDots(ctx, dx, dy, s, cellX, cellY);
  if (tile === "bush") bushTuft(ctx, dx, dy, s);

  const edgeDark =
    tile === "water"
      ? "rgba(10, 40, 70, 0.28)"
      : tile === "path" || tile === "dirt"
        ? "rgba(60, 40, 16, 0.2)"
        : "rgba(20, 36, 14, 0.18)";
  const edgeLight =
    tile === "water"
      ? "rgba(180, 220, 255, 0.16)"
      : tile === "path" || tile === "dirt"
        ? "rgba(255, 236, 200, 0.14)"
        : "rgba(210, 230, 180, 0.12)";

  edgeShade(ctx, mask, dx, dy, s, edgeDark, edgeLight);

  if (tile === "water") {
    waterShimmer(ctx, dx, dy, s, phase);
  }
}
