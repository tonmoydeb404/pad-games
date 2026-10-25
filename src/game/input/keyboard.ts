/**
 * Keyboard source — the debug/rebinding fallback. Codes are consumed by the
 * InputManager each frame; edges (fresh presses) are queued here.
 */

const PREVENT_DEFAULT = new Set([
  "Space",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

export class KeyboardSource {
  private down = new Set<string>();
  private pressedQueue: string[] = [];
  private keydown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
    if (!this.down.has(e.code)) this.pressedQueue.push(e.code);
    this.down.add(e.code);
  };
  private keyup = (e: KeyboardEvent) => {
    this.down.delete(e.code);
  };
  private blur = () => {
    this.down.clear();
  };

  attach(): void {
    window.addEventListener("keydown", this.keydown);
    window.addEventListener("keyup", this.keyup);
    window.addEventListener("blur", this.blur);
  }

  detach(): void {
    window.removeEventListener("keydown", this.keydown);
    window.removeEventListener("keyup", this.keyup);
    window.removeEventListener("blur", this.blur);
    this.down.clear();
    this.pressedQueue.length = 0;
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** Fresh presses since last call. */
  consumePressed(): string[] {
    const out = this.pressedQueue;
    this.pressedQueue = [];
    return out;
  }
}
