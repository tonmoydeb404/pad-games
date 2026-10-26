import type { AnimalDef } from "./types";

/** A species' special move — one button, its own cooldown. */
export interface Special {
  name: string;
  text: string;
  cd: number;
  shake: number;
  thud: number;
  /** also plays the species' call */
  call?: boolean;
  heal?: number;
  /** burst of speed (multiplier of top speed, seconds) */
  boost?: { mult: number; dur: number };
  /** launch into the air: peak height (m) and the forward speed held until landing */
  leap?: { up: number; fwd: number };
  /** damage/knock/stun/scare area: "cone" ahead, "back" behind, "aoe" all around */
  hit?: { kind: "cone" | "back" | "aoe"; range: number; arc?: number; dmg: number; knock: number; stun?: number; scare?: boolean; onLand?: boolean };
}
const sp = (name: string, text: string, cd: number, rest: Partial<Special> = {}): Special => ({ name, text, cd, shake: 0.12, thud: 0.35, ...rest });
export const SPECIALS: Record<string, Special> = {
  Deer: sp("Bound", "Leap!", 3, { leap: { up: 4.5, fwd: 11 } }),
  Stag: sp("Antler Charge", "Charge!", 7, { call: true, boost: { mult: 1.8, dur: 2.5 }, hit: { kind: "cone", range: 5, arc: 0.5, dmg: 28, knock: 6 }, shake: 0.3 }),
  Fox: sp("Pounce", "Pounce!", 4, { leap: { up: 2, fwd: 15 }, hit: { kind: "cone", range: 4, arc: 0.2, dmg: 20, knock: 3, onLand: true } }),
  Wolf: sp("Lunge Bite", "Bite!", 4, { leap: { up: 1.2, fwd: 19 }, hit: { kind: "cone", range: 5, arc: 0.2, dmg: 30, knock: 3, onLand: true } }),
  Husky: sp("Sled Sprint", "Sprint!", 8, { boost: { mult: 1.9, dur: 4 } }),
  ShibaInu: sp("Alarm Bark", "Woof!", 6, { call: true, hit: { kind: "aoe", range: 14, dmg: 0, knock: 0, stun: 1.2, scare: true } }),
  Horse: sp("Gallop Burst", "Hyah!", 7, { call: true, boost: { mult: 1.7, dur: 3 } }),
  Horse_White: sp("Gallop Burst", "Hyah!", 7, { call: true, boost: { mult: 1.7, dur: 3 } }),
  Donkey: sp("Rear Kick", "Kick!", 3, { hit: { kind: "back", range: 4.5, arc: 0.1, dmg: 38, knock: 9 }, shake: 0.25, thud: 0.6 }),
  Alpaca: sp("Spit", "Ptooey!", 3, { hit: { kind: "cone", range: 12, arc: 0.85, dmg: 5, knock: 1, stun: 2.5 } }),
  Cow: sp("Fresh Milk", "Mooo~ +30 HP", 20, { call: true, heal: 30 }),
  Bull: sp("Charge", "Charge!", 7, { call: true, boost: { mult: 2, dur: 3 }, hit: { kind: "cone", range: 5, arc: 0.5, dmg: 45, knock: 8 }, shake: 0.35 }),
  Frog: sp("Mega Leap", "Boing!", 5, { leap: { up: 9, fwd: 6 }, hit: { kind: "aoe", range: 8, dmg: 18, knock: 4, stun: 2, onLand: true }, shake: 0.3 }),
  Snake: sp("Venom Bite", "Bite!", 3, { hit: { kind: "cone", range: 5, arc: 0.4, dmg: 40, knock: 1 } }),
  Snake_angry: sp("Venom Bite", "BITE!", 3, { hit: { kind: "cone", range: 5, arc: 0.4, dmg: 60, knock: 1 } }),
  Rat: sp("Scurry", "Scurry!", 6, { boost: { mult: 2.2, dur: 2.5 } }),
  Spider: sp("Web Shot", "Thwip!", 5, { hit: { kind: "cone", range: 18, arc: 0.8, dmg: 0, knock: 0, stun: 4 } }),
  Wasp: sp("Sting Dive", "Sting!", 4, { boost: { mult: 2.2, dur: 1.5 }, hit: { kind: "cone", range: 6, arc: 0.4, dmg: 35, knock: 3 } }),
  Trex: sp("Mighty Roar", "ROOOAAR!", 10, { call: true, hit: { kind: "aoe", range: 40, dmg: 0, knock: 3, stun: 1.5, scare: true }, shake: 0.8, thud: 0.8 }),
  Velociraptor: sp("Pounce", "Pounce!", 5, { leap: { up: 3, fwd: 20 }, hit: { kind: "aoe", range: 7, dmg: 45, knock: 5, onLand: true }, shake: 0.3 }),
  Triceratops: sp("Horn Charge", "Charge!", 8, { call: true, boost: { mult: 1.7, dur: 3 }, hit: { kind: "cone", range: 9, arc: 0.5, dmg: 60, knock: 10 }, shake: 0.4 }),
  Stegosaurus: sp("Tail Swipe", "Swipe!", 5, { hit: { kind: "aoe", range: 14, dmg: 55, knock: 9 }, shake: 0.4, thud: 0.6 }),
  Apatosaurus: sp("Ground Stomp", "STOMP!", 9, { call: true, hit: { kind: "aoe", range: 40, dmg: 40, knock: 14, stun: 2 }, shake: 1, thud: 1 }),
  Parasaurolophus: sp("Sonic Honk", "HOOONK!", 7, { call: true, hit: { kind: "aoe", range: 35, dmg: 0, knock: 12, stun: 2, scare: true }, shake: 0.4 }),
};
export function specialOf(def: AnimalDef): Special {
  return SPECIALS[def.file] ?? sp("Roar", "Grr!", 8, { call: true });
}
