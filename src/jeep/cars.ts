/**
 * Kenney "Car Kit" (CC0 1.0) — vehicle catalog + lazy GLB loader for
 * Jungle Jeep. Assets live in `/assets/jeep/cars` (see
 * scripts/build-car-assets.mjs); the shared texture is referenced by the
 * relative URI "Textures/colormap.png", which GLTFLoader resolves against
 * each GLB's URL.
 *
 * Every vehicle is normalised into the jeep's rig space so the engine can
 * swap bodies without touching its driving feel:
 *   - Kenney models face +Z with left = +X; the jeep rig drives toward -Z
 *     with left = -X. Wheel positions are mirrored (x, z) → (-x, -z) and the
 *     body is mounted under a 180°-rotated group (no geometry baking, so no
 *     triangle-winding pitfalls).
 *   - The whole vehicle is scaled to ~3.0 units long (jeep tub: 3.55) and the
 *     per-wheel radius is measured from the model, giving each car its own
 *     `wheelR` for the suspension solver.
 *   - Body meshes are centred on the vehicle footprint and offset so the
 *     model's ground plane lands exactly on the wheel-contact plane for the
 *     rig's axle height (engine: axle = -(0.92 - wheelR) below body origin).
 *
 * Wheels are the four canonical nodes (wheel-front-left/right, wheel-back-
 * left/right) with geometry re-centred on the wheel's spin axis, so the
 * engine can drop them straight into its existing steer→spin groups. Any
 * other wheel-* node (the SUV's spare) rides statically with the body.
 *
 * All failures resolve to `null` / `[]` — the engine falls back to the
 * procedural jeep, never crashes.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const BASE = "/assets/jeep/cars";

/** Target vehicle length after scaling — matched to the jeep tub (3.55) so
 *  every ride reads the same size on the trail. */
const TARGET_LEN = 3.55;
const MIN_SCALE = 0.85;
/** Karts need ~2.5× to reach the target; tractors ~1.8. Generous cap so all
 *  25 vehicles hit parity (uniform scale keeps proportions). */
const MAX_SCALE = 2.5;

/** Rig-space axle offset formula: axle sits this far below the body origin. */
export const WHEEL_CONTACT = 0.92;

export interface CarSpec {
  id: string;
  label: string;
  /** Driving character — see CarPerf. Every field is a multiplier vs the
   *  jeep baseline unless noted. */
  perf: CarPerf;
}

/**
 * Per-vehicle driving stats (GTA-style). The jeep's profile is the physics
 * baseline — 1.0 / stock values reproduce its current handling exactly.
 */
export interface CarPerf {
  /** Top speed × MAX_SPEED (jeep = 1.0 = 46.8 u/s). */
  speed: number;
  /** Engine force — acceleration and reverse-drive strength. */
  accel: number;
  /** Braking force (higher = shorter stops). */
  brake: number;
  /** Steering responsiveness — damp rate toward steer input (jeep 10). */
  steer: number;
  /** Cornering agility — yaw-rate multiplier at speed. */
  agility: number;
  /** Lateral grip — higher = tighter line, less slip. */
  grip: number;
  /** Relative mass — plows through obstacles when heavy, bounces when light;
   *  also scales animal-strike damage taken. */
  mass: number;
  /** Off-road aptitude: 0 = jeep baseline, +1 tractor (shrugs off mud), negative
   *  = street tyers (sports cars suffer off the trail). */
  offroad: number;
  /** Body-roll tendency in corners (tall vehicles lean more). */
  roll: number;
  /** Suspension spring rate (jeep 130) — soft = wallowy, stiff = sporty. */
  spring: number;
  /** Suspension damping (jeep 11). */
  damp: number;
}

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

export interface CarPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

export interface CarWheel {
  /** Re-centred meshes, ready to drop into the rig's spin group. */
  parts: CarPart[];
  /** Rig-space x/z (mirrored + scaled). y is the rig's axle line. */
  x: number;
  z: number;
  /** Scaled wheel radius (model radius × scale). */
  radius: number;
}

export interface LoadedCar {
  spec: CarSpec;
  /** Body meshes, positioned for identity transform under the rig. */
  parts: CarPart[];
  wheels: CarWheel[]; // order: FL, FR, RL, RR (engine wheel order)
  /** Scaled footprint, rig space. */
  length: number;
  track: number;
  /** Suspension solver radius (avg of front/rear, scaled). */
  wheelR: number;
  /** Height of the body's midline above its ground plane (scaled). */
  bodyH: number;
}

interface RawWheel {
  parts: CarPart[];
  x: number;
  z: number;
  radius: number;
}

const CANONICAL_WHEELS = ["wheel-front-left", "wheel-front-right", "wheel-back-left", "wheel-back-right"] as const;

function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry) out.push(m);
  });
  return out;
}

function bake(geometry: THREE.BufferGeometry, mesh: THREE.Mesh): THREE.BufferGeometry {
  mesh.updateWorldMatrix(true, false);
  const g = geometry.clone();
  g.applyMatrix4(mesh.matrixWorld);
  if (!g.getAttribute("normal")) g.computeVertexNormals();
  return g;
}

/**
 * Load and normalise one vehicle. Resolves `null` when the model is missing
 * or unreadable. Results are cached — repeated selections are instant.
 */
export async function loadCar(id: string): Promise<LoadedCar | null> {
  const spec = CAR_CATALOG.find((c) => c.id === id);
  if (!spec) return null;
  if (!loadCar.cache) loadCar.cache = new Map<string, LoadedCar | null>();
  const hit = loadCar.cache.get(id);
  if (hit !== undefined) return hit;

  const car = await new Promise<LoadedCar | null>((resolve) => {
    new GLTFLoader().load(
      `${BASE}/${id}.glb`,
      (gltf) => {
        try {
          resolve(normalise(spec, gltf.scene));
        } catch (err) {
          console.warn(`[jeep/cars] failed to normalise ${id}:`, err);
          resolve(null);
        }
      },
      undefined,
      () => resolve(null),
    );
  });
  loadCar.cache.set(id, car);
  return car;
}
loadCar.cache = null as Map<string, LoadedCar | null> | null;

function normalise(spec: CarSpec, scene: THREE.Group): LoadedCar | null {
  // Split top-level children: canonical wheels vs everything else (body,
  // spoilers, spare wheels, kart parts…).
  const bodyMeshes: THREE.Mesh[] = [];
  const wheelMeshes = new Map<string, THREE.Mesh[]>();
  for (const child of scene.children) {
    const name = child.name;
    if ((CANONICAL_WHEELS as readonly string[]).includes(name)) {
      const list = wheelMeshes.get(name) ?? [];
      list.push(...collectMeshes(child));
      wheelMeshes.set(name, list);
    } else {
      bodyMeshes.push(...collectMeshes(child));
    }
  }
  if (bodyMeshes.length === 0) return null;

  // Measure the raw vehicle: body bbox + wheel centres (world space).
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  for (const m of bodyMeshes) {
    m.updateWorldMatrix(true, false);
    const g = m.geometry;
    g.computeBoundingBox();
    tmp.copy(g.boundingBox!).applyMatrix4(m.matrixWorld);
    box.union(tmp);
  }
  const raw = new Map<string, RawWheel>();
  for (const [name, meshes] of wheelMeshes) {
    let cx = 0;
    let cz = 0;
    let r = 0;
    const parts: CarPart[] = [];
    for (const m of meshes) {
      // Bake into world space FIRST — the wheel's position lives in the node
      // transform, so the raw (local) bbox is centred near the origin and
      // would place every wheel at the middle of the vehicle.
      const g = bake(m.geometry, m);
      g.computeBoundingBox();
      const b = g.boundingBox!;
      r = Math.max(r, (b.max.y - b.min.y) / 2, (b.max.z - b.min.z) / 2);
      cx += (b.min.x + b.max.x) / 2;
      cz += (b.min.z + b.max.z) / 2;
      parts.push({ geometry: g, material: m.material as THREE.Material });
    }
    const n = Math.max(1, meshes.length);
    raw.set(name, { parts, x: cx / n, z: cz / n, radius: r });
  }
  if (raw.size < 4) return null; // broken/partial model — fall back to jeep

  const rawLen = Math.max(1e-3, box.max.z - box.min.z);
  const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, TARGET_LEN / rawLen));

  // Centre the footprint (body ∪ wheels) on the origin before mirroring.
  let cx = 0;
  let cz = 0;
  {
    let n = 1;
    cx = (box.min.x + box.max.x) / 2;
    cz = (box.min.z + box.max.z) / 2;
    for (const w of raw.values()) {
      cx += w.x;
      cz += w.z;
      n++;
    }
    cx /= n;
    cz /= n;
  }

  // Mirror into rig space: rig forward = -Z, rig left = -X.
  const flip = (x: number, z: number): [number, number] => [-(x - cx) * s, -(z - cz) * s];

  /** centre → scale → rotate 180° about Y (a two-axis mirror is a pure
   *  rotation: det = +1 — no winding or normal flips to repair). */
  const toRig = (g: THREE.BufferGeometry): void => {
    g.translate(-cx, 0, -cz);
    g.scale(s, s, s);
    g.scale(-1, 1, -1);
  };

  const parts: CarPart[] = bodyMeshes.map((m) => {
    const g = bake(m.geometry, m);
    toRig(g);
    return { geometry: g, material: m.material as THREE.Material };
  });

  const wheels: CarWheel[] = [];
  let fr = 0;
  let bk = 0;
  for (const name of CANONICAL_WHEELS) {
    const w = raw.get(name);
    if (!w) return null;
    const [x, z] = flip(w.x, w.z);
    const wheelParts: CarPart[] = w.parts.map((p) => {
      const g = p.geometry;
      toRig(g);
      // Re-centre on the spin axis so spin.rotation.x rolls it cleanly.
      g.computeBoundingBox();
      const b = g.boundingBox!;
      g.translate(-(b.min.x + b.max.x) / 2, -(b.min.y + b.max.y) / 2, -(b.min.z + b.max.z) / 2);
      return { geometry: g, material: p.material };
    });
    wheels.push({ parts: wheelParts, x, z, radius: w.radius * s });
    if (name.includes("front")) fr = Math.max(fr, w.radius * s);
    else bk = Math.max(bk, w.radius * s);
  }
  wheels.sort((a, b) => a.z - b.z || a.x - b.x); // FL, FR, RL, RR (rig front = -z)

  // Body height above the model ground plane (scaled) for light placement.
  const bodyH = (box.max.y) * s;

  return {
    spec,
    parts,
    wheels,
    length: (box.max.z - box.min.z) * s,
    track: Math.abs(wheels[1].x - wheels[0].x),
    wheelR: (fr + bk) / 2,
    bodyH,
  };
}

/**
 * Load the kit's 15 debris parts for crash effects. Each model is normalised
 * to ~0.3 units and centred. Resolves `[]` when unavailable; loaded once.
 */
let debrisCache: CarPart[] | null = null;
export async function loadDebrisParts(): Promise<CarPart[]> {
  if (debrisCache) return debrisCache;
  const NAMES = [
    "debris-bolt",
    "debris-bumper",
    "debris-door-window",
    "debris-door",
    "debris-drivetrain-axle",
    "debris-drivetrain",
    "debris-nut",
    "debris-plate-a",
    "debris-plate-b",
    "debris-plate-small-a",
    "debris-plate-small-b",
    "debris-spoiler-a",
    "debris-spoiler-b",
    "debris-tire",
  ];
  const loader = new GLTFLoader();
  const all = await Promise.all(
    NAMES.map(
      (n) =>
        new Promise<CarPart[]>((resolve) => {
          loader.load(
            `${BASE}/${n}.glb`,
            (gltf) => {
              try {
                const meshes = collectMeshes(gltf.scene);
                const parts: CarPart[] = [];
                const box = new THREE.Box3();
                for (const m of meshes) {
                  m.geometry.computeBoundingBox();
                  box.union(m.geometry.boundingBox!);
                  parts.push({ geometry: bake(m.geometry, m), material: m.material as THREE.Material });
                }
                const size = new THREE.Vector3();
                box.getSize(size);
                const k = 0.3 / Math.max(size.x, size.y, size.z, 1e-3);
                const c = new THREE.Vector3();
                box.getCenter(c);
                for (const p of parts) {
                  p.geometry.translate(-c.x, -c.y, -c.z);
                  p.geometry.scale(k, k, k);
                }
                resolve(parts);
              } catch {
                resolve([]);
              }
            },
            undefined,
            () => resolve([]),
          );
        }),
    ),
  );
  debrisCache = all.flat();
  return debrisCache;
}
