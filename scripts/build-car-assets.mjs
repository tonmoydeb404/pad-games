/**
 * Build the Jungle Jeep car pack: Kenney "Car Kit" (CC0) → GLB files in
 * public/assets/jeep/cars/.
 *
 *   Kenney Car Kit (3.1) — 25 vehicles + 15 debris parts, GLB format
 *   License: CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/)
 *
 * The GLBs reference their texture by the relative URI
 * "Textures/colormap.png", so that exact layout is preserved under the
 * output directory (GLTFLoader resolves it against each GLB's URL).
 *
 * Sources: the original zip, looked up as
 *
 *   ./car-kit-sources/kenney_car-kit.zip
 *
 * or passed explicitly:
 *
 *   node scripts/build-car-assets.mjs --zip ~/Downloads/kenney_car-kit.zip
 *
 * Standalone wheel/box/cone GLBs are skipped: every vehicle model carries
 * its own wheel nodes, and the debris parts ship separately below.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import url from "node:url";

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const OUT = path.join(root, "public/assets/jeep/cars");

const argZip = process.argv.includes("--zip")
  ? path.resolve(process.argv[process.argv.indexOf("--zip") + 1])
  : path.join(root, "car-kit-sources", "kenney_car-kit.zip");

/** Files that are not vehicles or debris (props + standalone wheels). */
const SKIP = /^(box|cone|cone-flat|wheel-[^/]*)\.glb$/;

if (!fs.existsSync(argZip)) {
  console.error(`Car kit zip not found: ${argZip}`);
  console.error("Pass it explicitly:  node scripts/build-car-assets.mjs --zip <path-to-zip>");
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });

// Extract only the GLB folder into a scratch dir (the zip also carries FBX
// and OBJ copies of every model — we want none of those).
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kenney-carkit-"));
try {
  execFileSync("unzip", ["-o", "-q", argZip, "Models/GLB format/*", "License.txt", "-d", tmp]);

  const glbDir = path.join(tmp, "Models/GLB format");
  let copied = 0;
  let bytes = 0;
  for (const entry of fs.readdirSync(glbDir)) {
    if (!entry.endsWith(".glb") || SKIP.test(entry)) continue;
    fs.copyFileSync(path.join(glbDir, entry), path.join(OUT, entry));
    copied++;
    bytes += fs.statSync(path.join(OUT, entry)).size;
  }

  // The one texture every model in the kit shares — keep the relative
  // "Textures/colormap.png" path the GLBs reference.
  const texSrc = path.join(glbDir, "Textures/colormap.png");
  const texOut = path.join(OUT, "Textures/colormap.png");
  fs.mkdirSync(path.dirname(texOut), { recursive: true });
  fs.copyFileSync(texSrc, texOut);

  // Ship the license alongside the assets, same convention as CREDITS.md.
  fs.copyFileSync(path.join(tmp, "License.txt"), path.join(OUT, "LICENSE.txt"));

  const mb = (bytes / 1024 / 1024).toFixed(2);
  console.log(`Copied ${copied} GLBs (+${mb} MB) and Textures/colormap.png to public/assets/jeep/cars/`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
