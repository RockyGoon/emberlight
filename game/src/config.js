// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical
// area; the renderer scales it to the window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The last ember: a small wisp of light. */
export const PLAYER = {
  radius: 16,
  speed: 275,
  accel: 2400,
  maxHp: 3,
  fireInterval: 0.32,
  bulletSpeed: 640,
  bulletDamage: 1,
  bulletRadius: 6,
  invulnerable: 1.2,
  magnetRadius: 130,
};

/** How many of each thing can exist at once; the pools are allocated once, at boot. */
export const POOL = { bullets: 160, enemies: 96, orbs: 96, shards: 200, particles: 360, texts: 32 };

export const BULLET = { life: 1.6 };

/** Light shards burst from slain shadows; collecting them scores. */
export const SHARD = { value: 5, magnetSpeed: 460, life: 14 };

/** Shadow wisps. hp and speed are the base; waves add a little health. */
export const ENEMY = {
  chaser: { radius: 14, hp: 2, speed: 98, score: 10, shards: 1, color: '#b388ff' },
  shooter: { radius: 14, hp: 2, speed: 72, score: 15, shards: 2, color: '#4dd0e1', orbInterval: 2.1, orbSpeed: 175 },
  splitter: { radius: 18, hp: 3, speed: 78, score: 20, shards: 2, color: '#f06292' },
  mini: { radius: 9, hp: 1, speed: 155, score: 10, shards: 1, color: '#f06292' },
  tank: { radius: 25, hp: 9, speed: 48, score: 30, shards: 3, color: '#ff8a65' },
  boss: { radius: 44, hp: 70, speed: 55, score: 250, shards: 10, color: '#e040fb' },
};

/** Waves: how many shadows, how fast they arrive, when the boss comes. */
export const WAVE = {
  baseCount: 6,
  perWave: 3,
  spawnInterval: 1.05,
  intervalScale: 0.94,
  minInterval: 0.32,
  hpBonusEvery: 3,
  bossEvery: 5,
  firstDelay: 0.9,
};

/** The upgrades offered between waves: name, what it does, how often it can stack. */
export const UPGRADES = [
  { id: 'spread', name: 'Twin Flames', desc: '+1 bolt of light per shot', max: 2 },
  { id: 'rapid', name: 'Quickening', desc: 'Shoot 18% faster', max: 4 },
  { id: 'pierce', name: 'Piercing Light', desc: 'Bolts pierce +1 shadow', max: 3 },
  { id: 'damage', name: 'Burn Brighter', desc: '+1 bolt damage', max: 4 },
  { id: 'speed', name: 'Swift Ember', desc: 'Move 12% faster', max: 3 },
  { id: 'magnet', name: 'Shard Magnet', desc: '+70% shard pickup radius', max: 3 },
  { id: 'shield', name: 'Ember Ward', desc: '+1 max heart, and heal 1', max: 3 },
  { id: 'heal', name: 'Rekindle', desc: 'Restore 2 hearts', max: 99 },
];

export const PALETTE = {
  backdrop: '#07070f',
  arena: '#0d0d1e',
  grid: '#191930',
  player: '#ffc94d',
  playerCore: '#fff3c4',
  bullet: '#ffd54f',
  shard: '#ffca28',
  text: '#f5f1e6',
  muted: '#a49ec4',
  panel: '#171730',
  panelEdge: '#45457a',
  heart: '#ff5a6e',
  heartEmpty: '#33283e',
  boss: '#e040fb',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'emberlight.best';
