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

/** Pastoral sample cells (col, row) for base fills / overlays. */
const TILE_BASE: Record<string, { col: number; row: number }> = {
  grass: { col: 4, row: 0 },
  grass2: { col: 4, row: 0 },
  path: { col: 2, row: 2 },
  water: { col: 3, row: 0 },
  dirt: { col: 1, row: 4 },
  stone: { col: 5, row: 5 },
  flower: { col: 4, row: 0 },
  bush: { col: 4, row: 0 },
};

const TILE_OVERLAY: Record<string, { col: number; row: number }> = {
  flower: { col: 0, row: 7 },
  bush: { col: 2, row: 7 },
};

/** Fallback flat colors when the atlas image is missing. */
const FALLBACK: Record<string, string> = {
  grass: "#6a8f4e",
  grass2: "#5f8446",
  path: "#c4a574",
  water: "#3d7ea6",
  dirt: "#8b6b45",
  stone: "#7a8490",
  flower: "#6a8f4e",
  bush: "#6a8f4e",
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

function drawFallback(
  ctx: CanvasRenderingContext2D,
  tile: string,
  dx: number,
  dy: number,
  s: number,
): void {
  ctx.fillStyle = FALLBACK[tile] ?? "#4a5a4a";
  ctx.fillRect(dx, dy, s, s);
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
  const t = Math.max(1.5, s * 0.1);
  ctx.save();
  // Missing neighbor → draw an inset edge so blobs look connected / carved.
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

function waterShimmer(
  ctx: CanvasRenderingContext2D,
  dx: number,
  dy: number,
  s: number,
  phase: number,
): void {
  const wave = (Math.sin(phase * 2.2 + dx * 0.05 + dy * 0.03) + 1) * 0.5;
  const band = (Math.sin(phase * 1.4 + dy * 0.08 - dx * 0.04) + 1) * 0.5;
  ctx.save();
  ctx.globalAlpha = 0.12 + wave * 0.18;
  ctx.fillStyle = "#c8ecff";
  const h = Math.max(2, s * (0.12 + band * 0.18));
  const y = dy + s * (0.2 + wave * 0.45);
  ctx.fillRect(dx + s * 0.1, y, s * 0.8, h);
  ctx.globalAlpha = 0.08 + band * 0.1;
  ctx.fillStyle = "#1a4060";
  ctx.fillRect(dx + s * 0.15, dy + s * (0.55 + wave * 0.2), s * 0.7, Math.max(1.5, s * 0.08));
  ctx.restore();
}

/**
 * Draw a background autotile: sample pastoral base, optional overlay,
 * procedural neighbor edges, and water shimmer from `phase`.
 */
export function drawAutotile(
  ctx: CanvasRenderingContext2D,
  atlas: AssetAtlas,
  tile: string,
  mask: number,
  dx: number,
  dy: number,
  s: number,
  phase: number,
): void {
  // Always paint a solid underlay — pastoral cells often sit on transparency.
  drawFallback(ctx, tile, dx, dy, s);

  const base = TILE_BASE[tile] ?? TILE_BASE.grass!;
  const hasAtlas = atlas.pastoral !== null && atlas.pastoral.complete && atlas.pastoral.naturalWidth > 0;

  if (hasAtlas) {
    atlas.drawPastoral(ctx, base.col, base.row, dx, dy, s);
    if (tile === "grass2") {
      ctx.fillStyle = "rgba(40, 70, 20, 0.18)";
      ctx.fillRect(dx, dy, s, s);
    }
  }

  const overlay = TILE_OVERLAY[tile];
  if (overlay && hasAtlas) {
    const inset = s * 0.08;
    atlas.drawPastoral(ctx, overlay.col, overlay.row, dx + inset, dy + inset, s - inset * 2);
  } else if (overlay && !hasAtlas) {
    ctx.fillStyle = tile === "flower" ? "#c45a9a" : "#3d6b35";
    ctx.beginPath();
    ctx.ellipse(dx + s / 2, dy + s / 2, s * 0.22, s * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const edgeDark =
    tile === "water"
      ? "rgba(10, 40, 70, 0.35)"
      : tile === "path" || tile === "dirt"
        ? "rgba(80, 50, 20, 0.28)"
        : "rgba(20, 40, 15, 0.25)";
  const edgeLight =
    tile === "water"
      ? "rgba(180, 220, 255, 0.22)"
      : tile === "path" || tile === "dirt"
        ? "rgba(255, 230, 180, 0.22)"
        : "rgba(200, 230, 160, 0.2)";

  edgeShade(ctx, mask, dx, dy, s, edgeDark, edgeLight);

  if (tile === "water") {
    waterShimmer(ctx, dx, dy, s, phase);
  }
}
