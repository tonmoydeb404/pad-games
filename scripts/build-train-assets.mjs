/**
 * Build the Jungle Jeep railway pack: Kenney "Train Pack" (April 2019, CC0)
 * → self-contained .glb files in public/assets/jeep/train/.
 *
 * Sources are the extracted zip; the script looks for the OBJ folder under
 * --src (default: ./train-pack-sources), expecting:
 *
 *   <src>/Train Pack - April 2019/OBJ/*.obj
 *
 * Usage:  node scripts/build-train-assets.mjs [--src <dir>]
 *
 * The pack's OBJs ship almost-black materials, so the converter re-colours
 * every part by object name into a "Jungle Express" livery. Geometry is
 * baked into engine space: kit models are authored along +X with the loco's
 * front at -X, and the jeep engine drives toward -Z — so everything is
 * rotated -90° about Y (front → -Z), grounded (min y → 0) and centred on
 * its footprint. GLBs are validated by re-parsing with three's GLTFLoader.
 */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const OUT = path.join(root, "public/assets/jeep/train");

const argSrc = process.argv.includes("--src")
  ? path.resolve(process.argv[process.argv.indexOf("--src") + 1])
  : path.join(root, "train-pack-sources");
const SRC = path.join(argSrc, "Train Pack - April 2019", "OBJ");

/** Vehicles + track shipped to the game (the rest of the pack stays unused). */
const MODELS = [
  { obj: "Locomotive_Front", out: "locomotive" },
  { obj: "Locomotive_CoalTender", out: "tender" },
  { obj: "Locomotive_PassengerWagon", out: "passenger-wagon" },
  { obj: "Locomotive_Wagon", out: "goods-wagon" },
  { obj: "CargoTrain_WagonOpenContainer", out: "flatcar" },
  { obj: "RailwayTrack_Straight", out: "track" },
];

/**
 * Jungle Express livery — colour by object name. The kit names parts
 * `<Thing>_Cube` / `Wheels…_Cylinder`, so coarse suffix rules cover all
 * chosen models.
 */
function paint(objName) {
  const std = (color, roughness, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  if (/wheel/i.test(objName)) return std(0x1f1f23, 0.5, 0.45); // dark steel
  if (/locomotive|coaltender/i.test(objName)) return std(0x2f6b3f, 0.45, 0.25); // boiler green
  if (/passenger/i.test(objName)) return std(0x8a3b32, 0.6); // maroon coaches
  if (/^wagon_empty|locomotive_wagon/i.test(objName)) return std(0x7d5a33, 0.7); // weathered van
  if (/opencontainer|container/i.test(objName)) return std(0x6b7042, 0.75); // olive flatcar load
  if (/railwaytrack/i.test(objName)) return std(0x6a6259, 0.95); // ballast + rails
  return std(0x5a5248, 0.8); // fallback
}

fs.mkdirSync(OUT, { recursive: true });

/** Node shims GLTFLoader/GLTFExporter need (self + ProgressEvent + FileReader). */
if (typeof globalThis.self === "undefined") globalThis.self = globalThis;
globalThis.ProgressEvent = class {
  constructor(type, init) {
    this.type = type;
    this.lengthComputable = init?.lengthComputable ?? false;
    this.loaded = init?.loaded ?? 0;
    this.total = init?.total ?? 0;
  }
};
if (typeof globalThis.FileReader === "undefined") {
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob
        .arrayBuffer()
        .then((ab) => {
          this.result = ab;
          this.onloadend?.();
        })
        .catch((err) => this.onerror?.(err));
    }
  };
}

let ok = 0;
for (const { obj, out } of MODELS) {
  const file = path.join(SRC, `${obj}.obj`);
  if (!fs.existsSync(file)) {
    console.error(`!! missing ${file} — extract the Train Pack zip first`);
    process.exitCode = 1;
    continue;
  }
  const grp = new OBJLoader().parse(fs.readFileSync(file, "utf8"));

  // bake: rotate the kit's +X long axis so the loco front (-X) faces -Z,
  // centre on the footprint, ground at y = 0
  const bake = new THREE.Matrix4().makeRotationY(-Math.PI / 2);
  grp.updateMatrixWorld(true);
  const meshes = [];
  grp.traverse((o) => {
    if (o.isMesh) meshes.push(o);
  });
  const union = new THREE.Box3();
  for (const m of meshes) {
    const g = m.geometry.clone().applyMatrix4(m.matrixWorld).applyMatrix4(bake);
    m.geometry.dispose();
    m.geometry = g;
    g.computeBoundingBox();
    union.union(g.boundingBox);
  }
  const cx = (union.min.x + union.max.x) / 2;
  const cz = (union.min.z + union.max.z) / 2;
  const outGroup = new THREE.Group();
  for (const m of meshes) {
    m.geometry.translate(-cx, -union.min.y, -cz);
    m.geometry.computeVertexNormals();
    m.material = paint(m.name);
    m.castShadow = true;
    m.receiveShadow = true;
    outGroup.add(m);
  }

  const dst = path.join(OUT, `${out}.glb`);
  const buf = await new Promise((resolve, reject) => {
    new GLTFExporter().parse(outGroup, resolve, reject, { binary: true });
  });
  fs.writeFileSync(dst, Buffer.from(buf));

  // validate: re-parse the written GLB and report natural dimensions
  const re = await new Promise((resolve, reject) => {
    new GLTFLoader().parse(fs.readFileSync(dst).buffer, "", resolve, reject);
  });
  const box = new THREE.Box3().setFromObject(re.scene);
  const size = new THREE.Vector3();
  box.getSize(size);
  const kb = (fs.statSync(dst).size / 1024).toFixed(0);
  console.log(
    `✓ ${out}.glb (${kb} KB) — ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} (w×h×l), ${meshes.length} part(s)`,
  );
  ok++;
}
console.log(`\n${ok}/${MODELS.length} GLBs written to public/assets/jeep/train`);
if (ok !== MODELS.length) process.exitCode = 1;
