import {
  GameState,
  Car,
  GAME_WIDTH,
  GAME_HEIGHT,
  CAR_WIDTH,
  CAR_HEIGHT,
  ROAD_SEG_HEIGHT,
  BASE_SPEED,
  RoadSegment,
  WeaponType,
  Pickup,
  ObstacleType,
} from "./types";
import { audioManager } from "./audio";

// Constants for road generation
const MIN_ROAD_WIDTH = 120;
const MAX_ROAD_WIDTH = 350;
const ROAD_SWAY_SPEED = 0.5;

let targetRoadWidth = 250;
let targetRoadCenter = 250;
let roadTime = 0;

export function createInitialState(): GameState {
  targetRoadWidth = 250;
  targetRoadCenter = GAME_WIDTH / 2;
  roadTime = 0;

  const player: Car = {
    id: "player",
    x: GAME_WIDTH / 2,
    y: GAME_HEIGHT * 0.6, // Player stays around bottom 40% of screen
    vx: 0,
    vy: 0,
    width: CAR_WIDTH,
    height: CAR_HEIGHT,
    color: "#3b82f6", // blue
    isPlayer: true,
    isDead: false,
    activeWeapon: null,
    weaponTimer: 0,
    weaponCooldown: 0,
    pushVelocityX: 0,
    slipTimer: 0,
  };

  const road: RoadSegment[] = [];
  // Fill initial screen with road
  for (let y = GAME_HEIGHT; y >= -ROAD_SEG_HEIGHT; y -= ROAD_SEG_HEIGHT) {
    road.push({ y, centerX: GAME_WIDTH / 2, width: 250 });
  }

  return {
    distance: 0,
    speed: BASE_SPEED,
    player,
    enemies: [],
    road,
    isGameOver: false,
    timePlayed: 0,
    level: 1,
    cameraY: 0,
    pickups: [],
    particles: [],
    obstacles: [],
    gameOverTimer: 0,
    screenShake: 0,
    viewMode: "3D",
    vKeyDown: false,
    activeTaunt: null,
    weather: "NONE",
    weatherTimer: 20, // Start with some time before weather changes
    medianViolationTimer: 0,
  };
}

export function updateGameState(
  state: GameState,
  dt: number,
  keys: Record<string, boolean>,
) {
  if (keys["v"] || keys["V"]) {
    if (!state.vKeyDown) {
      state.viewMode = state.viewMode === "2D" ? "3D" : "2D";
      state.vKeyDown = true;
    }
  } else {
    state.vKeyDown = false;
  }

  if (state.activeTaunt) {
    state.activeTaunt.timer -= dt;
    if (state.activeTaunt.timer <= 0) {
      state.activeTaunt = null;
    }
  }

  if (state.isGameOver && state.gameOverTimer > 2.0) {
    return;
  }

  if (state.isGameOver) {
    state.gameOverTimer += dt;
  }

  if (state.screenShake > 0) {
    state.screenShake -= dt * 60; // rapid decay
    if (state.screenShake < 0) state.screenShake = 0;
  }

  // Weather system
  state.weatherTimer -= dt;
  if (state.weatherTimer <= 0) {
    const weathers: ("NONE" | "RAIN" | "FOG")[] = ["NONE", "RAIN", "FOG"];
    let randomW = weathers[Math.floor(Math.random() * weathers.length)];
    // As level goes up, decrease the chance of 'NONE'
    const noneChance = Math.max(0.1, 0.6 - state.level * 0.05);
    if (Math.random() < noneChance) randomW = "NONE";

    state.weather = randomW;

    if (state.weather === "NONE") {
      state.weatherTimer = Math.max(5, 15 - state.level + Math.random() * 10);
    } else {
      state.weatherTimer = 10 + state.level * 2 + Math.random() * 15;
    }
  }

  state.timePlayed += dt;

  // Progression
  state.level = 1 + Math.floor(state.distance / 5000); // Level up every 5000 units instead of 10000
  state.speed = BASE_SPEED + state.level * 60; // Increase speed scaling

  const scrollDist = state.speed * dt;
  state.distance += scrollDist;

  // Move Road
  for (let i = 0; i < state.road.length; i++) {
    state.road[i].y += scrollDist;
  }

  // Remove off-screen road segments
  state.road = state.road.filter(
    (seg) => seg.y < GAME_HEIGHT + ROAD_SEG_HEIGHT,
  );

  // Add new road segments at the top
  const highestSeg = state.road[state.road.length - 1]; // Because we pushed from bottom to top initially? Wait, initially we pushed y from GAME_HEIGHT down to 0. So last element is the top (lowest y).
  let lastY = highestSeg ? highestSeg.y : 0;

  while (lastY > -ROAD_SEG_HEIGHT * 2) {
    lastY -= ROAD_SEG_HEIGHT;
    roadTime += dt * 0.5;

    // Procedural generation
    if (Math.random() < 0.02) {
      // Change road behavior
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
          GAME_WIDTH - targetRoadWidth / 2 - minDistanceToEdge,
          targetRoadCenter + (Math.random() - 0.5) * (400 + state.level * 100),
        ),
      );
    }

    const currentTopSeg = state.road[state.road.length - 1] || {
      centerX: GAME_WIDTH / 2,
      width: 250,
    };

    // Smoothen out variations
    const newCenterX =
      currentTopSeg.centerX + (targetRoadCenter - currentTopSeg.centerX) * 0.05;
    const newWidth =
      currentTopSeg.width + (targetRoadWidth - currentTopSeg.width) * 0.05;

    state.road.push({
      y: lastY,
      centerX: newCenterX,
      width: Math.max(80, newWidth),
    });
  }

  // Sorting to keep the array ordered by Y descending (lowest y is top of screen, last element)
  state.road.sort((a, b) => b.y - a.y);

  // Player Input
  const playerSpeed = 300;
  if (!state.player.isDead) {
    if (keys["ArrowLeft"] || keys["a"]) {
      state.player.vx = -playerSpeed;
    } else if (keys["ArrowRight"] || keys["d"]) {
      state.player.vx = playerSpeed;
    } else {
      state.player.vx = 0;
    }

    if (keys["ArrowUp"] || keys["w"]) {
      state.player.vy = -playerSpeed * 0.5; // Slight forward movement
    } else if (keys["ArrowDown"] || keys["s"]) {
      state.player.vy = playerSpeed * 0.5; // Slight braking
    } else {
      // Auto center Y
      const diffY = GAME_HEIGHT * 0.6 - state.player.y;
      state.player.vy = diffY * 2;
    }

    if (state.player.slipTimer > 0) {
      state.player.slipTimer -= dt;
      // Add unpredictable sliding
      state.player.vx += (Math.random() - 0.5) * 800;
      if (
        state.player.weaponTimer > 0 &&
        state.player.activeWeapon === "SHIELD"
      ) {
        state.player.slipTimer = 0; // Shield neutralizes slip
      }
    }
  } else {
    state.player.vx = 0;
    state.player.vy = 0;
  }

  // Weapon activation
  if (
    keys[" "] &&
    state.player.weaponCooldown <= 0 &&
    state.player.activeWeapon
  ) {
    // Trigger weapon
    state.player.weaponTimer = 0.5; // seconds duration
    state.player.weaponCooldown = 2.0;
    audioManager.playWeapon();
  }

  if (state.player.weaponTimer > 0) {
    state.player.weaponTimer -= dt;
    if (state.player.weaponTimer <= 0) {
      state.player.activeWeapon = null; // Consume weapon? Or keep until next pickup. Let's consume on use for Bump/Shield
    }
  }
  if (state.player.weaponCooldown > 0) {
    state.player.weaponCooldown -= dt;
  }

  // Apply velocities
  updateCar(state.player, dt, state.road);

  // Particles
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    p.y += scrollDist; // Move with world
    if (p.life <= 0) {
      state.particles.splice(i, 1);
    }
  }

  // Enemies
  spawnEnemies(state, dt);
  spawnPickups(state, dt);
  spawnObstacles(state, dt);

  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const enemy = state.enemies[i];

    // Scroll enemy with road, + their own base speed relative to player
    // An enemy going at exactly BASE_SPEED stays still on Y.
    enemy.y += scrollDist; // move down with road
    enemy.y -= BASE_SPEED * (enemy.vy > 0 ? 1 : 0.8) * dt; // enemies might be slower or faster

    // Very simple AI: track road center
    const seg = getRoadSegmentAt(state.road, enemy.y);
    if (seg) {
      if (enemy.x < seg.centerX - 20) enemy.vx = 150;
      else if (enemy.x > seg.centerX + 20) enemy.vx = -150;
      else enemy.vx = 0;
    }

    if (enemy.slipTimer > 0) {
      enemy.slipTimer -= dt;
      enemy.vx += (Math.random() - 0.5) * 600;
    }

    const wasDead = enemy.isDead;
    updateCar(enemy, dt, state.road);

    if (!wasDead && enemy.isDead) {
      createExplosion(state, enemy.x, enemy.y, "#ef4444", 30);
    }

    // Collision between player and enemy
    if (!enemy.isDead && checkCollision(state.player, enemy)) {
      // Resolve collision by bumping
      audioManager.playCollision();
      const bounce = 200;
      if (state.player.x < enemy.x) {
        enemy.pushVelocityX = bounce;
        state.player.pushVelocityX = -bounce;
      } else {
        enemy.pushVelocityX = -bounce;
        state.player.pushVelocityX = bounce;
      }

      // Trigger a taunt
      if (!state.activeTaunt) {
        const taunts = [
          "EAT MY DUST!",
          "TOO SLOW!",
          "OUT OF MY WAY!",
          "WRECKED!",
          "IS THAT ALL?",
          "LEARN TO DRIVE!",
          "ROOKIE MISTAKE!",
          "SEE YA!",
        ];
        state.activeTaunt = {
          text: taunts[Math.floor(Math.random() * taunts.length)],
          timer: 2.5,
        };
      }

      createExplosion(
        state,
        (state.player.x + enemy.x) / 2,
        (state.player.y + enemy.y) / 2,
        "#fbbf24",
        15,
      );

      // Handle Active Weapons (Damage / Instakill)
      if (state.player.weaponTimer > 0 && state.player.activeWeapon === "SAW") {
        enemy.pushVelocityX += enemy.x > state.player.x ? 500 : -500; // Massive push
        audioManager.playExplosion();
        createExplosion(state, enemy.x, enemy.y, "#ef4444", 30);
      }
    }

    // Remove enemies off screen
    if (enemy.y > GAME_HEIGHT + 200 || enemy.isDead) {
      // wait, if they fall they fade, let's keep them briefly
      state.enemies.splice(i, 1);
    }
  }

  // Pickups
  for (let i = state.pickups.length - 1; i >= 0; i--) {
    const p = state.pickups[i];
    p.y += scrollDist;

    if (checkCircleRectCollision(p.x, p.y, p.radius, state.player)) {
      state.player.activeWeapon = p.type;
      state.pickups.splice(i, 1);
    } else if (p.y > GAME_HEIGHT + 100) {
      state.pickups.splice(i, 1);
    }
  }

  // Obstacles
  for (let i = state.obstacles.length - 1; i >= 0; i--) {
    const o = state.obstacles[i];
    o.y += scrollDist;

    // Enemy collisions with obstacles
    for (const enemy of state.enemies) {
      if (
        !enemy.isDead &&
        checkCircleRectCollision(o.x, o.y, o.radius, enemy)
      ) {
        if (o.type === "ROCK" || o.type === "BARREL") {
          enemy.vy -= 100; // bounce back
          enemy.pushVelocityX += enemy.x > o.x ? 150 : -150;
        } else if (o.type === "OIL" || o.type === "PUDDLE") {
          enemy.slipTimer = 1.0;
        }
      }
    }

    // Player collisions with obstacles
    if (
      !state.player.isDead &&
      checkCircleRectCollision(o.x, o.y, o.radius, state.player)
    ) {
      let shieldActive =
        state.player.weaponTimer > 0 && state.player.activeWeapon === "SHIELD";

      if (o.type === "ROCK" || o.type === "BARREL") {
        if (
          shieldActive ||
          (state.player.weaponTimer > 0 && state.player.activeWeapon === "SAW")
        ) {
          // Destroy obstacle
          if (o.type === "BARREL") audioManager.playExplosion();
          createExplosion(
            state,
            o.x,
            o.y,
            o.type === "ROCK" ? "#9ca3af" : "#fb923c",
            20,
          );
          state.obstacles.splice(i, 1);
          continue; // go to next obstacle since this is spliced
        } else {
          // Bounce player
          audioManager.playCollision();
          state.screenShake = Math.max(state.screenShake, 15);
          state.player.vy = -300;
          state.player.pushVelocityX += state.player.x > o.x ? 300 : -300;
          if (o.type === "BARREL") {
            audioManager.playExplosion();
            createExplosion(state, o.x, o.y, "#ef4444", 30);
            state.obstacles.splice(i, 1);
            continue;
          }
        }
      } else if (o.type === "OIL" || o.type === "PUDDLE") {
        state.player.slipTimer = 2.0;
      }
    }

    if (o.y > GAME_HEIGHT + 100) {
      state.obstacles.splice(i, 1);
    }
  }

  // Check Game Over (Player off road)
  if (!state.player.isDead) {
    if (!isCarOnRoad(state.player, state.road)) {
      state.player.isDead = true;
      state.isGameOver = true;
      audioManager.playExplosion();
      createExplosion(state, state.player.x, state.player.y, "#3b82f6", 60);
    } else {
      // Median driving penalty
      const seg = getRoadSegmentAt(state.road, state.player.y);
      if (seg) {
        // If center of player is very close to center of road
        if (Math.abs(state.player.x - seg.centerX) < 20) {
          state.medianViolationTimer += dt;
          if (state.medianViolationTimer > 2.0 && state.medianViolationTimer < 4.0) {
            if (!state.activeTaunt || state.activeTaunt.text !== "PENALTY: -MILEAGE!") {
              state.activeTaunt = { text: "WARNING: GET OFF YELLOW LINE!", timer: 0.5 };
            }
          } else if (state.medianViolationTimer >= 4.0) {
            state.activeTaunt = { text: "PENALTY: -MILEAGE!", timer: 0.5 };
            state.distance -= BASE_SPEED * dt * 2; // deduct distance faster than they gain it
            if (state.distance < 0) state.distance = 0;
          }
        } else {
          state.medianViolationTimer -= dt * 2; // Recover quickly
          if (state.medianViolationTimer < 0) state.medianViolationTimer = 0;
        }
      }
    }
  }
}

function updateCar(car: Car, dt: number, road: RoadSegment[]) {
  // Apply push velocity friction
  car.pushVelocityX *= 0.9;

  car.x += (car.vx + car.pushVelocityX) * dt;
  car.y += car.vy * dt;

  // clamp player loosely to screen
  if (car.isPlayer) {
    if (car.y > GAME_HEIGHT * 0.75) car.y = GAME_HEIGHT * 0.75;
    if (car.y < GAME_HEIGHT * 0.1) car.y = GAME_HEIGHT * 0.1;
  }

  // Check if enemy falls off road
  if (!car.isPlayer && !car.isDead) {
    if (!isCarOnRoad(car, road)) {
      car.isDead = true;
    }
  }
}

function getRoadSegmentAt(road: RoadSegment[], y: number): RoadSegment | null {
  let minDiff = Infinity;
  let closest = null;
  for (let i = 0; i < road.length; i++) {
    const diff = Math.abs(road[i].y - y);
    if (diff < minDiff) {
      minDiff = diff;
      closest = road[i];
    }
  }
  return closest;
}

function isCarOnRoad(car: Car, road: RoadSegment[]): boolean {
  const seg = getRoadSegmentAt(road, car.y);
  if (!seg) return false;

  const roadLeft = seg.centerX - seg.width / 2;
  const roadRight = seg.centerX + seg.width / 2;

  const carLeft = car.x - car.width / 2;
  const carRight = car.x + car.width / 2;

  // Strict: center must be on road
  // Loose: just bounding box
  // Let's go strict to make it intense: a significant part of car must be on road
  return (
    carLeft + car.width * 0.2 > roadLeft &&
    carRight - car.width * 0.2 < roadRight
  );
}

function checkCollision(r1: Car, r2: Car) {
  return (
    r1.x - r1.width / 2 < r2.x + r2.width / 2 &&
    r1.x + r1.width / 2 > r2.x - r2.width / 2 &&
    r1.y - r1.height / 2 < r2.y + r2.height / 2 &&
    r1.y + r1.height / 2 > r2.y - r2.height / 2
  );
}

function checkCircleRectCollision(
  cx: number,
  cy: number,
  cr: number,
  rect: Car,
) {
  const distX = Math.abs(cx - rect.x);
  const distY = Math.abs(cy - rect.y);

  if (distX > rect.width / 2 + cr) {
    return false;
  }
  if (distY > rect.height / 2 + cr) {
    return false;
  }

  if (distX <= rect.width / 2) {
    return true;
  }
  if (distY <= rect.height / 2) {
    return true;
  }

  const dx = distX - rect.width / 2;
  const dy = distY - rect.height / 2;
  return dx * dx + dy * dy <= cr * cr;
}

let enemySpawnTimer = 0;
function spawnEnemies(state: GameState, dt: number) {
  enemySpawnTimer -= dt;
  if (enemySpawnTimer <= 0) {
    if (state.enemies.length < 3 + state.level) {
      // spawn at top
      const topSeg = state.road[state.road.length - 1];
      if (topSeg) {
        state.enemies.push({
          id: `enemy_${Math.random()}`,
          x: topSeg.centerX + (Math.random() - 0.5) * topSeg.width * 0.5,
          y: -100,
          vx: 0,
          vy: 1, // slightly slower than player base speed
          width: CAR_WIDTH,
          height: CAR_HEIGHT,
          color: "#ef4444", // red
          isPlayer: false,
          isDead: false,
          activeWeapon: null,
          weaponTimer: 0,
          weaponCooldown: 0,
          pushVelocityX: 0,
          slipTimer: 0,
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
      const types: WeaponType[] = ["BUMP", "SHIELD", "SAW"];
      state.pickups.push({
        id: `pickup_${Math.random()}`,
        x: topSeg.centerX + (Math.random() - 0.5) * topSeg.width * 0.8,
        y: -50,
        type: types[Math.floor(Math.random() * types.length)],
        radius: 15,
      });
    }
    pickupSpawnTimer = Math.random() * 10 + 5; // 5 to 15 seconds
  }
}

let obstacleSpawnTimer = 2;
function spawnObstacles(state: GameState, dt: number) {
  obstacleSpawnTimer -= dt;
  if (obstacleSpawnTimer <= 0) {
    const topSeg = state.road[state.road.length - 1];
    if (topSeg && state.obstacles.length < 5 + state.level * 2) {
      let types: ObstacleType[] = ["ROCK", "OIL", "BARREL"];
      if (state.weather === "RAIN") {
        types = ["PUDDLE", "PUDDLE", "ROCK", "BARREL"]; // Mostly puddles during rain
      }

      const type = types[Math.floor(Math.random() * types.length)];
      state.obstacles.push({
        id: `obs_${Math.random()}`,
        x: topSeg.centerX + (Math.random() - 0.5) * topSeg.width * 0.9,
        y: -100,
        type,
        radius: type === "OIL" || type === "PUDDLE" ? 25 : 18,
      });
    }
    obstacleSpawnTimer = Math.max(0.5, 3 - state.level * 0.3); // Faster spawn over time
    if (state.weather === "RAIN") obstacleSpawnTimer *= 0.5; // Spawn more often in rain
  }
}

export function createExplosion(
  state: GameState,
  x: number,
  y: number,
  color: string,
  count: number,
) {
  state.screenShake = Math.max(state.screenShake, count * 0.8);
  for (let i = 0; i < count; i++) {
    state.particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 600,
      vy: (Math.random() - 0.5) * 600,
      life: Math.random() * 0.4 + 0.2,
      maxLife: 0.6,
      color,
      size: Math.random() * 4 + 2,
    });
  }
}
