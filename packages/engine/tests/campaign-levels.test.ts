import { describe, expect, test } from "bun:test";
import {
  GameSession,
  loadDocument,
  LEVEL_1,
  LEVEL_2,
  LEVEL_3,
  OVERWORLD,
  CAMPAIGN_LEVELS,
} from "../src/index";

describe("campaign levels", () => {
  test("campaign has overworld + 4 levels + special", () => {
    const ids = CAMPAIGN_LEVELS.map((l) => l.id);
    expect(ids).toEqual([
      "overworld",
      "level-1",
      "level-2",
      "level-3",
      "level-4",
      "level-special",
    ]);
  });

  test("overworld is linear with special spur", () => {
    const portals = OVERWORLD.portals ?? [];
    expect(portals.map((p) => p.label)).toEqual(["I", "II", "III", "?", "IV"]);
    expect(portals.find((p) => p.special)?.requires).toBe("level-2");
  });

  test("level-1 wins by breaking STOP and reaching EXIT", () => {
    const session = new GameSession(loadDocument(LEVEL_1));
    for (const direction of [
      "up",
      "right",
      "right",
      "up",
      "down",
      "down",
      "right",
      "right",
      "right",
      "right",
      "right",
      "right",
    ] as const) {
      session.dispatch({ type: "move", direction });
      if (session.world.status === "won") break;
    }
    expect(session.world.status).toBe("won");
  });

  test("level-2 and level-3 load with expected globals", () => {
    const s2 = new GameSession(loadDocument(LEVEL_2));
    expect(s2.world.entitiesWithProperty("you").length).toBe(1);
    expect(s2.world.activeFeaturesForDisplay().some((k) => k.includes("rock is push"))).toBe(
      true,
    );

    const s3 = new GameSession(loadDocument(LEVEL_3));
    expect(s3.world.activeFeaturesForDisplay().some((k) => k.includes("rock is pull"))).toBe(
      true,
    );
  });
});
