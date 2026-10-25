import { PITCH_LIMIT, WEAPONS } from "@pad/arena-shared";

export interface InputSample {
  mx: number;
  mz: number;
  jump: boolean;
  fire: boolean;
  reload: boolean;
  /** weapon id to switch to, or -1 */
  weapon: number;
  /** throw a grenade */
  throw: boolean;
  /** scoped (RMB) */
  zoom: boolean;
}

/**
 * Keyboard + pointer-lock mouse. Look angles are applied immediately; buttons
 * are sampled per fixed step. Weapon slots 1–5 + wheel cycling honour the
 * player's owned-weapon mask; G lobs a grenade; RMB scopes (sniper).
 */
export class ArenaInput {
  yaw = 0;
  pitch = 0;
  sensitivity = 0.0022;
  locked = false;
  onLockChange?: (locked: boolean) => void;
  onScoreboard?: (show: boolean) => void;
  onPause?: () => void;

  private keys = new Set<string>();
  private fireHeld = false;
  private zoomHeld = false;
  private reloadLatch = false;
  private weaponLatch = -1;
  private throwLatch = false;
  /** bitmask of weapons the player owns (from the latest snapshot) */
  owned = 0b11;
  /** mouse deltas since last sample, for viewmodel sway */
  moveDx = 0;
  moveDy = 0;

  constructor(private el: HTMLElement) {
    document.addEventListener("pointerlockchange", this.onLock);
    document.addEventListener("mousemove", this.onMove);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    el.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("wheel", this.onWheel, { passive: true });
    window.addEventListener("blur", this.onBlur);
    el.addEventListener("contextmenu", this.prevent);
  }

  requestLock(): void {
    void this.el.requestPointerLock?.();
  }

  destroy(): void {
    document.removeEventListener("pointerlockchange", this.onLock);
    document.removeEventListener("mousemove", this.onMove);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.el.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("blur", this.onBlur);
    this.el.removeEventListener("contextmenu", this.prevent);
    if (document.pointerLockElement === this.el) document.exitPointerLock();
  }

  /** Read the current held state and consume one-shot latches. */
  sample(): InputSample {
    const k = this.keys;
    const s: InputSample = {
      mx: (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0),
      mz: (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0),
      jump: k.has("Space"),
      fire: this.fireHeld && this.locked,
      reload: this.reloadLatch,
      weapon: this.weaponLatch,
      throw: this.throwLatch,
      zoom: this.zoomHeld && this.locked,
    };
    this.reloadLatch = false;
    this.weaponLatch = -1;
    this.throwLatch = false;
    return s;
  }

  takeMouseDelta(): { dx: number; dy: number } {
    const d = { dx: this.moveDx, dy: this.moveDy };
    this.moveDx = 0;
    this.moveDy = 0;
    return d;
  }

  private prevent = (e: Event) => e.preventDefault();

  private onLock = () => {
    this.locked = document.pointerLockElement === this.el;
    if (!this.locked) {
      this.fireHeld = false;
      this.zoomHeld = false;
      this.keys.clear();
      this.onScoreboard?.(false);
    }
    this.onLockChange?.(this.locked);
  };

  private onMove = (e: MouseEvent) => {
    if (!this.locked) return;
    this.yaw -= e.movementX * this.sensitivity;
    this.pitch -= e.movementY * this.sensitivity;
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch));
    this.moveDx += e.movementX;
    this.moveDy += e.movementY;
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.locked) return;
    if (e.code === "Space" || e.code === "Tab" || e.code.startsWith("Arrow")) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    if (e.code === "KeyR") this.reloadLatch = true;
    if (e.code === "KeyG") this.throwLatch = true;
    const digit = /^Digit([1-5])$/.exec(e.code);
    if (digit) this.weaponLatch = Number(digit[1]) - 1;
    if (e.code === "Tab") this.onScoreboard?.(true);
    if (e.code === "Escape") this.onPause?.();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    if (e.code === "Tab") {
      e.preventDefault();
      this.onScoreboard?.(false);
    }
  };

  private onMouseDown = (e: MouseEvent) => {
    if (!this.locked) {
      this.requestLock();
      return;
    }
    if (e.button === 0) this.fireHeld = true;
    if (e.button === 2) this.zoomHeld = true;
    if (e.button === 1) this.throwLatch = true;
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.fireHeld = false;
    if (e.button === 2) this.zoomHeld = false;
  };

  /** Wheel cycles through owned weapons. */
  private onWheel = (e: WheelEvent) => {
    if (!this.locked) return;
    const owned = WEAPONS.map((_, i) => i).filter((i) => (this.owned & (1 << i)) !== 0);
    if (owned.length < 2) return;
    const cur = owned.indexOf(this.lastWeapon);
    const next = owned[(cur + (e.deltaY > 0 ? 1 : owned.length - 1)) % owned.length];
    this.weaponLatch = next;
  };

  private lastWeapon = 0;
  /** the arena keeps this in sync so the wheel cycles from the held weapon */
  setLastWeapon(w: number): void {
    this.lastWeapon = w;
  }

  private onBlur = () => {
    this.keys.clear();
    this.fireHeld = false;
    this.zoomHeld = false;
  };
}
