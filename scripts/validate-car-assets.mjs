/**
 * Validation pass for public/assets/jeep/cars/*.glb: check the structure
 * src/jeep/cars.ts relies on — per vehicle:
 *   - the four canonical wheel nodes exist (wheel-front-left/right,
 *     wheel-back-left/right)
 *   - the shared texture is referenced by the expected relative URI
 *   - print footprint, computed scale and suspension wheel radius (same
 *     maths as the loader, for eyeballing)
 * plus confirm the shared texture file is actually present.
 *
 * Usage: node scripts/validate-car-assets.mjs
 */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "public/assets/jeep/cars");

const CANONICAL = ["wheel-front-left", "wheel-front-right", "wheel-back-left", "wheel-back-right"];
const TARGET_LEN = 3.55; // jeep tub length — keep in sync with src/jeep/cars.ts
const MIN_SCALE = 0.85;
const MAX_SCALE = 2.5;

function readJson(file) {
  const data = fs.readFileSync(file);
  if (data.readUInt32LE(0) !== 0x46546c67) throw new Error("not a GLB");
  const jsonLen = data.readUInt32LE(12);
  return JSON.parse(data.slice(20, 20 + jsonLen).toString("utf8"));
}

function bounds(js) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const seen = new Set();
  for (const node of js.nodes ?? []) {
    if (node.mesh === undefined) continue;
    for (const prim of js.meshes[node.mesh].primitives ?? []) {
      const posIdx = prim.attributes?.POSITION;
      if (posIdx === undefined) continue;
      seen.add(posIdx);
    }
  }
  for (const idx of seen) {
    const acc = js.accessors[idx];
    if (!acc.min || !acc.max) continue;
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], acc.min[k]);
      max[k] = Math.max(max[k], acc.max[k]);
    }
  }
  return { min, max };
}

const texPath = path.join(dir, "Textures/colormap.png");
if (!fs.existsSync(texPath)) {
  console.error("✗ Textures/colormap.png missing — GLBs will load untextured");
  process.exitCode = 1;
} else {
  console.log("✓ Textures/colormap.png present");
}

const files = fs.readdirSync(dir).filter((f) => f.endsWith(".glb") && !f.startsWith("debris-")).sort();
let failures = 0;
for (const f of files) {
  try {
    const js = readJson(path.join(dir, f));
    const names = new Set((js.nodes ?? []).map((n) => n.name));
    const missing = CANONICAL.filter((n) => !names.has(n));
    const uris = (js.images ?? []).map((i) => i.uri).filter(Boolean);
    const badUri = uris.length > 0 && !uris.every((u) => u === "Textures/colormap.png");
    const { min, max } = bounds(js);
    const len = max[2] - min[2];
    const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, TARGET_LEN / len));
    const ok = missing.length === 0 && !badUri;
    if (!ok) failures++;
    console.log(
      `${ok ? "✓" : "✗"} ${f.padEnd(20)} len ${(len).toFixed(2)} → scale ${s.toFixed(2)}, ~wheelR ${(
        (max[1] / 2) * s
      ).toFixed(2)}${missing.length ? `, MISSING WHEELS: ${missing.join(",")}` : ""}${badUri ? `, URIs: ${uris.join(",")}` : ""}`,
    );
  } catch (err) {
    failures++;
    console.error(`✗ ${f}: ${err.message}`);
  }
}

const debris = fs.readdirSync(dir).filter((f) => f.startsWith("debris-") && f.endsWith(".glb"));
console.log(`\n${files.length - failures}/${files.length} vehicles OK · ${debris.length} debris parts present`);
if (failures > 0) process.exitCode = 1;
