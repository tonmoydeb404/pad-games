/** Async world build: loads assets and assembles every system. */
import { initPhysics, PhysicsWorld, PropStreamer, TerrainStreamer } from "../../../physics/physics";
import { loadJungleCharacter } from "../../../player/character";
import { loadAllGunModels } from "../../../weapons/gun-models";
import { CitySystem, type CityHost } from "../../../world/city";
import { loadJeepProps } from "../../assets";
import { mulberry } from "../../noise";
import { HUD_CSS } from "../config/hud-css";
import { SAMPLES, GRAVITY } from "../config/world-constants";
import type { JeepEngine } from "../jeep-engine";

/** Progressive world build; reports progress to the shell. */
export async function build(this: JeepEngine): Promise<void> {
  const step = async (pct: number, label: string) => {
    this.onProgress?.(pct, label);
    await new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    if (this.destroyed) throw new Error("build cancelled");
  };

  this.root = document.createElement("div");
  this.root.className = "jj-root";
  this.styleEl = document.createElement("style");
  this.styleEl.textContent = HUD_CSS;
  this.root.appendChild(this.styleEl);
  this.container.appendChild(this.root);

  await step(6, "Creating renderer…");
  this.initRenderer();
  await initPhysics(); // Rapier WASM
  if (this.destroyed) throw new Error("build cancelled");
  this.pw = new PhysicsWorld(GRAVITY);
  this.propStream = new PropStreamer(this.pw);
  await step(18, "Shaping jungle terrain…");
  this.buildTerrain();
  if (this.heightGrid) this.terrainStream = new TerrainStreamer(this.pw, this.heightGrid, 32, 1);
  await step(38, "Carving the stream…");
  this.buildWater();
  this.buildBridge();
  await step(43, "Fetching CC0 jungle props…");
  this.props = await loadJeepProps();
  await step(48, "Planting the jungle…");
  this.buildJungle();
  await step(62, "Laying the jungle railway…");
  await this.buildRailway();
  await step(76, "Raising Port Marin…");
  await this.buildCity();
  await step(82, "Placing trail markers…");
  this.buildSigns();
  this.buildLogs(mulberry(99));
  await step(86, "Painting the light…");
  this.buildLightShafts();
  this.buildFireflies();
  await step(88, "Releasing the wildlife…");
  await this.buildAnimals();
  await step(88, "Assembling the jeep…");
  this.buildJeep();
  await step(92, "Waking the explorer…");
  this.explorer = await loadJungleCharacter(this.skin);
  this.gunModels = await loadAllGunModels();
  if (this.explorer) {
    this.scene!.add(this.explorer.root);
    this.explorer.root.visible = false;
    this.onFoot = true; // the session opens on foot — open world
  }
  await step(96, "Warming up particles…");
  this.initParticles();
  void this.initDebris();
  this.buildHud();
  this.resetVehicle(Math.floor(SAMPLES * 0.01));
  this.v.lap = 0;
  this.v.prevT = 0.01;
  this.setCameraMode(0);
  // Dev/tooling hook: spawn straight into Port Marin (?warp=road|crossing|city|aerial)
  const warp = this.readWarpParam();
  if (warp) {
    this.onFoot = false;
    if (this.explorer) this.explorer.root.visible = false;
    this.applyWarp(warp);
    if (warp === "aerial") {
      this.setCameraMode(2);
      this.camState.orbitPitch = 1.15;
      this.camState.orbitDist = 85;
      this.camState.orbitYaw = 0.6;
    }
  }
  // Frame the opening shot: behind the explorer on foot, else behind the jeep.
  if (this.onFoot) {
    this.spawnExplorerBesideCar();
    const fc = this.footCam;
    const cp = Math.cos(fc.pitch);
    this.camV1.set(Math.sin(fc.yaw) * cp * fc.dist, 1.5 + Math.sin(fc.pitch) * fc.dist, Math.cos(fc.yaw) * cp * fc.dist);
    this.camV1.add(this.foot.pos);
    this.safeAboveTerrain(this.camV1, 0.4);
    this.camState.pos.copy(this.camV1);
    this.camV2.set(this.foot.pos.x, this.foot.pos.y + 1.45, this.foot.pos.z);
    this.camState.look.copy(this.camV2);
  } else {
    const yq = this.camQ.setFromEuler(this.camE.set(0, this.v.yaw, 0, "YXZ"));
    this.camV1.set(0, 2.9, 8.2).applyQuaternion(yq).add(this.v.pos);
    this.safeAboveTerrain(this.camV1, 1.4);
    this.camState.pos.copy(this.camV1);
    this.camV2.copy(this.v.pos);
    this.camV2.y += 0.85;
    this.camState.look.copy(this.camV2);
  }
  if (this.camera) {
    this.camera.position.copy(this.camState.pos);
    this.camera.lookAt(this.camState.look);
  }
  // one warm-up render to compile shaders
  if (this.composer && this.renderer && this.camera) this.composer.render();
  else if (this.renderer && this.scene && this.camera) this.renderer.render(this.scene, this.camera);
  this.onProgress?.(100, "Ready.");
  this.startTitleLoop();
  this.onReady?.();
}

/**
 * Raise Port Marin: load the two Kenney City Kits and instance the town
 * (streets, houses, yards, street furniture) onto the shelf the terrain
 * carve prepared. Buildings register streamed box colliders, so the jeep
 * — and the wildlife — bounce off the architecture. A failed pack load
 * leaves a bare but fully drivable shelf and road bed.
 */
export async function buildCity(this: JeepEngine): Promise<void> {
  const scene = this.scene;
  if (!scene || this.destroyed) return;
  const host: CityHost = {
    scene,
    addSolid: (x, z, hx, hy, hz, rotY) => {
      const y0 = this.groundHeight(x, z);
      this.propStream?.add({ shape: { kind: "box", hx, hy, hz }, x, y: y0 + hy, z, rotY, e: 0.12 });
      this.colliders.push({ x, z, r: Math.hypot(hx, hz) });
    },
  };
  const system = new CitySystem(this.city);
  await system.load();
  if (this.destroyed) {
    system.destroy();
    return;
  }
  system.spawn(host);
  this.citySystem = system;
}
