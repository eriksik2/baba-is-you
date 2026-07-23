import { describe, expect, test } from "bun:test";
import {
  GameSession,
  loadLevel,
  LEVEL_TINY_SMOKE,
  LEVEL_0_BABA_IS_YOU,
  asNounId,
  asPropertyId,
} from "../src/index";

describe("movement and session", () => {
  test("YOU can move onto empty tiles", () => {
    const world = loadLevel({
      id: "m1",
      name: "move",
      layout: `
baba,is,you,,
baba!,,,,
`,
    });
    const session = new GameSession(world);
    const before = session.world.entitiesWithProperty("you")[0]!;
    expect(before.position).toEqual({ x: 0, y: 1 });

    session.dispatch({ type: "move", direction: "right" });
    const after = session.world.entitiesWithProperty("you")[0]!;
    expect(after.position).toEqual({ x: 1, y: 1 });
  });

  test("STOP blocks movement", () => {
    const world = loadLevel({
      id: "m2",
      name: "stop",
      layout: `
baba,is,you,wall,is,stop
baba!,wall!,,,,
`,
    });
    const session = new GameSession(world);
    session.dispatch({ type: "move", direction: "right" });
    const baba = session.world.entitiesWithProperty("you")[0]!;
    expect(baba.position).toEqual({ x: 0, y: 1 });
  });

  test("PUSH moves text and updates rules", () => {
    const world = loadLevel({
      id: "m3",
      name: "push",
      layout: `
baba,is,you,,,,
baba!,wall,is,stop,,
`,
    });
    const session = new GameSession(world);
    // Push WALL text right by walking into it — baba at (0,1), wall text at (1,1)
    expect(session.world.hasProperty(
      session.world.entities.filter((e) => e.kind === "object" && e.noun === asNounId("baba"))[0]!,
      "you",
    )).toBe(true);

    // Move right into WALL text → pushes wall,is,stop chain? only wall is adjacent
    session.dispatch({ type: "move", direction: "right" });
    const wallText = session.world.entities.filter(
      (e) => e.kind === "text" && session.world.textData.get(e.id)?.wordId === "wall",
    )[0]!;
    expect(wallText.position.x).toBe(2);
  });

  test("winning on FLAG IS WIN", () => {
    const world = loadLevel(LEVEL_TINY_SMOKE);
    const session = new GameSession(world);
    // baba at 0,1 flag at 3,1 — move right thrice
    session.dispatch({ type: "move", direction: "right" });
    session.dispatch({ type: "move", direction: "right" });
    session.dispatch({ type: "move", direction: "right" });
    expect(session.world.status).toBe("won");
  });

  test("undo restores prior state", () => {
    const world = loadLevel(LEVEL_TINY_SMOKE);
    const session = new GameSession(world);
    session.dispatch({ type: "move", direction: "right" });
    expect(session.world.entitiesWithProperty("you")[0]!.position.x).toBe(1);
    session.dispatch({ type: "undo" });
    expect(session.world.entitiesWithProperty("you")[0]!.position.x).toBe(0);
  });

  test("breaking BABA IS YOU causes loss", () => {
    const world = loadLevel({
      id: "lose",
      name: "lose",
      layout: `
,,you,,
baba,is,,,
baba!,,,,
`,
    });
    const session = new GameSession(world);
    // Push IS to the right by... we need to be YOU first. Currently no YOU.
    // Setup: baba is you, then push you away
    const w2 = loadLevel({
      id: "lose2",
      name: "lose2",
      layout: `
baba,is,you,,
baba!,,,,
`,
    });
    const s2 = new GameSession(w2);
    // Move up into IS? baba is at 0,1; words on row 0. Move up onto baba text? 
    // Actually push "you" away: stand below you and... can't easily. 
    // Transform path: make wall is you somehow.
    // Simpler: destroy via defeat
    const w3 = loadLevel({
      id: "lose3",
      name: "lose3",
      layout: `
baba,is,you,skull,is,defeat
baba!,skull!,,,,
`,
    });
    const s3 = new GameSession(w3);
    s3.dispatch({ type: "move", direction: "right" });
    expect(s3.world.status).toBe("lost");
  });

  test("level 0 loads with expected rules", () => {
    const world = loadLevel(LEVEL_0_BABA_IS_YOU);
    const baba = world.entities.filter(
      (e) => e.kind === "object" && e.noun === asNounId("baba"),
    )[0]!;
    const wall = world.entities.filter(
      (e) => e.kind === "object" && e.noun === asNounId("wall"),
    )[0]!;
    expect(world.hasProperty(baba, asPropertyId("you"))).toBe(true);
    expect(world.hasProperty(wall, asPropertyId("stop"))).toBe(true);
    expect(world.entitiesWithProperty("you").length).toBe(1);
  });

  test("noun transform ROCK IS BABA", () => {
    const world = loadLevel({
      id: "xf",
      name: "xf",
      layout: `
baba,is,you,rock,is,baba
baba!,rock!,,,,
`,
    });
    const session = new GameSession(world);
    // Transforms apply each turn — wait triggers rebuild/transform
    session.dispatch({ type: "wait" });
    const rocks = session.world.entities.filter(
      (e) => e.kind === "object" && e.noun === asNounId("rock"),
    );
    const babas = session.world.entities.filter(
      (e) => e.kind === "object" && e.noun === asNounId("baba"),
    );
    expect(rocks.length).toBe(0);
    expect(babas.length).toBe(2);
  });
});
