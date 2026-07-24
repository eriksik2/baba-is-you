import type { AreaDef, EntityRecord, LevelDocument, World } from "@sheep/engine";
import { atlas, type AssetAtlas, type SheepDir } from "./atlas";
import { drawAutotile, MASK_E, MASK_N, MASK_S, MASK_W, neighborMask } from "./autotile";
import { ParticleSystem } from "./particles";

/** High-contrast fills so objects read over ground. */
const PALETTE: Record<string, string> = {
  sheep: "#fff4e0",
  wolf: "#5a5a68",
  wall: "#7a8ca4",
  rock: "#e0b078",
  tree: "#3d6b3a",
  fruit: "#e06050",
  door: "#8b5a2b",
  tnt: "#c43c2b",
  text: "#ffffff",
  "text-noun": "#3db4ff",
  "text-property": "#ff5aad",
  "text-operator": "#ffffff",
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
  /** Editor: fill areas with translucent color + hatch. */
  showAreas?: boolean;
  /** Play (default true when areaDefs exist): thin inner border outlines. */
  outlineAreas?: boolean;
  areaDefs?: AreaDef[];
  portals?: NonNullable<LevelDocument["portals"]>;
  progressPortals?: Record<string, PortalProgress>;
  /**
   * Editor: draw the play-camera frustum in world space.
   * `cx,cy` = world center; `zoom` = CSS px/cell; `viewW/viewH` = play viewport CSS px.
   */
  cameraPreview?: {
    cx: number;
    cy: number;
    zoom: number;
    viewW: number;
    viewH: number;
    mode: "follow" | "fixed";
  };
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

  /** Fit entire world in view; returns camera centered on the map. */
  cameraFitWorld(world: World, margin = 0.92): Camera {
    const zoom = Math.max(
      16,
      Math.min(
        72,
        Math.min(this._viewW / Math.max(1, world.width), this._viewH / Math.max(1, world.height)) *
          margin,
      ),
    );
    return {
      x: world.width / 2,
      y: world.height / 2,
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
        drawAutotile(ctx, this.assets, tile, mask, sx, sy, cs, t, x, y);
      }
    }

    const areaDefs = opts.areaDefs ?? world.areaDefs;
    if (opts.showAreas && areaDefs.length > 0) {
      this.drawAreaFills(world, areaDefs, cam, x0, y0, x1, y1);
    }
    // Always outline areas in play and editor so borders stay readable.
    if ((opts.outlineAreas ?? areaDefs.length > 0) && areaDefs.length > 0) {
      this.drawAreaOutlines(world, areaDefs, cam, x0, y0, x1, y1);
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
      const pos = this.resolvePos(e, world, opts.lerp, nowMs);
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

    if (opts.cameraPreview) {
      this.drawCameraPreview(opts.cameraPreview, cam);
    }
  }

  private drawCameraPreview(
    preview: NonNullable<DrawOptions["cameraPreview"]>,
    viewCam: Camera,
  ): void {
    const ctx = this.ctx;
    const halfW = preview.viewW / preview.zoom / 2;
    const halfH = preview.viewH / preview.zoom / 2;
    const x0 = preview.cx - halfW;
    const y0 = preview.cy - halfH;
    const x1 = preview.cx + halfW;
    const y1 = preview.cy + halfH;
    const a = this.worldToScreen(x0, y0, viewCam);
    const b = this.worldToScreen(x1, y1, viewCam);
    const left = Math.min(a.sx, b.sx);
    const top = Math.min(a.sy, b.sy);
    const w = Math.abs(b.sx - a.sx);
    const h = Math.abs(b.sy - a.sy);

    ctx.save();
    ctx.strokeStyle = preview.mode === "fixed" ? "#ffb454" : "#7ad0ff";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(left, top, w, h);
    ctx.setLineDash([]);
    // Crosshair at camera center
    const c = this.worldToScreen(preview.cx, preview.cy, viewCam);
    const arm = Math.max(6, preview.zoom * 0.2);
    ctx.beginPath();
    ctx.moveTo(c.sx - arm, c.sy);
    ctx.lineTo(c.sx + arm, c.sy);
    ctx.moveTo(c.sx, c.sy - arm);
    ctx.lineTo(c.sx, c.sy + arm);
    ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.globalAlpha = 0.85;
    ctx.font = `600 ${Math.max(10, Math.min(14, preview.zoom * 0.28))}px "IBM Plex Sans", sans-serif`;
    ctx.fillText(preview.mode === "fixed" ? "cam fixed" : "cam follow", left + 6, top + 14);
    ctx.restore();
  }

  private drawAreaFills(
    world: World,
    areaDefs: AreaDef[],
    cam: Camera,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): void {
    const ctx = this.ctx;
    const cs = cam.zoom;
    const byId = new Map(areaDefs.map((a) => [a.id, a]));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const id = world.areaAt({ x, y });
        if (!id) continue;
        const def = byId.get(id);
        if (!def) continue;
        const { sx, sy } = this.worldToScreen(x, y, cam);
        const rgb = areaRgb(def.color);
        ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.28)`;
        ctx.fillRect(sx, sy, cs, cs);
        // Diagonal hatch so fills stay readable on any ground color.
        ctx.save();
        ctx.beginPath();
        ctx.rect(sx, sy, cs, cs);
        ctx.clip();
        ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.45)`;
        ctx.lineWidth = Math.max(1, cs * 0.04);
        const step = Math.max(4, cs * 0.22);
        for (let i = -cs; i < cs * 2; i += step) {
          ctx.beginPath();
          ctx.moveTo(sx + i, sy);
          ctx.lineTo(sx + i + cs, sy + cs);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }

  /** Thin inner-edge outlines so area borders read in play without filling the floor. */
  private drawAreaOutlines(
    world: World,
    areaDefs: AreaDef[],
    cam: Camera,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): void {
    const ctx = this.ctx;
    const cs = cam.zoom;
    const byId = new Map(areaDefs.map((a) => [a.id, a]));
    const t = Math.max(2, cs * 0.08);

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const id = world.areaAt({ x, y });
        if (!id) continue;
        const def = byId.get(id);
        if (!def) continue;
        const rgb = areaRgb(def.color);
        ctx.fillStyle = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
        const { sx, sy } = this.worldToScreen(x, y, cam);
        const n = y > 0 ? world.areaAt({ x, y: y - 1 }) : 0;
        const e = x < world.width - 1 ? world.areaAt({ x: x + 1, y }) : 0;
        const s = y < world.height - 1 ? world.areaAt({ x, y: y + 1 }) : 0;
        const w = x > 0 ? world.areaAt({ x: x - 1, y }) : 0;
        if (n !== id) ctx.fillRect(sx, sy, cs, t);
        if (e !== id) ctx.fillRect(sx + cs - t, sy, t, cs);
        if (s !== id) ctx.fillRect(sx, sy + cs - t, cs, t);
        if (w !== id) ctx.fillRect(sx, sy, t, cs);
      }
    }
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
    world: World,
    lerp: Map<number, LerpState> | undefined,
    nowMs: number,
  ): { x: number; y: number; moving: boolean } {
    // DYNAMIC bodies use continuous center coords → top-left for draw.
    const body = world.physicsBodies.get(e.id);
    if (body) {
      const moving = Math.hypot(body.vx, body.vy) > 0.02;
      if (moving) {
        let dir: SheepDir = "down";
        if (Math.abs(body.vx) > Math.abs(body.vy)) dir = body.vx > 0 ? "right" : "left";
        else dir = body.vy > 0 ? "down" : "up";
        this.facing.set(e.id as unknown as number, dir);
      }
      return { x: body.x - 0.5, y: body.y - 0.5, moving };
    }
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
    const inset = Math.max(2, cs * 0.07);
    const eye = Math.max(1.5, cs * 0.055);
    const strokeW = Math.max(1.5, cs * 0.055);

    if (e.kind === "text") {
      const td = world.textData.get(e.id);
      const word = td ? world.lexicon.getWord(td.wordId) : undefined;
      const color = PALETTE[word?.palette ?? "text-operator"] ?? "#fff";
      const bx = x + inset;
      const by = y + inset;
      const bw = cs - inset * 2;
      const bh = cs - inset * 2;
      const r = Math.max(3, cs * 0.12);
      roundRect(ctx, bx, by, bw, bh, r);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = strokeW;
      ctx.strokeStyle = "rgba(10, 14, 20, 0.75)";
      ctx.stroke();
      // Inner highlight for pop against grass.
      roundRect(ctx, bx + 1, by + 1, bw - 2, bh - 2, Math.max(2, r - 1));
      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.lineWidth = Math.max(1, strokeW * 0.45);
      ctx.stroke();

      const label = (word?.label ?? "?").toUpperCase();
      // Use almost the full tile — previous padding left text looking tiny.
      const pad = Math.max(2, cs * 0.06);
      fitLabel(ctx, label, x + cs / 2, y + cs / 2, bw - pad, bh - pad);
      return;
    }

    if (e.noun === "sheep") {
      // Prefer lerp-derived facing while animating; otherwise engine facing.
      const lerpDir = this.facing.get(e.id as unknown as number);
      const engineDir = e.facing as SheepDir | undefined;
      const dir: SheepDir = (moving ? lerpDir : undefined) ?? engineDir ?? lerpDir ?? "down";
      const frame = moving ? Math.floor(t * 8) : 0;
      if (this.assets.sheep) this.assets.drawSheep(ctx, x, y, cs, dir, frame);
      else this.drawFallbackCreature(ctx, x, y, cs, PALETTE.sheep ?? "#fff4e0", eye);
      return;
    }

    if (e.noun === "wolf") {
      const lerpDir = this.facing.get(e.id as unknown as number);
      const engineDir = e.facing as SheepDir | undefined;
      const dir: SheepDir = (moving ? lerpDir : undefined) ?? engineDir ?? lerpDir ?? "down";
      this.drawWolf(ctx, x, y, cs, dir, eye, strokeW);
      return;
    }

    if (e.noun === "wall") {
      this.drawWall(ctx, x, y, cs, this.wallMask(cellX, cellY, wallCells));
      return;
    }

    if (e.noun === "tree" || e.noun === "fruit" || e.noun === "door") {
      if (this.assets.drawSprite(ctx, e.noun as "tree" | "fruit" | "door", x, y, cs)) return;
      // Fall through to colored shape if sprite missing.
    }

    const noun = world.lexicon.getNoun(e.noun);
    const color = PALETTE[noun?.palette ?? e.noun] ?? "#aaa";

    if (e.noun === "rock") {
      ctx.beginPath();
      ctx.ellipse(x + cs / 2, y + cs / 2 + cs * 0.02, cs * 0.34, cs * 0.28, 0, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "rgba(40, 24, 10, 0.7)";
      ctx.lineWidth = strokeW;
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.beginPath();
      ctx.ellipse(x + cs / 2 - cs * 0.08, y + cs / 2 - cs * 0.06, cs * 0.12, cs * 0.08, -0.4, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.noun === "tree") {
      this.drawFallbackTree(ctx, x, y, cs, color, strokeW);
    } else if (e.noun === "fruit") {
      ctx.beginPath();
      ctx.arc(x + cs / 2, y + cs / 2, cs * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "rgba(40, 16, 10, 0.65)";
      ctx.lineWidth = strokeW;
      ctx.stroke();
      ctx.fillStyle = "#4a7a38";
      ctx.fillRect(x + cs * 0.46, y + cs * 0.22, cs * 0.08, cs * 0.14);
    } else if (e.noun === "door") {
      roundRect(ctx, x + inset + 2, y + inset, cs - inset * 2 - 4, cs - inset * 2, Math.max(2, cs * 0.06));
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "rgba(20, 12, 8, 0.7)";
      ctx.lineWidth = strokeW;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + cs * 0.68, y + cs * 0.52, cs * 0.05, 0, Math.PI * 2);
      ctx.fillStyle = "#e8c86a";
      ctx.fill();
    } else if (e.noun === "tnt") {
      roundRect(ctx, x + inset + 1, y + inset + 2, cs - inset * 2 - 2, cs - inset * 2 - 4, Math.max(2, cs * 0.08));
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "rgba(20, 8, 6, 0.75)";
      ctx.lineWidth = strokeW;
      ctx.stroke();
      ctx.fillStyle = "#1a1a1a";
      ctx.font = `bold ${Math.max(8, cs * 0.28)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("TNT", x + cs / 2, y + cs / 2 + cs * 0.02);
      ctx.beginPath();
      ctx.moveTo(x + cs * 0.55, y + inset);
      ctx.quadraticCurveTo(x + cs * 0.72, y + cs * 0.08, x + cs * 0.62, y + cs * 0.2);
      ctx.strokeStyle = "#f0d060";
      ctx.lineWidth = Math.max(1.5, cs * 0.04);
      ctx.stroke();
    } else {
      roundRect(ctx, x + inset + 1, y + inset + 1, cs - inset * 2 - 2, cs - inset * 2 - 2, Math.max(4, cs * 0.16));
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "rgba(10,14,20,0.65)";
      ctx.lineWidth = strokeW;
      ctx.stroke();
    }
  }

  private drawFallbackTree(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    cs: number,
    color: string,
    strokeW: number,
  ): void {
    ctx.fillStyle = "#6b4428";
    ctx.fillRect(x + cs * 0.42, y + cs * 0.55, cs * 0.16, cs * 0.32);
    ctx.beginPath();
    ctx.ellipse(x + cs / 2, y + cs * 0.42, cs * 0.32, cs * 0.3, 0, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "rgba(12, 24, 10, 0.65)";
    ctx.lineWidth = strokeW;
    ctx.stroke();
  }

  private drawFallbackCreature(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    cs: number,
    color: string,
    eye: number,
  ): void {
    ctx.fillStyle = "rgba(20, 28, 18, 0.28)";
    ctx.beginPath();
    ctx.ellipse(x + cs / 2, y + cs * 0.82, cs * 0.28, cs * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(x + cs / 2, y + cs / 2 + cs * 0.04, cs * 0.36, cs * 0.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "rgba(20, 16, 10, 0.7)";
    ctx.lineWidth = Math.max(1.5, cs * 0.055);
    ctx.stroke();
    ctx.fillStyle = "#1a1a22";
    ctx.beginPath();
    ctx.arc(x + cs / 2 - cs * 0.12, y + cs / 2 - cs * 0.04, eye, 0, Math.PI * 2);
    ctx.arc(x + cs / 2 + cs * 0.12, y + cs / 2 - cs * 0.04, eye, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawWolf(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    cs: number,
    dir: SheepDir,
    eye: number,
    strokeW: number,
  ): void {
    const cx = x + cs / 2;
    const cy = y + cs / 2 + cs * 0.02;
    const body = PALETTE.wolf ?? "#5a5a68";

    // Shadow
    ctx.fillStyle = "rgba(12, 10, 16, 0.35)";
    ctx.beginPath();
    ctx.ellipse(cx, y + cs * 0.84, cs * 0.3, cs * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.beginPath();
    ctx.ellipse(cx, cy + cs * 0.04, cs * 0.34, cs * 0.28, 0, 0, Math.PI * 2);
    ctx.fillStyle = body;
    ctx.fill();
    ctx.strokeStyle = "rgba(10, 8, 14, 0.75)";
    ctx.lineWidth = strokeW;
    ctx.stroke();

    // Head offset by facing
    const hx =
      dir === "left" ? cx - cs * 0.16 : dir === "right" ? cx + cs * 0.16 : cx;
    const hy =
      dir === "up" ? cy - cs * 0.18 : dir === "down" ? cy + cs * 0.1 : cy - cs * 0.08;

    // Ears
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(hx - cs * 0.14, hy - cs * 0.06);
    ctx.lineTo(hx - cs * 0.08, hy - cs * 0.22);
    ctx.lineTo(hx - cs * 0.02, hy - cs * 0.06);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(hx + cs * 0.14, hy - cs * 0.06);
    ctx.lineTo(hx + cs * 0.08, hy - cs * 0.22);
    ctx.lineTo(hx + cs * 0.02, hy - cs * 0.06);
    ctx.closePath();
    ctx.fill();

    // Snout
    ctx.beginPath();
    ctx.ellipse(hx, hy, cs * 0.18, cs * 0.16, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#6e6e7a";
    ctx.fill();
    ctx.strokeStyle = "rgba(10, 8, 14, 0.7)";
    ctx.lineWidth = strokeW * 0.85;
    ctx.stroke();

    // Eyes (amber)
    ctx.fillStyle = "#e8b44a";
    ctx.beginPath();
    ctx.arc(hx - cs * 0.07, hy - cs * 0.02, eye * 0.95, 0, Math.PI * 2);
    ctx.arc(hx + cs * 0.07, hy - cs * 0.02, eye * 0.95, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a1010";
    ctx.beginPath();
    ctx.arc(hx - cs * 0.07, hy - cs * 0.02, eye * 0.45, 0, Math.PI * 2);
    ctx.arc(hx + cs * 0.07, hy - cs * 0.02, eye * 0.45, 0, Math.PI * 2);
    ctx.fill();

    // Nose
    ctx.fillStyle = "#1a1218";
    ctx.beginPath();
    ctx.ellipse(hx, hy + cs * 0.08, cs * 0.05, cs * 0.035, 0, 0, Math.PI * 2);
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
    ctx.fillStyle = PALETTE.wall ?? "#7a8ca4";
    roundRect(ctx, x + inset, y + inset, cs - inset * 2, cs - inset * 2, 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(12, 16, 24, 0.55)";
    ctx.lineWidth = Math.max(1.5, cs * 0.05);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.fillRect(x + cs * 0.18, y + cs * 0.18, cs * 0.64, cs * 0.64);
    const t = Math.max(1.5, cs * 0.08);
    if ((mask & MASK_N) === 0) {
      ctx.fillStyle = "rgba(240,245,255,0.28)";
      ctx.fillRect(x + inset, y + inset, cs - inset * 2, t);
    }
    if ((mask & MASK_W) === 0) {
      ctx.fillStyle = "rgba(240,245,255,0.2)";
      ctx.fillRect(x + inset, y + inset, t, cs - inset * 2);
    }
    if ((mask & MASK_S) === 0) {
      ctx.fillStyle = "rgba(0,0,0,0.32)";
      ctx.fillRect(x + inset, y + cs - inset - t, cs - inset * 2, t);
    }
    if ((mask & MASK_E) === 0) {
      ctx.fillStyle = "rgba(0,0,0,0.26)";
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

/** Shrink / wrap text so the label stays inside the tile at any zoom. */
function fitLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  maxWidth: number,
  maxHeight: number,
): void {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const minSize = 7;
  let size = Math.floor(Math.min(maxHeight * 0.62, maxWidth * 0.55));
  size = Math.max(minSize, size);

  const fontFor = (s: number) => `800 ${s}px "IBM Plex Sans", system-ui, sans-serif`;

  const fitsOneLine = (s: number) => {
    ctx.font = fontFor(s);
    return ctx.measureText(text).width <= maxWidth;
  };

  while (size > minSize && !fitsOneLine(size)) size -= 1;

  ctx.font = fontFor(size);
  ctx.lineWidth = Math.max(2, size * 0.2);
  ctx.strokeStyle = "rgba(10, 12, 18, 0.88)";
  ctx.fillStyle = "#0e1016";

  if (fitsOneLine(size) || text.length <= 5) {
    ctx.strokeText(text, cx, cy);
    ctx.fillText(text, cx, cy);
    return;
  }

  let breakAt = Math.ceil(text.length / 2);
  for (let i = Math.floor(text.length / 2); i < text.length - 1; i++) {
    if (text[i] === " " || text[i] === "-") {
      breakAt = i + 1;
      break;
    }
  }
  const line1 = text.slice(0, breakAt).trim();
  const line2 = text.slice(breakAt).trim();
  while (size > minSize) {
    ctx.font = fontFor(size);
    if (
      ctx.measureText(line1).width <= maxWidth &&
      ctx.measureText(line2).width <= maxWidth &&
      size * 2.15 <= maxHeight
    ) {
      break;
    }
    size -= 1;
  }
  ctx.font = fontFor(size);
  const gap = size * 1.05;
  ctx.strokeText(line1, cx, cy - gap / 2);
  ctx.fillText(line1, cx, cy - gap / 2);
  ctx.strokeText(line2, cx, cy + gap / 2);
  ctx.fillText(line2, cx, cy + gap / 2);
}

function areaRgb(color: string): { r: number; g: number; b: number } {
  const m = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (m) {
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
  }
  if (color.startsWith("#") && (color.length === 7 || color.length === 4)) {
    const hex =
      color.length === 4
        ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
        : color;
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16),
    };
  }
  return { r: 100, g: 180, b: 220 };
}
