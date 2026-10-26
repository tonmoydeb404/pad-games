import type { AnimalDef } from "./types";

export const NATURAL_DEFS: AnimalDef[] = [
  // ---- trail-corridor mammals — the wildlife you actually meet on the loop ----
  { name: "Deer", file: "Deer", height: 1.5, mass: 120, flee: 9.5, tier: "medium", temper: "skittish", hp: 70, atk: 0, points: 250, band: "corridor", count: 6 },
  { name: "Stag", file: "Stag", height: 1.75, mass: 200, flee: 9.0, tier: "medium", temper: "skittish", hp: 85, atk: 0, points: 250, band: "corridor", count: 5 },
  { name: "Fox", file: "Fox", height: 0.55, mass: 8, flee: 8.5, tier: "light", temper: "calm", hp: 25, atk: 0, points: 100, band: "corridor", count: 6 },
  { name: "Wolf", file: "Wolf", height: 0.8, mass: 45, flee: 9.0, tier: "light", temper: "fierce", hp: 45, atk: 12, points: 100, band: "corridor", count: 5 },
  { name: "Husky", file: "Husky", height: 0.55, mass: 26, flee: 8.5, tier: "light", temper: "calm", hp: 30, atk: 0, points: 100, band: "corridor", count: 4 },
  { name: "ShibaInu", file: "ShibaInu", height: 0.45, mass: 10, flee: 7.5, tier: "light", temper: "calm", hp: 22, atk: 0, points: 100, band: "corridor", count: 5 },
  { name: "Horse", file: "Horse", height: 1.65, mass: 500, flee: 11, tier: "heavy", temper: "skittish", hp: 120, atk: 0, points: 400, band: "corridor", count: 3 },
  { name: "Horse_White", file: "Horse_White", height: 1.65, mass: 500, flee: 11, tier: "heavy", temper: "skittish", hp: 120, atk: 0, points: 400, band: "corridor", count: 2 },
  { name: "Donkey", file: "Donkey", height: 1.45, mass: 350, flee: 8.0, tier: "medium", temper: "skittish", hp: 95, atk: 0, points: 250, band: "corridor", count: 3 },
  { name: "Alpaca", file: "Alpaca", height: 1.1, mass: 150, flee: 7.5, tier: "medium", temper: "skittish", hp: 65, atk: 0, points: 250, band: "corridor", count: 4 },
  { name: "Cow", file: "Cow", height: 1.45, mass: 600, flee: 6.5, tier: "heavy", temper: "skittish", hp: 140, atk: 0, points: 400, band: "corridor", count: 4 },
  { name: "Bull", file: "Bull", height: 1.55, mass: 800, flee: 7.0, tier: "heavy", temper: "fierce", hp: 260, atk: 26, points: 400, band: "corridor", count: 3 },
  // ---- stream critters ----
  { name: "Frog", file: "Frog", height: 0.22, mass: 0.5, flee: 3.2, tier: "light", temper: "skittish", hp: 10, atk: 0, hopper: true, points: 100, band: "stream", count: 6 },
  { name: "Snake", file: "Snake", height: 0.25, mass: 3, flee: 2.6, tier: "light", temper: "calm", hp: 15, atk: 0, points: 100, band: "stream", count: 4 },
  { name: "Snake_angry", file: "Snake_angry", height: 0.25, mass: 3, flee: 2.6, tier: "light", temper: "fierce", hp: 30, atk: 9, points: 150, band: "stream", count: 2 },
  { name: "Rat", file: "Rat", height: 0.18, mass: 0.5, flee: 4.2, tier: "light", temper: "skittish", hp: 8, atk: 0, points: 100, band: "stream", count: 5 },
  { name: "Spider", file: "Spider", height: 0.3, mass: 1, flee: 2.2, tier: "light", temper: "fierce", hp: 26, atk: 7, points: 100, band: "stream", count: 4 },
  // ---- deep jungle dinos ----
  { name: "Trex", file: "Trex", height: 3.6, mass: 4000, flee: 5.5, tier: "heavy", temper: "fierce", hp: 450, atk: 42, points: 500, band: "deep", count: 2 },
  { name: "Velociraptor", file: "Velociraptor", height: 1.1, mass: 150, flee: 8.5, tier: "medium", temper: "fierce", hp: 110, atk: 16, points: 500, band: "deep", count: 6 },
  { name: "Triceratops", file: "Triceratops", height: 1.5, mass: 900, flee: 5.0, tier: "heavy", temper: "calm", hp: 230, atk: 0, points: 500, band: "deep", count: 4 },
  { name: "Stegosaurus", file: "Stegosaurus", height: 1.8, mass: 1500, flee: 4.0, tier: "heavy", temper: "calm", hp: 300, atk: 0, points: 500, band: "deep", count: 4 },
  { name: "Apatosaurus", file: "Apatosaurus", height: 2.8, mass: 3000, flee: 3.5, tier: "heavy", temper: "calm", hp: 340, atk: 0, points: 500, band: "deep", count: 2 },
  { name: "Parasaurolophus", file: "Parasaurolophus", height: 1.7, mass: 800, flee: 5.5, tier: "heavy", temper: "calm", hp: 190, atk: 0, points: 500, band: "deep", count: 4 },
  // ---- anywhere ----
  { name: "Wasp", file: "Wasp", height: 0.35, mass: 0.2, flee: 6.0, tier: "light", temper: "fierce", hp: 12, atk: 5, flyer: true, points: 150, band: "any", count: 6 },
];
