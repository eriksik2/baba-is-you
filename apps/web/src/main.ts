import "./styles.css";
import {
  GameSession,
  LEVEL_0_BABA_IS_YOU,
  loadLevel,
} from "@baba/engine";
import { CanvasRenderer } from "./render/canvas-renderer";
import { bindControls } from "./input/controls";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
const boardShell = document.querySelector<HTMLElement>(".board-shell");
const rulesList = document.querySelector<HTMLUListElement>("#rules-list");
const statusEl = document.querySelector<HTMLParagraphElement>("#status");
const levelName = document.querySelector<HTMLParagraphElement>("#level-name");
const app = document.querySelector<HTMLElement>("#app");

if (!canvas || !boardShell || !rulesList || !statusEl || !levelName || !app) {
  throw new Error("Missing DOM nodes");
}

const world = loadLevel(LEVEL_0_BABA_IS_YOU);
const session = new GameSession(world);
const renderer = new CanvasRenderer(canvas);

levelName.textContent = LEVEL_0_BABA_IS_YOU.name;

function layoutAndDraw(): void {
  const rect = boardShell!.getBoundingClientRect();
  // Leave a little breathing room so the border doesn't clip.
  const maxW = Math.max(160, rect.width - 4);
  const maxH = Math.max(160, rect.height - 4);
  renderer.fit(session.world, maxW, maxH);
  renderer.draw(session.world);
}

function refreshUi(): void {
  rulesList!.innerHTML = "";
  for (const f of session.world.rules.features) {
    if (f.key === "text is push") continue;
    const li = document.createElement("li");
    li.textContent = f.key;
    rulesList!.appendChild(li);
  }

  if (session.world.status === "won") {
    statusEl!.textContent = "Nice!";
  } else if (session.world.status === "lost") {
    statusEl!.textContent = "Oops — Restart";
  } else {
    statusEl!.textContent = "";
  }
}

function refresh(): void {
  layoutAndDraw();
  refreshUi();
}

bindControls(
  (intent) => {
    session.dispatch(intent);
    refresh();
  },
  { root: app, swipeTarget: canvas },
);

session.events.on("won", () => {
  statusEl!.textContent = "Nice!";
});

const ro = new ResizeObserver(() => {
  layoutAndDraw();
});
ro.observe(boardShell);

window.addEventListener("orientationchange", () => {
  // iOS often reports sizes a tick late.
  window.setTimeout(layoutAndDraw, 120);
});

// Prevent pull-to-refresh / accidental page scroll while interacting with the game chrome.
document.addEventListener(
  "touchmove",
  (ev) => {
    const t = ev.target;
    if (!(t instanceof Element)) return;
    if (t.closest("#rules-list")) return;
    if (t.closest(".board-shell") || t.closest(".touch-dock")) {
      ev.preventDefault();
    }
  },
  { passive: false },
);

refresh();
