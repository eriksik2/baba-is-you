import type { EntityRecord, World } from "@baba/engine";

const PALETTE: Record<string, string> = {
  baba: "#f4f0ea",
  keke: "#e8785a",
  wall: "#5a6a7e",
  rock: "#c4a574",
  flag: "#f0c75e",
  water: "#3d7ea6",
  lava: "#e85d3a",
  skull: "#d0d5dd",
  grass: "#6a9a5a",
  tile: "#3a4a5e",
  text: "#ffffff",
  "text-noun": "#6ec6ff",
  "text-property": "#ff7eb6",
  "text-operator": "#f5f5f5",
};

export interface RenderOptions {
  cellSize?: number;
  padding?: number;
}

/**
 * Canvas renderer — intentionally dumb.
 * All game logic lives in @baba/engine; this only paints.
 */
export class CanvasRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private cellSize: number;
  private padding: number;
  private dpr = 1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    options: RenderOptions = {},
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
    this.cellSize = options.cellSize ?? 48;
    this.padding = options.padding ?? 16;
  }

  /**
   * Size the board to fit inside the given CSS pixel box (and device DPR).
   * Returns the chosen cell size for diagnostics / swipe thresholds.
   */
  fit(world: World, maxCssWidth: number, maxCssHeight: number): number {
    const cols = world.width;
    const rows = world.height;
    const pad = Math.max(8, Math.min(20, Math.floor(Math.min(maxCssWidth, maxCssHeight) * 0.03)));

    const cellW = (maxCssWidth - pad * 2) / cols;
    const cellH = (maxCssHeight - pad * 2) / rows;
    const cell = Math.max(18, Math.floor(Math.min(cellW, cellH, 64)));

    this.cellSize = cell;
    this.padding = pad;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);

    const cssW = cols * cell + pad * 2;
    const cssH = rows * cell + pad * 2;

    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    return cell;
  }

  draw(world: World): void {
    const { ctx, cellSize: cs, padding: pad } = this;
    const cssW = world.width * cs + pad * 2;
    const cssH = world.height * cs + pad * 2;

    ctx.clearRect(0, 0, cssW, cssH);

    ctx.fillStyle = "#1c2738";
    ctx.fillRect(pad - 3, pad - 3, world.width * cs + 6, world.height * cs + 6);

    for (const pos of world.grid.positions()) {
      const x = pad + pos.x * cs;
      const y = pad + pos.y * cs;
      ctx.fillStyle = (pos.x + pos.y) % 2 === 0 ? "#243044" : "#203040";
      ctx.fillRect(x, y, cs, cs);
    }

    const entities = world.entities.all().sort((a, b) => {
      if (a.position.y !== b.position.y) return a.position.y - b.position.y;
      if (a.position.x !== b.position.x) return a.position.x - b.position.x;
      return a.layer - b.layer;
    });

    for (const e of entities) {
      this.drawEntity(world, e, pad, cs);
    }
  }

  private drawEntity(world: World, e: EntityRecord, pad: number, cs: number): void {
    const ctx = this.ctx;
    const x = pad + e.position.x * cs;
    const y = pad + e.position.y * cs;
    const inset = Math.max(2, cs * 0.08);
    const eye = Math.max(1.5, cs * 0.05);

    if (e.kind === "text") {
      const td = world.textData.get(e.id);
      const word = td ? world.lexicon.getWord(td.wordId) : undefined;
      const color = PALETTE[word?.palette ?? "text-operator"] ?? "#fff";
      ctx.fillStyle = color;
      roundRect(ctx, x + inset, y + inset, cs - inset * 2, cs - inset * 2, Math.max(3, cs * 0.12));
      ctx.fill();
      ctx.fillStyle = "#111";
      ctx.font = `600 ${Math.max(9, Math.floor(cs * 0.26))}px "IBM Plex Sans", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const label = word?.label ?? "?";
      wrapLabel(ctx, label, x + cs / 2, y + cs / 2, cs - inset * 2.5, cs);
      return;
    }

    const noun = world.lexicon.getNoun(e.noun);
    const color = PALETTE[noun?.palette ?? e.noun] ?? "#aaa";
    ctx.fillStyle = color;

    if (e.noun === "baba" || e.noun === "keke") {
      ctx.beginPath();
      ctx.ellipse(x + cs / 2, y + cs / 2 + cs * 0.04, cs * 0.32, cs * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#222";
      ctx.beginPath();
      ctx.arc(x + cs / 2 - cs * 0.12, y + cs / 2 - cs * 0.04, eye, 0, Math.PI * 2);
      ctx.arc(x + cs / 2 + cs * 0.12, y + cs / 2 - cs * 0.04, eye, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.noun === "flag") {
      const poleX = x + cs * 0.35;
      ctx.fillRect(poleX, y + cs * 0.2, Math.max(2, cs * 0.06), cs * 0.6);
      ctx.beginPath();
      ctx.moveTo(poleX + Math.max(2, cs * 0.06), y + cs * 0.2);
      ctx.lineTo(x + cs * 0.75, y + cs * 0.32);
      ctx.lineTo(poleX + Math.max(2, cs * 0.06), y + cs * 0.44);
      ctx.closePath();
      ctx.fill();
    } else if (e.noun === "wall") {
      roundRect(ctx, x + inset, y + inset, cs - inset * 2, cs - inset * 2, 3);
      ctx.fill();
      ctx.strokeStyle = "#00000044";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + inset + 3, y + inset + 3, cs - inset * 2 - 6, cs - inset * 2 - 6);
    } else if (e.noun === "rock") {
      ctx.beginPath();
      ctx.ellipse(x + cs / 2, y + cs / 2, cs * 0.3, cs * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.noun === "skull") {
      ctx.beginPath();
      ctx.ellipse(x + cs / 2, y + cs / 2 - cs * 0.02, cs * 0.28, cs * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#222";
      ctx.beginPath();
      ctx.arc(x + cs / 2 - cs * 0.1, y + cs / 2 - cs * 0.05, eye * 1.2, 0, Math.PI * 2);
      ctx.arc(x + cs / 2 + cs * 0.1, y + cs / 2 - cs * 0.05, eye * 1.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      roundRect(ctx, x + inset + 2, y + inset + 2, cs - inset * 2 - 4, cs - inset * 2 - 4, Math.max(4, cs * 0.16));
      ctx.fill();
    }
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrapLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  maxWidth: number,
  cell: number,
): void {
  if (ctx.measureText(text).width <= maxWidth || text.length <= 4) {
    ctx.fillText(text, cx, cy);
    return;
  }
  const mid = Math.ceil(text.length / 2);
  const gap = Math.max(5, cell * 0.14);
  ctx.fillText(text.slice(0, mid), cx, cy - gap / 2);
  ctx.fillText(text.slice(mid), cx, cy + gap / 2);
}
