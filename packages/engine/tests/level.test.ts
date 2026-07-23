import { describe, expect, test } from "bun:test";
import { parseLayout, loadLevel } from "../src/index";

describe("level format", () => {
  test("parses object and text tokens", () => {
    const grid = parseLayout(`baba!,wall`);
    expect(grid[0]![0]).toEqual([{ kind: "object", id: "baba" }]);
    expect(grid[0]![1]).toEqual([{ kind: "text", id: "wall" }]);
  });

  test("parses stacked cells", () => {
    const grid = parseLayout(`baba! rock!`);
    expect(grid[0]![0]).toEqual([
      { kind: "object", id: "baba" },
      { kind: "object", id: "rock" },
    ]);
  });

  test("loadLevel spawns mixed board", () => {
    const world = loadLevel({
      id: "t",
      name: "t",
      layout: `
baba,is,you
baba!,,
`,
    });
    expect(world.entitiesWithProperty("you").length).toBe(1);
  });
});
