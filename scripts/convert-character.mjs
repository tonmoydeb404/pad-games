/**
 * One-shot converter: Kenney "Animated Characters — Protagonists" FBX → GLB.
 *
 * Bakes characterMedium.fbx plus the idle/run/jump animation takes into a
 * single self-contained GLB (no textures — the skin PNGs are applied at
 * runtime so all four skins share the one file).
 *
 * Usage: node scripts/convert-character.mjs <staging-dir> <out-dir>
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const STAGING = process.argv[2];
const OUT = process.argv[3];
if (!STAGING || !OUT) {
  console.error("usage: node scripts/convert-character.mjs <staging-dir> <out-dir>");
  process.exit(1);
}

const THREE = await import("three");
const { FBXLoader } = await import("three/examples/jsm/loaders/FBXLoader.js");
const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");

// GLTFExporter's GLB path uses Blob + FileReader; Node has Blob but no
// FileReader — shim the one method the exporter calls.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((ab) => {
      this.result = ab;
      this.onloadend?.();
    });
  }
};

/** Parse an FBX buffer in Node (FBXLoader.parse wants an ArrayBuffer). */
function loadFbx(path) {
  const loader = new FBXLoader();
  const buf = readFileSync(path);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return loader.parse(ab, "");
}

const character = loadFbx(join(STAGING, "Model/characterMedium.fbx"));

// strip FBX placeholder materials/textures — the skin PNG is applied at runtime
character.traverse((o) => {
  if (o.isMesh || o.isSkinnedMesh) {
    o.material = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.8 });
    o.castShadow = true;
    o.frustumCulled = false;
  }
});

// --- facing diagnostic (world space): toes + nose protrude forward ----------
const box = new THREE.Box3().setFromObject(character);
const size = box.getSize(new THREE.Vector3());
{
  character.updateWorldMatrix(true, true);
  const v = new THREE.Vector3();
  const band = (lo, hi) => {
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9, n = 0;
    character.traverse((o) => {
      if (!o.isMesh && !o.isSkinnedMesh) return;
      const p = o.geometry.getAttribute("position");
      for (let i = 0; i < p.count; i++) {
        v.set(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(o.matrixWorld);
        const frac = (v.y - box.min.y) / size.y;
        if (frac < lo || frac > hi) continue;
        minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
        minZ = Math.min(minZ, v.z); maxZ = Math.max(maxZ, v.z);
        n++;
      }
    });
    return { minX, maxX, minZ, maxZ, n };
  };
  for (const [label, b] of [["head", band(0.72, 0.95)], ["feet", band(0, 0.06)]]) {
    const dx = b.maxX + b.minX;
    const dz = b.maxZ + b.minZ;
    const face = Math.abs(dz) >= Math.abs(dx) ? (dz > 0 ? "+Z" : "-Z") : dx > 0 ? "+X" : "-X";
    console.log(`${label}: x ${b.minX.toFixed(2)}..${b.maxX.toFixed(2)}  z ${b.minZ.toFixed(2)}..${b.maxZ.toFixed(2)}  (${b.n} verts) → leans ${face}`);
  }
}

// Normalise: origin at the feet, height 1.72 world units.
console.log("raw size:", size.toArray().map((n) => n.toFixed(1)).join(" × "));
const s = 1.72 / size.y;
const inner = new THREE.Group();
inner.add(character);
inner.scale.setScalar(s);
const root = new THREE.Group();
root.name = "JungleCharacter";
root.add(inner);
root.position.y = 0;

// animation clips from the companion FBXs (same rig → direct playback).
// Each file carries several takes (Kenney exports a stub take too) — keep the
// longest per file, and drop scale tracks (FBX unit-scale pollution).
const clips = [];
for (const name of ["idle", "run", "jump"]) {
  const anim = loadFbx(join(STAGING, `Animations/${name}.fbx`));
  let best = null;
  for (const clip of anim.animations) {
    if (!best || clip.duration > best.duration) best = clip;
  }
  best.name = name;
  best.tracks = best.tracks.filter((t) => !/\.scale$/.test(t.name));
  clips.push(best);
  console.log(`clip ${name}: ${best.duration.toFixed(2)}s, ${best.tracks.length} tracks`);
}
if (clips.length !== 3) throw new Error("expected 3 animation clips");

mkdirSync(OUT, { recursive: true });
const exporter = new GLTFExporter();
const glb = await new Promise((resolve, reject) => {
  exporter.parse(root, resolve, reject, { binary: true, animations: clips });
});
writeFileSync(join(OUT, "character.glb"), Buffer.from(glb));
console.log(`wrote ${join(OUT, "character.glb")} (${(glb.byteLength / 1024).toFixed(0)} KB)`);

const bones = [];
root.traverse((o) => o.isBone && bones.push(o.name));
console.log(`bones (${bones.length}):`, bones.slice(0, 12).join(" "), "…");
