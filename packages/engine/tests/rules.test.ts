import { describe, expect, test } from "bun:test";
import {
  parseRules,
  createDefaultLexicon,
  asNounId,
  asPropertyId,
  asWordId,
} from "../src/index";

function tiles(...cells: string[][]) {
  const out: { wordId: ReturnType<typeof asWordId>; x: number; y: number }[] = [];
  cells.forEach((row, y) => {
    row.forEach((id, x) => {
      if (id) out.push({ wordId: asWordId(id), x, y });
    });
  });
  return out;
}

describe("rules parser", () => {
  const lexicon = createDefaultLexicon();

  test("parses horizontal SHEEP IS YOU", () => {
    const rules = parseRules({
      lexicon,
      width: 5,
      height: 1,
      texts: tiles(["sheep", "is", "you"]),
    });
    expect(rules.propertiesByNoun.get(asNounId("sheep"))?.has(asPropertyId("you"))).toBe(true);
  });

  test("parses vertical ROCK IS PUSH", () => {
    const rules = parseRules({
      lexicon,
      width: 1,
      height: 5,
      texts: tiles(["rock"], ["is"], ["push"]),
    });
    expect(rules.propertiesByNoun.get(asNounId("rock"))?.has(asPropertyId("push"))).toBe(true);
  });

  test("parses ROCK IS PULL", () => {
    const rules = parseRules({
      lexicon,
      width: 5,
      height: 1,
      texts: tiles(["rock", "is", "pull"]),
    });
    expect(rules.propertiesByNoun.get(asNounId("rock"))?.has(asPropertyId("pull"))).toBe(true);
  });

  test("TEXT IS PUSH is always implicit", () => {
    const rules = parseRules({
      lexicon,
      width: 3,
      height: 1,
      texts: tiles(["sheep", "is", "you"]),
    });
    expect(rules.features.some((f) => f.key === "text is push")).toBe(true);
  });

  test("parses noun transform SHEEP IS ROCK", () => {
    const rules = parseRules({
      lexicon,
      width: 5,
      height: 1,
      texts: tiles(["sheep", "is", "rock"]),
    });
    expect(rules.transformsByNoun.get(asNounId("sheep"))).toBe(asNounId("rock"));
  });

  test("ignores incomplete sentences", () => {
    const rules = parseRules({
      lexicon,
      width: 3,
      height: 1,
      texts: tiles(["sheep", "is", ""]),
    });
    expect(rules.propertiesByNoun.get(asNounId("sheep"))?.has(asPropertyId("you")) ?? false).toBe(
      false,
    );
  });

  test("parses AND on both sides of IS", () => {
    const rules = parseRules({
      lexicon,
      width: 8,
      height: 1,
      texts: tiles(["sheep", "and", "rock", "is", "you", "and", "push"]),
    });
    expect(rules.propertiesByNoun.get(asNounId("sheep"))?.has(asPropertyId("you"))).toBe(true);
    expect(rules.propertiesByNoun.get(asNounId("sheep"))?.has(asPropertyId("push"))).toBe(true);
    expect(rules.propertiesByNoun.get(asNounId("rock"))?.has(asPropertyId("you"))).toBe(true);
    expect(rules.propertiesByNoun.get(asNounId("rock"))?.has(asPropertyId("push"))).toBe(true);
  });

  test("parses ON condition into feature", () => {
    const rules = parseRules({
      lexicon,
      width: 6,
      height: 1,
      texts: tiles(["fruit", "on", "door", "is", "win"]),
    });
    const onWin = rules.features.find((f) => f.key === "fruit on door is win");
    expect(onWin).toBeTruthy();
    expect(onWin!.conditions).toEqual([
      { kind: "on", noun: asNounId("door"), negated: false },
    ]);
    // Unconditional index must not grant fruit win without ON.
    expect(rules.propertiesByNoun.get(asNounId("fruit"))?.has(asPropertyId("win")) ?? false).toBe(
      false,
    );
    // ON-target must not also form DOOR IS WIN from the same tiles.
    expect(rules.features.some((f) => f.key === "door is win")).toBe(false);
  });

  test("parses SLIDE and WIN properties", () => {
    const rules = parseRules({
      lexicon,
      width: 5,
      height: 1,
      texts: tiles(["rock", "is", "slide"]),
    });
    expect(rules.propertiesByNoun.get(asNounId("rock"))?.has(asPropertyId("slide"))).toBe(true);
  });
});
