/** Particle pool: dust, spray and exhaust. */
import * as THREE from "three";
import { clamp, lerp } from "../../noise";
import type { JeepEngine } from "../jeep-engine";

export function initParticles(this: JeepEngine): void {
  const scene = this.scene;
  if (!scene) return;
  const N = this.Q.particles;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const siz = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3 + 1] = -9999;
    siz[i] = 0;
    this.particlePool.push({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, s0: 1, s1: 2 });
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("size", new THREE.BufferAttribute(siz, 1));
  this.pAttrPos = geo.attributes.position;
  this.pAttrCol = geo.attributes.color;
  this.pAttrSize = geo.attributes.size;
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    vertexShader: `attribute float size; varying vec3 vC; varying float vA;
    void main(){ vC=color; vec4 mv=modelViewMatrix*vec4(position,1.0);
      vA = size>0.001?1.0:0.0;
      gl_PointSize = size*300.0/max(-mv.z,1.0);
      gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vC; varying float vA;
    void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d);
      if(r>0.5) discard;
      float a=smoothstep(0.5,0.05,r)*0.55*vA;
      gl_FragColor=vec4(vC,a); }`,
  });
  const particles = new THREE.Points(geo, mat);
  particles.frustumCulled = false;
  scene.add(particles);
}

export function spawnParticle(
  this: JeepEngine,
  x: number, y: number, z: number,
  vx: number, vy: number, vz: number,
  color: number | string,
  s0: number, s1: number, life: number,
): void {
  if (!this.pAttrPos || !this.pAttrCol || !this.pAttrSize) return;
  const i = this.pHead;
  this.pHead = (this.pHead + 1) % this.particlePool.length;
  const p = this.particlePool[i];
  p.life = life;
  p.max = life;
  p.vx = vx;
  p.vy = vy;
  p.vz = vz;
  p.s0 = s0;
  p.s1 = s1;
  this.pAttrPos.setXYZ(i, x, y, z);
  this.tmpColor.set(color);
  this.pAttrCol.setXYZ(i, this.tmpColor.r, this.tmpColor.g, this.tmpColor.b);
  this.pAttrSize.setX(i, s0);
}

export function updateParticles(this: JeepEngine, dt: number): void {
  const pos = this.pAttrPos;
  const size = this.pAttrSize;
  const col = this.pAttrCol;
  if (!pos || !size || !col) return;
  for (let i = 0; i < this.particlePool.length; i++) {
    const p = this.particlePool[i];
    if (p.life <= 0) {
      if (size.getX(i) !== 0) size.setX(i, 0);
      continue;
    }
    p.life -= dt;
    const k = 1 - clamp(p.life / p.max, 0, 1);
    pos.setXYZ(i, pos.getX(i) + p.vx * dt, pos.getY(i) + p.vy * dt, pos.getZ(i) + p.vz * dt);
    p.vy -= 1.6 * dt;
    p.vx *= 0.985;
    p.vz *= 0.985;
    size.setX(i, p.life > 0 ? lerp(p.s0, p.s1, k) * (1 - k * 0.55) : 0);
  }
  pos.needsUpdate = true;
  col.needsUpdate = true;
  size.needsUpdate = true;
}

export function emitWheelFX(this: JeepEngine, dt: number): void {
  const v = this.v;
  const rp = this.renderPos;
  const spd = Math.abs(v.speed);
  this.emitAcc += dt;
  const rate = 0.045 / clamp(0.25 + spd / 8, 0.25, 3);
  if (this.emitAcc < rate) return;
  this.emitAcc = 0;
  if (spd < 0.6 && v.throttle < 0.2) return;
  const cy = Math.cos(v.yaw);
  const sy = Math.sin(v.yaw);
  for (let i = 2; i < 4; i++) {
    const w = this.wheels[i];
    if (!w.contact) continue;
    const lx = w.base.x * 1.1;
    const lz = w.base.z + 0.35;
    const wx = rp.x + lx * cy + lz * sy;
    const wz = rp.z - lx * sy + lz * cy;
    const gy = w.groundY ?? this.terrainHeight(wx, wz);
    const surf = this.surfaceAt(wx, wz);
    let col = "#a08a63";
    let s0 = 0.35;
    let s1 = 1.5;
    let life = 1.1;
    let vy = 0.9;
    if (surf === "mud") { col = "#4a3a24"; s0 = 0.25; s1 = 0.9; life = 0.8; vy = 1.5; }
    else if (surf === "water") { col = "#9fb6a8"; s0 = 0.2; s1 = 0.85; life = 0.6; vy = 2.4; }
    else if (surf === "grass") { col = "#6f7f4a"; s0 = 0.25; s1 = 1.0; life = 0.7; vy = 0.8; }
    else if (surf === "rock") { col = "#8d8880"; s0 = 0.28; s1 = 1.1; life = 0.8; vy = 0.9; }
    else if (surf === "asphalt") { col = "#77777a"; s0 = 0.18; s1 = 0.65; life = 0.45; vy = 0.6; }
    const intensity = clamp(spd / 8 + v.throttle * 0.6, 0, 1.4);
    this.spawnParticle(
      wx + (Math.random() - 0.5) * 0.3, gy + 0.16, wz + (Math.random() - 0.5) * 0.3,
      (Math.random() - 0.5) * 0.9 - sy * v.speed * 0.16,
      vy * (0.4 + Math.random() * 0.7) * intensity,
      (Math.random() - 0.5) * 0.9 - cy * v.speed * 0.16,
      col, s0, s1 * intensity, life,
    );
  }
  if (this.surfaceAt(rp.x, rp.z) === "water" && spd > 1) {
    for (let i = 0; i < 2; i++) {
      const w = this.wheels[i];
      const lx = w.base.x;
      const lz = w.base.z;
      const wx = rp.x + lx * cy + lz * sy;
      const wz = rp.z - lx * sy + lz * cy;
      this.spawnParticle(
        wx, this.stream.level + 0.1, wz,
        (Math.random() - 0.5) * 2.4, 2.2 + Math.random() * 2.2, (Math.random() - 0.5) * 2.4,
        "#c6d8cd", 0.18, 0.7, 0.55,
      );
    }
    this.audio.splash();
    this.input.rumble(0.25, 120);
  }
}

export function emitExhaust(this: JeepEngine, dt: number): void {
  const v = this.v;
  const rp = this.renderPos;
  this.exhaustAcc += dt;
  if (this.exhaustAcc < 0.14) return;
  this.exhaustAcc = 0;
  const cy = Math.cos(v.yaw);
  const sy = Math.sin(v.yaw);
  const lx = 0.62;
  const lz = 1.85;
  const wx = rp.x + lx * cy + lz * sy;
  const wz = rp.z - lx * sy + lz * cy;
  const amount = 0.28 + v.throttle * 0.5;
  if (Math.random() > amount) return;
  this.spawnParticle(
    wx, rp.y - 0.35, wz,
    (Math.random() - 0.5) * 0.25 - sy * v.speed * 0.1,
    0.5 + Math.random() * 0.4,
    (Math.random() - 0.5) * 0.25 - cy * v.speed * 0.1,
    "#8f9490", 0.16, 0.85, 1.4,
  );

  // dented jeep smokes from the bonnet
  const dent = (100 - this.jeepHealth) / 100;
  if (dent > 0.35 && Math.random() < dent * 0.85) {
    this.spawnParticle(
      rp.x - sy * 1.55, rp.y + 0.78, rp.z - cy * 1.55,
      (Math.random() - 0.5) * 0.3,
      1.1 + Math.random() * 0.7,
      (Math.random() - 0.5) * 0.3,
      dent > 0.7 ? "#2e2e2e" : "#4b4b47",
      0.2, 1.15, 1.6,
    );
  }
}
