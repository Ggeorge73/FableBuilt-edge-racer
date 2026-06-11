// ---------------------------------------------------------------------------
// SkyWorld — the Three.js renderer for Edge Racer: Realms of Light.
// A luminous ribbon of road suspended above an endless cloud sea, beneath a
// living gradient sky. Everything glows; everything drifts.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {
  GameState,
  SIM_WIDTH,
  Craft,
  WeaponType,
  realmForLevel,
  Realm,
} from './types';

const S = 0.08; // sim units -> world units
const PLAYER_SIM_Y = 540; // sim y that maps to world z = 0

function simToWorldX(x: number) {
  return (x - SIM_WIDTH / 2) * S;
}
function simToWorldZ(y: number) {
  return (y - PLAYER_SIM_Y) * S;
}

const WEAPON_COLORS: Record<WeaponType, number> = {
  GUST: 0x8fe8ff,
  AURA: 0xffe49a,
  SHARD: 0xffa8d0,
};

// ------------------------------------------------------------------ shaders
const SKY_VERT = /* glsl */ `
varying vec3 vWorldPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const SKY_FRAG = /* glsl */ `
varying vec3 vWorldPos;
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uBottom;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform float uSunIntensity;
uniform float uStarAmount;
uniform float uTime;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

void main() {
  vec3 dir = normalize(vWorldPos);
  float h = dir.y;

  // three-stop vertical gradient with soft horizon band
  vec3 col;
  if (h > 0.0) {
    col = mix(uHorizon, uTop, pow(smoothstep(0.0, 0.85, h), 0.8));
  } else {
    col = mix(uHorizon, uBottom, smoothstep(0.0, -0.45, h));
  }

  // sun: a huge soft god-glow plus a tighter core
  float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
  col += uSunColor * pow(sunDot, 350.0) * 2.2 * uSunIntensity;   // core
  col += uSunColor * pow(sunDot, 18.0) * 0.55 * uSunIntensity;   // halo
  col += uSunColor * pow(sunDot, 3.5) * 0.18 * uSunIntensity;    // wash

  // stars fade in with realm darkness, twinkling slowly
  if (uStarAmount > 0.01 && h > 0.05) {
    vec3 sp = floor(dir * 220.0);
    float star = hash(sp);
    float twinkle = 0.75 + 0.25 * sin(uTime * 1.5 + star * 40.0);
    float s = smoothstep(0.997, 1.0, star) * uStarAmount * twinkle;
    col += vec3(s) * smoothstep(0.05, 0.4, h);
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

const ROAD_VERT = /* glsl */ `
varying vec2 vUv;
varying float vZ;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vZ = wp.z;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const ROAD_FRAG = /* glsl */ `
varying vec2 vUv;
varying float vZ;
uniform vec3 uRoadColor;
uniform vec3 uEdgeGlow;
uniform vec3 uLaneColor;
uniform float uScroll;
uniform float uTime;

void main() {
  float x = vUv.x; // 0..1 across road width

  // translucent glassy body, brighter toward edges
  vec3 col = uRoadColor;
  float alpha = 0.82;

  // flowing energy streaks racing forward
  float streak = sin((vUv.y * 0.18 - uScroll * 0.045) * 6.2831) * 0.5 + 0.5;
  streak = pow(streak, 6.0);
  col += uEdgeGlow * streak * 0.12;

  // soft inner gradient (depth illusion)
  float centerFade = smoothstep(0.0, 0.5, abs(x - 0.5));
  col = mix(col * 1.15, col * 0.92, centerFade);

  // the silver thread (median) — beautiful but forbidden
  float lane = smoothstep(0.012, 0.0, abs(x - 0.5) - 0.006);
  float lanePulse = 0.7 + 0.3 * sin(uTime * 2.0);
  col += uLaneColor * lane * 0.9 * lanePulse;

  // luminous edges — the boundary between flight and the fall
  float edgeL = smoothstep(0.055, 0.0, x);
  float edgeR = smoothstep(0.055, 0.0, 1.0 - x);
  float edge = max(edgeL, edgeR);
  col += uEdgeGlow * edge * 1.6;
  alpha = max(alpha, edge);

  gl_FragColor = vec4(col, alpha);
}
`;

const CLOUD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const CLOUD_FRAG = /* glsl */ `
varying vec2 vUv;
uniform vec3 uCloudColor;
uniform vec3 uFogColor;
uniform float uTime;
uniform float uScroll;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  v += 0.5 * noise(p);
  v += 0.25 * noise(p * 2.1 + 4.7);
  v += 0.125 * noise(p * 4.3 + 9.1);
  return v;
}

void main() {
  vec2 p = vUv * 26.0;
  p.y += uScroll * 0.06;       // clouds stream beneath you
  p.x += sin(uTime * 0.05) * 0.6;
  float n = fbm(p + fbm(p * 0.5 + uTime * 0.03) * 1.6);

  vec3 col = mix(uFogColor, uCloudColor, smoothstep(0.35, 0.75, n));
  col += uCloudColor * smoothstep(0.72, 0.95, n) * 0.35; // sunlit crests

  // fade to fog color at the far edges so the sea melts into the sky
  float edge = smoothstep(0.5, 0.18, distance(vUv, vec2(0.5)));
  col = mix(uFogColor, col, edge);

  gl_FragColor = vec4(col, 1.0);
}
`;

const BURST_VERT = /* glsl */ `
attribute float aLife;
attribute float aSize;
attribute vec3 aColor;
varying float vLife;
varying vec3 vColor;
void main() {
  vLife = aLife;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (60.0 / -mv.z) * aLife;
  gl_Position = projectionMatrix * mv;
}
`;

const BURST_FRAG = /* glsl */ `
varying float vLife;
varying vec3 vColor;
void main() {
  float d = distance(gl_PointCoord, vec2(0.5));
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.0, d) * vLife;
  gl_FragColor = vec4(vColor, a);
}
`;

// ------------------------------------------------------------- craft factory
function makeCraft(scale: number, coreColor: number, wingColor: number): THREE.Group {
  const g = new THREE.Group();

  // sleek elongated body — a sliver of light
  const bodyGeo = new THREE.ConeGeometry(0.42, 3.4, 6);
  bodyGeo.rotateX(-Math.PI / 2);
  const bodyMat = new THREE.MeshBasicMaterial({ color: coreColor });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.scale.y = 0.55;
  g.add(body);

  // swept luminous wings
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0.7);
  wingShape.quadraticCurveTo(1.9, 0.3, 2.6, -1.5);
  wingShape.quadraticCurveTo(1.2, -0.55, 0, -0.75);
  wingShape.lineTo(0, 0.7);
  const wingGeo = new THREE.ShapeGeometry(wingShape, 12);
  const wingMat = new THREE.MeshBasicMaterial({
    color: wingColor,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
  });
  const wingL = new THREE.Mesh(wingGeo, wingMat);
  wingL.rotation.x = -Math.PI / 2;
  wingL.position.set(-0.25, 0, 0.25);
  wingL.scale.x = -1;
  const wingR = new THREE.Mesh(wingGeo, wingMat);
  wingR.rotation.x = -Math.PI / 2;
  wingR.position.set(0.25, 0, 0.25);
  g.add(wingL, wingR);

  // glowing heart of the craft
  const coreGeo = new THREE.SphereGeometry(0.34, 12, 12);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.position.set(0, 0.12, 0.3);
  g.add(core);

  g.scale.setScalar(scale);
  return g;
}

interface BurstParticle {
  alive: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  color: THREE.Color;
  size: number;
}

// ----------------------------------------------------------------- the world
export class SkyWorld {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;

  private skyMat: THREE.ShaderMaterial;
  private cloudMat: THREE.ShaderMaterial;
  private roadMat: THREE.ShaderMaterial;
  private roadGeo: THREE.BufferGeometry;
  private roadMesh: THREE.Mesh;

  private playerGroup: THREE.Group;
  private playerCraft: THREE.Group;
  private playerLight: THREE.PointLight;
  private auraMesh: THREE.Mesh;
  private shardRing: THREE.Mesh;

  private rivalPool: THREE.Group[] = [];
  private rivalWingMats: THREE.MeshBasicMaterial[] = [];

  private pickupPool: THREE.Group[] = [];
  private pickupCoreMats: THREE.MeshBasicMaterial[] = [];
  private pickupRingMats: THREE.MeshBasicMaterial[] = [];

  private obstaclePool: { group: THREE.Group; kind: string }[] = [];

  private trailGeo: THREE.BufferGeometry;
  private trailPositions: Float32Array;
  private trailHistory: THREE.Vector3[] = [];
  private trailMat: THREE.ShaderMaterial;

  private motes: THREE.Points;
  private motesVel: Float32Array;

  private rain: THREE.LineSegments;
  private rainMat: THREE.LineBasicMaterial;
  private rainVel: Float32Array;

  private bursts: BurstParticle[] = [];
  private burstPoints: THREE.Points;
  private burstGeo: THREE.BufferGeometry;

  private islands: THREE.Mesh[] = [];
  private islandMat: THREE.MeshBasicMaterial;

  private fog: THREE.FogExp2;

  // smoothly interpolated realm palette
  private cur = {
    skyTop: new THREE.Color(),
    skyHorizon: new THREE.Color(),
    skyBottom: new THREE.Color(),
    sunColor: new THREE.Color(),
    fogColor: new THREE.Color(),
    cloudColor: new THREE.Color(),
    roadColor: new THREE.Color(),
    roadEdgeGlow: new THREE.Color(),
    laneColor: new THREE.Color(),
    sunIntensity: 1,
    fogDensity: 0.026,
    starAmount: 0.15,
  };

  private time = 0;
  private camShakeSeed = Math.random() * 100;
  private currentFov = 62;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.fog = new THREE.FogExp2(0xeBC8d4, 0.026);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);
    this.camera.position.set(0, 5.4, 12);

    // ------------------------------------------------------------------ sky
    const firstRealm = realmForLevel(1).realm;
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: {
        uTop: { value: new THREE.Color(firstRealm.skyTop) },
        uHorizon: { value: new THREE.Color(firstRealm.skyHorizon) },
        uBottom: { value: new THREE.Color(firstRealm.skyBottom) },
        uSunColor: { value: new THREE.Color(firstRealm.sunColor) },
        uSunDir: { value: new THREE.Vector3(0.18, 0.22, -1).normalize() },
        uSunIntensity: { value: firstRealm.sunIntensity },
        uStarAmount: { value: firstRealm.starAmount },
        uTime: { value: 0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 24), this.skyMat);
    this.scene.add(sky);

    // ------------------------------------------------------------ cloud sea
    this.cloudMat = new THREE.ShaderMaterial({
      vertexShader: CLOUD_VERT,
      fragmentShader: CLOUD_FRAG,
      uniforms: {
        uCloudColor: { value: new THREE.Color(firstRealm.cloudColor) },
        uFogColor: { value: new THREE.Color(firstRealm.fogColor) },
        uTime: { value: 0 },
        uScroll: { value: 0 },
      },
      fog: false,
      depthWrite: false,
    });
    const cloudPlane = new THREE.Mesh(new THREE.PlaneGeometry(500, 500, 1, 1), this.cloudMat);
    cloudPlane.rotation.x = -Math.PI / 2;
    cloudPlane.position.y = -9;
    this.scene.add(cloudPlane);

    // ----------------------------------------------------------------- road
    const MAX_SEGS = 140;
    this.roadGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(MAX_SEGS * 2 * 3);
    const uvs = new Float32Array(MAX_SEGS * 2 * 2);
    const indices: number[] = [];
    for (let i = 0; i < MAX_SEGS - 1; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.roadGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.roadGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    this.roadGeo.setIndex(indices);

    this.roadMat = new THREE.ShaderMaterial({
      vertexShader: ROAD_VERT,
      fragmentShader: ROAD_FRAG,
      uniforms: {
        uRoadColor: { value: new THREE.Color(firstRealm.roadColor) },
        uEdgeGlow: { value: new THREE.Color(firstRealm.roadEdgeGlow) },
        uLaneColor: { value: new THREE.Color(firstRealm.laneColor) },
        uScroll: { value: 0 },
        uTime: { value: 0 },
      },
      transparent: true,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.roadMesh = new THREE.Mesh(this.roadGeo, this.roadMat);
    this.roadMesh.frustumCulled = false;
    this.scene.add(this.roadMesh);

    // --------------------------------------------------------------- player
    this.playerGroup = new THREE.Group();
    this.playerCraft = makeCraft(1.0, 0xeaf6ff, 0xbfe6ff);
    this.playerGroup.add(this.playerCraft);

    this.playerLight = new THREE.PointLight(0xbfe6ff, 14, 30, 1.8);
    this.playerLight.position.set(0, 1.2, 0);
    this.playerGroup.add(this.playerLight);

    // Aura shield bubble
    const auraMat = new THREE.MeshBasicMaterial({
      color: 0xffe49a,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.auraMesh = new THREE.Mesh(new THREE.SphereGeometry(2.6, 24, 18), auraMat);
    this.playerGroup.add(this.auraMesh);

    // Shard blade ring
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffa8d0,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.shardRing = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.12, 8, 40), ringMat);
    this.shardRing.rotation.x = Math.PI / 2;
    this.playerGroup.add(this.shardRing);

    this.scene.add(this.playerGroup);

    // ----------------------------------------------------------------- trail
    const TRAIL_LEN = 36;
    for (let i = 0; i < TRAIL_LEN; i++) this.trailHistory.push(new THREE.Vector3());
    this.trailGeo = new THREE.BufferGeometry();
    this.trailPositions = new Float32Array(TRAIL_LEN * 2 * 3);
    const trailUv = new Float32Array(TRAIL_LEN * 2 * 2);
    for (let i = 0; i < TRAIL_LEN; i++) {
      const t = i / (TRAIL_LEN - 1);
      trailUv[(i * 2) * 2] = 0; trailUv[(i * 2) * 2 + 1] = t;
      trailUv[(i * 2 + 1) * 2] = 1; trailUv[(i * 2 + 1) * 2 + 1] = t;
    }
    const trailIdx: number[] = [];
    for (let i = 0; i < TRAIL_LEN - 1; i++) {
      const a = i * 2;
      trailIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3));
    this.trailGeo.setAttribute('uv', new THREE.BufferAttribute(trailUv, 2));
    this.trailGeo.setIndex(trailIdx);
    this.trailMat = new THREE.ShaderMaterial({
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying vec2 vUv;
        uniform vec3 uColor;
        void main(){
          float edge = smoothstep(0.5, 0.05, abs(vUv.x - 0.5));
          float fade = pow(vUv.y, 1.6);
          gl_FragColor = vec4(uColor, edge * fade * 0.85);
        }`,
      uniforms: { uColor: { value: new THREE.Color(0xbfe6ff) } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const trailMesh = new THREE.Mesh(this.trailGeo, this.trailMat);
    trailMesh.frustumCulled = false;
    this.scene.add(trailMesh);

    // ---------------------------------------------------------------- rivals
    for (let i = 0; i < 14; i++) {
      const wingColor = new THREE.Color().setHSL(Math.random(), 0.55, 0.72);
      const craft = makeCraft(0.95, 0xfff1e8, wingColor.getHex());
      craft.visible = false;
      this.scene.add(craft);
      this.rivalPool.push(craft);
      // wing material is the 2nd child's material
      const wing = craft.children[1] as THREE.Mesh;
      this.rivalWingMats.push(wing.material as THREE.MeshBasicMaterial);
    }

    // --------------------------------------------------------------- pickups
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 0), coreMat);
      g.add(core);
      const ringM = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.06, 8, 36), ringM);
      g.add(ring);
      g.visible = false;
      this.scene.add(g);
      this.pickupPool.push(g);
      this.pickupCoreMats.push(coreMat);
      this.pickupRingMats.push(ringM);
    }

    // ------------------------------------------------------------- obstacles
    for (let i = 0; i < 18; i++) {
      const g = new THREE.Group();
      // dark crystal
      const crystal = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.1, 0),
        new THREE.MeshBasicMaterial({ color: 0x2a3050 }),
      );
      crystal.name = 'crystal';
      const crystalRim = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.18, 0),
        new THREE.MeshBasicMaterial({
          color: 0x8fb8ff,
          wireframe: true,
          transparent: true,
          opacity: 0.5,
        }),
      );
      crystalRim.name = 'crystalRim';
      // storm core
      const storm = new THREE.Mesh(
        new THREE.SphereGeometry(0.95, 14, 12),
        new THREE.MeshBasicMaterial({ color: 0xff7a5c }),
      );
      storm.name = 'storm';
      // pool disc
      const pool = new THREE.Mesh(
        new THREE.CircleGeometry(1.9, 28),
        new THREE.MeshBasicMaterial({
          color: 0x4a3a66,
          transparent: true,
          opacity: 0.75,
          blending: THREE.NormalBlending,
          depthWrite: false,
        }),
      );
      pool.rotation.x = -Math.PI / 2;
      pool.position.y = 0.06;
      pool.name = 'pool';
      g.add(crystal, crystalRim, storm, pool);
      g.visible = false;
      this.scene.add(g);
      this.obstaclePool.push({ group: g, kind: '' });
    }

    // ------------------------------------------------------- ambient motes
    const MOTES = 350;
    const motePos = new Float32Array(MOTES * 3);
    this.motesVel = new Float32Array(MOTES * 3);
    for (let i = 0; i < MOTES; i++) {
      motePos[i * 3] = (Math.random() - 0.5) * 90;
      motePos[i * 3 + 1] = Math.random() * 22 - 2;
      motePos[i * 3 + 2] = -Math.random() * 80 + 14;
      this.motesVel[i * 3] = (Math.random() - 0.5) * 0.4;
      this.motesVel[i * 3 + 1] = Math.random() * 0.35 + 0.08;
      this.motesVel[i * 3 + 2] = 0;
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
    this.motes = new THREE.Points(
      moteGeo,
      new THREE.PointsMaterial({
        color: 0xfff6dc,
        size: 0.14,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    this.motes.frustumCulled = false;
    this.scene.add(this.motes);

    // ------------------------------------------------------------------ rain
    const RAIN = 260;
    const rainPos = new Float32Array(RAIN * 2 * 3);
    this.rainVel = new Float32Array(RAIN);
    for (let i = 0; i < RAIN; i++) {
      const x = (Math.random() - 0.5) * 70;
      const y = Math.random() * 30;
      const z = -Math.random() * 70 + 14;
      rainPos[i * 6] = x; rainPos[i * 6 + 1] = y; rainPos[i * 6 + 2] = z;
      rainPos[i * 6 + 3] = x; rainPos[i * 6 + 4] = y + 0.9; rainPos[i * 6 + 5] = z;
      this.rainVel[i] = 22 + Math.random() * 14;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    this.rainMat = new THREE.LineBasicMaterial({
      color: 0xcfe8ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.rain = new THREE.LineSegments(rainGeo, this.rainMat);
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);

    // ---------------------------------------------------------- burst pool
    const BURSTS = 600;
    for (let i = 0; i < BURSTS; i++) {
      this.bursts.push({
        alive: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        color: new THREE.Color(),
        size: 1,
      });
    }
    this.burstGeo = new THREE.BufferGeometry();
    this.burstGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BURSTS * 3), 3));
    this.burstGeo.setAttribute('aLife', new THREE.BufferAttribute(new Float32Array(BURSTS), 1));
    this.burstGeo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(BURSTS), 1));
    this.burstGeo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(BURSTS * 3), 3));
    const burstMat = new THREE.ShaderMaterial({
      vertexShader: BURST_VERT,
      fragmentShader: BURST_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.burstPoints = new THREE.Points(this.burstGeo, burstMat);
    this.burstPoints.frustumCulled = false;
    this.scene.add(this.burstPoints);

    // ------------------------------------------------------ floating islands
    this.islandMat = new THREE.MeshBasicMaterial({ color: 0x55628c });
    for (let i = 0; i < 14; i++) {
      const geo = new THREE.IcosahedronGeometry(2.5 + Math.random() * 5, 0);
      geo.scale(1, 0.55 + Math.random() * 0.5, 1);
      const m = new THREE.Mesh(geo, this.islandMat);
      const side = i % 2 === 0 ? -1 : 1;
      m.position.set(
        side * (30 + Math.random() * 45),
        Math.random() * 18 - 4,
        -Math.random() * 160 + 20,
      );
      m.rotation.set(Math.random(), Math.random() * Math.PI, Math.random() * 0.4);
      m.userData.driftPhase = Math.random() * Math.PI * 2;
      m.userData.baseY = m.position.y;
      this.scene.add(m);
      this.islands.push(m);
    }

    // -------------------------------------------------------- postprocessing
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.75, 0.55, 0.82);
    this.composer.addPass(this.bloom);

    this.applyRealmInstant(firstRealm);
  }

  // ----------------------------------------------------------------- realms
  private applyRealmInstant(realm: Realm) {
    this.cur.skyTop.setHex(realm.skyTop);
    this.cur.skyHorizon.setHex(realm.skyHorizon);
    this.cur.skyBottom.setHex(realm.skyBottom);
    this.cur.sunColor.setHex(realm.sunColor);
    this.cur.fogColor.setHex(realm.fogColor);
    this.cur.cloudColor.setHex(realm.cloudColor);
    this.cur.roadColor.setHex(realm.roadColor);
    this.cur.roadEdgeGlow.setHex(realm.roadEdgeGlow);
    this.cur.laneColor.setHex(realm.laneColor);
    this.cur.sunIntensity = realm.sunIntensity;
    this.cur.fogDensity = realm.fogDensity * 4;
    this.cur.starAmount = realm.starAmount;
  }

  private lerpRealm(realm: Realm, weatherFogMul: number, dt: number) {
    const t = Math.min(1, dt * 0.6); // slow, dreamlike transitions
    const tmp = new THREE.Color();
    this.cur.skyTop.lerp(tmp.setHex(realm.skyTop), t);
    this.cur.skyHorizon.lerp(tmp.setHex(realm.skyHorizon), t);
    this.cur.skyBottom.lerp(tmp.setHex(realm.skyBottom), t);
    this.cur.sunColor.lerp(tmp.setHex(realm.sunColor), t);
    this.cur.fogColor.lerp(tmp.setHex(realm.fogColor), t);
    this.cur.cloudColor.lerp(tmp.setHex(realm.cloudColor), t);
    this.cur.roadColor.lerp(tmp.setHex(realm.roadColor), t);
    this.cur.roadEdgeGlow.lerp(tmp.setHex(realm.roadEdgeGlow), t);
    this.cur.laneColor.lerp(tmp.setHex(realm.laneColor), t);
    this.cur.sunIntensity += (realm.sunIntensity - this.cur.sunIntensity) * t;
    this.cur.fogDensity += (realm.fogDensity * 4 * weatherFogMul - this.cur.fogDensity) * t;
    this.cur.starAmount += (realm.starAmount - this.cur.starAmount) * t;
  }

  // ----------------------------------------------------------------- bursts
  spawnBurst(simX: number, simY: number, colorHex: string, count: number) {
    const x = simToWorldX(simX);
    const z = simToWorldZ(simY);
    const c = new THREE.Color(colorHex);
    let spawned = 0;
    for (const bp of this.bursts) {
      if (spawned >= count) break;
      if (bp.alive) continue;
      bp.alive = true;
      bp.pos.set(x, 1 + Math.random() * 0.8, z);
      bp.vel.set(
        (Math.random() - 0.5) * 14,
        Math.random() * 9 + 1,
        (Math.random() - 0.5) * 14,
      );
      bp.maxLife = Math.random() * 0.5 + 0.35;
      bp.life = bp.maxLife;
      bp.color.copy(c);
      bp.size = Math.random() * 2.2 + 1.2;
      spawned++;
    }
  }

  // ----------------------------------------------------------------- update
  update(state: GameState, dt: number) {
    this.time += dt;
    const { realm } = realmForLevel(state.level);
    const weatherFogMul = state.weather === 'FOG' ? 2.4 : state.weather === 'RAIN' ? 1.45 : 1;
    this.lerpRealm(realm, weatherFogMul, dt);

    // consume engine events that need visuals
    for (const ev of state.events) {
      if (ev.type === 'burst') this.spawnBurst(ev.x, ev.y, ev.color, ev.count);
    }

    // ---- sky / fog / clouds
    const su = this.skyMat.uniforms;
    su.uTop.value.copy(this.cur.skyTop);
    su.uHorizon.value.copy(this.cur.skyHorizon);
    su.uBottom.value.copy(this.cur.skyBottom);
    su.uSunColor.value.copy(this.cur.sunColor);
    su.uSunIntensity.value = this.cur.sunIntensity * (state.weather === 'FOG' ? 0.55 : 1);
    su.uStarAmount.value = this.cur.starAmount;
    su.uTime.value = this.time;

    this.fog.color.copy(this.cur.fogColor);
    this.fog.density = this.cur.fogDensity;

    const cu = this.cloudMat.uniforms;
    cu.uCloudColor.value.copy(this.cur.cloudColor);
    cu.uFogColor.value.copy(this.cur.fogColor);
    cu.uTime.value = this.time;
    cu.uScroll.value = state.distance * 0.01;

    // ---- road ribbon rebuilt from sim segments
    const ru = this.roadMat.uniforms;
    ru.uRoadColor.value.copy(this.cur.roadColor);
    ru.uEdgeGlow.value.copy(this.cur.roadEdgeGlow);
    ru.uLaneColor.value.copy(this.cur.laneColor);
    ru.uScroll.value = state.distance * S;
    ru.uTime.value = this.time;

    const posAttr = this.roadGeo.getAttribute('position') as THREE.BufferAttribute;
    const uvAttr = this.roadGeo.getAttribute('uv') as THREE.BufferAttribute;
    const segs = state.road;
    const n = Math.min(segs.length, 140);
    for (let i = 0; i < n; i++) {
      // segs sorted y desc: i=0 nearest (bottom), increasing i goes far
      const seg = segs[i];
      const z = simToWorldZ(seg.y);
      const xl = simToWorldX(seg.centerX - seg.width / 2);
      const xr = simToWorldX(seg.centerX + seg.width / 2);
      posAttr.setXYZ(i * 2, xl, 0, z);
      posAttr.setXYZ(i * 2 + 1, xr, 0, z);
      uvAttr.setXY(i * 2, 0, seg.y + state.distance);
      uvAttr.setXY(i * 2 + 1, 1, seg.y + state.distance);
    }
    // collapse unused verts onto the last valid ones
    for (let i = n; i < 140; i++) {
      const last = Math.max(0, n - 1);
      posAttr.setXYZ(i * 2, posAttr.getX(last * 2), 0, posAttr.getZ(last * 2));
      posAttr.setXYZ(i * 2 + 1, posAttr.getX(last * 2 + 1), 0, posAttr.getZ(last * 2 + 1));
    }
    posAttr.needsUpdate = true;
    uvAttr.needsUpdate = true;

    // ---- player
    const p = state.player;
    const px = simToWorldX(p.x);
    const pz = simToWorldZ(p.y);
    let py = 0.9 + Math.sin(this.time * 2.2) * 0.12; // gentle hover-breathing
    if (p.isDead) {
      // the long fall into the cloud sea
      py = 0.9 - p.fallTimer * p.fallTimer * 7;
      this.playerCraft.rotation.z += dt * (2 + p.fallTimer * 3);
      this.playerCraft.rotation.x += dt * 1.2;
    } else {
      this.playerCraft.rotation.z = p.bank;
      this.playerCraft.rotation.x = Math.sin(this.time * 2.2) * 0.04;
    }
    this.playerGroup.position.set(px, py, pz);
    this.playerLight.intensity = p.isDead ? Math.max(0, 14 - p.fallTimer * 10) : 14;

    // aura / shard visuals
    const auraMat = this.auraMesh.material as THREE.MeshBasicMaterial;
    const shardMat = this.shardRing.material as THREE.MeshBasicMaterial;
    const weaponActive = p.weaponTimer > 0;
    auraMat.opacity +=
      ((weaponActive && p.activeWeapon === 'AURA' ? 0.4 : 0) - auraMat.opacity) *
      Math.min(1, dt * 10);
    this.auraMesh.scale.setScalar(1 + Math.sin(this.time * 6) * 0.05);
    shardMat.opacity +=
      ((weaponActive && p.activeWeapon === 'SHARD' ? 0.9 : 0) - shardMat.opacity) *
      Math.min(1, dt * 10);
    this.shardRing.rotation.z += dt * 9;

    // ---- trail
    this.trailHistory.pop();
    this.trailHistory.unshift(new THREE.Vector3(px, py - 0.1, pz + 0.8));
    const half = 0.55;
    for (let i = 0; i < this.trailHistory.length; i++) {
      const v = this.trailHistory[i];
      const w = half * (1 - i / this.trailHistory.length);
      const idx = (this.trailHistory.length - 1 - i) * 2; // uv.y=1 at head
      this.trailPositions[idx * 3] = v.x - w;
      this.trailPositions[idx * 3 + 1] = v.y;
      this.trailPositions[idx * 3 + 2] = v.z + i * 0.18;
      this.trailPositions[(idx + 1) * 3] = v.x + w;
      this.trailPositions[(idx + 1) * 3 + 1] = v.y;
      this.trailPositions[(idx + 1) * 3 + 2] = v.z + i * 0.18;
    }
    (this.trailGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.trailMat.uniforms.uColor.value as THREE.Color)
      .copy(this.cur.roadEdgeGlow)
      .lerp(new THREE.Color(0xffffff), 0.35 + state.nearMissGlow * 0.5);

    // ---- rivals
    for (let i = 0; i < this.rivalPool.length; i++) {
      const mesh = this.rivalPool[i];
      const rival = state.rivals[i];
      if (!rival) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      let ry = 0.9 + Math.sin(this.time * 2 + i) * 0.1;
      if (rival.isDead) {
        ry = 0.9 - rival.fallTimer * rival.fallTimer * 7;
        mesh.rotation.z += dt * 4;
      } else {
        mesh.rotation.z = rival.bank;
      }
      mesh.position.set(simToWorldX(rival.x), ry, simToWorldZ(rival.y));
    }

    // ---- pickups
    for (let i = 0; i < this.pickupPool.length; i++) {
      const g = this.pickupPool[i];
      const pk = state.pickups[i];
      if (!pk) {
        g.visible = false;
        continue;
      }
      g.visible = true;
      const c = WEAPON_COLORS[pk.type];
      this.pickupCoreMats[i].color.setHex(c);
      this.pickupRingMats[i].color.setHex(c);
      g.position.set(
        simToWorldX(pk.x),
        1.1 + Math.sin(this.time * 2.4 + pk.seed) * 0.3,
        simToWorldZ(pk.y),
      );
      g.rotation.y += dt * 1.8;
      g.children[1].rotation.x = this.time * 1.3 + pk.seed;
    }

    // ---- obstacles
    for (let i = 0; i < this.obstaclePool.length; i++) {
      const slot = this.obstaclePool[i];
      const o = state.obstacles[i];
      if (!o) {
        slot.group.visible = false;
        continue;
      }
      slot.group.visible = true;
      const crystal = slot.group.getObjectByName('crystal')!;
      const crystalRim = slot.group.getObjectByName('crystalRim')!;
      const storm = slot.group.getObjectByName('storm')!;
      const pool = slot.group.getObjectByName('pool')! as THREE.Mesh;
      crystal.visible = crystalRim.visible = o.type === 'CRYSTAL';
      storm.visible = o.type === 'STORMCORE';
      pool.visible = o.type === 'VOIDPOOL' || o.type === 'MISTPOOL';
      if (o.type === 'STORMCORE') {
        const s = 1 + Math.sin(this.time * 8 + o.seed) * 0.15;
        storm.scale.setScalar(s);
        (storm as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.color.setHex(
          Math.sin(this.time * 10 + o.seed) > 0 ? 0xff7a5c : 0xffb38a,
        );
      }
      if (pool.visible) {
        (pool.material as THREE.MeshBasicMaterial).color.setHex(
          o.type === 'MISTPOOL' ? 0x9fc4dd : 0x4a3a66,
        );
        (pool.material as THREE.MeshBasicMaterial).opacity =
          0.55 + Math.sin(this.time * 3 + o.seed) * 0.15;
      }
      if (o.type === 'CRYSTAL') {
        slot.group.rotation.y = o.seed + this.time * 0.4;
      } else {
        slot.group.rotation.y = 0;
      }
      slot.group.position.set(
        simToWorldX(o.x),
        o.type === 'VOIDPOOL' || o.type === 'MISTPOOL' ? 0 : 0.9,
        simToWorldZ(o.y),
      );
    }

    // ---- motes
    {
      const attr = this.motes.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      const scroll = state.speed * dt * S;
      for (let i = 0; i < arr.length / 3; i++) {
        arr[i * 3] += this.motesVel[i * 3] * dt;
        arr[i * 3 + 1] += this.motesVel[i * 3 + 1] * dt;
        arr[i * 3 + 2] += scroll * 0.8;
        if (arr[i * 3 + 2] > 16 || arr[i * 3 + 1] > 24) {
          arr[i * 3] = (Math.random() - 0.5) * 90;
          arr[i * 3 + 1] = Math.random() * 14 - 2;
          arr[i * 3 + 2] = -70 - Math.random() * 12;
        }
      }
      attr.needsUpdate = true;
    }

    // ---- rain
    {
      const targetOpacity = state.weather === 'RAIN' ? 0.55 : 0;
      this.rainMat.opacity += (targetOpacity - this.rainMat.opacity) * Math.min(1, dt * 2);
      if (this.rainMat.opacity > 0.01) {
        const attr = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute;
        const arr = attr.array as Float32Array;
        for (let i = 0; i < this.rainVel.length; i++) {
          const fall = this.rainVel[i] * dt;
          arr[i * 6 + 1] -= fall;
          arr[i * 6 + 4] -= fall;
          arr[i * 6 + 2] += state.speed * dt * S * 0.6;
          arr[i * 6 + 5] += state.speed * dt * S * 0.6;
          if (arr[i * 6 + 1] < -6) {
            const x = (Math.random() - 0.5) * 70;
            const y = 24 + Math.random() * 8;
            const z = -Math.random() * 70 + 14;
            arr[i * 6] = x; arr[i * 6 + 1] = y; arr[i * 6 + 2] = z;
            arr[i * 6 + 3] = x; arr[i * 6 + 4] = y + 0.9; arr[i * 6 + 5] = z;
          }
        }
        attr.needsUpdate = true;
      }
      this.rain.visible = this.rainMat.opacity > 0.01;
    }

    // ---- bursts
    {
      const posA = this.burstGeo.getAttribute('position') as THREE.BufferAttribute;
      const lifeA = this.burstGeo.getAttribute('aLife') as THREE.BufferAttribute;
      const sizeA = this.burstGeo.getAttribute('aSize') as THREE.BufferAttribute;
      const colA = this.burstGeo.getAttribute('aColor') as THREE.BufferAttribute;
      for (let i = 0; i < this.bursts.length; i++) {
        const bp = this.bursts[i];
        if (bp.alive) {
          bp.life -= dt;
          if (bp.life <= 0) bp.alive = false;
          bp.vel.y -= dt * 6;
          bp.pos.addScaledVector(bp.vel, dt);
          bp.pos.z += state.speed * dt * S;
        }
        if (bp.alive) {
          posA.setXYZ(i, bp.pos.x, bp.pos.y, bp.pos.z);
          lifeA.setX(i, bp.life / bp.maxLife);
          sizeA.setX(i, bp.size);
          colA.setXYZ(i, bp.color.r, bp.color.g, bp.color.b);
        } else {
          lifeA.setX(i, 0);
          posA.setXYZ(i, 0, -100, 0);
        }
      }
      posA.needsUpdate = true;
      lifeA.needsUpdate = true;
      sizeA.needsUpdate = true;
      colA.needsUpdate = true;
    }

    // ---- islands drift & recycle
    this.islandMat.color.copy(this.cur.fogColor).multiplyScalar(0.55);
    for (const isl of this.islands) {
      isl.position.z += state.speed * dt * S * 0.25; // gentle parallax
      isl.position.y =
        isl.userData.baseY + Math.sin(this.time * 0.25 + isl.userData.driftPhase) * 1.4;
      isl.rotation.y += dt * 0.02;
      if (isl.position.z > 40) {
        isl.position.z = -160 - Math.random() * 30;
        const side = Math.random() > 0.5 ? -1 : 1;
        isl.position.x = side * (30 + Math.random() * 45);
        isl.userData.baseY = Math.random() * 18 - 4;
      }
    }

    // ---- camera: floating chase with breathing, banking and shake
    const intensity = Math.min(1, (state.speed - 400) / 600);
    const targetFov = 60 + intensity * 14 + state.nearMissGlow * 5;
    this.currentFov += (targetFov - this.currentFov) * Math.min(1, dt * 3);
    this.camera.fov = this.currentFov;
    this.camera.updateProjectionMatrix();

    const camTx = px * 0.62;
    const camTy = 5.0 + Math.sin(this.time * 0.8) * 0.18 + (p.isDead ? p.fallTimer * 1.6 : 0);
    const camTz = pz + 11.5;
    const ease = Math.min(1, dt * 4.5);
    this.camera.position.x += (camTx - this.camera.position.x) * ease;
    this.camera.position.y += (camTy - this.camera.position.y) * ease;
    this.camera.position.z += (camTz - this.camera.position.z) * ease;

    if (state.screenShake > 0) {
      const s = state.screenShake * 0.012;
      this.camera.position.x += Math.sin(this.time * 70 + this.camShakeSeed) * s;
      this.camera.position.y += Math.cos(this.time * 63 + this.camShakeSeed * 2) * s;
    }

    const lookX = p.isDead ? px : px * 0.8;
    const lookY = p.isDead ? py : 1.3;
    const lookZ = pz - 14;
    this.camera.lookAt(lookX, lookY, lookZ);
    this.camera.rotation.z += p.isDead ? 0 : p.bank * 0.18; // subtle camera roll

    // bloom breathes with near misses and weapons
    this.bloom.strength = 0.72 + state.nearMissGlow * 0.4 + (weaponActive ? 0.18 : 0);

    this.composer.render();
  }

  resize(width: number, height: number) {
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.renderer.dispose();
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else if (mat) mat.dispose();
    });
  }
}
