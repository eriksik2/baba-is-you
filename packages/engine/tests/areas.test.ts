import { describe, expect, test } from "bun:test";
import {
  GameSession,
  loadDocument,
  createBlankLevel,
  asNounId,
  OVERWORLD,
  type LevelDocument,
} from "../src/index";

describe("rule areas", () => {
  test("local rules only affect entities inside the area", () => {
    const doc: LevelDocument = {
      ...createBlankLevel("area-test", "Area Test", 8, 4),
      globalRules: [{ subject: "sheep", verb: "is", object: "you" }],
      areas: [{ id: 1, name: "Yard", color: "rgba(255,0,0,0.2)" }],
      areaMap: [
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 1, 1, 1, 1, 1, 0, 0,
        0, 1, 1, 1, 1, 1, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0,
      ],
      entities: [
        { kind: "text", id: "wall", x: 1, y: 1 },
        { kind: "text", id: "is", x: 2, y: 1 },
        { kind: "text", id: "stop", x: 3, y: 1 },
        { kind: "object", id: "wall", x: 4, y: 2 },
        { kind: "object", id: "wall", x: 7, y: 2 },
        { kind: "object", id: "sheep", x: 0, y: 2 },
      ],
    };

    const world = loadDocument(doc);
    const inside = world.entities.filter(
      (e) => e.kind === "object" && e.noun === asNounId("wall") && e.position.x === 4,
    )[0]!;
    const outside = world.entities.filter(
      (e) => e.kind === "object" && e.noun === asNounId("wall") && e.position.x === 7,
    )[0]!;

    expect(world.hasProperty(inside, "stop")).toBe(true);
    expect(world.hasProperty(outside, "stop")).toBe(false);
    expect(world.hasProperty(world.entitiesWithProperty("you")[0]!, "you")).toBe(true);
  });

  test("sentences do not cross area borders", () => {
    const doc: LevelDocument = {
      ...createBlankLevel("cross", "Cross", 6, 3),
      areas: [{ id: 1, name: "A", color: "#000" }],
      areaMap: [
        1, 1, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0,
      ],
      entities: [
        { kind: "text", id: "wall", x: 0, y: 0 },
        { kind: "text", id: "is", x: 1, y: 0 },
        { kind: "text", id: "stop", x: 2, y: 0 },
      ],
    };
    const world = loadDocument(doc);
    expect(world.activeFeaturesForDisplay().some((k) => k === "wall is stop")).toBe(false);
  });

  test("campaign overworld loads with global YOU", () => {
    const world = loadDocument(OVERWORLD);
    const session = new GameSession(world);
    expect(session.world.entitiesWithProperty("you").length).toBeGreaterThan(0);
    expect(session.world.isOverworld).toBe(true);
    expect(session.world.portals.length).toBeGreaterThan(0);
  });
});
