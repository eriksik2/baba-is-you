import type { EntityId, NounId, Vec2, Direction } from "../types";
import { asEntityId } from "../types";

/**
 * What kind of thing an entity is on the board.
 * - object: physical instance of a noun (baba, wall, …)
 * - text: rule-forming word tile
 */
export type EntityKind = "object" | "text";

export interface EntityRecord {
  readonly id: EntityId;
  /** Grid position. Multiple entities may share a cell (stacking). */
  position: Vec2;
  kind: EntityKind;
  /**
   * For objects: which noun they are.
   * For text: the noun this text names when it is a noun-word
   * (also stored in TextComponent; duplicated for fast object queries).
   */
  noun: NounId;
  /** Draw / push order within a cell. Higher = on top. */
  layer: number;
  alive: boolean;
  /** Last movement direction — used by SLIDE. */
  facing: Direction;
}

/**
 * Dense entity store with recycled IDs.
 * Designed so later systems (rendering, networking, save games) can snapshot cheaply.
 */
export class EntityStore {
  private readonly entities = new Map<EntityId, EntityRecord>();
  private nextId = 1;
  private readonly freeIds: EntityId[] = [];

  create(
    init: Omit<EntityRecord, "id" | "alive" | "facing"> & {
      alive?: boolean;
      facing?: Direction;
    },
  ): EntityRecord {
    const id = this.freeIds.pop() ?? asEntityId(this.nextId++);
    const record: EntityRecord = {
      id,
      position: { ...init.position },
      kind: init.kind,
      noun: init.noun,
      layer: init.layer,
      alive: init.alive ?? true,
      facing: init.facing ?? "down",
    };
    this.entities.set(id, record);
    return record;
  }

  get(id: EntityId): EntityRecord | undefined {
    return this.entities.get(id);
  }

  require(id: EntityId): EntityRecord {
    const e = this.entities.get(id);
    if (!e) throw new Error(`Unknown entity ${id}`);
    return e;
  }

  destroy(id: EntityId): void {
    const e = this.entities.get(id);
    if (!e) return;
    e.alive = false;
    this.entities.delete(id);
    this.freeIds.push(id);
  }

  /** Alive entities only. */
  values(): IterableIterator<EntityRecord> {
    return this.entities.values();
  }

  all(): EntityRecord[] {
    return [...this.entities.values()];
  }

  filter(pred: (e: EntityRecord) => boolean): EntityRecord[] {
    const out: EntityRecord[] = [];
    for (const e of this.entities.values()) {
      if (pred(e)) out.push(e);
    }
    return out;
  }

  clear(): void {
    this.entities.clear();
    this.freeIds.length = 0;
    this.nextId = 1;
  }

  /** Deep-ish clone for undo snapshots. */
  clone(): EntityStore {
    const copy = new EntityStore();
    copy.nextId = this.nextId;
    copy.freeIds.push(...this.freeIds);
    for (const e of this.entities.values()) {
      copy.entities.set(e.id, {
        id: e.id,
        position: { ...e.position },
        kind: e.kind,
        noun: e.noun,
        layer: e.layer,
        alive: e.alive,
        facing: e.facing,
      });
    }
    return copy;
  }
}
