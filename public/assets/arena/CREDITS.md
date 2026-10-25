# Arena — Dungeon Blaster asset credits

All models are by [Kenney](https://kenney.nl) and licensed
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (see the
`LICENSE.txt` next to each pack). No attribution is required — this file
simply records where the art came from.

## `dungeon/` — Kenney "Mini Dungeon" (2.0)

- 26 GLB models (walls, floors, stairs, props, the animated player rigs
  `character-human.glb` / `character-orc.glb`) + the shared palette
  `Textures/colormap.png`.
- Rebuilt from the kit zip by `scripts/build-arena-assets.mjs`
  (sources in the gitignored `arena-pack-sources/`).

## `blasters/` — Kenney "Blaster Kit" (2.1)

- 32 GLB models (18 blasters `blaster-a`…`blaster-r`, grenades, clips,
  foam darts, crates, targets + fragments, smoke) + `Textures/colormap.png`.
- Rebuilt from the kit zip by the same script.

## Player skins

The player rigs are the dungeon kit characters; their 32 animation clips
(idle/walk/sprint/jump/fall/die/holding-both-shoot) drive the in-game
animation state machine. Skin variety is done at runtime by tinting the
shared palette texture (see `SKINS` in `packages/arena-shared/src/constants.ts`),
so no extra assets are needed.
