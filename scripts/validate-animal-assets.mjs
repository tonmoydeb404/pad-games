/**
 * Validation pass for public/assets/jeep/animals/*.glb: parse every file with
 * three's GLTFLoader (all these models are texture-free so no DOM/fetch is
 * needed) and report, per model:
 *   - natural height (skinned, bind pose) in meters
 *   - clip names — these feed src/game/world/animals.ts AnimalDef.clips
 *   - whether a skeleton/skin exists
 *
 * Usage: node scripts/validate-animal-assets.mjs
 */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "public/assets/jeep/animals");

// Minimal shims so GLTFLoader runs under Node (texture-free models only).
if (typeof globalThis.self === "undefined") globalThis.self = globalThis;
globalThis.Blob = class {};

const { GLTFLoader } = await import(`${root}/node_modules/three/examples/jsm/loaders/GLTFLoader.js`).catch(() => import("three/examples/jsm/loaders/GLTFLoader.js"));
const THREE = await import("three");

const files = fs.readdirSync(dir).filter((f) => f.endsWith(".glb")).sort();
if (files.length === 0) {
  console.error("no GLBs found — run build-animal-assets.mjs first");
  process.exit(1);
}

const loader = new GLTFLoader();
const rows = [];

for (const file of files) {
  const buf = fs.readFileSync(path.join(dir, file));
  const info = await new Promise((resolve) => {
    loader.parse(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      "",
      (gltf) => {
        try {
          const clips = gltf.animations.map((c) => c.name || c.uuid);
          let skinned = false;
          const box = new THREE.Box3();
          const tmp = new THREE.Box3();
          let meshes = 0;
          gltf.scene.traverse((o) => {
            const m = /** @type {any} */ (o);
            if (m.isMesh && m.geometry) {
              meshes++;
              if (m.isSkinnedMesh) skinned = true;
              if (m.isSkinnedMesh && m.computeBoundingBox) {
                m.updateMatrixWorld(true);
                m.computeBoundingBox(); // accounts for skinning in modern three
                tmp.copy(m.boundingBox);
              } else {
                m.geometry.computeBoundingBox();
                tmp.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld);
              }
              box.union(tmp);
            }
          });
          const size = new THREE.Vector3();
          box.getSize(size);
          // forward axis guess: longest horizontal extent
          resolve({ clips, skinned, meshes, h: size.y, len: Math.max(size.x, size.z), yMin: box.min.y, err: null });
        } catch (e) {
          resolve({ err: e.message, clips: [], skinned: false, meshes: 0, h: 0, len: 0, yMin: 0 });
        }
      },
      (err) => resolve({ err: err.message || String(err), clips: [], skinned: false, meshes: 0, h: 0, len: 0, yMin: 0 }),
    );
  });
  rows.push({ file, ...info });
}

console.log(
  "model".padEnd(20),
  "sk".padEnd(3),
  "mesh".padEnd(5),
  "height".padEnd(8),
  "length".padEnd(8),
  "yMin".padEnd(8),
  "clips",
);
for (const r of rows) {
  console.log(
    r.file.padEnd(20),
    (r.skinned ? "y" : "n").padEnd(3),
    String(r.meshes).padEnd(5),
    r.h.toFixed(2).padEnd(8),
    r.len.toFixed(2).padEnd(8),
    r.yMin.toFixed(2).padEnd(8),
    r.err ? `ERROR: ${r.err}` : r.clips.join(", "),
  );
}
const bad = rows.filter((r) => r.err || !r.skinned);
console.log(`\n${rows.length} models, ${bad.length} with problems`);
if (bad.length) process.exitCode = 1;
