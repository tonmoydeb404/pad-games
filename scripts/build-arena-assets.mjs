/**
 * Build the Dungeon Blaster arena packs — two Kenney kits (CC0) → GLB files
 * under public/assets/arena/.
 *
 *   Kenney Mini Dungeon (2.0)   → public/assets/arena/dungeon/
 *   Kenney Blaster Kit (2.1)    → public/assets/arena/blasters/
 *
 * Both kits' GLBs reference their shared palette by the relative URI
 * "Textures/colormap.png", so that exact layout is preserved under each
 * output directory (GLTFLoader resolves it against the GLB's URL).
 *
 * The player rig is the dungeon kit's `character-human.glb` / `character-orc.glb`
 * — they ship fully animated (idle/walk/sprint/jump/fall/die/shoot, 32 clips),
 * which is why the "Animated Characters: Protagonists" FBX pack is NOT used:
 * it only carries idle/jump/run and would need a lossy FBX→GLB animation merge.
 * Skin variety comes from runtime tint variants of the shared palette
 * (see SKINS in packages/arena-shared/src/constants.ts).
 *
 * Sources: the original zips, looked up under ./arena-pack-sources (gitignored)
 * or passed explicitly:
 *
 *   node scripts/build-arena-assets.mjs \
 *     --dungeon ~/Downloads/kenney_mini-dungeon.zip \
 *     --blaster ~/Downloads/kenney_blaster-kit_2.1.zip
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import url from "node:url";

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const OUT_ROOT = path.join(root, "public/assets/arena");

function argZip(flag, fallbackName) {
  if (process.argv.includes(flag)) return path.resolve(process.argv[process.argv.indexOf(flag) + 1]);
  const local = path.join(root, "arena-pack-sources", fallbackName);
  if (fs.existsSync(local)) return local;
  return path.join(os.homedir(), "Downloads", fallbackName);
}

const DUNGEON_ZIP = argZip("--dungeon", "kenney_mini-dungeon.zip");
const BLASTER_ZIP = argZip("--blaster", "kenney_blaster-kit_2.1.zip");

/** Dungeon models the game uses; everything else in the kit is skipped. */
const DUNGEON_MODELS = [
  "wall",
  "wall-half",
  "wall-narrow",
  "wall-opening",
  "gate",
  "floor",
  "floor-detail",
  "stairs",
  "column",
  "dirt",
  "barrel",
  "chest",
  "table",
  "chair",
  "pot",
  "rocks",
  "stones",
  "wood-support",
  "banner",
  "trap",
  "coin",
  "key",
  "potion",
  "character-human",
  "character-orc",
  "weapon-sword",
];

/** Blaster-kit models the game uses. Attachments (scope/silencer) are unused. */
const BLASTER_MODELS = [
  ...["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r"].map((s) => `blaster-${s}`),
  "grenade-a",
  "grenade-b",
  "clip-large",
  "clip-small",
  "bullet-foam",
  "bullet-foam-tip",
  "crate-small",
  "crate-medium",
  "crate-wide",
  "target-large",
  "target-small",
  "target-fragment-large",
  "target-fragment-small",
  "smoke",
];

function extract(zip, subDir, wanted) {
  const out = path.join(OUT_ROOT, subDir);
  fs.mkdirSync(out, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kenney-arena-"));
  try {
    execFileSync("unzip", ["-o", "-q", zip, "Models/GLB format/*", "License.txt", "-d", tmp]);
    const glbDir = path.join(tmp, "Models/GLB format");
    let copied = 0;
    let bytes = 0;
    for (const name of wanted) {
      const src = path.join(glbDir, `${name}.glb`);
      if (!fs.existsSync(src)) {
        console.error(`✗ missing in kit: ${name}.glb`);
        process.exitCode = 1;
        continue;
      }
      const dst = path.join(out, `${name}.glb`);
      fs.copyFileSync(src, dst);
      copied++;
      bytes += fs.statSync(dst).size;
    }
    // The one texture the kit's models share — keep the relative
    // "Textures/colormap.png" path the GLBs reference.
    const texOut = path.join(out, "Textures/colormap.png");
    fs.mkdirSync(path.dirname(texOut), { recursive: true });
    fs.copyFileSync(path.join(glbDir, "Textures/colormap.png"), texOut);
    fs.copyFileSync(path.join(tmp, "License.txt"), path.join(out, "LICENSE.txt"));
    const mb = (bytes / 1024 / 1024).toFixed(2);
    console.log(`${subDir}: copied ${copied} GLBs (+${mb} MB) and Textures/colormap.png`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (!fs.existsSync(DUNGEON_ZIP)) {
  console.error(`Mini Dungeon zip not found: ${DUNGEON_ZIP}`);
  console.error("Pass it explicitly:  node scripts/build-arena-assets.mjs --dungeon <path-to-zip> [--blaster <path>]");
  process.exit(1);
}
if (!fs.existsSync(BLASTER_ZIP)) {
  console.error(`Blaster Kit zip not found: ${BLASTER_ZIP}`);
  console.error("Pass it explicitly:  node scripts/build-arena-assets.mjs --blaster <path-to-zip> [--dungeon <path>]");
  process.exit(1);
}

extract(DUNGEON_ZIP, "dungeon", DUNGEON_MODELS);
extract(BLASTER_ZIP, "blasters", BLASTER_MODELS);
console.log("\nNow run: node scripts/validate-arena-assets.mjs");
