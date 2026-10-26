/** Road signs and fallen logs. */
import * as THREE from "three";
import { JUNCTION_T } from "../../../world/city";
import { TAU } from "../../noise";
import { ROAD_HALF, SAMPLES } from "../config/world-constants";
import type { JeepEngine } from "../jeep-engine";

export function makeSignTexture(this: JeepEngine, text: string, sub: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 160;
  const x = c.getContext("2d");
  if (!x) throw new Error("no 2d ctx");
  x.fillStyle = "#c9a24a";
  x.fillRect(0, 0, 256, 160);
  x.fillStyle = "rgba(90,60,25,0.25)";
  for (let i = 0; i < 200; i++) {
    x.fillRect(Math.random() * 256, Math.random() * 160, Math.random() * 20, 1);
  }
  x.strokeStyle = "#4c3517";
  x.lineWidth = 8;
  x.strokeRect(6, 6, 244, 148);
  x.fillStyle = "#3a2810";
  x.textAlign = "center";
  x.font = "bold 40px sans-serif";
  x.fillText(text, 128, 80);
  if (sub) {
    x.font = "500 20px sans-serif";
    x.fillText(sub, 128, 114);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function buildSigns(this: JeepEngine): void {
  const scene = this.scene;
  if (!scene) return;
  const specs: { t: number; txt: string; sub: string }[] = [
    { t: 0.02, txt: "BASE CAMP", sub: "trail start" },
    { t: 0.19, txt: "ROCKY CLIMB", sub: "low gear" },
    { t: 0.4, txt: "DEEP RUTS", sub: "slow down" },
    { t: 0.55, txt: "CLEARING", sub: "scenic" },
    { t: 0.63, txt: "BRIDGE", sub: "one vehicle" },
    { t: 0.71, txt: "WATER", sub: "ford ahead" },
    { t: 0.86, txt: "SWITCHBACK", sub: "sharp bends" },
  ];
  // the turn-off to Port Marin (just past the access-road mouth)
  specs.push({ t: JUNCTION_T + 0.007, txt: "PORT MARIN", sub: "paved road" });
  const postG = new THREE.CylinderGeometry(0.09, 0.11, 2.3, 7);
  for (const s of specs) {
    const i = Math.floor(s.t * SAMPLES) % SAMPLES;
    const p = this.trailPts[i];
    const tan = this.trailTan[i];
    const side = new THREE.Vector3(-tan.z, 0, tan.x).multiplyScalar(ROAD_HALF + 1.5);
    const g = new THREE.Group();
    const px = p.x + side.x;
    const pz = p.z + side.z;
    if (this.rail.dist(px, pz) < 9.5) continue; // never on the railway bed
    g.position.set(px, this.terrainHeight(px, pz), pz);
    g.rotation.y = Math.atan2(tan.x, tan.z) + Math.PI / 2;
    const post = new THREE.Mesh(postG, this.woodDark);
    post.position.y = 1.15;
    post.castShadow = true;
    g.add(post);
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.94, 0.07),
      [
        this.woodDark,
        this.woodDark,
        this.woodDark,
        this.woodDark,
        new THREE.MeshStandardMaterial({ map: this.makeSignTexture(s.txt, s.sub), roughness: 0.85 }),
        this.woodDark,
      ],
    );
    board.position.y = 2.05;
    board.castShadow = true;
    g.add(board);
    scene.add(g);
  }

  // level-crossing warnings: both trail approaches to every rail crossing,
  // posted on the side away from the rails
  for (const c of this.railCrossings) {
    let bi = 0;
    let best = 1e9;
    for (let i = 0; i < SAMPLES; i++) {
      const d = (this.trailPts[i].x - c.x) ** 2 + (this.trailPts[i].z - c.z) ** 2;
      if (d < best) {
        best = d;
        bi = i;
      }
    }
    for (const off of [-14, 14]) {
      const i = (bi + off + SAMPLES) % SAMPLES;
      const p = this.trailPts[i];
      const tan = this.trailTan[i];
      let sideX = -tan.z;
      let sideZ = tan.x;
      // flip to the far side if this one faces the rails
      if (this.rail.dist(p.x + sideX * 8, p.z + sideZ * 8) < this.rail.dist(p.x - sideX * 8, p.z - sideZ * 8)) {
        sideX = -sideX;
        sideZ = -sideZ;
      }
      const px = p.x + sideX * (ROAD_HALF + 1.5);
      const pz = p.z + sideZ * (ROAD_HALF + 1.5);
      if (this.rail.dist(px, pz) < 9.5) continue;
      const g = new THREE.Group();
      g.position.set(px, this.terrainHeight(px, pz), pz);
      g.rotation.y = Math.atan2(tan.x, tan.z) + Math.PI / 2;
      const post = new THREE.Mesh(postG, this.woodDark);
      post.position.y = 1.15;
      post.castShadow = true;
      g.add(post);
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.94, 0.07),
        [
          this.woodDark,
          this.woodDark,
          this.woodDark,
          this.woodDark,
          new THREE.MeshStandardMaterial({ map: this.makeSignTexture("CROSSING", "express line"), roughness: 0.85 }),
          this.woodDark,
        ],
      );
      board.position.y = 2.05;
      board.castShadow = true;
      g.add(board);
      scene.add(g);
    }
  }
}

export function buildLogs(this: JeepEngine, rnd: () => number): void {
  const scene = this.scene;
  if (!scene) return;
  const logG = new THREE.CylinderGeometry(0.34, 0.42, 5.2, 8);
  logG.rotateZ(Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0x54402a, roughness: 0.95 });
  const count = 26;
  const im = new THREE.InstancedMesh(logG, mat, count);
  im.castShadow = true;
  im.receiveShadow = true;
  const d = new THREE.Object3D();
  for (let k = 0; k < count; k++) {
    // retry until clear of the railway — a log across the rails would sit
    // in the Express's path (and look like a collapsed log train)
    let x = 0;
    let z = 0;
    for (let tries = 0; tries < 24; tries++) {
      const i = Math.floor(rnd() * SAMPLES);
      const p = this.trailPts[i];
      const tan = this.trailTan[i];
      const off = (ROAD_HALF + 2.0 + rnd() * 4.0) * (rnd() < 0.5 ? -1 : 1);
      x = p.x - tan.z * off;
      z = p.z + tan.x * off;
      if (this.rail.dist(x, z) > 9.5) break;
    }
    d.position.set(x, this.terrainHeight(x, z) + 0.3, z);
    d.rotation.set((rnd() - 0.5) * 0.25, rnd() * TAU, (rnd() - 0.5) * 0.2);
    const lsc = 0.7 + rnd() * 0.8;
    d.scale.setScalar(lsc);
    d.updateMatrix();
    im.setMatrixAt(k, d.matrix);
    // fallen logs: a capsule along the trunk axis (not a blob at its middle)
    const ry = d.rotation.y;
    const hl = 2.6 * lsc - 0.4 * lsc;
    this.addCollider(x + Math.cos(ry) * hl, z - Math.sin(ry) * hl, 0.4 * lsc, 0.52, {
      bx: x - Math.cos(ry) * hl,
      bz: z + Math.sin(ry) * hl,
      height: 0.3 + 0.42 * lsc,
    });
  }
  scene.add(im);
}
