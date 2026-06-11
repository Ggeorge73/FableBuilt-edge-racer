export let GAME_WIDTH = 500;
export let GAME_HEIGHT = 900;

export function setGameDimensions(w: number, h: number) {
  GAME_WIDTH = w;
  GAME_HEIGHT = h;
}

export const CAR_WIDTH = 40;
export const CAR_HEIGHT = 80;
export const ROAD_SEG_HEIGHT = 10;
export const BASE_SPEED = 400;

export type WeaponType = "BUMP" | "SHIELD" | "SAW";

export interface Car {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  color: string;
  isPlayer: boolean;
  isDead: boolean;
  activeWeapon: WeaponType | null;
  weaponTimer: number;
  weaponCooldown: number;
  pushVelocityX: number; // for being bumped
  slipTimer: number; // for oil spills
}

export interface RoadSegment {
  y: number; // World Y position (or screen Y if we scroll the road)
  centerX: number;
  width: number;
  leftBumper?: boolean;
  rightBumper?: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface GameState {
  distance: number;
  speed: number;
  player: Car;
  enemies: Car[];
  road: RoadSegment[];
  isGameOver: boolean;
  timePlayed: number;
  level: number;
  cameraY: number;
  pickups: Pickup[];
  particles: Particle[];
  obstacles: Obstacle[];
  gameOverTimer: number;
  screenShake: number;
  viewMode: "2D" | "3D";
  vKeyDown: boolean;
  activeTaunt: { text: string; timer: number } | null;
  weather: "NONE" | "RAIN" | "FOG";
  weatherTimer: number;
  medianViolationTimer: number;
}

export type ObstacleType = "ROCK" | "OIL" | "BARREL" | "PUDDLE";

export interface Obstacle {
  id: string;
  x: number;
  y: number;
  type: ObstacleType;
  radius: number;
}

export interface Pickup {
  id: string;
  x: number;
  y: number;
  type: WeaponType;
  radius: number;
}
