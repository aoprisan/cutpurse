import { NightDef } from './levels';

export const TAU = Math.PI * 2;

export type MarkKind = 'commoner' | 'merchant' | 'noble' | 'constable';

export interface Mark {
  kind: MarkKind;
  a: number;      // angle on the plaza
  r: number;      // radius from centre
  v: number;      // purse value
  bob: number;    // idle bob phase
  spawn: number;  // spawn-in animation 0..1
  drift: number;  // angular wander speed (nobles only)
  driftT: number; // seconds until the wander changes heading
}

export interface Patrol {
  a: number;      // position angle on its ring
  rf: number;     // ring radius as a fraction of plaza radius
  dir: 1 | -1;
  speed: number;  // rad/s along the ring
  revT: number;   // seconds until it turns around
  step: number;   // walk-cycle phase
}

/** A lantern wedge somebody is sweeping across the plaza. Coordinates are plaza-centred. */
export interface Beam {
  x: number;
  y: number;
  ang: number;
  half: number;   // half-angle of the wedge
  reach: number;
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
  night: NightDef;
  coins: number;
  steals: number;
  hearts: number;
  smoke: number;
  cone: number;
  coinMult: number;
  speedMult: number;
  richLate: boolean;
  muffled: boolean;    // merchant thefts raise no commotion
  relicEvery: number;
  relicChoices: number;
  maxMarks: number;
  vMult: number;
  ang: number;
  dir: 1 | -1;
  speed: number;
  revT: number;
  commotion: number;   // extra watch fury from robbed merchants
  patrols: Patrol[];
  flash: number;
  shake: number;
  marks: Mark[];
  t: number;
  timeMax: number;
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
  { n: 'Fourth Finger of St. Nick', d: 'One more mistake forgiven. (+1 luck)', f: s => { s.hearts = Math.min(5, s.hearts + 1); } },
  { n: 'Weighted Dice', d: 'Purses run richer in the late hours.', f: s => { s.richLate = true; } },
  { n: 'Bell-Muffler’s Rag', d: 'Robbed merchants raise no commotion.', f: s => { s.muffled = true; s.commotion = 0; } },
  { n: 'Pocket Hourglass', d: 'Dawn holds off ten seconds longer.', f: s => { s.t += 10; } },
];

export function newState(def: NightDef, skills: ReadonlySet<string>): GameState {
  const time = def.time + (skills.has('guile2') ? 15 : 0);
  const s: GameState = {
    night: def,
    coins: 0,
    steals: 0,
    hearts: skills.has('shadow2') ? 4 : 3,
    smoke: skills.has('shadow3') ? 1 : 0,
    cone: def.cone,
    coinMult: (skills.has('fingers1') ? 1.25 : 1) * (skills.has('fingers3') ? 1.5 : 1),
    speedMult: skills.has('shadow1') ? 0.9 : 1,
    richLate: false,
    muffled: false,
    relicEvery: skills.has('guile3') ? 4 : 5,
    relicChoices: skills.has('guile1') ? 3 : 2,
    maxMarks: def.maxMarks + (skills.has('fingers2') ? 1 : 0),
    vMult: def.vMult * (skills.has('fingers2') ? 1.2 : 1),
    ang: Math.random() * TAU,
    dir: 1,
    speed: def.speed,
    revT: def.revMin + Math.random() * (def.revMax - def.revMin),
    commotion: 0,
    patrols: [],
    flash: 0,
    shake: 0,
    marks: [],
    t: time,
    timeMax: time,
    over: false,
    paused: false,
    pops: [],
    particles: [],
  };
  for (let i = 0; i < def.patrols; i++) {
    s.patrols.push({
      a: (i / def.patrols) * TAU + Math.random() * 0.8,
      rf: 0.78,
      dir: i % 2 === 0 ? 1 : -1,
      speed: def.patrolSpeed,
      revT: 6 + Math.random() * 6,
      step: Math.random() * TAU,
    });
  }
  return s;
}

export function angDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % TAU;
  return d > Math.PI ? TAU - d : d;
}

export function spawnMark(s: GameState, plazaR: number): void {
  const def = s.night;
  let a = 0;
  let tries = 0;
  do { a = Math.random() * TAU; tries++; } while (tries < 20 && s.marks.some(m => angDiff(a, m.a) < 0.45));
  const rr = plazaR * (0.55 + Math.random() * 0.38);

  let kind: MarkKind = 'commoner';
  const roll = Math.random();
  if (def.constables && roll < 0.14) kind = 'constable';
  else if (def.nobles && roll < 0.32) kind = 'noble';
  else if (def.merchants && roll < 0.52) kind = 'merchant';

  let base: number;
  switch (kind) {
    case 'merchant': base = 18 + Math.floor(Math.random() * 17); break;
    case 'noble': base = 12 + Math.floor(Math.random() * 15); break;
    case 'constable': base = 20 + Math.floor(Math.random() * 21); break; // bait — never paid out
    default: base = 5 + Math.floor(Math.random() * 11);
  }
  let v = Math.round(base * s.vMult);
  if (s.richLate && s.t < s.timeMax / 2) v = Math.floor(v * 1.8);

  s.marks.push({
    kind, a, r: rr, v,
    bob: Math.random() * TAU,
    spawn: 0,
    drift: kind === 'noble' ? (Math.random() < 0.5 ? -1 : 1) * (0.12 + Math.random() * 0.16) : 0,
    driftT: 2 + Math.random() * 3,
  });
}

/** All lantern wedges currently sweeping the plaza. */
export function beams(s: GameState, plazaR: number): Beam[] {
  const list: Beam[] = [
    { x: 0, y: 0, ang: s.ang, half: s.cone / 2, reach: plazaR + 30 },
  ];
  for (const p of s.patrols) {
    const pr = plazaR * p.rf;
    list.push({
      x: Math.cos(p.a) * pr,
      y: Math.sin(p.a) * pr,
      ang: p.a + p.dir * Math.PI / 2,
      half: 0.4,
      reach: plazaR * 0.55,
    });
  }
  return list;
}

/** Is the plaza-centred point (x, y) inside any lantern beam? */
export function seenAt(s: GameState, x: number, y: number, plazaR: number): boolean {
  for (const b of beams(s, plazaR)) {
    const dx = x - b.x;
    const dy = y - b.y;
    if (Math.hypot(dx, dy) <= b.reach && angDiff(Math.atan2(dy, dx), b.ang) <= b.half) return true;
  }
  return false;
}

export function markSeen(s: GameState, m: Mark, plazaR: number): boolean {
  return seenAt(s, Math.cos(m.a) * m.r, Math.sin(m.a) * m.r, plazaR);
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

/**
 * Advance simulation. Returns 'timeup' when the night ends, otherwise null.
 * `dt` is the capped step used for motion; `wallDt` is real elapsed seconds and
 * drives the dawn clock, so throttled or dropped frames can never stall the night.
 */
export function tick(s: GameState, dt: number, wallDt: number = dt): 'timeup' | null {
  if (s.paused || s.over) return null;
  s.t -= Math.max(dt, wallDt);
  if (s.t <= 0) return 'timeup';
  s.revT -= dt;
  if (s.revT <= 0) {
    s.dir = s.dir === 1 ? -1 : 1;
    s.revT = s.night.revMin + Math.random() * (s.night.revMax - s.night.revMin);
    s.flash = Math.max(s.flash, 0.5);
  }
  const fury = 1 + s.commotion;
  s.ang = (s.ang + s.dir * s.speed * s.speedMult * fury * dt + TAU) % TAU;
  for (const p of s.patrols) {
    p.revT -= dt;
    if (p.revT <= 0) {
      p.dir = p.dir === 1 ? -1 : 1;
      p.revT = 6 + Math.random() * 6;
    }
    p.a = (p.a + p.dir * p.speed * fury * dt + TAU) % TAU;
    p.step += dt * p.speed * 9;
  }
  for (const m of s.marks) {
    m.bob += dt * 2;
    m.spawn = Math.min(1, m.spawn + dt * 3);
    if (m.drift !== 0) {
      m.a = (m.a + m.drift * dt + TAU) % TAU;
      m.driftT -= dt;
      if (m.driftT <= 0) {
        m.drift = (Math.random() < 0.5 ? -1 : 1) * (0.12 + Math.random() * 0.16);
        m.driftT = 2 + Math.random() * 3;
      }
    }
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
