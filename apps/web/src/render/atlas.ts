/** Pastoral tileset + LPC sheep + Edaz jungle autotile + object sprites. */

export const CREDITS =
  "Jungle tiles: Edaz 16×16 dense jungle (CC-BY-SA 4.0). Tiny RPG Forest: ansimuz (public domain). Sheep: LPC sheep walk by Daniel Eddeland (CC-BY). Pastoral: pebonius (CC0).";

const BASE = import.meta.env.BASE_URL || "/";
const PASTORAL_SRC = `${BASE}assets/tiles/pastoral.png`;
const JUNGLE_AUTOTILE_SRC = `${BASE}assets/tiles/jungle_autotile.png`;
const JUNGLE_GRASS_SRC = `${BASE}assets/tiles/jungle_grass.png`;
const SHEEP_SRC = `${BASE}assets/sprites/sheep_walk.png`;
const TREE_SRC = `${BASE}assets/sprites/tree.png`;
const FRUIT_SRC = `${BASE}assets/sprites/fruit.png`;
const DOOR_SRC = `${BASE}assets/sprites/door.png`;

/** Pastoral sheet: 192×256, 32×32 cells, 6 cols × 8 rows. */
export const PASTORAL_CELL = 32;
export const PASTORAL_COLS = 6;
export const PASTORAL_ROWS = 8;

/** Edaz jungle autotile: 112×48, 16×16 cells, 7 cols × 3 rows. */
export const JUNGLE_CELL = 16;
export const JUNGLE_COLS = 7;
export const JUNGLE_ROWS = 3;

/**
 * LPC sheep walk sheet (512×512): 4 direction rows × 4 walk frames, 128×128 each.
 * Rows: up, left, down, right.
 */
export const SHEEP_FRAME = 128;
export const SHEEP_COLS = 4;
export const SHEEP_ROWS = 4;

/** Tight crop covering all walk frames (opaque content ~27×41–49×39). */
const SHEEP_CROP = { x: 36, y: 38, w: 56, h: 52 };

export type SheepDir = "up" | "down" | "left" | "right";

const SHEEP_ROW: Record<SheepDir, number> = {
  up: 0,
  left: 1,
  down: 2,
  right: 3,
};

export type ObjectSprite = "tree" | "fruit" | "door";

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
  jungleAutotile: HTMLImageElement | null = null;
  jungleGrass: HTMLImageElement | null = null;
  sheep: HTMLImageElement | null = null;
  tree: HTMLImageElement | null = null;
  fruit: HTMLImageElement | null = null;
  door: HTMLImageElement | null = null;

  constructor() {
    this.ready = this.load();
  }

  private async load(): Promise<void> {
    const [pastoral, jungleAutotile, jungleGrass, sheep, tree, fruit, door] = await Promise.all([
      loadImage(PASTORAL_SRC),
      loadImage(JUNGLE_AUTOTILE_SRC),
      loadImage(JUNGLE_GRASS_SRC),
      loadImage(SHEEP_SRC),
      loadImage(TREE_SRC),
      loadImage(FRUIT_SRC),
      loadImage(DOOR_SRC),
    ]);
    this.pastoral = pastoral;
    this.jungleAutotile = jungleAutotile;
    this.jungleGrass = jungleGrass;
    this.sheep = sheep;
    this.tree = tree;
    this.fruit = fruit;
    this.door = door;
  }

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

  drawJungleAutotile(
    ctx: CanvasRenderingContext2D,
    col: number,
    row: number,
    dx: number,
    dy: number,
    s: number,
  ): void {
    const img = this.jungleAutotile;
    if (!img || !img.complete || img.naturalWidth === 0) return;
    if (col < 0 || row < 0 || col >= JUNGLE_COLS || row >= JUNGLE_ROWS) return;
    const sx = col * JUNGLE_CELL;
    const sy = row * JUNGLE_CELL;
    ctx.drawImage(img, sx, sy, JUNGLE_CELL, JUNGLE_CELL, dx, dy, s, s);
  }

  drawJungleGrass(ctx: CanvasRenderingContext2D, dx: number, dy: number, s: number): void {
    const img = this.jungleGrass;
    if (!img || !img.complete || img.naturalWidth === 0) return;
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, dx, dy, s, s);
  }

  /**
   * Draw sheep cropped to its opaque body and scaled to nearly fill the cell,
   * centered (slightly low so feet sit on the tile).
   */
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
    const sx = col * SHEEP_FRAME + SHEEP_CROP.x;
    const sy = row * SHEEP_FRAME + SHEEP_CROP.y;

    const dest = s * 1.05;
    const ox = dx + (s - dest) / 2;
    const oy = dy + (s - dest) / 2 + s * 0.02;

    // Soft ground shadow for contrast on grass.
    ctx.save();
    ctx.fillStyle = "rgba(20, 28, 18, 0.28)";
    ctx.beginPath();
    ctx.ellipse(dx + s / 2, dy + s * 0.82, s * 0.28, s * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.drawImage(img, sx, sy, SHEEP_CROP.w, SHEEP_CROP.h, ox, oy, dest, dest);
  }

  /** Draw a full object sprite (tree / fruit / door), scaled to the cell. */
  drawSprite(
    ctx: CanvasRenderingContext2D,
    kind: ObjectSprite,
    dx: number,
    dy: number,
    s: number,
  ): boolean {
    const img = this[kind];
    if (!img || !img.complete || img.naturalWidth === 0) return false;

    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    // Fit inside the cell, preserve aspect; tree sits slightly low.
    const pad = kind === "fruit" ? 0.18 : kind === "door" ? 0.06 : 0.04;
    const maxW = s * (1 - pad * 2);
    const maxH = s * (1 - pad * 2);
    const scale = Math.min(maxW / iw, maxH / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const ox = dx + (s - dw) / 2;
    const oy =
      kind === "tree"
        ? dy + s - dh - s * 0.02
        : dy + (s - dh) / 2;

    if (kind === "tree" || kind === "door") {
      ctx.save();
      ctx.fillStyle = "rgba(20, 28, 18, 0.22)";
      ctx.beginPath();
      ctx.ellipse(dx + s / 2, dy + s * 0.88, s * 0.22, s * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.drawImage(img, 0, 0, iw, ih, ox, oy, dw, dh);
    return true;
  }
}

export const atlas = new AssetAtlas();
