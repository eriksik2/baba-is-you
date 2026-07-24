import type { EntityId, NounId, PropertyId, WordId } from "../types";
import { asNounId, asOperatorId, asPropertyId, asWordId } from "../types";
import type { EntityRecord, EntityStore } from "../entity/store";
import { EntityStore as EntityStoreClass } from "../entity/store";
import { Grid } from "./grid";
import type { Lexicon } from "../lexicon";
import { createDefaultLexicon } from "../lexicon";
import {
  parseRules,
  nounHasProperty,
  type Feature,
  type RuleSet,
  type TextTile,
} from "../rules";
import type { GameStatus, Vec2 } from "../types";
import type {
  AreaDef,
  GlobalRuleSpec,
  LevelCameraSettings,
  LevelDocument,
} from "../campaign/types";
import { DEFAULT_CAMERA } from "../campaign/types";
import { rulesFromGlobalSpecs } from "../campaign/global-rules";

/** Extra data for text entities. */
export interface TextData {
  wordId: WordId;
}

/** Continuous 2D body for DYNAMIC objects (cell units, center-based). */
export interface PhysicsBody {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Stashed FLUX object waiting to reappear. */
export interface FluxLatent {
  noun: NounId;
  x: number;
  y: number;
}

/**
 * Authoritative simulation world.
 * Supports global rules + per-area rule scopes (novel vs classic Sheep Is You).
 */
export class World {
  readonly lexicon: Lexicon;
  readonly entities: EntityStore;
  readonly grid: Grid;
  readonly textData = new Map<EntityId, TextData>();

  /** Visual-only tile keys (row-major). */
  background: string[] = [];
  /** Rule-area id per cell (0 = no local area). */
  areaMap: number[] = [];
  areaDefs: AreaDef[] = [];
  globalRuleSpecs: GlobalRuleSpec[] = [];

  /** Merged view used by older call sites; prefer hasProperty. */
  rules: RuleSet;
  /** Rules that apply everywhere (including implicit TEXT IS PUSH). */
  globalRules: RuleSet;
  /** Local rules keyed by area id. */
  rulesByArea = new Map<number, RuleSet>();

  status: GameStatus = "playing";
  rulesGeneration = 0;

  documentId = "";
  isOverworld = false;
  portals: NonNullable<LevelDocument["portals"]> = [];
  /** Default play camera for this level (areas may override). */
  camera: LevelCameraSettings = { ...DEFAULT_CAMERA };
  /** World-space origin of cell (0,0) after chunk flatten. */
  originX = 0;
  originY = 0;

  /** DYNAMIC physics bodies keyed by entity id. */
  physicsBodies = new Map<EntityId, PhysicsBody>();
  /** FLUX objects that vanished and may reappear. */
  fluxLatent: FluxLatent[] = [];

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
    this.background = Array.from({ length: width * height }, () => "grass");
    this.areaMap = Array.from({ length: width * height }, () => 0);
    this.rules = emptyRules();
    this.globalRules = emptyRules();
  }

  get width(): number {
    return this.grid.width;
  }

  get height(): number {
    return this.grid.height;
  }

  cellIndex(x: number, y: number): number {
    return y * this.width + x;
  }

  areaAt(pos: Vec2): number {
    if (!this.grid.inBounds(pos)) return 0;
    return this.areaMap[this.cellIndex(pos.x, pos.y)] ?? 0;
  }

  setArea(pos: Vec2, areaId: number): void {
    if (!this.grid.inBounds(pos)) return;
    this.areaMap[this.cellIndex(pos.x, pos.y)] = areaId;
  }

  bgAt(pos: Vec2): string {
    if (!this.grid.inBounds(pos)) return "grass";
    return this.background[this.cellIndex(pos.x, pos.y)] ?? "grass";
  }

  setBg(pos: Vec2, tile: string): void {
    if (!this.grid.inBounds(pos)) return;
    this.background[this.cellIndex(pos.x, pos.y)] = tile;
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
    this.physicsBodies.delete(id);
    this.entities.destroy(id);
  }

  moveEntity(id: EntityId, to: Vec2): void {
    const e = this.entities.require(id);
    this.grid.move(id, e.position, to);
    e.position = { ...to };
  }

  rebuildRules(): void {
    this.globalRules = rulesFromGlobalSpecs(this.globalRuleSpecs, this.lexicon);

    const textsByArea = new Map<number, TextTile[]>();
    for (const e of this.entities.values()) {
      if (e.kind !== "text") continue;
      const td = this.textData.get(e.id);
      if (!td) continue;
      const area = this.areaAt(e.position);
      const list = textsByArea.get(area) ?? [];
      list.push({ wordId: td.wordId, x: e.position.x, y: e.position.y });
      textsByArea.set(area, list);
    }

    this.rulesByArea.clear();
    const mergedFeatures = [...this.globalRules.features];

    for (const [areaId, texts] of textsByArea) {
      const local = parseRules({
        lexicon: this.lexicon,
        width: this.width,
        height: this.height,
        texts,
        areaAt: (x, y) => this.areaAt({ x, y }),
        includeImplicitTextPush: false,
      });
      this.rulesByArea.set(areaId, local);
      mergedFeatures.push(...local.features);
    }

    // Convenience aggregate (not used for evaluation when areas matter).
    this.rules = {
      features: mergedFeatures,
      propertiesByNoun: this.globalRules.propertiesByNoun,
      transformsByNoun: this.globalRules.transformsByNoun,
    };
    this.rulesGeneration++;
  }

  effectiveNoun(e: EntityRecord): NounId {
    return e.kind === "text" ? asNounId("text") : e.noun;
  }

  /**
   * Nouns an entity answers to in rule evaluation.
   * Text tiles match both TEXT and WORD.
   */
  nounsForEntity(e: EntityRecord): NounId[] {
    if (e.kind === "text") return [asNounId("text"), asNounId("word")];
    return [e.noun];
  }

  private featuresForArea(areaId: number): Feature[] {
    const local = this.rulesByArea.get(areaId);
    if (!local) return [...this.globalRules.features];
    return [...this.globalRules.features, ...local.features];
  }

  /** Public: features visible in an area (global ∪ local). */
  featuresForAreaPublic(areaId: number): Feature[] {
    return this.featuresForArea(areaId);
  }

  private conditionsMet(e: EntityRecord, feature: Feature): boolean {
    for (const c of feature.conditions) {
      if (c.kind === "on") {
        const here = this.grid.entitiesAt(e.position, this.entities);
        const found = here.some(
          (o) =>
            o.alive &&
            o.id !== e.id &&
            this.nounsForEntity(o).some((n) => n === c.noun),
        );
        if (c.negated ? found : !found) return false;
      }
    }
    return true;
  }

  /** Public: whether an entity satisfies a feature's ON conditions. */
  conditionsMetPublic(e: EntityRecord, feature: Feature): boolean {
    return this.conditionsMet(e, feature);
  }

  /** Property query: global ∪ area rules, with ON conditions + WORD alias. */
  hasProperty(e: EntityRecord, property: PropertyId | string): boolean {
    const prop = typeof property === "string" ? asPropertyId(property) : property;
    const nouns = this.nounsForEntity(e);
    const area = this.areaAt(e.position);

    // Fast path: unconditional index.
    for (const noun of nouns) {
      if (nounHasProperty(this.globalRules, noun, prop)) return true;
      const local = this.rulesByArea.get(area);
      if (local && nounHasProperty(local, noun, prop)) return true;
    }

    // Conditional features (and any not indexed).
    for (const f of this.featuresForArea(area)) {
      if (f.subject.negated) continue;
      if (f.verb !== asOperatorId("is")) continue;
      if (f.target.kind !== "property" || f.target.negated) continue;
      if (f.target.property !== prop) continue;
      if (!nouns.includes(f.subject.noun)) continue;
      if (!this.conditionsMet(e, f)) continue;
      return true;
    }
    return false;
  }

  /** Transform target for a noun in a given area (global ∪ local, unconditional). */
  transformTarget(noun: NounId, areaId: number): NounId | undefined {
    const local = this.rulesByArea.get(areaId)?.transformsByNoun.get(noun);
    if (local) return local;
    return this.globalRules.transformsByNoun.get(noun);
  }

  /** Transform including conditional IS-noun features for this entity. */
  transformTargetFor(e: EntityRecord): NounId | undefined {
    const area = this.areaAt(e.position);
    const unconditional = this.transformTarget(e.noun, area);
    for (const f of this.featuresForArea(area)) {
      if (f.subject.negated) continue;
      if (f.verb !== asOperatorId("is")) continue;
      if (f.target.kind !== "noun" || f.target.negated) continue;
      if (f.subject.noun !== e.noun) continue;
      if (!this.conditionsMet(e, f)) continue;
      return f.target.noun;
    }
    return unconditional;
  }

  entitiesWithProperty(property: PropertyId | string): EntityRecord[] {
    const prop = typeof property === "string" ? asPropertyId(property) : property;
    return this.entities.filter((e) => e.alive && this.hasProperty(e, prop));
  }

  /**
   * Rules shown in the HUD.
   * Always includes globals; local area rules only for `focusAreaId` when set
   * (player's current cell), so the overworld doesn't dump every area at once.
   */
  activeFeaturesForDisplay(focusAreaId?: number): string[] {
    const keys: string[] = [];
    const seen = new Set<string>();
    const add = (key: string, label?: string) => {
      if (key === "text is push") return;
      const shown = label ? `${label}: ${key}` : key;
      if (seen.has(shown)) return;
      seen.add(shown);
      keys.push(shown);
    };

    for (const f of this.globalRules.features) {
      add(f.key);
    }

    if (focusAreaId !== undefined) {
      if (focusAreaId !== 0) {
        const def = this.areaDefs.find((a) => a.id === focusAreaId);
        const local = this.rulesByArea.get(focusAreaId);
        if (local) {
          for (const f of local.features) {
            add(f.key, def?.name ?? `Area ${focusAreaId}`);
          }
        }
      } else {
        // Texts sitting outside areas still form rules tagged area 0.
        const open = this.rulesByArea.get(0);
        if (open) {
          for (const f of open.features) add(f.key);
        }
      }
    } else {
      for (const [areaId, rs] of this.rulesByArea) {
        const def = this.areaDefs.find((a) => a.id === areaId);
        const prefix =
          areaId === 0 ? undefined : (def?.name ?? `Area ${areaId}`);
        for (const f of rs.features) add(f.key, prefix);
      }
    }
    return keys;
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
    w.background = [...this.background];
    w.areaMap = [...this.areaMap];
    w.areaDefs = this.areaDefs.map((a) => ({ ...a }));
    w.globalRuleSpecs = this.globalRuleSpecs.map((g) => ({ ...g }));
    w.rules = this.rules;
    w.globalRules = this.globalRules;
    w.rulesByArea = new Map(this.rulesByArea);
    w.status = this.status;
    w.rulesGeneration = this.rulesGeneration;
    w.documentId = this.documentId;
    w.isOverworld = this.isOverworld;
    w.portals = this.portals.map((p) => ({ ...p }));
    w.camera = { ...this.camera };
    w.originX = this.originX;
    w.originY = this.originY;
    for (const [id, body] of this.physicsBodies) {
      w.physicsBodies.set(id, { ...body });
    }
    w.fluxLatent = this.fluxLatent.map((f) => ({ ...f }));
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
