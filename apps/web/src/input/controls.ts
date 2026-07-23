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

export interface ControlsHandle {
  destroy: () => void;
}

/**
 * Keyboard + on-screen pad + swipe → PlayerIntent.
 * Turn-based: one intent per press / completed swipe (no key-repeat spam).
 */
export function bindControls(
  onIntent: (intent: PlayerIntent) => void,
  options?: {
    root?: ParentNode;
    swipeTarget?: HTMLElement;
  },
): ControlsHandle {
  const root = options?.root ?? document;
  const cleanups: Array<() => void> = [];

  const emit = (intent: PlayerIntent) => onIntent(intent);

  // --- Keyboard ---
  const onKey = (ev: KeyboardEvent) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.repeat) return;

    const dir = KEY_TO_DIR[ev.key];
    if (dir) {
      ev.preventDefault();
      emit({ type: "move", direction: dir });
      return;
    }
    if (ev.key === "z" || ev.key === "Z" || ev.key === "u" || ev.key === "U") {
      ev.preventDefault();
      emit({ type: "undo" });
      return;
    }
    if (ev.key === "r" || ev.key === "R") {
      ev.preventDefault();
      emit({ type: "restart" });
      return;
    }
    if (ev.key === " " || ev.key === "Spacebar") {
      ev.preventDefault();
      emit({ type: "wait" });
    }
  };
  window.addEventListener("keydown", onKey);
  cleanups.push(() => window.removeEventListener("keydown", onKey));

  // --- On-screen buttons (pointer-friendly, no 300ms delay) ---
  const buttons = root.querySelectorAll<HTMLElement>("[data-intent]");
  for (const btn of buttons) {
    const fire = (ev: Event) => {
      ev.preventDefault();
      const raw = btn.dataset.intent;
      if (!raw) return;
      const intent = parseIntent(raw);
      if (intent) {
        btn.classList.add("is-pressed");
        emit(intent);
        window.setTimeout(() => btn.classList.remove("is-pressed"), 90);
      }
    };
    btn.addEventListener("pointerdown", fire);
    cleanups.push(() => btn.removeEventListener("pointerdown", fire));
  }

  // --- Swipe on board ---
  const swipeTarget = options?.swipeTarget;
  if (swipeTarget) {
    cleanups.push(bindSwipe(swipeTarget, (dir) => emit({ type: "move", direction: dir })));
  }

  return {
    destroy: () => {
      for (const c of cleanups) c();
    },
  };
}

function parseIntent(raw: string): PlayerIntent | undefined {
  switch (raw) {
    case "up":
    case "down":
    case "left":
    case "right":
      return { type: "move", direction: raw };
    case "undo":
      return { type: "undo" };
    case "restart":
      return { type: "restart" };
    case "wait":
      return { type: "wait" };
    default:
      return undefined;
  }
}

function bindSwipe(target: HTMLElement, onSwipe: (dir: Direction) => void): () => void {
  let startX = 0;
  let startY = 0;
  let tracking = false;
  let pointerId: number | null = null;

  const threshold = () => Math.max(28, Math.min(56, target.clientWidth * 0.08));

  const onDown = (ev: PointerEvent) => {
    if (ev.button !== 0 && ev.pointerType === "mouse") return;
    tracking = true;
    pointerId = ev.pointerId;
    startX = ev.clientX;
    startY = ev.clientY;
    try {
      target.setPointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onUp = (ev: PointerEvent) => {
    if (!tracking || (pointerId !== null && ev.pointerId !== pointerId)) return;
    tracking = false;
    pointerId = null;

    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const min = threshold();

    if (Math.max(absX, absY) < min) return;

    if (absX > absY) {
      onSwipe(dx > 0 ? "right" : "left");
    } else {
      onSwipe(dy > 0 ? "down" : "up");
    }
  };

  const onCancel = () => {
    tracking = false;
    pointerId = null;
  };

  target.addEventListener("pointerdown", onDown);
  target.addEventListener("pointerup", onUp);
  target.addEventListener("pointercancel", onCancel);
  target.addEventListener("lostpointercapture", onCancel);

  return () => {
    target.removeEventListener("pointerdown", onDown);
    target.removeEventListener("pointerup", onUp);
    target.removeEventListener("pointercancel", onCancel);
    target.removeEventListener("lostpointercapture", onCancel);
  };
}
