/**
 * Turn pipeline — the single place that advances simulation time.
 *
 * Phase order (aligned with real Baba Is You):
 * 1. Snapshot (for undo) — done by GameSession
 * 2. Apply player intent (move YOU)
 * 3. Rebuild rules if board/text changed
 * 4. Apply transforms (noun IS noun)
 * 5. Rebuild rules again if transforms occurred
 * 6. Resolve overlaps / status (win, defeat, melt, …)
 */

import type { Direction, GameStatus } from "../types";
import type { World } from "../world/world";
import {
  createDefaultProperties,
  type PropertyRegistry,
} from "../properties";
import { applyTransforms, moveAllYou, resolveOverlaps } from "../systems";
import { HistoryStack } from "../history/stack";
import { EventBus, type GameEventMap } from "../events/bus";

export type PlayerIntent =
  | { type: "move"; direction: Direction }
  | { type: "wait" }
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
}

export interface TurnResult {
  status: GameStatus;
  rulesChanged: boolean;
  didMove: boolean;
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
    };

    const genBefore = world.rulesGeneration;

    for (const phase of this.phases) {
      phase.run(ctx);
    }

    return {
      status: world.status,
      rulesChanged: world.rulesGeneration !== genBefore,
      didMove: intent.type === "move",
    };
  }
}

export const moveYouPhase: TurnPhase = {
  name: "move-you",
  run(ctx) {
    if (ctx.intent.type !== "move") return;
    if (ctx.world.status !== "playing") return;
    const res = moveAllYou(ctx.world, ctx.properties, ctx.intent.direction);
    if (res.moved) ctx.rulesDirty = true;
  },
};

export const waitPhase: TurnPhase = {
  name: "wait",
  run(ctx) {
    // WAIT still advances turn-based properties (MOVE patrol later).
    if (ctx.intent.type === "wait") {
      ctx.rulesDirty = true;
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
      };
      this.events.emit("after-turn", result);
      return result;
    }

    if (this.world.status !== "playing") {
      return {
        status: this.world.status,
        rulesChanged: false,
        didMove: false,
      };
    }

    this.history.push(this.world.clone());
    const result = this.pipeline.run(this.world, intent);

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
