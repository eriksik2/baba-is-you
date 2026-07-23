import type {
  GameSession,
  LevelDocument,
  PlayerIntent,
  World,
} from "@baba/engine";
import {
  CAMPAIGN_LEVELS,
  GameSession as Session,
  canEnterPortal,
  createBlankLevel,
  createDefaultLexicon,
  loadDocument,
  unlockAfterClear,
} from "@baba/engine";
import { CanvasRenderer, type LerpState } from "../render/canvas-renderer";
import { atlas } from "../render/atlas";
import { bindControls } from "../input/controls";
import {
  findLevel,
  loadProgress,
  saveCustomLevel,
  saveProgress,
} from "../storage/save";

const LERP_MS = 110;

export type AppApi = {
  showScreen: (id: "menu" | "play" | "editor-hub" | "editor") => void;
  openLevel: (doc: LevelDocument, opts?: { fromEditor?: boolean; returnTo?: string }) => void;
  openOverworld: () => void;
};

export function mountPlay(api: AppApi): {
  open: (doc: LevelDocument, opts?: { fromEditor?: boolean }) => void;
  destroy: () => void;
} {
  const screen = document.querySelector<HTMLElement>("#screen-play")!;
  const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
  const boardShell = document.querySelector<HTMLElement>(".board-shell")!;
  const rulesList = document.querySelector<HTMLUListElement>("#rules-list")!;
  const statusEl = document.querySelector<HTMLParagraphElement>("#status")!;
  const levelName = document.querySelector<HTMLParagraphElement>("#level-name")!;
  const menuBtn = document.querySelector<HTMLButtonElement>("#btn-menu")!;
  const menuPanel = document.querySelector<HTMLElement>("#hamburger-panel")!;

  const renderer = new CanvasRenderer(canvas);
  let session: GameSession | null = null;
  let sourceDoc: LevelDocument | null = null;
  let fromEditor = false;
  let controls: { destroy: () => void } | null = null;
  let lerp = new Map<number, LerpState>();
  let raf = 0;
  let lastT = performance.now();
  let camera = { x: 0, y: 0 };

  function progressPortals() {
    const progress = loadProgress();
    const map: Record<string, { unlocked?: boolean; completed?: boolean }> = {};
    for (const p of session?.world.portals ?? []) {
      map[p.id] = {
        unlocked: canEnterPortal(progress, p),
        completed: progress.completedLevels.includes(p.targetLevelId),
      };
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

  function layout(): void {
    if (!session) return;
    const rect = boardShell.getBoundingClientRect();
    renderer.fit(session.world, Math.max(120, rect.width - 4), Math.max(120, rect.height - 4));
  }

  function followCamera(world: World, cell: number, pad: number): void {
    const you = world.entitiesWithProperty("you")[0];
    if (!you) {
      camera = { x: 0, y: 0 };
      return;
    }
    // Soft follow for large maps: keep YOU near view center if board CSS is clipped.
    // Current fit shrinks whole map into view, so camera stays 0 unless we zoom later.
    camera = { x: 0, y: 0 };
    void cell;
    void pad;
  }

  function drawFrame(now: number): void {
    if (!session) return;
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    renderer.particles.update(dt);
    const cell = renderer.cellSize;
    const pad = renderer.padding;
    followCamera(session.world, cell, pad);
    renderer.draw(session.world, {
      t: now / 1000,
      lerp,
      camera,
      showAreas: false,
      areaDefs: session.world.areaDefs,
      portals: session.world.portals,
      progressPortals: progressPortals(),
    });
    raf = requestAnimationFrame(drawFrame);
  }

  function captureLerp(before: World, after: World): void {
    const now = performance.now();
    const next = new Map<number, LerpState>();
    for (const e of after.entities.values()) {
      const prev = before.entities.get(e.id);
      if (!prev) continue;
      if (prev.position.x === e.position.x && prev.position.y === e.position.y) continue;
      next.set(e.id, {
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
        renderer.particles.emit(
          portal.x * 40 + 20,
          portal.y * 40 + 20,
          "spark",
          18,
        );
        open(target);
        return;
      }
    }
  }

  function onWin(): void {
    if (!session || !sourceDoc) return;
    statusEl.textContent = "Nice!";
    renderer.particles.emit(120, 80, "win", 28);
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
    layout();
    api.showScreen("play");
  }

  menuBtn.addEventListener("click", () => setMenuOpen(menuPanel.hidden));
  menuPanel.addEventListener("click", (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLElement>("[data-menu-action]");
    if (!btn) return;
    const action = btn.dataset.menuAction;
    setMenuOpen(false);
    if (action === "restart") dispatch({ type: "restart" });
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

export function mountEditor(api: AppApi): {
  openDoc: (doc: LevelDocument) => void;
  newBlank: () => void;
} {
  const canvas = document.querySelector<HTMLCanvasElement>("#editor-canvas")!;
  const boardShell = document.querySelector<HTMLElement>(".editor-board")!;
  const drawer = document.querySelector<HTMLElement>("#tile-drawer")!;
  const nameInput = document.querySelector<HTMLInputElement>("#editor-name")!;
  const globalsEl = document.querySelector<HTMLElement>("#global-rules-editor")!;
  const areasEl = document.querySelector<HTMLElement>("#areas-editor")!;
  const renderer = new CanvasRenderer(canvas);
  const lexicon = createDefaultLexicon();

  let doc: LevelDocument = createBlankLevel(`custom-${Date.now()}`, "Untitled", 16, 12);
  let layer: "objects" | "text" | "background" | "areas" | "erase" = "objects";
  let drawMode: "paint" | "box" | "fill" = "paint";
  let selected = "wall";
  let selectedArea = 1;
  let painting = false;
  let boxStart: { x: number; y: number } | null = null;

  function worldFromDoc(): World {
    return loadDocument(doc);
  }

  function redraw(): void {
    const world = worldFromDoc();
    const rect = boardShell.getBoundingClientRect();
    renderer.fit(world, Math.max(120, rect.width - 4), Math.max(120, rect.height - 4));
    renderer.draw(world, {
      showAreas: layer === "areas",
      areaDefs: doc.areas,
      ...(doc.portals ? { portals: doc.portals } : {}),
      t: performance.now() / 1000,
    });
  }

  function buildDrawer(): void {
    drawer.innerHTML = "";
    const cats: Array<{ title: string; items: string[]; forLayer: typeof layer }> = [
      {
        title: "Objects",
        forLayer: "objects",
        items: lexicon.allNouns().map((n) => n.id).filter((id) => id !== "text"),
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

  function cellFromEvent(ev: PointerEvent): { x: number; y: number } | null {
    const world = worldFromDoc();
    const rect = canvas.getBoundingClientRect();
    const cell = renderer.cellSize;
    const pad = renderer.padding;
    const x = Math.floor((ev.clientX - rect.left - pad) / cell);
    const y = Math.floor((ev.clientY - rect.top - pad) / cell);
    if (x < 0 || y < 0 || x >= world.width || y >= world.height) return null;
    return { x, y };
  }

  function applyCell(x: number, y: number): void {
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
    // Replace same kind in cell
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
    const arr = layer === "background" ? doc.background : doc.areaMap.map(String);
    const target = arr[y * doc.width + x];
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
    doc = structuredClone(next);
    nameInput.value = doc.name;
    if (!doc.areas.length) {
      doc.areas = [{ id: 1, name: "Area 1", color: "rgba(80,160,200,0.35)" }];
    }
    selectedArea = doc.areas[0]?.id ?? 1;
    buildDrawer();
    renderGlobals();
    renderAreas();
    api.showScreen("editor");
    requestAnimationFrame(redraw);
  }

  function newBlank(): void {
    openDoc(createBlankLevel(`custom-${Date.now()}`, "Untitled", 16, 12));
  }

  // Toolbar
  document.querySelector("#editor-toolbar")?.addEventListener("click", (ev) => {
    const t = (ev.target as HTMLElement).closest<HTMLElement>("[data-layer],[data-draw]");
    if (!t) return;
    if (t.dataset.layer) {
      layer = t.dataset.layer as typeof layer;
      document.querySelectorAll("[data-layer]").forEach((el) => el.classList.toggle("is-active", el === t));
      buildDrawer();
      redraw();
    }
    if (t.dataset.draw) {
      drawMode = t.dataset.draw as typeof drawMode;
      document.querySelectorAll("[data-draw]").forEach((el) => el.classList.toggle("is-active", el === t));
    }
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
    saveCustomLevel(doc);
    statusToast("Saved");
  });

  document.querySelector("[data-action='editor-test']")?.addEventListener("click", () => {
    doc.name = nameInput.value.trim() || doc.name;
    api.openLevel(doc, { fromEditor: true });
  });

  document.querySelector("[data-action='editor-back']")?.addEventListener("click", () => {
    api.showScreen("editor-hub");
  });

  canvas.addEventListener("pointerdown", (ev) => {
    const cell = cellFromEvent(ev);
    if (!cell) return;
    painting = true;
    canvas.setPointerCapture(ev.pointerId);
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
    if (!painting || drawMode !== "paint") return;
    const cell = cellFromEvent(ev);
    if (!cell) return;
    applyCell(cell.x, cell.y);
    redraw();
  });
  canvas.addEventListener("pointerup", (ev) => {
    if (drawMode === "box" && boxStart) {
      const end = cellFromEvent(ev);
      if (end) applyBox(boxStart, end);
      boxStart = null;
      redraw();
    }
    painting = false;
  });

  new ResizeObserver(() => redraw()).observe(boardShell);
  void atlas.ready.then(() => redraw());

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
