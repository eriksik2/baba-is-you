/** Pastoral tileset + LPC sheep walk atlas for the canvas renderer. */

export const CREDITS =
  "Tiles: pastoral tileset by pebonius (CC0). Sheep: LPC sheep walk by Daniel Eddeland (CC-BY).";

const PASTORAL_SRC = "/assets/tiles/pastoral.png";
const SHEEP_SRC = "/assets/sprites/sheep_walk.png";

/** Pastoral sheet: 192×256, 32×32 cells, 6 cols × 8 rows. */
export const PASTORAL_CELL = 32;
export const PASTORAL_COLS = 6;
export const PASTORAL_ROWS = 8;

/**
 * LPC sheep walk sheet (512×512): 4 direction rows × 4 walk frames, 128×128 each.
 * Rows: up, right, down, left.
 */
export const SHEEP_FRAME = 128;
export const SHEEP_COLS = 4;
export const SHEEP_ROWS = 4;

export type SheepDir = "up" | "down" | "left" | "right";

const SHEEP_ROW: Record<SheepDir, number> = {
  up: 0,
  right: 1,
  down: 2,
  left: 3,
};

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export class AssetAtlas {
  ready: Promise<void>;
  pastoral: HTMLImageElement | null = null;
  sheep: HTMLImageElement | null = null;

  constructor() {
    this.ready = this.load();
  }

  private async load(): Promise<void> {
    const [pastoral, sheep] = await Promise.all([
      loadImage(PASTORAL_SRC),
      loadImage(SHEEP_SRC),
    ]);
    this.pastoral = pastoral;
    this.sheep = sheep;
  }

  /** Draw pastoral cell (col,row) into ctx at dx,dy sized s×s. */
  drawPastoral(
    ctx: CanvasRenderingContext2D,
    col: number,
    row: number,
    dx: number,
    dy: number,
    s: number,
  ): void {
    const img = this.pastoral;
    if (!img || !img.complete || img.naturalWidth === 0) return;
    if (col < 0 || row < 0 || col >= PASTORAL_COLS || row >= PASTORAL_ROWS) return;
    const sx = col * PASTORAL_CELL;
    const sy = row * PASTORAL_CELL;
    ctx.drawImage(img, sx, sy, PASTORAL_CELL, PASTORAL_CELL, dx, dy, s, s);
  }

  /** Draw sheep walk frame facing dir into a cell. */
  drawSheep(
    ctx: CanvasRenderingContext2D,
    dx: number,
    dy: number,
    s: number,
    dir: SheepDir,
    frame: number,
  ): void {
    const img = this.sheep;
    if (!img || !img.complete || img.naturalWidth === 0) return;
    const col = ((frame % SHEEP_COLS) + SHEEP_COLS) % SHEEP_COLS;
    const row = SHEEP_ROW[dir] ?? 2;
    const sx = col * SHEEP_FRAME;
    const sy = row * SHEEP_FRAME;
    // Slight inset so the 128px art fills the play cell cleanly.
    const pad = s * 0.05;
    ctx.drawImage(
      img,
      sx,
      sy,
      SHEEP_FRAME,
      SHEEP_FRAME,
      dx + pad,
      dy + pad,
      s - pad * 2,
      s - pad * 2,
    );
  }
}

export const atlas = new AssetAtlas();
