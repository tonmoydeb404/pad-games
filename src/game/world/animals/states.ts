import type { Actor, State } from "./actor";
import { play } from "./animation";

export function enterState(a: Actor, s: State): void {
  if (a.state === s) return;
  a.state = s;
  a.stateT = 0;
  if (s !== "idle") a.eatT = 0;
  if (s === "idle") play(a, "idle", 0.35, 0.95);
  if (s === "flee") play(a, "move", 0.18, 1.0 + Math.random() * 0.15);
  if (s === "attack") play(a, "move", 0.15, 1.15);
}
