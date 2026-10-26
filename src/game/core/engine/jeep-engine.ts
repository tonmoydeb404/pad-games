/**
 * Jungle Jeep — 3D off-road driving engine (three.js, fully procedural).
 *
 * Ported from the original standalone single-file build. The engine lives
 * entirely outside React: it owns its canvas, HUD DOM and input sources, and
 * only slow state changes cross back to the shell through callbacks.
 *
 * Layout: instance fields live in the `state/*` class layers; behaviour lives in
 * the method modules (`world/`, `vehicle/`, `player/`, `camera/`, `ui/`,
 * `runtime/`) — plain functions taking the engine as `this` — merged onto the
 * prototype here (see `methods.ts`).
 */
import { QUALITY, type JeepOptions } from "./config/quality";
import { ENGINE_METHODS } from "./methods";
import { RuntimeState } from "./state/runtime-state";

// Merge the method modules' signatures into the class type.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
export interface JeepEngine extends Methods {}
type Methods = typeof ENGINE_METHODS;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class JeepEngine extends RuntimeState {
  constructor(opts: JeepOptions) {
    super();
    this.container = opts.container;
    this.Q = QUALITY[opts.quality ?? "high"];
    this.initTrail();
    this.initSites();
    this.input.onConnectChange = (c, id) => {
      this.updatePadChip(c, id);
      this.onPadChange?.(c, id);
    };
    // DOM handlers are registered by reference, so they are bound per instance.
    this.animate = this.animate.bind(this);
    this.onResize = this.onResize.bind(this);
    this.onPauseKey = this.onPauseKey.bind(this);
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onContextMenu = this.onContextMenu.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onWheel = this.onWheel.bind(this);
    this.onVisibility = this.onVisibility.bind(this);
  }

  get isPaused(): boolean {
    return this.paused;
  }
}

Object.assign(JeepEngine.prototype, ENGINE_METHODS);
