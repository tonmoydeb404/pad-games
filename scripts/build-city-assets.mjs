/**
 * Build the Port Marin city pack: Kenney "City Kit (Suburban)" 2.0 + 
 * "City Kit (Roads)" (both CC0) → public/assets/jeep/city/.
 *
 * Sources are the extracted zips; the script looks for the GLB folders under
 * --src (default: ./city-pack-sources), expecting:
 *
 *   <src>/City Kit Suburban/Models/GLB format/*.glb (+ Textures/colormap.png)
 *   <src>/City Kit Roads/Models/GLB format/*.glb     (+ Textures/colormap.png)
 *
 * Usage:  node scripts/build-city-assets.mjs [--src <dir>]
 *
 * Kenney's GLBs are already engine-ready (y-up, grounded at y = 0, footprint
 * centred on the origin, 1×1 tile grid), so the script copies them verbatim —
 * keeping the kit's shared `Textures/colormap.png` next to each set (the GLBs
 * reference it by relative URI, and the two kits ship DIFFERENT colormaps,
 * hence the `roads/` and `town/` subfolders). Every copied GLB is re-parsed
 * with three's GLTFLoader as a self-check, and the natural dimensions are
 * reported so `src/game/world/city/` placement constants stay honest.
 */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const OUT = path.join(root, "public/assets/jeep/city");

const argSrc = process.argv.includes("--src")
  ? path.resolve(process.argv[process.argv.indexOf("--src") + 1])
  : path.join(root, "city-pack-sources");

/** Subfolder → [source GLB dir, files to ship] (null = every .glb in the dir). */
const SETS = {
  town: [path.join(argSrc, "City Kit Suburban", "Models", "GLB format"), null],
  roads: [
    path.join(argSrc, "City Kit Roads", "Models", "GLB format"),
    [
      "road-straight",
      "road-straight-half",
      "road-bend",
      "road-crossroad",
      "road-end",
      "road-crossing",
      "road-sign-stop",
      "traffic-light",
      "light-curved",
      "electricity-pole",
      "construction-cone",
      "dumpster",
      "sign-highway",
    ],
  ],
};

/** Node shims GLTFLoader needs (self + ProgressEvent + FileReader). */
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

const loader = new GLTFLoader();
let ok = 0;
let failures = 0;

for (const [sub, [srcDir, names]] of Object.entries(SETS)) {
  const outDir = path.join(OUT, sub);
  fs.mkdirSync(outDir, { recursive: true });

  // the shared colormap the GLBs reference by relative URI
  const texSrc = path.join(srcDir, "Textures", "colormap.png");
  if (!fs.existsSync(texSrc)) {
    console.error(`!! missing ${texSrc} — extract the City Kit zips first`);
    process.exitCode = 1;
    continue;
  }
  fs.mkdirSync(path.join(outDir, "Textures"), { recursive: true });
  fs.copyFileSync(texSrc, path.join(outDir, "Textures", "colormap.png"));

  const files = names ?? fs.readdirSync(srcDir).filter((f) => f.endsWith(".glb")).map((f) => f.replace(/\.glb$/, ""));
  console.log(`\n== ${sub} ← ${path.basename(srcDir)} (${files.length} models)`);

  for (const name of files) {
    const file = path.join(srcDir, `${name}.glb`);
    if (!fs.existsSync(file)) {
      console.error(`!! missing ${file}`);
      failures++;
      continue;
    }
    // self-check: re-parse the exact bytes we are about to ship
    const buf = fs.readFileSync(file);
    try {
      const glb = await new Promise((resolve, reject) =>
        loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "", resolve, reject),
      );
      const box = new THREE.Box3().setFromObject(glb.scene);
      const size = new THREE.Vector3();
      box.getSize(size);
      fs.writeFileSync(path.join(outDir, `${name}.glb`), buf);
      const kb = (buf.length / 1024).toFixed(0);
      console.log(
        `✓ ${sub}/${name}.glb (${kb} KB) — ${size.x.toFixed(3)} × ${size.y.toFixed(3)} × ${size.z.toFixed(3)} (w×h×l), min.y ${box.min.y.toFixed(3)}`,
      );
      ok++;
    } catch (err) {
      console.error(`!! ${name}.glb failed to parse: ${err}`);
      failures++;
    }
  }
}

console.log(`\n${ok} GLBs written to public/assets/jeep/city/{town,roads}`);
if (failures > 0 || ok === 0) process.exitCode = 1;
