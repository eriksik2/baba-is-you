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

/** View camera: world cell at center + CSS px per cell. */
export type Camera = {
  x: number;
  y: number;
  zoom: number;
};

export type DrawOptions = {
  t?: number;
  lerp?: Map<number, LerpState>;
  camera?: Camera;
  showAreas?: boolean;
  areaDefs?: AreaDef[];
  portals?: NonNullable<LevelDocument["portals"]>;
  progressPortals?: Record<string, PortalProgress>;
};

export interface RenderOptions {
  assets?: AssetAtlas;
}

export class CanvasRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly assets: AssetAtlas;
  private _viewW = 320;
  private _viewH = 320;
  private dpr = 1;
  private readonly facing = new Map<number, SheepDir>();

  readonly particles = new ParticleSystem();

  get viewW(): number {
    return this._viewW;
  }
  get viewH(): number {
    return this._viewH;
  }
  /** @deprecated use camera.zoom — kept for editor hit-testing helpers */
  get cellSize(): number {
    return 32;
  }
  get padding(): number {
    return 0;
  }

  constructor(
    private readonly canvas: HTMLCanvasElement,
    options: RenderOptions = {},
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
    this.assets = options.assets ?? atlas;
  }

  /** Size the canvas to fill the shell (viewport), not the whole world. */
  resizeViewport(cssWidth: number, cssHeight: number): void {
    const w = Math.max(64, Math.floor(cssWidth));
    const h = Math.max(64, Math.floor(cssHeight));
    this._viewW = w;
    this._viewH = h;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  /** Fit entire world in view; returns camera. */
  cameraFitWorld(world: World, margin = 0.92): Camera {
    const zoom = Math.max(
      12,
      Math.min(
        64,
        Math.min(this._viewW / Math.max(1, world.width), this._viewH / Math.max(1, world.height)) *
          margin,
      ),
    );
    return {
      x: (world.width - 1) / 2,
      y: (world.height - 1) / 2,
      zoom,
    };
  }

  worldToScreen(wx: number, wy: number, cam: Camera): { sx: number; sy: number } {
    return {
      sx: this._viewW / 2 + (wx - cam.x) * cam.zoom,
      sy: this._viewH / 2 + (wy - cam.y) * cam.zoom,
    };
  }

  screenToWorld(sx: number, sy: number, cam: Camera): { x: number; y: number } {
    return {
      x: cam.x + (sx - this._viewW / 2) / cam.zoom,
      y: cam.y + (sy - this._viewH / 2) / cam.zoom,
    };
  }

  /** @deprecated Prefer resizeViewport + cameraFitWorld */
  fit(world: World, maxCssWidth: number, maxCssHeight: number): number {
    this.resizeViewport(maxCssWidth, maxCssHeight);
    return this.cameraFitWorld(world).zoom;
  }

  draw(world: World, opts: DrawOptions = {}): void {
    const ctx = this.ctx;
    const cam = opts.camera ?? this.cameraFitWorld(world);
    const t = opts.t ?? 0;
    const cs = cam.zoom;

    ctx.clearRect(0, 0, this._viewW, this._viewH);
    ctx.fillStyle = "#152018";
    ctx.fillRect(0, 0, this._viewW, this._viewH);

    const halfCellsX = this._viewW / cs / 2 + 2;
    const halfCellsY = this._viewH / cs / 2 + 2;
    const x0 = Math.max(0, Math.floor(cam.x - halfCellsX));
    const y0 = Math.max(0, Math.floor(cam.y - halfCellsY));
    const x1 = Math.min(world.width - 1, Math.ceil(cam.x + halfCellsX));
    const y1 = Math.min(world.height - 1, Math.ceil(cam.y + halfCellsY));

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const tile = world.bgAt({ x, y });
        const mask = neighborMask(world, x, y, tile);
        const { sx, sy } = this.worldToScreen(x, y, cam);
        drawAutotile(ctx, this.assets, tile, mask, sx, sy, cs, t);
      }
    }

    const areaDefs = opts.areaDefs ?? world.areaDefs;
    if (opts.showAreas && areaDefs.length > 0) {
      const byId = new Map(areaDefs.map((a) => [a.id, a]));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const id = world.areaAt({ x, y });
          if (!id) continue;
          const def = byId.get(id);
          if (!def) continue;
          const { sx, sy } = this.worldToScreen(x, y, cam);
          ctx.fillStyle = def.color;
          ctx.fillRect(sx, sy, cs, cs);
        }
      }
    }

    const portals = opts.portals ?? world.portals;
    if (portals.length) {
      this.drawPortals(portals, opts.progressPortals, cam, t);
    }

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

    const nowMs = typeof performance !== "undefined" ? performance.now() : t * 1000;
    for (const e of entities) {
      if (!e.alive) continue;
      const pos = this.resolvePos(e, opts.lerp, nowMs);
      if (pos.x < x0 - 1 || pos.x > x1 + 1 || pos.y < y0 - 1 || pos.y > y1 + 1) continue;
      const { sx, sy } = this.worldToScreen(pos.x, pos.y, cam);
      this.drawEntity(world, e, sx, sy, cs, t, pos.moving, wallCells, Math.round(pos.x), Math.round(pos.y));
    }

    // Particles: convert world-ish coords — ParticleSystem uses pixel space with pad/cam.
    // Emit sites pass approximate pixels; draw with identity cam offset 0 and pad 0, cell=zoom.
    this.particles.draw(ctx, cs, 0, {
      x: cam.x * cs - this._viewW / 2,
      y: cam.y * cs - this._viewH / 2,
    });
  }

  private drawPortals(
    portals: NonNullable<LevelDocument["portals"]>,
    progress: Record<string, PortalProgress> | undefined,
    cam: Camera,
    t: number,
  ): void {
    const ctx = this.ctx;
    const cs = cam.zoom;
    for (const p of portals) {
      const prog = progress?.[p.id];
      const unlocked = prog?.unlocked ?? true;
      const completed = prog?.completed ?? false;
      const { sx, sy } = this.worldToScreen(p.x + 0.5, p.y + 0.5, cam);
      const r = cs * (0.32 + Math.sin(t * 3 + p.x) * 0.03);

      ctx.save();
      const glow = ctx.createRadialGradient(sx, sy, r * 0.2, sx, sy, r * 1.6);
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
      ctx.arc(sx, sy, r * 1.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = completed ? "#f0c75e" : unlocked ? "#6ec6ff" : "#888";
      ctx.lineWidth = Math.max(1.5, cs * 0.05);
      ctx.globalAlpha = unlocked ? 0.95 : 0.45;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sx, sy, r * 0.55, 0, Math.PI * 2);
      ctx.stroke();

      const label = p.label ?? p.targetLevelId;
      ctx.globalAlpha = unlocked ? 1 : 0.55;
      ctx.fillStyle = "#f4f0ea";
      ctx.font = `600 ${Math.max(8, Math.floor(cs * 0.22))}px "IBM Plex Sans", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(label, sx, sy + r + 2);
      ctx.restore();
    }
  }

  private resolvePos(
    e: EntityRecord,
    lerp: Map<number, LerpState> | undefined,
    nowMs: number,
  ): { x: number; y: number; moving: boolean } {
    const anim = lerp?.get(e.id as unknown as number);
    if (!anim || anim.duration <= 0) {
      return { x: e.position.x, y: e.position.y, moving: false };
    }
    const u = Math.max(0, Math.min(1, (nowMs - anim.start) / anim.duration));
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
    x: number,
    y: number,
    cs: number,
    t: number,
    moving: boolean,
    wallCells: Set<string>,
    cellX: number,
    cellY: number,
  ): void {
    const ctx = this.ctx;
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
      wrapLabel(ctx, word?.label ?? "?", x + cs / 2, y + cs / 2, cs - inset * 2.5, cs);
      return;
    }

    if (e.noun === "baba") {
      const dir = this.facing.get(e.id as unknown as number) ?? "down";
      const frame = moving ? Math.floor(t * 8) : 0;
      if (this.assets.sheep) this.assets.drawSheep(ctx, x, y, cs, dir, frame);
      else this.drawFallbackCreature(ctx, x, y, cs, PALETTE.baba ?? "#f4f0ea", eye);
      return;
    }

    if (e.noun === "wall") {
      this.drawWall(ctx, x, y, cs, this.wallMask(cellX, cellY, wallCells));
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
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(x + cs * 0.18, y + cs * 0.18, cs * 0.64, cs * 0.64);
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
