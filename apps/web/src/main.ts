import "./styles.css";
import {
  GameSession,
  LEVEL_0_BABA_IS_YOU,
  loadLevel,
} from "@baba/engine";
import { CanvasRenderer } from "./render/canvas-renderer";
import { bindControls } from "./input/controls";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
const rulesList = document.querySelector<HTMLUListElement>("#rules-list");
const statusEl = document.querySelector<HTMLParagraphElement>("#status");
const levelName = document.querySelector<HTMLParagraphElement>("#level-name");

if (!canvas || !rulesList || !statusEl || !levelName) {
  throw new Error("Missing DOM nodes");
}

const world = loadLevel(LEVEL_0_BABA_IS_YOU);
const session = new GameSession(world);
const renderer = new CanvasRenderer(canvas, { cellSize: 52, padding: 20 });

levelName.textContent = LEVEL_0_BABA_IS_YOU.name;

function refresh(): void {
  renderer.draw(session.world);
  rulesList!.innerHTML = "";
  for (const f of session.world.rules.features) {
    if (f.key === "text is push") continue; // implicit; keep panel focused
    const li = document.createElement("li");
    li.textContent = f.key;
    rulesList!.appendChild(li);
  }
  if (session.world.status === "won") {
    statusEl!.textContent = "Congratulations!";
  } else if (session.world.status === "lost") {
    statusEl!.textContent = "Try again (R)";
  } else {
    statusEl!.textContent = "";
  }
}

bindControls((intent) => {
  session.dispatch(intent);
  refresh();
});

session.events.on("won", () => {
  statusEl!.textContent = "Congratulations!";
});

refresh();
