/**
 * Per-night art direction. Each district the campaign visits gets its own
 * palette, skyline, scenery and weather — the simulation never changes,
 * only what the lantern light falls on.
 */

export type RGB = [number, number, number];

export type RingStyle = 'roofs' | 'walls' | 'cavern';
export type TorchStyle = 'pole' | 'brazier' | 'lamp';
export type WindowStyle = 'dot' | 'slit' | 'stained';

export type PropKind =
  | 'stall' | 'barrel' | 'crate'
  | 'tree' | 'deadTree' | 'yew' | 'topiary'
  | 'mast' | 'ropeCoil'
  | 'column' | 'grave' | 'statue' | 'gallows' | 'bunting';

/**
 * What the crowd wears in this district. Constables are deliberately NOT
 * themed — the navy coat and red plume are a gameplay tell and must read
 * the same on every night.
 */
export interface Garb {
  commoner: { robe: [string, string]; hood: string };
  merchant: { coat: [string, string]; sash: string; hat: string };
  noble: { gown: [string, string]; cap: string; feather: string };
  /** Bare-faced marks wear little masquerade masks (the Palace Court). */
  masked?: boolean;
}

export interface Theme {
  /** Sky gradient stops at deep night and at full dawn. */
  sky: { top: RGB; bot: RGB; dawnTop: RGB; dawnBot: RGB };
  stars: number;
  moon: boolean;
  /** What rings the plaza: city rooftops, fortress walls, or cavern rock. */
  ring: RingStyle;
  /** Occasional tall steeples on the roofline. */
  spires?: boolean;
  ringFill: string;
  ringBump: string;
  windows: { style: WindowStyle; color: RGB; n: number };
  /** Radial gradient stops for the plaza floor, centre → rim. */
  plaza: [string, string, string];
  plazaLine: string;
  rim: string;
  cobble: RGB;
  torch: { n: number; style: TorchStyle };
  props: Partial<Record<PropKind, number>>;
  /** Drifting mist: blob count, base opacity, colour. */
  fog: { n: number; alpha: number; color: RGB };
  /** Sea beyond the rim between these two angles (radians). */
  water?: { a0: number; a1: number };
  bunting?: string[];
  garb: Garb;
  rain?: boolean;
  embers?: boolean;
  fireworks?: boolean;
}

export const THEMES = {
  /** Night 1 — a muddy pauper's quarter of leaning shacks. */
  slums: {
    sky: { top: [10, 8, 16], bot: [23, 19, 26], dawnTop: [42, 29, 38], dawnBot: [66, 45, 45] },
    stars: 30, moon: true, ring: 'roofs',
    ringFill: '#0d0a0e', ringBump: '#121014',
    windows: { style: 'dot', color: [200, 150, 70], n: 10 },
    plaza: ['#2e2620', '#241d18', '#191410'], plazaLine: 'rgba(90,75,55,.3)', rim: '#3a3026',
    cobble: [140, 120, 90],
    torch: { n: 3, style: 'pole' },
    props: { deadTree: 2, barrel: 3, crate: 3, ropeCoil: 1 },
    garb: {
      commoner: { robe: ['#5a5248', '#3a352c'], hood: '#2a261e' },
      merchant: { coat: ['#6a5a42', '#453a28'], sash: '#7a6a4a', hat: '#3a3226' },
      noble: { gown: ['#6a4a52', '#43303a'], cap: '#4a3038', feather: '#b8ab8a' },
    },
    fog: { n: 2, alpha: 0.04, color: [150, 140, 125] },
  },
  /** Night 2 — awnings, bunting and bales by lamplight. */
  market: {
    sky: { top: [12, 9, 22], bot: [26, 19, 36], dawnTop: [46, 27, 48], dawnBot: [74, 42, 56] },
    stars: 40, moon: true, ring: 'roofs',
    ringFill: '#0b0918', ringBump: '#0e0b1d',
    windows: { style: 'dot', color: [224, 168, 60], n: 34 },
    plaza: ['#2a2138', '#211a2c', '#171220'], plazaLine: 'rgba(60,50,100,.35)', rim: '#2f2750',
    cobble: [120, 110, 160],
    torch: { n: 6, style: 'pole' },
    props: { stall: 5, bunting: 4, barrel: 2, crate: 1, tree: 1 },
    bunting: ['#8a4040', '#7a7040', '#40608a', '#6a4a7a'],
    garb: {
      commoner: { robe: ['#7a5a94', '#4a3a63'], hood: '#2e2438' },
      merchant: { coat: ['#5f7a55', '#3a4d34'], sash: '#8a7040', hat: '#2e3a26' },
      noble: { gown: ['#7a3d5a', '#4a2338'], cap: '#5a2d42', feather: '#d8cfa8' },
    },
    fog: { n: 2, alpha: 0.04, color: [160, 150, 190] },
  },
  /** Night 3 — a quay under sea-mist, masts against the moon. */
  harbor: {
    sky: { top: [7, 12, 22], bot: [15, 25, 38], dawnTop: [36, 36, 54], dawnBot: [58, 64, 74] },
    stars: 34, moon: true, ring: 'roofs',
    ringFill: '#081018', ringBump: '#0b141d',
    windows: { style: 'dot', color: [150, 200, 220], n: 16 },
    plaza: ['#1e2a36', '#18222e', '#101822'], plazaLine: 'rgba(70,100,120,.3)', rim: '#28404e',
    cobble: [90, 120, 140],
    torch: { n: 4, style: 'pole' },
    props: { mast: 3, ropeCoil: 2, barrel: 3, crate: 2 },
    garb: {
      commoner: { robe: ['#4a6a8a', '#2c4258'], hood: '#22303e' },
      merchant: { coat: ['#8a7a3a', '#5a5024'], sash: '#4a6a8a', hat: '#3a3a2a' },
      noble: { gown: ['#3d6a7a', '#234148'], cap: '#2d4a56', feather: '#d8e0d0' },
    },
    fog: { n: 5, alpha: 0.09, color: [140, 160, 180] },
    water: { a0: -0.45, a1: 1.55 },
  },
  /** Night 4 — pale stone, a colonnade, braziers and incense. */
  temple: {
    sky: { top: [13, 11, 24], bot: [26, 22, 38], dawnTop: [50, 34, 46], dawnBot: [80, 56, 58] },
    stars: 44, moon: true, ring: 'roofs',
    ringFill: '#100d1e', ringBump: '#151228',
    windows: { style: 'dot', color: [230, 190, 120], n: 12 },
    plaza: ['#3a3448', '#2e2a3c', '#1f1b2b'], plazaLine: 'rgba(150,140,160,.22)', rim: '#4a4458',
    cobble: [170, 160, 180],
    torch: { n: 4, style: 'brazier' },
    props: { column: 8, statue: 1 },
    garb: {
      commoner: { robe: ['#8a8070', '#5a5348'], hood: '#4a443a' },
      merchant: { coat: ['#9a7a4a', '#63512f'], sash: '#b8a070', hat: '#4a3e2a' },
      noble: { gown: ['#b08a3d', '#6e5624'], cap: '#8a6a2e', feather: '#e8e0c8' },
    },
    fog: { n: 2, alpha: 0.05, color: [190, 180, 200] },
  },
  /** Night 5 — glass lamps, clipped topiary, money on show. */
  gilded: {
    sky: { top: [14, 11, 26], bot: [30, 22, 40], dawnTop: [52, 32, 52], dawnBot: [84, 52, 62] },
    stars: 36, moon: true, ring: 'roofs',
    ringFill: '#0d0a1c', ringBump: '#121026',
    windows: { style: 'dot', color: [240, 200, 110], n: 44 },
    plaza: ['#38304a', '#2c2540', '#1e1930'], plazaLine: 'rgba(180,150,90,.2)', rim: '#57496a',
    cobble: [180, 160, 190],
    torch: { n: 6, style: 'lamp' },
    props: { topiary: 4, bunting: 3, statue: 1 },
    bunting: ['#c0a050', '#d8d0b8', '#8a6a9a', '#c0a050'],
    garb: {
      commoner: { robe: ['#6f6594', '#453d63'], hood: '#262038' },
      merchant: { coat: ['#7a4a6a', '#4c2c42'], sash: '#c0a050', hat: '#3c2436' },
      noble: { gown: ['#8a3d6a', '#54233f'], cap: '#6a2d4e', feather: '#e0ca88' },
    },
    fog: { n: 1, alpha: 0.03, color: [180, 170, 200] },
  },
  /** Night 6 — a black market under the streets; no sky, no moon. */
  undermarket: {
    sky: { top: [6, 7, 6], bot: [10, 12, 9], dawnTop: [12, 14, 9], dawnBot: [18, 20, 12] },
    stars: 0, moon: false, ring: 'cavern',
    ringFill: '#070906', ringBump: '#0e130c',
    windows: { style: 'dot', color: [120, 220, 140], n: 18 },
    plaza: ['#1c231a', '#161c14', '#0e120d'], plazaLine: 'rgba(90,140,90,.25)', rim: '#2a3a28',
    cobble: [100, 140, 100],
    torch: { n: 8, style: 'brazier' },
    props: { stall: 3, barrel: 4, crate: 3 },
    garb: {
      commoner: { robe: ['#3a4438', '#242c22'], hood: '#161c14' },
      merchant: { coat: ['#4a4a3a', '#2e2e24'], sash: '#6a7a4a', hat: '#22261a' },
      noble: { gown: ['#4a3d5a', '#2c2338'], cap: '#3a2d46', feather: '#8a9a78' },
    },
    fog: { n: 4, alpha: 0.1, color: [110, 160, 110] },
    embers: true,
  },
  /** Night 7 — grey stone, statues, a gallows, thin cold rain. */
  magistrate: {
    sky: { top: [10, 12, 20], bot: [20, 24, 34], dawnTop: [36, 38, 50], dawnBot: [58, 60, 68] },
    stars: 12, moon: false, ring: 'roofs',
    ringFill: '#0a0c12', ringBump: '#0d1019',
    windows: { style: 'dot', color: [190, 200, 220], n: 14 },
    plaza: ['#262b38', '#1e222e', '#141822'], plazaLine: 'rgba(120,130,150,.22)', rim: '#39404e',
    cobble: [120, 130, 150],
    torch: { n: 4, style: 'pole' },
    props: { gallows: 1, statue: 2, crate: 2, barrel: 1 },
    garb: {
      commoner: { robe: ['#4a5060', '#303542'], hood: '#232833' },
      merchant: { coat: ['#5a5a6a', '#3a3a46'], sash: '#7a7a8a', hat: '#2c2c38' },
      noble: { gown: ['#5a4a6a', '#382c44'], cap: '#463656', feather: '#c8c8d0' },
    },
    fog: { n: 3, alpha: 0.06, color: [140, 150, 170] },
    rain: true,
  },
  /** Night 8 — crenellated walls, braziers, sparks on the wind. */
  bastion: {
    sky: { top: [9, 8, 14], bot: [18, 16, 24], dawnTop: [40, 26, 32], dawnBot: [64, 40, 40] },
    stars: 40, moon: true, ring: 'walls',
    ringFill: '#0e0c0e', ringBump: '#221b21',
    windows: { style: 'slit', color: [235, 160, 70], n: 12 },
    plaza: ['#28222a', '#201a22', '#151116'], plazaLine: 'rgba(140,110,110,.2)', rim: '#453a3e',
    cobble: [130, 115, 125],
    torch: { n: 6, style: 'brazier' },
    props: { barrel: 4, crate: 4, statue: 1 },
    garb: {
      commoner: { robe: ['#5a4a42', '#3a2f2a'], hood: '#2a221e' },
      merchant: { coat: ['#7a5a3a', '#4e3a24'], sash: '#a08050', hat: '#3a2c1c' },
      noble: { gown: ['#8a4444', '#54282a'], cap: '#6a3434', feather: '#d8d0b0' },
    },
    fog: { n: 2, alpha: 0.04, color: [150, 140, 150] },
    embers: true,
  },
  /** Night 9 — stained glass, yew trees, graves in the ground-mist. */
  cathedral: {
    sky: { top: [12, 8, 26], bot: [24, 16, 44], dawnTop: [44, 28, 58], dawnBot: [72, 46, 70] },
    stars: 50, moon: true, ring: 'roofs', spires: true,
    ringFill: '#0c081a', ringBump: '#110c22',
    windows: { style: 'stained', color: [180, 120, 200], n: 20 },
    plaza: ['#251e3c', '#1d1730', '#131020'], plazaLine: 'rgba(130,110,180,.25)', rim: '#3c3260',
    cobble: [130, 115, 170],
    torch: { n: 3, style: 'pole' },
    props: { yew: 3, grave: 7, statue: 1 },
    garb: {
      commoner: { robe: ['#5a4a6a', '#392e44'], hood: '#282034' },
      merchant: { coat: ['#6a5a7a', '#443a50'], sash: '#9a8a5a', hat: '#342c42' },
      noble: { gown: ['#7a4a7a', '#4c2c4c'], cap: '#5e3860', feather: '#d8d0e0' },
    },
    fog: { n: 5, alpha: 0.08, color: [160, 150, 200] },
  },
  /** Night 10 — marble, festoons, fireworks over the masquerade. */
  palace: {
    sky: { top: [16, 10, 30], bot: [34, 20, 50], dawnTop: [56, 32, 62], dawnBot: [92, 54, 74] },
    stars: 46, moon: true, ring: 'roofs', spires: true,
    ringFill: '#120c20', ringBump: '#181129',
    windows: { style: 'dot', color: [250, 210, 120], n: 50 },
    plaza: ['#403452', '#332a44', '#242032'], plazaLine: 'rgba(220,180,110,.22)', rim: '#6a5680',
    cobble: [190, 170, 200],
    torch: { n: 8, style: 'lamp' },
    props: { topiary: 4, bunting: 6, statue: 2 },
    bunting: ['#c8a050', '#e0d8c4', '#9a6aae', '#5a7ab0'],
    garb: {
      commoner: { robe: ['#8a5a9a', '#583a64'], hood: '#3a2846' },
      merchant: { coat: ['#5a7a9a', '#3a4e64'], sash: '#d0b060', hat: '#2c3c50' },
      noble: { gown: ['#a04a6a', '#642c42'], cap: '#7e3652', feather: '#f0e0b8' },
      masked: true,
    },
    fog: { n: 1, alpha: 0.03, color: [200, 180, 220] },
    fireworks: true,
  },
} satisfies Record<string, Theme>;

export type ThemeId = keyof typeof THEMES;
