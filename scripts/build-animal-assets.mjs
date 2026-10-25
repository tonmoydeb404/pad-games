/**
 * Build the Jungle Jeep animal pack: three Quaternius packs (all CC0) →
 * self-contained .glb files in public/assets/jeep/animals/.
 *
 *   Ultimate Animated Animals (July 2021) — 12 mammals, glTF sources
 *   Dinosaur Animated Pack (Dec 2018)     — 6 dinos, FBX sources
 *   Easy Animated Enemy Pack (Jan 2019)   — 6 critters, FBX sources
 *
 * Sources are extracted zips from itch.io. The script looks for the three
 * pack folders under --src (default: ./animal-pack-sources), expecting the
 * archive layout:
 *
 *   <src>/Ultimate Animated Animals - July 2021/glTF/*.gltf
 *   <src>/Dinosaur Animated Pack - Dec 2018/FBX/*.fbx
 *   <src>/Easy Animated Enemy Pack - Jan 2019/FBX/*.fbx
 *
 * Usage:  node scripts/build-animal-assets.mjs [--src <dir>]
 *
 * GLTF→GLB: @gltf-transform/cli (base64 → binary, big win, no other changes).
 * FBX→GLB:  the fbx2gltf package's FBX2glTF binary (bakes skin + clips).
 *           On Apple Silicon the shipped binary is x86_64 — Rosetta 2
 *           (`softwareupdate --install-rosetta`) makes it work.
 *
 * Then run `node scripts/validate-animal-assets.mjs` to check every GLB
 * parses in three.js and to print natural sizes / clip names.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const OUT = path.join(root, "public/assets/jeep/animals");

const argSrc = process.argv.includes("--src")
  ? path.resolve(process.argv[process.argv.indexOf("--src") + 1])
  : path.join(root, "animal-pack-sources");

/** Packs: folder name under src → [{ file, out }] entries are auto-listed. */
const PACKS = [
  { dir: "Ultimate Animated Animals - July 2021", sub: "glTF", ext: ".gltf" },
  { dir: "Dinosaur Animated Pack - Dec 2018", sub: "FBX", ext: ".fbx" },
  { dir: "Easy Animated Enemy Pack - Jan 2019", sub: "FBX", ext: ".fbx" },
];

const fbx2gltf = (() => {
  const bin = path.join(
    path.dirname(require.resolve("fbx2gltf/package.json")),
    "bin",
    process.platform === "darwin" ? "Darwin/FBX2glTF" : process.platform === "win32" ? "Windows_NT/FBX2glTF.exe" : "Linux/FBX2glTF",
  );
  return bin;
})();

fs.mkdirSync(OUT, { recursive: true });

let ok = 0;
const failed = [];

for (const pack of PACKS) {
  const dir = path.join(argSrc, pack.dir, pack.sub);
  if (!fs.existsSync(dir)) {
    console.error(`!! missing ${dir} — extract the pack zips there first`);
    process.exitCode = 1;
    continue;
  }
  for (const file of fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(pack.ext)).sort()) {
    const name = path.basename(file, path.extname(file));
    const out = path.join(OUT, `${name}.glb`);
    try {
      if (pack.ext === ".gltf") {
        // base64-embedded buffers → binary GLB, same content otherwise
        execFileSync(
          process.execPath,
          [
            path.join(root, "node_modules/@gltf-transform/cli/bin/cli.js"),
            "copy",
            path.join(dir, file),
            out,
          ],
          { stdio: "pipe" },
        );
      } else {
        execFileSync(
          fbx2gltf,
          ["--binary", "--pbr-metallic-roughness", "-i", path.join(dir, file), "-o", out],
          { stdio: "pipe" },
        );
      }
      const kb = (fs.statSync(out).size / 1024).toFixed(0);
      console.log(`✓ ${name}.glb (${kb} KB)`);
      ok++;
    } catch (err) {
      failed.push(name);
      console.error(`✗ ${name}: ${String(err.stderr || err).slice(0, 300)}`);
    }
  }
}

console.log(`\n${ok} GLBs written to public/assets/jeep/animals${failed.length ? `, ${failed.length} FAILED: ${failed.join(", ")}` : ""}`);
if (failed.length) process.exitCode = 1;
