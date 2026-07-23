import type { Lexicon } from "../lexicon";
import { createDefaultLexicon } from "../lexicon";
import {
  asNounId,
  asOperatorId,
  asPropertyId,
  asWordId,
} from "../types";
import { createFeature, type Feature, type RuleSet } from "../rules";
import { buildRuleSet } from "../rules/parser";
import type { GlobalRuleSpec } from "./types";

/** Convert declarative global rule specs into a RuleSet. */
export function rulesFromGlobalSpecs(
  specs: readonly GlobalRuleSpec[],
  lexicon: Lexicon = createDefaultLexicon(),
): RuleSet {
  const features: Feature[] = [];

  features.push(
    createFeature(
      { noun: asNounId("text"), negated: false },
      asOperatorId("is"),
      { kind: "property", property: asPropertyId("push"), negated: false },
      "horizontal",
    ),
  );

  for (const s of specs) {
    const verb = asOperatorId(s.verb);
    const subject = asNounId(s.subject);
    const objWord = lexicon.getWord(asWordId(s.object));
    if (objWord?.wordClass === "property" && objWord.namesProperty) {
      features.push(
        createFeature(
          { noun: subject, negated: false },
          verb,
          {
            kind: "property",
            property: objWord.namesProperty,
            negated: false,
          },
          "horizontal",
        ),
      );
    } else if (objWord?.wordClass === "noun" && objWord.namesNoun) {
      features.push(
        createFeature(
          { noun: subject, negated: false },
          verb,
          { kind: "noun", noun: objWord.namesNoun, negated: false },
          "horizontal",
        ),
      );
    } else if (lexicon.getNoun(asNounId(s.object))) {
      features.push(
        createFeature(
          { noun: subject, negated: false },
          verb,
          { kind: "noun", noun: asNounId(s.object), negated: false },
          "horizontal",
        ),
      );
    } else {
      features.push(
        createFeature(
          { noun: subject, negated: false },
          verb,
          {
            kind: "property",
            property: asPropertyId(s.object),
            negated: false,
          },
          "horizontal",
        ),
      );
    }
  }

  return buildRuleSet(features);
}
