import { GameState, RELICS, burst, markSeen, newState, spawnMark, tick } from './game';
import { NIGHTS } from './levels';
import { BRANCH_NAMES, Branch, SKILLS, buySkill, loadSave, persist, skillStatus } from './progression';
import { Renderer, View } from './render';
import { ensureAudio, isMuted, sfx, toggleMute } from './sound';

const cv = document.getElementById('cv') as HTMLCanvasElement;
const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
};

const renderer = new Renderer(cv);
const view: View = { W: 0, H: 0, CX: 0, CY: 0, R: 0 };
const save = loadSave();

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

function currentNight() {
  return NIGHTS[Math.min(save.night, NIGHTS.length) - 1];
}

let S: GameState = newState(currentNight(), new Set(save.skills));
let raf = 0;
let last = 0;

function hud(): void {
  $('nightNo').textContent = String(S.night.id);
  $('coins').textContent = `${S.coins}∕${S.night.quota}`;
  ($('coins')).style.color = S.coins >= S.night.quota ? '#8cdc8c' : '';
  $('time').textContent = String(Math.ceil(Math.max(0, S.t)));
  $('hearts').textContent = '♥'.repeat(S.hearts) + (S.smoke ? '✶'.repeat(S.smoke) : '');
}

function hideAllPanels(): void {
  for (const id of ['startPanel', 'endPanel', 'relicPanel', 'guildPanel']) {
    $(id).classList.remove('show');
  }
}

function showStart(): void {
  const def = currentNight();
  hideAllPanels();
  $('startTitle').textContent = `Night ${def.id} — ${def.name}`;
  $('startFlavor').textContent = def.flavor;
  $('startQuota').textContent = `The Guild demands ${def.quota} coin by dawn.`;
  $('startCoffers').textContent = `Guild coffers: ${save.coffers} coin`;
  $('startPanel').classList.add('show');
  S = newState(def, new Set(save.skills));
  hud();
  renderer.draw(S, view, 0);
}

function start(): void {
  const def = currentNight();
  S = newState(def, new Set(save.skills));
  for (let i = 0; i < S.maxMarks; i++) spawnMark(S, view.R);
  hideAllPanels();
  last = performance.now();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(loop);
  hud();
}

function offerRelics(): void {
  S.paused = true;
  const picks = [...RELICS].sort(() => Math.random() - 0.5).slice(0, S.relicChoices);
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
      sfx.relic();
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

type EndKind = 'caught' | 'short' | 'clear' | 'victory';

function end(kind: EndKind): void {
  S.over = true;
  cancelAnimationFrame(raf);
  const def = S.night;
  const title = $('endTitle');
  const text = $('endText');
  const next = $('nextBtn');
  $('endCoins').textContent = `${S.coins} coin`;

  switch (kind) {
    case 'caught':
      sfx.caught();
      title.textContent = 'Caught!';
      text.textContent = `The watch takes everything — ${S.coins} coin, gone. The stocks till sundown, then ${def.name} again.`;
      next.textContent = 'Try again';
      break;
    case 'short':
      sfx.dawnShort();
      save.coffers += Math.floor(S.coins / 2);
      title.textContent = 'Dawn breaks — too light';
      text.textContent = `${S.coins} of ${def.quota} coin. The Guild takes its half and sends you back to ${def.name}.`;
      next.textContent = 'Try again';
      break;
    case 'clear':
      sfx.dawnClear();
      save.coffers += S.coins;
      save.night = def.id + 1;
      title.textContent = 'Quota met';
      text.textContent = `${S.steals} purses lifted and away over the rooftops. The coin is banked; ${NIGHTS[def.id].name} awaits.`;
      next.textContent = 'Next night';
      break;
    case 'victory':
      sfx.victory();
      save.coffers += S.coins;
      save.won = true;
      title.textContent = 'The Palace falls';
      text.textContent = `The king's own masquerade, picked clean. ${S.steals} purses, ${S.coins} coin, and a legend no gallows will ever catch. The Guild is yours, Guildmaster.`;
      next.textContent = 'Begin anew';
      break;
  }
  persist(save);
  $('endCoffers').textContent = `Guild coffers: ${save.coffers} coin`;
  hideAllPanels();
  $('endPanel').classList.add('show');
  ($('endPanel') as HTMLElement).dataset.kind = kind;
}

cv.addEventListener('pointerdown', e => {
  ensureAudio();
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
  const seen = markSeen(S, best, view.R);
  const caughtOut = best.kind === 'constable' || seen;
  S.marks = S.marks.filter(m => m !== best);
  while (S.marks.length < S.maxMarks) spawnMark(S, view.R);

  if (caughtOut) {
    if (S.smoke > 0) {
      S.smoke--;
      sfx.smoke();
      burst(S, bx, by, 'smoke', 14);
      S.pops.push({ x: bx, y: by, txt: 'smoke!', c: '#9a8fc0', t: 1 });
    } else {
      S.hearts--;
      S.flash = 1;
      S.shake = 1;
      sfx.seen();
      if (navigator.vibrate) navigator.vibrate([20, 60, 20]);
      const txt = best.kind === 'constable' ? 'constable!' : 'seen!';
      S.pops.push({ x: bx, y: by, txt, c: '#c04040', t: 1 });
      if (S.hearts <= 0) { hud(); end('caught'); return; }
    }
  } else {
    const gain = Math.round(best.v * S.coinMult);
    S.coins += gain;
    S.steals++;
    S.speed *= 1.06;
    sfx.steal();
    if (navigator.vibrate) navigator.vibrate(15);
    burst(S, bx, by, 'coin', 10);
    burst(S, bx, by, 'spark', 6);
    S.pops.push({ x: bx, y: by, txt: `+${gain}`, c: '#e0a83c', t: 1 });
    if (best.kind === 'merchant' && !S.muffled) {
      S.commotion += 0.15;
      S.pops.push({ x: bx, y: by - 16, txt: 'commotion!', c: '#e08050', t: 1.2 });
    }
    if (S.steals % S.relicEvery === 0) offerRelics();
  }
  hud();
});

function loop(t: number): void {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  const result = tick(S, dt);
  if (result === 'timeup') {
    hud();
    if (S.coins >= S.night.quota) {
      end(S.night.id >= NIGHTS.length ? 'victory' : 'clear');
    } else {
      end('short');
    }
    renderer.draw(S, view, dt);
    return;
  }
  renderer.draw(S, view, dt);
  hud();
  raf = requestAnimationFrame(loop);
}

// --- Guild skill tree panel ---

function renderGuild(): void {
  $('guildCoffers').textContent = `${save.coffers} coin in the coffers`;
  const cols = $('treeCols');
  cols.innerHTML = '';
  const branches: Branch[] = ['fingers', 'shadow', 'guile'];
  for (const br of branches) {
    const col = document.createElement('div');
    col.className = 'branch';
    const h = document.createElement('h3');
    h.textContent = BRANCH_NAMES[br];
    col.appendChild(h);
    for (const sk of SKILLS.filter(s => s.branch === br)) {
      const st = skillStatus(save, sk);
      const btn = document.createElement('button');
      btn.className = `node ${st}`;
      const name = document.createElement('b');
      name.textContent = sk.name;
      const desc = document.createElement('small');
      desc.textContent = sk.desc;
      const cost = document.createElement('span');
      cost.className = 'cost';
      cost.textContent = st === 'owned' ? '✓ owned' : st === 'locked' ? '🔒 locked' : `${sk.cost} coin`;
      btn.append(name, desc, cost);
      if (st === 'available') {
        btn.addEventListener('pointerdown', () => {
          if (buySkill(save, sk)) {
            sfx.buy();
            renderGuild();
          }
        });
      } else {
        btn.disabled = st !== 'owned';
      }
      col.appendChild(btn);
    }
    cols.appendChild(col);
  }
}

function openGuild(): void {
  hideAllPanels();
  renderGuild();
  $('guildPanel').classList.add('show');
}

// --- buttons ---

function press(id: string, fn: () => void): void {
  $(id).addEventListener('pointerdown', () => {
    ensureAudio();
    sfx.click();
    fn();
  });
}

press('startBtn', start);
press('guildBtn', openGuild);
press('endGuildBtn', openGuild);
press('guildBackBtn', showStart);
press('nextBtn', () => {
  const kind = ($('endPanel') as HTMLElement).dataset.kind as EndKind | undefined;
  if (kind === 'victory') {
    save.night = 1;
    persist(save);
  }
  showStart();
});

const muteBtn = $('muteBtn');
function muteLabel(): void {
  muteBtn.textContent = isMuted() ? 'off' : 'on';
}
muteBtn.addEventListener('pointerdown', () => {
  toggleMute();
  ensureAudio();
  muteLabel();
});
muteLabel();

// keep the clock honest when the tab comes back
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) last = performance.now();
});

// idle attract render behind the start panel
showStart();

// PWA service worker
if ('serviceWorker' in navigator && !import.meta.env.DEV) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* offline support is best-effort */
    });
  });
}
