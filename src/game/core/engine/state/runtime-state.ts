/** Engine state: loop timing, game-feel counters, laps, HUD DOM and temporaries. (Internal fields are public only so the extracted engine modules can reach them.) */
import * as THREE from "three";
import { JeepAudio } from "../../audio";
import { JeepInput } from "../../input";
import { PlayerState } from "./player-state";

export class RuntimeState extends PlayerState {
  // loop / lifecycle
  started = false;
  paused = false;
  destroyed = false;
  time = 0;
  lastT = 0;
  rafId = 0;
  dragging = false;
  lastDragX = 0;
  lastDragY = 0;
  acc = 0;
  readonly prevPos = new THREE.Vector3();
  readonly currPos = new THREE.Vector3();
  /** Interpolated render position (camera + visual emitters follow this). */
  readonly renderPos = new THREE.Vector3();
  // game feel / events
  /** Airtime accumulator (seconds with no wheel contact). */
  airT = 0;
  noContactTicks = 0;
  /** Consecutive ticks the chassis has been touching something solid. */
  contactTicks = 0;
  lastImpact = 0;
  lastScrape = 0;
  lastBottomOut = 0;
  // countdown & lap timing (ux)
  countdownT = 0;
  lastCountNum = 4;
  lapStartT = 0;
  lapTimes: number[] = [];
  bestLap = 0;
  // HUD DOM
  root: HTMLDivElement | null = null;
  styleEl: HTMLStyleElement | null = null;
  el: Record<string, HTMLElement | null> = {};
  gearEls: HTMLElement[] = [];
  readonly input = new JeepInput();
  readonly audio = new JeepAudio();
  readonly tmpInfo = { dist: 999, y: 0, i: 0, t: 0, s: 0 };
  readonly tmpColor = new THREE.Color();
  readonly tmpVec = new THREE.Vector3();
  readonly upVec = new THREE.Vector3();
  noticeTimer = 0;
  uiAcc = 0;
}
