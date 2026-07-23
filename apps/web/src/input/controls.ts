import type { Direction, PlayerIntent } from "@baba/engine";

const KEY_TO_DIR: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  W: "up",
  s: "down",
  S: "down",
  a: "left",
  A: "left",
  d: "right",
  D: "right",
};

/**
 * Keyboard → PlayerIntent. Debounced per keydown to match turn-based feel.
 */
export function bindControls(onIntent: (intent: PlayerIntent) => void): () => void {
  const handler = (ev: KeyboardEvent) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;

    const dir = KEY_TO_DIR[ev.key];
    if (dir) {
      ev.preventDefault();
      onIntent({ type: "move", direction: dir });
      return;
    }

    if (ev.key === "z" || ev.key === "Z" || ev.key === "u" || ev.key === "U") {
      ev.preventDefault();
      onIntent({ type: "undo" });
      return;
    }

    if (ev.key === "r" || ev.key === "R") {
      ev.preventDefault();
      onIntent({ type: "restart" });
      return;
    }

    if (ev.key === " " || ev.key === "Spacebar") {
      ev.preventDefault();
      onIntent({ type: "wait" });
    }
  };

  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}
