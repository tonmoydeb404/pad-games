/** Terrain mesh, water surfaces and the river bridge. */
import * as THREE from "three";
import { HeightGrid } from "../../../physics/ground";
import { RAIL_BED, RAIL_BLEND } from "../../../world/train";
import { clamp, fbm, hash2, smooth } from "../../noise";
import { WORLD, ROAD_HALF, ROAD_BLEND } from "../config/world-constants";
import type { JeepEngine } from "../jeep-engine";

export function buildTerrain(this: JeepEngine): void {
  const scene = this.scene;
  if (!scene) return;
  const seg = this.Q.terrainSeg;
  const geo = new THREE.PlaneGeometry(WORLD, WORLD, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const heights = new Float32Array(pos.count);
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const cMud = new THREE.Color(0x553820),
    cDirt = new THREE.Color(0x8a6a42),
    cGrass = new THREE.Color(0x54992f),
    cGrass2 = new THREE.Color(0x428a26),
    cMeadow = new THREE.Color(0x6fb441),
    cRock = new THREE.Color(0x787568),
    cBallast = new THREE.Color(0x807c6e),
    cAsphalt = new THREE.Color(0x45464b),
    cLawn = new THREE.Color(0x7fa14e),
    cWet = new THREE.Color(0x2a1e12);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = this.terrainHeight(x, z);
    pos.setY(i, y);
    heights[i] = y;
    const info = this.trailInfo(x, z);
    const n = fbm(x * 0.09, z * 0.09, 2);
    if (info.dist < ROAD_HALF + 1.4) {
      const wet = fbm(x * 0.03 + 7, z * 0.03 - 3, 2);
      c.copy(wet > 0.12 ? cMud : cDirt).offsetHSL(0, 0, n * 0.05);
      if (info.t > 0.16 && info.t < 0.3) c.lerp(cRock, 0.5);
    } else if (info.dist < ROAD_HALF + ROAD_BLEND) {
      const k = (info.dist - ROAD_HALF - 1.4) / (ROAD_BLEND - 1.4);
      c.copy(cDirt).lerp(cGrass, clamp(k, 0, 1)).offsetHSL(0, 0, n * 0.05);
    } else {
      const patch = fbm(x * 0.028 + 11, z * 0.028 - 5, 3);
      c.copy(n > 0 ? cGrass : cGrass2).offsetHSL(n * 0.02, 0.03, n * 0.06);
      if (patch > 0.1) c.lerp(cMeadow, clamp((patch - 0.1) * 1.6, 0, 0.55));
      const micro = fbm(x * 0.33, z * 0.33, 2);
      c.offsetHSL(0, micro * 0.04, micro * 0.05);
      if (y > 34) c.lerp(cRock, clamp((y - 34) / 24, 0, 0.85));
    }
    // railway ballast: gravel over the bed, fading into the surroundings
    const ri = this.rail.info(x, z, this.tmpRailInfo);
    if (ri.dist < RAIL_BED + RAIL_BLEND) {
      // gravel identity only needs to own the strip around the track —
      // let the outer bench read as sparse ground so the corridor doesn't
      // look like a second dirt road
      c.lerp(cBallast, 1 - smooth(clamp((ri.dist - 3.2) / 5.3, 0, 1)));
    }
    // Port Marin: asphalt over the streets and access road, kept lawn
    // across the town shelf
    const gk = this.city.groundKind(x, z);
    if (gk === 1) c.lerp(cAsphalt, 0.88);
    else if (gk === 2) c.lerp(cLawn, 0.5);      const sd = Math.hypot(x - this.stream.c.x, z - this.stream.c.z);
    if (sd < this.stream.r) c.lerp(cWet, smooth(1 - sd / this.stream.r) * 0.8);
    for (const p of this.ponds) {
      const pd = Math.hypot(x - p.x, z - p.z);
      if (pd < p.r) c.lerp(cWet, smooth(1 - pd / p.r) * 0.8);
    }
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  this.heightGrid = new HeightGrid(WORLD, seg, heights);
  const terrain = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.02 }),
  );
  terrain.receiveShadow = true;
  scene.add(terrain);
}

export function buildWater(this: JeepEngine): void {
  const scene = this.scene;
  if (!scene) return;
  const waterMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; varying vec3 vW; uniform float uTime;
    void main(){ vUv=uv; vec3 p=position;
      p.y += sin(p.x*0.9+uTime*1.6)*0.035 + cos(p.z*1.1-uTime*1.2)*0.03;
      vec4 w=modelMatrix*vec4(p,1.0); vW=w.xyz;
      gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `varying vec2 vUv; varying vec3 vW; uniform float uTime;
    float h(vec2 p){return fract(sin(dot(p,vec2(27.1,61.7)))*43758.5453);}
    float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
      return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
    void main(){
      float d=length(vUv-0.5)*2.0;
      float rip = n2(vW.xz*1.4+vec2(uTime*0.5,uTime*0.32))*0.6 + n2(vW.xz*3.3-uTime*0.4)*0.4;
      vec3 col = mix(vec3(0.12,0.22,0.18), vec3(0.28,0.48,0.42), rip);
      col += vec3(0.65,0.80,0.70)*pow(rip,5.0)*0.65;
      float spec = pow(max(rip*0.8+0.2, 0.0), 12.0)*0.35;
      col += vec3(1.0,0.95,0.8)*spec;
      float a = (0.72 + rip*0.18) * smoothstep(1.0,0.68,d);
      gl_FragColor=vec4(col,a);
    }`,
  });
  this.waterMat = waterMat;
  const addWater = (x: number, z: number, r: number, level: number): void => {
    const g = new THREE.CircleGeometry(r * 1.02, 40);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, waterMat);
    m.position.set(x, level, z);
    m.renderOrder = 2;
    scene.add(m);
  };
  addWater(this.stream.c.x, this.stream.c.z, this.stream.r, this.stream.level);
  for (const p of this.ponds) addWater(p.x, p.z, p.r, p.level);
}

export function buildBridge(this: JeepEngine): void {
  const scene = this.scene;
  if (!scene) return;
  const i = this.bridgeI;
  const p = this.trailPts[i];
  const t = this.trailTan[i];
  const g = new THREE.Group();
  g.position.copy(p);
  g.position.y += 0.05;
  g.rotation.y = Math.atan2(t.x, t.z);
  const plankG = new THREE.BoxGeometry(ROAD_HALF * 2.05, 0.16, 0.62);
  for (let k = -16; k <= 16; k++) {
    const m = new THREE.Mesh(plankG, k % 2 ? this.woodMat : this.woodDark);
    m.position.set(0, 0.1, k * 0.68);
    m.rotation.z = (hash2(k, 3) - 0.5) * 0.02;
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  const railG = new THREE.BoxGeometry(0.16, 0.16, 22.5);
  const postG = new THREE.BoxGeometry(0.2, 0.95, 0.2);
  for (const s of [-1, 1]) {
    const r = new THREE.Mesh(railG, this.woodMat);
    r.position.set(s * (ROAD_HALF - 0.15), 0.92, 0);
    r.castShadow = true;
    g.add(r);
    for (let k = -5; k <= 5; k++) {
      const po = new THREE.Mesh(postG, this.woodDark);
      po.position.set(s * (ROAD_HALF - 0.15), 0.5, k * 2.1);
      po.castShadow = true;
      g.add(po);
    }
  }
  const beamG = new THREE.BoxGeometry(0.3, 0.3, 23);
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(beamG, this.woodDark);
    b.position.set(s * 3.1, -0.08, 0);
    g.add(b);
  }
  scene.add(g);
}
