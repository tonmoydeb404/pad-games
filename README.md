# Pad·Games

A tiny gamepad-first **game store** of original browser games. Every title
runs in the browser and is fully playable with a controller — the store
itself is browsable with a d-pad (spatial navigation, `A` to launch), and
`/input-test` verifies any pad end to end.

Currently stocked:

| Game          | Route    | What                                                                 |
| ------------- | -------- | -------------------------------------------------------------------- |
| **Racing**      | `/racing` | Free-roam circuit racing on a Kenney Racing Kit track                |
| **Jungle Jeep** | `/jeep`  | Open-world jungle sim — on-foot explorer, drivable town, steam train |
| **Dune Glide**  | `/play`  | 2D endless seeded sandboarding with tricks, combos and rails         |

Extras: `/leaderboard` (Dune Glide rankings), `/input-test` (gamepad
mapping, axes, triggers and rumble bench). An Arena multiplayer FPS
(`/arena`) exists in-tree but is not part of the store.

> Dune Glide game design © Matteo Stievano e Rivelio Tech Srl (P. IVA
> 02815060419). Jungle Jeep original concept by Ali Usman. Implementations
> are original: worlds, characters, art and music are all generated
> procedurally at runtime, with Jungle Jeep's vegetation, town kits and
> audio coming from CC0 asset packs (Quaternius "Ultimate Stylized Nature",
> Kenney City Kits, Impact Sounds, TinyWorlds Forest Ambience — see
> `public/assets/jeep/CREDITS.md`).

## Play

```
pnpm install
pnpm dev        # http://localhost:3000
```

| Route           | What                                            |
| --------------- | ----------------------------------------------- |
| `/`             | The game store (gamepad-navigable)              |
| `/jeep`         | Jungle Jeep — open-world jungle + Port Marin    |
| `/racing`       | Racing — Kenney Racing Kit circuit              |
| `/play`         | Dune Glide (menus, HUD, settings are gamepad-only) |
| `/leaderboard`  | Daily-seed & free-ride rankings                 |
| `/input-test`   | Gamepad mapping, axes, buttons, rumble test     |

## Jungle Jeep

A faithful port of the standalone `jungle-jeep.html` build into the repo's
architecture: the engine lives in `src/jeep/` **outside React** (same
principle as the other games), and `src/components/jeep/` renders only the
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
  (CC0 Train Pack, `scripts/build-train-assets.mjs`); behaviour: `src/jeep/train.ts`.

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

## Dune Glide

### Systems

- **Banked chains** — tricks pile into an unbanked chain while you ride;
  a clean landing banks it (with the combo multiplier), a rough landing or a
  crash throws it away.
- **Grind rails** — taut lines strung over calm valleys. Land on one to
  grind: no gravity, the boost meter refills, meters turn into points. Hop
  off (jump), drop off (down), or ride it to the end.
- **Salt pans** — pale slick crust on some flat stretches: low friction and
  a ~40 % higher speed cap. Rock patches stay rough.
- **The Wall** — past ~650 m a sandstorm front starts chasing you. It
  speeds up through six tiers as the run gets longer, surges when far
  behind, and generously holds back while you're airborne. Get caught and
  the run ends. A good air buys breathing room.
- **Chasm slow-mo** — when a gap lines up ahead, time dilates (deeper for
  airborne lines) and snaps back after the lip.
- **Double hop** — one extra mid-air press per jump for late corrections
  and longer combos.
- **Goals & levels** — three active goals per level (distance, spins,
  sunstones, grinds, combos, wall escapes), persisted locally; complete all
  three to advance. Progress shows in the HUD.
- **Boost segments** — the meter fills passively and from tricks/grinds,
  displayed as 12 segments.

### Controls

| Input                          | Action                                    |
| ------------------------------ | ----------------------------------------- |
| Hold **A** / Space / W         | Charge jump — release to launch. Hold in air to *grab* |
| **A** / Space / W (in air)     | Double hop (once per jump)                |
| Stick X · **LT/RT** · LB · ← → | Spin (finish the rotation before landing!) |
| **RB** / X / Shift             | Boost (meter refills from tricks, sunstones & grinds) |
| S / ↓                          | Fast-fall · drop off a rail               |
| **Start** / Esc / P            | Pause                                     |

Landing is judged by two angles — **body vs slope** (finish your spins; a
failed rotation is a crash) and velocity vs slope (extreme slams bleed speed).
Clean landings keep ~97% of your speed, bank your trick chain, and build the
combo multiplier (up to ×8); rough ones bleed speed and throw the chain away;
a crash ends the run.

## Architecture

The one principle: **games live outside React**. React + Tailwind render
only the shell (store, menus, HUD, settings, leaderboard); engines never
import React, and per-frame data never touches React state — only slow
values cross the boundary (typed events or engine callbacks).

```
src/
  app/                  routes: store (/), jeep, play, arena, leaderboard, input-test
  components/
    store/              StoreView (gamepad-navigable store front)
    jeep/               JeepShell (start/pause overlays) + JeepCanvas host
    arena/              ArenaCanvas + ArenaShell
    GameCanvas, GameShell, Hud, Menus, DebugPanel, …   (Dune Glide)
  game/                 Dune Glide engine (core, input, world, player, render, audio)
  jeep/                 Jungle Jeep engine (engine.ts, city.ts, train.ts, animals.ts, …)
  arena/                Arena engine
  lib/                  games.ts (store catalog), useGamepadMenu (pad nav), supabase, settings
packages/arena-shared/  shared arena sim code (client + server)
server/                 Colyseus arena server
public/assets/          intentionally empty (everything is procedural)
```

Key decisions (from the build plan):

- **Fixed 60 Hz physics** for Dune Glide, rendering interpolated — same feel
  at any refresh rate. Backlog is dropped if the tab stalls instead of
  spiraling. Jungle Jeep uses the original's clamped-variable step.
- **Seeded RNG everywhere** in Dune Glide (mulberry32 + order-independent
  value noise): the *Daily Run* is one seed for everyone, which makes
  leaderboards fair.
- **Chunked terrain** for Dune Glide; Jungle Jeep builds one closed loop.
- **Custom physics, not a physics engine** — slope/projectile math for the
  sandboard, spring-damper suspension for the jeep.
- **Actions, not buttons**: input maps to abstract actions (per game), so
  the keyboard fallback and pad mappings stay trivial to extend.
- **Strict-mode safe**: canvas hosts are loaded via
  `next/dynamic({ ssr: false })` and create/destroy the whole engine in one
  effect, so the dev double-mount never leaks renderers or listeners.

### Debugging feel

Dune Glide: Settings → **Debug sliders** (or `/play?debug=1`) gives live
sliders for gravity, friction, drag, slope, speeds, jump, spin and boost —
the simulation reads them every step. Show FPS toggle is next to it.

Jungle Jeep: `/jeep?warp=road|crossing|city|aerial` spawns the jeep straight
into Port Marin (access-road climb, the level crossing, the gate street, or
an orbiting aerial) — how the town gets inspected without the drive out.

## Scores online (optional)

Scores work fully offline via localStorage. To use Supabase, set:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

and create the table (the adapter uses the REST API directly — no SDK):

```sql
create table dg_scores (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) <= 24),
  score bigint not null,
  distance bigint not null,
  mode text not null check (mode in ('daily','free')),
  seed bigint not null,
  duration double precision not null,
  created_at timestamptz not null default now()
);
alter table dg_scores enable row level security;
create policy "read scores" on dg_scores for select using (true);
create policy "insert scores" on dg_scores for insert with check (true);
```

Validation is intentionally basic (score vs distance vs duration
plausibility, checked in `src/lib/supabase.ts`). For stronger guarantees,
mirror the checks in a database function/edge function on insert — real
anti-cheat is out of scope.

## Performance & budgets

- Download: game engines lazy-load on their routes only (PixiJS for
  `/play`, three.js for `/jeep` and `/arena`); no audio/sprite assets at all.
- Jungle Jeep: instanced vegetation, one shadow-casting sun that follows the
  jeep, pooled particles in a single draw call, quality presets
  (Low/Medium/High) chosen on the start screen.
- Rumble is optional (`vibrationActuator` feature-detected, try/caught);
  audio + visuals carry the same cues.

## Scripts

```
pnpm dev      # dev server
pnpm build    # production build
pnpm start    # serve production build
pnpm lint     # eslint
pnpm test     # vitest
```
