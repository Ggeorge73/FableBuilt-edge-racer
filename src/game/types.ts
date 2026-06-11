// ---------------------------------------------------------------------------
// Edge Racer — Realms of Light
// Simulation-space types. The sim runs on a 2D plane (x lateral, y scroll)
// exactly like the original Edge Racer; the Three.js world projects it to 3D.
// ---------------------------------------------------------------------------

export const SIM_WIDTH = 500; // lateral domain of the simulation
export const SIM_HEIGHT = 900; // scroll-window of the simulation
export const CRAFT_WIDTH = 40;
export const CRAFT_LENGTH = 80;
export const ROAD_SEG_HEIGHT = 10;
export const BASE_SPEED = 400;

export type WeaponType = 'GUST' | 'AURA' | 'SHARD';

export const WEAPON_INFO: Record<WeaponType, { label: string; hint: string }> = {
  GUST: { label: 'Gust', hint: 'A burst of wind hurls rivals aside' },
  AURA: { label: 'Aura', hint: 'A shield of light — untouchable' },
  SHARD: { label: 'Shard', hint: 'Blades of starlight shred everything' },
};

export interface Craft {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  length: number;
  isPlayer: boolean;
  isDead: boolean;
  fallTimer: number; // counts up once dead (falling into the cloud sea)
  activeWeapon: WeaponType | null;
  weaponTimer: number;
  weaponCooldown: number;
  pushVelocityX: number;
  slipTimer: number;
  bank: number; // visual banking, radians
  hue: number; // light tint for rivals
}

export interface RoadSegment {
  y: number;
  centerX: number;
  width: number;
}

export type ObstacleType = 'CRYSTAL' | 'VOIDPOOL' | 'STORMCORE' | 'MISTPOOL';

export interface Obstacle {
  id: string;
  x: number;
  y: number;
  type: ObstacleType;
  radius: number;
  seed: number;
}

export interface Pickup {
  id: string;
  x: number;
  y: number;
  type: WeaponType;
  radius: number;
  seed: number;
}

export type WeatherType = 'NONE' | 'RAIN' | 'FOG';

// Visual/audio events emitted by the engine, consumed by world + audio.
export type GameEvent =
  | { type: 'burst'; x: number; y: number; color: string; count: number }
  | { type: 'pickup'; x: number; y: number; weapon: WeaponType }
  | { type: 'collision'; intensity: number }
  | { type: 'weapon'; weapon: WeaponType }
  | { type: 'shatter'; x: number; y: number }
  | { type: 'playerFall' }
  | { type: 'levelUp'; level: number }
  | { type: 'slip' };

export interface Whisper {
  text: string;
  timer: number;
  tone: 'taunt' | 'warning' | 'blessing';
}

export interface GameState {
  distance: number;
  speed: number;
  player: Craft;
  rivals: Craft[];
  road: RoadSegment[];
  isGameOver: boolean;
  timePlayed: number;
  level: number;
  pickups: Pickup[];
  obstacles: Obstacle[];
  gameOverTimer: number;
  screenShake: number;
  whisper: Whisper | null;
  weather: WeatherType;
  weatherTimer: number;
  medianViolationTimer: number;
  nearMissGlow: number; // 0..1 pulse when shaving past rivals/obstacles
  edgeProximity: number; // 0..1 how close player is to the edge (drives tension)
  events: GameEvent[];
}

// ---------------------------------------------------------------------------
// Realms — the world transforms as you ascend, like Sky's realms.
// ---------------------------------------------------------------------------
export interface Realm {
  name: string;
  blessing: string; // shown on entering
  skyTop: number;
  skyHorizon: number;
  skyBottom: number;
  sunColor: number;
  sunIntensity: number;
  fogColor: number;
  fogDensity: number;
  cloudColor: number;
  roadColor: number;
  roadEdgeGlow: number;
  laneColor: number;
  ambientColor: number;
  starAmount: number; // 0..1
}

export const REALMS: Realm[] = [
  {
    name: 'Aurora Meadow',
    blessing: 'The light welcomes you',
    skyTop: 0x4a6fb5,
    skyHorizon: 0xf6c8d8,
    skyBottom: 0xfceee3,
    sunColor: 0xfff0d4,
    sunIntensity: 1.0,
    fogColor: 0xeBC8d4,
    fogDensity: 0.0065,
    cloudColor: 0xfbe3ec,
    roadColor: 0x6f87c8,
    roadEdgeGlow: 0xaee8ff,
    laneColor: 0xfff3b0,
    ambientColor: 0xc9d4ff,
    starAmount: 0.15,
  },
  {
    name: 'Golden Wastes',
    blessing: 'Warm winds carry you onward',
    skyTop: 0x7a4a9e,
    skyHorizon: 0xffb36b,
    skyBottom: 0xffe2b8,
    sunColor: 0xffd9a0,
    sunIntensity: 1.25,
    fogColor: 0xf0a868,
    fogDensity: 0.0075,
    cloudColor: 0xffd2a1,
    roadColor: 0x9a6a4f,
    roadEdgeGlow: 0xffd27f,
    laneColor: 0xfff3c4,
    ambientColor: 0xffd9b0,
    starAmount: 0.1,
  },
  {
    name: 'Frost Veil',
    blessing: 'Even the cold glows here',
    skyTop: 0x16335e,
    skyHorizon: 0x9fd6ef,
    skyBottom: 0xe8f7ff,
    sunColor: 0xdff4ff,
    sunIntensity: 0.9,
    fogColor: 0xb6dcec,
    fogDensity: 0.009,
    cloudColor: 0xd8eef9,
    roadColor: 0x7c9fc4,
    roadEdgeGlow: 0x9ffcff,
    laneColor: 0xcdf6ff,
    ambientColor: 0xbfe1f0,
    starAmount: 0.45,
  },
  {
    name: 'Eden Storm',
    blessing: 'Hold your light close',
    skyTop: 0x0c1026,
    skyHorizon: 0x8c3b56,
    skyBottom: 0x3a2042,
    sunColor: 0xff9d7a,
    sunIntensity: 0.8,
    fogColor: 0x4a2740,
    fogDensity: 0.011,
    cloudColor: 0x57344f,
    roadColor: 0x554a78,
    roadEdgeGlow: 0xff8a9e,
    laneColor: 0xffc7a8,
    ambientColor: 0x6e5a8c,
    starAmount: 0.9,
  },
];

export function realmForLevel(level: number): { realm: Realm; index: number } {
  const index = Math.min(REALMS.length - 1, Math.floor((level - 1) / 2));
  return { realm: REALMS[index], index };
}
