import { GameState, RELICS, burst, isSeen, newState, spawnMark, tick } from './game';
import { Renderer, View } from './render';

const cv = document.getElementById('cv') as HTMLCanvasElement;
const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
};

const renderer = new Renderer(cv);
const view: View = { W: 0, H: 0, CX: 0, CY: 0, R: 0 };

function resize(): void {
  const wrap = $('wrap');
  const s = Math.min(wrap.clientWidth - 12, wrap.clientHeight - 12, 460);
  const dpr = devicePixelRatio || 1;
  cv.width = s * dpr;
  cv.height = s * dpr;
  cv.style.width = `${s}px`;
  cv.style.height = `${s}px`;
  const ctx = cv.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  view.W = view.H = s;
  view.CX = view.CY = s / 2;
  view.R = s * 0.4;
  renderer.rebuild(view);
}
window.addEventListener('resize', resize);
resize();

let S: GameState = newState();
let raf = 0;
let last = 0;

function hud(): void {
  $('coins').textContent = String(S.coins);
  $('time').textContent = String(Math.ceil(Math.max(0, S.t)));
  $('hearts').textContent = '♥'.repeat(S.hearts) + (S.smoke ? '✶'.repeat(S.smoke) : '');
}

function start(): void {
  S = newState();
  for (let i = 0; i < 3; i++) spawnMark(S, view.R);
  $('startPanel').classList.remove('show');
  $('endPanel').classList.remove('show');
  last = performance.now();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(loop);
  hud();
}

function offerRelics(): void {
  S.paused = true;
  const picks = [...RELICS].sort(() => Math.random() - 0.5).slice(0, 2);
  const box = $('relicBtns');
  box.innerHTML = '';
  for (const r of picks) {
    const b = document.createElement('button');
    b.className = 'relic';
    const name = document.createElement('b');
    name.textContent = r.n;
    const desc = document.createElement('small');
    desc.textContent = r.d;
    b.append(name, desc);
    b.addEventListener('pointerdown', () => {
      r.f(S);
      $('relicPanel').classList.remove('show');
      S.paused = false;
      last = performance.now();
      hud();
    });
    box.appendChild(b);
  }
  $('relicPanel').classList.add('show');
}

function end(caught: boolean): void {
  S.over = true;
  cancelAnimationFrame(raf);
  $('endTitle').textContent = caught ? 'Caught!' : 'Dawn breaks';
  $('endCoins').textContent = `${S.coins} coin`;
  $('endText').textContent = caught
    ? `The watchman's hand falls on your shoulder after ${S.steals} purses. The stocks, then.`
    : `${S.steals} purses lifted and away over the rooftops before first light.`;
  $('endPanel').classList.add('show');
}

cv.addEventListener('pointerdown', e => {
  if (S.over || S.paused || !S.marks.length) return;
  const rect = cv.getBoundingClientRect();
  const x = e.clientX - rect.left - view.CX;
  const y = e.clientY - rect.top - view.CY;
  let best = null as (typeof S.marks)[number] | null;
  let bd = 44;
  for (const m of S.marks) {
    const mx = Math.cos(m.a) * m.r;
    const my = Math.sin(m.a) * m.r;
    const d = Math.hypot(mx - x, my - y);
    if (d < bd) { bd = d; best = m; }
  }
  if (!best) return;
  const bx = Math.cos(best.a) * best.r;
  const by = Math.sin(best.a) * best.r;
  const seen = isSeen(S, best.a);
  S.marks = S.marks.filter(m => m !== best);
  spawnMark(S, view.R);
  if (seen) {
    if (S.smoke > 0) {
      S.smoke--;
      burst(S, bx, by, 'smoke', 14);
      S.pops.push({ x: bx, y: by, txt: 'smoke!', c: '#9a8fc0', t: 1 });
    } else {
      S.hearts--;
      S.flash = 1;
      S.shake = 1;
      if (navigator.vibrate) navigator.vibrate([20, 60, 20]);
      S.pops.push({ x: bx, y: by, txt: 'seen!', c: '#c04040', t: 1 });
      if (S.hearts <= 0) { hud(); end(true); return; }
    }
  } else {
    const gain = Math.round(best.v * S.coinMult);
    S.coins += gain;
    S.steals++;
    S.speed *= 1.06;
    if (navigator.vibrate) navigator.vibrate(15);
    burst(S, bx, by, 'coin', 10);
    burst(S, bx, by, 'spark', 6);
    S.pops.push({ x: bx, y: by, txt: `+${gain}`, c: '#e0a83c', t: 1 });
    if (S.steals % 5 === 0) offerRelics();
  }
  hud();
});

function loop(t: number): void {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  const result = tick(S, dt);
  if (result === 'timeup') {
    hud();
    end(false);
    renderer.draw(S, view, dt);
    return;
  }
  renderer.draw(S, view, dt);
  hud();
  raf = requestAnimationFrame(loop);
}

// idle attract render behind the start panel
renderer.draw(S, view, 0);

$('startBtn').addEventListener('pointerdown', start);
$('againBtn').addEventListener('pointerdown', start);

// PWA service worker
if ('serviceWorker' in navigator && !import.meta.env.DEV) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* offline support is best-effort */
    });
  });
}
