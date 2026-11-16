// Keyboard and pointer input. Held keys give a steering direction and a firing state; one-shot
// presses (start, pause, mute, upgrade picks) are queued as bit flags and taken once by the loop,
// so a press between two frames is never lost and never counted twice. The mouse position is kept
// in client pixels; the loop converts it to field coordinates with the renderer's view.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_AUTOFIRE = 8;
export const ACTION_RESTART = 16;
export const ACTION_PICK_1 = 32;
export const ACTION_PICK_2 = 64;
export const ACTION_PICK_3 = 128;

const MOVE_KEYS = {
  KeyW: [0, -1], KeyA: [-1, 0], KeyS: [0, 1], KeyD: [1, 0],
  ArrowUp: [0, -1], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowRight: [1, 0],
};
const CONFIRM = new Set(['Enter']);
const FIRE = new Set(['Space']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MUTE = new Set(['KeyM']);
const AUTOFIRE = new Set(['KeyF']);
const RESTART = new Set(['KeyR']);
const PICKS = { Digit1: ACTION_PICK_1, Digit2: ACTION_PICK_2, Digit3: ACTION_PICK_3 };

export function createInput(canvas) {
  const held = new Set();
  let mouseDown = false;
  let mouseX = 0;
  let mouseY = 0;
  let clickX = 0;
  let clickY = 0;
  let clickQueued = false;
  let actions = 0;

  window.addEventListener('keydown', (event) => {
    if (MOVE_KEYS[event.code] !== undefined) {
      held.add(event.code);
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (FIRE.has(event.code)) {
      held.add(event.code);
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (AUTOFIRE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_AUTOFIRE;
    } else if (RESTART.has(event.code)) {
      if (!event.repeat) actions |= ACTION_RESTART;
    } else if (PICKS[event.code] !== undefined) {
      if (!event.repeat) actions |= PICKS[event.code];
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.clear();
    mouseDown = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
  });
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    mouseDown = true;
    mouseX = event.clientX;
    mouseY = event.clientY;
    clickX = event.clientX;
    clickY = event.clientY;
    clickQueued = true;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', (event) => {
    if (event.button === 0) mouseDown = false;
  });

  return {
    /** The steering vector, each component -1, 0 or 1, from the held movement keys. */
    move() {
      let x = 0;
      let y = 0;
      for (const code of held) {
        const vector = MOVE_KEYS[code];
        if (vector === undefined) continue;
        x += vector[0];
        y += vector[1];
      }
      return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
    },
    /** True while the mouse button or Space is held: the trigger. */
    firing() {
      return mouseDown || held.has('Space');
    },
    /** The mouse position in client pixels, for the renderer to convert to the field. */
    mouse() {
      return { x: mouseX, y: mouseY };
    },
    /** The last click's client position, once, or null when no click is waiting. */
    takeClick() {
      if (!clickQueued) return null;
      clickQueued = false;
      return { x: clickX, y: clickY };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
