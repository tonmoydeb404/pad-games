# Assets

There are no binary assets in this project on purpose:

- **Graphics** — everything (sky, dunes, terrain, rider, particles, weather)
  is drawn procedurally with PixiJS vector graphics at runtime.
- **Audio** — wind, slide sounds, SFX and the ambient music are synthesized
  with the Web Audio API in `src/game/audio/mixer.ts`.

This keeps the download tiny (well under the 20 MB budget) and eliminates
asset-licensing risk entirely.

**Update 2026-10-25:** Jungle Jeep's vegetation ships as a small (≈13 MB)
CC0-licensed model pack — Quaternius "Ultimate Stylized Nature, every model
family used (maples, birches, NormalTrees, pines, dead trees, palms, bushes,
flowers, grass, plants, petals, rocks) — plus Kenney Impact Sounds and
TinyWorlds' Forest Ambience for audio. Licenses and authors are logged in
[`jeep/CREDITS.md`](jeep/CREDITS.md). Missing files fall back to the
procedural terrain/effects detailed above and a bare (vegetation-less)
world rather than a crash.

**Update 2026-10-25 (Dune Glide):** the 2D sandboard game's scenery now uses
Kenney's CC0 "Background Elements Remastered" (≈200 KB, `dune/`): sun, moon,
clouds, mountains, hills, pyramids and towers as landmarks, and cacti, palms,
dead trees and bushes along the dune ridge. They are recoloured at runtime
from the day/night palette (`src/game/render/art.ts`); the playable terrain,
the near dune, obstacles, rider and weather are still drawn procedurally. See
[`dune/CREDITS.md`](dune/CREDITS.md). If the art fails to load the game falls
back to plain noise dunes rather than crashing.

**Update 2026-10-25 (Dungeon Blaster arena):** the first-person arena now
uses two Kenney CC0 model packs (≈1.9 MB, `arena/`): "Mini Dungeon" for the
map tiles, props and the fully animated player rigs, and "Blaster Kit 2.1"
for the weapon viewmodels, grenades, pickups and hit effects. Licenses and
authors are logged in [`arena/CREDITS.md`](arena/CREDITS.md); the packs are
rebuilt from the source zips with `scripts/build-arena-assets.mjs` and
checked with `scripts/validate-arena-assets.mjs`. If the models fail to
load the game falls back to the original coloured-box art rather than
crashing.
