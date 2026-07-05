export const TAU = Math.PI * 2;

export interface Mark {
  a: number;      // angle on the plaza
  r: number;      // radius from centre
  v: number;      // purse value
  bob: number;    // idle bob phase
  spawn: number;  // spawn-in animation 0..1
}

export interface Pop {
  x: number;
  y: number;
  txt: string;
  c: string;
  t: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;      // life remaining 0..1
  size: number;
  kind: 'coin' | 'smoke' | 'spark';
}

export interface Relic {
  n: string;
  d: string;
  f: (s: GameState) => void;
}

export interface GameState {
  coins: number;
  steals: number;
  hearts: number;
  smoke: number;
  cone: number;
  coinMult: number;
  speedMult: number;
  richLate: boolean;
  ang: number;
  dir: 1 | -1;
  speed: number;
  revT: number;
  flash: number;
  shake: number;
  marks: Mark[];
  t: number;
  over: boolean;
  paused: boolean;
  pops: Pop[];
  particles: Particle[];
}

export const RELICS: Relic[] = [
  { n: 'Gloves of the Magpie', d: 'Each purse yields half again more coin.', f: s => { s.coinMult *= 1.5; } },
  { n: 'Vial of Grave-Smoke', d: 'The next time you are seen, you vanish instead.', f: s => { s.smoke++; } },
  { n: 'Hooded Lantern', d: 'The watchman’s gaze narrows by a fifth.', f: s => { s.cone *= 0.8; } },
  { n: 'Leaden Boots (his)', d: 'The watchman turns 15% slower.', f: s => { s.speedMult *= 0.85; } },
  { n: 'Fourth Finger of St. Nick', d: 'One more mistake forgiven. (+1 luck)', f: s => { s.hearts = Math.min(4, s.hearts + 1); } },
  { n: 'Weighted Dice', d: 'Purses run richer in the late hours.', f: s => { s.richLate = true; } },
];

export function newState(): GameState {
  return {
    coins: 0, steals: 0, hearts: 3, smoke: 0, cone: 0.62, coinMult: 1, speedMult: 1, richLate: false,
    ang: Math.random() * TAU, dir: 1, speed: 0.9, revT: 5 + Math.random() * 4, flash: 0, shake: 0,
    marks: [], t: 90, over: false, paused: false, pops: [], particles: [],
  };
}

export function angDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % TAU;
  return d > Math.PI ? TAU - d : d;
}

export function spawnMark(s: GameState, plazaR: number): void {
  let a = 0;
  let tries = 0;
  do { a = Math.random() * TAU; tries++; } while (tries < 20 && s.marks.some(m => angDiff(a, m.a) < 0.5));
  const rr = plazaR * (0.55 + Math.random() * 0.38);
  let v = 5 + Math.floor(Math.random() * 11);
  if (s.richLate && s.t < 45) v = Math.floor(v * 1.8);
  s.marks.push({ a, r: rr, v, bob: Math.random() * TAU, spawn: 0 });
}

export function isSeen(s: GameState, a: number): boolean {
  return angDiff(a, s.ang) < s.cone / 2;
}

export function burst(s: GameState, x: number, y: number, kind: Particle['kind'], n: number): void {
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * TAU;
    const sp = kind === 'smoke' ? 12 + Math.random() * 26 : 40 + Math.random() * 90;
    s.particles.push({
      x, y,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp - (kind === 'coin' ? 60 : 10),
      t: 1,
      size: kind === 'smoke' ? 5 + Math.random() * 8 : 1.6 + Math.random() * 2.4,
      kind,
    });
  }
}

/** Advance simulation. Returns 'timeup' when the night ends, otherwise null. */
export function tick(s: GameState, dt: number): 'timeup' | null {
  if (s.paused || s.over) return null;
  s.t -= dt;
  if (s.t <= 0) return 'timeup';
  s.revT -= dt;
  if (s.revT <= 0) {
    s.dir = s.dir === 1 ? -1 : 1;
    s.revT = 5 + Math.random() * 5;
    s.flash = Math.max(s.flash, 0.5);
  }
  s.ang = (s.ang + s.dir * s.speed * s.speedMult * dt + TAU) % TAU;
  for (const m of s.marks) {
    m.bob += dt * 2;
    m.spawn = Math.min(1, m.spawn + dt * 3);
  }
  for (const p of s.pops) p.t -= dt;
  s.pops = s.pops.filter(p => p.t > 0);
  for (const p of s.particles) {
    p.t -= dt * (p.kind === 'smoke' ? 0.9 : 1.4);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.kind === 'coin') p.vy += 260 * dt;      // gravity
    if (p.kind === 'smoke') { p.vx *= 0.96; p.vy -= 14 * dt; }
  }
  s.particles = s.particles.filter(p => p.t > 0);
  s.flash = Math.max(0, s.flash - dt * 2);
  s.shake = Math.max(0, s.shake - dt * 3);
  return null;
}
