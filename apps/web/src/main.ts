import "./styles.css";
import {
  CAMPAIGN_LEVELS,
  DEV_WORLD,
  OVERWORLD,
  type LevelDocument,
} from "@baba/engine";
import { atlas, CREDITS } from "./render/atlas";
import { mountEditor, mountPlay, type AppApi } from "./screens/play-editor";
import { findLevel, loadCustomLevels, loadProgress } from "./storage/save";

const screens = {
  menu: document.querySelector<HTMLElement>("#screen-menu")!,
  play: document.querySelector<HTMLElement>("#screen-play")!,
  "editor-hub": document.querySelector<HTMLElement>("#screen-editor-hub")!,
  editor: document.querySelector<HTMLElement>("#screen-editor")!,
};

function showScreen(id: keyof typeof screens): void {
  for (const [key, el] of Object.entries(screens)) {
    const active = key === id;
    el.classList.toggle("is-active", active);
    el.hidden = !active;
  }
  const panel = document.querySelector<HTMLElement>("#hamburger-panel");
  if (panel) panel.hidden = true;
}

const api: AppApi = {
  showScreen,
  openLevel(doc, opts) {
    play.open(doc, opts?.fromEditor ? { fromEditor: true } : {});
  },
  openOverworld() {
    const doc = findLevel("overworld") ?? OVERWORLD;
    play.open(doc);
  },
  openDevWorld() {
    const doc = findLevel("dev-world") ?? DEV_WORLD;
    play.open(structuredClone(doc) as LevelDocument);
  },
};

const play = mountPlay(api);
const editor = mountEditor(api);

document.querySelector("[data-action='play']")?.addEventListener("click", () => {
  api.openOverworld();
});

document.querySelector("[data-action='dev-world']")?.addEventListener("click", () => {
  api.openDevWorld();
});

document.querySelector("[data-action='editor']")?.addEventListener("click", () => {
  showScreen("editor-hub");
  hidePicker();
});

document.querySelector("[data-action='credits']")?.addEventListener("click", () => {
  const note = document.querySelector("#menu-note");
  if (note) note.textContent = CREDITS;
});

document.querySelector("[data-action='back-menu']")?.addEventListener("click", () => {
  showScreen("menu");
});

document.querySelector("[data-action='editor-new']")?.addEventListener("click", () => {
  editor.newBlank();
});

document.querySelector("[data-action='editor-load-campaign']")?.addEventListener("click", () => {
  showPicker(
    CAMPAIGN_LEVELS.map((l) => ({ id: l.id, label: `${l.name} (${l.id})` })),
    (id) => {
      const doc = findLevel(id);
      if (doc) editor.openDoc(structuredClone(doc) as LevelDocument);
    },
  );
});

document.querySelector("[data-action='editor-load-custom']")?.addEventListener("click", () => {
  const custom = loadCustomLevels();
  if (!custom.length) {
    const note = document.querySelector("#menu-note");
    showScreen("menu");
    if (note) note.textContent = "No saved levels yet — create one with New.";
    return;
  }
  showPicker(
    custom.map((l) => ({ id: l.id, label: l.name })),
    (id) => {
      const doc = custom.find((c) => c.id === id);
      if (doc) editor.openDoc(structuredClone(doc));
    },
  );
});

function hidePicker(): void {
  const picker = document.querySelector<HTMLElement>("#editor-picker");
  if (picker) {
    picker.hidden = true;
    picker.innerHTML = "";
  }
}

function showPicker(
  items: Array<{ id: string; label: string }>,
  onPick: (id: string) => void,
): void {
  const picker = document.querySelector<HTMLElement>("#editor-picker")!;
  picker.hidden = false;
  picker.innerHTML = "";
  for (const item of items) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = item.label;
    b.addEventListener("click", () => {
      hidePicker();
      onPick(item.id);
    });
    picker.appendChild(b);
  }
}

document.addEventListener(
  "touchmove",
  (ev) => {
    const t = ev.target;
    if (!(t instanceof Element)) return;
    if (
      t.closest("#rules-list") ||
      t.closest(".tile-drawer") ||
      t.closest(".picker-list") ||
      t.closest(".word-picker") ||
      t.closest(".dev-rules-panel")
    ) {
      return;
    }
    if (t.closest(".board-shell") || t.closest(".touch-dock") || t.closest("#screen-menu")) {
      if (t.closest("#screen-menu")) return;
      ev.preventDefault();
    }
  },
  { passive: false },
);

void atlas.ready;
const progress = loadProgress();
const note = document.querySelector("#menu-note");
if (note && progress.completedLevels.length) {
  note.textContent = `Cleared ${progress.completedLevels.length} level(s).`;
}

showScreen("menu");
