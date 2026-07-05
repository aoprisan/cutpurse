import { Beam, GameState, Mark, TAU, beams, markSeen } from './game';
import { PropKind, RGB, THEMES, Theme, ThemeId } from './themes';

export interface View {
  W: number;
  H: number;
  CX: number;
  CY: number;
  R: number;
}

interface Star { x: number; y: number; size: number; tw: number; }
interface Torch { x: number; y: number; ph: number; s: number; }
interface FogBlob { x: number; y: number; r: number; vx: number; ph: number; }
interface Firework { x: number; y: number; t: number; hue: number; }

const FW_LIFE = 1.5;

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

function fract(x: number): number {
  return x - Math.floor(x);
}

function hash(i: number, k: number): number {
  return fract(Math.sin(i * 12.9898 + k * 78.233) * 43758.5453);
}

function angDist(a: number, b: number): number {
  const d = Math.abs(a - b) % TAU;
  return d > Math.PI ? TAU - d : d;
}

function rgba(c: RGB, a: number): string {
  return `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private theme: Theme = THEMES.slums;
  private themeId: ThemeId = 'slums';
  private bg: HTMLCanvasElement | null = null;
  private vignette: HTMLCanvasElement | null = null;
  private stars: Star[] = [];
  private torches: Torch[] = [];
  private fog: FogBlob[] = [];
  private fireworks: Firework[] = [];
  private fwTimer = 0;
  private time = 0;

  constructor(cv: HTMLCanvasElement) {
    const ctx = cv.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    this.ctx = ctx;
  }

  /** Switch to a night's art direction, rebuilding the prerendered plaza. */
  setTheme(id: ThemeId, v: View): void {
    if (id === this.themeId && this.bg) return;
    this.themeId = id;
    this.theme = THEMES[id];
    this.fireworks = [];
    this.fwTimer = 0.8;
    this.rebuild(v);
  }

  /** Is angle a inside this theme's sea sector? */
  private inSea(a: number): boolean {
    const w = this.theme.water;
    if (!w) return false;
    const d = (((a - w.a0) % TAU) + TAU) % TAU;
    return d < w.a1 - w.a0;
  }

  /** Rebuild prerendered layers for a new canvas size. */
  rebuild(v: View): void {
    const th = this.theme;
    const dpr = devicePixelRatio || 1;
    const rand = mulberry32(0xc0ffee);

    // --- static background: sky is drawn live; this holds the city ring + plaza ---
    const bg = document.createElement('canvas');
    bg.width = v.W * dpr; bg.height = v.H * dpr;
    const b = bg.getContext('2d')!;
    b.scale(dpr, dpr);

    b.save();
    b.translate(v.CX, v.CY);
    const outer = v.R + 26;

    // dark mass ringing the plaza
    b.fillStyle = th.ringFill;
    b.beginPath();
    b.rect(-v.CX, -v.CY, v.W, v.H);
    b.arc(0, 0, outer, 0, TAU, true);
    b.fill('evenodd');

    if (th.water) this.buildSea(b, v, rand, outer);
    this.buildRing(b, rand, outer);
    this.buildWindows(b, v, rand, outer);

    // plaza base
    const base = b.createRadialGradient(0, -v.R * 0.2, v.R * 0.1, 0, 0, outer);
    base.addColorStop(0, th.plaza[0]);
    base.addColorStop(0.7, th.plaza[1]);
    base.addColorStop(1, th.plaza[2]);
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
        b.fillStyle = rgba(th.cobble, 0.05 + rand() * 0.07);
        b.beginPath(); b.ellipse(x, y, sw, sh, a, 0, TAU); b.fill();
      }
    }

    // plaza rim + guide rings
    b.strokeStyle = th.rim;
    b.lineWidth = 2;
    b.beginPath(); b.arc(0, 0, outer, 0, TAU); b.stroke();
    b.strokeStyle = th.plazaLine;
    b.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      b.beginPath(); b.arc(0, 0, v.R * (0.35 + i * 0.25), 0, TAU); b.stroke();
    }

    this.buildProps(b, rand, outer);
    this.buildTorches(b, v, outer);
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

    // --- stars (twinkle live, drawn over the city ring outside the plaza) ---
    this.stars = [];
    const srand = mulberry32(0xbead);
    let starTries = 0;
    while (this.stars.length < th.stars && starTries++ < 900) {
      const x = srand() * v.W;
      const y = srand() * v.H;
      const size = 0.5 + srand() * 1.2;
      const tw = srand() * TAU;
      if (Math.hypot(x - v.CX, y - v.CY) > outer + 8) this.stars.push({ x, y, size, tw });
    }

    // --- drifting mist ---
    this.fog = [];
    const frand = mulberry32(0xf06);
    for (let i = 0; i < th.fog.n; i++) {
      this.fog.push({
        x: frand() * v.W,
        y: v.CY + (frand() - 0.5) * v.R * 1.4,
        r: v.R * (0.35 + frand() * 0.3),
        vx: 3 + frand() * 5,
        ph: frand() * TAU,
      });
    }
  }

  /** Moonlit sea filling this theme's water sector beyond the quay. */
  private buildSea(b: CanvasRenderingContext2D, v: View, rand: () => number, outer: number): void {
    const w = this.theme.water!;
    const big = Math.hypot(v.CX, v.CY) + 40;
    b.save();
    b.beginPath();
    b.rect(-v.CX, -v.CY, v.W, v.H);
    b.arc(0, 0, outer, 0, TAU, true);
    b.clip('evenodd');
    b.beginPath();
    b.moveTo(0, 0);
    b.arc(0, 0, big, w.a0, w.a1);
    b.closePath();
    const sg = b.createRadialGradient(0, 0, outer, 0, 0, big);
    sg.addColorStop(0, '#10202c');
    sg.addColorStop(1, '#08121a');
    b.fillStyle = sg;
    b.fill();
    // wave shimmer
    for (let i = 0; i < 42; i++) {
      const a = w.a0 + 0.08 + rand() * (w.a1 - w.a0 - 0.16);
      const rr = outer + 6 + rand() * (big - outer - 20);
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      const len = 3 + rand() * 6;
      b.strokeStyle = `rgba(150,200,225,${(0.05 + rand() * 0.12).toFixed(3)})`;
      b.lineWidth = 1;
      b.beginPath(); b.moveTo(x - len, y); b.lineTo(x + len, y); b.stroke();
    }
    b.restore();
    // quay edge along the waterline
    b.strokeStyle = '#1e3140';
    b.lineWidth = 3;
    b.beginPath(); b.arc(0, 0, outer + 1.5, w.a0, w.a1); b.stroke();
  }

  /** Skyline bumps on the ring edge: gables, merlons or cavern rock. */
  private buildRing(b: CanvasRenderingContext2D, rand: () => number, outer: number): void {
    const th = this.theme;
    b.fillStyle = th.ringBump;
    if (th.ring === 'walls') {
      // crenellated parapet with corner towers
      b.strokeStyle = th.ringBump;
      b.lineWidth = 4;
      b.beginPath(); b.arc(0, 0, outer - 1, 0, TAU); b.stroke();
      const n = 48;
      for (let i = 0; i < n; i += 2) {
        const a = (i / n) * TAU;
        b.save();
        b.rotate(a);
        b.fillRect(outer - 11, -4, 11, 8);
        b.restore();
      }
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + 0.8;
        const x = Math.cos(a) * (outer + 5), y = Math.sin(a) * (outer + 5);
        b.beginPath(); b.arc(x, y, 15, 0, TAU); b.fill();
        b.strokeStyle = 'rgba(0,0,0,.35)';
        b.lineWidth = 2;
        b.beginPath(); b.arc(x, y, 15, 0, TAU); b.stroke();
      }
      return;
    }
    if (th.ring === 'cavern') {
      // jagged rock teeth pressing in on the torchlight
      const n = 44;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + rand() * 0.08;
        const w = 0.05 + rand() * 0.08;
        const h = 6 + rand() * 18;
        b.beginPath();
        b.moveTo(Math.cos(a - w) * outer, Math.sin(a - w) * outer);
        b.lineTo(Math.cos(a) * (outer - h), Math.sin(a) * (outer - h));
        b.lineTo(Math.cos(a + w) * outer, Math.sin(a + w) * outer);
        b.closePath();
        b.fill();
      }
      // faint strata in the surrounding rock
      b.strokeStyle = 'rgba(120,150,110,.06)';
      b.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        b.beginPath(); b.arc(0, 0, outer + 12 + i * 16, rand() * TAU, rand() * TAU + 2.5); b.stroke();
      }
      return;
    }
    // rooftop gables + the occasional steeple
    const nRoof = 26;
    for (let i = 0; i < nRoof; i++) {
      const a = (i / nRoof) * TAU + rand() * 0.1;
      if (this.inSea(a)) continue;
      const spire = th.spires && i % 5 === 0;
      const w = spire ? 0.05 + rand() * 0.04 : 0.10 + rand() * 0.12;
      const h = spire ? 26 + rand() * 20 : 8 + rand() * 18;
      const tipX = Math.cos(a) * (outer - h), tipY = Math.sin(a) * (outer - h);
      b.beginPath();
      b.moveTo(Math.cos(a - w) * outer, Math.sin(a - w) * outer);
      b.lineTo(tipX, tipY);
      b.lineTo(Math.cos(a + w) * outer, Math.sin(a + w) * outer);
      b.closePath();
      b.fill();
      if (spire) {
        // finial cross on the steeple
        b.strokeStyle = th.ringBump;
        b.lineWidth = 1.4;
        b.beginPath();
        b.moveTo(tipX, tipY);
        b.lineTo(Math.cos(a) * (outer - h - 5), Math.sin(a) * (outer - h - 5));
        b.stroke();
      }
    }
  }

  /** Lit windows scattered through the dark ring. */
  private buildWindows(b: CanvasRenderingContext2D, v: View, rand: () => number, outer: number): void {
    const th = this.theme;
    const stained = ['#c04868', '#4868c0', '#c0a040', '#40a068', '#9048c0'];
    let placedN = 0;
    let tries = 0;
    while (placedN < th.windows.n && tries++ < th.windows.n * 8) {
      const a = rand() * TAU;
      if (this.inSea(a)) continue;
      const rr = outer + 6 + rand() * Math.max(12, Math.min(v.CX, v.CY) - outer - 10);
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      if (Math.abs(x) > v.CX - 4 || Math.abs(y) > v.CY - 4) continue;
      placedN++;
      switch (th.windows.style) {
        case 'slit':
          b.fillStyle = rgba(th.windows.color, 0.15 + rand() * 0.3);
          b.fillRect(x, y, 1.5, 4.5);
          break;
        case 'stained': {
          const c = stained[Math.floor(rand() * stained.length)];
          b.save();
          b.globalAlpha = 0.35 + rand() * 0.45;
          b.fillStyle = c;
          b.fillRect(x, y, 3.5, 6);
          b.fillStyle = 'rgba(255,240,220,.5)';
          b.fillRect(x + 1.1, y + 1.2, 1.3, 2.2);
          b.restore();
          break;
        }
        default:
          b.fillStyle = rgba(th.windows.color, 0.10 + rand() * 0.25);
          b.fillRect(x, y, 2.5, 3.5);
      }
    }
  }

  /** Scatter this theme's scenery around the plaza. */
  private buildProps(b: CanvasRenderingContext2D, rand: () => number, outer: number): void {
    const th = this.theme;
    const placed: number[] = [];
    const rimAngle = (sea = false, minSep = 0.42): number => {
      for (let tries = 0; tries < 50; tries++) {
        const a = rand() * TAU;
        if (this.inSea(a) !== sea) continue;
        if (placed.some(p => angDist(p, a) < minSep)) continue;
        placed.push(a);
        return a;
      }
      const a = rand() * TAU;
      placed.push(a);
      return a;
    };

    // colonnades stand evenly, everything else finds its own spot
    const nCols = th.props.column ?? 0;
    for (let i = 0; i < nCols; i++) {
      const a = (i / nCols) * TAU + 0.28;
      placed.push(a);
      this.drawColumn(b, Math.cos(a) * (outer - 10), Math.sin(a) * (outer - 10));
    }

    for (const [kind, n] of Object.entries(th.props) as [PropKind, number][]) {
      if (kind === 'column') continue;
      for (let i = 0; i < n; i++) {
        if (kind === 'grave') {
          // graves lie inside the plaza, among the marks
          const a = rand() * TAU;
          const rr = outer * (0.38 + rand() * 0.42);
          this.drawGrave(b, Math.cos(a) * rr, Math.sin(a) * rr, rand);
          continue;
        }
        if (kind === 'mast') {
          const a = rimAngle(true, 0.5);
          this.drawMast(b, a, outer + 14 + rand() * 18, rand);
          continue;
        }
        const a = rimAngle();
        const rr = outer - 12 - rand() * 4;
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        switch (kind) {
          case 'stall': this.drawStall(b, a, outer); break;
          case 'bunting': this.drawBunting(b, a, outer, rand); break;
          case 'barrel': this.drawBarrel(b, x, y); break;
          case 'crate': this.drawCrate(b, x, y); break;
          case 'ropeCoil': this.drawRopeCoil(b, x, y); break;
          case 'tree': this.drawTree(b, x, y, rand); break;
          case 'deadTree': this.drawDeadTree(b, x, y, rand); break;
          case 'yew': this.drawYew(b, x, y); break;
          case 'topiary': this.drawTopiary(b, x, y); break;
          case 'statue': this.drawStatue(b, x, y); break;
          case 'gallows': this.drawGallows(b, x, y); break;
        }
      }
    }
  }

  /** Torch posts / braziers / glass lamps on the rim — flames are drawn live. */
  private buildTorches(b: CanvasRenderingContext2D, v: View, outer: number): void {
    const th = this.theme;
    this.torches = [];
    for (let i = 0; i < th.torch.n; i++) {
      const a = (i / th.torch.n) * TAU + 0.45;
      const x = Math.cos(a) * (outer - 4);
      const y = Math.sin(a) * (outer - 4);
      switch (th.torch.style) {
        case 'brazier': {
          b.strokeStyle = '#241d20';
          b.lineWidth = 1.6;
          b.beginPath();
          b.moveTo(x - 3.5, y + 5); b.lineTo(x, y - 2);
          b.moveTo(x + 3.5, y + 5); b.lineTo(x, y - 2);
          b.moveTo(x, y + 5.5); b.lineTo(x, y - 2);
          b.stroke();
          b.fillStyle = '#2c2326';
          b.beginPath(); b.arc(x, y - 4, 5, 0, Math.PI); b.fill();
          b.fillRect(x - 5, y - 5.5, 10, 2);
          this.torches.push({ x: v.CX + x, y: v.CY + y - 8, ph: i * 1.7, s: 1.25 });
          break;
        }
        case 'lamp': {
          b.strokeStyle = '#2a2438';
          b.lineWidth = 2;
          b.beginPath(); b.moveTo(x, y + 5); b.lineTo(x, y - 12); b.stroke();
          b.strokeStyle = '#3c3450';
          b.lineWidth = 1.2;
          b.strokeRect(x - 3.5, y - 21, 7, 9);
          b.beginPath();
          b.moveTo(x - 4.5, y - 21); b.lineTo(x, y - 25); b.lineTo(x + 4.5, y - 21);
          b.closePath();
          b.stroke();
          this.torches.push({ x: v.CX + x, y: v.CY + y - 16.5, ph: i * 1.7, s: 0.6 });
          break;
        }
        default: {
          b.strokeStyle = '#241d38';
          b.lineWidth = 2.4;
          b.beginPath(); b.moveTo(x, y + 4); b.lineTo(x, y - 9); b.stroke();
          b.fillStyle = '#241d38';
          b.beginPath(); b.arc(x, y - 9, 2.4, 0, TAU); b.fill();
          this.torches.push({ x: v.CX + x, y: v.CY + y - 10, ph: i * 1.7, s: 1 });
        }
      }
    }
  }

  // --- scenery pieces (drawn once into the prerendered plaza) ---

  private drawStall(b: CanvasRenderingContext2D, a: number, outer: number): void {
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

  private drawBunting(b: CanvasRenderingContext2D, a: number, outer: number, rand: () => number): void {
    const colors = this.theme.bunting ?? ['#8a4040', '#7a7040', '#40608a', '#6a4a7a'];
    const span = 0.5;
    const r1 = outer - 16;
    const x0 = Math.cos(a - span / 2) * r1, y0 = Math.sin(a - span / 2) * r1;
    const x1 = Math.cos(a + span / 2) * r1, y1 = Math.sin(a + span / 2) * r1;
    // poles
    b.strokeStyle = '#1c1730';
    b.lineWidth = 1.6;
    b.beginPath();
    b.moveTo(x0, y0 + 4); b.lineTo(x0, y0 - 16);
    b.moveTo(x1, y1 + 4); b.lineTo(x1, y1 - 16);
    b.stroke();
    // sagging string between the pole tops
    const p0y = y0 - 16, p1y = y1 - 16;
    const cx = (x0 + x1) / 2, cy = (p0y + p1y) / 2 + 10;
    b.strokeStyle = 'rgba(30,25,45,.9)';
    b.lineWidth = 1;
    b.beginPath(); b.moveTo(x0, p0y); b.quadraticCurveTo(cx, cy, x1, p1y); b.stroke();
    // little flags along the curve
    const flags = 6;
    for (let i = 1; i <= flags; i++) {
      const t = i / (flags + 1);
      const u = 1 - t;
      const fx = u * u * x0 + 2 * u * t * cx + t * t * x1;
      const fy = u * u * p0y + 2 * u * t * cy + t * t * p1y;
      b.fillStyle = colors[(i + Math.floor(rand() * 2)) % colors.length];
      b.beginPath();
      b.moveTo(fx - 2.4, fy);
      b.lineTo(fx + 2.4, fy);
      b.lineTo(fx, fy + 5);
      b.closePath();
      b.fill();
    }
  }

  private drawBarrel(b: CanvasRenderingContext2D, x: number, y: number): void {
    b.fillStyle = '#3a2c22';
    b.beginPath(); b.ellipse(x, y, 4.2, 5.2, 0, 0, TAU); b.fill();
    b.strokeStyle = 'rgba(140,120,90,.5)';
    b.lineWidth = 0.8;
    b.beginPath(); b.moveTo(x - 4, y - 1.6); b.lineTo(x + 4, y - 1.6);
    b.moveTo(x - 4, y + 1.6); b.lineTo(x + 4, y + 1.6); b.stroke();
  }

  private drawCrate(b: CanvasRenderingContext2D, x: number, y: number): void {
    b.fillStyle = '#342a20';
    b.fillRect(x - 4, y - 4, 8, 8);
    b.strokeStyle = 'rgba(0,0,0,.4)';
    b.lineWidth = 0.8;
    b.strokeRect(x - 4, y - 4, 8, 8);
    b.beginPath(); b.moveTo(x - 4, y - 4); b.lineTo(x + 4, y + 4); b.stroke();
  }

  private drawRopeCoil(b: CanvasRenderingContext2D, x: number, y: number): void {
    b.strokeStyle = '#6a5638';
    for (let i = 0; i < 3; i++) {
      b.lineWidth = 1.8 - i * 0.3;
      b.beginPath(); b.arc(x, y, 5 - i * 1.6, 0, TAU); b.stroke();
    }
  }

  private drawTree(b: CanvasRenderingContext2D, x: number, y: number, rand: () => number): void {
    b.fillStyle = 'rgba(0,0,0,.3)';
    b.beginPath(); b.ellipse(x, y + 3, 10, 3.5, 0, 0, TAU); b.fill();
    b.strokeStyle = '#3a2c22';
    b.lineWidth = 3;
    b.beginPath(); b.moveTo(x, y + 3); b.lineTo(x, y - 10); b.stroke();
    for (let i = 0; i < 4; i++) {
      const ox = (rand() - 0.5) * 14;
      const oy = -12 - rand() * 10;
      const r = 5.5 + rand() * 3.5;
      b.fillStyle = i % 2 ? '#243a22' : '#2e4a2c';
      b.beginPath(); b.arc(x + ox, y + oy, r, 0, TAU); b.fill();
    }
    b.fillStyle = 'rgba(140,180,120,.18)';
    b.beginPath(); b.arc(x - 3, y - 19, 4, 0, TAU); b.fill();
  }

  private drawDeadTree(b: CanvasRenderingContext2D, x: number, y: number, rand: () => number): void {
    b.fillStyle = 'rgba(0,0,0,.3)';
    b.beginPath(); b.ellipse(x, y + 3, 7, 2.8, 0, 0, TAU); b.fill();
    b.strokeStyle = '#3c332a';
    b.lineWidth = 2.6;
    b.beginPath(); b.moveTo(x, y + 3); b.lineTo(x + 1, y - 12); b.stroke();
    b.lineWidth = 1.4;
    for (let i = 0; i < 3; i++) {
      const by = y - 5 - i * 4;
      const dir = i % 2 ? 1 : -1;
      const bend = 4 + rand() * 5;
      b.beginPath();
      b.moveTo(x + 0.5, by);
      b.quadraticCurveTo(x + dir * bend, by - 3, x + dir * (bend + 4), by - 5 - rand() * 3);
      b.stroke();
    }
  }

  private drawYew(b: CanvasRenderingContext2D, x: number, y: number): void {
    b.fillStyle = 'rgba(0,0,0,.32)';
    b.beginPath(); b.ellipse(x, y + 3, 8, 3, 0, 0, TAU); b.fill();
    b.fillStyle = '#16281c';
    for (let i = 0; i < 3; i++) {
      const w = 9 - i * 2.4;
      const top = y - 8 - i * 8;
      b.beginPath();
      b.moveTo(x - w, top + 9);
      b.lineTo(x, top);
      b.lineTo(x + w, top + 9);
      b.closePath();
      b.fill();
    }
    b.fillStyle = 'rgba(90,140,110,.15)';
    b.beginPath(); b.moveTo(x - 3, y - 18); b.lineTo(x, y - 24); b.lineTo(x + 1.5, y - 19); b.closePath(); b.fill();
  }

  private drawTopiary(b: CanvasRenderingContext2D, x: number, y: number): void {
    b.fillStyle = 'rgba(0,0,0,.3)';
    b.beginPath(); b.ellipse(x, y + 5, 7, 2.6, 0, 0, TAU); b.fill();
    // planter
    b.fillStyle = '#2a2142';
    b.fillRect(x - 5, y, 10, 5);
    b.fillStyle = 'rgba(224,168,60,.25)';
    b.fillRect(x - 5, y, 10, 1.2);
    // trunk + clipped ball
    b.strokeStyle = '#3a2c22';
    b.lineWidth = 2;
    b.beginPath(); b.moveTo(x, y); b.lineTo(x, y - 7); b.stroke();
    b.fillStyle = '#2c4630';
    b.beginPath(); b.arc(x, y - 13, 7, 0, TAU); b.fill();
    b.strokeStyle = 'rgba(150,200,150,.2)';
    b.lineWidth = 1;
    b.beginPath(); b.arc(x, y - 13, 7, -2.4, -0.8); b.stroke();
  }

  private drawMast(b: CanvasRenderingContext2D, a: number, rr: number, rand: () => number): void {
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    const h = 30 + rand() * 12;
    // hull riding the dark water
    b.fillStyle = '#131a22';
    b.beginPath(); b.ellipse(x, y, 13, 4, 0, 0, TAU); b.fill();
    b.strokeStyle = 'rgba(120,160,190,.25)';
    b.lineWidth = 1;
    b.beginPath(); b.moveTo(x - 13, y + 1.5); b.lineTo(x + 13, y + 1.5); b.stroke();
    // mast, spar, furled sail
    b.strokeStyle = '#1c2630';
    b.lineWidth = 2;
    b.beginPath(); b.moveTo(x, y); b.lineTo(x, y - h); b.stroke();
    b.lineWidth = 1.4;
    b.beginPath(); b.moveTo(x - 9, y - h + 7); b.lineTo(x + 9, y - h + 7); b.stroke();
    b.fillStyle = '#4c4a42';
    b.beginPath();
    b.moveTo(x - 8, y - h + 8);
    b.quadraticCurveTo(x, y - h + 13, x + 8, y - h + 8);
    b.lineTo(x + 8, y - h + 10.5);
    b.quadraticCurveTo(x, y - h + 15, x - 8, y - h + 10.5);
    b.closePath();
    b.fill();
    // rigging
    b.strokeStyle = 'rgba(60,80,95,.7)';
    b.lineWidth = 0.7;
    b.beginPath();
    b.moveTo(x, y - h); b.lineTo(x - 11, y - 1);
    b.moveTo(x, y - h); b.lineTo(x + 11, y - 1);
    b.stroke();
    // masthead lantern
    b.fillStyle = 'rgba(255,214,120,.8)';
    b.beginPath(); b.arc(x, y - h - 1.5, 1.3, 0, TAU); b.fill();
  }

  private drawColumn(b: CanvasRenderingContext2D, x: number, y: number): void {
    b.fillStyle = 'rgba(0,0,0,.3)';
    b.beginPath(); b.ellipse(x, y + 2, 6, 2.4, 0, 0, TAU); b.fill();
    const g = b.createLinearGradient(x - 4, 0, x + 4, 0);
    g.addColorStop(0, '#332e44');
    g.addColorStop(0.4, '#4c4660');
    g.addColorStop(1, '#2c2839');
    b.fillStyle = g;
    b.fillRect(x - 3.5, y - 22, 7, 24);
    // flutes
    b.strokeStyle = 'rgba(0,0,0,.25)';
    b.lineWidth = 0.8;
    b.beginPath();
    b.moveTo(x - 1.2, y - 21); b.lineTo(x - 1.2, y + 1);
    b.moveTo(x + 1.4, y - 21); b.lineTo(x + 1.4, y + 1);
    b.stroke();
    // capital + base
    b.fillStyle = '#524b68';
    b.fillRect(x - 5, y - 25, 10, 3.4);
    b.fillRect(x - 5, y + 1, 10, 2.6);
  }

  private drawGrave(b: CanvasRenderingContext2D, x: number, y: number, rand: () => number): void {
    b.save();
    b.translate(x, y);
    b.rotate((rand() - 0.5) * 0.3);
    b.fillStyle = 'rgba(0,0,0,.3)';
    b.beginPath(); b.ellipse(0, 4, 5, 2, 0, 0, TAU); b.fill();
    b.fillStyle = '#3c3a48';
    b.beginPath();
    b.moveTo(-3.2, 4);
    b.lineTo(-3.2, -3);
    b.arc(0, -3, 3.2, Math.PI, 0);
    b.lineTo(3.2, 4);
    b.closePath();
    b.fill();
    b.strokeStyle = 'rgba(0,0,0,.35)';
    b.lineWidth = 0.7;
    b.beginPath(); b.moveTo(-1.5, -2); b.lineTo(1.5, -2); b.moveTo(-1.5, 0); b.lineTo(1, 0); b.stroke();
    b.restore();
  }

  private drawStatue(b: CanvasRenderingContext2D, x: number, y: number): void {
    b.fillStyle = 'rgba(0,0,0,.32)';
    b.beginPath(); b.ellipse(x, y + 5, 8, 3, 0, 0, TAU); b.fill();
    // plinth
    b.fillStyle = '#2e2c38';
    b.fillRect(x - 6.5, y, 13, 5);
    b.fillStyle = 'rgba(255,255,255,.06)';
    b.fillRect(x - 6.5, y, 13, 1.2);
    // robed figure, head bowed
    b.fillStyle = '#41404e';
    b.beginPath(); b.ellipse(x, y - 8, 4.5, 8.5, 0, 0, TAU); b.fill();
    b.beginPath(); b.arc(x + 0.5, y - 17, 3, 0, TAU); b.fill();
    b.fillStyle = 'rgba(255,255,255,.08)';
    b.beginPath(); b.ellipse(x - 1.5, y - 10, 1.4, 5.5, 0, 0, TAU); b.fill();
  }

  private drawGallows(b: CanvasRenderingContext2D, x: number, y: number): void {
    b.fillStyle = 'rgba(0,0,0,.32)';
    b.beginPath(); b.ellipse(x + 4, y + 4, 12, 3.4, 0, 0, TAU); b.fill();
    // platform
    b.fillStyle = '#241c16';
    b.fillRect(x - 8, y, 20, 4);
    b.strokeStyle = '#332a20';
    b.lineWidth = 2.4;
    b.beginPath();
    // upright + jib
    b.moveTo(x - 4, y); b.lineTo(x - 4, y - 26);
    b.lineTo(x + 10, y - 26);
    // brace
    b.moveTo(x - 4, y - 19); b.lineTo(x + 3, y - 26);
    b.stroke();
    // rope and empty noose, waiting
    b.strokeStyle = '#5a4c34';
    b.lineWidth = 1;
    b.beginPath();
    b.moveTo(x + 8, y - 26); b.lineTo(x + 8, y - 17);
    b.stroke();
    b.beginPath(); b.arc(x + 8, y - 14.5, 2.5, 0, TAU); b.stroke();
  }

  // --- live drawing ---

  draw(s: GameState, v: View, dt: number): void {
    const ctx = this.ctx;
    const th = this.theme;
    this.time += dt;
    const t = this.time;

    // sky — deep night warming toward dawn as the timer runs out
    const dawn = 1 - Math.min(1, Math.max(0, s.t / s.timeMax));
    const sky = ctx.createLinearGradient(0, 0, 0, v.H);
    sky.addColorStop(0, lerpColor(th.sky.top, th.sky.dawnTop, dawn * dawn));
    sky.addColorStop(1, lerpColor(th.sky.bot, th.sky.dawnBot, dawn * dawn));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, v.W, v.H);

    // prerendered city ring + plaza
    if (this.bg) ctx.drawImage(this.bg, 0, 0, v.W, v.H);

    // stars over the rooftops, fading as dawn nears
    const starAlpha = 1 - dawn * 0.8;
    for (const st of this.stars) {
      const a = (0.35 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.7 + st.tw))) * starAlpha;
      ctx.fillStyle = `rgba(227,213,179,${a.toFixed(3)})`;
      ctx.fillRect(st.x, st.y, st.size, st.size);
    }
    // moon hanging over the city's corner
    if (th.moon) {
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
    }

    if (th.fireworks) this.drawFireworks(v, dt);

    // torch flames on the rim
    for (const tc of this.torches) {
      const fl = (0.8 + Math.sin(t * 11 + tc.ph) * 0.14 + Math.sin(t * 23 + tc.ph * 2) * 0.08) * tc.s;
      const fg = ctx.createRadialGradient(tc.x, tc.y, 0.5, tc.x, tc.y, 13 * fl);
      fg.addColorStop(0, 'rgba(255,190,90,.55)');
      fg.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.arc(tc.x, tc.y, 13 * fl, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(255,210,120,${Math.min(1, 0.85 * (fl / tc.s)).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(tc.x, tc.y - 1.5 * fl, 1.6 * tc.s, 3.2 * fl, Math.sin(t * 9 + tc.ph) * 0.25, 0, TAU);
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

    if (th.embers) this.drawEmbers(v, t);
    if (th.rain) this.drawRain(v, t);

    // drifting mist
    for (const f of this.fog) {
      f.x += f.vx * dt;
      if (f.x - f.r > v.W) f.x = -f.r;
      const fa = th.fog.alpha + th.fog.alpha * 0.6 * Math.sin(t * 0.4 + f.ph);
      const fgr = ctx.createRadialGradient(f.x, f.y, f.r * 0.15, f.x, f.y, f.r);
      fgr.addColorStop(0, rgba(th.fog.color, fa));
      fgr.addColorStop(1, rgba(th.fog.color, 0));
      ctx.fillStyle = fgr;
      ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.55, 0, 0, TAU); ctx.fill();
    }

    // dawn warmth creeping over the whole scene — never reaches the undercity
    if (dawn > 0.35 && th.ring !== 'cavern') {
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

  /** Thin cold rain slanting across the square. */
  private drawRain(v: View, t: number): void {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(170,190,220,.26)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 60; i++) {
      const h1 = hash(i, 1), h2 = hash(i, 2);
      const speed = 300 + h2 * 160;
      const x = ((h1 * (v.W + 60) + t * 40) % (v.W + 60)) - 30;
      const y = ((h2 * v.H + t * speed) % (v.H + 30)) - 15;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 3, y + 10);
    }
    ctx.stroke();
  }

  /** Embers rising from the braziers into the dark. */
  private drawEmbers(v: View, t: number): void {
    const ctx = this.ctx;
    for (let i = 0; i < 22; i++) {
      const h1 = hash(i, 3), h2 = hash(i, 4);
      const cyc = 6 + h2 * 6;
      const ph = ((t / cyc) + h1) % 1;
      const x = h1 * v.W + Math.sin(t * (0.7 + h2) + i) * 14;
      const y = v.H - ph * v.H * 0.85;
      const a = Math.sin(ph * Math.PI) * (0.2 + h2 * 0.3);
      ctx.fillStyle = `rgba(255,${140 + Math.round(h2 * 60)},60,${a.toFixed(3)})`;
      ctx.fillRect(x, y, 1.6, 1.6);
    }
  }

  /** Fireworks bursting over the masquerade. */
  private drawFireworks(v: View, dt: number): void {
    const ctx = this.ctx;
    this.fwTimer -= dt;
    if (this.fwTimer <= 0) {
      this.fwTimer = 1.6 + Math.random() * 2.2;
      this.fireworks.push({
        x: v.W * (0.12 + Math.random() * 0.76),
        y: v.H * (0.06 + Math.random() * 0.16),
        t: 0,
        hue: [46, 330, 210, 130][Math.floor(Math.random() * 4)],
      });
    }
    for (const f of this.fireworks) {
      f.t += dt;
      const life = f.t / FW_LIFE;
      if (life >= 1) continue;
      const rr = (1 - (1 - life) * (1 - life)) * 30;
      const a = 1 - life;
      if (life < 0.18) {
        ctx.fillStyle = `hsla(${f.hue},80%,85%,${((1 - life / 0.18) * 0.8).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(f.x, f.y, 3, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = `hsla(${f.hue},75%,68%,${(a * 0.85).toFixed(3)})`;
      for (let k = 0; k < 18; k++) {
        const ang = (k / 18) * TAU + f.hue;
        const sx = f.x + Math.cos(ang) * rr;
        const sy = f.y + Math.sin(ang) * rr + life * life * 14;
        ctx.fillRect(sx, sy, 1.7, 1.7);
      }
    }
    this.fireworks = this.fireworks.filter(f => f.t < FW_LIFE);
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
    const garb = this.theme.garb;
    const cg = ctx.createLinearGradient(0, -12, 0, 20);

    switch (m.kind) {
      case 'merchant': {
        // round-bellied, broad hat, fat purse
        if (seen) { cg.addColorStop(0, '#a86a6a'); cg.addColorStop(1, '#6b3d3d'); }
        else { cg.addColorStop(0, garb.merchant.coat[0]); cg.addColorStop(1, garb.merchant.coat[1]); }
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.ellipse(0, 9, 11, 11, 0, 0, TAU); ctx.fill();
        // sash
        ctx.strokeStyle = seen ? '#7a4444' : garb.merchant.sash;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(-9, 4); ctx.lineTo(9, 12); ctx.stroke();
        // head + wide-brimmed hat
        ctx.fillStyle = '#c9a882';
        ctx.beginPath(); ctx.arc(0, -6, 5.5, 0, TAU); ctx.fill();
        if (garb.masked) this.drawMask(-6, 5.5);
        ctx.fillStyle = seen ? '#3d2626' : garb.merchant.hat;
        ctx.beginPath(); ctx.ellipse(0, -9, 9.5, 3, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(0, -11.5, 4.5, 3.2, 0, 0, TAU); ctx.fill();
        this.drawPurse(m, t, 5.5);
        break;
      }
      case 'noble': {
        // slim, tall, feathered cap, gold trim
        if (seen) { cg.addColorStop(0, '#a86a6a'); cg.addColorStop(1, '#6b3d3d'); }
        else { cg.addColorStop(0, garb.noble.gown[0]); cg.addColorStop(1, garb.noble.gown[1]); }
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.ellipse(0, 7, 7.5, 12.5, 0, 0, TAU); ctx.fill();
        // gold trim
        ctx.strokeStyle = 'rgba(224,168,60,.6)';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.ellipse(0, 7, 6.2, 11, 0, 0, TAU); ctx.stroke();
        // head + cap
        ctx.fillStyle = '#d8b896';
        ctx.beginPath(); ctx.arc(0, -8, 5, 0, TAU); ctx.fill();
        if (garb.masked) this.drawMask(-8, 5);
        ctx.fillStyle = seen ? '#3d2626' : garb.noble.cap;
        ctx.beginPath(); ctx.ellipse(0.5, -11, 5.5, 3, -0.15, 0, TAU); ctx.fill();
        // feather
        ctx.strokeStyle = garb.noble.feather;
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
        else { cg.addColorStop(0, garb.commoner.robe[0]); cg.addColorStop(1, garb.commoner.robe[1]); }
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.ellipse(0, 8, 9, 11, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(0, -6, 7, 0, TAU); ctx.fill();
        ctx.fillStyle = seen ? '#3d2626' : garb.commoner.hood;
        ctx.beginPath(); ctx.arc(0.5, -5, 4.5, 0, TAU); ctx.fill();
        this.drawPurse(m, t, 4.5);
      }
    }
  }

  /** A little masquerade domino across a bare face. */
  private drawMask(headY: number, headR: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#2c2444';
    ctx.beginPath(); ctx.ellipse(0, headY - 0.5, headR * 0.95, 1.9, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(224,190,110,.8)';
    ctx.fillRect(-headR * 0.5, headY - 1.1, 1.1, 1.1);
    ctx.fillRect(headR * 0.5 - 1.1, headY - 1.1, 1.1, 1.1);
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

function lerpColor(a: RGB, b: RGB, t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}
