import type { EntityId, Vec2 } from "../types";
import type { EntityRecord, EntityStore } from "../entity/store";

/**
 * Spatial index over the grid.
 * Cells hold ordered stacks of entity IDs (bottom → top).
 */
export class Grid {
  readonly width: number;
  readonly height: number;
  private readonly cells: EntityId[][];

  constructor(width: number, height: number) {
    if (width <= 0 || height <= 0) {
      throw new Error(`Invalid grid size ${width}x${height}`);
    }
    this.width = width;
    this.height = height;
    this.cells = Array.from({ length: width * height }, () => []);
  }

  inBounds(pos: Vec2): boolean {
    return pos.x >= 0 && pos.y >= 0 && pos.x < this.width && pos.y < this.height;
  }

  private index(pos: Vec2): number {
    return pos.y * this.width + pos.x;
  }

  at(pos: Vec2): readonly EntityId[] {
    if (!this.inBounds(pos)) return [];
    return this.cells[this.index(pos)]!;
  }

  entitiesAt(pos: Vec2, store: EntityStore): EntityRecord[] {
    return this.at(pos)
      .map((id) => store.get(id))
      .filter((e): e is EntityRecord => e !== undefined && e.alive);
  }

  place(id: EntityId, pos: Vec2): void {
    if (!this.inBounds(pos)) {
      throw new Error(`Cannot place entity outside grid at (${pos.x}, ${pos.y})`);
    }
    const stack = this.cells[this.index(pos)]!;
    if (!stack.includes(id)) stack.push(id);
  }

  remove(id: EntityId, pos: Vec2): void {
    if (!this.inBounds(pos)) return;
    const stack = this.cells[this.index(pos)]!;
    const i = stack.indexOf(id);
    if (i >= 0) stack.splice(i, 1);
  }

  move(id: EntityId, from: Vec2, to: Vec2): void {
    this.remove(id, from);
    this.place(id, to);
  }

  clear(): void {
    for (const cell of this.cells) cell.length = 0;
  }

  /** Rebuild occupancy from the entity store (recovery / load). */
  rebuildFrom(store: EntityStore): void {
    this.clear();
    for (const e of store.values()) {
      if (e.alive && this.inBounds(e.position)) {
        this.place(e.id, e.position);
      }
    }
  }

  clone(): Grid {
    const g = new Grid(this.width, this.height);
    for (let i = 0; i < this.cells.length; i++) {
      g.cells[i] = [...this.cells[i]!];
    }
    return g;
  }

  *positions(): Generator<Vec2> {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        yield { x, y };
      }
    }
  }
}
