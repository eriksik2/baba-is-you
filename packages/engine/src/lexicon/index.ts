/**
 * Lexicon: data-driven dictionary of every word the rules engine understands.
 */

import type { NounId, OperatorId, PropertyId, WordId } from "../types";
import { asNounId, asOperatorId, asPropertyId, asWordId } from "../types";

export type WordClass =
  | "noun"
  | "property"
  | "operator"
  | "prefix"
  | "infix";

export interface WordDefinition {
  readonly id: WordId;
  readonly wordClass: WordClass;
  readonly label: string;
  readonly namesNoun?: NounId;
  readonly namesProperty?: PropertyId;
  readonly namesOperator?: OperatorId;
  readonly palette?: string;
  /** Experimental / sandbox-only property or word. */
  readonly dev?: boolean;
}

export interface NounDefinition {
  readonly id: NounId;
  readonly label: string;
  readonly palette?: string;
  /** Creatures / living things — affects DANGER and similar verbs. */
  readonly living?: boolean;
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

export function createDefaultLexicon(): Lexicon {
  const lex = new Lexicon();

  const nouns: Array<[string, string, string?, boolean?]> = [
    ["sheep", "Sheep", "sheep", true],
    ["wolf", "Wolf", "wolf", true],
    ["wall", "Wall", "wall"],
    ["rock", "Rock", "rock"],
    ["tree", "Tree", "tree"],
    ["fruit", "Fruit", "fruit"],
    ["door", "Door", "door"],
    ["tnt", "TNT", "tnt"],
    // Implicit / meta nouns for text tiles
    ["text", "Text", "text"],
    ["word", "Word", "word"],
  ];

  for (const [id, label, palette, living] of nouns) {
    lex.registerNoun({
      id: asNounId(id),
      label,
      ...(palette !== undefined ? { palette } : {}),
      ...(living ? { living: true } : {}),
    });
    lex.registerWord({
      id: asWordId(id),
      wordClass: "noun",
      label: label.toUpperCase(),
      namesNoun: asNounId(id),
      palette: "text-noun",
    });
  }

  const properties: Array<[string, string, boolean?]> = [
    ["you", "YOU"],
    ["push", "PUSH"],
    ["stop", "STOP"],
    ["pull", "PULL"],
    ["slide", "SLIDE"],
    ["sticky", "STICKY"],
    ["win", "WIN"],
    ["boom", "BOOM"],
    ["fragile", "FRAGILE"],
    ["danger", "DANGER"],
    // Dev sandbox verbs
    ["gas", "GAS", true],
    ["dynamic", "DYNAMIC", true],
    ["life", "LIFE", true],
    ["flux", "FLUX", true],
    ["confused", "CONFUSED", true],
  ];

  for (const [id, label, dev] of properties) {
    lex.registerWord({
      id: asWordId(id),
      wordClass: "property",
      label,
      namesProperty: asPropertyId(id),
      palette: "text-property",
      ...(dev ? { dev: true } : {}),
    });
  }

  const operators: Array<[string, string, WordClass]> = [
    ["is", "IS", "operator"],
    ["and", "AND", "operator"],
    ["not", "NOT", "operator"],
    ["on", "ON", "infix"],
  ];

  for (const [id, label, wordClass] of operators) {
    lex.registerWord({
      id: asWordId(id),
      wordClass,
      label,
      namesOperator: asOperatorId(id),
      palette: "text-operator",
    });
  }

  return lex;
}
