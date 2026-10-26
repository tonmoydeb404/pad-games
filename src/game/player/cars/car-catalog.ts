import type { CarPerf, CarSpec } from "./car-types";

/** The classic jeep — the physics baseline everything else tunes around. */
export const JEEP_PERF: CarPerf = {
  speed: 1.0,
  accel: 1.0,
  brake: 1.0,
  steer: 10,
  agility: 1.0,
  grip: 1.0,
  mass: 1.0,
  offroad: 0,
  roll: 1.0,
  spring: 130,
  damp: 11,
};

/** Profile helper: jeep baseline + overrides. */
const perf = (o: Partial<CarPerf>): CarPerf => ({ ...JEEP_PERF, ...o });

/** Every vehicle GLB shipped by the build script, in menu order. */
export const CAR_CATALOG: CarSpec[] = [
  {
    id: "suv",
    label: "Trail SUV",
    perf: perf({ speed: 0.98, accel: 1.04, brake: 1.06, steer: 10.5, grip: 1.05, mass: 1.15, offroad: 0.3, roll: 1.05, spring: 135, damp: 11.5 }),
  },
  {
    id: "suv-luxury",
    label: "Luxury SUV",
    perf: perf({ speed: 1.03, accel: 1.06, brake: 1.0, steer: 9.5, agility: 0.95, mass: 1.25, offroad: 0.15, roll: 1.2, spring: 108, damp: 9.5 }),
  },
  {
    id: "van",
    label: "Jungle Van",
    perf: perf({ speed: 0.88, accel: 0.85, brake: 0.9, steer: 8.5, agility: 0.9, grip: 0.95, mass: 1.3, offroad: 0.12, roll: 1.3, spring: 105, damp: 9.5 }),
  },
  {
    id: "taxi",
    label: "Safari Taxi",
    perf: perf({ speed: 1.0, accel: 1.06, brake: 1.02, steer: 10.5, agility: 1.02, mass: 1.0, offroad: -0.1, roll: 1.0, spring: 125, damp: 10.5 }),
  },
  {
    id: "police",
    label: "Ranger Patrol",
    perf: perf({ speed: 1.1, accel: 1.2, brake: 1.15, steer: 11.5, agility: 1.08, grip: 1.1, mass: 1.05, offroad: -0.05, roll: 0.95, spring: 140, damp: 12 }),
  },
  {
    id: "ambulance",
    label: "Medic Van",
    perf: perf({ speed: 0.95, accel: 1.0, brake: 1.0, steer: 9, agility: 0.92, mass: 1.35, offroad: 0.1, roll: 1.3, spring: 105, damp: 9.5 }),
  },
  {
    id: "firetruck",
    label: "Fire Truck",
    perf: perf({ speed: 0.82, accel: 0.8, brake: 0.75, steer: 7, agility: 0.8, grip: 0.95, mass: 1.9, offroad: 0.1, roll: 1.45, spring: 95, damp: 9 }),
  },
  {
    id: "garbage-truck",
    label: "Garbage Truck",
    perf: perf({ speed: 0.75, accel: 0.7, brake: 0.7, steer: 6.5, agility: 0.75, grip: 0.92, mass: 2.1, offroad: 0.1, roll: 1.5, spring: 90, damp: 8.5 }),
  },
  {
    id: "delivery",
    label: "Delivery Van",
    perf: perf({ speed: 0.9, accel: 0.88, brake: 0.92, steer: 9, agility: 0.92, grip: 0.97, mass: 1.2, offroad: 0.05, roll: 1.2, spring: 115, damp: 10 }),
  },
  {
    id: "delivery-flat",
    label: "Flatbed Van",
    perf: perf({ speed: 0.88, accel: 0.85, brake: 0.9, steer: 8.8, agility: 0.9, grip: 0.95, mass: 1.25, offroad: 0.05, roll: 1.25, spring: 110, damp: 9.5 }),
  },
  {
    id: "truck",
    label: "Haul Truck",
    perf: perf({ speed: 0.75, accel: 0.72, brake: 0.68, steer: 6.8, agility: 0.78, grip: 0.92, mass: 2.0, offroad: 0.05, roll: 1.4, spring: 92, damp: 8.5 }),
  },
  {
    id: "truck-flat",
    label: "Flatbed Truck",
    perf: perf({ speed: 0.73, accel: 0.7, brake: 0.66, steer: 6.6, agility: 0.76, grip: 0.9, mass: 2.05, offroad: 0.05, roll: 1.45, spring: 90, damp: 8.5 }),
  },
  {
    id: "tractor",
    label: "Tractor",
    perf: perf({ speed: 0.5, accel: 0.85, brake: 0.6, steer: 6, agility: 0.7, grip: 1.1, mass: 2.2, offroad: 1.0, roll: 1.35, spring: 85, damp: 8 }),
  },
  {
    id: "tractor-shovel",
    label: "Digger",
    perf: perf({ speed: 0.48, accel: 0.8, brake: 0.6, steer: 6, agility: 0.68, grip: 1.08, mass: 2.3, offroad: 1.0, roll: 1.4, spring: 85, damp: 8 }),
  },
  {
    id: "tractor-police",
    label: "Patrol Tractor",
    perf: perf({ speed: 0.55, accel: 0.9, brake: 0.62, steer: 6.5, agility: 0.72, grip: 1.1, mass: 2.2, offroad: 1.0, roll: 1.35, spring: 88, damp: 8.2 }),
  },
  {
    id: "sedan",
    label: "Sedan",
    perf: perf({ speed: 1.05, accel: 1.1, brake: 1.05, steer: 10.5, agility: 1.02, grip: 1.05, mass: 1.0, offroad: -0.3, roll: 0.95, spring: 130, damp: 11 }),
  },
  {
    id: "sedan-sports",
    label: "Sport Sedan",
    perf: perf({ speed: 1.14, accel: 1.3, brake: 1.2, steer: 12, agility: 1.1, grip: 1.18, mass: 0.95, offroad: -0.55, roll: 0.75, spring: 160, damp: 12.5 }),
  },
  {
    id: "hatchback-sports",
    label: "Sport Hatch",
    perf: perf({ speed: 1.1, accel: 1.28, brake: 1.18, steer: 12.5, agility: 1.12, grip: 1.15, mass: 0.85, offroad: -0.5, roll: 0.7, spring: 165, damp: 12.5 }),
  },
  {
    id: "race",
    label: "Race Car",
    perf: perf({ speed: 1.22, accel: 1.45, brake: 1.3, steer: 13, agility: 1.15, grip: 1.25, mass: 0.9, offroad: -0.8, roll: 0.6, spring: 170, damp: 13 }),
  },
  {
    id: "race-future",
    label: "Future Racer",
    perf: perf({ speed: 1.28, accel: 1.5, brake: 1.32, steer: 13.5, agility: 1.18, grip: 1.3, mass: 0.92, offroad: -0.9, roll: 0.55, spring: 175, damp: 13.5 }),
  },
  {
    id: "kart-oobi",
    label: "Kart Oobi",
    perf: perf({ speed: 1.05, accel: 1.5, brake: 1.05, steer: 14, agility: 1.2, grip: 0.88, mass: 0.55, offroad: -0.3, roll: 0.5, spring: 150, damp: 10 }),
  },
  {
    id: "kart-oodi",
    label: "Kart Oodi",
    perf: perf({ speed: 1.02, accel: 1.46, brake: 1.05, steer: 14, agility: 1.22, grip: 0.84, mass: 0.55, offroad: -0.3, roll: 0.5, spring: 150, damp: 10 }),
  },
  {
    id: "kart-ooli",
    label: "Kart Ooli",
    perf: perf({ speed: 1.08, accel: 1.44, brake: 1.0, steer: 13.5, agility: 1.18, grip: 0.92, mass: 0.55, offroad: -0.3, roll: 0.5, spring: 150, damp: 10 }),
  },
  {
    id: "kart-oopi",
    label: "Kart Oopi",
    perf: perf({ speed: 1.0, accel: 1.55, brake: 1.1, steer: 14.5, agility: 1.22, grip: 0.86, mass: 0.52, offroad: -0.3, roll: 0.5, spring: 150, damp: 10 }),
  },
  {
    id: "kart-oozi",
    label: "Kart Oozi",
    perf: perf({ speed: 1.12, accel: 1.4, brake: 0.95, steer: 13, agility: 1.16, grip: 0.9, mass: 0.58, offroad: -0.3, roll: 0.5, spring: 150, damp: 10 }),
  },
];
