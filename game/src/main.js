// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between five screens: title, play, upgrade, paused and game over.
//
// ?seed=N fixes the spawn pattern. ?shot=start|play|upgrade|end (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createWorld, EVENT_BOSS, EVENT_DIE, EVENT_HIT, EVENT_OVER, EVENT_PICKUP, EVENT_SHOOT, EVENT_WAVE_CLEAR } from './world.js';
import { ACTION_AUTOFIRE, ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_PICK_1, ACTION_PICK_2, ACTION_PICK_3, ACTION_RESTART, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(seed);
const renderer = createRenderer(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    // The end scene always set a new best (its best is its own score), so the panel shows it.
    renderer.draw(world.state, scene.screen, { best: scene.best, muted: false, autoFire: false, newBest: scene.screen === SCREEN_OVER && scene.best > 0 });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  const audio = createAudio();
  let screen = SCREEN_TITLE;
  let best = readBest();
  let newBest = false;
  let accumulator = 0;
  let last = performance.now();

  // A handle for automated play-testing: the world's state and the current screen.
  window.__emberlight = {
    world,
    get screen() { return screen; },
    get best() { return best; },
  };

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.unlock();
    world.reset();
    world.startWave(1);
    accumulator = 0;
    newBest = false;
    screen = SCREEN_PLAY;
    announce('Playing. Three hearts. Wave 1.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    audio.gameOver();
    if (world.state.score > best) {
      best = world.state.score;
      newBest = true;
      saveBest(best);
    }
    announce(`Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function handleEvents(events) {
    if (events & EVENT_SHOOT) audio.shoot();
    if (events & EVENT_DIE) audio.die();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_HIT) {
      audio.hurt();
      announce(world.state.player.hp === 1 ? 'Hit. 1 heart left.' : `Hit. ${world.state.player.hp} hearts left.`);
    }
    if (events & EVENT_BOSS) {
      audio.boss();
      announce(world.state.banner.text || 'A boss wakes.');
    }
    if (events & EVENT_WAVE_CLEAR) {
      audio.waveClear();
      announce(`Wave ${world.state.wave} cleared. Choose a blessing.`);
    }
    if (events & EVENT_OVER) endGame();
  }

  function pickUpgrade(index) {
    const choices = world.state.choices;
    if (index < 0 || index >= choices.length) return;
    audio.upgrade();
    world.applyUpgrade(choices[index].id);
    screen = SCREEN_PLAY;
    announce(`Blessing taken: ${choices[index].name}. Wave ${world.state.wave}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
      announce(audio.isMuted() ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_AUTOFIRE) {
      world.state.player.autoFire = !world.state.player.autoFire;
      announce(world.state.player.autoFire ? 'Auto-fire on.' : 'Auto-fire off.');
    }
    if (screen === SCREEN_TITLE && actions & ACTION_CONFIRM) {
      startGame();
      return;
    }
    if (screen === SCREEN_OVER && (actions & (ACTION_CONFIRM | ACTION_RESTART))) {
      startGame();
      return;
    }
    if (screen === SCREEN_PLAY && actions & ACTION_PAUSE) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
      return;
    }
    if (screen === SCREEN_PAUSED && (actions & (ACTION_PAUSE | ACTION_CONFIRM))) {
      screen = SCREEN_PLAY;
      announce('Playing.');
      return;
    }
    if (screen === SCREEN_UPGRADE) {
      if (actions & ACTION_PICK_1) pickUpgrade(0);
      else if (actions & ACTION_PICK_2) pickUpgrade(1);
      else if (actions & ACTION_PICK_3) pickUpgrade(2);
    }
  }

  function handleClick() {
    const click = input.takeClick();
    if (click === null) return;
    if (screen === SCREEN_UPGRADE) {
      const point = renderer.fieldFromClient(click.x, click.y);
      for (let index = 0; index < renderer.cardRects.length; index += 1) {
        const card = renderer.cardRects[index];
        if (point.x >= card.x && point.x <= card.x + card.width && point.y >= card.y && point.y <= card.y + card.height) {
          pickUpgrade(card.index);
          return;
        }
      }
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.demoStep(STEP);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const move = input.move();
    const mouse = input.mouse();
    const aim = renderer.fieldFromClient(mouse.x, mouse.y);
    const events = world.step(STEP, { moveX: move.x, moveY: move.y, aimX: aim.x, aimY: aim.y, firing: input.firing() });
    handleEvents(events);
    if (world.state.phase === 'upgrade' && screen === SCREEN_PLAY) {
      screen = SCREEN_UPGRADE;
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    handleClick();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, { best, muted: audio.isMuted(), autoFire: world.state.player.autoFire, newBest });
  }

  // Leaving the tab pauses a running game rather than letting shadows close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Emberlight. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
