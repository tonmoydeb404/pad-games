/**
 * Slim the animal GLBs in public/assets/jeep/animals/ in place: keep only the five clips the
 * engine plays (src/game/world/animals/clips.ts — idle, eat, move, death, react), resample the
 * rest and prune what is left unused. Run it after scripts/build-animal-assets.mjs; it is
 * idempotent. The picking rules below must match pickClips().
 *
 * Usage:  node scripts/slim-animal-assets.mjs
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "public/assets/jeep/animals");

// @gltf-transform/core and /functions are the CLI's own dependencies; resolve them through it.
const cliRequire = createRequire(createRequire(path.join(root, "package.json")).resolve("@gltf-transform/cli"));
const { NodeIO } = cliRequire("@gltf-transform/core");
const { prune, resample } = cliRequire("@gltf-transform/functions");

/** Same selection as pickClips(): which animation names the engine will actually use. */
function keptNames(names) {
  const find = (re, avoid) => names.find((n) => re.test(n) && !(avoid && avoid.test(n))) ?? null;
  return new Set(
    [
      find(/idle/i, /headlow|hitreact/i) ?? find(/flying/i),
      find(/eating/i),
      find(/gallop(?!.*jump)|run|flying/i) ?? find(/walk/i) ?? find(/jump/i),
      find(/death/i),
      find(/hitreact/i),
    ].filter(Boolean),
  );
}

const io = new NodeIO();
let before = 0;
let after = 0;
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".glb"))) {
  const p = path.join(dir, file);
  before += fs.statSync(p).size;
  const doc = await io.read(p);
  const root3 = doc.getRoot();
  const keep = keptNames(root3.listAnimations().map((a) => a.getName()));
  for (const anim of root3.listAnimations()) if (!keep.has(anim.getName())) anim.dispose();
  await doc.transform(resample(), prune());
  await io.write(p, doc);
  after += fs.statSync(p).size;
  console.log(`${file.padEnd(22)} keeps ${[...keep].join(", ")}`);
}
console.log(`\n${(before / 1048576).toFixed(1)} MB → ${(after / 1048576).toFixed(1)} MB`);
