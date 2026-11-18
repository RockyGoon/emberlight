// The game's rules and state, with no drawing and no browser in it: the ember, its bolts, the
// shadow wisps and their orbs, the light shards, the waves and the upgrades between them.
// step() advances one fixed step and returns what happened as bit flags, so the caller can react
// (and play the matching sound) without the world knowing about screens or sound. Nothing here
// allocates after createWorld returns: every entity lives in a pool allocated once, at boot.
import { BOSS_RELICS, BOSSES, BULLET, ENEMY, FIELD, PLAYER, POOL, REALMS, RELICS, SHARD, UPGRADES, WAVE } from './config.js';
import { createRandom, pick, range } from './random.js';

export const KIND_CHASER = 0;
export const KIND_SHOOTER = 1;
export const KIND_SPLITTER = 2;
export const KIND_MINI = 3;
export const KIND_TANK = 4;
export const KIND_BOSS = 5;
export const KIND_BOSS2 = 6;
export const KIND_BOSS3 = 7;

/** True when the kind is one of the three bosses. */
export function isBossKind(kind) {
  return kind === KIND_BOSS || kind === KIND_BOSS2 || kind === KIND_BOSS3;
}

/** The boss of a boss wave: wave 5 Void Wisp, 10 Tidekeeper, 15 Ashen Sovereign, then repeat. */
export function bossKindForWave(wave) {
  if (wave % WAVE.bossEvery !== 0) return null;
  return [KIND_BOSS, KIND_BOSS2, KIND_BOSS3][(Math.floor(wave / WAVE.bossEvery) - 1) % 3];
}

/** The realm of a wave: realms alternate every five waves. */
export function realmForWave(wave) {
  return (Math.floor((wave - 1) / WAVE.bossEvery) % 2) + 1;
}

export const EVENT_HIT = 1;
export const EVENT_DIE = 2;
export const EVENT_PICKUP = 4;
export const EVENT_WAVE_CLEAR = 8;
export const EVENT_OVER = 16;
export const EVENT_BOSS = 32;
export const EVENT_SHOOT = 64;

const TWO_PI = Math.PI * 2;

/** The spec for each KIND_*, in the same order as the constants above. */
const KIND_SPEC = [ENEMY.chaser, ENEMY.shooter, ENEMY.splitter, ENEMY.mini, ENEMY.tank, ENEMY.boss, ENEMY.boss2, ENEMY.boss3];

/** The display name of a boss kind, for the HUD bar and banners. */
export function bossName(kind) {
  if (kind === KIND_BOSS2) return 'THE TIDEKEEPER';
  if (kind === KIND_BOSS3) return 'THE ASHEN SOVEREIGN';
  return 'THE VOID WISP';
}

function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function makePool(size, make) {
  const pool = [];
  for (let index = 0; index < size; index += 1) pool.push(make());
  return pool;
}

export function createWorld(seed) {
  let random = createRandom(seed);
  const player = {
    x: FIELD.width / 2, y: FIELD.height / 2, vx: 0, vy: 0,
    radius: PLAYER.radius, hp: PLAYER.maxHp, maxHp: PLAYER.maxHp,
    speed: PLAYER.speed, fireTimer: 0, fireInterval: PLAYER.fireInterval,
    damage: PLAYER.bulletDamage, bulletSpeed: PLAYER.bulletSpeed,
    pierce: 0, spread: 0, magnetRadius: PLAYER.magnetRadius,
    aimX: FIELD.width / 2, aimY: FIELD.height / 2 - 100,
    invulnerable: 0, autoFire: false, dead: false,
    // New-upgrade stats: orbiting flames, nova level, crit chance, regen, shard value.
    orbit: 0, orbitAngle: 0, orbitTimer: 0, novaLevel: 0, novaTimer: 6,
    critChance: 0, regenInterval: 0, regenTimer: 0, shardValue: SHARD.value, bulletLife: 1,
  };
  const bullets = makePool(POOL.bullets, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, radius: 0, damage: 0, pierce: 0, life: 0 }));
  const enemies = makePool(POOL.enemies, () => ({ active: false, kind: KIND_CHASER, x: 0, y: 0, vx: 0, vy: 0, radius: 0, hp: 0, maxHp: 0, speed: 0, fireTimer: 0, angle: 0 }));
  const orbs = makePool(POOL.orbs, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, radius: 7, damage: 1, life: 0 }));
  const shards = makePool(POOL.shards, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, value: SHARD.value, life: 0 }));
  const particles = makePool(POOL.particles, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: '#ffffff' }));
  const texts = makePool(POOL.texts, () => ({ active: false, x: 0, y: 0, text: '', life: 0, maxLife: 1, color: '#ffffff', size: 20 }));
  const stars = [];
  for (let index = 0; index < 90; index += 1) {
    stars.push({ x: random() * FIELD.width, y: random() * FIELD.height, r: 0.6 + random() * 1.6, phase: random() * TWO_PI });
  }

  const state = {
    player, bullets, enemies, orbs, shards, particles, texts, stars,
    score: 0, shardsCollected: 0, kills: 0,
    wave: 0, phase: 'fighting', spawnQueue: [], spawnTimer: 0, spawnInterval: WAVE.spawnInterval,
    choices: [], upgradeCounts: {},
    shake: 0, flash: 0, elapsed: 0, demoAngle: 0,
    banner: { text: '', life: 0 },
    // Depth state: which realm the arena is in, and the relics the bosses dropped.
    realm: 1, relics: [], relicReviveUsed: false, shardHealCount: 0,
  };

  function free(pool) {
    for (let index = 0; index < pool.length; index += 1) if (!pool[index].active) return pool[index];
    return null;
  }

  function countActive(pool) {
    let count = 0;
    for (let index = 0; index < pool.length; index += 1) if (pool[index].active) count += 1;
    return count;
  }

  function burst(x, y, color, count, speed, size) {
    for (let index = 0; index < count; index += 1) {
      const particle = free(particles);
      if (particle === null) return;
      const angle = random() * TWO_PI;
      const velocity = speed * (0.3 + random() * 0.7);
      particle.active = true;
      particle.x = x;
      particle.y = y;
      particle.vx = Math.cos(angle) * velocity;
      particle.vy = Math.sin(angle) * velocity;
      particle.maxLife = 0.35 + random() * 0.4;
      particle.life = particle.maxLife;
      particle.size = size * (0.6 + random() * 0.8);
      particle.color = color;
    }
  }

  function floatText(x, y, text, color, size) {
    const entry = free(texts);
    if (entry === null) return;
    entry.active = true;
    entry.x = x;
    entry.y = y;
    entry.text = text;
    entry.maxLife = 0.9;
    entry.life = entry.maxLife;
    entry.color = color;
    entry.size = size;
  }

  function reset() {
    player.x = FIELD.width / 2;
    player.y = FIELD.height / 2;
    player.vx = 0;
    player.vy = 0;
    player.hp = PLAYER.maxHp;
    player.maxHp = PLAYER.maxHp;
    player.speed = PLAYER.speed;
    player.fireTimer = 0;
    player.fireInterval = PLAYER.fireInterval;
    player.damage = PLAYER.bulletDamage;
    player.bulletSpeed = PLAYER.bulletSpeed;
    player.pierce = 0;
    player.spread = 0;
    player.magnetRadius = PLAYER.magnetRadius;
    player.invulnerable = 0;
    player.dead = false;
    player.orbit = 0;
    player.orbitAngle = 0;
    player.orbitTimer = 0;
    player.novaLevel = 0;
    player.novaTimer = 6;
    player.critChance = 0;
    player.regenInterval = 0;
    player.regenTimer = 0;
    player.shardValue = SHARD.value;
    player.bulletLife = 1;
    for (const pool of [bullets, enemies, orbs, shards, particles, texts]) {
      for (const item of pool) item.active = false;
    }
    state.score = 0;
    state.shardsCollected = 0;
    state.kills = 0;
    state.wave = 0;
    state.phase = 'fighting';
    state.spawnQueue = [];
    state.spawnTimer = 0;
    state.choices = [];
    state.upgradeCounts = {};
    state.shake = 0;
    state.flash = 0;
    state.elapsed = 0;
    state.demoAngle = 0;
    state.banner.text = '';
    state.banner.life = 0;
    state.realm = 1;
    state.relics = [];
    state.relicReviveUsed = false;
    state.shardHealCount = 0;
  }

  /** The list of shadows for a wave: chasers always, then shooters, splitters and tanks unlock.
   *  Boss waves open with that cycle's boss; the Tidekeeper's escort is shooters, the
   *  Sovereign's is tanks, and the Sunken Deep (realm 2) waves lean on shooters too. */
  function waveQueue(wave) {
    const total = WAVE.baseCount + WAVE.perWave * (wave - 1);
    const queue = [];
    const bossKind = bossKindForWave(wave);
    if (bossKind !== null) {
      queue.push(bossKind);
      for (let index = 1; index < total; index += 1) {
        if (bossKind === KIND_BOSS2) queue.push(random() < 0.6 ? KIND_SHOOTER : KIND_MINI);
        else if (bossKind === KIND_BOSS3) queue.push(random() < 0.5 ? KIND_TANK : KIND_MINI);
        else queue.push(random() < 0.5 ? KIND_CHASER : KIND_MINI);
      }
    } else {
      for (let index = 0; index < total; index += 1) {
        const roll = random();
        if (wave >= 4 && roll < 0.14) queue.push(KIND_TANK);
        else if (wave >= 3 && roll < 0.3) queue.push(KIND_SPLITTER);
        else if (wave >= 2 && roll < (realmForWave(wave) === 2 ? 0.62 : 0.5)) queue.push(KIND_SHOOTER);
        else queue.push(KIND_CHASER);
      }
    }
    // Shuffle so the kinds arrive mixed — but a boss wave always opens with its boss,
    // so the fight starts at once and the escort trickles in behind it.
    const shuffleFrom = bossKind !== null ? 1 : 0;
    for (let index = queue.length - 1; index > shuffleFrom; index -= 1) {
      const other = shuffleFrom + Math.floor(random() * (index + 1 - shuffleFrom));
      const held = queue[index];
      queue[index] = queue[other];
      queue[other] = held;
    }
    return queue;
  }

  function startWave(wave) {
    state.wave = wave;
    state.phase = 'fighting';
    state.spawnQueue = waveQueue(wave);
    const realm = realmForWave(wave);
    const realmChanged = realm !== state.realm;
    state.realm = realm;
    // The Sunken Deep spawns a little faster than the Ashen Expanse.
    const realmFactor = realm === 2 ? 0.88 : 1;
    state.spawnInterval = Math.max(WAVE.minInterval, WAVE.spawnInterval * WAVE.intervalScale ** (wave - 1) * realmFactor);
    state.spawnTimer = WAVE.firstDelay;
    // A big fading banner names the wave as it starts, so the player always knows the stakes.
    const bossKind = bossKindForWave(wave);
    if (bossKind !== null) {
      state.banner.text = BOSSES[(Math.floor(wave / WAVE.bossEvery) - 1) % 3].banner;
      state.banner.life = 1.8;
      return EVENT_BOSS;
    }
    if (realmChanged) {
      state.banner.text = `REALM ${realm === 1 ? 'I' : 'II'} — ${REALMS[realm - 1].name.toUpperCase()}`;
      state.banner.life = 1.8;
      return 0;
    }
    state.banner.text = `WAVE ${wave}`;
    state.banner.life = 1.8;
    return 0;
  }

  function spawnEnemy(kind) {
    const enemy = free(enemies);
    if (enemy === null) return;
    const spec = KIND_SPEC[kind];
    // Pick an arena edge, away from the ember.
    let x = 0;
    let y = 0;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const edge = Math.floor(random() * 4);
      if (edge === 0) { x = random() * FIELD.width; y = -spec.radius - 4; }
      else if (edge === 1) { x = random() * FIELD.width; y = FIELD.height + spec.radius + 4; }
      else if (edge === 2) { x = -spec.radius - 4; y = random() * FIELD.height; }
      else { x = FIELD.width + spec.radius + 4; y = random() * FIELD.height; }
      if (distance(x, y, player.x, player.y) > 180) break;
    }
    const hpBonus = isBossKind(kind)
      ? 12 * (Math.floor(state.wave / WAVE.bossEvery) - 1) + (kind === KIND_BOSS3 ? 10 : 0)
      : Math.floor((state.wave - 1) / WAVE.hpBonusEvery);
    enemy.active = true;
    enemy.kind = kind;
    enemy.x = x;
    enemy.y = y;
    enemy.vx = 0;
    enemy.vy = 0;
    enemy.radius = spec.radius;
    enemy.hp = spec.hp + hpBonus;
    enemy.maxHp = enemy.hp;
    enemy.speed = spec.speed * (0.9 + random() * 0.2);
    enemy.fireTimer = 1 + random() * 1.5;
    enemy.angle = random() * TWO_PI;
    enemy.dashTimer = isBossKind(kind) ? 5 : 0;
    enemy.dashTime = 0;
    burst(x, y, spec.color, 6, 90, 3);
  }

  function dropShards(x, y, count, value) {
    for (let index = 0; index < count; index += 1) {
      const shard = free(shards);
      if (shard === null) return;
      const angle = random() * TWO_PI;
      const speed = 60 + random() * 140;
      shard.active = true;
      shard.x = x;
      shard.y = y;
      shard.vx = Math.cos(angle) * speed;
      shard.vy = Math.sin(angle) * speed;
      shard.value = value;
      shard.life = SHARD.life;
    }
  }

  function hasRelic(id) {
    return state.relics.indexOf(id) >= 0;
  }

  /** A boss's loot: its relic pair joins the run, the banner names them, and the Lantern's
   *  magnet doubling applies at once. Later bosses repeat the cycle only if a relic was
   *  somehow missed; a relic already held is not granted twice. */
  function grantBossRelics(bossKind) {
    const cycle = (Math.floor(state.wave / WAVE.bossEvery) - 1) % 3;
    const granted = [];
    for (const id of BOSS_RELICS[cycle]) {
      if (hasRelic(id)) continue;
      state.relics.push(id);
      granted.push(id);
      if (id === 'lantern') player.magnetRadius *= 2;
    }
    if (granted.length > 0) {
      const names = granted.map((id) => RELICS.find((relic) => relic.id === id).name).join(' + ');
      state.banner.text = `RELIC — ${names.toUpperCase()}`;
      state.banner.life = 2.4;
      floatText(player.x, player.y - 40, `RELIC: ${names}`, '#7CFC98', 24);
    }
    return granted;
  }

  /** The Storm Sigil's chain: a kill zaps the nearest other shadow within 300 for 3 damage. */
  function stormZap(killedX, killedY) {
    let nearest = null;
    let nearestDist = 300;
    for (let index = 0; index < enemies.length; index += 1) {
      const enemy = enemies[index];
      if (!enemy.active) continue;
      const dist = distance(enemy.x, enemy.y, killedX, killedY);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = enemy;
      }
    }
    if (nearest === null) return;
    burst(nearest.x, nearest.y, '#7dd3fc', 8, 140, 3);
    nearest.hp -= 3;
    if (nearest.hp <= 0) killEnemy(nearest);
  }

  function killEnemy(enemy) {
    const spec = KIND_SPEC[enemy.kind];
    enemy.active = false;
    state.kills += 1;
    state.score += spec.score;
    floatText(enemy.x, enemy.y - enemy.radius, `+${spec.score}`, '#ffe9a8', isBossKind(enemy.kind) ? 30 : 20);
    burst(enemy.x, enemy.y, spec.color, isBossKind(enemy.kind) ? 60 : 16, isBossKind(enemy.kind) ? 320 : 180, isBossKind(enemy.kind) ? 5 : 3);
    burst(enemy.x, enemy.y, '#ffffff', 6, 120, 2);
    dropShards(enemy.x, enemy.y, spec.shards, player.shardValue);
    if (hasRelic('storm')) stormZap(enemy.x, enemy.y);
    if (enemy.kind === KIND_SPLITTER) {
      for (let index = 0; index < 2; index += 1) {
        const mini = free(enemies);
        if (mini === null) break;
        const miniSpec = ENEMY.mini;
        mini.active = true;
        mini.kind = KIND_MINI;
        mini.x = enemy.x + (index === 0 ? -14 : 14);
        mini.y = enemy.y;
        mini.vx = 0;
        mini.vy = 0;
        mini.radius = miniSpec.radius;
        mini.hp = miniSpec.hp;
        mini.maxHp = miniSpec.hp;
        mini.speed = miniSpec.speed;
        mini.fireTimer = 0;
        mini.angle = random() * TWO_PI;
      }
    }
    if (isBossKind(enemy.kind)) {
      state.shake = Math.max(state.shake, 16);
      burst(enemy.x, enemy.y, '#e040fb', 40, 260, 4);
      grantBossRelics(enemy.kind);
    }
  }

  function hurtPlayer(fromX, fromY) {
    if (player.invulnerable > 0 || player.dead) return 0;
    player.hp -= 1;
    player.invulnerable = PLAYER.invulnerable;
    state.shake = Math.max(state.shake, 11);
    state.flash = 1;
    const away = Math.atan2(player.y - fromY, player.x - fromX);
    player.vx += Math.cos(away) * 320;
    player.vy += Math.sin(away) * 320;
    burst(player.x, player.y, '#ff5a6e', 18, 220, 3);
    if (player.hp <= 0) {
      // Phoenix Feather: the first fall is refused — back up at 1 heart, briefly untouchable.
      if (hasRelic('phoenix') && !state.relicReviveUsed) {
        state.relicReviveUsed = true;
        player.hp = 1;
        player.invulnerable = 3;
        state.banner.text = 'THE PHOENIX FEATHER BURNS — YOU RISE AGAIN';
        state.banner.life = 2.4;
        burst(player.x, player.y, '#ff9d00', 50, 300, 4);
        return EVENT_HIT;
      }
      player.dead = true;
      burst(player.x, player.y, '#ffc94d', 70, 340, 4);
      burst(player.x, player.y, '#ffffff', 30, 200, 3);
      return EVENT_HIT | EVENT_OVER;
    }
    return EVENT_HIT;
  }

  function fireBolts() {
    const count = 1 + player.spread;
    const baseAngle = Math.atan2(player.aimY - player.y, player.aimX - player.x);
    // A muzzle flash: a few bright sparks at the ember's edge, so every shot is seen as well as heard.
    burst(player.x + Math.cos(baseAngle) * (player.radius + 4), player.y + Math.sin(baseAngle) * (player.radius + 4), '#ffd54f', 3, 70, 2);
    for (let index = 0; index < count; index += 1) {
      const bullet = free(bullets);
      if (bullet === null) return;
      const offset = (index - (count - 1) / 2) * 0.13;
      const angle = baseAngle + offset;
      bullet.active = true;
      bullet.x = player.x + Math.cos(angle) * (player.radius + 6);
      bullet.y = player.y + Math.sin(angle) * (player.radius + 6);
      bullet.vx = Math.cos(angle) * player.bulletSpeed;
      bullet.vy = Math.sin(angle) * player.bulletSpeed;
      bullet.radius = hasRelic('titan') ? PLAYER.bulletRadius * 1.5 : PLAYER.bulletRadius;
      bullet.damage = player.damage;
      bullet.pierce = player.pierce;
      bullet.life = BULLET.life * (player.bulletLife || 1);
    }
  }

  function fireOrb(enemy) {
    const orb = free(orbs);
    if (orb === null) return;
    const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    orb.active = true;
    orb.x = enemy.x;
    orb.y = enemy.y;
    orb.vx = Math.cos(angle) * ENEMY.shooter.orbSpeed;
    orb.vy = Math.sin(angle) * ENEMY.shooter.orbSpeed;
    orb.life = 6;
  }

  function bossBurst(enemy) {
    for (let index = 0; index < 10; index += 1) {
      const orb = free(orbs);
      if (orb === null) return;
      const angle = (index / 10) * TWO_PI + enemy.angle;
      orb.active = true;
      orb.x = enemy.x;
      orb.y = enemy.y;
      orb.vx = Math.cos(angle) * 150;
      orb.vy = Math.sin(angle) * 150;
      orb.life = 6;
    }
    enemy.angle += 0.35;
  }

  /** The Tidekeeper's spiral: three orbs in a rotating fan, a slow corkscrew of light. */
  function boss2Spiral(enemy) {
    for (let index = -1; index <= 1; index += 1) {
      const orb = free(orbs);
      if (orb === null) return;
      const angle = enemy.angle + index * 0.35;
      orb.active = true;
      orb.x = enemy.x;
      orb.y = enemy.y;
      orb.vx = Math.cos(angle) * 190;
      orb.vy = Math.sin(angle) * 190;
      orb.life = 6;
    }
    enemy.angle += 0.55;
  }

  /** The Sovereign's ring: fourteen orbs in every direction at once. */
  function boss3Ring(enemy) {
    for (let index = 0; index < 14; index += 1) {
      const orb = free(orbs);
      if (orb === null) return;
      const angle = (index / 14) * TWO_PI + enemy.angle;
      orb.active = true;
      orb.x = enemy.x;
      orb.y = enemy.y;
      orb.vx = Math.cos(angle) * 140;
      orb.vy = Math.sin(angle) * 140;
      orb.life = 6;
    }
    enemy.angle += 0.22;
  }

  /** A boss's summoned escort: a shadow of the given kind, placed beside the boss. */
  function bossSummon(enemy, kind) {
    const spawned = free(enemies);
    if (spawned === null) return;
    const spec = KIND_SPEC[kind];
    spawned.active = true;
    spawned.kind = kind;
    spawned.x = enemy.x + range(random, -60, 60);
    spawned.y = enemy.y + range(random, -60, 60);
    spawned.vx = 0;
    spawned.vy = 0;
    spawned.radius = spec.radius;
    spawned.hp = spec.hp;
    spawned.maxHp = spec.hp;
    spawned.speed = spec.speed;
    spawned.fireTimer = 1;
    spawned.angle = random() * TWO_PI;
    burst(spawned.x, spawned.y, spec.color, 6, 90, 3);
  }

  /** Three distinct upgrades the ember has not maxed out yet. */
  function rollUpgrades() {
    const available = UPGRADES.filter((upgrade) => {
      const taken = state.upgradeCounts[upgrade.id] || 0;
      if (taken >= upgrade.max) return false;
      if (upgrade.id === 'heal' && player.hp >= player.maxHp) return false;
      return true;
    });
    const choices = [];
    const pool = available.slice();
    while (choices.length < 3 && pool.length > 0) {
      const index = Math.floor(random() * pool.length);
      choices.push(pool.splice(index, 1)[0]);
    }
    return choices;
  }

  function applyUpgrade(id) {
    const counts = state.upgradeCounts;
    counts[id] = (counts[id] || 0) + 1;
    if (id === 'spread') player.spread += 1;
    else if (id === 'rapid') player.fireInterval *= 0.82;
    else if (id === 'pierce') player.pierce += 1;
    else if (id === 'damage') player.damage += 1;
    else if (id === 'speed') player.speed *= 1.12;
    else if (id === 'magnet') player.magnetRadius *= 1.7;
    else if (id === 'shield') {
      player.maxHp += 1;
      player.hp = Math.min(player.maxHp, player.hp + 1);
    } else if (id === 'heal') {
      player.hp = Math.min(player.maxHp, player.hp + 2);
    } else if (id === 'orbit') {
      player.orbit += 1;
    } else if (id === 'nova') {
      player.novaLevel += 1;
      player.novaTimer = Math.min(player.novaTimer, 2);
    } else if (id === 'crit') {
      player.critChance = Math.min(0.6, player.critChance + 0.2);
    } else if (id === 'regen') {
      player.regenInterval = player.regenInterval === 0 ? 30 : player.regenInterval * 0.7;
      player.regenTimer = player.regenInterval;
    } else if (id === 'swiftbolt') {
      player.bulletSpeed *= 1.25;
      player.bulletLife *= 1.15;
    } else if (id === 'greed') {
      player.shardValue += 5;
    }
    state.choices = [];
    return startWave(state.wave + 1);
  }

  function moveEnemy(enemy, dt, targetX, targetY, speed) {
    const angle = Math.atan2(targetY - enemy.y, targetX - enemy.x);
    enemy.vx += Math.cos(angle) * speed * 4 * dt;
    enemy.vy += Math.sin(angle) * speed * 4 * dt;
    const velocity = Math.hypot(enemy.vx, enemy.vy);
    if (velocity > speed) {
      enemy.vx = (enemy.vx / velocity) * speed;
      enemy.vy = (enemy.vy / velocity) * speed;
    }
    enemy.x += enemy.vx * dt;
    enemy.y += enemy.vy * dt;
  }

  /**
   * One fixed step. `input` steers the ember: moveX/moveY (-1..1), aimX/aimY in field
   * coordinates, firing while the trigger is held. Returns what happened as EVENT_* flags.
   */
  function step(dt, input) {
    let events = 0;
    state.elapsed += dt;
    if (player.dead) {
      updateAmbient(dt);
      return 0;
    }

    // Steering: accelerate toward the held direction, then drag, then integrate.
    player.vx += input.moveX * PLAYER.accel * dt;
    player.vy += input.moveY * PLAYER.accel * dt;
    player.vx *= Math.max(0, 1 - 6 * dt);
    player.vy *= Math.max(0, 1 - 6 * dt);
    const speed = Math.hypot(player.vx, player.vy);
    if (speed > player.speed) {
      player.vx = (player.vx / speed) * player.speed;
      player.vy = (player.vy / speed) * player.speed;
    }
    player.x = Math.min(FIELD.width - player.radius, Math.max(player.radius, player.x + player.vx * dt));
    player.y = Math.min(FIELD.height - player.radius, Math.max(player.radius, player.y + player.vy * dt));
    player.aimX = input.aimX;
    player.aimY = input.aimY;
    if (player.invulnerable > 0) player.invulnerable = Math.max(0, player.invulnerable - dt);

    // Shooting.
    player.fireTimer -= dt;
    const firing = input.firing || player.autoFire;
    if (firing && player.fireTimer <= 0) {
      fireBolts();
      player.fireTimer = player.fireInterval;
      events |= EVENT_SHOOT;
    }

    // Orbiting Ember: flames circle the ember and burn any shadow they touch, twice a second.
    if (player.orbit > 0) {
      player.orbitAngle += dt * 3.2;
      player.orbitTimer -= dt;
      if (player.orbitTimer <= 0) {
        player.orbitTimer = 0.5;
        for (let orbiter = 0; orbiter < player.orbit; orbiter += 1) {
          const angle = player.orbitAngle + (orbiter / player.orbit) * TWO_PI;
          const ox = player.x + Math.cos(angle) * 72;
          const oy = player.y + Math.sin(angle) * 72;
          for (let index = 0; index < enemies.length; index += 1) {
            const enemy = enemies[index];
            if (!enemy.active) continue;
            if (distance(ox, oy, enemy.x, enemy.y) > 30 + enemy.radius) continue;
            enemy.hp -= 1;
            burst(enemy.x, enemy.y, '#ffd54f', 3, 90, 2);
            if (enemy.hp <= 0) {
              killEnemy(enemy);
              events |= EVENT_DIE;
            }
          }
        }
      }
    }

    // Ember Nova: a shockwave every six seconds, burning every shadow near the ember.
    if (player.novaLevel > 0) {
      player.novaTimer -= dt;
      if (player.novaTimer <= 0) {
        player.novaTimer = 6;
        const radius = 150 + 40 * player.novaLevel;
        const damage = 1 + player.novaLevel;
        burst(player.x, player.y, '#ff9d00', 36, 320, 4);
        for (let index = 0; index < enemies.length; index += 1) {
          const enemy = enemies[index];
          if (!enemy.active) continue;
          if (distance(enemy.x, enemy.y, player.x, player.y) > radius + enemy.radius) continue;
          enemy.hp -= damage;
          if (enemy.hp <= 0) {
            killEnemy(enemy);
            events |= EVENT_DIE;
          }
        }
      }
    }

    // Slow Burn: a heart returns on a slow timer while the ember still stands.
    if (player.regenInterval > 0) {
      player.regenTimer -= dt;
      if (player.regenTimer <= 0) {
        player.regenTimer = player.regenInterval;
        if (player.hp < player.maxHp) {
          player.hp += 1;
          floatText(player.x, player.y - 30, '+1', '#ff8fa3', 20);
        }
      }
    }

    // Spawning: from wave 2 the shadows arrive in pairs, so the arena fills faster.
    if (state.phase === 'fighting' && state.spawnQueue.length > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        const group = state.wave >= 2 ? 2 : 1;
        for (let n = 0; n < group && state.spawnQueue.length > 0; n += 1) {
          spawnEnemy(state.spawnQueue.shift());
        }
        state.spawnTimer = state.spawnInterval * (0.85 + random() * 0.3);
      }
    }

    // Enemies.
    for (let index = 0; index < enemies.length; index += 1) {
      const enemy = enemies[index];
      if (!enemy.active) continue;
      const dist = distance(enemy.x, enemy.y, player.x, player.y);
      // Frostbrand Aura: shadows close to the ember move 30% slower.
      const frostSlow = hasRelic('frost') && dist < 170 ? 0.7 : 1;
      if (enemy.kind === KIND_SHOOTER) {
        if (dist > 280) moveEnemy(enemy, dt, player.x, player.y, enemy.speed * frostSlow);
        else if (dist < 170) moveEnemy(enemy, dt, enemy.x + (enemy.x - player.x), enemy.y + (enemy.y - player.y), enemy.speed * frostSlow);
        else {
          enemy.x += enemy.vx * dt;
          enemy.y += enemy.vy * dt;
        }
        enemy.fireTimer -= dt;
        if (enemy.fireTimer <= 0 && dist < 520) {
          fireOrb(enemy);
          enemy.fireTimer = ENEMY.shooter.orbInterval * (0.9 + random() * 0.2);
        }
      } else if (enemy.kind === KIND_BOSS) {
        moveEnemy(enemy, dt, player.x, player.y, enemy.speed * frostSlow);
        enemy.fireTimer -= dt;
        if (enemy.fireTimer <= 0) {
          bossBurst(enemy);
          enemy.fireTimer = 2.6;
          if (countActive(enemies) < 14) {
            for (let mini = 0; mini < 2; mini += 1) {
              const spawned = free(enemies);
              if (spawned === null) break;
              const spec = ENEMY.mini;
              spawned.active = true;
              spawned.kind = KIND_MINI;
              spawned.x = enemy.x + range(random, -50, 50);
              spawned.y = enemy.y + range(random, -50, 50);
              spawned.vx = 0;
              spawned.vy = 0;
              spawned.radius = spec.radius;
              spawned.hp = spec.hp;
              spawned.maxHp = spec.hp;
              spawned.speed = spec.speed;
              spawned.fireTimer = 0;
              spawned.angle = random() * TWO_PI;
            }
          }
        }
      } else if (enemy.kind === KIND_BOSS2) {
        // The Tidekeeper: a slow spiral of orbs, and every few seconds a telegraphed
        // dash straight at the ember — the dash is fast, but it always pauses first.
        if (enemy.dashTime > 0) {
          enemy.dashTime -= dt;
          enemy.x += enemy.vx * dt;
          enemy.y += enemy.vy * dt;
        } else {
          moveEnemy(enemy, dt, player.x, player.y, enemy.speed * frostSlow);
          enemy.fireTimer -= dt;
          if (enemy.fireTimer <= 0) {
            boss2Spiral(enemy);
            enemy.fireTimer = 1.4;
          }
          enemy.dashTimer -= dt;
          if (enemy.dashTimer <= 0) {
            const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
            enemy.vx = Math.cos(angle) * 430;
            enemy.vy = Math.sin(angle) * 430;
            enemy.dashTime = 0.45;
            enemy.dashTimer = 6.5;
            burst(enemy.x, enemy.y, '#22d3ee', 14, 200, 3);
          }
        }
      } else if (enemy.kind === KIND_BOSS3) {
        // The Ashen Sovereign: a slow march, a full ring of orbs, and it calls two tanks
        // to its side. Below half health it enrages — faster, and the ring comes twice as often.
        const enraged = enemy.hp < enemy.maxHp / 2;
        moveEnemy(enemy, dt, player.x, player.y, enemy.speed * (enraged ? 1.6 : 1) * frostSlow);
        enemy.fireTimer -= dt;
        if (enemy.fireTimer <= 0) {
          boss3Ring(enemy);
          enemy.fireTimer = enraged ? 1.6 : 3.1;
        }
        enemy.dashTimer -= dt;
        if (enemy.dashTimer <= 0) {
          bossSummon(enemy, KIND_TANK);
          bossSummon(enemy, KIND_TANK);
          enemy.dashTimer = 9;
        }
      } else {
        moveEnemy(enemy, dt, player.x, player.y, enemy.speed * frostSlow);
      }
      enemy.x = Math.min(FIELD.width + 60, Math.max(-60, enemy.x));
      enemy.y = Math.min(FIELD.height + 60, Math.max(-60, enemy.y));
      if (!player.dead && dist < enemy.radius + player.radius && player.invulnerable === 0) {
        events |= hurtPlayer(enemy.x, enemy.y);
        enemy.vx -= Math.cos(Math.atan2(player.y - enemy.y, player.x - enemy.x)) * 120;
        enemy.vy -= Math.sin(Math.atan2(player.y - enemy.y, player.x - enemy.x)) * 120;
        if (player.dead) break;
      }
    }

    // Bolts.
    for (let index = 0; index < bullets.length; index += 1) {
      const bullet = bullets[index];
      if (!bullet.active) continue;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      if (bullet.life <= 0 || bullet.x < -20 || bullet.x > FIELD.width + 20 || bullet.y < -20 || bullet.y > FIELD.height + 20) {
        bullet.active = false;
        continue;
      }
      for (let other = 0; other < enemies.length; other += 1) {
        const enemy = enemies[other];
        if (!enemy.active) continue;
        if (distance(bullet.x, bullet.y, enemy.x, enemy.y) > bullet.radius + enemy.radius) continue;
        // Kindled Edge: a crit doubles the bolt's damage and says so.
        const crit = random() < player.critChance;
        enemy.hp -= crit ? bullet.damage * 2 : bullet.damage;
        if (crit) floatText(bullet.x, bullet.y - 12, 'CRIT', '#ffea00', 18);
        burst(bullet.x, bullet.y, '#ffd54f', 3, 110, 2);
        if (enemy.hp <= 0) {
          killEnemy(enemy);
          events |= EVENT_DIE;
        }
        if (bullet.pierce > 0) {
          bullet.pierce -= 1;
        } else {
          bullet.active = false;
        }
        break;
      }
    }

    // Shadow orbs.
    for (let index = 0; index < orbs.length; index += 1) {
      const orb = orbs[index];
      if (!orb.active) continue;
      orb.x += orb.vx * dt;
      orb.y += orb.vy * dt;
      orb.life -= dt;
      if (orb.life <= 0 || orb.x < -20 || orb.x > FIELD.width + 20 || orb.y < -20 || orb.y > FIELD.height + 20) {
        orb.active = false;
        continue;
      }
      if (!player.dead && player.invulnerable === 0 && distance(orb.x, orb.y, player.x, player.y) < orb.radius + player.radius) {
        orb.active = false;
        events |= hurtPlayer(orb.x, orb.y);
        if (player.dead) break;
      }
    }

    // Shards: drift, then magnetize toward the ember, then collect.
    for (let index = 0; index < shards.length; index += 1) {
      const shard = shards[index];
      if (!shard.active) continue;
      shard.life -= dt;
      if (shard.life <= 0) {
        shard.active = false;
        continue;
      }
      const dist = distance(shard.x, shard.y, player.x, player.y);
      if (dist < player.magnetRadius) {
        const angle = Math.atan2(player.y - shard.y, player.x - shard.x);
        shard.vx += Math.cos(angle) * SHARD.magnetSpeed * 3 * dt;
        shard.vy += Math.sin(angle) * SHARD.magnetSpeed * 3 * dt;
      } else {
        shard.vx *= Math.max(0, 1 - 2 * dt);
        shard.vy *= Math.max(0, 1 - 2 * dt);
      }
      shard.x += shard.vx * dt;
      shard.y += shard.vy * dt;
      if (!player.dead && dist < player.radius + 10) {
        shard.active = false;
        state.score += shard.value;
        state.shardsCollected += 1;
        // Bloodmoon Charm: every fifteenth shard knits a heart back together.
        if (hasRelic('bloodmoon')) {
          state.shardHealCount += 1;
          if (state.shardHealCount >= 15) {
            state.shardHealCount = 0;
            if (player.hp < player.maxHp) {
              player.hp += 1;
              floatText(player.x, player.y - 30, '+1', '#ff8fa3', 20);
            }
          }
        }
        burst(shard.x, shard.y, '#ffca28', 4, 90, 2);
        events |= EVENT_PICKUP;
      }
    }

    updateAmbient(dt);

    // Wave cleared: the queue is empty and no shadow is left standing.
    if (state.phase === 'fighting' && state.spawnQueue.length === 0 && countActive(enemies) === 0) {
      state.phase = 'upgrade';
      state.choices = rollUpgrades();
      events |= EVENT_WAVE_CLEAR;
    }
    return events;
  }

  /** Particles, floating text, shake and flash: they run even after the ember falls. */
  function updateAmbient(dt) {
    for (let index = 0; index < particles.length; index += 1) {
      const particle = particles[index];
      if (!particle.active) continue;
      particle.life -= dt;
      if (particle.life <= 0) {
        particle.active = false;
        continue;
      }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= Math.max(0, 1 - 2.5 * dt);
      particle.vy *= Math.max(0, 1 - 2.5 * dt);
    }
    for (let index = 0; index < texts.length; index += 1) {
      const text = texts[index];
      if (!text.active) continue;
      text.life -= dt;
      if (text.life <= 0) text.active = false;
      else text.y -= 34 * dt;
    }
    if (state.shake > 0) state.shake = Math.max(0, state.shake - 42 * dt);
    if (state.flash > 0) state.flash = Math.max(0, state.flash - 2.4 * dt);
    if (state.banner.life > 0) state.banner.life = Math.max(0, state.banner.life - dt);
  }

  /**
   * A shadow that wanders in from inside the arena, for the title screen's backdrop: unlike
   * spawnEnemy it never starts half off the edge, so the title frame shows whole shadows.
   */
  function spawnDemoEnemy(kind) {
    const enemy = free(enemies);
    if (enemy === null) return;
    const spec = KIND_SPEC[kind];
    enemy.active = true;
    enemy.kind = kind;
    enemy.x = 70 + random() * (FIELD.width - 140);
    enemy.y = 70 + random() * (FIELD.height - 140);
    enemy.vx = 0;
    enemy.vy = 0;
    enemy.radius = spec.radius;
    enemy.hp = spec.hp;
    enemy.maxHp = spec.hp;
    enemy.speed = spec.speed * (0.9 + random() * 0.2);
    enemy.fireTimer = 1 + random() * 1.5;
    enemy.angle = random() * TWO_PI;
    burst(enemy.x, enemy.y, spec.color, 6, 90, 3);
  }

  /**
   * The title screen's backdrop: the ember drifts in a slow, tight circle high in the arena,
   * clear of the title text, while a crowd of shadows wanders toward it — nothing hurts
   * anything, nothing scores. The same seed always gives the same scene.
   */
  function demoStep(dt) {
    state.elapsed += dt;
    state.demoAngle += dt * 0.45;
    // A wide orbit that sweeps the whole arena: the ember swings out from behind the title
    // text into the open field and back, and the shadows chasing it spread across the screen
    // instead of bunching up behind the text.
    player.x = FIELD.width / 2 + Math.cos(state.demoAngle) * 380;
    player.y = FIELD.height / 2 + Math.sin(state.demoAngle) * 240;
    player.aimX = player.x + Math.cos(state.demoAngle + 1.2) * 120;
    player.aimY = player.y + Math.sin(state.demoAngle + 1.2) * 120;
    if (countActive(enemies) < 12 && random() < dt * 1.8) {
      spawnDemoEnemy(pick(random, [KIND_CHASER, KIND_SHOOTER, KIND_SPLITTER, KIND_TANK]));
    }
    for (let index = 0; index < enemies.length; index += 1) {
      const enemy = enemies[index];
      if (!enemy.active) continue;
      moveEnemy(enemy, dt, player.x, player.y, enemy.speed * 0.55);
      // Keep the wanderers on screen: a shadow half off the arena's edge reads as a bug.
      enemy.x = Math.min(FIELD.width - enemy.radius - 6, Math.max(enemy.radius + 6, enemy.x));
      enemy.y = Math.min(FIELD.height - enemy.radius - 6, Math.max(enemy.radius + 6, enemy.y));
    }
    updateAmbient(dt);
  }

  reset();
  return {
    state, reset, step, demoStep, startWave, applyUpgrade,
    /** Reset the state and re-seed the random stream, so a replay runs identically. */
    replay() {
      random = createRandom(seed);
      reset();
    },
    enemiesLeft() {
      return state.spawnQueue.length + countActive(enemies);
    },
  };
}
