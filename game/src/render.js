// Drawing only: the world's state and the current screen in, pixels out. The 1280x720 playfield
// is scaled to fit the window and centred, the margin filled with the backdrop colour. Everything
// is canvas-drawn — no images, no fonts loaded, no network — and every animation reads the
// world's elapsed time, never the wall clock, so a screenshot scene renders the same every time.
import { ENEMY, FIELD, FONT, PALETTE } from './config.js';
import { KIND_BOSS, KIND_MINI, KIND_SHOOTER, KIND_SPLITTER, KIND_TANK } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_UPGRADE = 'upgrade';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const GRID = 64;
const HEART_SIZE = 22;
const HEART_GAP = 8;

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();
  const cardRects = [];

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, weight) {
    const key = `${size}:${weight || ''}`;
    if (!fonts.has(key)) fonts.set(key, `${weight || ''} ${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function glowText(value, x, y, size, color, align, blur) {
    context.save();
    context.shadowColor = color;
    context.shadowBlur = blur;
    text(value, x, y, size, color, align, '700');
    context.restore();
  }

  function drawBackground(state) {
    context.fillStyle = PALETTE.arena;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.strokeStyle = PALETTE.grid;
    context.lineWidth = 1;
    context.beginPath();
    for (let x = GRID; x < FIELD.width; x += GRID) {
      context.moveTo(x, 0);
      context.lineTo(x, FIELD.height);
    }
    for (let y = GRID; y < FIELD.height; y += GRID) {
      context.moveTo(0, y);
      context.lineTo(FIELD.width, y);
    }
    context.stroke();
    for (let index = 0; index < state.stars.length; index += 1) {
      const star = state.stars[index];
      const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(state.elapsed * 1.6 + star.phase));
      context.globalAlpha = twinkle;
      context.fillStyle = '#cdd2ff';
      context.fillRect(star.x, star.y, star.r, star.r);
    }
    context.globalAlpha = 1;
    context.strokeStyle = '#2c2c55';
    context.lineWidth = 3;
    context.strokeRect(4, 4, FIELD.width - 8, FIELD.height - 8);
  }

  function drawShards(state) {
    for (let index = 0; index < state.shards.length; index += 1) {
      const shard = state.shards[index];
      if (!shard.active) continue;
      const pulse = 1 + 0.25 * Math.sin(state.elapsed * 6 + shard.x);
      const size = 7 * pulse;
      context.save();
      context.translate(shard.x, shard.y);
      context.rotate(Math.PI / 4);
      context.shadowColor = PALETTE.shard;
      context.shadowBlur = 10;
      context.fillStyle = PALETTE.shard;
      context.fillRect(-size / 2, -size / 2, size, size);
      context.restore();
    }
  }

  function drawEnemy(state, enemy) {
    const spec = [ENEMY.chaser, ENEMY.shooter, ENEMY.splitter, ENEMY.mini, ENEMY.tank, ENEMY.boss][enemy.kind];
    const x = enemy.x;
    const y = enemy.y;
    const radius = enemy.radius;
    context.save();
    context.shadowColor = spec.color;
    context.shadowBlur = 16;
    if (enemy.kind === KIND_BOSS) {
      // The void wisp: a dark heart ringed in magenta, with a slow rotating halo.
      context.fillStyle = '#2a0a3a';
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = spec.color;
      context.lineWidth = 5;
      context.stroke();
      context.rotate(state.elapsed * 0.7);
      context.strokeStyle = '#ff7ae0';
      context.lineWidth = 3;
      context.beginPath();
      for (let spike = 0; spike < 8; spike += 1) {
        const angle = (spike / 8) * Math.PI * 2;
        context.moveTo(x + Math.cos(angle) * (radius + 4), y + Math.sin(angle) * (radius + 4));
        context.lineTo(x + Math.cos(angle) * (radius + 16), y + Math.sin(angle) * (radius + 16));
      }
      context.stroke();
      context.rotate(-state.elapsed * 0.7);
      context.fillStyle = '#ff9df0';
      context.beginPath();
      context.arc(x, y, radius * 0.42, 0, Math.PI * 2);
      context.fill();
      // Health bar under the boss.
      const barWidth = 150;
      const ratio = Math.max(0, enemy.hp / enemy.maxHp);
      context.shadowBlur = 0;
      context.fillStyle = '#1c1030';
      context.fillRect(x - barWidth / 2, y + radius + 12, barWidth, 9);
      context.fillStyle = spec.color;
      context.fillRect(x - barWidth / 2, y + radius + 12, barWidth * ratio, 9);
    } else if (enemy.kind === KIND_SHOOTER) {
      context.fillStyle = spec.color;
      context.beginPath();
      context.moveTo(x, y - radius);
      context.lineTo(x + radius, y + radius);
      context.lineTo(x - radius, y + radius);
      context.closePath();
      context.fill();
      context.fillStyle = '#0d0d1e';
      context.beginPath();
      context.arc(x, y + 2, radius * 0.35, 0, Math.PI * 2);
      context.fill();
    } else if (enemy.kind === KIND_SPLITTER) {
      context.fillStyle = spec.color;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#ffd7e8';
      context.beginPath();
      context.arc(x - radius * 0.3, y - radius * 0.25, radius * 0.32, 0, Math.PI * 2);
      context.arc(x + radius * 0.35, y + radius * 0.3, radius * 0.28, 0, Math.PI * 2);
      context.fill();
    } else if (enemy.kind === KIND_TANK) {
      context.fillStyle = spec.color;
      context.beginPath();
      for (let side = 0; side < 6; side += 1) {
        const angle = (side / 6) * Math.PI * 2 + Math.PI / 6;
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        if (side === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
      context.fill();
      context.fillStyle = '#3a1408';
      context.beginPath();
      context.arc(x, y, radius * 0.45, 0, Math.PI * 2);
      context.fill();
    } else {
      // Chaser and mini: a spiky shadow wisp.
      context.fillStyle = spec.color;
      context.beginPath();
      for (let spike = 0; spike < 8; spike += 1) {
        const angle = (spike / 8) * Math.PI * 2 + state.elapsed * 1.4;
        const outer = spike % 2 === 0 ? radius : radius * 0.62;
        const px = x + Math.cos(angle) * outer;
        const py = y + Math.sin(angle) * outer;
        if (spike === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
      context.fill();
      context.fillStyle = '#1a0a2e';
      context.beginPath();
      context.arc(x, y, radius * 0.4, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
    // A small health bar over hurt enemies.
    if (enemy.hp < enemy.maxHp && enemy.kind !== KIND_BOSS) {
      const barWidth = radius * 1.8;
      const ratio = Math.max(0, enemy.hp / enemy.maxHp);
      context.fillStyle = '#1c1030';
      context.fillRect(x - barWidth / 2, y - radius - 12, barWidth, 5);
      context.fillStyle = spec.color;
      context.fillRect(x - barWidth / 2, y - radius - 12, barWidth * ratio, 5);
    }
  }

  function drawOrbs(state) {
    for (let index = 0; index < state.orbs.length; index += 1) {
      const orb = state.orbs[index];
      if (!orb.active) continue;
      context.save();
      context.shadowColor = '#a040ff';
      context.shadowBlur = 14;
      context.fillStyle = '#7b2ff7';
      context.beginPath();
      context.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#d9b3ff';
      context.beginPath();
      context.arc(orb.x, orb.y, orb.radius * 0.45, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
  }

  function drawBullets(state) {
    context.save();
    context.shadowColor = PALETTE.bullet;
    context.shadowBlur = 12;
    for (let index = 0; index < state.bullets.length; index += 1) {
      const bullet = state.bullets[index];
      if (!bullet.active) continue;
      const angle = Math.atan2(bullet.vy, bullet.vx);
      context.fillStyle = PALETTE.bullet;
      context.beginPath();
      context.ellipse(bullet.x, bullet.y, bullet.radius + 6, bullet.radius * 0.7, angle, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#fffbe8';
      context.beginPath();
      context.arc(bullet.x, bullet.y, bullet.radius * 0.55, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  function drawPlayer(state) {
    const player = state.player;
    if (player.dead) return;
    // Blink while invulnerable after a hit: hidden on every other tenth of a second.
    if (player.invulnerable > 0 && Math.floor(player.invulnerable * 10) % 2 === 0) return;
    const flicker = 1 + 0.12 * Math.sin(state.elapsed * 9);
    const radius = player.radius * flicker;
    context.save();
    // Aim tick toward the mouse.
    const aimAngle = Math.atan2(player.aimY - player.y, player.aimX - player.x);
    context.strokeStyle = 'rgba(255, 201, 77, 0.55)';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(player.x + Math.cos(aimAngle) * (radius + 4), player.y + Math.sin(aimAngle) * (radius + 4));
    context.lineTo(player.x + Math.cos(aimAngle) * (radius + 18), player.y + Math.sin(aimAngle) * (radius + 18));
    context.stroke();
    // The wisp: a bright core inside a warm glow, with a short flame tail.
    context.shadowColor = PALETTE.player;
    context.shadowBlur = 26;
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.arc(player.x, player.y, radius, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;
    context.fillStyle = PALETTE.playerCore;
    context.beginPath();
    context.arc(player.x, player.y, radius * 0.55, 0, Math.PI * 2);
    context.fill();
    // Flame tail, opposite the movement.
    const speed = Math.hypot(player.vx, player.vy);
    if (speed > 40) {
      const back = Math.atan2(player.vy, player.vx) + Math.PI;
      context.fillStyle = 'rgba(255, 150, 60, 0.75)';
      context.beginPath();
      context.moveTo(player.x + Math.cos(back) * radius * 0.5, player.y + Math.sin(back) * radius * 0.5);
      context.lineTo(player.x + Math.cos(back + 0.35) * radius * 0.6, player.y + Math.sin(back + 0.35) * radius * 0.6);
      context.lineTo(player.x + Math.cos(back) * (radius + speed * 0.14), player.y + Math.sin(back) * (radius + speed * 0.14));
      context.lineTo(player.x + Math.cos(back - 0.35) * radius * 0.6, player.y + Math.sin(back - 0.35) * radius * 0.6);
      context.closePath();
      context.fill();
    }
    context.restore();
  }

  function drawParticles(state) {
    context.save();
    context.globalCompositeOperation = 'lighter';
    for (let index = 0; index < state.particles.length; index += 1) {
      const particle = state.particles[index];
      if (!particle.active) continue;
      context.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      context.fillStyle = particle.color;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
    context.globalAlpha = 1;
  }

  function drawTexts(state) {
    for (let index = 0; index < state.texts.length; index += 1) {
      const entry = state.texts[index];
      if (!entry.active) continue;
      context.globalAlpha = Math.max(0, entry.life / entry.maxLife);
      text(entry.text, entry.x, entry.y, entry.size, entry.color, 'center', '700');
    }
    context.globalAlpha = 1;
  }

  function drawHeart(x, y, size, filled) {
    context.fillStyle = filled ? PALETTE.heart : PALETTE.heartEmpty;
    context.beginPath();
    context.moveTo(x, y + size * 0.32);
    context.bezierCurveTo(x, y, x - size * 0.5, y - size * 0.1, x - size * 0.5, y + size * 0.18);
    context.bezierCurveTo(x - size * 0.5, y + size * 0.5, x, y + size * 0.72, x, y + size * 0.95);
    context.bezierCurveTo(x, y + size * 0.72, x + size * 0.5, y + size * 0.5, x + size * 0.5, y + size * 0.18);
    context.bezierCurveTo(x + size * 0.5, y - size * 0.1, x, y, x, y + size * 0.32);
    context.fill();
  }

  function drawHud(state, ui) {
    const player = state.player;
    text(`SCORE  ${state.score}`, 24, 40, 30, PALETTE.text, 'left', '700');
    text(`BEST  ${ui.best}`, 24, 68, 18, PALETTE.muted, 'left');
    text(`WAVE  ${state.wave}`, FIELD.width / 2, 40, 30, PALETTE.text, 'center', '700');
    const left = state.phase === 'fighting' ? state.spawnQueue.length + countEnemies(state) : 0;
    text(left > 0 ? `${left} shadows remain` : 'Wave cleared!', FIELD.width / 2, 68, 18, PALETTE.muted, 'center');
    const firstHeart = FIELD.width - 24 - player.maxHp * (HEART_SIZE + HEART_GAP) + HEART_GAP;
    for (let heart = 0; heart < player.maxHp; heart += 1) {
      drawHeart(firstHeart + heart * (HEART_SIZE + HEART_GAP), 18, HEART_SIZE, heart < player.hp);
    }
    text(`◆ ${state.shardsCollected}`, FIELD.width - 24, 76, 22, PALETTE.shard, 'right', '700');
    const hints = [`M ${ui.muted ? 'unmute' : 'mute'}`, `F auto-fire ${player.autoFire ? 'ON' : 'off'}`, 'P pause'];
    text(hints.join('   ·   '), FIELD.width / 2, FIELD.height - 16, 16, PALETTE.muted, 'center');
  }

  function countEnemies(state) {
    let count = 0;
    for (let index = 0; index < state.enemies.length; index += 1) if (state.enemies[index].active) count += 1;
    return count;
  }

  function drawPanel(title, lines, prompt) {
    const width = 640;
    const lineHeight = 32;
    const height = 120 + lines.length * lineHeight + 64;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    roundRect(context, x, y, width, height, 16);
    context.fill();
    context.stroke();
    glowText(title, FIELD.width / 2, y + 76, 52, PALETTE.text, 'center', 18);
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + 120 + index * lineHeight, 21, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 30, 22, PALETTE.player, 'center', '700');
  }

  function drawTitle(state, ui) {
    const pulse = 0.75 + 0.25 * Math.sin(state.elapsed * 2);
    glowText('EMBERLIGHT', FIELD.width / 2, 218, 84, '#ffc94d', 'center', 34 * pulse);
    text('Keeper of the Last Ember', FIELD.width / 2, 262, 28, PALETTE.text, 'center');
    text('You are the last ember. The shadows are coming for your light.', FIELD.width / 2, 316, 20, PALETTE.muted, 'center');
    text('Move with WASD or arrows  ·  Aim with the mouse  ·  Hold click or Space to shoot', FIELD.width / 2, 352, 20, PALETTE.text, 'center');
    text('Collect light shards  ·  Choose an upgrade between waves  ·  A void wisp wakes every 5th wave', FIELD.width / 2, 384, 20, PALETTE.text, 'center');
    text(`BEST  ${ui.best}`, FIELD.width / 2, 428, 22, PALETTE.shard, 'center', '700');
    const blink = 0.55 + 0.45 * Math.sin(state.elapsed * 3.2);
    context.globalAlpha = blink;
    text('Click or press Enter to start', FIELD.width / 2, 500, 26, PALETTE.player, 'center', '700');
    context.globalAlpha = 1;
  }

  function drawUpgrade(state) {
    const choices = state.choices;
    text(`WAVE ${state.wave} CLEARED`, FIELD.width / 2, 128, 40, PALETTE.text, 'center', '700');
    text('The dark relents for a moment. Choose one blessing:', FIELD.width / 2, 168, 21, PALETTE.muted, 'center');
    const cardWidth = 320;
    const cardHeight = 210;
    const gap = 28;
    const total = choices.length * cardWidth + (choices.length - 1) * gap;
    let x = (FIELD.width - total) / 2;
    const y = 240;
    cardRects.length = 0;
    for (let index = 0; index < choices.length; index += 1) {
      const choice = choices[index];
      const taken = state.upgradeCounts[choice.id] || 0;
      cardRects.push({ x, y, width: cardWidth, height: cardHeight, index });
      const hovered = false;
      context.fillStyle = hovered ? '#1f1f42' : PALETTE.panel;
      context.strokeStyle = PALETTE.player;
      context.lineWidth = 2;
      roundRect(context, x, y, cardWidth, cardHeight, 14);
      context.fill();
      context.stroke();
      text(`[${index + 1}]`, x + cardWidth / 2, y + 44, 20, PALETTE.muted, 'center');
      glowText(choice.name, x + cardWidth / 2, y + 92, 27, PALETTE.player, 'center', 12);
      wrapText(choice.desc, x + cardWidth / 2, y + 132, 19, PALETTE.text, cardWidth - 36);
      text(taken > 0 ? `Taken ${taken}×` : 'New blessing', x + cardWidth / 2, y + cardHeight - 22, 17, PALETTE.muted, 'center');
      x += cardWidth + gap;
    }
    text('Click a card, or press 1, 2 or 3', FIELD.width / 2, y + cardHeight + 52, 22, PALETTE.player, 'center', '700');
  }

  /** A short description, wrapped to at most two centred lines inside the card. */
  function wrapText(value, centreX, y, size, color, maxWidth) {
    const words = value.split(' ');
    const lines = [''];
    for (const word of words) {
      const next = lines[lines.length - 1] === '' ? word : `${lines[lines.length - 1]} ${word}`;
      context.font = `${size}px ${FONT}`;
      if (context.measureText(next).width > maxWidth && lines[lines.length - 1] !== '') lines.push(word);
      else lines[lines.length - 1] = next;
    }
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], centreX, y + index * 26, size, color, 'center');
    }
  }

  /** Paint one frame: the field, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, ui) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    // Screen shake: a deterministic wobble that shrinks as the shake decays.
    const shake = state.shake;
    const shakeX = shake > 0 ? Math.sin(state.elapsed * 61) * shake * 0.5 : 0;
    const shakeY = shake > 0 ? Math.cos(state.elapsed * 53) * shake * 0.5 : 0;
    context.setTransform(view.scale, 0, 0, view.scale, view.x + shakeX * view.scale, view.y + shakeY * view.scale);
    drawBackground(state);
    drawShards(state);
    for (let index = 0; index < state.enemies.length; index += 1) {
      const enemy = state.enemies[index];
      if (enemy.active) drawEnemy(state, enemy);
    }
    drawOrbs(state);
    drawBullets(state);
    drawPlayer(state);
    drawParticles(state);
    drawTexts(state);
    if (state.flash > 0) {
      context.fillStyle = `rgba(255, 40, 60, ${0.22 * state.flash})`;
      context.fillRect(0, 0, FIELD.width, FIELD.height);
    }
    if (screen === SCREEN_TITLE) {
      drawTitle(state, ui);
      return;
    }
    drawHud(state, ui);
    if (screen === SCREEN_UPGRADE) drawUpgrade(state);
    else if (screen === SCREEN_PAUSED) drawPanel('Paused', ['The shadows wait for you.'], 'Press P to resume');
    else if (screen === SCREEN_OVER) {
      drawPanel('The Ember Fades', [`Score  ${state.score}`, `Wave reached  ${state.wave}`, `Best  ${ui.best}`], 'Press R or click to play again');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return {
    draw,
    cardRects,
    /** Client pixels (mouse) to field coordinates, through the current view. */
    fieldFromClient(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const backingX = (clientX - rect.left) * ratio;
      const backingY = (clientY - rect.top) * ratio;
      return {
        x: (backingX - view.x) / view.scale,
        y: (backingY - view.y) / view.scale,
      };
    },
  };
}
