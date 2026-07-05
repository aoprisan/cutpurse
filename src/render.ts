import { GameState, TAU, isSeen } from './game';

export interface View {
  W: number;
  H: number;
  CX: number;
  CY: number;
  R: number;
}

interface Star { x: number; y: number; size: number; tw: number; }

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
  }

  draw(s: GameState, v: View, dt: number): void {
    const ctx = this.ctx;
    this.time += dt;
    const t = this.time;

    // sky — deep night warming toward dawn as the timer runs out
    const dawn = 1 - Math.min(1, Math.max(0, s.t / 90));
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

    // screen shake
    ctx.save();
    if (s.shake > 0) {
      ctx.translate((Math.random() - 0.5) * s.shake * 10, (Math.random() - 0.5) * s.shake * 10);
    }
    ctx.translate(v.CX, v.CY);

    this.drawCone(s, v, t);
    this.drawWatchman(s, t);
    this.drawMarks(s, t);
    this.drawParticles(s);
    this.drawPops(s);

    ctx.restore();

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

  private drawCone(s: GameState, v: View, t: number): void {
    const ctx = this.ctx;
    const flicker = 1 + Math.sin(t * 13) * 0.03 + Math.sin(t * 29 + 1.7) * 0.02;
    const reach = (v.R + 30) * flicker;

    const g = ctx.createRadialGradient(0, 0, 10, 0, 0, reach);
    g.addColorStop(0, `rgba(224,168,60,${0.55 * flicker})`);
    g.addColorStop(0.55, 'rgba(224,168,60,.22)');
    g.addColorStop(1, 'rgba(224,168,60,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, reach, s.ang - s.cone / 2, s.ang + s.cone / 2);
    ctx.closePath();
    ctx.fill();

    // soft edges
    ctx.strokeStyle = `rgba(224,168,60,${0.45 * flicker})`;
    ctx.lineWidth = 1;
    for (const a of [s.ang - s.cone / 2, s.ang + s.cone / 2]) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * reach, Math.sin(a) * reach);
      ctx.stroke();
    }

    // dust motes drifting in the beam
    ctx.fillStyle = 'rgba(240,200,120,.5)';
    for (let i = 0; i < 8; i++) {
      const ph = (t * 0.13 + i * 0.125) % 1;
      const a = s.ang + Math.sin(i * 12.9898 + Math.floor(t * 0.13 + i * 0.125) * 78.233) * s.cone * 0.4;
      const rr = 20 + ph * (reach - 30);
      ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.5;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, 1.1, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawWatchman(s: GameState, t: number): void {
    const ctx = this.ctx;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(0, 6, 15, 6, 0, 0, TAU); ctx.fill();
    // cloak
    const grad = ctx.createRadialGradient(-3, -5, 2, 0, 0, 15);
    grad.addColorStop(0, '#4a4270');
    grad.addColorStop(1, '#2c2648');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.fill();
    // hat brim + crown
    ctx.fillStyle = '#211c3a';
    ctx.beginPath(); ctx.ellipse(0, -7, 9, 3.2, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, -10, 5, 4, 0, 0, TAU); ctx.fill();
    // lantern held toward facing direction, with pulsing glow
    const lx = Math.cos(s.ang) * 10, ly = Math.sin(s.ang) * 10;
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

  private drawMarks(s: GameState, t: number): void {
    const ctx = this.ctx;
    for (const m of s.marks) {
      const scale = 0.4 + 0.6 * easeOut(m.spawn);
      const x = Math.cos(m.a) * m.r;
      const y = Math.sin(m.a) * m.r + Math.sin(m.bob) * 2.5;
      const seen = isSeen(s, m.a);

      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.globalAlpha = m.spawn;

      // ground shadow
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.beginPath(); ctx.ellipse(0, 17, 11, 4.5, 0, 0, TAU); ctx.fill();

      // cloak with gradient, tinted red when lit by the lantern
      const cg = ctx.createLinearGradient(0, -12, 0, 20);
      if (seen) { cg.addColorStop(0, '#a86a6a'); cg.addColorStop(1, '#6b3d3d'); }
      else { cg.addColorStop(0, '#6f6594'); cg.addColorStop(1, '#453d63'); }
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.ellipse(0, 8, 9, 11, 0, 0, TAU); ctx.fill();
      // hood + head
      ctx.beginPath(); ctx.arc(0, -6, 7, 0, TAU); ctx.fill();
      ctx.fillStyle = seen ? '#3d2626' : '#262038';
      ctx.beginPath(); ctx.arc(0.5, -5, 4.5, 0, TAU); ctx.fill();

      // purse with glint
      ctx.fillStyle = '#e0a83c';
      ctx.beginPath(); ctx.arc(10, 10, 4.5, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#8a6420';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(8, 7.5); ctx.lineTo(12, 7.5); ctx.stroke();
      const glint = 0.5 + 0.5 * Math.sin(t * 3 + m.a * 7);
      ctx.fillStyle = `rgba(255,240,190,${(glint * 0.9).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(8.8, 8.8, 1.2, 0, TAU); ctx.fill();

      // alert mark when seen
      if (seen) {
        ctx.fillStyle = '#e05050';
        ctx.font = 'bold 13px Georgia';
        ctx.textAlign = 'center';
        ctx.fillText('!', -10, -12);
      }

      // value label
      ctx.fillStyle = 'rgba(227,213,179,.9)';
      ctx.font = '11px Georgia';
      ctx.textAlign = 'center';
      ctx.fillText(String(m.v), 10, -14);

      ctx.restore();
    }
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
