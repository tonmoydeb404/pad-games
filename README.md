# TinTin

An open-world 4×4 jungle adventure that runs in the browser and is fully
playable with a gamepad (keyboard and mouse work too).

> Original concept by Ali Usman. Vegetation, town kits and audio come from CC0
> asset packs (Quaternius "Ultimate Stylized Nature", Kenney City Kits, Impact
> Sounds, TinyWorlds Forest Ambience — see `public/assets/jeep/CREDITS.md`).

```
pnpm install
pnpm dev        # http://localhost:3000
```

## Gameplay

The engine lives in `src/game/` **outside React** and `src/components/game/` renders only the
start overlay, pause overlay and error states.

- **World** — a closed Catmull-Rom trail carved into an fbm heightfield, with
  ruts, potholes, a rocky climb, a stream ford and a wooden bridge; instanced
  jungle (trees, palms, ferns, wind-swayed grass), god rays, fireflies and a
  fully procedural sky. Beyond the south-east rim sits **Port Marin** — a
  Kenney-built suburb on a terraced shelf, reached by a paved access road
  that climbs out of the jungle and crosses the Jungle Express rails at a
  level crossing. The town is drivable: asphalt grip, 20 furnished lots with
  solid houses, street lights, stop signs, culs-de-sac and a zebra gate.
- **Vehicle** — custom physics: per-wheel spring suspension, live-axle
  articulation, surface model (dirt/mud/rock/grass/water), slope gravity,
  handbrake drifts, solid obstacle collisions and lap progress on the loop.
- **Everything is procedural** — three.js primitives plus canvas textures;
  Web Audio drives the engine note, tire noise, skids, BGM and jungle
  ambience. Zero assets.
- **The Jungle Express** — a Kenney-built steam train that circles the jungle
  on its own railway forever: ballast bed carved into the terrain, instanced
  track, curve banking and chimney smoke. It whistles approaching the four
  level crossings (posted with warning signs) and is *solid* — kinematic
  Rapier colliders bounce the jeep; getting rammed on foot is a knockout.
  Cars get a "ballast" surface (grippy gravel), and the chug/rumble/whistle
  are distance-attenuated and stereo-panned. Assets: `public/assets/jeep/train`
  (CC0 Train Pack, `scripts/build-train-assets.mjs`); behaviour: `src/game/world/train/`.

### Controls

| Input                    | Action                                  |
| ------------------------ | --------------------------------------- |
| **RT** / A / W / ↑       | Throttle (analog)                       |
| **LT** / S / ↓           | Brake · reverse                         |
| Left stick / A D / ← →   | Steer                                   |
| **B** / Space            | Handbrake                               |
| Right stick / drag       | Look (chase/cockpit) · orbit camera     |
| **Y** / C                | Cycle camera (chase, driver, orbit, undercarriage, wheel) |
| **LB** / H               | Headlights                              |
| **X** / K                | Horn                                    |
| **RB** / R               | Reset jeep (also recover when overturned) |
| **Back** / M             | Mute                                    |
| **Start** / P / Esc      | Pause                                   |

Gamepad menus: the start and pause overlays are fully pad-navigable
(d-pad/stick + `A` confirm, `B` back), collisions and rough terrain drive
`dual-rumble` haptics, and the HUD shows the connected pad.


## Layout

```
src/
  app/                 single route: / (page and layout keep default exports, as Next requires)
  components/game/     jeep-shell/ (start/pause overlays), jeep-canvas, character-preview
  hooks/               use-gamepad-menu
  game/                the engine, outside React
    core/              engine/ (state, world, vehicle, player, camera, ui, runtime), audio/, input/, assets/, noise
    physics/           vehicle physics, ground
    world/             city, train, animals
    player/            character, cars (jeep handling stats + crash debris)
    weapons/           weapons, gun models
public/assets/jeep/    CC0 models and audio
scripts/               asset build/validate pipelines (inputs are git-ignored *-pack-sources/)
docs/                  design notes (jungle-express.md)
```

Every file is at most 200 lines; a bigger module becomes a folder whose `index.ts` only re-exports.

## Scripts

```
pnpm dev      # dev server
pnpm build    # production build
pnpm start    # serve production build
pnpm lint     # eslint
pnpm test     # vitest
```
