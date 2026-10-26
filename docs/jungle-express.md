# The Jungle Express

A steam train that runs the jungle railway **forever**. Kenney Train Pack
(April 2019, CC0) models in a custom livery, circling the world on a closed
loop with four level crossings over the jeep trail — including the Port
Marin access road.

## Where things live

| Piece | File |
| --- | --- |
| Rail loop, consist motion, banking, smoke, collisions, audio state | `src/game/world/train/` (`rail-path.ts`, `train-system.ts`, `crossings.ts`, `collision.ts`; tuning in `constants.ts`) |
| Headless tests (real GLBs + pure geometry) | `src/game/world/train/*.test.ts` |
| Engine wiring: bed carve, spawn step, per-frame update, ram sting, kinematic bodies, crossing signs, wildlife keep-out | `src/game/core/engine.ts` (`buildRailway`, `trainRam`, the `RAIL_BED` blocks in `terrainHeight` / `buildTerrain` / `surfaceAt`) |
| Chug / rumble / whistle audio stage | `src/game/core/audio.ts` (`setTrainState`, `trainWhistle`) |
| GLB converter | `scripts/build-train-assets.mjs` (sources: extract the Train Pack zip into git-ignored `train-pack-sources/`) |
| Assets + credit | `public/assets/jeep/train/*.glb`, `public/assets/jeep/CREDITS.md` |

## How it works

- **The loop** — 48 control points on a circle (base radius 315) with two
  Gaussian dips pulled over the trail's biggest bulges; each dip dips inside
  the trail ring and back out, producing four level crossings. `RailPath.build`
  smooths the bed height off the base terrain with a ±250u window (trains hate
  grades), adds gentle periodic harmonics, and pulls the bed level with the
  trail through crossings so everything meets at grade.
- **The world answers** — `terrainHeight` carves a flat ballast bench
  (`RAIL_BED` 7.5u — wider than the coarsest terrain lattice cell diagonal,
  so the *rendered* bed is exactly the rail height and the track never
  floats or buries) blending back over `RAIL_BLEND` 13u; the terrain tints
  gravel there; `surfaceAt` returns `"ballast"` (grippy, chunky); vegetation
  `pick()` keeps trees 14u and ground cover 9.5u off the bed (nothing stands
  on the bench); wildlife spawning treats the corridor as blocked.
- **The train** — five cars (loco, coal tender, two wagons, flatcar) advance
  by arc length at `TRAIN_SPEED` 12.5 u/s — one lap ≈ 2.5 min, never stopping.
  Cars pitch on grades and bank ~4° outward on curves. The chimney puffs
  through the engine's pooled particle system. Track pieces are compressed to
  ~40 % length (gauge unchanged) and pitch to the bed grade — joints sit ≤2°
  apart on the tightest curve and slopes don't staircase.
- **Solid by physics** — each car near the player (within 150u) owns a
  kinematic-position Rapier cuboid (`addBox`/`moveBox`/`removeBox` host
  hooks); far cars retire theirs. Contact-force events give the jeep the full
  crash treatment; `trainRam` adds the arcade sting (jeep: damage + lateral
  shove; on foot: `hurtPlayer` + big knockback — likely a knockout).
- **Sound** — `setTrainState` drives a noise chuff gated by a slewed square
  LFO (rate follows speed), a low rumble, and a stereo pan from the camera's
  right axis; gain falls off with distance (silent past ~380u). `trainWhistle`
  is a detuned two-tone chord with breath noise; the loco whistles approaching
  any crossing (20s cooldown).
- **Signs** — every crossing gets "CROSSING / express line" boards on both
  trail approaches, posted on the side away from the rails.

## Geometry facts (asserted in `train/rail-path.test.ts`)

- Loop ≈ 1845u, 900 samples (~2u spacing), wraps seamlessly.
- Crossings ≈ (158, 198), (12, 255), (−205, −154), (−61, −251).
- Min trail clearance away from crossings ≈ 17u; min water clearance ≈ 30u.
- Min curve radius 161u (the consist is 34.5u); max grade ≈ 3.2°.

## Tuning knobs (all in `src/game/world/train/constants.ts`)

`RAIL_RING` (dip angles/depth/width, base radius), `TRAIN_SCALE` 0.8,
`TRAIN_SPEED` 12.5, `RAIL_BED`, `RAIL_BLEND`, `CAR_GAP` 0.9, `CHIMNEY`
(smoke source), `WHISTLE_COOLDOWN`, `WHISTLE_RANGE`, `EARSHOT`, `CARS`
(consist order + kit-unit half-lengths).

Rebuild assets after editing the converter:
`node scripts/build-train-assets.mjs` (validated by re-parsing every GLB).
