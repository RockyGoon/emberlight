// Sound effects, synthesized with Web Audio only: no audio files, no network. The context is
// created lazily on the first user gesture (unlock), so the game never plays sound before the
// player has touched it. Every effect is a short oscillator or noise burst with an envelope.

export function createAudio() {
  let context = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (context !== null) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext === undefined) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
      return true;
    } catch {
      return false;
    }
  }

  /** One oscillator note: frequency slides from `from` to `to` over `dur` seconds. */
  function tone(from, to, dur, type, volume, delay) {
    if (context === null || muted) return;
    const start = context.currentTime + (delay || 0);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(20, from), start);
    if (to !== from) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + dur);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(start);
    oscillator.stop(start + dur + 0.05);
  }

  /** One burst of filtered noise, for hits and explosions. */
  function noise(dur, volume, cutoff) {
    if (context === null || muted) return;
    const start = context.currentTime;
    const length = Math.max(1, Math.floor(context.sampleRate * dur));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(start);
  }

  return {
    /** Call from a user gesture so the context is allowed to make sound. */
    unlock() {
      if (ensure() && context.state === 'suspended') context.resume().catch(() => {});
    },
    setMuted(value) {
      muted = value;
    },
    isMuted() {
      return muted;
    },
    shoot() {
      tone(720, 240, 0.09, 'square', 0.05);
    },
    hit() {
      noise(0.05, 0.08, 2400);
    },
    die() {
      tone(420, 60, 0.22, 'sawtooth', 0.09);
      noise(0.16, 0.07, 1200);
    },
    pickup() {
      tone(880, 1320, 0.08, 'sine', 0.07);
    },
    hurt() {
      tone(180, 55, 0.3, 'sawtooth', 0.14);
      noise(0.2, 0.1, 700);
    },
    waveClear() {
      tone(523, 523, 0.12, 'sine', 0.09);
      tone(659, 659, 0.12, 'sine', 0.09, 0.1);
      tone(784, 784, 0.2, 'sine', 0.09, 0.2);
    },
    upgrade() {
      tone(660, 990, 0.14, 'triangle', 0.1);
      tone(990, 1320, 0.18, 'triangle', 0.08, 0.1);
    },
    boss() {
      tone(90, 45, 0.7, 'sawtooth', 0.12);
      tone(135, 68, 0.7, 'square', 0.05, 0.05);
    },
    gameOver() {
      tone(392, 392, 0.25, 'triangle', 0.1);
      tone(330, 330, 0.25, 'triangle', 0.1, 0.22);
      tone(262, 196, 0.5, 'triangle', 0.11, 0.44);
    },
  };
}
