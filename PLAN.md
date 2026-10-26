# Tintin — Complete Game Development Specification

> **Purpose:** This document is the implementation roadmap and working specification for AI coding agents building Tintin.
>
> **Project direction:** A browser-based, third-person open-world survival sandbox with free exploration, wildlife, rideable animals, gathering, crafting, cooking, fishing, home building, combat, and later optional VR support.
>
> **Current status:** The prototype has been audited (Phase 0 complete) and Phase 1 is complete for its revised scope. The verified state of the code is in **Section 0** below; live status and measurements are in `ROADMAP.md`. Where this document and Section 0 disagree about what exists today, Section 0 is correct.
>
> **Primary rule:** Inspect the existing code before changing it. Extend and refactor the prototype incrementally. Do not replace working systems or rebuild the game from scratch without identifying a concrete technical reason and explaining it first.

---

## 0. Current Project Context (verified against the repository, 2026-10-27)

This section replaces the original assumptions about the prototype. Read it before any other section.

### 0.1 What the game is today
An open-roaming jungle game in the browser: the player starts on foot beside a parked jeep, can walk, sprint, jump, crouch, roll, punch, kick and shoot, ride animals, and drive the jeep around a fixed 1 km × 1 km jungle with a town and a train. **It is not yet a survival game.** There is no inventory, gathering, crafting, cooking, building, home, hunger, NPCs, economy, saving, or VR. The product direction (Section 1) is a survival sandbox; everything under Phases 2–11 is still to be built.

### 0.2 Technology
- Next.js 16.4.3 (App Router, one route `/`), React 19, TypeScript, Tailwind v4, pnpm. Next only hosts the game. `AGENTS.md` warns that this Next version differs from older ones: read `node_modules/next/dist/docs/` before changing routing or config.
- Rendering: plain **Three.js 0.186** (no React Three Fiber), `EffectComposer` post-processing. Physics: **Rapier 0.21**. Tests: Vitest (123 tests, many run the real engine headless).
- The engine lives outside React in `src/game/`. React draws only the title screen, pause menu and controls panel; the in-game HUD is engine-owned DOM styled by `src/game/core/engine/config/hud-css.ts`.
- `JeepEngine` is a class chain (`PlayerState → RuntimeState → …`) whose behaviour is split into method modules merged in `core/engine/methods.ts`. State is mutable fields on the engine, not yet a serialisable model.

### 0.3 Repository layout
```
src/app/                 single route + layout (fonts: Big Shoulders Stencil, IBM Plex Sans Condensed, IBM Plex Mono)
src/components/game/     jeep-shell/ (title, pause, controls menus, gamepad menu nav), jeep-canvas
src/hooks/               use-gamepad-menu
src/game/core/           engine/ (state, world, vehicle, player, camera, ui, runtime), audio/, input/, assets/, profiler/
src/game/physics/        Rapier vehicle rig, terrain + prop streamers
src/game/world/          animals/ (24 species, AI, riding), city/ (Port Marin), train/ (Jungle Express)
src/game/player/         explorer character (Kenney rig, 4 skins), cars/ (jeep handling stats + crash debris)
src/game/weapons/        armory + 5 guns
public/assets/jeep/      CC0 models and audio (≈45 MB); scripts/ rebuild them
ROADMAP.md               live status and measurements
```
Project conventions (enforced in `AGENTS.md`): kebab-case files, named exports only, **200 lines max per file**, one responsibility per module, tests beside the code. Before finishing any change: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test`, `pnpm build`.

### 0.4 What exists, by plan area
| Plan area | State today |
| --- | --- |
| Player controller (§5) | Working: walk/jog/sprint, jump, crouch, dodge roll, melee combo. **Phase 2 foundations are in:** `src/game/player/state/` holds the serialisable player model (vitals with armor/stamina, inventory, held item, flags), data-driven items, and one set of damage/heal/stamina rules; the Armory only draws carried blasters; an inventory screen opens with `I` / Back. Knock-out and a wrecked or overturned jeep wait for the player to recover them (`F`/`Y`, `R`/RB). No hunger, no world pickups, no armor source yet. |
| Wildlife (§6) | 24 species (mammals, small stream critters, dinosaurs, a flying wasp) with flee / attack / ragdoll-death / respawn and floating health bars. **The plan's "dragons" are the dinosaur species; there are no dragons.** Animals have no stable IDs (seeded random spawn). No taming, feeding or petting. |
| Riding (§6.5) | Working: mount/dismount, saddle fit, per-species special moves, tested. |
| Combat | Fists plus 5 guns (pistol, SMG, rifle, shotgun, sniper) with ammo/reload; shared damage is not yet centralised. |
| Vehicle (§12) | **The jeep is the only vehicle** (all other cars were removed on purpose; they return in Phase 9). Custom suspension physics, procedural model, headlights, damage, handbrake drifts. Modelled in `core/engine/vehicle/`. |
| World (§9) | One fbm heightfield (1000 u), a closed trail with ford and bridge, instanced jungle (Quaternius CC0), Port Marin town (Kenney CC0), the Jungle Express train. No biomes, caves, rivers beyond one ford, map or landmarks. |
| Streaming (§4) | Only **physics** streams (3×3 Rapier chunks). Render content is built once. Decision recorded in `ROADMAP.md`: chunked render streaming is deferred until the world grows or persistence starts. |
| Input (§5.7, §15.6) | Keyboard, mouse, gamepad (with rumble) and touch. Input is jeep-shaped; there is no semantic action layer yet. Gamepad also drives the menus. |
| Persistence (§10) | The player model serialises and validates (`serializePlayer` / `restorePlayer`) but nothing writes it yet. Otherwise none, except `localStorage` for the chosen explorer and graphics quality. |
| Audio | Procedural Web Audio (engine, tyres, ambience, impacts) plus CC0 samples. |
| VR (§13) | Not started. |

### 0.5 Interface (redesigned in Phase 0)
- **Design language:** an expedition field kit. Stencil capitals, flat olive-drab and bone plates, khaki secondary text, and the jeep's red (`#c4432c`) as the single accent. No gradients, glows or glass cards beyond lightly blurred HUD plates.
- **Title screen:** the live world behind a left menu panel (Play, Explorer, Graphics, Controls) with a slow camera orbit around the explorer; loading shown as a segmented gauge. **Graphics quality is real**: changing it rebuilds the world.
- **Pause menu:** Resume, Controls, Respawn. Controls open as a paper-style card.
- **HUD (kept to what a player needs):** compass, one-line notices, health and stamina, a weapon card only while a gun is drawn, speed and lights only in the jeep, the interaction prompt, crosshair and an overturned-jeep warning. Future survival UI (hunger, inventory, crafting) should extend this language and keep the HUD sparse.
- **Dev profiler:** `F3` toggles an overlay (FPS, frame percentiles, draw calls, triangles, heap, animals awake), `Shift+F3` resets, `F4` copies a JSON report including the biggest triangle contributors. Active in dev or with `?profile`; not shown in normal production play.

### 0.6 Measured performance (production build, headless Chrome 1920×1080, high quality)
| Scenario | Triangles | Draw calls | FPS |
| --- | --- | --- | --- |
| Original baseline, on foot | 11.0 M | 940 / 412 | 43–49 |
| Original baseline, riding | 10.9 M | 393 | 53 |
| After Phase 1, on foot | 5.1 M | 855 | 59–60 (display cap) |
| After Phase 1, driving | 3.3 M | 234 | 60 |

World ready in about 4.3–5.9 s (was ≈7.8 s). Heap 100–190 MB. Animal assets 17.8 MB (were 25.3 MB). Textures plateau near 530 (no leak). Full method, caveats and the remaining items are in `ROADMAP.md`. Figures come from one machine under varying load; treat frame times as indicative and triangle/draw-call counts as exact.

### 0.7 Decisions already made
1. The project is a **survival game**; the current roaming build is its base.
2. **Only the jeep** for now; other vehicles come back in Phase 9.
3. Chunked render streaming and stable entity IDs are deferred until measurements or Phase 7 require them (persistence IDs must still be designed before saving starts).
4. Keep the existing assets, physics, animals, riding and weapons; extend, do not rewrite.
5. Phase status is tracked in `ROADMAP.md` using the statuses in Section 17.

### 0.8 Known gaps and risks
- The player model is serialisable (done); animals, world objects and the jeep state are not, and still have no stable IDs.
- Animals and world objects have no stable IDs: blocks persistence and chunk reload correctness.
- Input is not abstracted into semantic actions: inventory, interaction and VR depend on it.
- The jeep body is a box with the wheels half inside it; wheel cut-outs would need a shaped body.
- Under heavy machine load, a few engine tests can hit Vitest's 5 s timeout; they pass when run one file at a time (`pnpm exec vitest run --no-file-parallelism`).
- Rebuilding after a graphics-quality change takes several seconds.

---

## 1. Product Vision

Tintin is an open-world sandbox where players can explore a living world, interact with wildlife, collect resources, survive, improve a home, and gradually unlock more possibilities.

The intended core experience:

1. The player starts a session inside their own home.
2. They prepare equipment and decide what to bring.
3. They leave home and explore nearby jungle, rivers, and other regions.
4. They encounter wildlife and can observe, feed, pet, tame, fight, or ride eligible animals.
5. They gather resources by chopping trees, collecting fruit, hunting, and fishing.
6. They return home with their resources.
7. They store items, cook food, craft equipment, and build or upgrade structures.
8. Their world and progress persist between sessions.
9. They gradually explore more distant or dangerous areas and discover new resources and creatures.
10. Later versions can add NPCs, an economy, more combat, vehicles, and optional VR.

### 1.1 Design principles

- **Browser-first:** The primary game remains playable in a modern desktop browser.
- **Gamepad-first compatibility:** Preserve the existing gamepad experience and make all core gameplay possible with a controller.
- **Desktop remains supported:** VR is an optional mode, not a replacement for keyboard, mouse, or gamepad play.
- **Incremental development:** Deliver small, playable milestones rather than large untested feature batches.
- **System reuse:** Shared systems should support many objects, animals, tools, weapons, and recipes.
- **Persistent world:** Important player actions must not be undone simply because a region unloads or the browser refreshes.
- **Performance-aware design:** Do not load, simulate, or render every world object at full detail at all times.
- **Data-driven content:** Define item, animal, tool, weapon, resource, and recipe characteristics as data rather than duplicating logic.
- **Readable, maintainable code:** Avoid monolithic components and duplicated business logic.
- **No speculative rewrites:** Measure and inspect before optimizing or replacing a system.
- **Honest implementation status:** Do not report a feature as complete unless it works and has been tested against its acceptance criteria.

### 1.2 Out of scope for the initial playable release

Do not prioritize these until the core survival loop is functional:

- Multiplayer or online co-op.
- A massive GTA-scale city.
- Complex police, crime, and wanted-level simulation.
- Large collections of weapons and explosives.
- A sophisticated NPC economy.
- Full vehicle simulation.
- A VR-only control scheme.
- Unnecessary backend services or accounts.
- Cosmetic features that do not improve the core loop.

These may be introduced in later phases if the project architecture and performance allow them.

---

## 2. Mandatory Instructions for the AI Builder

Before implementation, follow these instructions.

1. Inspect the complete repository structure, package manifest, framework, build scripts, renderer setup, scene creation, camera, game loop, player controller, world construction, animal system, weapon system, and current persistence.
2. Identify whether the project uses Three.js directly, React Three Fiber, or another abstraction. Do not assume.
3. Identify existing gamepad mappings, input abstractions, UI components, asset sources, and deployment requirements.
4. Produce a concise architecture report before making structural changes.
5. Create or update a phased task plan with dependencies and acceptance criteria.
6. Preserve existing behavior unless a change is necessary and explicitly accounted for.
7. Make changes in small batches. Run available linting, type checking, tests, and production builds after each meaningful batch.
8. If a test or build fails, investigate and resolve it before continuing. Do not hide failures.
9. Avoid replacing real game functionality with mock UI, placeholder buttons, or fake interactions.
10. Do not invent asset paths, APIs, packages, or environment variables. Inspect the project and verify that dependencies are available.
11. Reuse existing conventions and dependencies when reasonable. Do not add a library just to solve a problem that the current stack can handle.
12. Keep keyboard, mouse, and gamepad controls working when adding new systems.
13. Do not implement all phases in a single giant change. Complete and verify one phase at a time.
14. Before a risky migration, explain the issue, proposed change, affected systems, and rollback strategy.
15. Maintain a `ROADMAP.md` or equivalent progress document and update it as phases are completed.
16. Document important architectural decisions, input mappings, performance measurements, and known limitations.
17. If an important requirement cannot be verified from the code, state the uncertainty and inspect further instead of guessing.
18. Do not add VR dependencies or buy-specific assumptions during the early desktop phases. Design for future WebXR compatibility without compromising desktop gameplay.

---

## 3. Phase 0 — Prototype Audit and Baseline

> **Status: VERIFIED COMPLETE (2026-10-27).** Audit, inventory, baseline, risks and Phase 1 plan are in Section 0 and `ROADMAP.md`. The task list below is kept for reference.

**Priority:** Immediate prerequisite  
**Goal:** Understand what already works and establish a reliable baseline before modifying the game.

### Tasks

- Inspect the repository and identify the application entry points.
- Confirm rendering framework and version.
- Locate scene, renderer, camera, animation loop, lighting, and asset loading code.
- Locate player movement, collision, jumping, interaction, and camera-follow logic.
- Locate gamepad and keyboard/mouse input handling.
- Locate the world/map creation process and identify whether terrain and props are handmade, procedural, or hybrid.
- Locate animal behavior, mounting/riding, health, and damage logic.
- Locate weapon/equipment behavior.
- Identify how assets are stored, loaded, compressed, and disposed.
- Determine whether any save/load functionality exists.
- Inspect how the application is built and deployed.
- Run the game and record current bugs and observable behavior.
- Record a baseline on the developer's current machine. Do not claim that this represents performance on all devices.

### Baseline measurements

Where tools permit, measure and document:

- Average FPS and frame-time consistency during normal exploration.
- Frame-time spikes during world traversal.
- JavaScript heap or browser memory indicators available to the project.
- Number of draw calls and rendered triangles, if accessible.
- Initial load time and time until the player can move.
- Number of world objects and approximate asset sizes.
- Whether gamepad connection, disconnection, and reconnection work.
- Any current errors or warnings in the browser console.

### Deliverables

- A brief current-architecture report.
- An inventory of working, broken, partial, and missing features.
- A performance baseline.
- A prioritized technical risk list.
- A phase plan mapped to actual files and systems.
- No large code changes in this phase.

### Acceptance criteria

- The project builds and runs, or existing failures are documented with reproducible steps.
- The current feature set is understood well enough to avoid duplicating systems.
- The next phase is based on measured bottlenecks rather than assumptions.

---

## 4. Phase 1 — World Performance, Spatial Partitioning, and Streaming

> **Status: VERIFIED COMPLETE (2026-10-27) for the revised scope.** Done and measured: distance culling of instanced scenery (main and shadow passes), hiding of far animals, slimmer animal assets (25.3 → 17.8 MB), pop-in comparison. Triangles per frame fell from 11.0 M to 3.3–5.1 M and the game holds 60 FPS. Deliberately deferred: the chunk/region abstraction and stable entity IDs (build them when the world outgrows ~2 km or when saving starts). See `ROADMAP.md`.

**Priority:** First implementation phase  
**Goal:** Support a larger world without loading, rendering, and simulating all world content at full detail simultaneously.

### 4.1 Profile before optimizing

Identify the actual performance bottleneck. Check:

- Terrain complexity.
- Number of trees, grass objects, rocks, and decorative meshes.
- Draw-call count and material duplication.
- Shadow-casting lights and shadow map resolution.
- Expensive post-processing.
- Texture size and memory usage.
- Physics/collision workload.
- Animal and NPC update frequency.
- Garbage collection and unnecessary allocations.
- Asset-loading and shader-compilation stutters.

Do not implement complex streaming solely because the map is currently large. First determine which content needs streaming and which can be optimized with culling, instancing, LOD, or reduced simulation.

### 4.2 Chunk/world-region model

Create a reusable world-region abstraction. A chunk may contain:

- Terrain or a section of terrain.
- Trees, grass, rocks, plants, and other static props.
- Buildings and local environment assets.
- Local points of interest.
- Spawn locations and animal habitat definitions.
- Collision objects or simplified collision representations.
- References to persistent world objects.

Requirements:

- Chunks must have stable identifiers derived from world coordinates or explicit IDs.
- Chunk boundaries and sizes should be configurable.
- The player’s current region must be identified reliably.
- Nearby regions must be loaded or prepared before the player enters them.
- Loading and unloading must not block the render loop.
- Asset loading should be asynchronous and cancellable where appropriate.
- Re-entering a chunk must restore its saved state rather than blindly recreating the original state.
- Adjacent chunks must align without visible gaps, duplicated terrain, or broken collision.
- Streaming must work when the player moves quickly, including while riding an animal.
- Use a queue or concurrency limit for loading so that many chunks do not load simultaneously and cause spikes.

### 4.3 Loading policy

Use a configurable policy based on distance and, where practical, movement direction:

- **Active region:** Full required gameplay simulation and detail.
- **Nearby regions:** Loaded or preloaded, with only relevant gameplay systems active.
- **Distant regions:** Unloaded, rendered as simplified distant representations, or inactive where suitable.
- **Persistent state:** Stored separately from temporary scene objects.

Do not assume every unloaded region must be fully reconstructed from scratch. Separate durable world state from temporary rendered objects.

### 4.4 Performance techniques

Use these only where supported by profiling and the existing renderer:

- Frustum culling.
- Distance-based LOD.
- Instanced rendering for repeated assets such as vegetation and rocks.
- Shared materials and geometry where appropriate.
- Reduced shadow distance and fewer shadow-casting objects.
- Simplified collision meshes.
- Lower-frequency updates for distant animals and nonessential entities.
- Texture compression and appropriate texture resolutions.
- Asset reuse and correct disposal of geometries, materials, and textures.
- Progressive loading of noncritical assets.
- Avoid repeated object creation and allocation in the frame loop.

### 4.5 Streaming correctness

- Do not reset harvested trees when their chunk unloads.
- Do not duplicate animals when a chunk reloads.
- Do not duplicate loot or resource drops.
- Do not lose built structures or stored items.
- Avoid visible pop-in where feasible; use preloading and transition strategies.
- Avoid unloading the player, mounted animal, active interaction target, or other critical objects.
- Ensure collisions and ground detection are ready before a region becomes playable.
- Handle loading failures without leaving the player stuck in an invalid region.
- Avoid permanently retaining unloaded assets in memory.

### Deliverables

- A documented chunk/region system.
- A configurable load/preload/unload policy.
- A profiling comparison against Phase 0.
- A test route that crosses multiple region boundaries.
- A list of known limits and supported world size assumptions.

### Acceptance criteria

- The player can cross several region boundaries without crashes or major streaming errors.
- Adjacent terrain and collision remain correct.
- Persistent changes survive unload and reload during the current session.
- Fast movement does not cause the player to outrun essential terrain or collision.
- Performance and memory are measured before and after the changes.
- No performance improvement is claimed without measurements.

---

## 5. Phase 2 — Player Controller, Stats, Inventory, and Equipment

**Goal:** Establish a reliable player foundation used by every later system.

### 5.1 Player state

Create a central player-state model containing, as appropriate:

- Stable player identifier.
- World position and orientation.
- Health/current HP and maximum HP.
- Armor/current armor and maximum armor, if armor is implemented.
- Stamina/current stamina and maximum stamina.
- Hunger and other survival values when introduced.
- Inventory and item quantities.
- Equipped weapon/tool and equipment slots.
- Current mounted animal, if any.
- Progression flags and unlocks.
- Other state that must survive saving/loading.

Use a single authoritative source of truth for player state. Do not keep conflicting copies in the HUD, controller, inventory screen, and combat logic.

### 5.2 Health, damage, armor, and death

Terminology:

- **HP/health:** The player's ability to survive damage; HP is the numeric representation of health.
- **Armor:** A separate protective layer that can reduce or absorb eligible damage.
- **Stamina:** A resource consumed by actions such as sprinting, jumping, or other strenuous actions.

Requirements:

- Define maximum and current HP.
- Validate that current HP remains within allowed bounds.
- Centralize damage application so animals, falls, weapons, and future hazards use the same rules.
- Define damage types or damage metadata only where needed.
- Make armor mitigation rules explicit and configurable.
- Provide visual/audio feedback when damage is received.
- Implement death and a clear respawn/recovery flow.
- Prevent repeated death events from firing every frame.
- Ensure healing and consumables use the same health API.
- Make UI indicators reflect actual state.

### 5.3 Stamina

- Drain stamina for selected strenuous actions.
- Regenerate it according to configurable rules.
- Prevent actions that require more stamina than the player has, or define an intentional partial-action rule.
- Provide clear feedback when stamina is low.
- Avoid frame-rate-dependent stamina changes; use elapsed time.

### 5.4 Inventory and items

Create a reusable item model with stable IDs and definitions.

An item definition may include:

- ID and display name.
- Description.
- Category/type.
- Icon/asset reference, if available.
- Stackability and maximum stack size.
- Weight or carrying limits only if the design needs them.
- Consumable behavior.
- Equipment compatibility.
- Resource/material classification.
- Any other required data.

Requirements:

- Add, remove, transfer, split, and combine item stacks safely.
- Validate quantities.
- Reject invalid item IDs and negative quantities.
- Define what happens when the inventory is full.
- Support storage containers separately from the player's carried inventory.
- Do not make UI components responsible for inventory business rules.

### 5.5 Equipment and weapon switching

- Support equipped tools, weapons, and other relevant equipment.
- Allow the player to switch between owned/equippable items.
- Do not allow use of items the player does not own.
- Define ammunition and reload behavior if firearms already support them.
- Keep input mapping configurable.
- Ensure equipment state is represented consistently in gameplay and UI.
- Build on the existing weapon prototype after inspecting it; do not replace it blindly.

### 5.6 HUD and interface

Display only the information relevant to the current game state:

- Health/HP.
- Armor if implemented.
- Stamina.
- Hunger once survival is enabled.
- Equipped item or weapon.
- Ammunition when relevant.
- Interaction prompts.
- Contextual alerts such as low health or unavailable actions.

Requirements:

- Avoid an overly cluttered HUD.
- Support different screen sizes.
- Keep the HUD separate from gameplay rules.
- Provide keyboard, mouse, and gamepad navigation where menus require it.
- Respect browser focus and avoid capturing gameplay inputs while typing in a text field.

### 5.7 Gamepad controls

- Inspect and preserve existing mappings.
- Provide a consistent mapping for movement, camera, interaction, jump, sprint, inventory, and equipment switching.
- Use the browser Gamepad API or existing abstraction if appropriate.
- Handle connect/disconnect events and device changes.
- Avoid accidental repeated actions caused by button polling.
- Implement dead zones and stick normalization where necessary.
- Provide configurable sensitivity and inversion where useful.
- Do not hardcode all actions directly into separate UI components.

### Deliverables

- Central player-state API.
- Health, damage, stamina, inventory, and equipment foundations.
- A minimal HUD and inventory interface.
- Documented input mappings.
- Tests for key state transitions and item operations.

### Acceptance criteria

- Damage, healing, armor, death, and respawn behave consistently.
- Inventory quantities cannot become invalid.
- Weapon/tool switching reflects actual owned items.
- Gamepad controls continue to work after UI and gameplay changes.
- Gameplay systems function independently of the visual HUD.

---

## 6. Phase 3 — Wildlife, Animal AI, Taming, and Riding

**Goal:** Turn animals into consistent, reusable gameplay entities.

### 6.1 Shared animal framework

Each animal should have a stable ID and a data definition. Depending on the species, definitions may include:

- Display name and species/type.
- Maximum/current health.
- Movement speed and turning characteristics.
- Perception or detection range.
- Behavior profile.
- Aggression, fear, and defensive tendencies.
- Habitat or spawn rules.
- Rideable/tamable/pettable capabilities.
- Resource-drop table.
- Animation references.
- Mount offsets and riding configuration.
- Audio references, if available.

Do not duplicate the complete AI implementation for every species. Use shared behavior systems with species-specific configuration and behavior extensions.

### 6.2 Animal behavior states

Use an explicit state machine or an equivalent maintainable behavior system. Possible states:

- Idle.
- Wander.
- Investigate.
- Flee.
- Alert.
- Chase.
- Attack.
- Defend.
- Stunned or injured.
- Tamed/following.
- Mounted.
- Dead.

Not every animal needs every state. Select valid transitions by species and current conditions.

### 6.3 Animal-world interaction

- Animals must interact correctly with terrain and obstacles.
- Avoid movement through walls or major objects where collision is expected.
- Prevent animals from falling through the world.
- Use navigation/pathfinding appropriate to the current project scale.
- Do not update every distant animal at full frequency.
- Make animal spawning deterministic enough to avoid duplicates during chunk reloads.
- Separate animal identity and persistent state from temporary rendering objects.

### 6.4 Petting, feeding, and taming

- Define which species can be petted, fed, or tamed.
- Use proximity and a contextual interaction prompt.
- Prevent interactions through walls or at unrealistic distances.
- Consume food only when the feeding action succeeds.
- Define taming requirements and feedback.
- Track taming state persistently.
- Provide clear failure feedback if an interaction is unavailable.
- Avoid applying an interaction multiple times from a held button unless intentionally designed.

### 6.5 Riding

- Allow mounting only eligible animals.
- Define mount/dismount rules and input mappings.
- Align the player to the mount point and handle animation state transitions.
- Prevent the player and animal from fighting over movement ownership while mounted.
- Keep camera behavior comfortable and predictable.
- Ensure the mount cannot be accidentally duplicated.
- Handle damage, death, region transitions, and save/load while mounted.
- Decide whether the player is automatically dismounted under specific conditions.
- Support different mount speeds and movement capabilities by species.

### 6.6 Combat and drops

- Reuse the common damage system.
- Define animal attack range, cooldown, damage, and target selection.
- Ensure attacks cannot trigger repeatedly every rendered frame.
- Define the outcome when an animal dies.
- Generate resource drops from configured data.
- Prevent repeated harvesting or duplicate drops.
- Make hunting and animal aggression intentional and understandable.

### 6.7 Dragons and fantasy species

Keep dragons and ordinary wildlife on the same core framework wherever practical. Add specialized behavior only where needed, such as flight, unique movement, special attacks, or unique mounting rules. Do not make all ordinary animals depend on dragon-specific logic.

### Deliverables

- Shared animal definitions and runtime behavior.
- Configurable behavior states.
- Petting/feeding/taming interactions.
- Reliable mount/dismount and riding.
- Animal damage and resource drops.

### Acceptance criteria

- Multiple species behave differently through data/configuration.
- Animals do not duplicate or reset unexpectedly across region changes.
- Riding and dismounting work with keyboard and gamepad.
- Damage, death, and drops occur once per intended event.
- The system can support a new species without rewriting the whole animal framework.

---

## 7. Phase 4 — Gathering, Hunting, Fishing, and Resource Economy

**Goal:** Make exploration produce useful resources.

### 7.1 Resource definitions

Create data-driven definitions for resources such as:

- Wood.
- Fruit and edible plants.
- Meat.
- Fish.
- Other materials introduced by the world design.

Each definition should have a stable ID, display name, inventory behavior, and any required icon or asset reference.

### 7.2 Tree chopping

- Identify harvestable trees separately from purely decorative trees.
- Define required tool, durability/efficiency rules if needed, and harvest duration.
- Provide clear feedback while chopping.
- Spawn the correct quantity/type of wood.
- Track whether the tree has been harvested.
- Decide whether trees regrow and define the rules if so.
- Persist the state across region unload/reload and game sessions.
- Prevent repeated resource generation from repeated interaction events.

### 7.3 Fruit and plant gathering

- Define which plants are harvestable.
- Show a contextual prompt when the player is in range.
- Consume or update the plant's harvest state correctly.
- Provide the defined item quantities.
- Support regrowth only if explicitly implemented.
- Preserve plant state when regions unload.

### 7.4 Hunting

- Use existing animal health and combat systems.
- Define resource drops by species and context.
- Ensure drops are generated once.
- Make harvesting distinct from attacking or killing when appropriate.
- Avoid gratuitous gore; prioritize clear gameplay feedback.

### 7.5 Fishing

- Identify valid fishing locations and water surfaces.
- Define required equipment, such as a fishing rod, if the design calls for it.
- Implement a clear start/progress/success/failure interaction.
- Use time-based logic that is independent of frame rate.
- Add fish to inventory only after a successful catch.
- Provide feedback and allow cancellation.
- Keep the first version simple before introducing complex fish AI.

### 7.6 Resource interactions and feedback

- Show interaction prompts and progress feedback where useful.
- Provide collection notifications.
- Handle full inventory or missing tools clearly.
- Prevent overlapping interactions from producing duplicate items.
- Keep harvesting rules in gameplay systems, not UI components.

### Deliverables

- Resource/item definitions.
- Tree chopping and wood collection.
- Plant/fruit gathering.
- Hunting drops.
- A basic fishing loop.
- Resource-state persistence interfaces.

### Acceptance criteria

- Each resource source produces the correct items and quantities.
- The player can use the inventory system to carry gathered resources.
- Repeated interactions cannot duplicate resources.
- Harvested world objects remain in the correct state after unloading and reloading.
- Invalid actions provide clear feedback.

---

## 8. Phase 5 — Home, Storage, Cooking, Crafting, and Building

**Goal:** Complete the first end-to-end survival loop.

### 8.1 Home and session start

- Define the player's home and a valid spawn point inside it.
- Start a new session inside the home after initial setup.
- On later sessions, restore the saved state according to the save/load design.
- Provide a safe fallback spawn if the saved location is invalid.
- Prevent spawning inside geometry or outside the playable world.
- Keep home identity and ownership persistent.

### 8.2 Storage

- Create storage containers with stable IDs.
- Support item transfer between player inventory and storage.
- Validate item quantities and stack limits.
- Prevent duplication or loss during transfer.
- Keep storage content independent of the container's temporary scene object.
- Persist contents across sessions.

### 8.3 Cooking

- Add a cooking station or other clearly defined cooking interaction.
- Define recipes and required ingredients.
- Consume ingredients only when cooking starts or completes according to a consistent rule.
- Define cooking duration and completion state.
- Add the cooked item only once.
- Allow cancellation or interruption with predictable consequences.
- Connect food to hunger/health effects only through the survival system.

### 8.4 Crafting

Use data-driven recipes with:

- Stable recipe ID.
- Output item and quantity.
- Required ingredients and quantities.
- Optional tool or station requirement.
- Craft duration, if needed.
- Unlock condition, if applicable.

Requirements:

- Validate requirements before crafting.
- Consume ingredients atomically so partial failures do not destroy items.
- Prevent duplicate outputs.
- Provide clear error messages for missing ingredients or tools.
- Keep recipe logic separate from recipe UI.

### 8.5 Building and construction

- Define buildable objects and their costs.
- Show a placement preview where supported by the current renderer.
- Validate placement position, collision, terrain alignment, and build boundaries.
- Prevent structures from being placed inside blocked geometry.
- Deduct materials only when placement succeeds.
- Assign stable IDs to constructed objects.
- Persist object type, transform, and relevant state.
- Allow removal or relocation only under explicitly defined rules.
- Support house upgrades or expansions incrementally.

### 8.6 Survival loop

The first complete loop should be:

1. Start inside the home.
2. Leave the home.
3. Find and chop a harvestable tree.
4. Collect wood into the inventory.
5. Return to the home.
6. Use wood in a real crafting or building recipe.
7. Confirm the result persists after reloading.

A second loop can add food:

1. Gather fruit, hunt meat, or catch fish.
2. Return to a cooking station.
3. Cook a valid recipe.
4. Consume the result.
5. Confirm hunger/health changes according to the defined rules.

### Deliverables

- Home spawn and home identity.
- Storage containers.
- Crafting recipe system.
- Basic cooking.
- Basic construction and persistent placed structures.
- One complete, tested survival loop.

### Acceptance criteria

- The player can gather, store, craft/build, and cook without item duplication or loss.
- Home and placed structures persist.
- Invalid placements do not consume materials.
- The initial survival loop is playable from beginning to end.

---

## 9. Phase 6 — World Design, Biomes, and Exploration

**Goal:** Expand the world meaningfully without sacrificing performance or readability.

### 9.1 World areas

Build on the existing jungle and small city rather than replacing them without cause. Possible areas include:

- Starting home and nearby safe zone.
- Dense jungle.
- Rivers and lakes.
- Open clearings.
- Hills and mountains.
- Caves.
- Ruins or abandoned structures.
- Small settlements and city areas.
- Rare or dangerous regions.

Only add regions when the world-generation and streaming systems can support them.

### 9.2 Landmarks and points of interest

- Give important locations stable IDs.
- Add discoverable landmarks and optional exploration rewards.
- Avoid placing every point of interest directly along a straight path.
- Use terrain, lighting, silhouettes, sound, and environmental clues to guide exploration.
- Avoid relying exclusively on UI markers.
- Add a basic map only after the world has meaningful locations.

### 9.3 World map and discovery

- Show the player's location and known landmarks.
- Track discovered locations persistently.
- Make undiscovered areas visually distinct if a fog-of-war design is chosen.
- Support controller navigation.
- Avoid revealing hidden locations before the player discovers them unless intentional.

### 9.4 Content distribution

- Define animal habitats and spawn rules.
- Place resources according to biome and location.
- Avoid spawning too many entities at once.
- Coordinate spawn/despawn with streaming.
- Keep resource and animal state stable across chunk reloads.

### Deliverables

- Expanded, connected regions.
- A small number of polished landmarks.
- Resource and wildlife distribution rules.
- Basic discovery/map functionality if appropriate.

### Acceptance criteria

- New regions load and unload correctly.
- Exploration rewards discovery.
- Added content does not cause a major regression in performance.
- World locations and entities remain consistent across streaming transitions.

---

## 10. Phase 7 — Saving, Loading, and Progression

**Goal:** Make Tintin a persistent game rather than a disposable prototype.

> **Important architecture rule:** Design state persistence from the beginning. This phase completes and hardens it; it must not be the first time the team considers persistence.

### 10.1 State categories

Separate state into clear categories:

- Player state: position, stats, inventory, equipment, progression.
- Home state: ownership, upgrades, storage.
- Constructed world state: buildings and placed objects.
- Harvest state: trees, plants, resource nodes.
- Animal state: persistent/tamed animals and any world changes that must survive.
- Discovery state: landmarks and exploration progress.
- World metadata: save version, world seed if used, and schema version.

Not every ambient animal needs to be saved individually. Define which entities require persistence and which can be regenerated according to spawn rules.

### 10.2 Storage strategy

Inspect the existing architecture before selecting the implementation.

For a browser-only single-player prototype, browser storage may be enough initially. Choose localStorage only for small, simple state. Consider IndexedDB for larger structured saves or asset-adjacent data. Do not introduce a backend unless cloud saves, accounts, shared worlds, or another concrete requirement justifies it.

### 10.3 Save/load requirements

- Use a versioned save schema.
- Validate loaded data before applying it.
- Handle missing, corrupt, or outdated save data gracefully.
- Avoid partially applying a save when validation fails.
- Keep a safe fallback or recovery strategy.
- Save at intentional checkpoints and at appropriate intervals/events.
- Avoid excessive synchronous storage work in the render loop.
- Provide a visible save status if saving may take time.
- Make new-game, continue, and reset behavior explicit.
- Ensure reset actions require appropriate confirmation.
- Avoid persisting transient references to runtime objects.
- Persist stable IDs and serializable state instead.

### 10.4 Progression

- Add unlock flags and progression state only where they support gameplay.
- Introduce new tools, recipes, regions, or challenges incrementally.
- Avoid building a complex quest framework before the game has meaningful objectives.
- Keep progression rules data-driven where practical.

### Deliverables

- Versioned save/load system.
- Defined persistence rules per entity type.
- Recovery behavior for invalid saves.
- Persistent player and world state.
- Basic continue/new-game/reset flow.

### Acceptance criteria

- Refreshing or reopening the game restores the saved player state.
- Built structures and important world changes persist.
- Invalid or outdated saves do not crash the game.
- Loading a save does not duplicate entities or resources.
- A save schema version is documented and can be migrated intentionally.

---

## 11. Phase 8 — NPCs, Economy, and Expanded Combat

**Goal:** Introduce social and economic gameplay after the survival foundation is reliable.

### 11.1 NPCs

Start with a small set of NPC behaviors:

- Idle and wander.
- React to the player.
- Offer basic dialogue or interaction.
- Trade or provide a simple service.
- Become hostile only where intended.

Use shared NPC behavior and data definitions rather than custom code for every NPC.

### 11.2 Economy

- Introduce a money/currency state.
- Add buy/sell transactions.
- Validate prices, quantities, and inventory before committing transactions.
- Avoid negative balances or item duplication.
- Keep transactions atomic.
- Add a small number of shops or traders before expanding the economy.

### 11.3 Combat expansion

- Extend the existing weapon system.
- Add weapon categories and data-driven weapon definitions.
- Add ammunition, reload, cooldown, range, and damage rules as appropriate.
- Introduce enemy NPCs with readable behavior.
- Use the shared damage system.
- Prevent attacks from applying damage multiple times per frame.
- Provide feedback for hits, misses, reloads, and unavailable actions.

### 11.4 Crime or wanted systems

Only add these if they serve the desired game design:

- NPC witnesses and reactions.
- Crime event definitions.
- Wanted-level rules.
- Pursuit or law-enforcement response.
- Rules for losing a wanted level.

Keep this separate from core survival and wildlife logic.

### Deliverables

- Basic NPC framework.
- Small trading/economy loop.
- Expanded weapon and combat systems.
- Optional crime/wanted systems.

### Acceptance criteria

- NPC behavior is stable and does not overwhelm performance.
- Transactions cannot duplicate items or money.
- Weapons use consistent equipment and damage APIs.
- New NPC types can be added through reusable systems.

---

## 12. Phase 9 — Vehicles and Transportation

**Goal:** Add vehicles after the player, world, and interaction systems are stable.

Vehicles are intentionally deferred. Animal riding is the first transportation system.

### Tasks

- Define vehicle data and ownership.
- Implement enter/exit interactions.
- Implement movement and steering compatible with the existing physics/collision approach.
- Define braking, acceleration, turning, and camera behavior.
- Handle terrain collision and obstacles.
- Add garage storage and retrieval if required.
- Persist vehicle ownership and relevant state.
- Integrate vehicles with streaming so they are not unloaded while in use.
- Support keyboard and gamepad controls.
- Add vehicle damage only if it fits the gameplay scope.

### Acceptance criteria

- Entering and exiting vehicles is reliable.
- Vehicles do not pass through essential world geometry.
- Vehicle state survives the intended save/load lifecycle.
- Fast travel does not cause streaming failures.

---

## 13. Phase 10 — Optional Browser VR Through WebXR

**Goal:** Add an optional immersive mode without breaking desktop play.

### 13.1 Prerequisite audit

Before implementing VR, verify:

- The project uses a compatible Three.js/WebXR setup.
- Renderer and camera creation can support XR presentation.
- The game loop is compatible with the renderer's XR animation loop.
- Input actions are abstracted enough to accept headset/controller inputs.
- Player movement and camera ownership are clearly separated.
- The world can maintain acceptable performance at VR frame rates.
- The browser and headset support the required WebXR features.

Do not assume that a 3D Three.js game is already a VR game.

### 13.2 VR rendering

- Integrate WebXR using the existing framework's supported approach.
- Provide a clear user-initiated “Enter VR” action where required.
- Use XR-managed stereoscopic rendering rather than manually duplicating the scene.
- Respect headset pose and view configuration.
- Keep desktop rendering and controls working when XR is not active.
- Handle entering/exiting VR and session failures cleanly.
- Verify secure-context requirements for the deployment environment.

### 13.3 VR input and interaction

- Support headset orientation and position tracking as available.
- Map controller input into shared gameplay actions.
- Support interaction selection and confirmation.
- Define interaction reach and targeting rules.
- Provide an interaction approach for menus and inventory.
- Avoid requiring the mouse or keyboard for essential in-VR actions.
- Keep gamepad support available on desktop.

### 13.4 Locomotion and comfort

- Choose a default locomotion method intentionally.
- Evaluate smooth locomotion, snap turning, and comfort settings.
- Avoid forced camera motion where possible.
- Avoid camera shake that is uncomfortable in VR.
- Prevent the camera from clipping through the environment.
- Define mount camera behavior for animal riding.
- Make climbing, jumping, riding, and falling comfortable and predictable.
- Provide settings for turn sensitivity and other comfort options where practical.

### 13.5 VR performance

- Profile on actual target hardware.
- Reduce expensive shadows and post-processing if necessary.
- Use LOD, instancing, culling, and appropriate texture resolutions.
- Reduce unnecessary allocations and frame-time spikes.
- Do not assume desktop performance predicts VR performance.
- Avoid claiming VR compatibility without testing on a real compatible headset.

### 13.6 VR scope

Start with a limited technical prototype:

1. Load a small, stable part of the world.
2. Enter and exit VR.
3. Verify stereoscopic rendering and head tracking.
4. Move and look around.
5. Test controller interaction.
6. Test performance and comfort.
7. Expand to riding and other complex interactions only after the basic prototype is reliable.

### Deliverables

- Optional WebXR mode.
- Documented headset/browser compatibility.
- Shared input actions.
- Tested basic VR movement and interaction.
- Desktop/gamepad behavior preserved.

### Acceptance criteria

- A compatible headset can enter and exit VR successfully.
- Head tracking and stereoscopic rendering work.
- Basic controls function without a keyboard or mouse in VR.
- Desktop mode still works.
- Actual headset testing is documented; emulation alone is not treated as proof of compatibility.

---

## 14. Phase 11 — Polish, Quality, Optimization, and Release

**Goal:** Make the game reliable, coherent, and enjoyable to play.

### 14.1 Gameplay polish

- Improve player and animal animation transitions.
- Add clear feedback for interaction, damage, collection, crafting, and failure.
- Improve audio for environment, wildlife, tools, combat, and UI.
- Add environmental atmosphere where it fits the art direction.
- Improve collision and prevent common clipping or stuck states.
- Tune movement, animal speed, resource quantities, and crafting costs.

### 14.2 Interface polish

- Provide clear main menu and pause menu.
- Add new-game and continue actions.
- Make inventory, crafting, storage, and settings navigable with a gamepad.
- Provide readable prompts and feedback.
- Add control instructions.
- Support reasonable browser window sizes.
- Avoid intrusive UI and unnecessary visual complexity.

### 14.3 Technical quality

- Resolve console errors and important warnings.
- Test production builds, not just the development server.
- Test save/load recovery.
- Test streaming boundaries at different speeds.
- Test repeated mount/dismount and combat interactions.
- Check for duplicate event listeners and resource leaks.
- Verify cleanup of WebGL resources when objects are removed.
- Check browser refresh, tab backgrounding, and reconnect behavior.
- Test keyboard, mouse, and gamepad paths.
- Test VR only if the VR phase is implemented.

### 14.4 Release readiness

- Document supported browsers and minimum assumptions.
- Document controls and known limitations.
- Keep deployment configuration repeatable.
- Ensure asset paths and production routes work.
- Avoid shipping debug overlays unless deliberately included.
- Maintain a list of known issues.
- Create a release checklist and regression test route.

### Acceptance criteria

- The production build deploys and runs.
- Core gameplay loops can be completed without blocking bugs.
- Saving and loading work.
- The game remains controllable with the supported input methods.
- Performance is measured on the target devices.
- Known limitations are documented honestly.

---

## 15. Cross-Phase Architecture Requirements

These are ongoing requirements, not tasks to postpone until the final phase.

### 15.1 Separate gameplay logic from presentation

- Health logic must not depend on the HUD.
- Inventory rules must not depend on inventory-screen components.
- Animal AI must not depend on whether an animal's mesh is currently visible.
- Crafting rules must not depend on crafting UI.
- Saving must serialize stable game state, not runtime object references.
- Input should produce semantic actions that gameplay systems consume.

### 15.2 Prefer shared APIs

Examples of useful shared operations:

- Apply damage to an entity.
- Add/remove items from inventory.
- Interact with a world object.
- Mount/dismount an animal.
- Harvest a resource.
- Consume an item.
- Craft a recipe.
- Save or restore a world entity's state.

Adapt these concepts to the existing codebase rather than creating unnecessary abstraction layers.

### 15.3 Stable identity and persistence

- Assign stable IDs to persistent entities.
- Separate entity definitions from entity instances.
- Do not use scene-object references as persistent identity.
- Avoid generating duplicate IDs during chunk reloads.
- Define which entities are persistent, temporary, or procedurally regenerated.
- Version serialized data.

### 15.4 Time and simulation

- Use elapsed time for movement, stamina, cooldowns, cooking, and other time-dependent logic.
- Avoid frame-rate-dependent gameplay.
- Pause or adapt simulation appropriately when the game is paused or the browser tab is inactive.
- Be explicit about whether world simulation continues while the player is far away.

### 15.5 Content and asset management

- Reuse existing assets where appropriate.
- Verify asset licenses and usage permissions.
- Avoid adding large assets without considering download and memory costs.
- Use appropriate levels of detail and texture sizes.
- Provide fallbacks for failed noncritical asset loads.
- Do not silently replace existing assets with unrelated placeholders.

### 15.6 Input abstraction

Gameplay systems should consume actions such as:

- Move.
- Look.
- Jump.
- Sprint.
- Interact.
- Attack.
- Use item.
- Switch equipment.
- Open inventory.
- Pause.
- Mount/dismount.

Keyboard, mouse, gamepad, and later VR controllers should map to these actions. Avoid making game rules depend directly on a specific physical button.

---

## 16. Testing Strategy

Every phase must include tests appropriate to the existing stack.

### Automated checks where practical

- Linting and type checking.
- Production build.
- Unit tests for item operations, damage rules, crafting, and serialization.
- Tests for invalid quantities, missing recipes, insufficient resources, and invalid save data.
- Tests for duplicate event prevention and state transitions.
- Tests for save schema migration where applicable.

### Manual gameplay regression route

After meaningful changes, run this route:

1. Load the game.
2. Confirm the player spawns correctly.
3. Move with keyboard/mouse and gamepad.
4. Cross multiple world-region boundaries.
5. Interact with an animal.
6. Mount and dismount a rideable animal.
7. Take damage and verify health changes.
8. Use a weapon or tool.
9. Harvest a resource.
10. Check inventory quantities.
11. Return home.
12. Store resources.
13. Craft or build an item.
14. Save, refresh, and reload.
15. Confirm player and world state persist.
16. Repeat the route after streaming changes to detect regressions.

Skip steps for systems that have not yet been implemented, but do not mark their acceptance criteria as complete.

---

## 17. Definition of Done for Every Phase

A phase is complete only when:

- Its defined scope has been implemented.
- Existing related features still work.
- Acceptance criteria have been verified.
- Relevant automated checks pass.
- The production build succeeds, or any existing unrelated failure is documented clearly.
- No known critical regression remains.
- Performance claims have supporting measurements.
- Relevant documentation is updated.
- Remaining limitations and follow-up work are recorded.
- The roadmap status is updated accurately.

Use clear statuses:

- `NOT STARTED`
- `IN PROGRESS`
- `BLOCKED`
- `IMPLEMENTED — NEEDS TESTING`
- `VERIFIED COMPLETE`

Do not use `VERIFIED COMPLETE` for code that has merely been generated but not run.

---

## 18. Recommended Implementation Order

Use this order unless repository inspection reveals a concrete dependency that requires adjustment:

1. Phase 0 — Prototype audit and baseline.
2. Phase 1 — World performance and streaming.
3. Phase 2 — Player controller, stats, inventory, and equipment.
4. Phase 3 — Wildlife, taming, and riding.
5. Phase 4 — Gathering, hunting, fishing, and resources.
6. Phase 5 — Home, crafting, cooking, and building.
7. Phase 6 — World design and exploration expansion.
8. Phase 7 — Complete and harden saving, loading, and progression.
9. Phase 8 — NPCs, economy, and expanded combat.
10. Phase 9 — Vehicles.
11. Phase 10 — Optional WebXR/VR.
12. Phase 11 — Polish and release.

**Important:** Persistence interfaces, stable IDs, and serializable entity state must be considered from Phase 1 onward, even though Phase 7 hardens the full save/load experience.

---

## 19. Immediate Next Task for the AI Builder

Phases 0 and 1 are complete. Do not implement the roadmap in one operation.

1. Read Section 0 and `ROADMAP.md`.
2. Start Phase 2 (Section 5) with the **foundations**: a single serialisable player-state model, a semantic input-action layer, and the first inventory/item module with tests. Design stable IDs here, even though saving is Phase 7.
3. Preserve the current look, controls, animals, riding and weapon behaviour, and keep keyboard, mouse and gamepad working.

## 20. Product Success Criteria

Tintin is progressing successfully when:

- The existing prototype evolves without unnecessary rewrites.
- The player can explore a stable, streamed world.
- Wildlife behaves consistently and riding works.
- Gathering produces useful resources.
- Resources feed into crafting, cooking, and home building.
- Player and world progress persist.
- The game remains playable with a gamepad.
- Later systems reuse the same underlying architecture.
- Optional VR adds immersion without breaking the desktop game.
- Each phase results in a working, verifiable improvement rather than only more code.
