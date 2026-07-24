/**
 * Turn pipeline — advances simulation one discrete step.
 *
 * Real-time play is handled by the client: it fires move/tick intents on a
 * clock while keys are held. Each intent still runs this discrete pipeline.
 *
 * Phase order:
 * 1. Apply player intent (move YOU) — skipped on tick/wait
 * 2. SLIDE one tile
 * 3. Rebuild rules if board/text changed
 * 4. Apply transforms (noun IS noun)
 * 5. Rebuild rules again if transforms occurred
 * 6. Resolve overlaps / status (win, defeat, …)
 */

import type { Direction, GameStatus } from "../types";
import type { World } from "../world/world";
import {
  createDefaultProperties,
  type PropertyRegistry,
} from "../properties";
import { applyTransforms, applySlide, moveAllYou, resolveOverlaps } from "../systems";
import {
  applyGas,
  applyDynamic,
  applyLife,
  applyFlux,
  syncPhysicsBodies,
} from "../systems/dev-behaviors";
import { HistoryStack } from "../history/stack";
import { EventBus, type GameEventMap } from "../events/bus";

export type PlayerIntent =
  | { type: "move"; direction: Direction }
  | { type: "wait" }
  | { type: "tick" }
  | { type: "undo" }
  | { type: "restart" };

export interface TurnPhase {
  readonly name: string;
  run(ctx: TurnContext): void;
}

export interface TurnContext {
  world: World;
  properties: PropertyRegistry;
  intent: PlayerIntent;
  rulesDirty: boolean;
  /** True if any entity changed cells or was destroyed this step. */
  worldChanged: boolean;
}

export interface TurnResult {
  status: GameStatus;
  rulesChanged: boolean;
  didMove: boolean;
  worldChanged: boolean;
}

export class TurnPipeline {
  constructor(
    private readonly phases: TurnPhase[],
    readonly properties: PropertyRegistry = createDefaultProperties(),
  ) {}

  run(world: World, intent: PlayerIntent): TurnResult {
    const ctx: TurnContext = {
      world,
      properties: this.properties,
      intent,
      rulesDirty: false,
      worldChanged: false,
    };

    const genBefore = world.rulesGeneration;

    for (const phase of this.phases) {
      phase.run(ctx);
    }

    return {
      status: world.status,
      rulesChanged: world.rulesGeneration !== genBefore,
      didMove: ctx.worldChanged && intent.type === "move",
      worldChanged: ctx.worldChanged || world.rulesGeneration !== genBefore,
    };
  }
}

export const moveYouPhase: TurnPhase = {
  name: "move-you",
  run(ctx) {
    if (ctx.intent.type !== "move") return;
    if (ctx.world.status !== "playing") return;
    const res = moveAllYou(ctx.world, ctx.properties, ctx.intent.direction);
    if (res.moved || res.changed) {
      ctx.rulesDirty = true;
      ctx.worldChanged = true;
    }
  },
};

export const waitPhase: TurnPhase = {
  name: "wait",
  run(ctx) {
    // WAIT / TICK: no YOU step; SLIDE still advances below.
    if (ctx.intent.type === "wait" || ctx.intent.type === "tick") {
      ctx.rulesDirty = true;
    }
  },
};

export const slidePhase: TurnPhase = {
  name: "slide",
  run(ctx) {
    if (ctx.world.status !== "playing") return;
    if (
      ctx.intent.type !== "move" &&
      ctx.intent.type !== "wait" &&
      ctx.intent.type !== "tick"
    ) {
      return;
    }
    const res = applySlide(ctx.world, ctx.properties);
    if (res.moved) {
      ctx.rulesDirty = true;
      ctx.worldChanged = true;
    }
  },
};

export const gasPhase: TurnPhase = {
  name: "gas",
  run(ctx) {
    if (ctx.world.status !== "playing") return;
    if (
      ctx.intent.type !== "move" &&
      ctx.intent.type !== "wait" &&
      ctx.intent.type !== "tick"
    ) {
      return;
    }
    if (applyGas(ctx.world, ctx.properties)) {
      ctx.rulesDirty = true;
      ctx.worldChanged = true;
    }
  },
};

export const dynamicPhase: TurnPhase = {
  name: "dynamic",
  run(ctx) {
    if (ctx.world.status !== "playing") return;
    if (
      ctx.intent.type !== "move" &&
      ctx.intent.type !== "wait" &&
      ctx.intent.type !== "tick"
    ) {
      return;
    }
    syncPhysicsBodies(ctx.world);
    if (applyDynamic(ctx.world)) {
      ctx.rulesDirty = true;
      ctx.worldChanged = true;
    }
  },
};

export const lifePhase: TurnPhase = {
  name: "life",
  run(ctx) {
    if (ctx.world.status !== "playing") return;
    if (
      ctx.intent.type !== "move" &&
      ctx.intent.type !== "wait" &&
      ctx.intent.type !== "tick"
    ) {
      return;
    }
    if (applyLife(ctx.world)) {
      ctx.rulesDirty = true;
      ctx.worldChanged = true;
    }
  },
};

export const fluxPhase: TurnPhase = {
  name: "flux",
  run(ctx) {
    if (ctx.world.status !== "playing") return;
    if (
      ctx.intent.type !== "move" &&
      ctx.intent.type !== "wait" &&
      ctx.intent.type !== "tick"
    ) {
      return;
    }
    if (applyFlux(ctx.world)) {
      ctx.rulesDirty = true;
      ctx.worldChanged = true;
    }
  },
};

export const rebuildRulesPhase: TurnPhase = {
  name: "rebuild-rules",
  run(ctx) {
    if (ctx.rulesDirty || ctx.world.rulesGeneration === 0) {
      ctx.world.rebuildRules();
      ctx.rulesDirty = false;
    }
  },
};

export const transformPhase: TurnPhase = {
  name: "transform",
  run(ctx) {
    if (ctx.world.status !== "playing") return;
    if (applyTransforms(ctx.world)) {
      ctx.rulesDirty = true;
      ctx.worldChanged = true;
    }
  },
};

export const rebuildRulesAfterTransformPhase: TurnPhase = {
  name: "rebuild-rules-after-transform",
  run(ctx) {
    if (ctx.rulesDirty) {
      ctx.world.rebuildRules();
      ctx.rulesDirty = false;
    }
  },
};

export const resolvePhase: TurnPhase = {
  name: "resolve",
  run(ctx) {
    resolveOverlaps(ctx.world, ctx.properties);
  },
};

export function createDefaultPipeline(
  properties: PropertyRegistry = createDefaultProperties(),
): TurnPipeline {
  return new TurnPipeline(
    [
      moveYouPhase,
      waitPhase,
      slidePhase,
      gasPhase,
      dynamicPhase,
      lifePhase,
      fluxPhase,
      rebuildRulesPhase,
      transformPhase,
      rebuildRulesAfterTransformPhase,
      resolvePhase,
    ],
    properties,
  );
}

/** High-level façade: world + history + pipeline + events. */
export class GameSession {
  readonly pipeline: TurnPipeline;
  readonly history: HistoryStack;
  readonly events = new EventBus<GameEventMap>();
  private initial: World;

  constructor(
    public world: World,
    options?: {
      pipeline?: TurnPipeline;
      history?: HistoryStack;
    },
  ) {
    this.pipeline = options?.pipeline ?? createDefaultPipeline();
    this.history = options?.history ?? new HistoryStack();
    this.initial = world.clone();
    this.world.rebuildRules();
  }

  dispatch(intent: PlayerIntent): TurnResult {
    if (intent.type === "undo") {
      const prev = this.history.pop();
      if (prev) this.world = prev;
      const result: TurnResult = {
        status: this.world.status,
        rulesChanged: true,
        didMove: false,
        worldChanged: true,
      };
      this.events.emit("after-turn", result);
      return result;
    }

    if (intent.type === "restart") {
      this.history.clear();
      this.world = this.initial.clone();
      this.world.rebuildRules();
      const result: TurnResult = {
        status: this.world.status,
        rulesChanged: true,
        didMove: false,
        worldChanged: true,
      };
      this.events.emit("after-turn", result);
      return result;
    }

    if (this.world.status !== "playing") {
      return {
        status: this.world.status,
        rulesChanged: false,
        didMove: false,
        worldChanged: false,
      };
    }

    const snapshot = this.world.clone();
    const statusBefore = this.world.status;
    const result = this.pipeline.run(this.world, intent);

    if (result.worldChanged || this.world.status !== statusBefore) {
      this.history.push(snapshot);
    }

    if (result.rulesChanged) {
      this.events.emit("rules-changed", {
        generation: this.world.rulesGeneration,
      });
    }
    if (result.status === "won") this.events.emit("won", {});
    if (result.status === "lost") this.events.emit("lost", {});
    this.events.emit("after-turn", result);

    return result;
  }
}
