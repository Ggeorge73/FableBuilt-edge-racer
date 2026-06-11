// ---------------------------------------------------------------------------
// Edge Racer — Realms of Light — core simulation.
// Same soul as the original Edge Racer: the road wanders, narrows, and the
// edge is death. Rewritten with smoother physics (acceleration + damping
// instead of instant velocity) so movement feels fluid and dreamlike.
// ---------------------------------------------------------------------------
import {
  GameState,
  Craft,
  SIM_WIDTH,
  SIM_HEIGHT,
  CRAFT_WIDTH,
  CRAFT_LENGTH,
  ROAD_SEG_HEIGHT,
  BASE_SPEED,
  RoadSegment,
  WeaponType,
  ObstacleType,
  WeatherType,
  realmForLevel,
} from './types';

const MIN_ROAD_WIDTH = 120;
const MAX_ROAD_WIDTH = 350;

let targetRoadWidth = 250;
let targetRoadCenter = 250;
let lastRealmIndex = 0;

export function createInitialState(): GameState {
  targetRoadWidth = 250;
  targetRoadCenter = SIM_WIDTH / 2;
  lastRealmIndex = 0;
  enemySpawnTimer = 1.5;
  pickupSpawnTimer = 5;
  obstacleSpawnTimer = 3;

  const player: Craft = {
    id: 'player',
    x: SIM_WIDTH / 2,
    y: SIM_HEIGHT * 0.6,
    vx: 0,
    vy: 0,
    width: CRAFT_WIDTH,
    length: CRAFT_LENGTH,
    isPlayer: true,
    isDead: false,
    fallTimer: 0,
    activeWeapon: null,
    weaponTimer: 0,
    weaponCooldown: 0,
    pushVelocityX: 0,
    slipTimer: 0,
    bank: 0,
    hue: 0.55,
  };

  const road: RoadSegment[] = [];
  for (let y = SIM_HEIGHT; y >= -ROAD_SEG_HEIGHT; y -= ROAD_SEG_HEIGHT) {
    road.push({ y, centerX: SIM_WIDTH / 2, width: 250 });
  }

  return {
    distance: 0,
    speed: BASE_SPEED,
    player,
    rivals: [],
    road,
    isGameOver: false,
    timePlayed: 0,
    level: 1,
    pickups: [],
    obstacles: [],
    gameOverTimer: 0,
    screenShake: 0,
    whisper: null,
    weather: 'NONE',
    weatherTimer: 20,
    medianViolationTimer: 0,
    nearMissGlow: 0,
    edgeProximity: 0,
    events: [],
  };
}

export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  action: boolean;
  axisX: number; // -1..1 analog (touch joystick)
  axisY: number;
}

const TAUNTS = [
  'the wind laughs at you',
  'too slow, little light',
  'the edge is patient',
  'fly, don’t fall',
  'a spark against the storm',
  'the sky remembers',
  'graceless…',
  'shine brighter',
];

export function updateGameState(state: GameState, dt: number, input: InputState) {
  dt = Math.min(dt, 0.05);

  if (state.whisper) {
    state.whisper.timer -= dt;
    if (state.whisper.timer <= 0) state.whisper = null;
  }

  if (state.nearMissGlow > 0) state.nearMissGlow = Math.max(0, state.nearMissGlow - dt * 1.5);

  if (state.isGameOver) {
    state.gameOverTimer += dt;
    state.player.fallTimer += dt;
    if (state.screenShake > 0) state.screenShake = Math.max(0, state.screenShake - dt * 60);
    return;
  }

  if (state.screenShake > 0) {
    state.screenShake = Math.max(0, state.screenShake - dt * 60);
  }

  // -- Weather ---------------------------------------------------------------
  state.weatherTimer -= dt;
  if (state.weatherTimer <= 0) {
    const weathers: WeatherType[] = ['NONE', 'RAIN', 'FOG'];
    let randomW = weathers[Math.floor(Math.random() * weathers.length)];
    const noneChance = Math.max(0.1, 0.6 - state.level * 0.05);
    if (Math.random() < noneChance) randomW = 'NONE';
    state.weather = randomW;
    state.weatherTimer =
      randomW === 'NONE'
        ? Math.max(5, 15 - state.level + Math.random() * 10)
        : 10 + state.level * 2 + Math.random() * 15;
  }

  state.timePlayed += dt;

  // -- Progression -------------------------------------------------------------
  const prevLevel = state.level;
  state.level = 1 + Math.floor(state.distance / 5000);
  state.speed = BASE_SPEED + state.level * 60;
  if (state.level !== prevLevel) {
    const { index } = realmForLevel(state.level);
    state.events.push({ type: 'levelUp', level: state.level });
    if (index !== lastRealmIndex) {
      lastRealmIndex = index;
      const { realm } = realmForLevel(state.level);
      state.whisper = { text: `${realm.name} — ${realm.blessing}`, timer: 4, tone: 'blessing' };
    }
  }

  const scrollDist = state.speed * dt;
  state.distance += scrollDist;

  // -- Road ----------------------------------------------------------------
  for (let i = 0; i < state.road.length; i++) state.road[i].y += scrollDist;
  state.road = state.road.filter((seg) => seg.y < SIM_HEIGHT + ROAD_SEG_HEIGHT);

  const highestSeg = state.road[state.road.length - 1];
  let lastY = highestSeg ? highestSeg.y : 0;

  while (lastY > -ROAD_SEG_HEIGHT * 2) {
    lastY -= ROAD_SEG_HEIGHT;

    if (Math.random() < 0.02) {
      targetRoadWidth = Math.max(
        MIN_ROAD_WIDTH - state.level * 5,
        Math.min(
          MAX_ROAD_WIDTH,
          targetRoadWidth + (Math.random() - 0.5) * 300 - state.level * 15,
        ),
      );
      const minDistanceToEdge = Math.max(30, 50 - state.level * 2);
      targetRoadCenter = Math.max(
        targetRoadWidth / 2 + minDistanceToEdge,
        Math.min(
          SIM_WIDTH - targetRoadWidth / 2 - minDistanceToEdge,
          targetRoadCenter + (Math.random() - 0.5) * (400 + state.level * 100),
        ),
      );
    }

    const currentTopSeg = state.road[state.road.length - 1] || {
      centerX: SIM_WIDTH / 2,
      width: 250,
    };

    const newCenterX =
      currentTopSeg.centerX + (targetRoadCenter - currentTopSeg.centerX) * 0.05;
    const newWidth = currentTopSeg.width + (targetRoadWidth - currentTopSeg.width) * 0.05;

    state.road.push({ y: lastY, centerX: newCenterX, width: Math.max(80, newWidth) });
  }
  state.road.sort((a, b) => b.y - a.y);

  // -- Player input: acceleration model for sleek, gliding movement -----------
  const p = state.player;
  if (!p.isDead) {
    const maxLateral = 340;
    const accel = 2400;
    let targetVx = 0;
    if (input.axisX !== 0) targetVx = input.axisX * maxLateral;
    else if (input.left) targetVx = -maxLateral;
    else if (input.right) targetVx = maxLateral;

    // approach target velocity smoothly
    const dv = targetVx - p.vx;
    const maxDv = accel * dt;
    p.vx += Math.max(-maxDv, Math.min(maxDv, dv));

    let targetVy = 0;
    if (input.axisY !== 0) targetVy = input.axisY * maxLateral * 0.5;
    else if (input.up) targetVy = -maxLateral * 0.5;
    else if (input.down) targetVy = maxLateral * 0.5;
    else {
      const diffY = SIM_HEIGHT * 0.6 - p.y;
      targetVy = diffY * 2;
    }
    p.vy += Math.max(-maxDv, Math.min(maxDv, targetVy - p.vy));

    // banking follows lateral velocity (visual)
    const targetBank = -(p.vx + p.pushVelocityX) / maxLateral * 0.55;
    p.bank += (targetBank - p.bank) * Math.min(1, dt * 8);

    if (p.slipTimer > 0) {
      p.slipTimer -= dt;
      p.vx += (Math.random() - 0.5) * 800;
      if (p.weaponTimer > 0 && p.activeWeapon === 'AURA') p.slipTimer = 0;
    }
  } else {
    p.vx = 0;
    p.vy = 0;
  }

  // -- Weapon activation ----------------------------------------------------
  if (input.action && p.weaponCooldown <= 0 && p.activeWeapon) {
    p.weaponTimer = 0.6;
    p.weaponCooldown = 2.0;
    state.events.push({ type: 'weapon', weapon: p.activeWeapon });
  }
  if (p.weaponTimer > 0) {
    p.weaponTimer -= dt;
    if (p.weaponTimer <= 0) p.activeWeapon = null;
  }
  if (p.weaponCooldown > 0) p.weaponCooldown -= dt;

  updateCraft(p, dt, state.road);

  // -- Rivals -----------------------------------------------------------------
  spawnRivals(state, dt);
  spawnPickups(state, dt);
  spawnObstacles(state, dt);

  for (let i = state.rivals.length - 1; i >= 0; i--) {
    const rival = state.rivals[i];

    rival.y += scrollDist;
    rival.y -= BASE_SPEED * (rival.vy > 0 ? 1 : 0.8) * dt;

    const seg = getRoadSegmentAt(state.road, rival.y);
    if (seg) {
      if (rival.x < seg.centerX - 20) rival.vx = 150;
      else if (rival.x > seg.centerX + 20) rival.vx = -150;
      else rival.vx = 0;
    }
    rival.bank += ((-rival.vx / 340) * 0.45 - rival.bank) * Math.min(1, dt * 6);

    if (rival.slipTimer > 0) {
      rival.slipTimer -= dt;
      rival.vx += (Math.random() - 0.5) * 600;
    }

    const wasDead = rival.isDead;
    updateCraft(rival, dt, state.road);
    if (rival.isDead) rival.fallTimer += dt;

    if (!wasDead && rival.isDead) {
      // a rival slips off the edge — soft scatter of light as it falls
      state.events.push({ type: 'burst', x: rival.x, y: rival.y, color: '#ffd9e8', count: 16 });
    }

    // near miss detection
    if (!rival.isDead && !p.isDead) {
      const dx = Math.abs(rival.x - p.x);
      const dy = Math.abs(rival.y - p.y);
      if (dx < CRAFT_WIDTH * 1.6 && dx > CRAFT_WIDTH && dy < CRAFT_LENGTH * 0.8) {
        state.nearMissGlow = Math.min(1, state.nearMissGlow + dt * 4);
      }
    }

    // Collision player <-> rival
    if (!rival.isDead && !p.isDead && checkCollision(p, rival)) {
      state.events.push({ type: 'collision', intensity: 0.6 });
      const bounce = 200;
      if (p.x < rival.x) {
        rival.pushVelocityX = bounce;
        p.pushVelocityX = -bounce;
      } else {
        rival.pushVelocityX = -bounce;
        p.pushVelocityX = bounce;
      }

      if (!state.whisper) {
        state.whisper = {
          text: TAUNTS[Math.floor(Math.random() * TAUNTS.length)],
          timer: 2.5,
          tone: 'taunt',
        };
      }

      state.events.push({
        type: 'burst',
        x: (p.x + rival.x) / 2,
        y: (p.y + rival.y) / 2,
        color: '#ffe9a8',
        count: 18,
      });
      state.screenShake = Math.max(state.screenShake, 8);

      if (p.weaponTimer > 0 && p.activeWeapon === 'SHARD') {
        rival.pushVelocityX += rival.x > p.x ? 500 : -500;
        state.events.push({ type: 'shatter', x: rival.x, y: rival.y });
        state.events.push({ type: 'burst', x: rival.x, y: rival.y, color: '#ffd1e8', count: 30 });
      }
      if (p.weaponTimer > 0 && p.activeWeapon === 'GUST') {
        rival.pushVelocityX += rival.x > p.x ? 700 : -700;
      }
    }

    if (rival.y > SIM_HEIGHT + 200 || rival.fallTimer > 2.5) {
      state.rivals.splice(i, 1);
    }
  }

  // -- Pickups ----------------------------------------------------------------
  for (let i = state.pickups.length - 1; i >= 0; i--) {
    const pk = state.pickups[i];
    pk.y += scrollDist;

    if (!p.isDead && checkCircleRectCollision(pk.x, pk.y, pk.radius + 8, p)) {
      p.activeWeapon = pk.type;
      state.events.push({ type: 'pickup', x: pk.x, y: pk.y, weapon: pk.type });
      state.events.push({ type: 'burst', x: pk.x, y: pk.y, color: '#fff6cf', count: 14 });
      state.pickups.splice(i, 1);
    } else if (pk.y > SIM_HEIGHT + 100) {
      state.pickups.splice(i, 1);
    }
  }

  // -- Obstacles ----------------------------------------------------------------
  for (let i = state.obstacles.length - 1; i >= 0; i--) {
    const o = state.obstacles[i];
    o.y += scrollDist;

    for (const rival of state.rivals) {
      if (!rival.isDead && checkCircleRectCollision(o.x, o.y, o.radius, rival)) {
        if (o.type === 'CRYSTAL' || o.type === 'STORMCORE') {
          rival.vy -= 100;
          rival.pushVelocityX += rival.x > o.x ? 150 : -150;
        } else {
          rival.slipTimer = 1.0;
        }
      }
    }

    if (!p.isDead && checkCircleRectCollision(o.x, o.y, o.radius, p)) {
      const shieldActive = p.weaponTimer > 0 && p.activeWeapon === 'AURA';
      const shardActive = p.weaponTimer > 0 && p.activeWeapon === 'SHARD';

      if (o.type === 'CRYSTAL' || o.type === 'STORMCORE') {
        if (shieldActive || shardActive) {
          state.events.push({ type: 'shatter', x: o.x, y: o.y });
          state.events.push({
            type: 'burst',
            x: o.x,
            y: o.y,
            color: o.type === 'CRYSTAL' ? '#cfe8ff' : '#ffc09e',
            count: 22,
          });
          state.obstacles.splice(i, 1);
          continue;
        } else {
          state.events.push({ type: 'collision', intensity: 1 });
          state.screenShake = Math.max(state.screenShake, 15);
          p.vy = -300;
          p.pushVelocityX += p.x > o.x ? 300 : -300;
          if (o.type === 'STORMCORE') {
            state.events.push({ type: 'shatter', x: o.x, y: o.y });
            state.events.push({ type: 'burst', x: o.x, y: o.y, color: '#ff9d8a', count: 28 });
            state.obstacles.splice(i, 1);
            continue;
          }
        }
      } else {
        if (p.slipTimer <= 0) state.events.push({ type: 'slip' });
        p.slipTimer = 2.0;
      }
    }

    if (o.y > SIM_HEIGHT + 100) state.obstacles.splice(i, 1);
  }

  // -- Edge proximity & death -------------------------------------------------
  if (!p.isDead) {
    const seg = getRoadSegmentAt(state.road, p.y);
    if (seg) {
      const halfW = seg.width / 2;
      const offset = Math.abs(p.x - seg.centerX);
      state.edgeProximity = Math.max(0, Math.min(1, (offset - halfW * 0.45) / (halfW * 0.55)));
    }

    if (!isCraftOnRoad(p, state.road)) {
      p.isDead = true;
      state.isGameOver = true;
      state.events.push({ type: 'playerFall' });
      state.events.push({ type: 'burst', x: p.x, y: p.y, color: '#bfe3ff', count: 50 });
      state.screenShake = Math.max(state.screenShake, 20);
    } else if (seg) {
      // Median-line penalty (the "yellow line" of the original)
      if (Math.abs(p.x - seg.centerX) < 20) {
        state.medianViolationTimer += dt;
        if (state.medianViolationTimer > 2.0 && state.medianViolationTimer < 4.0) {
          if (!state.whisper || state.whisper.tone !== 'warning') {
            state.whisper = { text: 'drift from the silver thread…', timer: 0.6, tone: 'warning' };
          }
        } else if (state.medianViolationTimer >= 4.0) {
          state.whisper = { text: 'the thread takes its toll', timer: 0.6, tone: 'warning' };
          state.distance -= BASE_SPEED * dt * 2;
          if (state.distance < 0) state.distance = 0;
        }
      } else {
        state.medianViolationTimer = Math.max(0, state.medianViolationTimer - dt * 2);
      }
    }
  }
}

function updateCraft(craft: Craft, dt: number, road: RoadSegment[]) {
  craft.pushVelocityX *= Math.pow(0.9, dt * 60);
  craft.x += (craft.vx + craft.pushVelocityX) * dt;
  craft.y += craft.vy * dt;

  if (craft.isPlayer) {
    if (craft.y > SIM_HEIGHT * 0.75) craft.y = SIM_HEIGHT * 0.75;
    if (craft.y < SIM_HEIGHT * 0.1) craft.y = SIM_HEIGHT * 0.1;
  }

  if (!craft.isPlayer && !craft.isDead) {
    if (!isCraftOnRoad(craft, road)) craft.isDead = true;
  }
}

export function getRoadSegmentAt(road: RoadSegment[], y: number): RoadSegment | null {
  let minDiff = Infinity;
  let closest: RoadSegment | null = null;
  for (let i = 0; i < road.length; i++) {
    const diff = Math.abs(road[i].y - y);
    if (diff < minDiff) {
      minDiff = diff;
      closest = road[i];
    }
  }
  return closest;
}

function isCraftOnRoad(craft: Craft, road: RoadSegment[]): boolean {
  const seg = getRoadSegmentAt(road, craft.y);
  if (!seg) return false;
  const roadLeft = seg.centerX - seg.width / 2;
  const roadRight = seg.centerX + seg.width / 2;
  const left = craft.x - craft.width / 2;
  const right = craft.x + craft.width / 2;
  return left + craft.width * 0.2 > roadLeft && right - craft.width * 0.2 < roadRight;
}

function checkCollision(a: Craft, b: Craft) {
  return (
    a.x - a.width / 2 < b.x + b.width / 2 &&
    a.x + a.width / 2 > b.x - b.width / 2 &&
    a.y - a.length / 2 < b.y + b.length / 2 &&
    a.y + a.length / 2 > b.y - b.length / 2
  );
}

function checkCircleRectCollision(cx: number, cy: number, cr: number, rect: Craft) {
  const distX = Math.abs(cx - rect.x);
  const distY = Math.abs(cy - rect.y);
  if (distX > rect.width / 2 + cr) return false;
  if (distY > rect.length / 2 + cr) return false;
  if (distX <= rect.width / 2) return true;
  if (distY <= rect.length / 2) return true;
  const dx = distX - rect.width / 2;
  const dy = distY - rect.length / 2;
  return dx * dx + dy * dy <= cr * cr;
}

let enemySpawnTimer = 0;
function spawnRivals(state: GameState, dt: number) {
  enemySpawnTimer -= dt;
  if (enemySpawnTimer <= 0) {
    if (state.rivals.length < 3 + state.level) {
      const topSeg = state.road[state.road.length - 1];
      if (topSeg) {
        state.rivals.push({
          id: `rival_${Math.random()}`,
          x: topSeg.centerX + (Math.random() - 0.5) * topSeg.width * 0.5,
          y: -100,
          vx: 0,
          vy: 1,
          width: CRAFT_WIDTH,
          length: CRAFT_LENGTH,
          isPlayer: false,
          isDead: false,
          fallTimer: 0,
          activeWeapon: null,
          weaponTimer: 0,
          weaponCooldown: 0,
          pushVelocityX: 0,
          slipTimer: 0,
          bank: 0,
          hue: Math.random(),
        });
      }
    }
    enemySpawnTimer = Math.max(0.2, Math.random() * 2 + 1 - state.level * 0.2);
  }
}

let pickupSpawnTimer = 5;
function spawnPickups(state: GameState, dt: number) {
  pickupSpawnTimer -= dt;
  if (pickupSpawnTimer <= 0) {
    const topSeg = state.road[state.road.length - 1];
    if (topSeg && state.pickups.length < 2) {
      const types: WeaponType[] = ['GUST', 'AURA', 'SHARD'];
      state.pickups.push({
        id: `pickup_${Math.random()}`,
        x: topSeg.centerX + (Math.random() - 0.5) * topSeg.width * 0.8,
        y: -50,
        type: types[Math.floor(Math.random() * types.length)],
        radius: 15,
        seed: Math.random() * Math.PI * 2,
      });
    }
    pickupSpawnTimer = Math.random() * 10 + 5;
  }
}

let obstacleSpawnTimer = 2;
function spawnObstacles(state: GameState, dt: number) {
  obstacleSpawnTimer -= dt;
  if (obstacleSpawnTimer <= 0) {
    const topSeg = state.road[state.road.length - 1];
    if (topSeg && state.obstacles.length < 5 + state.level * 2) {
      let types: ObstacleType[] = ['CRYSTAL', 'VOIDPOOL', 'STORMCORE'];
      if (state.weather === 'RAIN') {
        types = ['MISTPOOL', 'MISTPOOL', 'CRYSTAL', 'STORMCORE'];
      }
      const type = types[Math.floor(Math.random() * types.length)];
      state.obstacles.push({
        id: `obs_${Math.random()}`,
        x: topSeg.centerX + (Math.random() - 0.5) * topSeg.width * 0.9,
        y: -100,
        type,
        radius: type === 'VOIDPOOL' || type === 'MISTPOOL' ? 25 : 18,
        seed: Math.random() * Math.PI * 2,
      });
    }
    obstacleSpawnTimer = Math.max(0.5, 3 - state.level * 0.3);
    if (state.weather === 'RAIN') obstacleSpawnTimer *= 0.5;
  }
}
