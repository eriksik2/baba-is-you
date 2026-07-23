import type { World } from "../world/world";

/**
 * Undo stack of full world snapshots.
 * Simple and correct; can later swap for command-based or delta compression.
 */
export class HistoryStack {
  private readonly stack: World[] = [];

  constructor(private readonly limit = 256) {}

  push(snapshot: World): void {
    this.stack.push(snapshot);
    if (this.stack.length > this.limit) {
      this.stack.shift();
    }
  }

  pop(): World | undefined {
    return this.stack.pop();
  }

  clear(): void {
    this.stack.length = 0;
  }

  get size(): number {
    return this.stack.length;
  }
}
