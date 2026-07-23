/**
 * Rule / Feature model.
 *
 * Inspired by Baba Is You's internal "feature" representation:
 * every parsed sentence collapses into subject–verb–object triplets
 * (AND expands via cartesian product; NOT attaches as a modifier).
 *
 * This keeps evaluation simple while the scanner/parser stay free to
 * grow toward conditions (ON/NEAR), prefixes (LONELY), and stacking.
 */

import type { NounId, OperatorId, PropertyId, WordId } from "../types";

/** A noun reference that may be negated (NOT BABA). */
export interface NounRef {
  readonly noun: NounId;
  readonly negated: boolean;
}

/** Predicate target: either a property (BABA IS YOU) or a noun transform (BABA IS ROCK). */
export type PredicateTarget =
  | { readonly kind: "property"; readonly property: PropertyId; readonly negated: boolean }
  | { readonly kind: "noun"; readonly noun: NounId; readonly negated: boolean };

/**
 * Atomic rule unit after AND-expansion.
 * Example: BABA AND ROCK IS YOU AND PUSH → four Features.
 */
export interface Feature {
  readonly subject: NounRef;
  readonly verb: OperatorId;
  readonly target: PredicateTarget;
  /** Horizontal or vertical origin; useful for debugging / UI highlighting. */
  readonly axis: "horizontal" | "vertical";
  /** Stable identity for dedupe / UI. */
  readonly key: string;
}

export function featureKey(
  subject: NounRef,
  verb: OperatorId,
  target: PredicateTarget,
): string {
  const sub = `${subject.negated ? "~" : ""}${subject.noun}`;
  const obj =
    target.kind === "property"
      ? `${target.negated ? "~" : ""}${target.property}`
      : `${target.negated ? "~" : ""}${target.noun}`;
  return `${sub} ${verb} ${obj}`;
}

export function createFeature(
  subject: NounRef,
  verb: OperatorId,
  target: PredicateTarget,
  axis: Feature["axis"],
): Feature {
  return {
    subject,
    verb,
    target,
    axis,
    key: featureKey(subject, verb, target),
  };
}

/** Runtime rule table produced by a parse pass. */
export interface RuleSet {
  readonly features: readonly Feature[];
  /** noun → properties conferred by IS (respecting NOT). */
  readonly propertiesByNoun: ReadonlyMap<NounId, ReadonlySet<PropertyId>>;
  /** noun → transform targets (BABA IS ROCK). Empty if negated or conflicting. */
  readonly transformsByNoun: ReadonlyMap<NounId, NounId>;
}

export interface TextTile {
  readonly wordId: WordId;
  readonly x: number;
  readonly y: number;
}
