# Alto's Adventure 1.8.27 — Reverse-Engineering Report

Analysis of the shipped Android package to extract **mechanics, systems and
tuning structure** for reference while building Dune Glide. No assets (art,
audio, fonts) were extracted or copied; everything listed here is structural
knowledge observed in the binary, reimplemented in our own code.

## 1. Target identity & evidence

| Fact | Value | Source |
| --- | --- | --- |
| Package | `com.noodlecake.altosadventure` v1.8.27 (500193) | aapt on base APK |
| XAPK SHA-256 | `242e1b82…d4ba297` | REA `open_binary` |
| Base APK | `com.noodlecake.altosadventure.apk` (64.4 MB, 4 DEX) | REA `inspect_artifact` (`ev_76d2…7e594`) |
| Engine | **Unity 2022.3.62f2, IL2CPP, arm64** | `data.unity3d` header, `libil2cpp.so` |
| Native lib | `libil2cpp.so` 45.8 MB arm64, SHA-256 `cfaf7099…add6bfa` | REA `open_binary` |
| Metadata | `global-metadata.dat` v31 (sanity `0xFAB11BAF`) | parsed structure |

Method: REA archive inventory + custom IL2CPP metadata parser
(`parse-metadata.mjs` in the RE workdir). All 10,111 types / 69,965 methods /
16,328 string literals decoded; names validated. Game code lives in
`Assembly-CSharp` (global namespace) + `Noodle*` plugin assemblies.

> Note: JADX/Android provider wasn't needed — with IL2CPP the DEX side is only
> the Unity player + ads/billing wrappers, zero gameplay code.

## 2. Architecture map (Assembly-CSharp)

### Core loop / state
- `GameManager` — spawns manager prefabs (`managerPrefabs`), promos.
- `GameState` enum: `None, Intro, TitleScreen, Store, CharacterSelect,
  Gameplay, Pause, GameOver, LevelUp, EndOfRun, Debug, Capture, Menu,
  StoreEnd, CharacterSelectEnd, Equip, PhotoMode, RecordMenu`.
- `GameStateManager` — drives transitions (`<AllowExitToHome>`,
  `<ChangeGameStateAfterDelay>`, `<PlayerStart>`, `<SkipToGameplay>`).

### Player
The "player" is a composition, not one class:
- `Movement` (enum): `Snowboarding | Wingsuiting`.
- `PlayerState` enum: `sitting, boarding, grinding, jumping, flipping,
  freefalling, falling, wingsuit, resetting`.
- **`MovementSnowboard`** — the board physics controller. Fields read like a
  tuning sheet: `boostLevelsTotal, boostLerpSpeed, boostIncreaseLerp,
  boostDecreaseLerp, boostSpeed, activeBoost, passiveBoost, currentBoostLevel,
  iceSpeed, playerSpeed, fallMomentum, hillMomentum, sittingJumpStrength,
  rampJumpBoost, crashJumpDelay, jumpStartPosition, onRamp, waitingToJump,
  jumpedOnce, doubleJumped, doubleJumpTimer, flipDelay, proximityFlipHeight,
  flipCounter, bounceCount, crashBounceAngle, hoverHeight, hoverPhaseSpeed,
  hoverPhaseDepth, hoverLerpSpeed, detatchAngleBoarding, detatchAngleHover,
  rotateTerrainSpeedBoarding, rotateTerrainSpeedHover, grindKissDistance,
  grindBoostDistance, grindDistance, aboveGrindRail, currentGrindSurface,
  boardThrowStrength, maxBouncReflect, nudgeStrength, crashedInChasm,
  crashedWithHelmet`.
  Methods: `MovePlayer, GetNextPosition, SnapToTerrain, GetPlayerSpeed,
  ResetSpeed, GetHoverHeight, ReachedDetatchAngle, UpdateGrind, UpdateFlipCheck,
  GetTerrainAheadOfPoint, Jump, JumpOnFixedUpdate, Landing, LandingAngleCheck,
  IncreaseBoostLevel, DecreaseBoostLevel, UpdateBoostValues, Crash,
  OnTriggerEnter2D, OnTriggerStay2D, OnCollisionEnter2D`.
- **`MovementWingsuit`** — `drag, constantForwardSpeed, rotateSpeed,
  rotateAccel, legRotateSpeed, ponchoInflateSize, ponchoInflateSpeed,
  proximityHeight, proximityCheckInterval, proximityDistanceStat, proxUpBoost,
  proxUpRange, archwayStat` → wingsuit = constant forward speed + drag +
  rotation accel, with a **proximity scoring system** (flying close to terrain
  scores points, `proximityScoreEvent`).
- `CharacterStats` — per-character modifier table (see §4).
- `CharacterManager` — current character, sprite states, scarf/pickaxe
  positioning, unlock checks.
- Events: `JumpEvent, LandingEvent, LandingCheckEvent, BoostEvent,
  TrickPerformed, TrickLanded` (delegate classes).

### Terrain (procedural, 2D heightfield)
- **`TerrainManager`** — the chunk system: `terrainZones,
  currentTerrainZoneIndex, nextTerrainZoneInsertPosition, customSequences,
  sequenceSpacing, lastUsedSequenceCount, lastUsedSequences,
  autoTerrainTypeSwitch, autoInsertSequences, keypoints, terrainPoints`,
  with methods `TerrainUpdate, ChangeTerrainZone, InsertCustomSequence,
  InsertChasmSequence, InsertKeypoints, CalculateTerrainPoints, DrawMeshToPoint,
  DeleteUnusedTerrainData, InChasm, ChasmsAhead, GetTerrainHeight,
  GetTerrainBelow` (+ layer masks `terrainLayerMask, terrainGrindLayerMask`).
- `TerrainZone` — `name, enabled, length, hillTypes[], loopHills` (a biome =
  list of hill-type weights + whether hills loop).
- `HillType` — `name, enabled, size, scale, shape, segmentScale` (a chunk
  template with a shape curve).
- `TerrainInfo` — sample struct: `found, keypoint, height, angle, x, y, nx, ny,
  dx, dy` (position + normal + direction at a point).
- Chasms are first-class: dedicated insert path + camera/gameplay reactions.

### Score / tricks
- **`ScoreManager`** — `currentScore, finalScore, currentTrickPoints,
  currentChainMultiplier, scoreEvents[], genericFlip, genericGrind,
  genericBounce, genericSmash, wingsuitTrick, ignoreTricks,
  trickChainSounds`; methods `AddScore, GetEvent, TriggerScoreEvent,
  IncrementScoreEvent, BankChainScore, LoseChainScore` → **chain multiplier
  banking** model: tricks add points to an unbanked chain; landing banks it,
  crashing loses it.
- `ScoreEvent` — `name, id, type, pulse, eventMessage, scoreValue,
  scoreIncrementValue` (data-driven trick list; trick names are
  `[TrickAttribute]`-tagged).
- `ScoreMessage(/Manager)` — floating text popups.

### Elders (chase director)
- **`ElderManager`** — `eldersEnabled, elderActive, elderChasing, activeElder,
  difficultyLevels[], nextDifficultyIndex, elderSequences[], elderSpacing,
  firstElderInsert, nextElderInsert, checkInterval, nextChasm` → elders are
  *scheduled inserts* into the terrain stream with escalating difficulty.
- `Elder` — full chase AI: `minElderSpeed, lerpSpeed, slowApproachRange,
  maxEscapeSpeed, stopSpeed, offscreenSpeedMultiplier, targetPlayerDistance,
  holdWhileAirborne, holdbackDistance, holdbackAngleModifier, canLoseWithDistance,
  swipeDistance, swipeAngle, swipeSpeed` and states
  `Idle, Standing, Spooked, Sitting, Running, Jumping, Sliding, Collected,
  Animating`. Methods: `MoveElder, GetElderSpeedDiff, Escape, SwipeAtPlayer,
  ElderAlarmed/ElderEscaped (manager)`. The elder rubber-bands (speed lerp,
  holds back while you're airborne, can be escaped by distance).

### World dressing
- `Llamas` — ambient NPC with own state machine + terrain snapping +
  `chasmJumpStrength, steepTerrainJumpStrength` etc.
- `WeatherGrid` — particle weather as a **grid of emitter cells** around the
  camera (`weatherGrid, cameraPadding, particleLifetime, disableHidden`).
- `Coin`, `CoinMagnetEffect` (`attractDistance, magnetSpeed,
  magnetAcceleration`), `InvincibilityEffect`, `LlamaStampedeEffect` — powerups.

### Goals (progression)
- `GoalLevel` — `goals[]` with XML persistence; HUD shows 3 slots
  (`goalProgress1..3` in `GuiGameplay`).
- `CustomGoal` base: `isComplete, percentComplete, UpdateGoal`.
- Concrete: `GoalBackflipOverChasm, GoalBackflipOverElder, GoalBackflipOverRock,
  GoalBestDistance, GoalIceRockSmash, GoalUnlockWingsuit,
  GoalWingsuitRockBounce, …` — condition types enum: `PlayerState, Height,
  Speed, Distance, Rotation, OverChasm, Powerup, BoostLevel, ElderChasing,
  SonicBoom, ElderDistance, Character, ItemZone, TimeOfDay, RunTime, Weather,
  AboveGrindRail`.

### Camera
- **`CameraScript`** — `useDamp, dampTime, playerScreenPosition,
  heightZoomStrength, heightOffsetStrength, maxHeightOffset, fallingLerpModifier,
  chasmApproachStart/End/MaxHeight, chasmOffset, chasmSlowStart/End,
  chasmSlowMoScale, unlockFOV, fovRange, titleScreenFOV, pauseFov, chasmFov,
  trackingEase, trackingScale, pauseEase, cameraBounds[]` → look-ahead +
  height-based zoom, **slow-mo + FOV pull when approaching a chasm**, screen
  shake (`Shake`), visibility culling helpers for terrain.

### Meta
- `SaveManager` — profiles, prefs + Google Play cloud save, `ResetProgress`,
  best-profile merge.
- `CharacterStats` doubles as purchase/unlock metadata
  (`unlockLevelRelease, unlockLevelPress, gcAchievementName`).
- `SurfaceMaterial` enum: `None, Snow, Ice, Metal, Slate` — friction/speed per
  surface (`iceSpeed`, `previouslyOnIce` in MovementSnowboard).

## 3. Mechanics model (distilled)

1. **Terrain** = infinite heightfield built from `HillType` chunks grouped in
   `TerrainZone` biomes; generation is insert-based with "don't repeat recent
   sequences" (`SequenceRecentlyUsed`) + special chasm inserts. Ground contact
   is analytic sampling (height/angle at x), not polygon physics.
2. **Board physics** = speed along terrain with momentum (uphill/downhill),
   per-surface friction (snow/ice), detach when slope angle exceeds
   `detatchAngle`, airborne rotation (backflip) with dedicated drag, landing
   angle check, boost levels (1–…`boostLevelsTotal`) refilled by tricks/grinds.
3. **Tricks** = rotation count driven (`flipCounter`), named events with score
   values; chain multiplier banks on clean landing, lost on crash.
4. **Grind** = rails detected below (`aboveGrindRail`, `grindKissDistance`),
   boosts + chain while grinding.
5. **Wingsuit** (unlock via goal) = fixed forward speed + drag + pitch control;
   proximity to terrain scores; jumps from ramps launch into it.
6. **Elders** = scripted chasers inserted by difficulty director; catching you
   ends the run (like crash); you can out-run/out-fly them.
7. **Chasms** = gaps; approach triggers camera slow-mo + zoom; falling in =
   crash (unless `chasmRescues` from character stats / helmet items).
8. **Runs end** → `GameOver` screen with revive/double-coins video-ad offers
   (mobile monetization — not applicable to us), `EndOfRun` stats, goals
   progress up to 3 per level.

## 4. What Dune Glide adopted (status: shipped)

All of the following are implemented in Dune Glide (see README "Systems"),
as original code — mechanics structure and safe tuning ranges came from
this analysis, none of the game's assets or text did:

| Alto system | Our equivalent | Status |
| --- | --- | --- |
| `TerrainZone` + `HillType` weighted chunks | `src/game/world/chunks.ts` planner | ✅ (planner pre-dated; overlays added) |
| `PlayerState` machine (9 states) | `PlayerState` in `src/game/player/body.ts` | ✅ 7 states |
| Boost levels (12) + passive/active fill | `boostLevels`/`boostPassiveFill` params, segmented HUD | ✅ |
| `ScoreManager` banked chains | `src/game/player/tricks.ts` chain model | ✅ |
| Double jump (`canDoubleJump`, `doubleJumpStrength`) | `doubleJumpStrength` param | ✅ |
| Grind (grindKiss/grindBoost/grindDistance) | `Rail` chunks + grind state | ✅ |
| `SurfaceMaterial` friction (ice analog) | salt pans (`saltSpeedMult` 1.4) | ✅ |
| Chasm slow-mo camera (`chasmSlowMoScale` 0.2) | `chasmTimeScale` (min 0.35) | ✅ |
| Elder chase director (6 tiers, hold-back, catch-up) | `src/game/world/storm.ts` "The Wall" | ✅ |
| Goal levels (3 goals, `goal_L_N` pattern, ~50 levels) | `src/game/world/goals.ts` ladder | ✅ (open-ended) |
| `CoinMagnetEffect` / wingsuit / `WeatherGrid` | — | ⬜ future work |

## 6. Decoded tuning values (release scene data)

Extracted from serialized MonoBehaviour data in `data.unity3d` (UnityPy +
hand-mapped layouts; header omitted, values are designer-set defaults).
Decoder scripts: `extract-mbs.py`, `decode-values.py` in the RE workdir.
Confidence: high for values cross-validated across instances or matching
sane physics ranges; medium (…) where the field-name mapping is inferred.

### CharacterStats (per character, `level1` scene)

| Field | Maya | Izel |
| --- | --- | --- |
| unlockLevel (release / press builds) | 11 / 3 | 31 / 5 |
| spriteScale | 1.0 | 1.0 |
| scarfThickness | 0.1 | 0.1 |
| speedLimit | 0 (unlimited) | 0 |
| accelerationSpeed | 1.0 | 1.0 |
| **hillMomentumFactor** | 0.6 | 0.6 |
| sonicBoomTime | 1.0 | 1.0 |
| **boostTime** | 20 s | 20 s |
| boostOffset | 60 | 68 |
| **gravityScale** | 1.0 | 0.9 |
| **jumpStrength** | 0.9 | 1.0 |
| sittingJumpStrength | 0.8 | 1.0 |
| doubleJumpStrength | 0.2 | 1.0 |
| **backflipSpeed** | 2.0 | 3.0 |
| unwindSpeed | 0.0 | 0.2 |
| landingTargetSize | 0.85 | 1.0 |
| defaultAirDrag / flippingAirDrag | 16 / 20 | 16 / 20 |
| chasmRescues | ~5 | ~5 |
| bodyStateFrameIndices | [4,0,1,2,3,9,6,8,5,7,10] (11 states) | same |
| headStateFrameIndices | [0..4] (5) | same |

Alto/Tupa/Paz/Felipe partially decoded (name, sprites `player_*`,
`badge_*`, achievements `player<Pet>`, unlock levels Felipe 41/6; stats tail
failed on a sex-string alignment quirk — likely same table shape).
Character sprite layout: 11 body states × head offsets per state.

### MovementSnowboard (scene defaults, `level1`)

| Field | Value | Note |
| --- | --- | --- |
| boostLevelsTotal | **12** | boost meter has 12 levels |
| boostLerpSpeed | 10 | |
| boostIncreaseLerp / boostDecreaseLerp | 100 / 5 | fills fast, drains slow |
| activeBoost / passiveBoost | 0.4 / 1.0 | passive fill vs trick fill |
| iceSpeed | ~1.4 | ≈ +40 % speed on ice |
| collisionDelay / bounceCollisionDelay | 0.2 / 0.2 s | |
| landingDetatchDelay | 0.08 s | |
| crashBounceAngle | 40° | |
| hoverHeight | 1.6 | ground-hover raycast distance |
| hoverPhaseSpeed / hoverPhaseDepth / hoverLerpSpeed | 2.0 / 1.0 / 3.0 | hover bob |
| detatchAngleBoarding / detatchAngleHover | ~20° / ~5° | launch angle thresholds (…) |
| proximityFlipHeight | ~8.5 (…) | |
| boardThrowTorque | ~4 (…) | board-crash ragdoll torque |
| maxBouncReflect | ~60 (…) | |
| grind parameters | present in tail (…) | grindKiss/grindBoost/grindDistance |

### MovementWingsuit (scene defaults)

| Field | Value |
| --- | --- |
| drag | 0.3 |
| constantForwardSpeed | 2.0 |
| rotateSpeed | 250 °/s |
| rotateAccel | 10 |
| legRotateSpeed | 4.0 |
| ponchoInflateSize / Speed | 1.0 / 5.0 |
| **proximityHeight** | 6.0 |
| proximityCheckInterval | 2.0 |
| proxUpBoost / proxUpRange | (tail, …) |

### Camera (chasm feel parameters)

`useDamp=false`, dampTime=5.0, listenerDepth=3.0, heightZoomStrength=0.5,
heightOffsetStrength=16.0, maxHeightOffset=5.0, timeLerpSpeed=1.0,
fovLerpSpeed=0.5, offsetLerpSpeed=0.5, fallingLerpModifier=1.0,
chasmApproachStart=10.0, chasmApproachEnd≈-50, chasmOffset=(0,10),
chasmSlow range 20→0.2, chasmSlowMoScale≈0.2 (field mapping in the chasm
block partially inferred; order of slow-mo fields uncertain).

### ElderManager (chase difficulty director)

6 difficulty tiers (`ElderSequence`-like inline structs), each =
{name, speed, spacing, chaseDistance, ×2 misc, tint Color, popup Color}:

| Tier | Name | speed | spacing | distance |
| --- | --- | --- | --- | --- |
| 0 | Red Elder | 3.5 | 50 | 1000 |
| 1 | Green Elder | 4.5 | 55 | 1200 |
| 2–5 | (Blue/Purple/…, 4 more) | … | … | … |

Plus `checkInterval`, insert spacing and chasm-coupled scheduling fields
after the tier array (partially mapped).

### CoinMagnetEffect

`attractDistance=5.0`, magnetSpeedRandomiser=2.0, magnetSpeedMax=10.0,
magnetAcceleration ramps speed from 0 (runtime), pulse tint Color(0.94, 0.49,
0.24, 1.0), pulse=true. Base class carries a display label ("Coin Magnet").

### Progression structure (GoalManager, 70 KB)

Goal database is embedded as label + id strings: **3 goals per level,
`goal_<level>_<1..3>` ids, ~50 levels** (770 strings incl. UI text).
Pattern: early goals are single mechanics checks (first backflip, first grind,
first chasm jump, 500 m run), mid-game adds item powerups and combo targets,
later goals combine mechanics (double backflips, elder escapes, backflip off
a grind, multi-item runs) and cumulative totals. The same Goal* class set
maps each description to a condition (see §2 Goals).

## 7. Reproducing / extending this analysis

- RE workdir (temp): `parse-metadata.mjs` (metadata v31 → types.json,
  literals.txt), `extract-mbs.py` + `decode-values.py` + `hexview.py`
  (raw MonoBehaviour decode), dumps in `dump/`, `ser/`, `ser2/`.
- REA session: XAPK + `libil2cpp.so` were opened via `open_binary`;
  evidence ids in §1. Closed after analysis.
- For deeper work: hard-coded method constants require IL2CPP
  method→address mapping (Il2CppDumper-style codegen table parsing) plus a
  native decompiler — not attempted; serialized values above cover most
  tuning needs.

## 8. Evidence & limits

- All facts above are **static observations**: class/field/method names and
  string literals from `global-metadata.dat` (metadata v31), engine identity
  from asset headers, and numeric values from serialized MonoBehaviour data
  in `data.unity3d`. Confidence: observed (names, raw bytes), derived
  (decoded values), inferred (behavior distilled from structure; fields
  marked "(…)").
- No runtime observation was performed; no art/audio/asset files were
  extracted or copied — the goal database and tuning values are recorded
  as factual structure only, for an original reimplementation.

