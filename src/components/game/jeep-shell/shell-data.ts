import type { JeepQuality } from "@/game/core/engine";
import type { SkinId } from "@/game/player/character";

export const QUALITIES: { id: JeepQuality; label: string }[] = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
];

/** Playable explorers — the four Kenney skins on the shared rig. */
export const CHARACTERS: { id: SkinId; label: string; blurb: string }[] = [
  { id: "skaterMaleA", label: "Rio · Skater", blurb: "Quick on his feet, always up for a trail." },
  { id: "skaterFemaleA", label: "Mia · Skater", blurb: "Fearless on any terrain." },
  { id: "criminalMaleA", label: "Dex · Outlaw", blurb: "Hard to rattle, harder to catch." },
  { id: "cyborgFemaleA", label: "Nova · Cyborg", blurb: "Part human, all explorer." },
];
export const CHARACTER_KEY = "jeep.character";

export const QUALITY_KEY = "tintin.quality";

export const PAD_CONTROLS: [string, string][] = [
  ["Left stick", "Steer · move (tilt = walk → jog)"],
  ["RT · A", "Accelerate · A jumps on foot"],
  ["LT", "Brake · reverse"],
  ["RT · L3", "Sprint (on foot, no gun)"],
  ["X · B", "Punch · kick (on foot)"],
  ["R3", "Dodge roll (on foot)"],
  ["LB", "Cameras · crouch (on foot)"],
  ["B · X", "Handbrake · horn (driving)"],
  ["Dpad ↓", "Headlights · cycle guns (on foot)"],
  ["RT · LT", "Gun out: fire · aim"],
  ["X", "Gun out: reload"],
  ["Y", "Enter / exit vehicle"],
  ["Right stick", "Look around"],
  ["RB", "Reset · warp to vehicle"],
  ["Back", "Inventory"],
  ["Start", "Pause"],
];

export const KEY_CONTROLS: [string, string][] = [
  ["W A S D", "Drive · move on foot"],
  ["Shift", "Sprint (on foot)"],
  ["Space", "Handbrake · jump (on foot)"],
  ["J · click", "Punch (on foot)"],
  ["K · right-click", "Kick (on foot) · horn"],
  ["Q", "Dodge roll (on foot)"],
  ["C", "Crouch (on foot) · camera"],
  ["1 – 5 · Tab · 0", "Draw a gun · cycle · holster"],
  ["Click · J", "Gun out: fire (hold for auto)"],
  ["Right-click · X", "Gun out: aim down the sights"],
  ["R · T", "Gun out: reload"],
  ["F / E", "Enter / exit vehicle"],
  ["Drag", "Look around"],
  ["V · H", "Undercam · headlights"],
  ["R", "Reset · warp to vehicle (no gun)"],
  ["I", "Inventory"],
  ["M", "Mute"],
  ["P / Esc", "Pause"],
];
