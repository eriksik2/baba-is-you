import type {
  GameSession,
  LevelDocument,
  LevelEntitySpec,
  PlayerIntent,
  World,
} from "@baba/engine";
import {
  CAMPAIGN_LEVELS,
  DEFAULT_CHUNK_SIZE,
  GameSession as Session,
  canEnterPortal,
  createBlankLevel,
  createDefaultLexicon,
  loadDocument,
  migrateDenseToChunks,
  unlockAfterClear,
} from "@baba/engine";
import { CanvasRenderer, type Camera, type LerpState } from "../render/canvas-renderer";
import { atlas } from "../render/atlas";
import { bindControls, type ControlsHandle } from "../input/controls";
import {
  findLevel,
  loadProgress,
  saveCustomLevel,
  saveProgress,
} from "../storage/save";

const LERP_MS = 110;
const FOLLOW = 0.15;
const ZOOM_MIN = 12;
const ZOOM_MAX = 96;
const ZOOM_STEP = 1.2;
const CHUNK = DEFAULT_CHUNK_SIZE;

export type AppApi = {
  showScreen: (id: "menu" | "play" | "editor-hub" | "editor") => void;
  openLevel: (doc: LevelDocument, opts?: { fromEditor?: boolean; returnTo?: string }) => void;
  openOverworld: () => void;
};

function clampZoom(z: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function mid(
  a: { x: number; y: number },
  b: { x: number; y: number },
): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Zoom keeping the world point under `sx,sy` (canvas-local CSS px) stable. */
function zoomAround(
  renderer: CanvasRenderer,
  camera: Camera,
  factor: number,
  sx: number,
  sy: number,
): Camera {
  const before = renderer.screenToWorld(sx, sy, camera);
  const zoom = clampZoom(camera.zoom * factor);
  const next: Camera = { x: camera.x, y: camera.y, zoom };
  const after = renderer.screenToWorld(sx, sy, next);
  next.x += before.x - after.x;
  next.y += before.y - after.y;
  return next;
}

export function mountPlay(api: AppApi): {
  open: (doc: LevelDocument, opts?: { fromEditor?: boolean }) => void;
  destroy: () => void;
} {
  const screen = document.querySelector<HTMLElement>("#screen-play")!;
  const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
  const boardShell = screen.querySelector<HTMLElement>(".board-shell")!;
  const rulesList = document.querySelector<HTMLUListElement>("#rules-list")!;
  const statusEl = document.querySelector<HTMLParagraphElement>("#status")!;
  const levelName = document.querySelector<HTMLParagraphElement>("#level-name")!;
  const menuBtn = document.querySelector<HTMLButtonElement>("#btn-menu")!;
  const menuPanel = document.querySelector<HTMLElement>("#hamburger-panel")!;

  const renderer = new CanvasRenderer(canvas);
  let session: GameSession | null = null;
  let sourceDoc: LevelDocument | null = null;
  let fromEditor = false;
  let controls: ControlsHandle | null = null;
  let lerp = new Map<number, LerpState>();
  let raf = 0;
  let lastT = performance.now();
  let camera: Camera = { x: 0, y: 0, zoom: 32 };
  let userPan = false;

  const pointers = new Map<number, { x: number; y: number }>();
  let pinchStartDist = 0;
  let pinchStartZoom = 32;

  function progressPortals(): Record<string, { unlocked?: boolean; completed?: boolean }> {
    const progress = loadProgress();
    const map: Record<string, { unlocked?: boolean; completed?: boolean }> = {};
    for (const p of session?.world.portals ?? []) {
      const entry: { unlocked?: boolean; completed?: boolean } = {};
      entry.unlocked = canEnterPortal(progress, p);
      entry.completed = progress.completedLevels.includes(p.targetLevelId);
      map[p.id] = entry;
    }
    return map;
  }

  function refreshRules(): void {
    rulesList.innerHTML = "";
    for (const key of session?.world.activeFeaturesForDisplay() ?? []) {
      const li = document.createElement("li");
      li.textContent = key;
      rulesList.appendChild(li);
    }
  }

  function fitCamera(): void {
    if (!session) return;
    userPan = false;
    camera = renderer.cameraFitWorld(session.world);
  }

  function layout(): void {
    if (!session) return;
    const rect = boardShell.getBoundingClientRect();
    renderer.resizeViewport(Math.max(120, rect.width), Math.max(120, rect.height));
    if (!userPan) {
      camera = renderer.cameraFitWorld(session.world);
    }
  }

  function followYou(): void {
    // Soft follow unless the player has taken the camera (pinch/zoom).
    if (!session || userPan) return;
    const you = session.world.entitiesWithProperty("you")[0];
    if (!you) return;
    camera = {
      ...camera,
      x: camera.x + (you.position.x - camera.x) * FOLLOW,
      y: camera.y + (you.position.y - camera.y) * FOLLOW,
    };
  }

  function drawFrame(now: number): void {
    // Always reschedule — an early return before this used to kill the loop
    // while session was still null on boot, leaving a permanent black board.
    raf = requestAnimationFrame(drawFrame);
    if (!session) return;
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    renderer.particles.update(dt);
    followYou();
    renderer.draw(session.world, {
      t: now / 1000,
      lerp,
      camera,
      showAreas: false,
      areaDefs: session.world.areaDefs,
      portals: session.world.portals,
      progressPortals: progressPortals(),
    });
  }

  function captureLerp(before: World, after: World): void {
    const now = performance.now();
    const next = new Map<number, LerpState>();
    for (const e of after.entities.values()) {
      const prev = before.entities.get(e.id);
      if (!prev) continue;
      if (prev.position.x === e.position.x && prev.position.y === e.position.y) continue;
      next.set(e.id as unknown as number, {
        fromX: prev.position.x,
        fromY: prev.position.y,
        toX: e.position.x,
        toY: e.position.y,
        start: now,
        duration: LERP_MS,
      });
    }
    lerp = next;
  }

  function emitAtCell(x: number, y: number, kind: "spark" | "win", count: number): void {
    const z = camera.zoom;
    renderer.particles.emit((x + 0.5) * z, (y + 0.5) * z, kind, count);
  }

  function tryPortals(): void {
    if (!session || !sourceDoc?.isOverworld) return;
    const progress = loadProgress();
    const yous = session.world.entitiesWithProperty("you");
    for (const you of yous) {
      for (const portal of session.world.portals) {
        if (you.position.x !== portal.x || you.position.y !== portal.y) continue;
        if (!canEnterPortal(progress, portal)) {
          statusEl.textContent = "Locked";
          return;
        }
        const target = findLevel(portal.targetLevelId);
        if (!target) return;
        progress.overworldPos = { ...you.position };
        saveProgress(progress);
        emitAtCell(portal.x, portal.y, "spark", 18);
        open(target);
        return;
      }
    }
  }

  function onWin(): void {
    if (!session || !sourceDoc) return;
    statusEl.textContent = "Nice!";
    const you = session.world.entitiesWithProperty("you")[0];
    if (you) emitAtCell(you.position.x, you.position.y, "win", 28);
    else emitAtCell(camera.x, camera.y, "win", 28);
    if (sourceDoc.isOverworld) return;
    let progress = loadProgress();
    progress = unlockAfterClear(progress, sourceDoc.id, CAMPAIGN_LEVELS);
    saveProgress(progress);
    window.setTimeout(() => {
      if (fromEditor) {
        api.showScreen("editor");
      } else {
        api.openOverworld();
      }
    }, 900);
  }

  function dispatch(intent: PlayerIntent): void {
    if (!session) return;
    if (session.world.status !== "playing" && intent.type === "move") return;

    if (intent.type === "restart") {
      if (!sourceDoc) return;
      open(sourceDoc, { fromEditor });
      return;
    }

    const before = session.world.clone();
    const result = session.dispatch(intent);
    captureLerp(before, session.world);
    refreshRules();

    if (result.status === "won") onWin();
    else if (result.status === "lost") statusEl.textContent = "Oops";
    else statusEl.textContent = "";

    if (intent.type === "move" || intent.type === "wait") tryPortals();
  }

  function setMenuOpen(openMenu: boolean): void {
    menuPanel.hidden = !openMenu;
    menuBtn.setAttribute("aria-expanded", openMenu ? "true" : "false");
  }

  function open(doc: LevelDocument, opts?: { fromEditor?: boolean }): void {
    sourceDoc = structuredClone(doc);
    fromEditor = !!opts?.fromEditor;
    userPan = false;
    const world = loadDocument(doc);
    const progress = loadProgress();
    if (doc.isOverworld && progress.overworldPos) {
      const you = world.entitiesWithProperty("you")[0];
      if (you && world.grid.inBounds(progress.overworldPos)) {
        world.moveEntity(you.id, progress.overworldPos);
      }
    }
    session = new Session(world);
    levelName.textContent = doc.name;
    statusEl.textContent = "";
    setMenuOpen(false);
    refreshRules();
    api.showScreen("play");
    layout();
    // Paint immediately so the first frame isn't a blank shell while rAF catches up.
    renderer.draw(session.world, {
      t: performance.now() / 1000,
      lerp,
      camera,
      showAreas: false,
      areaDefs: session.world.areaDefs,
      portals: session.world.portals,
      progressPortals: progressPortals(),
    });
    requestAnimationFrame(() => {
      layout();
    });
  }

  // --- Zoom buttons ---
  screen.querySelectorAll<HTMLButtonElement>("[data-zoom]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      const dir = btn.dataset.zoom;
      const factor = dir === "in" ? ZOOM_STEP : 1 / ZOOM_STEP;
      camera = zoomAround(renderer, camera, factor, renderer.viewW / 2, renderer.viewH / 2);
      userPan = true;
    });
  });

  // --- Pinch zoom (one-finger swipe-to-move is handled by bindControls) ---
  canvas.addEventListener("pointerdown", (ev) => {
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    if (pointers.size === 2) {
      const pts = [...pointers.values()];
      pinchStartDist = Math.max(1, dist(pts[0]!, pts[1]!));
      pinchStartZoom = camera.zoom;
    }
  });

  canvas.addEventListener("pointermove", (ev) => {
    if (!pointers.has(ev.pointerId)) return;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    if (pointers.size >= 2) {
      const pts = [...pointers.values()];
      const a = pts[0]!;
      const b = pts[1]!;
      const d = Math.max(1, dist(a, b));
      const rect = canvas.getBoundingClientRect();
      const m = mid(a, b);
      const targetZoom = clampZoom(pinchStartZoom * (d / pinchStartDist));
      const f = targetZoom / camera.zoom;
      if (Math.abs(f - 1) > 0.001) {
        camera = zoomAround(renderer, camera, f, m.x - rect.left, m.y - rect.top);
        userPan = true;
      }
    }
  });

  const endPointer = (ev: PointerEvent) => {
    pointers.delete(ev.pointerId);
    if (pointers.size < 2) pinchStartDist = 0;
  };

  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);

  menuBtn.addEventListener("click", () => setMenuOpen(menuPanel.hidden));
  menuPanel.addEventListener("click", (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLElement>("[data-menu-action]");
    if (!btn) return;
    const action = btn.dataset.menuAction;
    setMenuOpen(false);
    if (action === "restart") dispatch({ type: "restart" });
    if (action === "fit") fitCamera();
    if (action === "exit") {
      if (fromEditor) api.showScreen("editor");
      else api.showScreen("menu");
    }
  });

  controls = bindControls((intent) => dispatch(intent), {
    root: screen,
    swipeTarget: canvas,
  });

  const ro = new ResizeObserver(() => layout());
  ro.observe(boardShell);
  raf = requestAnimationFrame(drawFrame);

  void atlas.ready.then(() => layout());

  return {
    open,
    destroy: () => {
      cancelAnimationFrame(raf);
      controls?.destroy();
      ro.disconnect();
    },
  };
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

type DenseDoc = LevelDocument & {
  width: number;
  height: number;
  background: string[];
  areaMap: number[];
};

type GrowDir = "left" | "right" | "up" | "down";

function growDense(doc: DenseDoc, dir: GrowDir): void {
  const w = doc.width;
  const h = doc.height;
  const nw = dir === "left" || dir === "right" ? w + CHUNK : w;
  const nh = dir === "up" || dir === "down" ? h + CHUNK : h;
  const ox = dir === "left" ? CHUNK : 0;
  const oy = dir === "up" ? CHUNK : 0;
  const bg = Array.from({ length: nw * nh }, () => "grass");
  const am = Array.from({ length: nw * nh }, () => 0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = y * w + x;
      const di = (y + oy) * nw + (x + ox);
      bg[di] = doc.background[si] ?? "grass";
      am[di] = doc.areaMap[si] ?? 0;
    }
  }
  doc.width = nw;
  doc.height = nh;
  doc.background = bg;
  doc.areaMap = am;
  for (const e of doc.entities) {
    e.x += ox;
    e.y += oy;
  }
  if (doc.portals) {
    for (const p of doc.portals) {
      p.x += ox;
      p.y += oy;
    }
  }
  if (doc.spawn) {
    doc.spawn = { x: doc.spawn.x + ox, y: doc.spawn.y + oy };
  }
}

function entitiesFromWorld(world: World): LevelEntitySpec[] {
  const out: LevelEntitySpec[] = [];
  for (const e of world.entities.all()) {
    if (!e.alive) continue;
    if (e.kind === "text") {
      const td = world.textData.get(e.id);
      const spec: LevelEntitySpec = {
        kind: "text",
        id: td ? String(td.wordId) : String(e.noun),
        x: e.position.x,
        y: e.position.y,
      };
      if (e.layer !== 1) spec.layer = e.layer;
      out.push(spec);
    } else {
      const spec: LevelEntitySpec = {
        kind: "object",
        id: String(e.noun),
        x: e.position.x,
        y: e.position.y,
      };
      if (e.layer !== 0) spec.layer = e.layer;
      out.push(spec);
    }
  }
  return out;
}

/** Keep a dense working copy while editing; flatten chunked docs on open. */
function toDenseWorkingDoc(src: LevelDocument): DenseDoc {
  const world = loadDocument(src);
  const dense: DenseDoc = {
    id: src.id,
    name: src.name,
    width: world.width,
    height: world.height,
    background: [...world.background],
    areaMap: [...world.areaMap],
    entities: entitiesFromWorld(world),
    globalRules: structuredClone(src.globalRules ?? world.globalRuleSpecs),
    areas: structuredClone((src.areas?.length ? src.areas : world.areaDefs) ?? []),
    chunks: [],
    chunkSize: src.chunkSize ?? DEFAULT_CHUNK_SIZE,
  };
  if (src.isOverworld || world.isOverworld) dense.isOverworld = true;
  if (world.portals.length) {
    dense.portals = world.portals.map((p) => ({ ...p }));
  }
  if (src.spawn) {
    dense.spawn = {
      x: src.spawn.x - world.originX,
      y: src.spawn.y - world.originY,
    };
  }
  return dense;
}

export function mountEditor(api: AppApi): {
  openDoc: (doc: LevelDocument) => void;
  newBlank: () => void;
} {
  const screen = document.querySelector<HTMLElement>("#screen-editor")!;
  const canvas = document.querySelector<HTMLCanvasElement>("#editor-canvas")!;
  const boardShell = document.querySelector<HTMLElement>(".editor-board")!;
  const drawer = document.querySelector<HTMLElement>("#tile-drawer")!;
  const nameInput = document.querySelector<HTMLInputElement>("#editor-name")!;
  const globalsEl = document.querySelector<HTMLElement>("#global-rules-editor")!;
  const areasEl = document.querySelector<HTMLElement>("#areas-editor")!;
  const toolsBtn = document.querySelector<HTMLButtonElement>("#btn-editor-tools")!;
  const toolbar = document.querySelector<HTMLElement>("#editor-toolbar")!;

  const renderer = new CanvasRenderer(canvas);
  const lexicon = createDefaultLexicon();

  let doc: DenseDoc = toDenseWorkingDoc(
    createBlankLevel(`custom-${Date.now()}`, "Untitled", 16, 12),
  );
  let layer: "objects" | "text" | "background" | "areas" | "erase" = "objects";
  let drawMode: "paint" | "box" | "fill" = "paint";
  let selected = "wall";
  let selectedArea = 1;
  let painting = false;
  let boxStart: { x: number; y: number } | null = null;
  let camera: Camera = { x: 8, y: 6, zoom: 32 };
  let userPan = false;

  const pointers = new Map<number, { x: number; y: number }>();
  let pinchStartDist = 0;
  let pinchStartZoom = 32;
  let panLast: { x: number; y: number } | null = null;
  let activelyPanning = false;

  function toolsOpen(): boolean {
    return !toolbar.hidden && !toolbar.classList.contains("is-collapsed");
  }

  function setToolsOpen(open: boolean): void {
    toolbar.hidden = !open;
    toolbar.classList.toggle("is-collapsed", !open);
    toolsBtn.setAttribute("aria-pressed", open ? "true" : "false");
  }

  function worldFromDoc(): World {
    return loadDocument(doc);
  }

  function layoutAndFit(forceFit: boolean): void {
    const world = worldFromDoc();
    const rect = boardShell.getBoundingClientRect();
    renderer.resizeViewport(Math.max(120, rect.width), Math.max(120, rect.height));
    if (forceFit || !userPan) {
      camera = renderer.cameraFitWorld(world);
      userPan = false;
    }
  }

  function redraw(): void {
    const world = worldFromDoc();
    const rect = boardShell.getBoundingClientRect();
    renderer.resizeViewport(Math.max(120, rect.width), Math.max(120, rect.height));
    if (!userPan && camera.zoom <= 0) {
      camera = renderer.cameraFitWorld(world);
    }
    const drawOpts: Parameters<CanvasRenderer["draw"]>[1] = {
      showAreas: layer === "areas",
      areaDefs: doc.areas,
      t: performance.now() / 1000,
      camera,
    };
    if (doc.portals) drawOpts.portals = doc.portals;
    renderer.draw(world, drawOpts);
  }

  function buildDrawer(): void {
    drawer.innerHTML = "";
    const cats: Array<{ title: string; items: string[]; forLayer: typeof layer }> = [
      {
        title: "Objects",
        forLayer: "objects",
        items: lexicon
          .allNouns()
          .map((n) => n.id)
          .filter((id) => id !== "text"),
      },
      {
        title: "Text",
        forLayer: "text",
        items: lexicon.allWords().map((w) => w.id),
      },
      {
        title: "Ground",
        forLayer: "background",
        items: ["grass", "grass2", "path", "water", "flower", "dirt", "stone", "bush"],
      },
    ];

    for (const cat of cats) {
      if (layer !== "erase" && layer !== "areas" && cat.forLayer !== layer) continue;
      if (layer === "areas" || layer === "erase") continue;
      const h = document.createElement("div");
      h.className = "tile-cat";
      h.textContent = cat.title;
      drawer.appendChild(h);
      for (const id of cat.items) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "tile-swatch" + (selected === id ? " is-active" : "");
        b.textContent = id;
        b.addEventListener("click", () => {
          selected = id;
          buildDrawer();
        });
        drawer.appendChild(b);
      }
    }

    if (layer === "areas") {
      const h = document.createElement("div");
      h.className = "tile-cat";
      h.textContent = "Paint area";
      drawer.appendChild(h);
      for (const a of doc.areas) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "tile-swatch" + (selectedArea === a.id ? " is-active" : "");
        b.textContent = a.name;
        b.style.borderColor = a.color;
        b.addEventListener("click", () => {
          selectedArea = a.id;
          buildDrawer();
        });
        drawer.appendChild(b);
      }
      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "tile-swatch";
      clear.textContent = "Clear (0)";
      clear.addEventListener("click", () => {
        selectedArea = 0;
        buildDrawer();
      });
      drawer.appendChild(clear);
    }
  }

  function renderGlobals(): void {
    globalsEl.innerHTML = "";
    doc.globalRules.forEach((rule, i) => {
      const row = document.createElement("div");
      row.className = "rule-row";
      row.innerHTML = `
        <input data-g="subject" data-i="${i}" value="${rule.subject}" />
        <input data-g="verb" data-i="${i}" value="${rule.verb}" />
        <input data-g="object" data-i="${i}" value="${rule.object}" />
        <button type="button" data-del-g="${i}">✕</button>`;
      globalsEl.appendChild(row);
    });
  }

  function renderAreas(): void {
    areasEl.innerHTML = "";
    doc.areas.forEach((a, i) => {
      const row = document.createElement("div");
      row.className = "area-row";
      row.innerHTML = `
        <input type="color" data-ac="${i}" value="${rgbaToHex(a.color)}" title="Color" />
        <input data-an="${i}" value="${a.name}" />
        <button type="button" data-sel-a="${a.id}">Use</button>
        <button type="button" data-del-a="${i}">✕</button>`;
      areasEl.appendChild(row);
    });
  }

  function growAndKeepView(dir: GrowDir): void {
    growDense(doc, dir);
    if (dir === "left") {
      camera = { ...camera, x: camera.x + CHUNK };
      userPan = true;
    } else if (dir === "up") {
      camera = { ...camera, y: camera.y + CHUNK };
      userPan = true;
    }
  }

  function expandForEdge(x: number, y: number): { x: number; y: number } {
    let cx = x;
    let cy = y;
    // Grow when painting on the outer rim so the map expands by one chunk.
    if (cx === 0) {
      growAndKeepView("left");
      cx += CHUNK;
    } else if (cx === doc.width - 1) {
      growAndKeepView("right");
    }
    if (cy === 0) {
      growAndKeepView("up");
      cy += CHUNK;
    } else if (cy === doc.height - 1) {
      growAndKeepView("down");
    }
    return { x: cx, y: cy };
  }

  function cellFromEvent(ev: PointerEvent): { x: number; y: number } | null {
    const rect = canvas.getBoundingClientRect();
    const worldPt = renderer.screenToWorld(ev.clientX - rect.left, ev.clientY - rect.top, camera);
    let x = Math.floor(worldPt.x);
    let y = Math.floor(worldPt.y);

    // Grow toward out-of-bounds taps (paint outside edges).
    let guard = 0;
    while (guard++ < 8) {
      if (x < 0) {
        growAndKeepView("left");
        x += CHUNK;
        continue;
      }
      if (y < 0) {
        growAndKeepView("up");
        y += CHUNK;
        continue;
      }
      if (x >= doc.width) {
        growAndKeepView("right");
        continue;
      }
      if (y >= doc.height) {
        growAndKeepView("down");
        continue;
      }
      break;
    }
    if (x < 0 || y < 0 || x >= doc.width || y >= doc.height) return null;
    return { x, y };
  }

  function applyCell(rawX: number, rawY: number): void {
    const growLayers = layer === "background" || layer === "objects" || layer === "text";
    const { x, y } = growLayers ? expandForEdge(rawX, rawY) : { x: rawX, y: rawY };
    const i = y * doc.width + x;
    if (layer === "background") {
      doc.background[i] = selected;
      return;
    }
    if (layer === "areas") {
      doc.areaMap[i] = selectedArea;
      return;
    }
    if (layer === "erase") {
      doc.entities = doc.entities.filter((e) => !(e.x === x && e.y === y));
      return;
    }
    doc.entities = doc.entities.filter(
      (e) => !(e.x === x && e.y === y && e.kind === (layer === "text" ? "text" : "object")),
    );
    doc.entities.push({
      kind: layer === "text" ? "text" : "object",
      id: selected,
      x,
      y,
    });
  }

  function applyBox(a: { x: number; y: number }, b: { x: number; y: number }): void {
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) applyCell(x, y);
    }
  }

  function flood(x: number, y: number): void {
    if (layer !== "background" && layer !== "areas") {
      applyCell(x, y);
      return;
    }
    const target =
      layer === "background" ? doc.background[y * doc.width + x] : String(doc.areaMap[y * doc.width + x]);
    const replacement = layer === "background" ? selected : String(selectedArea);
    if (target === replacement) return;
    const stack = [{ x, y }];
    const seen = new Set<string>();
    while (stack.length) {
      const c = stack.pop()!;
      const key = `${c.x},${c.y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (c.x < 0 || c.y < 0 || c.x >= doc.width || c.y >= doc.height) continue;
      const idx = c.y * doc.width + c.x;
      const cur = layer === "background" ? doc.background[idx] : String(doc.areaMap[idx]);
      if (cur !== target) continue;
      if (layer === "background") doc.background[idx] = selected;
      else doc.areaMap[idx] = selectedArea;
      stack.push(
        { x: c.x + 1, y: c.y },
        { x: c.x - 1, y: c.y },
        { x: c.x, y: c.y + 1 },
        { x: c.x, y: c.y - 1 },
      );
    }
  }

  function openDoc(next: LevelDocument): void {
    doc = toDenseWorkingDoc(structuredClone(next));
    nameInput.value = doc.name;
    if (!doc.areas.length) {
      doc.areas = [{ id: 1, name: "Area 1", color: "rgba(80,160,200,0.35)" }];
    }
    selectedArea = doc.areas[0]?.id ?? 1;
    userPan = false;
    buildDrawer();
    renderGlobals();
    renderAreas();
    api.showScreen("editor");
    requestAnimationFrame(() => {
      layoutAndFit(true);
      redraw();
      requestAnimationFrame(() => {
        layoutAndFit(true);
        redraw();
      });
    });
  }

  function newBlank(): void {
    openDoc(createBlankLevel(`custom-${Date.now()}`, "Untitled", 16, 12));
  }

  toolsBtn.addEventListener("click", () => {
    setToolsOpen(!toolsOpen());
    requestAnimationFrame(() => {
      layoutAndFit(false);
      redraw();
    });
  });

  document.querySelector("#editor-toolbar")?.addEventListener("click", (ev) => {
    const t = (ev.target as HTMLElement).closest<HTMLElement>("[data-layer],[data-draw]");
    if (!t) return;
    if (t.dataset.layer) {
      layer = t.dataset.layer as typeof layer;
      document
        .querySelectorAll("[data-layer]")
        .forEach((el) => el.classList.toggle("is-active", el === t));
      buildDrawer();
      redraw();
    }
    if (t.dataset.draw) {
      drawMode = t.dataset.draw as typeof drawMode;
      document
        .querySelectorAll("[data-draw]")
        .forEach((el) => el.classList.toggle("is-active", el === t));
    }
  });

  screen.querySelectorAll<HTMLButtonElement>("[data-ed-zoom]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      const dir = btn.dataset.edZoom;
      const factor = dir === "in" ? ZOOM_STEP : 1 / ZOOM_STEP;
      camera = zoomAround(renderer, camera, factor, renderer.viewW / 2, renderer.viewH / 2);
      userPan = true;
      redraw();
    });
  });

  globalsEl.addEventListener("input", (ev) => {
    const t = ev.target as HTMLInputElement;
    const i = Number(t.dataset.i);
    const g = t.dataset.g as "subject" | "verb" | "object" | undefined;
    if (!g || Number.isNaN(i) || !doc.globalRules[i]) return;
    doc.globalRules[i]![g] = t.value.trim().toLowerCase();
  });
  globalsEl.addEventListener("click", (ev) => {
    const t = (ev.target as HTMLElement).closest<HTMLElement>("[data-del-g]");
    if (!t) return;
    doc.globalRules.splice(Number(t.dataset.delG), 1);
    renderGlobals();
  });

  areasEl.addEventListener("click", (ev) => {
    const t = ev.target as HTMLElement;
    if (t.dataset.delA !== undefined) {
      const i = Number(t.dataset.delA);
      const removed = doc.areas[i];
      doc.areas.splice(i, 1);
      if (removed) {
        doc.areaMap = doc.areaMap.map((id) => (id === removed.id ? 0 : id));
      }
      renderAreas();
      buildDrawer();
      redraw();
    }
    if (t.dataset.selA !== undefined) {
      selectedArea = Number(t.dataset.selA);
      layer = "areas";
      document.querySelectorAll("[data-layer]").forEach((el) => {
        el.classList.toggle("is-active", (el as HTMLElement).dataset.layer === "areas");
      });
      buildDrawer();
      redraw();
    }
  });
  areasEl.addEventListener("input", (ev) => {
    const t = ev.target as HTMLInputElement;
    if (t.dataset.an !== undefined) {
      const i = Number(t.dataset.an);
      if (doc.areas[i]) doc.areas[i]!.name = t.value;
    }
    if (t.dataset.ac !== undefined) {
      const i = Number(t.dataset.ac);
      if (doc.areas[i]) doc.areas[i]!.color = hexToRgba(t.value, 0.35);
      redraw();
    }
  });

  document.querySelector("[data-action='add-global-rule']")?.addEventListener("click", () => {
    doc.globalRules.push({ subject: "baba", verb: "is", object: "you" });
    renderGlobals();
  });
  document.querySelector("[data-action='add-area']")?.addEventListener("click", () => {
    const id = (doc.areas.reduce((m, a) => Math.max(m, a.id), 0) || 0) + 1;
    doc.areas.push({
      id,
      name: `Area ${id}`,
      color: `rgba(${50 + id * 40}, ${120}, ${160}, 0.35)`,
    });
    selectedArea = id;
    renderAreas();
    buildDrawer();
  });

  document.querySelector("[data-action='editor-save']")?.addEventListener("click", () => {
    doc.name = nameInput.value.trim() || "Untitled";
    if (!doc.id.startsWith("custom-")) doc.id = `custom-${Date.now()}`;
    saveCustomLevel(migrateDenseToChunks(doc));
    statusToast("Saved");
  });

  document.querySelector("[data-action='editor-test']")?.addEventListener("click", () => {
    doc.name = nameInput.value.trim() || doc.name;
    api.openLevel(migrateDenseToChunks(doc), { fromEditor: true });
  });

  document.querySelector("[data-action='editor-back']")?.addEventListener("click", () => {
    api.showScreen("editor-hub");
  });

  // Camera gestures + paint: tools open → paint; tools collapsed → pan
  canvas.addEventListener("pointerdown", (ev) => {
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    if (pointers.size === 2) {
      painting = false;
      boxStart = null;
      const pts = [...pointers.values()];
      pinchStartDist = Math.max(1, dist(pts[0]!, pts[1]!));
      pinchStartZoom = camera.zoom;
      activelyPanning = false;
      panLast = null;
      return;
    }

    if (!toolsOpen()) {
      activelyPanning = true;
      panLast = { x: ev.clientX, y: ev.clientY };
      try {
        canvas.setPointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }

    const cell = cellFromEvent(ev);
    if (!cell) return;
    painting = true;
    try {
      canvas.setPointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
    if (drawMode === "box") {
      boxStart = cell;
      return;
    }
    if (drawMode === "fill") {
      flood(cell.x, cell.y);
      redraw();
      return;
    }
    applyCell(cell.x, cell.y);
    redraw();
  });

  canvas.addEventListener("pointermove", (ev) => {
    if (!pointers.has(ev.pointerId)) return;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    if (pointers.size >= 2) {
      const pts = [...pointers.values()];
      const a = pts[0]!;
      const b = pts[1]!;
      const d = Math.max(1, dist(a, b));
      const rect = canvas.getBoundingClientRect();
      const m = mid(a, b);
      const targetZoom = clampZoom(pinchStartZoom * (d / pinchStartDist));
      const f = targetZoom / camera.zoom;
      if (Math.abs(f - 1) > 0.001) {
        camera = zoomAround(renderer, camera, f, m.x - rect.left, m.y - rect.top);
        userPan = true;
        redraw();
      }
      return;
    }

    if (activelyPanning && panLast && !toolsOpen()) {
      const dx = ev.clientX - panLast.x;
      const dy = ev.clientY - panLast.y;
      camera = {
        ...camera,
        x: camera.x - dx / camera.zoom,
        y: camera.y - dy / camera.zoom,
      };
      panLast = { x: ev.clientX, y: ev.clientY };
      userPan = true;
      redraw();
      return;
    }

    if (!painting || drawMode !== "paint" || !toolsOpen()) return;
    const cell = cellFromEvent(ev);
    if (!cell) return;
    applyCell(cell.x, cell.y);
    redraw();
  });

  canvas.addEventListener("pointerup", (ev) => {
    pointers.delete(ev.pointerId);
    if (pointers.size < 2) pinchStartDist = 0;

    if (drawMode === "box" && boxStart && toolsOpen()) {
      const end = cellFromEvent(ev);
      if (end) applyBox(boxStart, end);
      boxStart = null;
      redraw();
    }
    painting = false;
    if (pointers.size === 0) {
      activelyPanning = false;
      panLast = null;
    } else if (pointers.size === 1 && !toolsOpen()) {
      const only = [...pointers.values()][0]!;
      activelyPanning = true;
      panLast = { x: only.x, y: only.y };
    }
  });

  canvas.addEventListener("pointercancel", () => {
    pointers.clear();
    painting = false;
    boxStart = null;
    activelyPanning = false;
    panLast = null;
  });

  new ResizeObserver(() => {
    layoutAndFit(false);
    redraw();
  }).observe(boardShell);
  void atlas.ready.then(() => {
    layoutAndFit(true);
    redraw();
  });

  return { openDoc, newBlank };
}

function statusToast(msg: string): void {
  const el = document.querySelector("#menu-note");
  if (el) el.textContent = msg;
}

function rgbaToHex(rgba: string): string {
  const m = rgba.match(/([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  if (!m) return "#50a0c8";
  const hex = (n: number) =>
    Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, "0");
  return `#${hex(+m[1]!)}${hex(+m[2]!)}${hex(+m[3]!)}`;
}

function hexToRgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
