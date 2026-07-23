import { describe, expect, test } from "bun:test";
import { parseLayout, parseCellToken, loadLevel } from "../src/index";

describe("level format", () => {
  test("parses object and text tokens", () => {
    expect(parseCellToken("baba!")).toEqual({ kind: "object", id: "baba" });
    expect(parseCellToken("IS")).toEqual({ kind: "text", id: "is" });
  });

  test("parses stacked cells", () => {
    const grid = parseLayout(`baba! flag,is`);
    expect(grid[0]![0]).toEqual([
      { kind: "object", id: "baba" },
      { kind: "text", id: "flag" },
    ]);
    expect(grid[0]![1]).toEqual([{ kind: "text", id: "is" }]);
  });

  test("loadLevel spawns mixed board", () => {
    const world = loadLevel({
      id: "t",
      name: "t",
      layout: `baba,is,you\nbaba!,,`,
    });
    expect(world.width).toBe(3);
    expect(world.height).toBe(2);
    expect(world.entities.all().length).toBe(4);
  });
});
