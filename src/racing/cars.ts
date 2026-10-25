/**
 * Kenney "Racing Kit" (CC0 1.0) — the four race cars, as a lazy Collada
 * loader normalised into the engine's rig space (same conventions as the
 * jeep's car kit loader):
 *
 *   - Unlike the Car Kit, the Racing Kit cars face -Z (front wheels at the
 *     lower z), matching the rig's driving direction, so bodies and wheel
 *     positions are used as-is.
 *   - The whole vehicle scales to ~3.9 m long so it reads as a real racer
 *     against the 8.5 m roads (kit native: 1.35 u).
 *   - Wheels are the four canonical nodes (wheelFrontLeft/Right,
 *     wheelBackLeft/Right) with geometry re-centred on the wheel's spin
 *     axis, so the engine drops them straight into steer→spin groups.
 *     Per-wheel radius is measured from the model.
 *
 * All failures resolve to null — the engine falls back to a placeholder
 * body, never crashes.
 */
import * as THREE from "three";
import { ColladaLoader } from "three/examples/jsm/loaders/ColladaLoader.js";

/** Target vehicle length after scaling (world metres). */
const TARGET_LEN = 3.9;

export interface CarPerf {
  /** Top speed multiplier vs the engine's MAX_SPEED. */
  speed: number;
  /** Engine acceleration, u/s². */
  accel: number;
  /** Braking deceleration, u/s². */
  brake: number;
  /** Steering responsiveness (damp rate toward steer input). */
  steer: number;
  /** Cornering agility — yaw-rate multiplier at speed. */
  agility: number;
  /** Lateral grip multiplier. */
  grip: number;
  /** Mass, kg. */
  mass: number;
  /** Suspension spring ω² and damping ζ numerator. */
  spring: number;
  damp: number;
}

export interface CarSpec {
  id: string;
  label: string;
  blurb: string;
  /** UI accent (tailwind text class). */
  accent: string;
  perf: CarPerf;
}

/** The four kit cars, each with a driving personality. */
export const CAR_CATALOG: CarSpec[] = [
  {
    id: "race-car-red",
    label: "Scorch RT",
    blurb: "Grip runner — quickest to a clean line.",
    accent: "text-red-300",
    perf: { speed: 0.97, accel: 30, brake: 32, steer: 10, agility: 1.22, grip: 1.3, mass: 900, spring: 175, damp: 13 },
  },
  {
    id: "race-car-green",
    label: "Verve GT",
    blurb: "Corner devourer — holds drifts forever.",
    accent: "text-lime-300",
    perf: { speed: 0.95, accel: 28, brake: 34, steer: 11, agility: 1.3, grip: 1.42, mass: 880, spring: 165, damp: 12 },
  },
  {
    id: "race-car-orange",
    label: "Blaze Turbo",
    blurb: "Straight-line monster — mind the corners.",
    accent: "text-orange-300",
    perf: { speed: 1.06, accel: 33, brake: 28, steer: 9, agility: 1.05, grip: 1.12, mass: 960, spring: 185, damp: 14 },
  },
  {
    id: "race-car-white",
    label: "Pearl One",
    blurb: "Balanced all-rounder. The smart pick.",
    accent: "text-sky-200",
    perf: { speed: 1.0, accel: 30, brake: 30, steer: 10, agility: 1.15, grip: 1.25, mass: 920, spring: 172, damp: 13 },
  },
];

export const carById = (id: string): CarSpec => CAR_CATALOG.find((c) => c.id === id) ?? CAR_CATALOG[0];

/** Physics dimensions shared shape-wise by the kit cars (world metres). */
export interface CarDims {
  length: number;
  width: number;
  /** Wheel radius, metres (all four match on kit cars). */
  wheelR: number;
  /** Wheel centre sits this far below the body origin at rest. */
  axleOff: number;
  /** FL FR RL RR, body frame (x right, z back). */
  wheels: { x: number; z: number }[];
  /** Centre of mass height (negative = below origin). */
  comY: number;
}

export interface CarRig {
  spec: CarSpec;
  dims: CarDims;
  /** Positioned at the physics body origin; drives toward -Z. */
  root: THREE.Group;
  wheels: {
    steer: THREE.Group;
    spin: THREE.Group;
    front: boolean;
    radius: number;
  }[];
}

const loader = new ColladaLoader();
const cache = new Map<string, Promise<CarRig | null>>();

const toLambert = (src: THREE.Material): THREE.MeshLambertMaterial => {
  const phong = src as THREE.MeshPhongMaterial;
  return new THREE.MeshLambertMaterial({
    color: phong.color?.clone() ?? new THREE.Color(0xcccccc),
    vertexColors: false,
  });
};

/** Keep every material of a multi-primitive mesh (body paint, trim, glass). */
const toLamberts = (src: THREE.Material | THREE.Material[]): THREE.MeshLambertMaterial | THREE.MeshLambertMaterial[] =>
  Array.isArray(src) ? src.map(toLambert) : toLambert(src);

/** Load + normalise one kit car. Cached; resolves null on any failure. */
export function loadCar(id: string): Promise<CarRig | null> {
  let p = cache.get(id);
  if (!p) {
    p = (async () => {
      try {
        const collada = await loader.loadAsync(`/assets/racing/${id}.dae`);
        if (!collada) return null;
        const scene = collada.scene;
        scene.updateMatrixWorld(true);

        interface BodyPart {
          geom: THREE.BufferGeometry;
          mat: THREE.MeshLambertMaterial | THREE.MeshLambertMaterial[];
        }
        const bodyParts: BodyPart[] = [];
        const wheels: {
          name: string;
          geom: THREE.BufferGeometry;
          center: THREE.Vector3;
          mat: THREE.MeshLambertMaterial | THREE.MeshLambertMaterial[];
        }[] = [];

        scene.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh || !mesh.geometry) return;
          const name = mesh.name.toLowerCase();
          const geom = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
          const mat = mesh.material as THREE.Material | THREE.Material[];
          if (name.startsWith("wheel")) {
            geom.computeBoundingBox();
            const center = geom.boundingBox!.getCenter(new THREE.Vector3());
            geom.translate(-center.x, -center.y, -center.z); // spin about the axle
            wheels.push({ name, geom, center, mat: toLamberts(mat) });
          } else {
            bodyParts.push({ geom, mat: toLamberts(mat) });
          }
        });
        if (bodyParts.length === 0 || wheels.length < 4) return null;

        // overall bbox across body + original wheel placements
        const box = new THREE.Box3();
        for (const part of bodyParts) {
          part.geom.computeBoundingBox();
          box.union(part.geom.boundingBox!);
        }
        const tmp = new THREE.Box3();
        for (const w of wheels) {
          tmp.copy(w.geom.boundingBox!).translate(w.center);
          box.union(tmp);
        }
        const size = box.getSize(new THREE.Vector3());
        const scale = TARGET_LEN / Math.max(size.z, size.x);

        // origin at the bbox centre (all axes); ground ends up at -c.y
        const c = box.getCenter(new THREE.Vector3());
        for (const part of bodyParts) part.geom.translate(-c.x, -c.y, -c.z);
        for (const w of wheels) {
          w.center.sub(c);
        }

        const root = new THREE.Group();
        // the kit's race cars already face -Z (front wheels at lower z), the
        // rig's driving direction — no flip, no mirroring
        const flip = new THREE.Group();
        root.add(flip);
        for (const part of bodyParts) flip.add(new THREE.Mesh(part.geom, part.mat));

        const ORDER: [string, boolean][] = [
          ["wheelfrontleft", true],
          ["wheelfrontright", true],
          ["wheelbackleft", false],
          ["wheelbackright", false],
        ];
        const rigWheels: CarRig["wheels"] = [];
        const dims: CarDims = {
          length: size.z * scale,
          width: size.x * scale,
          wheelR: 0.2,
          axleOff: 0,
          wheels: [],
          comY: 0,
        };
        let rSum = 0;
        for (const [name, front] of ORDER) {
          const w = wheels.find((g) => g.name === name);
          if (!w) return null;
          w.geom.computeBoundingBox();
          const r = ((w.geom.boundingBox!.max.y - w.geom.boundingBox!.min.y) / 2) * scale;
          rSum += r;
          const steer = new THREE.Group();
          steer.position.set(w.center.x, w.center.y, w.center.z);
          const spin = new THREE.Group();
          spin.add(new THREE.Mesh(w.geom, w.mat));
          steer.add(spin);
          root.add(steer);
          rigWheels.push({ steer, spin, front, radius: r });
          dims.wheels.push({ x: w.center.x * scale, z: w.center.z * scale });
        }
        if (rigWheels.length !== 4) return null;

        dims.wheelR = rSum / 4;
        // wheel centres rest one radius above the ground: axleOff is how far
        // the body origin (bbox centre) sits above that plane
        dims.axleOff = (c.y - box.min.y) * scale - dims.wheelR;
        dims.comY = -Math.min(0.12, dims.axleOff * 0.4);
        root.scale.setScalar(scale);
        return { spec: carById(id), dims, root, wheels: rigWheels };
      } catch (err) {
        console.warn(`[racing] car ${id} failed to load`, err);
        return null;
      }
    })();
    cache.set(id, p);
  }
  return p;
}
