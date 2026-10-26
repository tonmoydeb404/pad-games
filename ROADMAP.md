# TinTin — Roadmap & Status

Statuses: `NOT STARTED` · `IN PROGRESS` · `BLOCKED` · `IMPLEMENTED — NEEDS TESTING` · `VERIFIED COMPLETE`.
The full spec lives in `PLAN.md`; this file tracks what is actually true of the code.

| Phase | Status |
| --- | --- |
| 0 — Audit & baseline | **VERIFIED COMPLETE** (2026-10-26) |
| 1 — Performance, partitioning, streaming | IN PROGRESS (render cost cut; streaming decision below) |
| 2 — Player state, inventory, equipment | NOT STARTED |
| 3 — Wildlife, taming, riding | NOT STARTED (animals + riding exist as prototype) |
| 4–11 | NOT STARTED |

## Phase 0 report

### Architecture
- Next 16 hosts one route (`/`). The engine is plain Three.js 0.186 + Rapier 0.21, **outside React** (`src/game/`). React draws only the title/pause menus and the controls panel; the in-game HUD is engine-owned DOM (`core/engine/ui`, `config/hud-css.ts`).
- `JeepEngine` is a class chain (`PlayerState → RuntimeState → …`) with behaviour split into method modules merged by `methods.ts`.
- World: fixed 1000-unit fbm heightfield, a closed trail, Port Marin town, a train. Only **physics** (Rapier heightfield + props) streams in a 3×3 chunk window; render meshes, animals and the town are built whole at start-up.
- Gameplay present: explorer on foot (sprint, jump, crouch, roll, melee, 5 guns), 24 animal species with flee/attack/death, riding (`world/animals/ride*`), the jeep (the only vehicle), gamepad + keyboard + touch input, procedural audio.
- Not present: inventory, items, resources, gathering, crafting, building, home, persistence, NPCs, VR. Settings (explorer, graphics) persist via `localStorage`; nothing else does.

### Inventory
| Area | State |
| --- | --- |
| Player controller, health, stamina | working (state lives in `PlayerState.foot`, not a serialisable model) |
| Animals, riding, melee, guns | working, test-covered (116 tests) |
| Gamepad | working; input is jeep-shaped, not semantic actions |
| Title / pause / HUD | redesigned this phase |
| Quality setting | now real: changing it rebuilds the world (it was previously a no-op) |
| Dragons, flyers (beyond a wasp) | missing — "dragons" in the plan = dinosaurs today |
| Everything else in PLAN.md §5–§13 | missing |

### Performance baseline
Production build (`next start`), headless Chrome 155 with Metal/ANGLE on the dev machine, 1920×1080, DPR 1, quality **high**. Display quantises frames to 16.7 ms steps, so p50/p95 read 16.7/33.4 ms. Collected with the in-game profiler (`?profile`, F3/F4). The machine was under heavy unrelated CPU load while measuring (load average ≈ 15), so treat the figures as a pessimistic single-machine baseline.

| Scenario | FPS | p95 frame | frames >33 ms | JS/frame | Draw calls | Triangles | Heap |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Idle on foot | 42.8 | 33.4 ms | 31 / 343 | 16.5 ms | 942* | 11.0 M | 130 MB |
| Sprinting on foot | 48.7 | 33.4 ms | 40 / 600 | 11.5 ms | 412 | 11.0 M | 159 MB |
| Riding an animal | 52.7 | 33.3 ms | 25 / 600 | 10.0 ms | 393 | 10.9 M | 156 MB |

\* the first window includes world-build frames.

- World ready (Play enabled): **≈ 7.8 s** from navigation (production, local server, headless).
- Scene: 99 animals, 315 top-level scene objects, 678 geometries, ~530 textures. No console errors; only a `THREE.Clock` deprecation warning.
- A dev-server run (headed, 1920×1080) agreed: 35–47 FPS, ~11 M triangles, ~400 draw calls.
- Not measured: gamepad reconnect (needs hardware), memory growth over a long session, other devices.

### Findings that drive Phase 1
1. **~11 M triangles per frame** is the dominant cost and does not change between scenes, so it is not streaming-related: the whole jungle, 99 skinned animals and the shadow pass are drawn at full detail every frame. LOD, distance culling and fewer shadow casters come before any chunk system.
2. Textures climb slowly while moving (522 → 539 in one run): check for per-frame or per-spawn texture creation (particles, decals, health bars).
3. ~25 MB of animal GLBs load up front; deep-jungle species could load lazily.
4. Physics streaming already works and is not a bottleneck.

### Technical risks
1. State is scattered across engine class fields — Phase 2/7 need a serialisable player/world model first.
2. Animals have no stable IDs (seeded spawn only) — blocks persistence and chunk reload correctness.
3. Input is jeep-centric; inventory, interaction and VR need a semantic action layer.
4. One test file under CPU contention can hit Vitest's 5 s timeout (`on-foot`, `engine.physics`); they pass in isolation and on an idle machine.
5. `AGENTS.md` warns Next 16 differs from older versions — read `node_modules/next/dist/docs/` before touching routing/config.

### Phase 1 plan (smallest safe path)
1. Cut triangles: distance-based LOD / culling for vegetation and animals, tighter shadow distance and caster count; re-measure with the profiler.
2. Track down the texture growth.
3. Lazy-load deep-jungle animal models.
4. Introduce `ChunkId`/region abstraction and stable entity IDs **only if** a larger world is wanted; wrap the existing physics streamers first.
5. Re-run the baseline table above after each step.

### Phase 0 deliverables
- Architecture report, inventory, baseline, risks, Phase 1 plan: this section.
- Dev profiler: `src/game/core/profiler/` (F3 toggle, Shift+F3 reset, F4 copy JSON). Dev builds or `?profile`.
- Scope cleanups made along the way: only the jeep remains (other cars removed); title screen, pause menu and HUD redesigned.

## Phase 1 — progress

Method: profile first (`?profile`, F4 now also lists the biggest triangle contributors and node counts), then fix the measured cost.

### Findings
- Every vegetation `InstancedMesh` carried the whole world's instances and a world-sized bounding sphere, so three.js could never cull it. All ~4,500 plants were drawn in the main pass and again in the shadow pass, although the shadow map only covers ±68 m around the player.
- 99 animals were all scene-graph-updated every frame; animals past 220 m were already asleep (no brain, no mixer) but still cost bone matrix updates and culling.
- Textures plateau at ~530 over a 2-minute drive: no leak. The 526 → 612 climb seen earlier was lazy first-use uploads.
- Physics streaming (3×3 Rapier heightfield chunks) already works and is not a bottleneck.

### Changes
1. `world/instance-lod.ts`: instances kept nearest-first; main pass draws those within 460 m (fog hides >85% beyond that), shadow pass only those within 140 m. Re-sorted when the player has moved 6 m. Colours move with their instances; 4 unit tests.
2. `animals/dormant.ts`: animals beyond 300 m are hidden and skipped by the matrix update (wake at 280 m so the boundary doesn't flicker); 3 unit tests.

### Measured (same scenarios, production build, headless Chrome, 1920×1080, quality high)
| Scenario | Triangles before → after | Draw calls before → after | JS per frame before → after |
| --- | --- | --- | --- |
| Idle on foot | 11.0 M → 5.1 M | 942 → 854 | 16.5 → 8.3 ms |
| Sprinting | 11.0 M → 4.7 M | 412 → 376 | 11.5 → 7.1 ms |
| Riding / driving | 10.9 M → 3.4 M | 393 → 245 | 10.0 → 3.7 ms |

Triangle and draw-call counts are exact. Frame times were taken at different machine loads (the "before" run was under heavy unrelated CPU load), so JS-per-frame is indicative only. After: 59-60 FPS (display-capped), 0-4 frames over 33 ms per 600.

Visual check against the earlier screenshots: no visible change at spawn; no pop-in noticed at the 460 m / 300 m radii (not tested at the far edge of the map or at speed).

### Decision on chunked streaming
Not needed at the current 1 km² world: after culling the scene renders in a few ms and memory is ~110-190 MB. A chunk/region abstraction and stable entity IDs become worthwhile when the world grows or persistence (Phase 7) starts; they are deferred to then rather than built speculatively.

### Remaining for Phase 1
- Lazy-load deep-jungle animal models (25 MB up front) and measure load time.
- Check pop-in at map edges and at driving speed; tune `VIEW_R` / `HIDE_DIST`.
- Terrain mesh (231 k triangles, 340² grid) could use distance-based detail.
- Re-baseline on a second machine / the user's gamepad session.
