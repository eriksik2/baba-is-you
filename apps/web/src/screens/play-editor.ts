import type {
  GameSession,
  GlobalRuleSpec,
  LevelCameraSettings,
  LevelDocument,
  LevelEntitySpec,
  PlayerIntent,
  World,
} from "@baba/engine";
import {
  CAMPAIGN_LEVELS,
  DEFAULT_CAMERA,
  DEFAULT_CHUNK_SIZE,
  GameSession as Session,
  canEnterPortal,
  createBlankLevel,
  createDefaultLexicon,
  globalRuleWords,
  loadDocument,
  migrateDenseToChunks,
  resolveCamera,
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
import {
  emptyGlobalRule,
  mountRuleSentenceEditor,
} from "../ui/rule-sentence";
const LERP_MS = 110;
const STEP_MS = 120;
const FOLLOW = 0.22;
const ZOOM_MIN = 14;
const ZOOM_MAX = 96;
const ZOOM_STEP = 1.2;
const CHUNK = DEFAULT_CHUNK_SIZE;
/** Reference play viewport used for editor camera outline. */
const PREVIEW_VIEW_W = 360;
const PREVIEW_VIEW_H = 420;

export type AppApi = {
  showScreen: (id: "menu" | "play" | "editor-hub" | "editor") => void;
  openLevel: (doc: LevelDocument, opts?: { fromEditor?: boolean; returnTo?: string }) => void;
  openOverworld: () => void;
  openDevWorld: () => void;
};

function clampZoom(z: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
}

function ensureCamera(doc: LevelDocument): LevelCameraSettings {
  return { ...DEFAULT_CAMERA, ...(doc.camera ?? {}) };
}

function cellCenter(pos: { x: number; y: number }): { x: number; y: number } {
  return { x: pos.x + 0.5, y: pos.y + 0.5 };
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
  const devPanel = document.querySelector<HTMLDetailsElement>("#dev-rules-panel")!;
  const devRulesEl = document.querySelector<HTMLElement>("#dev-global-rules")!;
  const devAddBtn = document.querySelector<HTMLButtonElement>("#btn-dev-add-rule")!;

  const renderer = new CanvasRenderer(canvas);
  let session: GameSession | null = null;
  let sourceDoc: LevelDocument | null = null;
  let fromEditor = false;
  let controls: ControlsHandle | null = null;
  let lerp = new Map<number, LerpState>();
  let raf = 0;
  let lastT = performance.now();
  let stepAccum = 0;
  let lastHeldDir: string | null = null;
  let camera: Camera = { x: 0, y: 0, zoom: 48 };
  let youFocus = 0;
  let isDevWorld = false;

  const devRulesEditor = mountRuleSentenceEditor({
    root: devRulesEl,
    onChange: (rules) => {
      if (!session || !sourceDoc || !isDevWorld) return;
      sourceDoc.globalRules = rules.map((r) => ({
        ...r,
        words: [...globalRuleWords(r)],
      }));
      session.world.globalRuleSpecs = sourceDoc.globalRules.map((r) => ({
        ...r,
        words: [...(r.words ?? globalRuleWords(r))],
      }));
      session.world.rebuildRules();
      refreshRules();
    },
  });

  const youSwitcher = document.querySelector<HTMLElement>("#you-switcher")!;
  const youLabel = document.querySelector<HTMLElement>("#you-label")!;
  const youPrev = document.querySelector<HTMLButtonElement>("#you-prev")!;
  const youNext = document.querySelector<HTMLButtonElement>("#you-next")!;

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

  function youList() {
    return session?.world.entitiesWithProperty("you") ?? [];
  }

  function activeCameraSettings(): LevelCameraSettings {
    if (!session) return { ...DEFAULT_CAMERA };
    const yous = youList();
    const focus = yous[Math.min(youFocus, Math.max(0, yous.length - 1))];
    const areaId = focus ? session.world.areaAt(focus.position) : 0;
    return resolveCamera(session.world.camera, session.world.areaDefs, areaId);
  }

  function refreshYouSwitcher(): void {
    const settings = activeCameraSettings();
    const yous = youList();
    const show = settings.mode === "follow" && yous.length > 1;
    youSwitcher.hidden = !show;
    if (!show) return;
    if (youFocus >= yous.length) youFocus = 0;
    youLabel.textContent = `${youFocus + 1}/${yous.length}`;
  }

  function refreshRules(): void {
    rulesList.innerHTML = "";
    const yous = youList();
    const you = yous[Math.min(youFocus, Math.max(0, yous.length - 1))] ?? yous[0];
    const focus = you ? session!.world.areaAt(you.position) : undefined;
    for (const key of session?.world.activeFeaturesForDisplay(focus) ?? []) {
      const li = document.createElement("li");
      li.textContent = key;
      rulesList.appendChild(li);
    }
  }

  function youCenter(): { x: number; y: number } | null {
    if (!session) return null;
    const yous = youList();
    if (!yous.length) return null;
    const you = yous[Math.min(youFocus, yous.length - 1)]!;
    // Prefer lerped draw position so the camera tracks the slide.
    const anim = lerp.get(you.id as unknown as number);
    if (anim) {
      const now = performance.now();
      const u = Math.max(0, Math.min(1, (now - anim.start) / anim.duration));
      const eased = 1 - (1 - u) * (1 - u);
      return {
        x: anim.fromX + (anim.toX - anim.fromX) * eased + 0.5,
        y: anim.fromY + (anim.toY - anim.fromY) * eased + 0.5,
      };
    }
    return cellCenter(you.position);
  }

  function snapCamera(): void {
    if (!session) return;
    const settings = activeCameraSettings();
    const zoom = clampZoom(settings.zoom);
    if (settings.mode === "fixed") {
      camera = {
        x: settings.x ?? session.world.width / 2,
        y: settings.y ?? session.world.height / 2,
        zoom,
      };
      return;
    }
    const c = youCenter() ?? {
      x: session.world.width / 2,
      y: session.world.height / 2,
    };
    camera = { x: c.x, y: c.y, zoom };
  }

  function layout(): void {
    if (!session) return;
    const rect = boardShell.getBoundingClientRect();
    renderer.resizeViewport(Math.max(120, rect.width), Math.max(120, rect.height));
    const settings = activeCameraSettings();
    camera = { ...camera, zoom: clampZoom(settings.zoom) };
  }

  function updateCamera(): void {
    if (!session) return;
    const settings = activeCameraSettings();
    const zoom = clampZoom(settings.zoom);
    if (settings.mode === "fixed") {
      camera = {
        x: settings.x ?? session.world.width / 2,
        y: settings.y ?? session.world.height / 2,
        zoom,
      };
      return;
    }
    const c = youCenter();
    if (!c) {
      camera = { ...camera, zoom };
      return;
    }
    camera = {
      x: camera.x + (c.x - camera.x) * FOLLOW,
      y: camera.y + (c.y - camera.y) * FOLLOW,
      zoom,
    };
  }

  function drawFrame(now: number): void {
    // Always reschedule — an early return before this used to kill the loop
    // while session was still null on boot, leaving a permanent black board.
    raf = requestAnimationFrame(drawFrame);
    if (!session) return;
    const dtMs = Math.min(50, now - lastT);
    lastT = now;

    // Realtime step clock: held direction → move; otherwise tick (slide etc.).
    if (session.world.status === "playing") {
      const dir = controls?.heldDirection() ?? null;
      if (dir && dir !== lastHeldDir) stepAccum = STEP_MS; // first press steps immediately
      lastHeldDir = dir;
      stepAccum += dtMs;
      while (stepAccum >= STEP_MS) {
        stepAccum -= STEP_MS;
        if (dir) dispatch({ type: "move", direction: dir });
        else dispatch({ type: "tick" });
        if (!session || session.world.status !== "playing") break;
      }
    } else {
      stepAccum = 0;
      lastHeldDir = null;
    }

    renderer.particles.update(dtMs / 1000);
    refreshYouSwitcher();
    updateCamera();
    renderer.draw(session.world, {
      t: now / 1000,
      lerp,
      camera,
      showAreas: isDevWorld,
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

  /** Mark the level cleared and return to overworld (for testing stuck levels). */
  function skipLevel(): void {
    if (!session || !sourceDoc) return;
    if (sourceDoc.isOverworld || fromEditor || isDevWorld) {
      if (fromEditor) api.showScreen("editor");
      else api.showScreen("menu");
      return;
    }
    statusEl.textContent = "Skipped";
    let progress = loadProgress();
    progress = unlockAfterClear(progress, sourceDoc.id, CAMPAIGN_LEVELS);
    saveProgress(progress);
    api.openOverworld();
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
    isDevWorld = doc.id === "dev-world";
    stepAccum = 0;
    const world = loadDocument(doc);
    const progress = loadProgress();
    if (doc.isOverworld && progress.overworldPos) {
      const you = world.entitiesWithProperty("you")[0];
      const pos = progress.overworldPos;
      if (you && world.grid.inBounds(pos)) {
        // Ignore stale saves from older overworld layouts (would land inside walls).
        const blocked = world.entities
          .all()
          .some(
            (e) =>
              e.alive &&
              e.position.x === pos.x &&
              e.position.y === pos.y &&
              world.hasProperty(e, "stop"),
          );
        if (!blocked) world.moveEntity(you.id, pos);
      }
    }
    session = new Session(world);
    youFocus = 0;
    levelName.textContent = doc.name;
    statusEl.textContent = "";
    setMenuOpen(false);
    refreshRules();
    refreshYouSwitcher();
    screen.classList.toggle("dev-world", isDevWorld);
    devPanel.hidden = !isDevWorld;
    if (isDevWorld) {
      const rules: GlobalRuleSpec[] = (sourceDoc.globalRules ?? []).map((r) => ({
        ...r,
        words: [...globalRuleWords(r)],
      }));
      if (!rules.length) rules.push(emptyGlobalRule());
      sourceDoc.globalRules = rules;
      session.world.globalRuleSpecs = rules.map((r) => ({ ...r }));
      session.world.rebuildRules();
      refreshRules();
      devRulesEditor.render(rules);
      devPanel.open = true;
    }
    api.showScreen("play");
    layout();
    snapCamera();
    // Paint immediately so the first frame isn't a blank shell while rAF catches up.
    renderer.draw(session.world, {
      t: performance.now() / 1000,
      lerp,
      camera,
      showAreas: isDevWorld,
      areaDefs: session.world.areaDefs,
      portals: session.world.portals,
      progressPortals: progressPortals(),
    });
    requestAnimationFrame(() => {
      layout();
      snapCamera();
    });
  }

  menuBtn.addEventListener("click", () => setMenuOpen(menuPanel.hidden));
  menuPanel.addEventListener("click", (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLElement>("[data-menu-action]");
    if (!btn) return;
    const action = btn.dataset.menuAction;
    setMenuOpen(false);
    if (action === "restart") dispatch({ type: "restart" });
    if (action === "skip") skipLevel();
    if (action === "recenter") snapCamera();
    if (action === "exit") {
      if (fromEditor) api.showScreen("editor");
      else api.showScreen("menu");
    }
  });

  youPrev.addEventListener("click", () => {
    const n = youList().length;
    if (n < 2) return;
    youFocus = (youFocus - 1 + n) % n;
    refreshYouSwitcher();
    refreshRules();
    snapCamera();
  });
  youNext.addEventListener("click", () => {
    const n = youList().length;
    if (n < 2) return;
    youFocus = (youFocus + 1) % n;
    refreshYouSwitcher();
    refreshRules();
    snapCamera();
  });

  devAddBtn.addEventListener("click", () => {
    if (!sourceDoc || !session || !isDevWorld) return;
    const rules = [...(sourceDoc.globalRules ?? []), emptyGlobalRule()];
    sourceDoc.globalRules = rules;
    session.world.globalRuleSpecs = rules.map((r) => ({ ...r }));
    session.world.rebuildRules();
    refreshRules();
    devRulesEditor.render(rules);
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
      devRulesEditor.destroy();
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
  if (doc.camera?.mode === "fixed") {
    doc.camera = {
      ...doc.camera,
      x: (doc.camera.x ?? 0) + ox,
      y: (doc.camera.y ?? 0) + oy,
    };
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
  dense.camera = ensureCamera(src.camera ? src : { ...src, camera: world.camera });
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
  const camMode = document.querySelector<HTMLSelectElement>("#cam-mode")!;
  const camZoom = document.querySelector<HTMLInputElement>("#cam-zoom")!;
  const camZoomVal = document.querySelector<HTMLElement>("#cam-zoom-val")!;
  const camFixedFields = document.querySelector<HTMLElement>("#cam-fixed-fields")!;
  const camX = document.querySelector<HTMLInputElement>("#cam-x")!;
  const camY = document.querySelector<HTMLInputElement>("#cam-y")!;
  const camCenterMap = document.querySelector<HTMLButtonElement>("#cam-center-map")!;

  const renderer = new CanvasRenderer(canvas);
  const lexicon = createDefaultLexicon();

  let doc: DenseDoc = toDenseWorkingDoc(
    createBlankLevel(`custom-${Date.now()}`, "Untitled", 16, 12),
  );

  const globalsEditor = mountRuleSentenceEditor({
    root: globalsEl,
    lexicon,
    onChange: (rules) => {
      doc.globalRules = rules.map((r) => ({
        ...r,
        words: [...globalRuleWords(r)],
      }));
    },
  });

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
    return screen.classList.contains("tools-open");
  }

  function setToolsOpen(open: boolean): void {
    toolbar.hidden = !open;
    toolbar.classList.toggle("is-collapsed", !open);
    screen.classList.toggle("tools-open", open);
    toolsBtn.classList.toggle("is-active", open);
    toolsBtn.setAttribute("aria-pressed", open ? "true" : "false");
    toolsBtn.textContent = open ? "Board" : "Tools";
    toolsBtn.setAttribute(
      "aria-label",
      open ? "Hide tools for full board view" : "Show editor tools",
    );
    const meta = document.querySelector<HTMLDetailsElement>("#editor-meta");
    if (meta && !open) meta.open = false;
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

  function cameraPreviewCenter(): { x: number; y: number } {
    const settings = ensureCamera(doc);
    if (settings.mode === "fixed") {
      return {
        x: settings.x ?? doc.width / 2,
        y: settings.y ?? doc.height / 2,
      };
    }
    const you = doc.entities.find((e) => e.kind === "object" && e.id === "baba");
    if (you) return cellCenter(you);
    if (doc.spawn) return cellCenter(doc.spawn);
    return { x: doc.width / 2, y: doc.height / 2 };
  }

  function syncCameraForm(): void {
    const settings = ensureCamera(doc);
    doc.camera = settings;
    camMode.value = settings.mode;
    camZoom.value = String(Math.round(settings.zoom));
    camZoomVal.textContent = String(Math.round(settings.zoom));
    camFixedFields.hidden = settings.mode !== "fixed";
    const cx = settings.x ?? doc.width / 2;
    const cy = settings.y ?? doc.height / 2;
    camX.value = String(cx);
    camY.value = String(cy);
  }

  function readCameraForm(): void {
    const mode = camMode.value === "fixed" ? "fixed" : "follow";
    const zoom = clampZoom(Number(camZoom.value) || DEFAULT_CAMERA.zoom);
    const next: LevelCameraSettings = { mode, zoom };
    if (mode === "fixed") {
      next.x = Number(camX.value);
      next.y = Number(camY.value);
      if (Number.isNaN(next.x)) next.x = doc.width / 2;
      if (Number.isNaN(next.y)) next.y = doc.height / 2;
    }
    doc.camera = next;
    camZoomVal.textContent = String(Math.round(zoom));
    camFixedFields.hidden = mode !== "fixed";
  }

  function redraw(): void {
    const world = worldFromDoc();
    const rect = boardShell.getBoundingClientRect();
    renderer.resizeViewport(Math.max(120, rect.width), Math.max(120, rect.height));
    if (!userPan && camera.zoom <= 0) {
      camera = renderer.cameraFitWorld(world);
    }
    const settings = ensureCamera(doc);
    const previewCenter = cameraPreviewCenter();
    const drawOpts: Parameters<CanvasRenderer["draw"]>[1] = {
      showAreas: layer === "areas",
      areaDefs: doc.areas,
      t: performance.now() / 1000,
      camera,
      cameraPreview: {
        cx: previewCenter.x,
        cy: previewCenter.y,
        zoom: clampZoom(settings.zoom),
        viewW: PREVIEW_VIEW_W,
        viewH: PREVIEW_VIEW_H,
        mode: settings.mode,
      },
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
    const rules: GlobalRuleSpec[] = (doc.globalRules ?? []).map((r) => ({
      ...r,
      words: [...globalRuleWords(r)],
    }));
    doc.globalRules = rules;
    globalsEditor.render(rules);
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
    if (!doc.camera) doc.camera = { ...DEFAULT_CAMERA };
    buildDrawer();
    renderGlobals();
    renderAreas();
    syncCameraForm();
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
      requestAnimationFrame(() => {
        layoutAndFit(false);
        redraw();
      });
    });
  });

  // Start with tools visible so painting works immediately.
  setToolsOpen(true);

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
    doc.globalRules.push(emptyGlobalRule());
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

  const onCamChange = () => {
    readCameraForm();
    redraw();
  };
  camMode.addEventListener("change", onCamChange);
  camZoom.addEventListener("input", onCamChange);
  camX.addEventListener("change", onCamChange);
  camY.addEventListener("change", onCamChange);
  camCenterMap.addEventListener("click", () => {
    camX.value = String(doc.width / 2);
    camY.value = String(doc.height / 2);
    readCameraForm();
    redraw();
  });

  document.querySelector("[data-action='editor-save']")?.addEventListener("click", () => {
    doc.name = nameInput.value.trim() || "Untitled";
    readCameraForm();
    if (!doc.id.startsWith("custom-")) doc.id = `custom-${Date.now()}`;
    saveCustomLevel(migrateDenseToChunks(doc));
    statusToast("Saved");
  });

  document.querySelector("[data-action='editor-test']")?.addEventListener("click", () => {
    doc.name = nameInput.value.trim() || doc.name;
    readCameraForm();
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
