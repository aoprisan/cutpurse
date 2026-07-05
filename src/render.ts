import { Beam, GameState, Mark, TAU, beams, markSeen } from './game';

export interface View {
  W: number;
  H: number;
  CX: number;
  CY: number;
  R: number;
}

interface Star { x: number; y: number; size: number; tw: number; }
interface Torch { x: number; y: number; ph: number; }
interface FogBlob { x: number; y: number; r: number; vx: number; ph: number; }

// Deterministic PRNG so the prerendered plaza looks the same every resize.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement | null = null;
  private vignette: HTMLCanvasElement | null = null;
  private stars: Star[] = [];
  private torches: Torch[] = [];
  private fog: FogBlob[] = [];
  private time = 0;

  constructor(cv: HTMLCanvasElement) {
    const ctx = cv.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    this.ctx = ctx;
  }

  /** Rebuild prerendered layers for a new canvas size. */
  rebuild(v: View): void {
    const dpr = devicePixelRatio || 1;
    const rand = mulberry32(0xc0ffee);

    // --- static background: sky is drawn live; this holds rooftops + cobbled plaza ---
    const bg = document.createElement('canvas');
    bg.width = v.W * dpr; bg.height = v.H * dpr;
    const b = bg.getContext('2d')!;
    b.scale(dpr, dpr);

    // rooftop silhouettes ringing the plaza
    b.save();
    b.translate(v.CX, v.CY);
    b.fillStyle = '#0b0918';
    const outer = v.R + 26;
    b.beginPath();
    b.rect(-v.CX, -v.CY, v.W, v.H);
    b.arc(0, 0, outer, 0, TAU, true);
    b.fill('evenodd');
    // gable + chimney bumps on the ring edge
    b.fillStyle = '#0e0b1d';
    const nRoof = 26;
    for (let i = 0; i < nRoof; i++) {
      const a = (i / nRoof) * TAU + rand() * 0.1;
      const w = 0.10 + rand() * 0.12;
      const h = 8 + rand() * 18;
      b.beginPath();
      b.moveTo(Math.cos(a - w) * outer, Math.sin(a - w) * outer);
      b.lineTo(Math.cos(a) * (outer - h), Math.sin(a) * (outer - h));
      b.lineTo(Math.cos(a + w) * outer, Math.sin(a + w) * outer);
      b.closePath();
      b.fill();
    }
    // scattered lit windows in the dark ring
    for (let i = 0; i < 34; i++) {
      const a = rand() * TAU;
      const rr = outer + 6 + rand() * Math.max(12, Math.min(v.CX, v.CY) - outer - 10);
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      if (Math.abs(x) > v.CX - 4 || Math.abs(y) > v.CY - 4) continue;
      b.fillStyle = `rgba(224,168,60,${0.10 + rand() * 0.25})`;
      b.fillRect(x, y, 2.5, 3.5);
    }

    // plaza base
    const base = b.createRadialGradient(0, -v.R * 0.2, v.R * 0.1, 0, 0, outer);
    base.addColorStop(0, '#242040');
    base.addColorStop(0.7, '#1b1631');
    base.addColorStop(1, '#141021');
    b.fillStyle = base;
    b.beginPath(); b.arc(0, 0, outer, 0, TAU); b.fill();

    // cobblestones in concentric rings
    for (let ring = 0; ring < 9; ring++) {
      const rr = outer * (0.14 + ring * 0.105);
      const n = Math.max(6, Math.floor(rr / 7));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + (ring % 2) * (Math.PI / n) + (rand() - 0.5) * 0.04;
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        const sw = 4.5 + rand() * 3, sh = 3 + rand() * 2.2;
        const shade = 0.05 + rand() * 0.09;
        b.fillStyle = `rgba(0,0,0,${shade})`;
        b.beginPath(); b.ellipse(x, y + 0.8, sw, sh, a, 0, TAU); b.fill();
        b.fillStyle = `rgba(120,110,160,${0.05 + rand() * 0.07})`;
        b.beginPath(); b.ellipse(x, y, sw, sh, a, 0, TAU); b.fill();
      }
    }

    // plaza rim
    b.strokeStyle = '#2f2750';
    b.lineWidth = 2;
    b.beginPath(); b.arc(0, 0, outer, 0, TAU); b.stroke();
    b.strokeStyle = 'rgba(60,50,100,.35)';
    b.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      b.beginPath(); b.arc(0, 0, v.R * (0.35 + i * 0.25), 0, TAU); b.stroke();
    }

    // market stalls tucked against the rim
    const stallAngles = [0.7, 2.6, 4.5].map(a => a + rand() * 0.4);
    for (const a of stallAngles) {
      const sx = Math.cos(a) * (outer - 13);
      const sy = Math.sin(a) * (outer - 13);
      b.save();
      b.translate(sx, sy);
      b.rotate(a + Math.PI / 2);
      // counter
      b.fillStyle = '#2a2142';
      b.fillRect(-13, -3, 26, 8);
      b.fillStyle = 'rgba(0,0,0,.3)';
      b.fillRect(-13, 4, 26, 2.5);
      // goods on the counter
      for (let g = 0; g < 4; g++) {
        b.fillStyle = ['#7a4a3a', '#4a6a4a', '#8a7a3a', '#5a4a7a'][g];
        b.beginPath(); b.arc(-9 + g * 6, -1, 2.1, 0, TAU); b.fill();
      }
      // striped awning
      const stripes = 6;
      for (let st = 0; st < stripes; st++) {
        b.fillStyle = st % 2 ? '#5a2f38' : '#8a7050';
        b.beginPath();
        b.moveTo(-15 + (st / stripes) * 30, -14);
        b.lineTo(-15 + ((st + 1) / stripes) * 30, -14);
        b.lineTo(-13 + ((st + 1) / stripes) * 26, -5);
        b.lineTo(-13 + (st / stripes) * 26, -5);
        b.closePath();
        b.fill();
      }
      b.fillStyle = 'rgba(0,0,0,.25)';
      b.fillRect(-15, -14.8, 30, 1.4);
      // poles
      b.strokeStyle = '#1c1730';
      b.lineWidth = 1.6;
      b.beginPath(); b.moveTo(-13, -13); b.lineTo(-13, 5); b.moveTo(13, -13); b.lineTo(13, 5); b.stroke();
      b.restore();
    }

    // barrels and crates scattered near the rim
    for (let i = 0; i < 5; i++) {
      const a = rand() * TAU;
      if (stallAngles.some(sa => Math.abs(((a - sa + Math.PI) % TAU) - Math.PI) < 0.5)) continue;
      const rr = outer - 8 - rand() * 6;
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      if (rand() < 0.5) {
        // barrel
        b.fillStyle = '#3a2c22';
        b.beginPath(); b.ellipse(x, y, 4.2, 5.2, 0, 0, TAU); b.fill();
        b.strokeStyle = 'rgba(140,120,90,.5)';
        b.lineWidth = 0.8;
        b.beginPath(); b.moveTo(x - 4, y - 1.6); b.lineTo(x + 4, y - 1.6);
        b.moveTo(x - 4, y + 1.6); b.lineTo(x + 4, y + 1.6); b.stroke();
      } else {
        // crate
        b.fillStyle = '#342a20';
        b.fillRect(x - 4, y - 4, 8, 8);
        b.strokeStyle = 'rgba(0,0,0,.4)';
        b.lineWidth = 0.8;
        b.strokeRect(x - 4, y - 4, 8, 8);
        b.beginPath(); b.moveTo(x - 4, y - 4); b.lineTo(x + 4, y + 4); b.stroke();
      }
    }

    // torch posts on the rim — flames are drawn live
    this.torches = [];
    const nTorch = 6;
    for (let i = 0; i < nTorch; i++) {
      const a = (i / nTorch) * TAU + 0.45;
      const x = Math.cos(a) * (outer - 4);
      const y = Math.sin(a) * (outer - 4);
      b.strokeStyle = '#241d38';
      b.lineWidth = 2.4;
      b.beginPath(); b.moveTo(x, y + 4); b.lineTo(x, y - 9); b.stroke();
      b.fillStyle = '#241d38';
      b.beginPath(); b.arc(x, y - 9, 2.4, 0, TAU); b.fill();
      this.torches.push({ x: v.CX + x, y: v.CY + y - 10, ph: i * 1.7 });
    }
    b.restore();
    this.bg = bg;

    // --- vignette overlay ---
    const vg = document.createElement('canvas');
    vg.width = v.W * dpr; vg.height = v.H * dpr;
    const g = vg.getContext('2d')!;
    g.scale(dpr, dpr);
    const grad = g.createRadialGradient(v.CX, v.CY, v.R * 0.55, v.CX, v.CY, Math.max(v.CX, v.CY) * 1.25);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = grad;
    g.fillRect(0, 0, v.W, v.H);
    this.vignette = vg;

    // --- stars (twinkle live, drawn over the rooftop ring outside the plaza) ---
    this.stars = [];
    const srand = mulberry32(0xbead);
    let starTries = 0;
    while (this.stars.length < 46 && starTries++ < 600) {
      const x = srand() * v.W;
      const y = srand() * v.H;
      const size = 0.5 + srand() * 1.2;
      const tw = srand() * TAU;
      if (Math.hypot(x - v.CX, y - v.CY) > outer + 8) this.stars.push({ x, y, size, tw });
    }

    // --- drifting fog blobs ---
    this.fog = [];
    const frand = mulberry32(0xf06);
    for (let i = 0; i < 3; i++) {
      this.fog.push({
        x: frand() * v.W,
        y: v.CY + (frand() - 0.5) * v.R * 1.4,
        r: v.R * (0.35 + frand() * 0.3),
        vx: 3 + frand() * 5,
        ph: frand() * TAU,
      });
    }
  }

  draw(s: GameState, v: View, dt: number): void {
    const ctx = this.ctx;
    this.time += dt;
    const t = this.time;

    // sky — deep night warming toward dawn as the timer runs out
    const dawn = 1 - Math.min(1, Math.max(0, s.t / s.timeMax));
    const sky = ctx.createLinearGradient(0, 0, 0, v.H);
    sky.addColorStop(0, lerpColor([9, 7, 20], [42, 26, 48], dawn * dawn));
    sky.addColorStop(1, lerpColor([19, 16, 34], [70, 40, 55], dawn * dawn));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, v.W, v.H);

    // prerendered rooftops + plaza
    if (this.bg) ctx.drawImage(this.bg, 0, 0, v.W, v.H);

    // stars over the rooftops, fading as dawn nears
    const starAlpha = 1 - dawn * 0.8;
    for (const st of this.stars) {
      const a = (0.35 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.7 + st.tw))) * starAlpha;
      ctx.fillStyle = `rgba(227,213,179,${a.toFixed(3)})`;
      ctx.fillRect(st.x, st.y, st.size, st.size);
    }
    // moon hanging over the city's corner
    ctx.save();
    ctx.globalAlpha = 0.9 - dawn * 0.5;
    const mx = v.W * 0.87, my = v.H * 0.12;
    const mg = ctx.createRadialGradient(mx, my, 2, mx, my, 26);
    mg.addColorStop(0, 'rgba(230,225,205,.9)');
    mg.addColorStop(0.4, 'rgba(230,225,205,.25)');
    mg.addColorStop(1, 'rgba(230,225,205,0)');
    ctx.fillStyle = mg;
    ctx.beginPath(); ctx.arc(mx, my, 26, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ddd8c2';
    ctx.beginPath(); ctx.arc(mx, my, 9, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(150,145,130,.5)';
    ctx.beginPath(); ctx.arc(mx - 3, my + 2, 2.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(mx + 3.5, my - 3, 1.5, 0, TAU); ctx.fill();
    ctx.restore();

    // torch flames on the rim
    for (const tc of this.torches) {
      const fl = 0.8 + Math.sin(t * 11 + tc.ph) * 0.14 + Math.sin(t * 23 + tc.ph * 2) * 0.08;
      const fg = ctx.createRadialGradient(tc.x, tc.y, 0.5, tc.x, tc.y, 13 * fl);
      fg.addColorStop(0, 'rgba(255,190,90,.55)');
      fg.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.arc(tc.x, tc.y, 13 * fl, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(255,210,120,${(0.85 * fl).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(tc.x, tc.y - 1.5 * fl, 1.6, 3.2 * fl, Math.sin(t * 9 + tc.ph) * 0.25, 0, TAU);
      ctx.fill();
    }

    // screen shake
    ctx.save();
    if (s.shake > 0) {
      ctx.translate((Math.random() - 0.5) * s.shake * 10, (Math.random() - 0.5) * s.shake * 10);
    }
    ctx.translate(v.CX, v.CY);

    const allBeams = beams(s, v.R);
    this.drawBeam(allBeams[0], s, t, 1);
    for (let i = 1; i < allBeams.length; i++) this.drawBeam(allBeams[i], s, t, 0.75);
    this.drawWatchman(s, t);
    for (const p of s.patrols) this.drawPatrol(p.a, p.rf * v.R, p.dir, p.step, t);
    this.drawMarks(s, v, t);
    this.drawParticles(s);
    this.drawPops(s);
    this.drawQuotaArc(s, v);

    ctx.restore();

    // drifting fog
    for (const f of this.fog) {
      f.x += f.vx * dt;
      if (f.x - f.r > v.W) f.x = -f.r;
      const fa = 0.05 + 0.03 * Math.sin(t * 0.4 + f.ph);
      const fgr = ctx.createRadialGradient(f.x, f.y, f.r * 0.15, f.x, f.y, f.r);
      fgr.addColorStop(0, `rgba(150,140,190,${fa.toFixed(3)})`);
      fgr.addColorStop(1, 'rgba(150,140,190,0)');
      ctx.fillStyle = fgr;
      ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.55, 0, 0, TAU); ctx.fill();
    }

    // dawn warmth creeping over the whole scene
    if (dawn > 0.35) {
      const warm = (dawn - 0.35) / 0.65;
      const dg = ctx.createLinearGradient(0, 0, 0, v.H);
      dg.addColorStop(0, `rgba(255,140,80,${(warm * 0.14).toFixed(3)})`);
      dg.addColorStop(1, `rgba(255,170,110,${(warm * 0.05).toFixed(3)})`);
      ctx.fillStyle = dg;
      ctx.fillRect(0, 0, v.W, v.H);
    }

    // vignette + flash
    if (this.vignette) ctx.drawImage(this.vignette, 0, 0, v.W, v.H);
    if (s.flash > 0) {
      ctx.fillStyle = `rgba(160,48,48,${(s.flash * 0.25).toFixed(3)})`;
      ctx.fillRect(0, 0, v.W, v.H);
    }
  }

  /** Gold arc around the plaza rim tracking progress toward the night's quota. */
  private drawQuotaArc(s: GameState, v: View): void {
    const ctx = this.ctx;
    const frac = Math.min(1, s.coins / s.night.quota);
    const rr = v.R + 20;
    ctx.strokeStyle = 'rgba(224,168,60,.14)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, rr, -Math.PI / 2, -Math.PI / 2 + TAU); ctx.stroke();
    if (frac > 0) {
      ctx.strokeStyle = frac >= 1 ? 'rgba(140,220,140,.85)' : 'rgba(224,168,60,.75)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, 0, rr, -Math.PI / 2, -Math.PI / 2 + TAU * frac); ctx.stroke();
      ctx.lineCap = 'butt';
    }
  }

  private drawBeam(bm: Beam, s: GameState, t: number, intensity: number): void {
    const ctx = this.ctx;
    const flicker = 1 + Math.sin(t * 13 + bm.x) * 0.03 + Math.sin(t * 29 + 1.7 + bm.y) * 0.02;
    const reach = bm.reach * flicker;
    const angry = Math.min(1, s.commotion * 2.5);

    const g = ctx.createRadialGradient(bm.x, bm.y, 6, bm.x, bm.y, reach);
    const rC = Math.round(224 + angry * 20);
    const gC = Math.round(168 - angry * 60);
    const bC = Math.round(60 - angry * 20);
    g.addColorStop(0, `rgba(${rC},${gC},${bC},${(0.55 * flicker * intensity).toFixed(3)})`);
    g.addColorStop(0.55, `rgba(${rC},${gC},${bC},${(0.22 * intensity).toFixed(3)})`);
    g.addColorStop(1, `rgba(${rC},${gC},${bC},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(bm.x, bm.y);
    ctx.arc(bm.x, bm.y, reach, bm.ang - bm.half, bm.ang + bm.half);
    ctx.closePath();
    ctx.fill();

    // soft edges
    ctx.strokeStyle = `rgba(${rC},${gC},${bC},${(0.45 * flicker * intensity).toFixed(3)})`;
    ctx.lineWidth = 1;
    for (const a of [bm.ang - bm.half, bm.ang + bm.half]) {
      ctx.beginPath();
      ctx.moveTo(bm.x, bm.y);
      ctx.lineTo(bm.x + Math.cos(a) * reach, bm.y + Math.sin(a) * reach);
      ctx.stroke();
    }

    // dust motes drifting in the beam
    ctx.fillStyle = 'rgba(240,200,120,.5)';
    for (let i = 0; i < 8; i++) {
      const ph = (t * 0.13 + i * 0.125) % 1;
      const a = bm.ang + Math.sin(i * 12.9898 + Math.floor(t * 0.13 + i * 0.125) * 78.233) * bm.half * 0.8;
      const rr = 20 + ph * (reach - 30);
      ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.5 * intensity;
      ctx.beginPath();
      ctx.arc(bm.x + Math.cos(a) * rr, bm.y + Math.sin(a) * rr, 1.1, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawWatchman(s: GameState, t: number): void {
    const ctx = this.ctx;
    const fx = Math.cos(s.ang), fy = Math.sin(s.ang);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(0, 6, 15, 6, 0, 0, TAU); ctx.fill();
    // halberd resting against the off shoulder
    ctx.strokeStyle = '#3a3358';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-fx * 9 - fy * 4, -fy * 9 + fx * 4 + 6);
    ctx.lineTo(-fx * 13 - fy * 6, -fy * 13 + fx * 6 - 20);
    ctx.stroke();
    ctx.fillStyle = '#4a4270';
    ctx.beginPath();
    const hx = -fx * 13 - fy * 6, hy = -fy * 13 + fx * 6 - 20;
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx + 3, hy + 5);
    ctx.lineTo(hx - 3, hy + 5);
    ctx.closePath();
    ctx.fill();
    // cloak
    const grad = ctx.createRadialGradient(-3, -5, 2, 0, 0, 15);
    grad.addColorStop(0, '#4a4270');
    grad.addColorStop(1, '#2c2648');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.fill();
    // shoulder trim catching lantern light on the facing side
    ctx.strokeStyle = 'rgba(224,168,60,.35)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 12, s.ang - 0.9, s.ang + 0.9); ctx.stroke();
    // hat brim + crown, head leaning toward the beam
    const hxo = fx * 2, hyo = fy * 2;
    ctx.fillStyle = '#211c3a';
    ctx.beginPath(); ctx.ellipse(hxo, -7 + hyo * 0.4, 9, 3.2, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(hxo, -10 + hyo * 0.4, 5, 4, 0, 0, TAU); ctx.fill();
    // lantern held toward facing direction, with pulsing glow
    const lx = fx * 10, ly = fy * 10;
    const pulse = 4.5 + Math.sin(t * 9) * 0.5;
    const lg = ctx.createRadialGradient(lx, ly, 1, lx, ly, 14);
    lg.addColorStop(0, 'rgba(255,214,120,.9)');
    lg.addColorStop(1, 'rgba(255,214,120,0)');
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.arc(lx, ly, 14, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffd678';
    ctx.beginPath(); ctx.arc(lx, ly, pulse, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#3a3358';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(lx, ly, pulse + 1.2, 0, TAU); ctx.stroke();
  }

  /** A patrol watchman walking a ring, lantern swinging ahead of him. */
  private drawPatrol(a: number, r: number, dir: 1 | -1, step: number, t: number): void {
    const ctx = this.ctx;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    const head = a + dir * Math.PI / 2; // walking heading
    const sway = Math.sin(step) * 1.4;

    ctx.save();
    ctx.translate(x, y + Math.abs(Math.sin(step)) * -1.2);

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,.32)';
    ctx.beginPath(); ctx.ellipse(0, 8, 9, 3.6, 0, 0, TAU); ctx.fill();
    // legs scissoring
    ctx.strokeStyle = '#242038';
    ctx.lineWidth = 2.4;
    const lx = Math.cos(head), ly = Math.sin(head);
    ctx.beginPath();
    ctx.moveTo(0, 2); ctx.lineTo(lx * sway * 2, 8 + Math.abs(sway));
    ctx.moveTo(0, 2); ctx.lineTo(-lx * sway * 2, 8 + Math.abs(sway) * 0.5);
    ctx.stroke();
    // coat
    const cg = ctx.createLinearGradient(0, -10, 0, 6);
    cg.addColorStop(0, '#3d4a6e');
    cg.addColorStop(1, '#232c44');
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.ellipse(0, -2, 6.5, 8.5, 0, 0, TAU); ctx.fill();
    // head + kettle helm
    ctx.fillStyle = '#c9a882';
    ctx.beginPath(); ctx.arc(lx * 1.5, -10 + ly * 0.5, 3.4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#4a5578';
    ctx.beginPath(); ctx.ellipse(lx * 1.5, -11.5 + ly * 0.5, 5, 2.2, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(lx * 1.5, -12 + ly * 0.5, 3, Math.PI, TAU); ctx.fill();
    // lantern swinging ahead
    const swing = Math.sin(step * 0.5) * 2;
    const gx = lx * 8 + Math.cos(head + Math.PI / 2) * swing;
    const gy = ly * 8 + Math.sin(head + Math.PI / 2) * swing - 2;
    const lg = ctx.createRadialGradient(gx, gy, 1, gx, gy, 10);
    lg.addColorStop(0, 'rgba(255,214,120,.85)');
    lg.addColorStop(1, 'rgba(255,214,120,0)');
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.arc(gx, gy, 10, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffd678';
    ctx.beginPath(); ctx.arc(gx, gy, 2.6 + Math.sin(t * 8) * 0.3, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#2c3350';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(gx, gy, 3.6, 0, TAU); ctx.stroke();

    ctx.restore();
  }

  private drawMarks(s: GameState, v: View, t: number): void {
    const ctx = this.ctx;
    for (const m of s.marks) {
      const scale = 0.4 + 0.6 * easeOut(m.spawn);
      const x = Math.cos(m.a) * m.r;
      const y = Math.sin(m.a) * m.r + Math.sin(m.bob) * 2.5;
      const seen = markSeen(s, m, v.R);

      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.globalAlpha = m.spawn;

      // ground shadow
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.beginPath(); ctx.ellipse(0, 17, 11, 4.5, 0, 0, TAU); ctx.fill();

      this.drawMarkBody(m, seen, t);

      // alert mark when seen
      if (seen) {
        ctx.fillStyle = '#e05050';
        ctx.font = 'bold 13px Georgia';
        ctx.textAlign = 'center';
        ctx.fillText('!', -10, -12);
      }

      // value label — constables carry bait purses of unknowable worth
      ctx.fillStyle = m.kind === 'constable' ? 'rgba(220,150,150,.9)' : 'rgba(227,213,179,.9)';
      ctx.font = '11px Georgia';
      ctx.textAlign = 'center';
      ctx.fillText(m.kind === 'constable' ? '?' : String(m.v), 10, -14);

      ctx.restore();
    }
  }

  private drawMarkBody(m: Mark, seen: boolean, t: number): void {
    const ctx = this.ctx;
    const cg = ctx.createLinearGradient(0, -12, 0, 20);

    switch (m.kind) {
      case 'merchant': {
        // round-bellied, broad hat, fat purse
        if (seen) { cg.addColorStop(0, '#a86a6a'); cg.addColorStop(1, '#6b3d3d'); }
        else { cg.addColorStop(0, '#5f7a55'); cg.addColorStop(1, '#3a4d34'); }
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.ellipse(0, 9, 11, 11, 0, 0, TAU); ctx.fill();
        // sash
        ctx.strokeStyle = seen ? '#7a4444' : '#8a7040';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(-9, 4); ctx.lineTo(9, 12); ctx.stroke();
        // head + wide-brimmed hat
        ctx.fillStyle = '#c9a882';
        ctx.beginPath(); ctx.arc(0, -6, 5.5, 0, TAU); ctx.fill();
        ctx.fillStyle = seen ? '#3d2626' : '#2e3a26';
        ctx.beginPath(); ctx.ellipse(0, -9, 9.5, 3, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(0, -11.5, 4.5, 3.2, 0, 0, TAU); ctx.fill();
        this.drawPurse(m, t, 5.5);
        break;
      }
      case 'noble': {
        // slim, tall, feathered cap, gold trim
        if (seen) { cg.addColorStop(0, '#a86a6a'); cg.addColorStop(1, '#6b3d3d'); }
        else { cg.addColorStop(0, '#7a3d5a'); cg.addColorStop(1, '#4a2338'); }
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.ellipse(0, 7, 7.5, 12.5, 0, 0, TAU); ctx.fill();
        // gold trim
        ctx.strokeStyle = 'rgba(224,168,60,.6)';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.ellipse(0, 7, 6.2, 11, 0, 0, TAU); ctx.stroke();
        // head + cap
        ctx.fillStyle = '#d8b896';
        ctx.beginPath(); ctx.arc(0, -8, 5, 0, TAU); ctx.fill();
        ctx.fillStyle = seen ? '#3d2626' : '#5a2d42';
        ctx.beginPath(); ctx.ellipse(0.5, -11, 5.5, 3, -0.15, 0, TAU); ctx.fill();
        // feather
        ctx.strokeStyle = '#d8cfa8';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(4, -12);
        ctx.quadraticCurveTo(9, -18 + Math.sin(t * 3 + m.a) * 0.8, 12, -15);
        ctx.stroke();
        this.drawPurse(m, t, 4.8);
        break;
      }
      case 'constable': {
        // navy coat, brass buttons, tell-tale red plume
        if (seen) { cg.addColorStop(0, '#a86a6a'); cg.addColorStop(1, '#6b3d3d'); }
        else { cg.addColorStop(0, '#46587e'); cg.addColorStop(1, '#28344e'); }
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.ellipse(0, 8, 9, 11.5, 0, 0, TAU); ctx.fill();
        // brass buttons
        ctx.fillStyle = 'rgba(224,190,110,.8)';
        for (let i = 0; i < 3; i++) {
          ctx.beginPath(); ctx.arc(0, 1 + i * 5, 1.1, 0, TAU); ctx.fill();
        }
        // head + tall hat with THE red plume
        ctx.fillStyle = '#c9a882';
        ctx.beginPath(); ctx.arc(0, -6.5, 5, 0, TAU); ctx.fill();
        ctx.fillStyle = seen ? '#3d2626' : '#232c44';
        ctx.beginPath(); ctx.ellipse(0, -9.5, 7, 2.4, 0, 0, TAU); ctx.fill();
        ctx.fillRect(-4, -16, 8, 7);
        ctx.fillStyle = '#c04040';
        ctx.beginPath();
        ctx.moveTo(3, -16);
        ctx.quadraticCurveTo(6.5, -21, 9, -18);
        ctx.quadraticCurveTo(6, -17.5, 4.5, -14.5);
        ctx.closePath();
        ctx.fill();
        this.drawPurse(m, t, 5.8);
        break;
      }
      default: {
        // commoner — hooded cloak
        if (seen) { cg.addColorStop(0, '#a86a6a'); cg.addColorStop(1, '#6b3d3d'); }
        else { cg.addColorStop(0, '#6f6594'); cg.addColorStop(1, '#453d63'); }
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.ellipse(0, 8, 9, 11, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(0, -6, 7, 0, TAU); ctx.fill();
        ctx.fillStyle = seen ? '#3d2626' : '#262038';
        ctx.beginPath(); ctx.arc(0.5, -5, 4.5, 0, TAU); ctx.fill();
        this.drawPurse(m, t, 4.5);
      }
    }
  }

  private drawPurse(m: Mark, t: number, size: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#e0a83c';
    ctx.beginPath(); ctx.arc(10, 10, size, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#8a6420';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(10 - size + 1, 10 - size + 2); ctx.lineTo(10 + size - 1, 10 - size + 2); ctx.stroke();
    const glint = 0.5 + 0.5 * Math.sin(t * 3 + m.a * 7);
    ctx.fillStyle = `rgba(255,240,190,${(glint * 0.9).toFixed(3)})`;
    ctx.beginPath(); ctx.arc(10 - size * 0.3, 10 - size * 0.3, 1.2, 0, TAU); ctx.fill();
  }

  private drawParticles(s: GameState): void {
    const ctx = this.ctx;
    for (const p of s.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.t));
      if (p.kind === 'coin') {
        ctx.fillStyle = '#f0c050';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,240,190,.7)';
        ctx.beginPath(); ctx.arc(p.x - p.size * 0.3, p.y - p.size * 0.3, p.size * 0.35, 0, TAU); ctx.fill();
      } else if (p.kind === 'smoke') {
        ctx.fillStyle = '#9a8fc0';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.6 - p.t * 0.6), 0, TAU); ctx.fill();
      } else {
        ctx.fillStyle = '#ffe9b0';
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawPops(s: GameState): void {
    const ctx = this.ctx;
    for (const p of s.pops) {
      ctx.globalAlpha = p.t;
      ctx.fillStyle = p.c;
      ctx.font = 'bold 15px Georgia';
      ctx.textAlign = 'center';
      ctx.fillText(p.txt, p.x, p.y - 24 - (1 - p.t) * 18);
      ctx.globalAlpha = 1;
    }
  }
}

function easeOut(x: number): number {
  return 1 - (1 - x) * (1 - x);
}

function lerpColor(a: [number, number, number], b: [number, number, number], t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}
