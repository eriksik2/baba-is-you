import type { Lexicon } from "../lexicon";
import { createDefaultLexicon } from "../lexicon";
import { asWordId } from "../types";
import { parseRules, type Feature, type RuleSet } from "../rules";
import { buildRuleSet } from "../rules/parser";
import { createFeature } from "../rules";
import { asNounId, asOperatorId, asPropertyId } from "../types";
import type { GlobalRuleSpec } from "./types";
import { globalRuleWords } from "./types";

/** Convert declarative global rule specs into a RuleSet. */
export function rulesFromGlobalSpecs(
  specs: readonly GlobalRuleSpec[],
  lexicon: Lexicon = createDefaultLexicon(),
): RuleSet {
  const features: Feature[] = [
    createFeature(
      { noun: asNounId("text"), negated: false },
      asOperatorId("is"),
      { kind: "property", property: asPropertyId("push"), negated: false },
      "horizontal",
    ),
  ];

  for (const s of specs) {
    const words = globalRuleWords(s);
    if (words.length < 3) continue;

    const texts = words.map((id, x) => ({
      wordId: asWordId(id),
      x,
      y: 0,
    }));

    // Validate every token exists in the lexicon; skip broken sentences.
    if (texts.some((t) => !lexicon.getWord(t.wordId))) continue;

    const parsed = parseRules({
      lexicon,
      width: words.length,
      height: 1,
      texts,
      includeImplicitTextPush: false,
    });
    features.push(...parsed.features);
  }

  return buildRuleSet(features);
}
