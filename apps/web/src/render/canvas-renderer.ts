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

  constructor(
    private readonly canvas: HTMLCanvasElement,
    options: RenderOptions = {},
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
    this.cellSize = options.cellSize ?? 48;
    this.padding = options.padding ?? 24;
  }

  resizeToWorld(world: World): void {
    const w = world.width * this.cellSize + this.padding * 2;
    const h = world.height * this.cellSize + this.padding * 2;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  draw(world: World): void {
    this.resizeToWorld(world);
    const { ctx, cellSize: cs, padding: pad } = this;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Board backdrop
    ctx.fillStyle = "#1c2738";
    ctx.fillRect(pad - 4, pad - 4, world.width * cs + 8, world.height * cs + 8);

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
    const inset = 4;

    if (e.kind === "text") {
      const td = world.textData.get(e.id);
      const word = td ? world.lexicon.getWord(td.wordId) : undefined;
      const color = PALETTE[word?.palette ?? "text-operator"] ?? "#fff";
      ctx.fillStyle = color;
      roundRect(ctx, x + inset, y + inset, cs - inset * 2, cs - inset * 2, 6);
      ctx.fill();
      ctx.fillStyle = "#111";
      ctx.font = `bold ${Math.floor(cs * 0.28)}px "IBM Plex Sans", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const label = word?.label ?? "?";
      wrapLabel(ctx, label, x + cs / 2, y + cs / 2, cs - inset * 3);
      return;
    }

    const noun = world.lexicon.getNoun(e.noun);
    const color = PALETTE[noun?.palette ?? e.noun] ?? "#aaa";
    ctx.fillStyle = color;

    if (e.noun === "baba" || e.noun === "keke") {
      // Soft body
      ctx.beginPath();
      ctx.ellipse(x + cs / 2, y + cs / 2 + 2, cs * 0.32, cs * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#222";
      ctx.beginPath();
      ctx.arc(x + cs / 2 - 6, y + cs / 2 - 2, 2.5, 0, Math.PI * 2);
      ctx.arc(x + cs / 2 + 6, y + cs / 2 - 2, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.noun === "flag") {
      ctx.fillRect(x + cs * 0.35, y + cs * 0.2, 3, cs * 0.6);
      ctx.beginPath();
      ctx.moveTo(x + cs * 0.35 + 3, y + cs * 0.2);
      ctx.lineTo(x + cs * 0.75, y + cs * 0.32);
      ctx.lineTo(x + cs * 0.35 + 3, y + cs * 0.44);
      ctx.closePath();
      ctx.fill();
    } else if (e.noun === "wall") {
      roundRect(ctx, x + inset, y + inset, cs - inset * 2, cs - inset * 2, 3);
      ctx.fill();
      ctx.strokeStyle = "#00000044";
      ctx.strokeRect(x + inset + 4, y + inset + 4, cs - inset * 2 - 8, cs - inset * 2 - 8);
    } else if (e.noun === "rock") {
      ctx.beginPath();
      ctx.ellipse(x + cs / 2, y + cs / 2, cs * 0.3, cs * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      roundRect(ctx, x + inset + 2, y + inset + 2, cs - inset * 2 - 4, cs - inset * 2 - 4, 8);
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
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  maxWidth: number,
): void {
  if (ctx.measureText(text).width <= maxWidth || text.length <= 4) {
    ctx.fillText(text, cx, cy);
    return;
  }
  const mid = Math.ceil(text.length / 2);
  ctx.fillText(text.slice(0, mid), cx, cy - 6);
  ctx.fillText(text.slice(mid), cx, cy + 8);
}
