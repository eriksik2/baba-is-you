import { describe, expect, test } from "bun:test";
import {
  createDefaultLexicon,
  parseRules,
  buildRuleSet,
  createFeature,
  asNounId,
  asOperatorId,
  asPropertyId,
  asWordId,
  type TextTile,
} from "../src/index";

function tiles(...rows: string[][]): TextTile[] {
  const out: TextTile[] = [];
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y]!.length; x++) {
      const id = rows[y]![x];
      if (id) out.push({ wordId: asWordId(id), x, y });
    }
  }
  return out;
}

describe("rules parser", () => {
  const lexicon = createDefaultLexicon();

  test("parses horizontal BABA IS YOU", () => {
    const rules = parseRules({
      lexicon,
      width: 5,
      height: 3,
      texts: tiles(["baba", "is", "you"]),
    });
    expect(rules.propertiesByNoun.get(asNounId("baba"))?.has(asPropertyId("you"))).toBe(true);
    expect(rules.features.some((f) => f.key === "baba is you")).toBe(true);
  });

  test("parses vertical FLAG IS WIN", () => {
    const rules = parseRules({
      lexicon,
      width: 3,
      height: 5,
      texts: tiles(["flag"], ["is"], ["win"]),
    });
    expect(rules.propertiesByNoun.get(asNounId("flag"))?.has(asPropertyId("win"))).toBe(true);
  });

  test("expands AND on both sides", () => {
    const rules = parseRules({
      lexicon,
      width: 10,
      height: 3,
      texts: tiles(["baba", "and", "rock", "is", "push", "and", "you"]),
    });
    const baba = rules.propertiesByNoun.get(asNounId("baba"));
    const rock = rules.propertiesByNoun.get(asNounId("rock"));
    expect(baba?.has(asPropertyId("push"))).toBe(true);
    expect(baba?.has(asPropertyId("you"))).toBe(true);
    expect(rock?.has(asPropertyId("push"))).toBe(true);
    expect(rock?.has(asPropertyId("you"))).toBe(true);
  });

  test("TEXT IS PUSH is always implicit", () => {
    const rules = parseRules({ lexicon, width: 1, height: 1, texts: [] });
    expect(rules.propertiesByNoun.get(asNounId("text"))?.has(asPropertyId("push"))).toBe(true);
  });

  test("NOT cancels a positive property", () => {
    const features = [
      createFeature(
        { noun: asNounId("baba"), negated: false },
        asOperatorId("is"),
        { kind: "property", property: asPropertyId("you"), negated: false },
        "horizontal",
      ),
      createFeature(
        { noun: asNounId("baba"), negated: false },
        asOperatorId("is"),
        { kind: "property", property: asPropertyId("you"), negated: true },
        "vertical",
      ),
    ];
    const rules = buildRuleSet(features);
    expect(rules.propertiesByNoun.get(asNounId("baba"))?.has(asPropertyId("you"))).toBeFalsy();
  });

  test("parses noun transform BABA IS ROCK", () => {
    const rules = parseRules({
      lexicon,
      width: 5,
      height: 2,
      texts: tiles(["baba", "is", "rock"]),
    });
    expect(rules.transformsByNoun.get(asNounId("baba"))).toBe(asNounId("rock"));
  });

  test("ignores incomplete sentences", () => {
    const rules = parseRules({
      lexicon,
      width: 5,
      height: 2,
      texts: tiles(["baba", "is"]),
    });
    expect(rules.features.filter((f) => f.key.startsWith("baba"))).toHaveLength(0);
  });
});
