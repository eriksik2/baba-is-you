/**
 * Sentence scanner + parser.
 *
 * Pipeline (mirrors Hempuli's high-level design):
 * 1. Collect noun-word tiles as potential sentence starts.
 * 2. Walk right / down collecting a valid word sequence around IS.
 * 3. Split at IS into subject phrase + predicate phrase.
 * 4. Expand AND via cartesian product into Features.
 * 5. Apply NOT modifiers; cancel contradictory features (X IS YOU vs X IS NOT YOU).
 *
 * Extension points:
 * - Phrase grammars for prefixes/infixes live in parseSubjectPhrase / parsePredicatePhrase.
 * - Stacked words: textAt returns all text tiles in a cell; full permutations later.
 */

import type { Lexicon } from "../lexicon";
import type { Axis, NounId, PropertyId, WordId } from "../types";
import { asNounId, asOperatorId, asPropertyId } from "../types";
import {
  createFeature,
  type Feature,
  type NounRef,
  type PredicateTarget,
  type RuleSet,
  type TextTile,
} from "./types";

interface PhraseNoun {
  noun: NounId;
  negated: boolean;
}

interface PhraseNounOrProp {
  kind: "noun" | "property";
  id: string;
  negated: boolean;
}

const IMPLICIT_TEXT_PUSH: Feature = createFeature(
  { noun: asNounId("text"), negated: false },
  asOperatorId("is"),
  { kind: "property", property: asPropertyId("push"), negated: false },
  "horizontal",
);

export interface ParseContext {
  readonly lexicon: Lexicon;
  readonly width: number;
  readonly height: number;
  readonly texts: readonly TextTile[];
}

function textMap(texts: readonly TextTile[]): Map<string, TextTile[]> {
  const m = new Map<string, TextTile[]>();
  for (const t of texts) {
    const key = `${t.x},${t.y}`;
    const list = m.get(key);
    if (list) list.push(t);
    else m.set(key, [t]);
  }
  return m;
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function parseRules(ctx: ParseContext): RuleSet {
  const byCell = textMap(ctx.texts);
  const features: Feature[] = [IMPLICIT_TEXT_PUSH];

  const nounStarts = ctx.texts.filter((t) => {
    const def = ctx.lexicon.getWord(t.wordId);
    return def?.wordClass === "noun";
  });

  for (const start of nounStarts) {
    features.push(...tryParseFrom(ctx, byCell, start, "horizontal"));
    features.push(...tryParseFrom(ctx, byCell, start, "vertical"));
  }

  return buildRuleSet(features);
}

function tryParseFrom(
  ctx: ParseContext,
  byCell: Map<string, TextTile[]>,
  start: TextTile,
  axis: Axis,
): Feature[] {
  const sequence = collectSequence(ctx, byCell, start, axis);
  if (sequence.length < 3) return [];

  const isIndex = sequence.findIndex((t) => isOp(ctx, t.wordId, "is"));
  if (isIndex <= 0 || isIndex >= sequence.length - 1) return [];

  if (sequence.slice(isIndex + 1).some((t) => isOp(ctx, t.wordId, "is"))) {
    return [];
  }

  const subjects = parseSubjectPhrase(ctx, sequence.slice(0, isIndex));
  const predicates = parsePredicatePhrase(ctx, sequence.slice(isIndex + 1));
  if (subjects.length === 0 || predicates.length === 0) return [];

  const out: Feature[] = [];
  for (const sub of subjects) {
    for (const pred of predicates) {
      const target: PredicateTarget =
        pred.kind === "property"
          ? {
              kind: "property",
              property: asPropertyId(pred.id),
              negated: pred.negated,
            }
          : {
              kind: "noun",
              noun: asNounId(pred.id),
              negated: pred.negated,
            };

      out.push(
        createFeature(
          { noun: sub.noun, negated: sub.negated },
          asOperatorId("is"),
          target,
          axis,
        ),
      );
    }
  }
  return out;
}

function collectSequence(
  ctx: ParseContext,
  byCell: Map<string, TextTile[]>,
  start: TextTile,
  axis: Axis,
): TextTile[] {
  const dx = axis === "horizontal" ? 1 : 0;
  const dy = axis === "vertical" ? 1 : 0;
  const seq: TextTile[] = [start];

  let x = start.x + dx;
  let y = start.y + dy;
  let seenIs = false;

  while (x < ctx.width && y < ctx.height) {
    const tiles = byCell.get(cellKey(x, y));
    if (!tiles || tiles.length === 0) break;

    const next = pickCompatible(ctx, seq, tiles, seenIs);
    if (!next) break;

    if (isOp(ctx, next.wordId, "is")) {
      if (seenIs) break;
      seenIs = true;
    }

    seq.push(next);
    x += dx;
    y += dy;
  }

  return seq;
}

function pickCompatible(
  ctx: ParseContext,
  soFar: TextTile[],
  candidates: TextTile[],
  seenIs: boolean,
): TextTile | undefined {
  for (const c of candidates) {
    if (isCompatibleNext(ctx, soFar, c, seenIs)) return c;
  }
  return undefined;
}

/**
 * Grammar (simplified, extensible):
 *
 *   Subject   := Noun (AND Noun)*
 *   Predicate := (Property | Noun) (AND (Property | Noun))*
 *   Sentence  := Subject IS Predicate
 *
 * NOT may wrap individual Noun/Property atoms: NOT YOU, NOT BABA.
 */
function isCompatibleNext(
  ctx: ParseContext,
  soFar: TextTile[],
  next: TextTile,
  seenIs: boolean,
): boolean {
  const def = ctx.lexicon.getWord(next.wordId);
  if (!def) return false;

  const prev = soFar[soFar.length - 1]!;
  const prevDef = ctx.lexicon.requireWord(prev.wordId);
  const prevIsNot = isOp(ctx, prev.wordId, "not");
  const prevIsAnd = isOp(ctx, prev.wordId, "and");
  const prevIsIs = isOp(ctx, prev.wordId, "is");

  if (!seenIs) {
    if (isOp(ctx, next.wordId, "is")) {
      return prevDef.wordClass === "noun";
    }
    if (isOp(ctx, next.wordId, "and")) {
      return prevDef.wordClass === "noun";
    }
    if (isOp(ctx, next.wordId, "not")) {
      return prevIsAnd;
    }
    if (def.wordClass === "noun") {
      return prevIsAnd || prevIsNot;
    }
    return false;
  }

  // Predicate
  if (isOp(ctx, next.wordId, "and")) {
    return prevDef.wordClass === "property" || prevDef.wordClass === "noun";
  }
  if (isOp(ctx, next.wordId, "not")) {
    return prevIsIs || prevIsAnd;
  }
  if (def.wordClass === "property" || def.wordClass === "noun") {
    return prevIsIs || prevIsAnd || prevIsNot;
  }
  return false;
}

function parseSubjectPhrase(ctx: ParseContext, tiles: TextTile[]): PhraseNoun[] {
  const result: PhraseNoun[] = [];
  let negated = false;

  for (const t of tiles) {
    if (isOp(ctx, t.wordId, "and")) {
      negated = false;
      continue;
    }
    if (isOp(ctx, t.wordId, "not")) {
      negated = !negated;
      continue;
    }
    const def = ctx.lexicon.getWord(t.wordId);
    if (def?.wordClass === "noun" && def.namesNoun) {
      result.push({ noun: def.namesNoun, negated });
      negated = false;
    } else {
      return [];
    }
  }
  return result;
}

function parsePredicatePhrase(ctx: ParseContext, tiles: TextTile[]): PhraseNounOrProp[] {
  const result: PhraseNounOrProp[] = [];
  let negated = false;

  for (const t of tiles) {
    if (isOp(ctx, t.wordId, "and")) {
      negated = false;
      continue;
    }
    if (isOp(ctx, t.wordId, "not")) {
      negated = !negated;
      continue;
    }
    const def = ctx.lexicon.getWord(t.wordId);
    if (def?.wordClass === "property" && def.namesProperty) {
      result.push({ kind: "property", id: def.namesProperty, negated });
      negated = false;
    } else if (def?.wordClass === "noun" && def.namesNoun) {
      result.push({ kind: "noun", id: def.namesNoun, negated });
      negated = false;
    } else {
      return [];
    }
  }
  return result;
}

function isOp(ctx: ParseContext, id: WordId, op: string): boolean {
  const def = ctx.lexicon.getWord(id);
  return def?.namesOperator === asOperatorId(op);
}

export function buildRuleSet(features: readonly Feature[]): RuleSet {
  const unique = new Map<string, Feature>();
  for (const f of features) {
    if (!unique.has(f.key)) unique.set(f.key, f);
  }

  const positives = [...unique.values()];
  const cancelled = new Set(
    positives.filter((f) => f.target.negated).map((f) => positiveKey(f)),
  );

  const active = positives.filter((f) => {
    if (f.target.negated) return false;
    if (cancelled.has(f.key)) return false;
    return true;
  });

  const propertiesByNoun = new Map<NounId, Set<PropertyId>>();
  const transformsByNoun = new Map<NounId, NounId>();

  for (const f of active) {
    if (f.subject.negated) continue;
    if (f.verb !== asOperatorId("is")) continue;

    if (f.target.kind === "property" && !f.target.negated) {
      let set = propertiesByNoun.get(f.subject.noun);
      if (!set) {
        set = new Set();
        propertiesByNoun.set(f.subject.noun, set);
      }
      set.add(f.target.property);
    } else if (f.target.kind === "noun" && !f.target.negated) {
      transformsByNoun.set(f.subject.noun, f.target.noun);
    }
  }

  return { features: active, propertiesByNoun, transformsByNoun };
}

function positiveKey(f: Feature): string {
  const subject: NounRef = f.subject;
  const target: PredicateTarget =
    f.target.kind === "property"
      ? { kind: "property", property: f.target.property, negated: false }
      : { kind: "noun", noun: f.target.noun, negated: false };
  return createFeature(subject, f.verb, target, f.axis).key;
}

export function nounHasProperty(
  rules: RuleSet,
  noun: NounId,
  property: PropertyId,
): boolean {
  return rules.propertiesByNoun.get(noun)?.has(property) ?? false;
}
