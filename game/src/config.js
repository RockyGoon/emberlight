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
export const POOL = { bullets: 160, enemies: 96, orbs: 96, shards: 200, particles: 480, texts: 32 };

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
  boss2: { radius: 40, hp: 110, speed: 68, score: 400, shards: 14, color: '#22d3ee' },
  boss3: { radius: 52, hp: 170, speed: 46, score: 650, shards: 20, color: '#ff6d00' },
};

/** The two realms the ember fights through, alternating every five waves. Realm I is the
 *  ashen field the game opens in; Realm II is the sunken deep, a teal drowned arena where
 *  shadows arrive faster and shooters crowd the field. */
export const REALMS = [
  { name: 'Ashen Expanse', arena: '#0d0d1e', grid: '#191930', edge: '#2c2c55', star: '#cdd2ff' },
  { name: 'The Sunken Deep', arena: '#06222e', grid: '#0f3d46', edge: '#14606e', star: '#a8e6f0' },
];

/** The three bosses, one per five-wave cycle: the Void Wisp (wave 5), the Tidekeeper
 *  (wave 10) and the Ashen Sovereign (wave 15), then the cycle repeats, harder. */
export const BOSSES = [
  { kind: 'boss', name: 'THE VOID WISP', banner: 'THE VOID WISP WAKES' },
  { kind: 'boss2', name: 'THE TIDEKEEPER', banner: 'THE TIDEKEEPER RISES' },
  { kind: 'boss3', name: 'THE ASHEN SOVEREIGN', banner: 'THE ASHEN SOVEREIGN AWAKENS' },
];

/** Relics: boss loot, granted in pairs when a boss falls. Each one changes a real rule —
 *  a revive, a chain zap, a slowing aura, healing from shards, heavier bolts, a doubled
 *  magnet — and each stays for the rest of the run. */
export const RELICS = [
  { id: 'phoenix', name: 'Phoenix Feather', desc: 'Revive once at 1 heart when you would fall' },
  { id: 'lantern', name: 'Wisp Lantern', desc: 'Shard magnet radius doubled' },
  { id: 'storm', name: 'Storm Sigil', desc: 'Kills chain-zap a nearby shadow for 3 damage' },
  { id: 'frost', name: 'Frostbrand Aura', desc: 'Shadows within 170 move 30% slower' },
  { id: 'bloodmoon', name: 'Bloodmoon Charm', desc: 'Every 15 shards collected restores 1 heart' },
  { id: 'titan', name: 'Titan Anchor', desc: 'Bolts 50% wider, and heavier' },
];
/** Which relic pair each boss drops, in boss order: Void Wisp, Tidekeeper, Ashen Sovereign. */
export const BOSS_RELICS = [['phoenix', 'lantern'], ['storm', 'frost'], ['bloodmoon', 'titan']];

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

/** The upgrades offered between waves: name, what it does, how often it can stack, and the
 *  glyph the upgrade card draws for it (see drawUpgradeIcon in render.js). */
export const UPGRADES = [
  { id: 'spread', name: 'Twin Flames', desc: '+1 bolt of light per shot', max: 2, icon: 'spread' },
  { id: 'rapid', name: 'Quickening', desc: 'Shoot 18% faster', max: 4, icon: 'rapid' },
  { id: 'pierce', name: 'Piercing Light', desc: 'Bolts pierce +1 shadow', max: 3, icon: 'pierce' },
  { id: 'damage', name: 'Burn Brighter', desc: '+1 bolt damage', max: 4, icon: 'damage' },
  { id: 'speed', name: 'Swift Ember', desc: 'Move 12% faster', max: 3, icon: 'speed' },
  { id: 'magnet', name: 'Shard Magnet', desc: '+70% shard pickup radius', max: 3, icon: 'magnet' },
  { id: 'shield', name: 'Ember Ward', desc: '+1 max heart, and heal 1', max: 3, icon: 'shield' },
  { id: 'heal', name: 'Rekindle', desc: 'Restore 2 hearts', max: 99, icon: 'heal' },
  { id: 'orbit', name: 'Orbiting Ember', desc: '+1 flame orbiting you, burning shadows it touches', max: 3, icon: 'orbit' },
  { id: 'nova', name: 'Ember Nova', desc: 'A shockwave every 6s, burning all shadows near you', max: 3, icon: 'nova' },
  { id: 'crit', name: 'Kindled Edge', desc: '+20% chance a bolt deals double damage', max: 3, icon: 'crit' },
  { id: 'regen', name: 'Slow Burn', desc: 'Regenerate 1 heart every 30s', max: 2, icon: 'regen' },
  { id: 'swiftbolt', name: 'Swift Bolt', desc: 'Bolts fly 25% faster and farther', max: 3, icon: 'swiftbolt' },
  { id: 'greed', name: 'Gilded Shards', desc: 'Light shards are worth +5 more', max: 2, icon: 'greed' },
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
