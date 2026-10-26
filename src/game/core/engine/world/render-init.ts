/** Renderer, composer and lighting setup. */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { JeepEngine } from "../jeep-engine";

export function initRenderer(this: JeepEngine): void {
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.15, this.Q.far * 2.4);
  camera.position.set(0, 6, 12);
  this.camera = camera;

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.Q.pixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.shadowMap.enabled = this.Q.shadowsOn;
  // PCFSoftShadowMap was removed in this three version (falls back with a
  // console warning) — use PCF directly.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  this.renderer = renderer;
  this.root?.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x8fb377, 0.0026);
  this.scene = scene;

  scene.add(new THREE.HemisphereLight(0xb8d8f8, 0x47702a, 1.15));
  scene.add(new THREE.AmbientLight(0xffe0b8, 0.45));

  const sun = new THREE.DirectionalLight(0xffd898, 3.2);
  sun.position.set(120, 110, -70);
  sun.castShadow = this.Q.shadowsOn;
  sun.shadow.mapSize.set(this.Q.shadow, this.Q.shadow);
  const S = 68;
  sun.shadow.camera.left = -S;
  sun.shadow.camera.right = S;
  sun.shadow.camera.top = S;
  sun.shadow.camera.bottom = -S;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 340;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.045;
  scene.add(sun);
  scene.add(sun.target);
  this.sunLight = sun;

  // procedural sky dome
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uSun: { value: new THREE.Vector3(0.62, 0.52, -0.4).normalize() },
    },
    vertexShader: `varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
    varying vec3 vP; uniform float uTime; uniform vec3 uSun;
    float h(vec2 p){ return fract(sin(dot(p,vec2(41.3,289.1)))*43758.5453); }
    float n2(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
      return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
    void main(){
      vec3 d=normalize(vP);
      float y=clamp(d.y*0.5+0.5,0.0,1.0);
      vec3 low=vec3(0.88,0.78,0.55);
      vec3 mid=vec3(0.42,0.65,0.88);
      vec3 top=vec3(0.15,0.35,0.72);
      vec3 c = mix(low, mid, smoothstep(0.44,0.58,y));
      c = mix(c, top, smoothstep(0.55,0.92,y));
      float sun=max(dot(d,normalize(uSun)),0.0);
      c += vec3(1.0,0.82,0.48)*pow(sun,32.0)*0.45;
      c += vec3(1.0,0.88,0.65)*pow(sun,5.0)*0.10;
      vec2 uv = d.xz/max(d.y,0.16)*0.45 + vec2(uTime*0.0035, uTime*0.0016);
      float cl = n2(uv)*0.55 + n2(uv*2.1+3.1)*0.3 + n2(uv*4.3-1.7)*0.15;
      cl = smoothstep(0.56,0.86,cl)*smoothstep(0.02,0.30,d.y);
      c = mix(c, vec3(0.97,0.95,0.92), cl*0.55);
      c = min(c, vec3(1.0));
      gl_FragColor=vec4(c,1.0);
    }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1200, 32, 20), skyMat);
  sky.frustumCulled = false;
  scene.add(sky);
  this.sky = sky;

  // post: bloom + warm jungle grade
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(
    new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.28, 0.85, 0.88),
  );
  const grade = new ShaderPass({
    uniforms: this.gradeShaderUniforms,
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
    uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      col = pow(col, vec3(0.92,0.96,1.04));
      col += vec3(0.038,0.025,0.006) * (1.0 - smoothstep(0.0,0.50,dot(col,vec3(0.333))));
      col *= vec3(1.06,1.03,0.94);
      col = mix(col, col*col*(3.0-2.0*col), 0.30);
      col = mix(vec3(dot(col,vec3(0.333))), col, 1.22);
      vec2 uvc = vUv - 0.5;
      float vig = 1.0 - dot(uvc,uvc)*0.45;
      col *= vig;
      gl_FragColor = vec4(col, c.a);
    }`,
  });
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  this.composer = composer;
}
