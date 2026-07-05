/** Tiny WebAudio synth — no assets, a handful of tones per event. */

const KEY = 'cutpurse-muted';
let ctx: AudioContext | null = null;
let mutedFlag = false;
try { mutedFlag = localStorage.getItem(KEY) === '1'; } catch { /* ignore */ }

export function isMuted(): boolean {
  return mutedFlag;
}

export function toggleMute(): boolean {
  mutedFlag = !mutedFlag;
  try { localStorage.setItem(KEY, mutedFlag ? '1' : '0'); } catch { /* ignore */ }
  return mutedFlag;
}

/** Call from a user gesture so the context is allowed to start. */
export function ensureAudio(): void {
  if (mutedFlag) return;
  if (!ctx) {
    try { ctx = new AudioContext(); } catch { return; }
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; at?: number; slide?: number } = {}): void {
  if (mutedFlag || !ctx || ctx.state !== 'running') return;
  const { type = 'sine', vol = 0.06, at = 0, slide = 0 } = opts;
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0005, t0 + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const sfx = {
  steal(): void {
    tone(660, 0.07, { type: 'square', vol: 0.04 });
    tone(880, 0.08, { type: 'square', vol: 0.04, at: 0.05 });
    tone(1320, 0.1, { type: 'square', vol: 0.03, at: 0.1 });
  },
  seen(): void {
    tone(150, 0.22, { type: 'sawtooth', vol: 0.08 });
    tone(104, 0.3, { type: 'sawtooth', vol: 0.06, at: 0.07 });
  },
  smoke(): void {
    tone(520, 0.35, { type: 'sine', vol: 0.05, slide: -420 });
    tone(360, 0.3, { type: 'triangle', vol: 0.04, at: 0.04, slide: -280 });
  },
  relic(): void {
    tone(523, 0.12, { type: 'triangle', vol: 0.05 });
    tone(784, 0.14, { type: 'triangle', vol: 0.05, at: 0.09 });
    tone(1047, 0.22, { type: 'triangle', vol: 0.05, at: 0.18 });
  },
  buy(): void {
    tone(700, 0.06, { type: 'square', vol: 0.04 });
    tone(1050, 0.12, { type: 'square', vol: 0.04, at: 0.06 });
  },
  click(): void {
    tone(500, 0.05, { type: 'triangle', vol: 0.035 });
  },
  quota(): void {
    tone(587, 0.1, { type: 'triangle', vol: 0.05 });
    tone(880, 0.18, { type: 'triangle', vol: 0.05, at: 0.08 });
  },
  dawnClear(): void {
    tone(392, 0.25, { type: 'triangle', vol: 0.05 });
    tone(494, 0.25, { type: 'triangle', vol: 0.05, at: 0.12 });
    tone(587, 0.4, { type: 'triangle', vol: 0.05, at: 0.24 });
  },
  dawnShort(): void {
    tone(330, 0.3, { type: 'triangle', vol: 0.05 });
    tone(262, 0.45, { type: 'triangle', vol: 0.05, at: 0.18 });
  },
  caught(): void {
    tone(220, 0.2, { type: 'sawtooth', vol: 0.07 });
    tone(165, 0.25, { type: 'sawtooth', vol: 0.07, at: 0.15 });
    tone(110, 0.5, { type: 'sawtooth', vol: 0.07, at: 0.3 });
  },
  victory(): void {
    tone(523, 0.15, { type: 'triangle', vol: 0.06 });
    tone(659, 0.15, { type: 'triangle', vol: 0.06, at: 0.13 });
    tone(784, 0.15, { type: 'triangle', vol: 0.06, at: 0.26 });
    tone(1047, 0.5, { type: 'triangle', vol: 0.06, at: 0.39 });
    tone(784, 0.5, { type: 'sine', vol: 0.04, at: 0.39 });
  },
};
