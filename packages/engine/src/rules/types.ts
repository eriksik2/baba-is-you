/**
 * Rule / Feature model.
 *
 * Sentences collapse into Features. AND expands via cartesian product.
 * Conditions (ON, …) attach to the subject side and are evaluated at query time.
 */

import type { NounId, OperatorId, PropertyId, WordId } from "../types";

/** A noun reference that may be negated (NOT SHEEP). */
export interface NounRef {
  readonly noun: NounId;
  readonly negated: boolean;
}

/** Predicate target: property (SHEEP IS YOU) or noun transform (SHEEP IS ROCK). */
export type PredicateTarget =
  | { readonly kind: "property"; readonly property: PropertyId; readonly negated: boolean }
  | { readonly kind: "noun"; readonly noun: NounId; readonly negated: boolean };

/** Infix / prefix conditions. Only ON for now; same attachment point for future conds. */
export type RuleCondition = {
  readonly kind: "on";
  readonly noun: NounId;
  readonly negated: boolean;
};

/**
 * Atomic rule unit after AND-expansion.
 * Example: SHEEP AND ROCK IS YOU AND PUSH → four Features.
 * Example: FRUIT ON DOOR IS WIN → one Feature with an ON condition.
 */
export interface Feature {
  readonly subject: NounRef;
  readonly verb: OperatorId;
  readonly target: PredicateTarget;
  readonly conditions: readonly RuleCondition[];
  readonly axis: "horizontal" | "vertical";
  readonly key: string;
}

export function featureKey(
  subject: NounRef,
  verb: OperatorId,
  target: PredicateTarget,
  conditions: readonly RuleCondition[] = [],
): string {
  const sub = `${subject.negated ? "~" : ""}${subject.noun}`;
  const obj =
    target.kind === "property"
      ? `${target.negated ? "~" : ""}${target.property}`
      : `${target.negated ? "~" : ""}${target.noun}`;
  const cond =
    conditions.length === 0
      ? ""
      : " " +
        conditions
          .map((c) => `${c.kind} ${c.negated ? "not " : ""}${c.noun}`)
          .join(" ");
  return `${sub}${cond} ${verb} ${obj}`;
}

export function createFeature(
  subject: NounRef,
  verb: OperatorId,
  target: PredicateTarget,
  axis: Feature["axis"],
  conditions: readonly RuleCondition[] = [],
): Feature {
  return {
    subject,
    verb,
    target,
    conditions,
    axis,
    key: featureKey(subject, verb, target, conditions),
  };
}

/** Runtime rule table produced by a parse pass. */
export interface RuleSet {
  readonly features: readonly Feature[];
  /**
   * Unconditional noun → properties (fast path).
   * Conditional grants are evaluated via `features` in World.hasProperty.
   */
  readonly propertiesByNoun: ReadonlyMap<NounId, ReadonlySet<PropertyId>>;
  /** Unconditional noun → transform targets. */
  readonly transformsByNoun: ReadonlyMap<NounId, NounId>;
}

export interface TextTile {
  readonly wordId: WordId;
  readonly x: number;
  readonly y: number;
}
