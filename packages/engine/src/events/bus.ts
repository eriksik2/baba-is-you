/**
 * Tiny typed pub/sub for UI / audio / analytics.
 * Engine systems stay pure; the session boundary emits events.
 */

export type GameEventMap = {
  "after-turn": { status: string; rulesChanged: boolean };
  "rules-changed": { generation: number };
  won: {};
  lost: {};
};

type Handler<T> = (payload: T) => void;

export class EventBus<TEvents extends Record<string, unknown>> {
  private readonly handlers = new Map<keyof TEvents, Set<Handler<unknown>>>();

  on<K extends keyof TEvents>(event: K, handler: Handler<TEvents[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<unknown>);
    return () => set!.delete(handler as Handler<unknown>);
  }

  emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const h of set) h(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}
