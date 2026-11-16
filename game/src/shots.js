// The screenshot scenes behind ?shot=start|play|upgrade|end. Each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by a simple autopilot (keep a
// little distance from the nearest shadow, collect close shards, aim at the nearest shadow and
// hold the trigger), so the frame is what a short game really looks like and the same seed always
// gives the same frame. The play scene keeps the busiest frame it passes through, so the shot
// shows the fight at its fullest. The end scene's pilot only ever retreats, so it survives a
// wave and is then cornered and overwhelmed, as a player who only ever retreats is.
import { FIELD, STEP } from './config.js';
import { EVENT_OVER } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 36;
const END_LIMIT_SECONDS = 600;
const FLASH_SETTLE_STEPS = 18;

/** The nearest active enemy to the ember, or null when the arena is empty. */
function nearestEnemy(state) {
  let best = null;
  let bestDist = Infinity;
  for (let index = 0; index < state.enemies.length; index += 1) {
    const enemy = state.enemies[index];
    if (!enemy.active) continue;
    const dist = Math.hypot(enemy.x - state.player.x, enemy.y - state.player.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = enemy;
    }
  }
  return best === null ? null : { enemy: best, dist: bestDist };
}

/** The nearest active shard, or null when none is on the ground. */
function nearestShard(state) {
  let best = null;
  let bestDist = Infinity;
  for (let index = 0; index < state.shards.length; index += 1) {
    const shard = state.shards[index];
    if (!shard.active) continue;
    const dist = Math.hypot(shard.x - state.player.x, shard.y - state.player.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = shard;
    }
  }
  return best === null ? null : { shard: best, dist: bestDist };
}

/**
 * The autopilot's input for one step. Mode 'good' kites: it backs away when a shadow gets
 * close, strafes around it at mid range, and drifts onto a close shard when nothing threatens;
 * it only shoots once a shadow is near enough to be worth the bolt, so shadows gather before
 * they fall. Mode 'slow' creeps away from the nearest shadow at half speed while shooting, so
 * it survives a wave and is then overwhelmed, as a player who only ever retreats is.
 */
function autopilot(state, mode) {
  const player = state.player;
  const found = nearestEnemy(state);
  let aimX = player.x;
  let aimY = player.y - 100;
  if (found !== null) {
    aimX = found.enemy.x;
    aimY = found.enemy.y;
  }
  if (mode === 'slow') {
    if (found === null) return { moveX: 0, moveY: 0, aimX, aimY, firing: false };
    const awayX = (player.x - found.enemy.x) / found.dist;
    const awayY = (player.y - found.enemy.y) / found.dist;
    return { moveX: awayX * 0.45, moveY: awayY * 0.45, aimX, aimY, firing: true };
  }
  if (mode !== 'good' || found === null) {
    return { moveX: 0, moveY: 0, aimX, aimY, firing: false };
  }
  const firing = found.dist < 460;
  let moveX = 0;
  let moveY = 0;
  const awayX = (player.x - found.enemy.x) / found.dist;
  const awayY = (player.y - found.enemy.y) / found.dist;
  if (found.dist < 150) {
    moveX = awayX;
    moveY = awayY;
  } else if (found.dist < 330) {
    // Strafe: orbit the shadow, the direction flipping slowly with elapsed time.
    const strafe = Math.sin(state.elapsed * 0.5) > 0 ? 1 : -1;
    moveX = -awayY * strafe;
    moveY = awayX * strafe;
  } else {
    moveX = -awayX * 0.7;
    moveY = -awayY * 0.7;
  }
  const shard = nearestShard(state);
  if (shard !== null && shard.dist < 210 && found.dist > 130) {
    moveX = (shard.shard.x - player.x) / shard.dist;
    moveY = (shard.shard.y - player.y) / shard.dist;
  }
  // Keep off the arena's edge.
  if (player.x < 70) moveX = Math.max(moveX, 0.7);
  if (player.x > FIELD.width - 70) moveX = Math.min(moveX, -0.7);
  if (player.y < 70) moveY = Math.max(moveY, 0.7);
  if (player.y > FIELD.height - 70) moveY = Math.min(moveY, -0.7);
  const length = Math.hypot(moveX, moveY);
  if (length > 1) {
    moveX /= length;
    moveY /= length;
  }
  return { moveX, moveY, aimX, aimY, firing };
}

/** How busy a frame looks: shadows on screen count most; a frame with fewer than three is never the busiest. */
function actionScore(state) {
  let onScreen = 0;
  for (let index = 0; index < state.enemies.length; index += 1) {
    const enemy = state.enemies[index];
    if (enemy.active && enemy.x > 0 && enemy.x < FIELD.width && enemy.y > 0 && enemy.y < FIELD.height) onScreen += 1;
  }
  if (onScreen < 3) return -1;
  let bolts = 0;
  for (let index = 0; index < state.bullets.length; index += 1) if (state.bullets[index].active) bolts += 1;
  let shards = 0;
  for (let index = 0; index < state.shards.length; index += 1) if (state.shards[index].active) shards += 1;
  return onScreen * 10 + bolts + Math.floor(shards / 3);
}

/** One good-pilot step, taking an upgrade the moment one is offered. */
function playStep(world, state) {
  const events = world.step(STEP, autopilot(state, 'good'));
  if (state.phase === 'upgrade' && state.choices.length > 0) {
    world.applyUpgrade(state.choices[0].id);
  }
  return events;
}

/**
 * Set `world` to the named scene (start, play, upgrade or end; any other name is start) and
 * return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  const state = world.state;
  if (name !== 'play' && name !== 'upgrade' && name !== 'end') {
    world.reset();
    for (let index = 0; index < START_SECONDS / STEP; index += 1) world.demoStep(STEP);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  world.reset();
  world.startWave(1);
  if (name === 'upgrade') {
    for (let index = 0; index < 150 / STEP; index += 1) {
      const events = world.step(STEP, autopilot(state, 'good'));
      if (state.phase === 'upgrade') return { screen: SCREEN_UPGRADE, best: state.score };
      if (events & EVENT_OVER) break;
    }
    return { screen: state.phase === 'upgrade' ? SCREEN_UPGRADE : SCREEN_PLAY, best: state.score };
  }
  if (name === 'end') {
    // A wave cleared on the way is taken at once, so the waves keep coming until it falls.
    for (let index = 0; index < END_LIMIT_SECONDS / STEP; index += 1) {
      const events = world.step(STEP, autopilot(state, 'slow'));
      if (state.phase === 'upgrade' && state.choices.length > 0) {
        world.applyUpgrade(state.choices[0].id);
      }
      if (events & EVENT_OVER) break;
    }
    // Let the hit flash fade and the death burst bloom before the frame is taken.
    for (let index = 0; index < FLASH_SETTLE_STEPS; index += 1) {
      world.step(STEP, { moveX: 0, moveY: 0, aimX: state.player.x, aimY: state.player.y, firing: false });
    }
    return { screen: SCREEN_OVER, best: state.score };
  }
  // Play: first pass finds the busiest frame, second pass replays to it exactly.
  let bestStep = 0;
  let bestScore = -1;
  world.replay();
  world.startWave(1);
  for (let index = 0; index < PLAY_SECONDS / STEP; index += 1) {
    const events = playStep(world, state);
    if (events & EVENT_OVER) break;
    if (index % 6 === 0) {
      const score = actionScore(state);
      if (score > bestScore) {
        bestScore = score;
        bestStep = index;
      }
    }
  }
  world.replay();
  world.startWave(1);
  for (let index = 0; index <= bestStep; index += 1) {
    const events = playStep(world, state);
    if (events & EVENT_OVER) break;
  }
  return { screen: state.player.dead ? SCREEN_OVER : SCREEN_PLAY, best: state.score };
}
