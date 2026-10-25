/** Minimal typed event emitter. The only bridge between game core and React. */

export type Handler<T> = (payload: T) => void;

export class Emitter<Events extends object> {
  private map = new Map<keyof Events, Set<Handler<never>>>();

  on<K extends keyof Events>(event: K, fn: Handler<Events[K]>): () => void {
    let set = this.map.get(event);
    if (!set) {
      set = new Set();
      this.map.set(event, set);
    }
    set.add(fn as Handler<never>);
    return () => this.off(event, fn);
  }

  off<K extends keyof Events>(event: K, fn: Handler<Events[K]>): void {
    this.map.get(event)?.delete(fn as Handler<never>);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.map.get(event);
    if (!set) return;
    for (const fn of [...set]) {
      (fn as unknown as Handler<Events[K]>)(payload);
    }
  }

  clear(): void {
    this.map.clear();
  }
}
