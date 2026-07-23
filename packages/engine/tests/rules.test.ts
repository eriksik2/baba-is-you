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

  test("parses horizontal BABA IS YOU", () => {
    const rules = parseRules({
      lexicon,
      width: 5,
      height: 1,
      texts: tiles(["baba", "is", "you"]),
    });
    expect(rules.propertiesByNoun.get(asNounId("baba"))?.has(asPropertyId("you"))).toBe(true);
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
      texts: tiles(["baba", "is", "you"]),
    });
    expect(rules.features.some((f) => f.key === "text is push")).toBe(true);
  });

  test("parses noun transform BABA IS ROCK", () => {
    const rules = parseRules({
      lexicon,
      width: 5,
      height: 1,
      texts: tiles(["baba", "is", "rock"]),
    });
    expect(rules.transformsByNoun.get(asNounId("baba"))).toBe(asNounId("rock"));
  });

  test("ignores incomplete sentences", () => {
    const rules = parseRules({
      lexicon,
      width: 3,
      height: 1,
      texts: tiles(["baba", "is", ""]),
    });
    expect(rules.propertiesByNoun.get(asNounId("baba"))?.has(asPropertyId("you")) ?? false).toBe(
      false,
    );
  });
});
