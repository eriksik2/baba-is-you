import type { AreaDef, EntityRecord, LevelDocument, World } from "@baba/engine";
import { atlas, type AssetAtlas, type SheepDir } from "./atlas";
import { drawAutotile, MASK_E, MASK_N, MASK_S, MASK_W, neighborMask } from "./autotile";
import { ParticleSystem } from "./particles";

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

export type LerpState = {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  start: number;
  duration: number;
};

export type PortalProgress = {
  unlocked?: boolean;
  completed?: boolean;
};

export type DrawOptions = {
  /** Seconds (or any monotonic time unit) for water / walk anim. */
  t?: number;
  /** Smooth movement keyed by entity id. */
  lerp?: Map<number, LerpState>;
  /** Pixel-space camera scroll offset. */
  camera?: { x: number; y: number };
  showAreas?: boolean;
  areaDefs?: AreaDef[];
  portals?: NonNullable<LevelDocument["portals"]>;
  /** Per-portal unlock / clear styling keyed by portal id. */
  progressPortals?: Record<string, PortalProgress>;
};

export interface RenderOptions {
  cellSize?: number;
  padding?: number;
  assets?: AssetAtlas;
}

/**
 * Canvas renderer — paints background autotiles, portals, entities, particles.
 * All game logic lives in @baba/engine.
 */
export class CanvasRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly assets: AssetAtlas;
  private cellSize: number;
  private padding: number;
  private dpr = 1;
  private readonly facing = new Map<number, SheepDir>();

  readonly particles = new ParticleSystem();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    options: RenderOptions = {},
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
    this.cellSize = options.cellSize ?? 48;
    this.padding = options.padding ?? 16;
    this.assets = options.assets ?? atlas;
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

  draw(world: World, opts: DrawOptions = {}): void {
    const { ctx, cellSize: cs, padding: pad } = this;
    const cam = opts.camera ?? { x: 0, y: 0 };
    const t = opts.t ?? 0;
    const cssW = world.width * cs + pad * 2;
    const cssH = world.height * cs + pad * 2;

    ctx.clearRect(0, 0, cssW, cssH);

    ctx.fillStyle = "#1a2218";
    ctx.fillRect(0, 0, cssW, cssH);

    // Board frame
    ctx.fillStyle = "#243028";
    ctx.fillRect(pad - 3 - cam.x, pad - 3 - cam.y, world.width * cs + 6, world.height * cs + 6);

    // Clip to board interior (plus padding) so oversized overworlds don't smear chrome.
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad - 2, pad - 2, world.width * cs + 4, world.height * cs + 4);
    ctx.clip();

    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const tile = world.bgAt({ x, y });
        const mask = neighborMask(world, x, y, tile);
        const dx = pad + x * cs - cam.x;
        const dy = pad + y * cs - cam.y;
        drawAutotile(ctx, this.assets, tile, mask, dx, dy, cs, t);
      }
    }

    const areaDefs = opts.areaDefs ?? world.areaDefs;
    if (opts.showAreas && areaDefs.length > 0) {
      this.drawAreaOverlays(world, areaDefs, pad, cs, cam);
    }

    const portals = opts.portals ?? world.portals;
    if (portals.length > 0) {
      this.drawPortals(portals, opts.progressPortals, pad, cs, cam, t);
    }

    // Wall occupancy for neighbor-aware wall edges.
    const wallCells = new Set<string>();
    for (const e of world.entities.values()) {
      if (e.alive && e.kind === "object" && e.noun === "wall") {
        wallCells.add(`${e.position.x},${e.position.y}`);
      }
    }

    const entities = world.entities.all().sort((a, b) => {
      if (a.position.y !== b.position.y) return a.position.y - b.position.y;
      if (a.position.x !== b.position.x) return a.position.x - b.position.x;
      return a.layer - b.layer;
    });

    for (const e of entities) {
      if (!e.alive) continue;
      this.drawEntity(world, e, pad, cs, cam, t, opts.lerp, wallCells);
    }

    this.particles.draw(ctx, cs, pad, cam);
    ctx.restore();
  }

  private drawAreaOverlays(
    world: World,
    areaDefs: AreaDef[],
    pad: number,
    cs: number,
    cam: { x: number; y: number },
  ): void {
    const ctx = this.ctx;
    const byId = new Map(areaDefs.map((a) => [a.id, a]));
    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const id = world.areaAt({ x, y });
        if (id === 0) continue;
        const def = byId.get(id);
        if (!def) continue;
        ctx.fillStyle = def.color;
        ctx.globalAlpha = 0.28;
        ctx.fillRect(pad + x * cs - cam.x, pad + y * cs - cam.y, cs, cs);
        ctx.globalAlpha = 1;
      }
    }
  }

  private drawPortals(
    portals: NonNullable<LevelDocument["portals"]>,
    progress: Record<string, PortalProgress> | undefined,
    pad: number,
    cs: number,
    cam: { x: number; y: number },
    t: number,
  ): void {
    const ctx = this.ctx;
    for (const p of portals) {
      const prog = progress?.[p.id];
      const unlocked = prog?.unlocked ?? true;
      const completed = prog?.completed ?? false;
      const cx = pad + (p.x + 0.5) * cs - cam.x;
      const cy = pad + (p.y + 0.5) * cs - cam.y;
      const r = cs * (0.32 + Math.sin(t * 3 + p.x) * 0.03);

      ctx.save();
      // Outer glow
      const glow = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.6);
      if (completed) {
        glow.addColorStop(0, "rgba(240, 199, 94, 0.75)");
        glow.addColorStop(1, "rgba(240, 199, 94, 0)");
      } else if (unlocked) {
        glow.addColorStop(0, "rgba(110, 198, 255, 0.7)");
        glow.addColorStop(1, "rgba(110, 198, 255, 0)");
      } else {
        glow.addColorStop(0, "rgba(120, 120, 130, 0.45)");
        glow.addColorStop(1, "rgba(120, 120, 130, 0)");
      }
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = completed ? "#f0c75e" : unlocked ? "#6ec6ff" : "#888";
      ctx.lineWidth = Math.max(1.5, cs * 0.05);
      ctx.globalAlpha = unlocked ? 0.95 : 0.45;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
      ctx.stroke();

      const label = p.label ?? p.targetLevelId;
      ctx.globalAlpha = unlocked ? 1 : 0.55;
      ctx.fillStyle = "#f4f0ea";
      ctx.font = `600 ${Math.max(8, Math.floor(cs * 0.22))}px "IBM Plex Sans", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(label, cx, cy + r + 2);
      ctx.restore();
    }
  }

  private resolvePos(
    e: EntityRecord,
    lerp: Map<number, LerpState> | undefined,
    t: number,
  ): { x: number; y: number; moving: boolean } {
    const anim = lerp?.get(e.id as unknown as number);
    if (!anim || anim.duration <= 0) {
      return { x: e.position.x, y: e.position.y, moving: false };
    }
    const u = Math.max(0, Math.min(1, (t - anim.start) / anim.duration));
    // Ease out slightly for snappier landings.
    const eased = 1 - (1 - u) * (1 - u);
    const x = anim.fromX + (anim.toX - anim.fromX) * eased;
    const y = anim.fromY + (anim.toY - anim.fromY) * eased;

    const dx = anim.toX - anim.fromX;
    const dy = anim.toY - anim.fromY;
    if (dx !== 0 || dy !== 0) {
      let dir: SheepDir = "down";
      if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? "right" : "left";
      else dir = dy > 0 ? "down" : "up";
      this.facing.set(e.id as unknown as number, dir);
    }

    return { x, y, moving: u < 1 };
  }

  private wallMask(x: number, y: number, wallCells: Set<string>): number {
    let mask = 0;
    if (wallCells.has(`${x},${y - 1}`)) mask |= MASK_N;
    if (wallCells.has(`${x + 1},${y}`)) mask |= MASK_E;
    if (wallCells.has(`${x},${y + 1}`)) mask |= MASK_S;
    if (wallCells.has(`${x - 1},${y}`)) mask |= MASK_W;
    return mask;
  }

  private drawEntity(
    world: World,
    e: EntityRecord,
    pad: number,
    cs: number,
    cam: { x: number; y: number },
    t: number,
    lerp: Map<number, LerpState> | undefined,
    wallCells: Set<string>,
  ): void {
    const ctx = this.ctx;
    const pos = this.resolvePos(e, lerp, t);
    const x = pad + pos.x * cs - cam.x;
    const y = pad + pos.y * cs - cam.y;
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

    // Baba → sheep sprite
    if (e.noun === "baba") {
      const dir = this.facing.get(e.id as unknown as number) ?? "down";
      const frame = pos.moving ? Math.floor(t * 8) : 0;
      if (this.assets.sheep) {
        this.assets.drawSheep(ctx, x, y, cs, dir, frame);
      } else {
        this.drawFallbackCreature(ctx, x, y, cs, PALETTE.baba ?? "#f4f0ea", eye);
      }
      return;
    }

    if (e.noun === "wall") {
      this.drawWall(ctx, x, y, cs, this.wallMask(Math.round(pos.x), Math.round(pos.y), wallCells));
      return;
    }

    const noun = world.lexicon.getNoun(e.noun);
    const color = PALETTE[noun?.palette ?? e.noun] ?? "#aaa";
    ctx.fillStyle = color;

    if (e.noun === "keke") {
      this.drawFallbackCreature(ctx, x, y, cs, color, eye);
    } else if (e.noun === "flag") {
      const poleX = x + cs * 0.35;
      ctx.fillRect(poleX, y + cs * 0.2, Math.max(2, cs * 0.06), cs * 0.6);
      ctx.beginPath();
      ctx.moveTo(poleX + Math.max(2, cs * 0.06), y + cs * 0.2);
      ctx.lineTo(x + cs * 0.75, y + cs * 0.32);
      ctx.lineTo(poleX + Math.max(2, cs * 0.06), y + cs * 0.44);
      ctx.closePath();
      ctx.fill();
    } else if (e.noun === "rock") {
      ctx.beginPath();
      ctx.ellipse(x + cs / 2, y + cs / 2, cs * 0.3, cs * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.beginPath();
      ctx.ellipse(x + cs / 2 + cs * 0.05, y + cs / 2 + cs * 0.04, cs * 0.18, cs * 0.14, 0.3, 0, Math.PI * 2);
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
    } else if (e.noun === "water" || e.noun === "lava") {
      roundRect(ctx, x + inset, y + inset, cs - inset * 2, cs - inset * 2, Math.max(4, cs * 0.14));
      ctx.fill();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = "#fff";
      ctx.fillRect(x + cs * 0.2, y + cs * 0.25, cs * 0.55, cs * 0.12);
      ctx.globalAlpha = 1;
    } else {
      roundRect(ctx, x + inset + 2, y + inset + 2, cs - inset * 2 - 4, cs - inset * 2 - 4, Math.max(4, cs * 0.16));
      ctx.fill();
    }
  }

  private drawFallbackCreature(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    cs: number,
    color: string,
    eye: number,
  ): void {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x + cs / 2, y + cs / 2 + cs * 0.04, cs * 0.32, cs * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#222";
    ctx.beginPath();
    ctx.arc(x + cs / 2 - cs * 0.12, y + cs / 2 - cs * 0.04, eye, 0, Math.PI * 2);
    ctx.arc(x + cs / 2 + cs * 0.12, y + cs / 2 - cs * 0.04, eye, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Neighbor-aware wall block with inset edges where neighbors are missing. */
  private drawWall(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    cs: number,
    mask: number,
  ): void {
    const inset = Math.max(1, cs * 0.04);
    ctx.fillStyle = PALETTE.wall ?? "#5a6a7e";
    roundRect(ctx, x + inset, y + inset, cs - inset * 2, cs - inset * 2, 2);
    ctx.fill();

    // Inner panel
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(x + cs * 0.18, y + cs * 0.18, cs * 0.64, cs * 0.64);
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + cs * 0.18, y + cs * 0.18, cs * 0.64, cs * 0.64);

    const t = Math.max(1.5, cs * 0.08);
    if ((mask & MASK_N) === 0) {
      ctx.fillStyle = "rgba(220,230,240,0.22)";
      ctx.fillRect(x + inset, y + inset, cs - inset * 2, t);
    }
    if ((mask & MASK_W) === 0) {
      ctx.fillStyle = "rgba(220,230,240,0.18)";
      ctx.fillRect(x + inset, y + inset, t, cs - inset * 2);
    }
    if ((mask & MASK_S) === 0) {
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.fillRect(x + inset, y + cs - inset - t, cs - inset * 2, t);
    }
    if ((mask & MASK_E) === 0) {
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(x + cs - inset - t, y + inset, t, cs - inset * 2);
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
