/**
 * Validation pass for public/assets/arena/**.glb — checks what the renderer
 * and the shared map data rely on:
 *   - every expected model is present and parses as a GLB
 *   - every textured model references the relative "Textures/colormap.png"
 *   - the shared texture file exists in both packs
 *   - the player rigs carry the animation clips the renderer drives
 *     (idle/walk/sprint/jump/fall/die/holding-both-shoot)
 *   - prints each model's natural size so tile scaling stays honest
 *   - total pack size stays under the download budget
 *
 * Usage: node scripts/validate-arena-assets.mjs
 */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const arena = path.join(root, "public/assets/arena");

const DUNGEON = [
  "wall", "wall-half", "wall-narrow", "wall-opening", "gate", "floor", "floor-detail", "stairs", "column",
  "dirt", "barrel", "chest", "table", "chair", "pot", "rocks", "stones", "wood-support", "banner", "trap",
  "coin", "key", "potion", "character-human", "character-orc", "weapon-sword",
];
const BLASTERS = [
  ..."abcdefghijklmnopqr".split("").map((s) => `blaster-${s}`),
  "grenade-a", "grenade-b", "clip-large", "clip-small", "bullet-foam", "bullet-foam-tip",
  "crate-small", "crate-medium", "crate-wide", "target-large", "target-small",
  "target-fragment-large", "target-fragment-small", "smoke",
];
/** Clips the player rig must have (renderer animation state machine). */
const RIG_CLIPS = ["idle", "walk", "sprint", "jump", "fall", "die", "holding-both-shoot"];
/** Download budget for the whole arena tree, bytes. */
const BUDGET = 6 * 1024 * 1024;

function readJson(file) {
  const data = fs.readFileSync(file);
  if (data.readUInt32LE(0) !== 0x46546c67) throw new Error("not a GLB");
  const jsonLen = data.readUInt32LE(12);
  return JSON.parse(data.slice(20, 20 + jsonLen).toString("utf8"));
}

function size(js) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const node of js.nodes ?? []) {
    if (node.mesh === undefined) continue;
    const s = node.scale ?? [1, 1, 1];
    const t = node.translation ?? [0, 0, 0];
    for (const prim of js.meshes[node.mesh].primitives ?? []) {
      const acc = js.accessors[prim.attributes?.POSITION];
      if (!acc?.min) continue;
      for (let ci = 0; ci < 2; ci++) {
        const c = ci === 0 ? acc.min : acc.max;
        for (let k = 0; k < 3; k++) {
          const v = c[k] * s[k] + t[k];
          min[k] = Math.min(min[k], v);
          max[k] = Math.max(max[k], v);
        }
      }
    }
  }
  return [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
}

let failures = 0;

for (const [sub, wanted] of [["dungeon", DUNGEON], ["blasters", BLASTERS]]) {
  const dir = path.join(arena, sub);
  if (!fs.existsSync(path.join(dir, "Textures/colormap.png"))) {
    console.error(`✗ ${sub}: Textures/colormap.png missing — models load untextured`);
    failures++;
  }
  for (const name of wanted) {
    const file = path.join(dir, `${name}.glb`);
    if (!fs.existsSync(file)) {
      console.error(`✗ ${sub}/${name}.glb missing`);
      failures++;
      continue;
    }
    try {
      const js = readJson(file);
      const uris = (js.images ?? []).map((i) => i.uri).filter(Boolean);
      const badUri = uris.length > 0 && !uris.every((u) => u === "Textures/colormap.png");
      if (badUri) {
        console.error(`✗ ${sub}/${name}.glb unexpected image URIs: ${uris.join(",")}`);
        failures++;
      }
      const [sx, sy, sz] = size(js);
      const clips = (js.animations ?? []).map((a) => a.name);
      const extra = clips.length ? ` clips: ${clips.length}` : "";
      console.log(`✓ ${sub}/${name}.glb  ${sx.toFixed(2)}×${sy.toFixed(2)}×${sz.toFixed(2)}${extra}`);
      if (sub === "dungeon" && name === "character-human") {
        const missing = RIG_CLIPS.filter((c) => !clips.includes(c));
        if (missing.length) {
          console.error(`✗ character-human.glb missing clips: ${missing.join(",")}`);
          failures++;
        }
      }
    } catch (err) {
      console.error(`✗ ${sub}/${name}.glb: ${err.message}`);
      failures++;
    }
  }
}

let total = 0;
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else total += fs.statSync(p).size;
  }
};
walk(arena);
console.log(`\nTotal: ${(total / 1024 / 1024).toFixed(2)} MB (budget ${(BUDGET / 1024 / 1024).toFixed(0)} MB)`);
if (total > BUDGET) {
  console.error("✗ over download budget");
  failures++;
}
if (failures > 0) process.exitCode = 1;
else console.log("All arena assets OK");
