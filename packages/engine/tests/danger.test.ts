import { describe, expect, test } from "bun:test";
import {
  GameSession,
  asNounId,
  loadDocument,
} from "../src";

function blank(w: number, h: number) {
  return {
    areas: [] as [],
    areaMap: Array.from({ length: w * h }, () => 0),
    background: Array.from({ length: w * h }, () => "grass"),
  };
}

function findNoun(session: GameSession, noun: string) {
  return [...session.world.entities.values()].find(
    (e) => e.kind === "object" && e.noun === asNounId(noun),
  );
}

describe("DANGER property", () => {
  test("living DANGER steps toward nearest YOU and destroys on touch", () => {
    const world = loadDocument({
      id: "danger-chase",
      name: "chase",
      width: 6,
      height: 3,
      globalRules: [
        { subject: "sheep", verb: "is", object: "you" },
        { subject: "wolf", verb: "is", object: "danger" },
        { subject: "wall", verb: "is", object: "stop" },
      ],
      ...blank(6, 3),
      entities: [
        { kind: "object", id: "sheep", x: 1, y: 1 },
        { kind: "object", id: "wolf", x: 4, y: 1 },
      ],
    });
    const session = new GameSession(world);

    session.dispatch({ type: "wait" });
    expect(findNoun(session, "wolf")!.position).toEqual({ x: 3, y: 1 });

    session.dispatch({ type: "wait" });
    expect(findNoun(session, "wolf")!.position).toEqual({ x: 2, y: 1 });

    session.dispatch({ type: "wait" });
    expect(session.world.status).toBe("lost");
  });

  test("YOU walking onto living DANGER is destroyed", () => {
    const world = loadDocument({
      id: "danger-touch",
      name: "touch",
      width: 4,
      height: 3,
      globalRules: [
        { subject: "sheep", verb: "is", object: "you" },
        { subject: "wolf", verb: "is", object: "danger" },
      ],
      ...blank(4, 3),
      entities: [
        { kind: "object", id: "sheep", x: 1, y: 1 },
        { kind: "object", id: "wolf", x: 2, y: 1 },
      ],
    });
    const session = new GameSession(world);
    session.dispatch({ type: "move", direction: "right" });
    expect(session.world.status).toBe("lost");
  });

  test("inanimate DANGER destroys others on the same tile", () => {
    const world = loadDocument({
      id: "danger-rock",
      name: "rock",
      width: 5,
      height: 3,
      globalRules: [
        { subject: "sheep", verb: "is", object: "you" },
        { subject: "fruit", verb: "is", object: "push" },
        { subject: "rock", verb: "is", object: "danger" },
      ],
      ...blank(5, 3),
      entities: [
        { kind: "object", id: "sheep", x: 1, y: 1 },
        { kind: "object", id: "fruit", x: 2, y: 1 },
        { kind: "object", id: "rock", x: 3, y: 1 },
      ],
    });
    const session = new GameSession(world);
    // Push fruit onto danger rock (rock is not PUSH, so they stack) → fruit dies
    session.dispatch({ type: "move", direction: "right" });
    expect(findNoun(session, "fruit")?.alive ?? false).toBe(false);
    expect(session.world.status).toBe("playing");
    expect(session.world.entitiesWithProperty("you")[0]!.position).toEqual({
      x: 2,
      y: 1,
    });
  });

  test("walking onto inanimate DANGER destroys YOU", () => {
    const world = loadDocument({
      id: "danger-step",
      name: "step",
      width: 4,
      height: 3,
      globalRules: [
        { subject: "sheep", verb: "is", object: "you" },
        { subject: "rock", verb: "is", object: "danger" },
      ],
      ...blank(4, 3),
      entities: [
        { kind: "object", id: "sheep", x: 1, y: 1 },
        { kind: "object", id: "rock", x: 2, y: 1 },
      ],
    });
    const session = new GameSession(world);
    session.dispatch({ type: "move", direction: "right" });
    expect(session.world.status).toBe("lost");
  });

  test("inanimate DANGER destroys living DANGER on contact", () => {
    const world = loadDocument({
      id: "danger-bait",
      name: "bait",
      width: 5,
      height: 3,
      globalRules: [
        { subject: "sheep", verb: "is", object: "you" },
        { subject: "rock", verb: "is", object: "push" },
        { subject: "rock", verb: "is", object: "danger" },
        { subject: "wolf", verb: "is", object: "danger" },
      ],
      ...blank(5, 3),
      entities: [
        { kind: "object", id: "sheep", x: 1, y: 1 },
        { kind: "object", id: "rock", x: 2, y: 1 },
        { kind: "object", id: "wolf", x: 3, y: 1 },
      ],
    });
    const session = new GameSession(world);
    session.dispatch({ type: "move", direction: "right" });
    expect(findNoun(session, "wolf")?.alive ?? false).toBe(false);
    expect(session.world.status).toBe("playing");
  });
});
