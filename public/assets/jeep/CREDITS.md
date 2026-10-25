# Jungle Jeep — external assets

| Asset | Author | License | Files |
| --- | --- | --- | --- |
| Ultimate Stylized Nature (May 2022) — **all 63 vegetation models** (maples, birches, NormalTrees, pines, dead trees, bushes, flowers, grass, plants, petals, and OBJ-source palm/rock conversions) | [Quaternius](https://www.patreon.com/quaternius) | CC0 1.0 | `nature/*.gltf`, `nature/*.bin`, `nature/*.png`, `nature/*.jpg`, `nature/*.glb` |
| Car Kit (3.1) — **25 vehicles + 14 debris parts** (selectable rides + crash effects, see `src/jeep/cars.ts`) | [Kenney](https://kenney.nl/assets/car-kit) | CC0 1.0 | `cars/*.glb`, `cars/Textures/colormap.png` (rebuilt from the original zip with `scripts/build-car-assets.mjs`) |
| Train Pack (April 2019) — **steam locomotive, coal tender, 3 wagons + track piece** (the Jungle Express, see `src/jeep/train.ts`) | [Kenney](https://kenney.nl/assets/train-pack) | CC0 1.0 | `train/*.glb` (converted from the pack's OBJ sources with `scripts/build-train-assets.mjs`, re-coloured into the Express livery) |
| City Kit (Suburban) 2.0 — **all 21 houses, fences, paths, planters and yard trees** (Port Marin's neighbourhoods, see `src/jeep/city.ts`) | [Kenney](https://kenney.nl/assets/city-kit-suburban) | CC0 1.0 | `city/town/*.glb` + `city/town/Textures/colormap.png` (shipped verbatim by `scripts/build-city-assets.mjs`) |
| City Kit (Roads) — **street tiles (straight/bend/crossroad/dead-end/zebra), lamps, signs, traffic light, power poles, cones + dumpster, highway board** (Port Marin's streets and access road) | [Kenney](https://kenney.nl/assets/city-kit-roads) | CC0 1.0 | `city/roads/*.glb` + `city/roads/Textures/colormap.png` (shipped verbatim by `scripts/build-city-assets.mjs`) |
| Ultimate Animated Animals (July 2021) — 12 mammals (cow, bull, horses, donkey, alpaca, deer, stag, fox, wolf, husky, shiba) with skinned clips | [Quaternius](https://www.patreon.com/quaternius) | CC0 1.0 | `animals/*.glb` (from the pack's glTF sources) |
| Animated Characters — Protagonists (2.0) — the on-foot explorer: characterMedium rig + idle/run/jump clips + 4 skins | [Kenney](https://kenney.nl/assets/animated-characters-protagonists) | CC0 1.0 | `character/character.glb` (baked from the pack's FBX by `scripts/convert-character.mjs`), `character/skins/*.png` |
| Dinosaur Animated Pack (Dec 2018) — 6 dinos (T-rex, raptor, triceratops, stegosaurus, apatosaurus, parasaurolophus) with skinned clips | [Quaternius](https://www.patreon.com/quaternius) | CC0 1.0 | `animals/*.glb` (converted from the pack's FBX sources) |
| Easy Animated Enemy Pack (Jan 2019) — 6 critters (frog, rat, snakes, spider, wasp) with skinned clips | [Quaternius](https://www.patreon.com/quaternius) | CC0 1.0 | `animals/*.glb` (converted from the pack's FBX sources) |
| Blaster Kit (2.1) — **5 hand-held blasters** (pistol, SMG, rifle, shotgun, sniper; the on-foot guns, see `src/jeep/weapons.ts`) | [Kenney](https://kenney.nl/assets/blaster-kit) | CC0 1.0 | `blasters/blaster-{b,h,e,l,q}.glb`, `blasters/Textures/colormap.png` (copied verbatim from the kit's GLB folder) |
| Impact Sounds | [Kenney](https://kenney.nl/assets/impact-sounds) | CC0 1.0 | `audio/impact/*.mp3` (converted from the original OGG; MP3 for Safari compatibility) |
| Forest Ambience | [TinyWorlds](https://opengameart.org/content/forest-ambience) (Ludum Dare 29, "The Woods") | CC0 1.0 | `audio/ambience.mp3` (re-encoded 32 kHz) |

All assets are CC0 / public domain (no attribution legally required — credited
anyway, good assets deserve it). Downloaded 2026-10-25.

Pipeline notes:

- Kenney Car Kit vehicles ship as the pack's own GLBs (rebuilt by
  `scripts/build-car-assets.mjs`, which also keeps the shared
  `Textures/colormap.png` next to them — the GLBs reference it by relative
  URI). Normalisation (mirroring into rig space, footprint scaling,
  wheel-node extraction) happens at load time in `src/jeep/cars.ts`.
- Train Pack GLBs are converted from the pack's gray OBJ exports by
  `scripts/build-train-assets.mjs` (sources in the git-ignored
  `train-pack-sources/`): re-coloured by object-name rules into the Jungle
  Express livery, rotated so the loco's front faces -Z, grounded and
  foot-centred, then re-parsed as a self-check. Runtime behaviour
  (loop, motion, smoke, crossings, collisions, audio hooks) lives in
  `src/jeep/train.ts`.
- City Kit GLBs are already engine-ready (y-up, grounded, foot-centred,
  1×1 tile grid), so `scripts/build-city-assets.mjs` ships them verbatim
  (sources in the git-ignored `city-pack-sources/`), keeping each kit's
  shared `Textures/colormap.png` beside them — the two kits ship DIFFERENT
  colormaps, hence the `city/town/` and `city/roads/` split. Piece
  orientation is measured, not assumed: `src/jeep/city.ts` carries a
  per-piece connection table and rotates tiles onto the street plan at
  build time, with `city.test.ts` proving every face meets a neighbour.
  The town shelf, access road and level crossing are carved into the
  terrain by `CitySite` (pure math, deterministic — same idea as the
  railway's `RailPath`).
- Animal GLBs are built by `scripts/build-animal-assets.mjs` from the
  extracted itch.io zips (sources in the git-ignored `animal-pack-sources/`):
  glTF → GLB via `@gltf-transform/cli`, FBX → GLB via the `fbx2gltf` binary
  (needs Rosetta 2 on Apple Silicon). `scripts/validate-animal-assets.mjs`
  parses every GLB with three.js and prints natural sizes + clip names.
  Behaviour and physics live in `src/jeep/animals.ts`.

- Palm, rock, NormalTree, PineTree, Plant and Petals models existed only as
  gray-material OBJ exports in the pack, so they were converted to
  self-contained GLB with `obj2gltf` and recoloured by material-name
  heuristics in `src/jeep/assets.ts`.
- Three 4K bark normal maps were downscaled to 1024 px with ffmpeg (Maple,
  Normal, Birch — these are stylized low-poly models; the ~60 MB of
  originals were pure waste).
- Loading is optional at runtime: `src/jeep/assets.ts` and
  `JeepAudio.loadFiles()` degrade gracefully (a console warning and no
  vegetation / no recorded audio layer) if any files are missing.
