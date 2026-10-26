import * as THREE from "three";
import { CANONICAL_WHEELS, MAX_SCALE, MIN_SCALE, TARGET_LEN } from "./car-constants";
import { bake, collectMeshes } from "./car-meshes";
import type { CarPart, CarSpec, CarWheel, LoadedCar, RawWheel } from "./car-types";

export function normalise(spec: CarSpec, scene: THREE.Group): LoadedCar | null {
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
