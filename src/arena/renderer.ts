/**
 * Dungeon Blaster renderer — Kenney dungeon tiles + blaster viewmodels +
 * fully animated character rigs, with the original box-art as fallback.
 *
 * Static tiles render as one InstancedMesh per model; players are
 * SkeletonUtils clones driven by AnimationMixers; props/grenades/pickups
 * interpolate server snapshots. Debris/fragments are client-only cosmetic
 * bodies (a tiny custom integrator — no physics engine on the client).
 */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { clone as skeletonClone } from "three/addons/utils/SkeletonUtils.js";
import {
  EYE_HEIGHT,
  MAP_BOXES,
  MAP_DECOR,
  MAP_PICKUPS,
  MAP_PROPS,
  MAP_TILES,
  PLAYER_HEIGHT,
  STAIRS_MODEL_HIGH_TOWARD,
  WEAPONS,
  type PlayerSnapshot,
  type PropSnapshot,
  type Vec3,
} from "@pad/arena-shared";
import { instance, loadArenaAssets, type ArenaAssets } from "./assets";

const CHAR_SCALE = PLAYER_HEIGHT / 0.76;

interface PlayerView {
  group: THREE.Group;
  rig: THREE.Group | null;
  mixer: THREE.AnimationMixer | null;
  actions: Record<string, THREE.AnimationAction>;
  current: string;
  head: THREE.Object3D | null;
  gun: THREE.Object3D | null;
  label: THREE.Sprite;
  name: string;
  /** cosmetic death fall */
  deathT: number;
  deathImpulse: { x: number; y: number; z: number };
  speed: number;
}

interface PropView {
  group: THREE.Group;
  target: THREE.Vector3;
  yaw: number;
  yawTarget: number;
  first: boolean;
}

interface Debris {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  maxLife: number;
}

function makeLabel(name: string): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.font = "bold 34px monospace";
  g.textAlign = "center";
  g.fillStyle = "rgba(0,0,0,0.5)";
  g.fillRect(0, 8, 256, 48);
  g.fillStyle = "#fff";
  g.fillText(name, 128, 44);
  const tex = new THREE.CanvasTexture(c);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(2, 0.5, 1);
  sprite.renderOrder = 10;
  return sprite;
}

/** Flatten a loaded model into (merged geometry, material) for instancing. */
function bake(scene: THREE.Object3D): { geometry: THREE.BufferGeometry; material: THREE.Material } | null {
  scene.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  let material: THREE.Material | null = null;
  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    for (const key of Object.keys(g.attributes)) {
      if (key !== "position" && key !== "normal" && key !== "uv") g.deleteAttribute(key);
    }
    parts.push(g);
    material ??= o.material as THREE.Material;
  });
  if (!parts.length || !material) return null;
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshLambertMaterial) {
    material = material.clone();
    material.vertexColors = false;
  }
  return { geometry: merged, material };
}

export class ArenaRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly minimap: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(80, 1, 0.05, 200);
  private views = new Map<string, PlayerView>();
  private tracers: { line: THREE.Line; life: number }[] = [];
  private debris: Debris[] = [];
  private propViews = new Map<number, PropView>();
  private grenadeViews = new Map<number, THREE.Object3D>();
  private pickupViews: THREE.Group[] = [];
  private coinViews: THREE.Group[] = [];
  private gun = new THREE.Group();
  private flash: THREE.Mesh;
  private flashLight: THREE.PointLight;
  private flashT = 0;
  private recoil = 0;
  private reloadT = 0;
  private bobT = 0;
  private swayX = 0;
  private swayY = 0;
  private weaponId = 0;
  private ro: ResizeObserver;
  private disposables: { dispose(): void }[] = [];
  private assets: ArenaAssets | null = null;
  private matCache = new Map<number, THREE.Material>();
  private mapCanvas: HTMLCanvasElement | null = null;
  /** player positions for the minimap (world coords) */
  private minimapDots: { x: number; z: number; self: boolean; color: number }[] = [];
  private shake = 0;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.canvas = this.renderer.domElement;
    this.canvas.className = "block h-full w-full touch-none select-none";
    container.appendChild(this.canvas);

    // minimap overlay
    this.minimap = document.createElement("canvas");
    this.minimap.width = 176;
    this.minimap.height = 176;
    this.minimap.className = "pointer-events-none absolute right-3 top-14 h-32 w-32 rounded-lg border border-amber-100/15 opacity-80";
    container.appendChild(this.minimap);

    const dusk = new THREE.Color(0x0d0a14);
    this.scene.background = dusk;
    this.scene.fog = new THREE.Fog(dusk, 18, 90);
    this.scene.add(new THREE.HemisphereLight(0x8a7fb0, 0x1a1410, 0.55));
    const moon = new THREE.DirectionalLight(0xb0a8d8, 0.5);
    moon.position.set(12, 30, -8);
    this.scene.add(moon);

    this.camera.rotation.order = "YXZ";
    this.scene.add(this.camera);

    // placeholder viewmodel (replaced by the blaster GLB once loaded)
    const gunMat = new THREE.MeshLambertMaterial({ color: 0x2b2f3a, flatShading: true });
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.55), gunMat);
    barrel.position.set(0, 0, -0.25);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.08), gunMat);
    grip.position.set(0, -0.11, -0.05);
    this.flash = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), new THREE.MeshBasicMaterial({ color: 0xffd25a }));
    this.flash.position.set(0, 0, -0.58);
    this.flash.visible = false;
    this.gun.add(barrel, grip, this.flash);
    this.gun.position.set(0.22, -0.2, -0.4);
    this.camera.add(this.gun);
    this.flashLight = new THREE.PointLight(0xffc46a, 0, 6);
    this.flashLight.position.set(0, 0, -0.5);
    this.camera.add(this.flashLight);
    this.disposables.push(gunMat, barrel.geometry, grip.geometry, this.flash.geometry);

    // box-art fallback world (replaced when assets arrive)
    this.buildFallbackMap();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
  }

  /** Load the Kenney packs and swap the fallback world for the real one. */
  async loadAssets(onProgress?: (frac: number) => void): Promise<boolean> {
    this.assets = await loadArenaAssets(onProgress);
    if (!this.assets) return false;
    this.buildWorld();
    this.buildPickups();
    this.buildProps();
    return true;
  }

  private mat(color: number): THREE.Material {
    let m = this.matCache.get(color);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color, flatShading: true });
      this.matCache.set(color, m);
    }
    return m;
  }

  private fallback: THREE.Group | null = null;

  /** Coloured-cuboid fallback that keeps the game playable without assets. */
  private buildFallbackMap(): void {
    const group = new THREE.Group();
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x1b2030 });
    this.disposables.push(edgeMat);
    for (const b of MAP_BOXES) {
      const size = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]] as const;
      const geo = new THREE.BoxGeometry(...size);
      const mesh = new THREE.Mesh(geo, this.mat(b.color));
      mesh.position.set(b.min[0] + size[0] / 2, b.min[1] + size[1] / 2, b.min[2] + size[2] / 2);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
      mesh.add(edges);
      group.add(mesh);
      this.disposables.push(geo, edges.geometry);
    }
    this.scene.add(group);
    this.fallback = group;
  }

  private clearFallback(): void {
    if (this.fallback) {
      this.scene.remove(this.fallback);
      this.fallback = null;
    }
    this.views.clear();
    this.propViews.clear();
  }

  private buildWorld(): void {
    if (!this.assets) return;
    this.clearFallback();
    const assets = this.assets;
    const baked = new Map<string, { geometry: THREE.BufferGeometry; material: THREE.Material }>();
    const groups = new Map<string, typeof MAP_TILES>();
    for (const tile of MAP_TILES) {
      let arr = groups.get(tile.model);
      if (!arr) groups.set(tile.model, (arr = []));
      arr.push(tile);
    }
    for (const [model, tiles] of groups) {
      const loaded = assets.dungeon.get(model);
      if (!loaded) continue;
      let b = baked.get(model);
      if (!b) {
        b = bake(loaded.scene) as { geometry: THREE.BufferGeometry; material: THREE.Material };
        baked.set(model, b);
        this.disposables.push(b.geometry, b.material);
      }
      const inst = new THREE.InstancedMesh(b.geometry, b.material, tiles.length);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      tiles.forEach((t, i) => {
        let ry = t.ry;
        if (model === "stairs") ry += STAIRS_MODEL_HIGH_TOWARD > 0 ? Math.PI : 0;
        q.setFromAxisAngle(up, ry);
        m.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(t.sx, t.sy, t.sz));
        inst.setMatrixAt(i, m);
      });
      inst.instanceMatrix.needsUpdate = true;
      this.scene.add(inst);
    }

    // decor: banners (with torch light), traps, spinning coins
    let lights = 0;
    for (const d of MAP_DECOR) {
      const loaded = assets.dungeon.get(d.model);
      if (!loaded) continue;
      const g = instance(loaded);
      g.position.set(d.x, d.y, d.z);
      g.rotation.y = d.ry;
      g.scale.setScalar(2);
      this.scene.add(g);
      if (d.model === "coin") this.coinViews.push(g);
      if (d.light && lights < 8) {
        const l = new THREE.PointLight(0xffa04a, 14, 16, 1.6);
        l.position.set(d.x, d.y + 0.4, d.z);
        this.scene.add(l);
        lights++;
      }
      if (d.model === "trap") {
        // subtle ember glow so the spikes read as dangerous
        const l = new THREE.PointLight(0xd04030, 3, 4, 2);
        l.position.set(d.x, 0.4, d.z);
        this.scene.add(l);
      }
    }

    // minimap base
    this.renderMinimapBase();
  }

  private buildPickups(): void {
    if (!this.assets) return;
    for (const def of MAP_PICKUPS) {
      const g = new THREE.Group();
      let model: string | null = null;
      if (def.kind === "weapon" && def.weapon !== undefined) model = WEAPONS[def.weapon].modelId;
      else if (def.kind === "health") model = "potion";
      else if (def.kind === "ammo") model = "clip-large";
      else if (def.kind === "grenade") model = "grenade-a";
      else if (def.kind === "armor") model = null; // shield is dungeon-pack: not shipped; use a crate
      const loaded = model ? this.assets.blasters.get(model) ?? this.assets.dungeon.get(model) : null;
      if (loaded) {
        const m = instance(loaded);
        const box = new THREE.Box3().setFromObject(m);
        const size = box.getSize(new THREE.Vector3());
        const s = 0.5 / Math.max(size.x, size.y, size.z, 0.01);
        m.scale.setScalar(s);
        m.position.y = -box.getSize(new THREE.Vector3()).length() * 0;
        g.add(m);
      } else {
        const fallback = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), this.mat(0xffd25a));
        g.add(fallback);
        this.disposables.push(fallback.geometry);
      }
      // glow so pickups read at distance
      const halo = new THREE.PointLight(0x7fd0ff, 2.2, 3.2, 2);
      g.add(halo);
      g.position.set(def.x, def.y, def.z);
      this.scene.add(g);
      this.pickupViews.push(g);
    }
  }

  private buildProps(): void {
    if (!this.assets) return;
    for (let i = 0; i < MAP_PROPS.length; i++) {
      const def = MAP_PROPS[i];
      const pack = def.kind === "crate" || def.kind === "target" ? this.assets.blasters : this.assets.dungeon;
      const loaded = pack.get(def.model);
      if (!loaded) continue;
      const g = instance(loaded);
      g.scale.setScalar(def.scale);
      g.position.set(def.x, def.y, def.z);
      g.rotation.y = def.ry;
      this.scene.add(g);
      this.propViews.set(i, {
        group: g,
        target: new THREE.Vector3(def.x, def.y + (def.kind === "crate" ? 0.37 : def.kind === "barrel" ? 0.41 : def.kind === "table" ? 0.28 : def.kind === "chest" ? 0.35 : def.kind === "chair" ? 0.42 : def.kind === "pot" ? 0.3 : 0.34), def.z),
        yaw: def.ry,
        yawTarget: def.ry,
        first: true,
      });
    }
  }

  /* ------------------------- networked state ------------------------- */

  syncProps(props: PropSnapshot[], gone: number[]): void {
    const goneSet = new Set(gone);
    for (const p of props) {
      const v = this.propViews.get(p.i);
      if (!v) continue;
      v.group.visible = !goneSet.has(p.i);
      if (v.first) {
        v.group.position.set(p.x, p.y, p.z);
        v.yaw = v.yawTarget = p.ry;
        v.first = false;
      } else {
        v.target.set(p.x, p.y, p.z);
        v.yawTarget = p.ry;
      }
    }
    for (const i of gone) {
      const v = this.propViews.get(i);
      if (v) v.group.visible = false;
    }
  }

  syncGrenades(list: { id: number; x: number; y: number; z: number }[]): void {
    if (!this.assets) return;
    const seen = new Set<number>();
    for (const g of list) {
      seen.add(g.id);
      let v = this.grenadeViews.get(g.id);
      if (!v) {
        const loaded = this.assets.blasters.get("grenade-a");
        v = loaded ? instance(loaded) : new THREE.Mesh(new THREE.SphereGeometry(0.12), this.mat(0x40543a));
        v.scale.setScalar(loaded ? 1.4 : 1);
        this.scene.add(v);
        this.grenadeViews.set(g.id, v);
      }
      v.position.lerp(new THREE.Vector3(g.x, g.y, g.z), 0.45);
      v.rotation.x += 0.2;
      v.rotation.z += 0.15;
    }
    for (const [id, v] of this.grenadeViews) {
      if (!seen.has(id)) {
        this.scene.remove(v);
        this.grenadeViews.delete(id);
      }
    }
  }

  syncPickupsTaken(taken: number[]): void {
    const set = new Set(taken);
    for (let i = 0; i < this.pickupViews.length; i++) {
      this.pickupViews[i].visible = !set.has(i);
    }
  }

  /* ------------------------- players ------------------------- */

  /** Create/update/remove remote player meshes. `selfId` is never drawn in 3rd person. */
  syncPlayers(players: PlayerSnapshot[], selfId: string): void {
    const seen = new Set<string>();
    this.minimapDots = [];
    for (const p of players) {
      const isSelf = p.id === selfId;
      this.minimapDots.push({ x: p.x, z: p.z, self: isSelf, color: p.color });
      if (isSelf) continue;
      seen.add(p.id);
      let v = this.views.get(p.id);
      if (!v) {
        v = this.createView(p);
        this.views.set(p.id, v);
      }
      v.group.visible = p.alive || v.deathT > 0;
      if (p.alive) {
        v.deathT = 0;
        v.group.position.set(p.x, p.y, p.z);
        v.group.rotation.set(0, p.yaw, 0);
        if (v.head) v.head.rotation.x = -p.pitch * 0.6;
      } else if (v.deathT > 0 && v.deathT < 1.4) {
        v.deathT += 1 / 60;
        const k = Math.min(1, v.deathT / 0.5);
        v.group.rotation.x = -k * Math.PI * 0.48;
        v.group.position.y = Math.max(0, v.group.position.y - 0.02);
      }
      // animation state
      if (v.mixer) {
        let want = "idle";
        if (!p.alive) want = "die";
        else if (!p.og) want = p.vy > 0.5 ? "jump" : "fall";
        else if (v.speed > 4.5) want = "sprint";
        else if (v.speed > 0.6) want = "walk";
        this.playClip(v, want, !p.alive);
      }
    }
    for (const [id, v] of this.views) {
      if (seen.has(id)) continue;
      this.removeView(id, v);
    }
  }

  private playClip(v: PlayerView, name: string, once = false): void {
    if (!v.mixer || v.current === name) return;
    const next = v.actions[name];
    if (!next) return;
    const prev = v.actions[v.current];
    next.enabled = true;
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once;
    if (prev && prev.isRunning()) next.crossFadeFrom(prev, 0.18, false);
    next.play();
    v.current = name;
  }

  /** Rag-doll-lite: tip the victim over along the killing impulse, then fade. */
  ragdoll(victimId: string, impulse: { x: number; y: number; z: number }): void {
    const v = this.views.get(victimId);
    if (!v) return;
    v.deathT = 0.001;
    v.deathImpulse = impulse;
    // face the fall direction
    v.group.rotation.y = Math.atan2(impulse.x, impulse.z);
    v.group.visible = true;
  }

  private createView(p: PlayerSnapshot): PlayerView {
    const group = new THREE.Group();
    let rig: THREE.Group | null = null;
    let mixer: THREE.AnimationMixer | null = null;
    const actions: Record<string, THREE.AnimationAction> = {};
    let head: THREE.Object3D | null = null;
    let gun: THREE.Object3D | null = null;

    const skin = p.skin;
    const assets = this.assets;
    const rigModel = assets?.dungeon.get(skin >= 4 ? "character-orc" : "character-human");
    if (assets && rigModel) {
      rig = skeletonClone(rigModel.scene) as THREE.Group;
      rig.scale.setScalar(CHAR_SCALE);
      // skin tint: multiply every material's colour
      const tints = [0xffffff, 0xb9c6d8, 0xffb37f, 0xb8e6a3, 0xffc48f, 0x9fb8c9];
      const tint = new THREE.Color(tints[skin % tints.length]);
      rig.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (let m of mats) {
            if (m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshLambertMaterial) {
              m = m.clone();
              m.color = new THREE.Color(tint.r * m.color.r, tint.g * m.color.g, tint.b * m.color.b);
              o.material = m;
            }
          }
        }
      });
      group.add(rig);
      mixer = new THREE.AnimationMixer(rig);
      for (const clip of rigModel.animations) {
        actions[clip.name] = mixer.clipAction(clip);
      }
      head = rig.getObjectByName("head");
      const arm = rig.getObjectByName("arm-right");
      if (arm) {
        gun = new THREE.Group();
        const blaster = this.blasters.get(WEAPONS[p.weapon]?.modelId ?? "blaster-b");
        if (blaster) {
          const m = instance(blaster);
          const box = new THREE.Box3().setFromObject(m);
          const size = box.getSize(new THREE.Vector3());
          m.scale.setScalar(0.55 / Math.max(size.z, 0.01));
          m.position.set(0, -0.1, -0.18);
          m.rotation.y = Math.PI;
          gun.add(m);
        } else {
          const box = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.5), this.mat(0x2b2f3a));
          box.position.set(0, -0.1, -0.2);
          gun.add(box);
        }
        arm.add(gun);
      }
    } else {
      // box person
      const mat = new THREE.MeshLambertMaterial({ color: p.color, flatShading: true });
      const bodyH = PLAYER_HEIGHT - 0.45;
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, bodyH, 1.12), mat);
      body.position.y = bodyH / 2;
      head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshLambertMaterial({ color: 0xf2d0b0, flatShading: true }));
      head.position.y = EYE_HEIGHT - 0.05;
      gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.6), this.mat(0x2b2f3a));
      gun.position.set(0.3, 1.1, -0.35);
      group.add(body, head, gun);
      this.disposables.push(mat);
    }

    const label = makeLabel(p.name);
    label.position.y = PLAYER_HEIGHT + 0.5;
    group.add(label);
    this.scene.add(group);
    return { group, rig, mixer, actions, current: "idle", head, gun, label, name: p.name, deathT: 0, deathImpulse: { x: 0, y: 0, z: 0 }, speed: 0 };
  }

  private removeView(id: string, v: PlayerView): void {
    this.scene.remove(v.group);
    v.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) if (!(m as THREE.Material).userData.shared) (m as THREE.Material).dispose();
      }
    });
    (v.label.material as THREE.SpriteMaterial).map?.dispose();
    (v.label.material as THREE.SpriteMaterial).dispose();
    this.views.delete(id);
  }

  private get blasters(): Map<string, { scene: THREE.Group; animations: THREE.AnimationClip[] }> {
    return this.assets?.blasters ?? new Map();
  }

  /* ------------------------- viewmodel ------------------------- */

  /** Swap the viewmodel for the selected weapon's blaster model. */
  setViewmodel(weaponId: number): void {
    if (weaponId === this.weaponId && this.gun.children.length > 3) return;
    this.weaponId = weaponId;
    for (const child of [...this.gun.children]) {
      if (child === this.flash) continue;
      this.gun.remove(child);
    }
    const loaded = this.blasters.get(WEAPONS[weaponId]?.modelId ?? "blaster-b");
    if (loaded) {
      const m = instance(loaded);
      const box = new THREE.Box3().setFromObject(m);
      const size = box.getSize(new THREE.Vector3());
      m.scale.setScalar(0.5 / Math.max(size.z, 0.01));
      m.rotation.y = Math.PI; // barrel points away from the camera
      m.position.set(0, -0.06, -0.05);
      this.gun.add(m);
    }
  }

  muzzleFlash(): void {
    this.flashT = 0.05;
    this.recoil = 1;
    this.flashLight.intensity = 8;
  }

  viewmodelReload(seconds: number): void {
    this.reloadT = seconds;
  }

  setViewmodelVisible(v: boolean): void {
    this.gun.visible = v;
  }

  addShake(amount: number): void {
    this.shake = Math.min(0.5, this.shake + amount);
  }

  private zoomT = 0;

  /** Sniper scope: narrow the FOV (smoothed in update). */
  setZoomed(z: boolean): void {
    this.zoomT = z ? 1 : 0;
  }

  /* ------------------------- FX ------------------------- */

  addTracers(from: Vec3, ends: Vec3[], color = 0xffe08a): void {
    for (const e of ends) {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...from), new THREE.Vector3(...e)]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 }));
      this.scene.add(line);
      this.tracers.push({ line, life: 0.07 });
    }
  }

  /** Foam-dart impact debris at a world point. */
  impactFX(pos: Vec3): void {
    this.spawnDebris(pos, 3, 0x8fd0e8, 0.06, 3.2);
  }

  /** Grenade detonation: flash sphere + smoke puffs + shake. */
  explosionFX(pos: Vec3): void {
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xffc46a, transparent: true, opacity: 0.9 }),
    );
    flash.position.set(pos[0], pos[1] + 0.3, pos[2]);
    this.scene.add(flash);
    this.debris.push({
      mesh: flash,
      vel: new THREE.Vector3(),
      spin: new THREE.Vector3(),
      life: 0.35,
      maxLife: 0.35,
    });
    this.spawnDebris([pos[0], pos[1] + 0.3, pos[2]], 8, 0x5a5460, 0.16, 2.4);
    this.addShake(0.22);
  }

  /** A barrel or target broke: fragments + smoke. */
  breakFX(pos: Vec3, model: string): void {
    const loaded = this.assets?.blasters.get(model);
    if (loaded) {
      this.spawnModelDebris(pos, "target-fragment-large", 3);
      this.spawnModelDebris(pos, "target-fragment-small", 3);
    } else {
      this.spawnDebris(pos, 6, 0x8a7a5a, 0.1, 3);
    }
    this.spawnDebris(pos, 4, 0x6a6470, 0.14, 1.8);
  }

  private spawnModelDebris(pos: Vec3, model: string, count: number): void {
    const loaded = this.assets?.blasters.get(model);
    if (!loaded) return;
    for (let i = 0; i < count; i++) {
      const m = instance(loaded);
      m.scale.setScalar(0.8);
      m.position.set(pos[0], pos[1], pos[2]);
      this.scene.add(m);
      this.debris.push({
        mesh: m,
        vel: new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 4 + 2, (Math.random() - 0.5) * 5),
        spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
        life: 1.1,
        maxLife: 1.1,
      });
    }
  }

  private spawnDebris(pos: Vec3, count: number, color: number, size: number, speed: number): void {
    if (this.debris.length > 90) return;
    const geo = new THREE.BoxGeometry(size, size, size);
    this.disposables.push(geo);
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true }));
      m.position.set(pos[0] + (Math.random() - 0.5) * 0.2, pos[1] + Math.random() * 0.2, pos[2] + (Math.random() - 0.5) * 0.2);
      this.scene.add(m);
      this.debris.push({
        mesh: m,
        vel: new THREE.Vector3((Math.random() - 0.5) * speed, Math.random() * speed * 0.8 + 1, (Math.random() - 0.5) * speed),
        spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10),
        life: 0.8 + Math.random() * 0.4,
        maxLife: 1.2,
      });
    }
  }

  /* ------------------------- minimap ------------------------- */

  private renderMinimapBase(): void {
    const c = document.createElement("canvas");
    c.width = this.minimap.width;
    c.height = this.minimap.height;
    const g = c.getContext("2d")!;
    g.fillStyle = "rgba(10, 8, 16, 0.85)";
    g.fillRect(0, 0, c.width, c.height);
    const world = 48;
    const s = c.width / world;
    const toPx = (x: number): number => (x + world / 2) * s;
    for (const b of MAP_BOXES) {
      if (b.max[1] < 0.5) continue; // skip the floor slab
      g.fillStyle = b.max[1] > 1.5 ? "rgba(210,190,160,0.55)" : "rgba(210,190,160,0.28)";
      g.fillRect(toPx(b.min[0]), toPx(b.min[2]), (b.max[0] - b.min[0]) * s, (b.max[2] - b.min[2]) * s);
    }
    this.mapCanvas = c;
  }

  private drawMinimap(selfX: number, selfZ: number, selfYaw: number): void {
    const g = this.minimap.getContext("2d")!;
    const w = this.minimap.width;
    const h = this.minimap.height;
    g.clearRect(0, 0, w, h);
    if (this.mapCanvas) g.drawImage(this.mapCanvas, 0, 0);
    const world = 48;
    const s = w / world;
    const toPx = (x: number): number => (x + world / 2) * s;
    // pickups (alive ones only — hidden ones are marked via syncPickupsTaken)
    g.fillStyle = "rgba(127,208,255,0.9)";
    for (let i = 0; i < MAP_PICKUPS.length && i < this.pickupViews.length; i++) {
      if (!this.pickupViews[i].visible) continue;
      const d = MAP_PICKUPS[i];
      g.fillRect(toPx(d.x) - 1.5, toPx(d.z) - 1.5, 3, 3);
    }
    // other players
    for (const d of this.minimapDots) {
      if (d.self) continue;
      g.fillStyle = `#${d.color.toString(16).padStart(6, "0")}`;
      g.beginPath();
      g.arc(toPx(d.x), toPx(d.z), 3, 0, Math.PI * 2);
      g.fill();
    }
    // self arrow
    g.save();
    g.translate(toPx(selfX), toPx(selfZ));
    g.rotate(-selfYaw);
    g.fillStyle = "#ffd25a";
    g.beginPath();
    g.moveTo(0, -5);
    g.lineTo(3.6, 4);
    g.lineTo(-3.6, 4);
    g.closePath();
    g.fill();
    g.restore();
  }

  /* ------------------------- frame ------------------------- */

  private resize(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number): void {
    // tracers
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      (t.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, t.life / 0.07);
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        (t.line.material as THREE.Material).dispose();
        this.tracers.splice(i, 1);
      }
    }
    // debris (cosmetic ballistics + floor bounce at y=0/0.9 dais ignored)
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt;
      if (d.life <= 0) {
        this.scene.remove(d.mesh);
        this.debris.splice(i, 1);
        continue;
      }
      d.vel.y -= 14 * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      if (d.mesh.position.y < 0.05 && d.vel.y < 0) {
        d.mesh.position.y = 0.05;
        d.vel.y *= -0.35;
        d.vel.x *= 0.7;
        d.vel.z *= 0.7;
      }
      d.mesh.rotation.x += d.spin.x * dt;
      d.mesh.rotation.y += d.spin.y * dt;
      const mat = (d.mesh as THREE.Mesh).material as THREE.MeshBasicMaterial;
      if (mat.transparent) mat.opacity = Math.min(1, d.life / (d.maxLife * 0.5));
    }
    // players
    for (const v of this.views.values()) {
      v.mixer?.update(dt);
      if (v.deathT > 1.0 && v.group.visible) {
        v.group.traverse((o) => {
          const mats = o instanceof THREE.Mesh ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
          for (const m of mats) {
            const mm = m as THREE.MeshBasicMaterial;
            if (mm.transparent || mm.opacity !== undefined) {
              mm.transparent = true;
              mm.opacity = Math.max(0, 1 - (v.deathT - 1.0) / 0.6);
            }
          }
          if (o instanceof THREE.Sprite) (o.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - (v.deathT - 1.0) / 0.6);
        });
        if (v.deathT > 1.6) v.group.visible = false;
      }
    }
    // props: ease toward the last snapshot pose
    for (const v of this.propViews.values()) {
      if (!v.group.visible) continue;
      v.group.position.lerp(v.target, Math.min(1, 14 * dt));
      v.yaw += (v.yawTarget - v.yaw) * Math.min(1, 14 * dt);
      v.group.rotation.y = v.yaw;
    }
    // pickups bob & spin
    const t = performance.now() / 1000;
    for (const g of this.pickupViews) {
      if (!g.visible) continue;
      g.rotation.y = t * 1.6;
      g.position.y += Math.sin(t * 2.4) * 0.0015;
    }
    for (const c of this.coinViews) {
      c.rotation.y = t * 2.2;
    }
    // viewmodel dynamics
    this.flashT = Math.max(0, this.flashT - dt);
    this.flash.visible = this.flashT > 0;
    this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 160);
    this.recoil = Math.max(0, this.recoil - dt * 9);
    this.reloadT = Math.max(0, this.reloadT - dt);
    this.bobT += dt;
    this.shake = Math.max(0, this.shake - dt * 1.4);
    // scope zoom easing
    const targetFov = 80 - this.zoomT * 48;
    if (Math.abs(this.camera.fov - targetFov) > 0.2) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, 14 * dt);
      this.camera.updateProjectionMatrix();
    }
    const bob = Math.sin(this.bobT * 7.4) * 0.006;
    const dip = Math.sin(Math.min(1, this.reloadT) * Math.PI) * 0.14;
    this.gun.position.set(0.22 + this.swayX + bob, -0.2 + this.swayY + bob * 0.6 - dip, -0.4 + this.recoil * 0.07);
    this.gun.rotation.x = this.recoil * 0.16 - dip * 0.9;
    this.gun.rotation.z = this.swayX * 1.4;
  }

  render(x: number, y: number, z: number, yaw: number, pitch: number, speed = 0): void {
    const shakeX = this.shake * (Math.random() - 0.5) * 0.05;
    const shakeY = this.shake * (Math.random() - 0.5) * 0.05;
    this.camera.position.set(x, y + EYE_HEIGHT, z);
    this.camera.rotation.set(pitch + shakeY, yaw + shakeX, 0);
    this.renderer.render(this.scene, this.camera);
    this.drawMinimap(x, z, yaw);
    void speed;
  }

  /** Mouse-delta sway for the viewmodel (called from the input path). */
  sway(dx: number, dy: number): void {
    this.swayX = THREE.MathUtils.clamp(this.swayX - dx * 0.0004, -0.02, 0.02);
    this.swayY = THREE.MathUtils.clamp(this.swayY + dy * 0.0004, -0.02, 0.02);
  }

  destroy(): void {
    this.ro.disconnect();
    for (const t of this.tracers) {
      t.line.geometry.dispose();
      (t.line.material as THREE.Material).dispose();
    }
    for (const d of this.debris) this.scene.remove(d.mesh);
    this.syncPlayers([], "");
    this.minimap.remove();
    for (const m of this.matCache.values()) m.dispose();
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}
