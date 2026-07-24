import { describe, expect, test } from "bun:test";
import {
  GameSession,
  loadDocument,
  LEVEL_1,
  LEVEL_2,
  LEVEL_3,
  LEVEL_4,
  LEVEL_SPECIAL,
  LEVEL_JUNGLE_1,
  OVERWORLD,
  CAMPAIGN_LEVELS,
  asNounId,
} from "../src/index";

function textsOnWallObjects(doc: {
  entities: { kind: string; id: string; x: number; y: number }[];
}) {
  const walls = new Set(
    doc.entities
      .filter((e) => e.kind === "object" && e.id === "wall")
      .map((e) => `${e.x},${e.y}`),
  );
  return doc.entities.filter((e) => e.kind === "text" && walls.has(`${e.x},${e.y}`));
}

describe("campaign levels", () => {
  test("campaign has overworld + 4 levels + special + jungle", () => {
    const ids = CAMPAIGN_LEVELS.map((l) => l.id);
    expect(ids).toEqual([
      "overworld",
      "level-1",
      "level-2",
      "level-3",
      "level-4",
      "level-special",
      "level-jungle-1",
      "level-jungle-2",
    ]);
  });

  test("overworld is linear with special spur and jungle portals", () => {
    const portals = OVERWORLD.portals ?? [];
    expect(portals.map((p) => p.label)).toEqual([
      "I",
      "II",
      "III",
      "?",
      "IV",
      "J1",
      "J2",
    ]);
    expect(portals.find((p) => p.special)?.requires).toBe("level-2");
    expect(portals.find((p) => p.label === "J1")?.requires).toBe("level-4");
    expect(portals.find((p) => p.label === "J2")?.requires).toBe("level-jungle-1");
  });

  test("overworld loads as 32×16 pastoral map with follow camera", () => {
    const world = loadDocument(OVERWORLD);
    expect(world.width).toBe(32);
    expect(world.height).toBe(16);
    expect(world.camera.mode).toBe("follow");
    expect(world.camera.zoom).toBeGreaterThanOrEqual(48);
    expect(world.camera.zoom).toBeLessThanOrEqual(52);
    const you = world.entitiesWithProperty("you")[0]!;
    expect(you.position).toEqual({ x: 3, y: 8 });
    // Roomier clearing — not a 1-cell corridor (open above spawn)
    expect(
      world.entities
        .filter((e) => e.kind === "object" && e.noun === ("wall" as never))
        .some((e) => e.position.x === 3 && e.position.y === 7),
    ).toBe(false);
  });

  test("dense levels crop chunk padding", () => {
    const world = loadDocument(LEVEL_1);
    expect(world.width).toBe(12);
    expect(world.height).toBe(9);
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

  test("jungle-1 loads with fruit, door, and ON win sentence", () => {
    const world = loadDocument(LEVEL_JUNGLE_1);
    const objs = [...world.entities.values()].filter((e) => e.kind === "object");
    expect(objs.some((e) => e.noun === asNounId("fruit"))).toBe(true);
    expect(objs.some((e) => e.noun === asNounId("door"))).toBe(true);
    const features = world.activeFeaturesForDisplay();
    expect(features.some((k) => k.includes("fruit on door is win"))).toBe(true);
  });

  test("level-2, level-4, and special have no text on wall cells", () => {
    expect(textsOnWallObjects(LEVEL_2)).toEqual([]);
    expect(textsOnWallObjects(LEVEL_4)).toEqual([]);
    expect(textsOnWallObjects(LEVEL_SPECIAL)).toEqual([]);
  });
});
