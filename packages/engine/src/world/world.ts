import type { EntityId, NounId, PropertyId, WordId } from "../types";
import { asNounId, asPropertyId, asWordId } from "../types";
import type { EntityRecord, EntityStore } from "../entity/store";
import { EntityStore as EntityStoreClass } from "../entity/store";
import { Grid } from "./grid";
import type { Lexicon } from "../lexicon";
import { createDefaultLexicon } from "../lexicon";
import { parseRules, nounHasProperty, type RuleSet, type TextTile } from "../rules";
import type { GameStatus, Vec2 } from "../types";

/** Extra data for text entities. */
export interface TextData {
  wordId: WordId;
}

/**
 * Authoritative simulation world.
 * Rendering and input sit outside; they only read / send intents.
 */
export class World {
  readonly lexicon: Lexicon;
  readonly entities: EntityStore;
  readonly grid: Grid;
  /** wordId per text entity */
  readonly textData = new Map<EntityId, TextData>();
  rules: RuleSet;
  status: GameStatus = "playing";
  /** Bumps whenever rules are rebuilt — UI can highlight active sentences. */
  rulesGeneration = 0;

  constructor(
    width: number,
    height: number,
    lexicon: Lexicon = createDefaultLexicon(),
    entities: EntityStore = new EntityStoreClass(),
    grid?: Grid,
  ) {
    this.lexicon = lexicon;
    this.entities = entities;
    this.grid = grid ?? new Grid(width, height);
    this.rules = emptyRules();
  }

  get width(): number {
    return this.grid.width;
  }

  get height(): number {
    return this.grid.height;
  }

  spawnObject(noun: NounId, position: Vec2, layer = 0): EntityRecord {
    const e = this.entities.create({
      kind: "object",
      noun,
      position: { ...position },
      layer,
    });
    this.grid.place(e.id, e.position);
    return e;
  }

  spawnText(wordId: WordId, position: Vec2, layer = 1): EntityRecord {
    const word = this.lexicon.requireWord(wordId);
    // Text entities use noun "text" for property queries (TEXT IS PUSH).
    const e = this.entities.create({
      kind: "text",
      noun: asNounId("text"),
      position: { ...position },
      layer,
    });
    this.textData.set(e.id, { wordId: word.id });
    this.grid.place(e.id, e.position);
    return e;
  }

  destroyEntity(id: EntityId): void {
    const e = this.entities.get(id);
    if (!e) return;
    this.grid.remove(id, e.position);
    this.textData.delete(id);
    this.entities.destroy(id);
  }

  moveEntity(id: EntityId, to: Vec2): void {
    const e = this.entities.require(id);
    this.grid.move(id, e.position, to);
    e.position = { ...to };
  }

  rebuildRules(): void {
    const texts: TextTile[] = [];
    for (const e of this.entities.values()) {
      if (e.kind !== "text") continue;
      const td = this.textData.get(e.id);
      if (!td) continue;
      texts.push({ wordId: td.wordId, x: e.position.x, y: e.position.y });
    }
    this.rules = parseRules({
      lexicon: this.lexicon,
      width: this.width,
      height: this.height,
      texts,
    });
    this.rulesGeneration++;
  }

  effectiveNoun(e: EntityRecord): NounId {
    return e.kind === "text" ? asNounId("text") : e.noun;
  }

  hasProperty(e: EntityRecord, property: PropertyId | string): boolean {
    const prop = typeof property === "string" ? asPropertyId(property) : property;
    return nounHasProperty(this.rules, this.effectiveNoun(e), prop);
  }

  entitiesWithProperty(property: PropertyId | string): EntityRecord[] {
    const prop = typeof property === "string" ? asPropertyId(property) : property;
    return this.entities.filter((e) => e.alive && this.hasProperty(e, prop));
  }

  clone(): World {
    const w = new World(
      this.width,
      this.height,
      this.lexicon,
      this.entities.clone(),
      this.grid.clone(),
    );
    for (const [id, td] of this.textData) {
      w.textData.set(id, { ...td });
    }
    w.rules = this.rules;
    w.status = this.status;
    w.rulesGeneration = this.rulesGeneration;
    return w;
  }
}

function emptyRules(): RuleSet {
  return {
    features: [],
    propertiesByNoun: new Map(),
    transformsByNoun: new Map(),
  };
}

export { asWordId, asNounId };
