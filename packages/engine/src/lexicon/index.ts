/**
 * Lexicon: data-driven dictionary of every word the rules engine understands.
 *
 * Adding new nouns/properties/operators should usually mean registering here
 * (and optionally a property handler) — not forking the parser.
 */

import type { NounId, OperatorId, PropertyId, WordId } from "../types";
import { asNounId, asOperatorId, asPropertyId, asWordId } from "../types";

export type WordClass =
  | "noun"
  | "property"
  | "operator"
  | "prefix" // lonely, …
  | "infix"; // on, near, facing, …

export interface WordDefinition {
  readonly id: WordId;
  readonly wordClass: WordClass;
  /** Display label (usually uppercase). */
  readonly label: string;
  /** For noun-words: the object noun they name. For others, undefined. */
  readonly namesNoun?: NounId;
  /** For property-words: the property they confer. */
  readonly namesProperty?: PropertyId;
  /** For operator-words. */
  readonly namesOperator?: OperatorId;
  /** Visual hint for renderers (optional palette key). */
  readonly palette?: string;
}

export interface NounDefinition {
  readonly id: NounId;
  readonly label: string;
  readonly palette?: string;
}

export class Lexicon {
  private readonly words = new Map<WordId, WordDefinition>();
  private readonly nouns = new Map<NounId, NounDefinition>();

  registerNoun(def: NounDefinition): this {
    this.nouns.set(def.id, def);
    return this;
  }

  registerWord(def: WordDefinition): this {
    this.words.set(def.id, def);
    return this;
  }

  getWord(id: WordId): WordDefinition | undefined {
    return this.words.get(id);
  }

  requireWord(id: WordId): WordDefinition {
    const w = this.words.get(id);
    if (!w) throw new Error(`Unknown word: ${id}`);
    return w;
  }

  getNoun(id: NounId): NounDefinition | undefined {
    return this.nouns.get(id);
  }

  requireNoun(id: NounId): NounDefinition {
    const n = this.nouns.get(id);
    if (!n) throw new Error(`Unknown noun: ${id}`);
    return n;
  }

  allWords(): WordDefinition[] {
    return [...this.words.values()];
  }

  allNouns(): NounDefinition[] {
    return [...this.nouns.values()];
  }

  isWordClass(id: WordId, wordClass: WordClass): boolean {
    return this.words.get(id)?.wordClass === wordClass;
  }
}

/** Built-in vanilla-ish starter lexicon. Extend via register* for mods/content packs. */
export function createDefaultLexicon(): Lexicon {
  const lex = new Lexicon();

  const nouns: Array<[string, string, string?]> = [
    ["baba", "Baba", "baba"],
    ["keke", "Keke", "keke"],
    ["wall", "Wall", "wall"],
    ["rock", "Rock", "rock"],
    ["flag", "Flag", "flag"],
    ["water", "Water", "water"],
    ["lava", "Lava", "lava"],
    ["skull", "Skull", "skull"],
    ["grass", "Grass", "grass"],
    ["tile", "Tile", "tile"],
    ["text", "Text", "text"],
  ];

  for (const [id, label, palette] of nouns) {
    lex.registerNoun({
      id: asNounId(id),
      label,
      ...(palette !== undefined ? { palette } : {}),
    });
    lex.registerWord({
      id: asWordId(id),
      wordClass: "noun",
      label: label.toUpperCase(),
      namesNoun: asNounId(id),
      palette: "text-noun",
    });
  }

  const properties: Array<[string, string]> = [
    ["you", "YOU"],
    ["push", "PUSH"],
    ["stop", "STOP"],
    ["win", "WIN"],
    ["defeat", "DEFEAT"],
    ["sink", "SINK"],
    ["melt", "MELT"],
    ["hot", "HOT"],
    ["move", "MOVE"],
    ["open", "OPEN"],
    ["shut", "SHUT"],
    ["float", "FLOAT"],
  ];

  for (const [id, label] of properties) {
    lex.registerWord({
      id: asWordId(id),
      wordClass: "property",
      label,
      namesProperty: asPropertyId(id),
      palette: "text-property",
    });
  }

  const operators: Array<[string, string]> = [
    ["is", "IS"],
    ["and", "AND"],
    ["has", "HAS"],
    ["make", "MAKE"],
    ["not", "NOT"],
  ];

  for (const [id, label] of operators) {
    lex.registerWord({
      id: asWordId(id),
      wordClass: "operator",
      label,
      namesOperator: asOperatorId(id),
      palette: "text-operator",
    });
  }

  // Prefix / infix stubs for future expansion (lonely / on / near).
  lex.registerWord({
    id: asWordId("lonely"),
    wordClass: "prefix",
    label: "LONELY",
    palette: "text-operator",
  });
  lex.registerWord({
    id: asWordId("on"),
    wordClass: "infix",
    label: "ON",
    palette: "text-operator",
  });
  lex.registerWord({
    id: asWordId("near"),
    wordClass: "infix",
    label: "NEAR",
    palette: "text-operator",
  });

  return lex;
}
