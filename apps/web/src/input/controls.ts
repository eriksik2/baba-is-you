import type { Direction, PlayerIntent } from "@sheep/engine";

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
  /** Currently held move direction, if any (realtime). */
  heldDirection: () => Direction | null;
}

/**
 * Keyboard + on-screen pad + swipe → held direction + discrete intents.
 * Realtime: hold a direction; the play loop steps on a clock.
 * Undo / restart remain one-shot.
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
  const held = new Set<Direction>();
  let padHeld: Direction | null = null;
  let swipeHeld: Direction | null = null;

  const emit = (intent: PlayerIntent) => onIntent(intent);

  const primaryHeld = (): Direction | null => {
    if (padHeld) return padHeld;
    if (swipeHeld) return swipeHeld;
    // Prefer most recently pressed among keyboard holds — last in insertion order.
    let last: Direction | null = null;
    for (const d of held) last = d;
    return last;
  };

  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;

    const dir = KEY_TO_DIR[ev.key];
    if (dir) {
      ev.preventDefault();
      held.add(dir);
      return;
    }
    if (ev.repeat) return;
    if (ev.key === "z" || ev.key === "Z" || ev.key === "u" || ev.key === "U") {
      ev.preventDefault();
      emit({ type: "undo" });
      return;
    }
    if (ev.key === "r" || ev.key === "R") {
      ev.preventDefault();
      emit({ type: "restart" });
    }
  };

  const onKeyUp = (ev: KeyboardEvent) => {
    const dir = KEY_TO_DIR[ev.key];
    if (dir) held.delete(dir);
  };

  const onBlur = () => held.clear();

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  cleanups.push(() => window.removeEventListener("keydown", onKeyDown));
  cleanups.push(() => window.removeEventListener("keyup", onKeyUp));
  cleanups.push(() => window.removeEventListener("blur", onBlur));

  const buttons = root.querySelectorAll<HTMLElement>("[data-intent]");
  for (const btn of buttons) {
    const raw = btn.dataset.intent;
    if (!raw) continue;

    if (raw === "up" || raw === "down" || raw === "left" || raw === "right") {
      const dir = raw as Direction;
      const down = (ev: Event) => {
        ev.preventDefault();
        padHeld = dir;
        btn.classList.add("is-pressed");
      };
      const up = () => {
        if (padHeld === dir) padHeld = null;
        btn.classList.remove("is-pressed");
      };
      btn.addEventListener("pointerdown", down);
      btn.addEventListener("pointerup", up);
      btn.addEventListener("pointerleave", up);
      btn.addEventListener("pointercancel", up);
      cleanups.push(() => {
        btn.removeEventListener("pointerdown", down);
        btn.removeEventListener("pointerup", up);
        btn.removeEventListener("pointerleave", up);
        btn.removeEventListener("pointercancel", up);
      });
      continue;
    }

    const fire = (ev: Event) => {
      ev.preventDefault();
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

  const swipeTarget = options?.swipeTarget;
  if (swipeTarget) {
    cleanups.push(
      bindHoldSwipe(swipeTarget, {
        onHold: (dir) => {
          swipeHeld = dir;
        },
        onRelease: () => {
          swipeHeld = null;
        },
      }),
    );
  }

  return {
    destroy: () => {
      for (const c of cleanups) c();
      held.clear();
      padHeld = null;
      swipeHeld = null;
    },
    heldDirection: primaryHeld,
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

function bindHoldSwipe(
  target: HTMLElement,
  hooks: { onHold: (dir: Direction) => void; onRelease: () => void },
): () => void {
  let startX = 0;
  let startY = 0;
  let tracking = false;
  let pointerId: number | null = null;
  let active: Direction | null = null;

  const threshold = () => Math.max(24, Math.min(48, target.clientWidth * 0.06));

  const dirFrom = (dx: number, dy: number): Direction | null => {
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const min = threshold();
    if (Math.max(absX, absY) < min) return null;
    return absX > absY ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
  };

  const onDown = (ev: PointerEvent) => {
    if (ev.button !== 0 && ev.pointerType === "mouse") return;
    tracking = true;
    pointerId = ev.pointerId;
    startX = ev.clientX;
    startY = ev.clientY;
    active = null;
    try {
      target.setPointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onMove = (ev: PointerEvent) => {
    if (!tracking || (pointerId !== null && ev.pointerId !== pointerId)) return;
    const next = dirFrom(ev.clientX - startX, ev.clientY - startY);
    if (next && next !== active) {
      active = next;
      hooks.onHold(next);
    }
  };

  const end = () => {
    tracking = false;
    pointerId = null;
    if (active) {
      active = null;
      hooks.onRelease();
    }
  };

  target.addEventListener("pointerdown", onDown);
  target.addEventListener("pointermove", onMove);
  target.addEventListener("pointerup", end);
  target.addEventListener("pointercancel", end);
  target.addEventListener("lostpointercapture", end);

  return () => {
    target.removeEventListener("pointerdown", onDown);
    target.removeEventListener("pointermove", onMove);
    target.removeEventListener("pointerup", end);
    target.removeEventListener("pointercancel", end);
    target.removeEventListener("lostpointercapture", end);
  };
}
