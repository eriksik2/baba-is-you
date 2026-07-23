import { describe, expect, test } from "bun:test";
import { GameSession, LEVEL_1, loadDocument } from "../src/index";

describe("campaign levels", () => {
  test("level-1 is escapable and winnable", () => {
    const session = new GameSession(loadDocument(LEVEL_1));
    for (const direction of ["right", "right", "right", "right", "right", "right", "down"] as const) {
      session.dispatch({ type: "move", direction });
    }
    expect(session.world.status).toBe("won");
  });
});
