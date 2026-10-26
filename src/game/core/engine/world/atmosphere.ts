/** Light shafts, fireflies and the per-frame atmosphere update. */
import * as THREE from "three";
import { mulberry, TAU } from "../../noise";
import { BOUND } from "../config/world-constants";
import type { JeepEngine } from "../jeep-engine";

export function buildLightShafts(this: JeepEngine): void {
  const scene = this.scene;
  if (!scene) return;
  const rnd = mulberry(4242);
  const geo = new THREE.PlaneGeometry(3.4, 26);
  const sunDir = new THREE.Vector3(0.62, 0.52, -0.4).normalize();
  for (let i = 0; i < 26; i++) {
    const a = rnd() * TAU;
    const r = 30 + rnd() * (BOUND - 60);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const y = this.terrainHeight(x, z);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffe9b0,
      transparent: true,
      opacity: 0.035 + rnd() * 0.05,
      fog: false,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y + 11 + rnd() * 5, z);
    m.lookAt(x + sunDir.x * 10, y + 11 + sunDir.y * 10, z + sunDir.z * 10);
    m.rotateX(Math.PI / 2);
    m.rotation.z = rnd() * 0.4 - 0.2;
    m.renderOrder = 5;
    m.userData = { base: mat.opacity, ph: rnd() * TAU };
    scene.add(m);
    this.shafts.push(m);
  }
}

export function buildFireflies(this: JeepEngine): void {
  const scene = this.scene;
  if (!scene) return;
  const rnd = mulberry(777);
  const pos = new Float32Array(this.FF_N * 3);
  const dat: { x: number; y: number; z: number; ph: number; sp: number; amp: number }[] = [];
  for (let i = 0; i < this.FF_N; i++) {
    const a = rnd() * TAU;
    const r = 20 + rnd() * (BOUND - 50);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const y = this.terrainHeight(x, z);
    dat.push({ x, y: y + 0.8 + rnd() * 3.4, z, ph: rnd() * TAU, sp: 0.4 + rnd() * 0.8, amp: 0.5 + rnd() * 1.2 });
    pos[i * 3] = dat[i].x;
    pos[i * 3 + 1] = dat[i].y;
    pos[i * 3 + 2] = dat[i].z;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  this.ffAttr = geo.attributes.position;
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `uniform float uTime; varying float vTw;
    void main(){
      vec4 mv=modelViewMatrix*vec4(position,1.0);
      vTw=0.55+0.45*sin(uTime*2.2+position.x*3.1+position.z*1.7);
      gl_PointSize=(2.6+vTw*3.2)*140.0/max(-mv.z,1.0);
      gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying float vTw;
    void main(){
      vec2 d=gl_PointCoord-0.5; float r=length(d);
      if(r>0.5) discard;
      float a=smoothstep(0.5,0.0,r);
      vec3 col=mix(vec3(1.0,0.85,0.35), vec3(0.75,1.0,0.45), vTw*0.5);
      gl_FragColor=vec4(col, a*vTw*0.9); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.userData = dat;
  scene.add(pts);
  this.fireflies = pts;
}

export function updateAtmosphere(this: JeepEngine, dt: number): void {
  for (const s of this.shafts) {
    const mat = s.material as THREE.MeshBasicMaterial;
    mat.opacity =
      (s.userData.base as number) * (0.75 + 0.25 * Math.sin(this.time * 0.5 + (s.userData.ph as number)));
  }
  if (this.fireflies && this.ffAttr) {
    (this.fireflies.material as THREE.ShaderMaterial).uniforms.uTime.value = this.time;
    const dat = this.fireflies.userData as { x: number; y: number; z: number; ph: number; sp: number; amp: number }[];
    for (let i = 0; i < this.FF_N; i++) {
      const d = dat[i];
      this.ffAttr.setXYZ(
        i,
        d.x + Math.sin(this.time * d.sp + d.ph) * d.amp,
        d.y + Math.sin(this.time * d.sp * 1.4 + d.ph * 2.0) * 0.55,
        d.z + Math.cos(this.time * d.sp * 0.8 + d.ph) * d.amp,
      );
    }
    this.ffAttr.needsUpdate = true;
  }
  void dt;
}
