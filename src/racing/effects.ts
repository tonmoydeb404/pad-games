/**
 * Car ground effects: soft contact shadows under every tyre and the body (so
 * the car reads as planted, not hovering), tyre smoke + dust particles, and
 * skid marks that stay on the asphalt. Pure visuals — driven each frame from
 * the engine's wheel contact points.
 */
import * as THREE from "three";

export interface Pt {
  x: number;
  y: number;
  z: number;
}

export interface EffectsFrame {
  dt: number;
  /** World contact point per wheel (FL FR RL RR), null when off the ground. */
  contacts: (Pt | null)[];
  yaw: number;
  /** Signed forward speed, m/s. */
  speed: number;
  throttle: number;
  handbrake: boolean;
  /** 0..1 lateral slip. */
  drift: number;
  onGrass: boolean;
  airborne: boolean;
  /** Body origin, world. */
  body: Pt;
  /** Car footprint, metres. */
  length: number;
  width: number;
}

const PARTICLES = 160;
const SKIDS = 320;
const SKID_SPACING = 0.9;

function softDisc(inner: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 32 * inner, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class CarEffects {
  private readonly group = new THREE.Group();
  private readonly blobTex = softDisc(0.1);
  private readonly blobMat: THREE.MeshBasicMaterial;
  private readonly wheelBlobs: THREE.Mesh[] = [];
  private readonly bodyBlob: THREE.Mesh;

  // particles
  private readonly pPos = new Float32Array(PARTICLES * 3);
  private readonly pCol = new Float32Array(PARTICLES * 3);
  private readonly pAlpha = new Float32Array(PARTICLES);
  private readonly pointMat: THREE.ShaderMaterial;
  private readonly pVel = new Float32Array(PARTICLES * 3);
  private readonly pLife = new Float32Array(PARTICLES);
  private readonly pMax = new Float32Array(PARTICLES);
  private readonly pTint = new Float32Array(PARTICLES * 3);
  private readonly points: THREE.Points;
  private pNext = 0;
  private smokeAcc = 0;
  private dustAcc = 0;

  // skid marks
  private readonly skids: THREE.InstancedMesh;
  private skidNext = 0;
  private readonly lastSkid: (Pt | null)[] = [null, null];
  private readonly tmpM = new THREE.Matrix4();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpS = new THREE.Vector3();
  private readonly tmpP = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  private lastGroundY = 0;

  constructor(private readonly scene: THREE.Scene) {
    this.blobMat = new THREE.MeshBasicMaterial({
      map: this.blobTex,
      color: 0x000000,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(flat, this.blobMat.clone());
      m.renderOrder = 2;
      m.visible = false;
      this.wheelBlobs.push(m);
      this.group.add(m);
    }
    this.bodyBlob = new THREE.Mesh(flat, this.blobMat.clone());
    this.bodyBlob.renderOrder = 1;
    this.group.add(this.bodyBlob);

    // smoke / dust (additive: fading to black = fading out)
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pPos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(this.pCol, 3));
    for (let i = 0; i < PARTICLES; i++) this.pPos[i * 3 + 1] = -1000;
    geo.setAttribute("aAlpha", new THREE.BufferAttribute(this.pAlpha, 1));
    // true per-particle alpha (additive blending tints green over grass)
    const pm = new THREE.ShaderMaterial({
      uniforms: { uSize: { value: 2.8 }, uScale: { value: 620 } },
      vertexShader: `
        attribute float aAlpha;
        varying vec3 vC;
        varying float vA;
        uniform float uSize;
        uniform float uScale;
        void main() {
          vC = color;
          vA = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = uSize * uScale / max(0.5, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vC;
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.05, d) * vA;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vC, a);
        }`,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
    });
    this.pointMat = pm;
    this.points = new THREE.Points(geo, pm);
    this.points.frustumCulled = false;
    this.group.add(this.points);

    // skid marks
    const skidGeo = new THREE.PlaneGeometry(0.42, 1.2).rotateX(-Math.PI / 2);
    const skidMat = new THREE.MeshBasicMaterial({
      color: 0x050505,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    this.skids = new THREE.InstancedMesh(skidGeo, skidMat, SKIDS);
    this.skids.frustumCulled = false;
    this.skids.renderOrder = 1;
    this.tmpM.makeScale(0, 0, 0);
    for (let i = 0; i < SKIDS; i++) this.skids.setMatrixAt(i, this.tmpM);
    this.group.add(this.skids);

    scene.add(this.group);
  }

  /** Pixels per metre at one metre of depth (drawing-buffer height / 2·tan(fov/2)). */
  setPointScale(px: number): void {
    this.pointMat.uniforms.uScale.value = px;
  }

  /** Wipe skid marks + particles (teleports, resets). */
  clear(): void {
    this.tmpM.makeScale(0, 0, 0);
    for (let i = 0; i < SKIDS; i++) this.skids.setMatrixAt(i, this.tmpM);
    this.skids.instanceMatrix.needsUpdate = true;
    this.pLife.fill(0);
    this.lastSkid[0] = this.lastSkid[1] = null;
  }

  update(f: EffectsFrame): void {
    this.updateBlobs(f);
    this.emit(f);
    this.stepParticles(f.dt);
  }

  private updateBlobs(f: EffectsFrame): void {
    let sum = 0;
    let n = 0;
    for (let i = 0; i < 4; i++) {
      const c = f.contacts[i];
      const b = this.wheelBlobs[i];
      if (!c) {
        b.visible = false;
        continue;
      }
      sum += c.y;
      n++;
      b.visible = true;
      b.position.set(c.x, c.y + 0.03, c.z);
      b.rotation.y = f.yaw;
      b.scale.set(f.width * 0.34, 1, f.length * 0.5);
      (b.material as THREE.MeshBasicMaterial).opacity = 0.55;
    }
    if (n > 0) this.lastGroundY = sum / n;
    const h = Math.max(0, f.body.y - this.lastGroundY);
    const fade = Math.max(0, 1 - Math.max(0, h - 0.7) / 9);
    const bb = this.bodyBlob;
    bb.visible = fade > 0.02;
    bb.position.set(f.body.x, this.lastGroundY + 0.025, f.body.z);
    bb.rotation.y = f.yaw;
    const grow = 1 + Math.max(0, h - 0.7) * 0.06;
    bb.scale.set(f.width * 1.25 * grow, 1, f.length * 1.15 * grow);
    (bb.material as THREE.MeshBasicMaterial).opacity = 0.42 * fade;
  }

  private emit(f: EffectsFrame): void {
    const sp = Math.abs(f.speed);
    const hx = -Math.sin(f.yaw);
    const hz = -Math.cos(f.yaw);
    const wheelspin = f.throttle > 0.85 && sp < 14 && !f.onGrass ? 0.55 : 0;
    const slip = f.airborne ? 0 : Math.max(f.drift, f.handbrake && sp > 5 ? 0.75 : 0, wheelspin);

    // tyre smoke + skid marks from the rear axle
    if (slip > 0.3 && !f.onGrass) {
      this.smokeAcc += slip * 50 * f.dt;
      for (const i of [2, 3]) {
        const c = f.contacts[i];
        if (!c) continue;
        while (this.smokeAcc >= 1) {
          this.smokeAcc -= 1;
          this.spawn(c, hx, hz, sp, 1, [0.95, 0.95, 0.97], 1.0 + Math.random() * 0.6);
        }
        if (slip > 0.4) this.skid(i - 2, c, f.yaw);
      }
    } else {
      this.lastSkid[0] = this.lastSkid[1] = null;
    }

    // dust off the tarmac
    if (f.onGrass && sp > 10 && !f.airborne) {
      this.dustAcc += sp * 0.9 * f.dt;
      for (let i = 0; i < 4; i++) {
        const c = f.contacts[i];
        if (!c) continue;
        while (this.dustAcc >= 1) {
          this.dustAcc -= 1;
          this.spawn(c, hx, hz, sp, 1, [0.8, 0.7, 0.5], 0.9 + Math.random() * 0.5);
        }
      }
    }
  }

  private spawn(c: Pt, hx: number, hz: number, sp: number, tintK: number, tint: number[], life: number): void {
    const i = this.pNext;
    this.pNext = (this.pNext + 1) % PARTICLES;
    const o = i * 3;
    this.pPos[o] = c.x + (Math.random() - 0.5) * 0.6;
    this.pPos[o + 1] = c.y + 0.15;
    this.pPos[o + 2] = c.z + (Math.random() - 0.5) * 0.6;
    this.pVel[o] = -hx * sp * 0.12 + (Math.random() - 0.5) * 1.6;
    this.pVel[o + 1] = 0.8 + Math.random() * 1.2;
    this.pVel[o + 2] = -hz * sp * 0.12 + (Math.random() - 0.5) * 1.6;
    this.pLife[i] = this.pMax[i] = life;
    this.pTint[o] = tint[0] * tintK;
    this.pTint[o + 1] = tint[1] * tintK;
    this.pTint[o + 2] = tint[2] * tintK;
  }

  private stepParticles(dt: number): void {
    for (let i = 0; i < PARTICLES; i++) {
      const o = i * 3;
      if (this.pLife[i] <= 0) {
        this.pAlpha[i] = 0;
        this.pPos[o + 1] = -1000;
        continue;
      }
      this.pLife[i] -= dt;
      const damp = 1 - Math.min(1, 1.6 * dt);
      this.pVel[o] *= damp;
      this.pVel[o + 2] *= damp;
      this.pPos[o] += this.pVel[o] * dt;
      this.pPos[o + 1] += this.pVel[o + 1] * dt;
      this.pPos[o + 2] += this.pVel[o + 2] * dt;
      const k = Math.max(0, this.pLife[i] / this.pMax[i]);
      this.pAlpha[i] = k * k * 0.5;
      this.pCol[o] = this.pTint[o];
      this.pCol[o + 1] = this.pTint[o + 1];
      this.pCol[o + 2] = this.pTint[o + 2];
    }
    (this.points.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.getAttribute("aAlpha") as THREE.BufferAttribute).needsUpdate = true;
  }

  private skid(side: number, c: Pt, yaw: number): void {
    const last = this.lastSkid[side];
    if (last && (c.x - last.x) ** 2 + (c.z - last.z) ** 2 < SKID_SPACING * SKID_SPACING) return;
    this.lastSkid[side] = { x: c.x, y: c.y, z: c.z };
    this.tmpQ.setFromAxisAngle(this.up, yaw);
    this.tmpP.set(c.x, c.y + 0.04, c.z);
    this.tmpS.set(1, 1, 1);
    this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
    this.skids.setMatrixAt(this.skidNext, this.tmpM);
    this.skidNext = (this.skidNext + 1) % SKIDS;
    this.skids.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.blobTex.dispose();
    this.blobMat.dispose();
    this.skids.geometry.dispose();
    (this.skids.material as THREE.Material).dispose();
    this.skids.dispose();
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    for (const b of this.wheelBlobs) (b.material as THREE.Material).dispose();
    (this.bodyBlob.material as THREE.Material).dispose();
    this.wheelBlobs[0]?.geometry.dispose();
  }
}
