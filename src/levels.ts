/** Campaign definition: ten nights, each more demanding than the last. */
export interface NightDef {
  id: number;          // 1-based night number
  name: string;
  flavor: string;
  time: number;        // seconds until dawn
  quota: number;       // coin the Guild demands before dawn
  speed: number;       // watchman base turn speed (rad/s)
  cone: number;        // lantern beam width (rad)
  revMin: number;      // min seconds between direction reversals
  revMax: number;      // max seconds between direction reversals
  maxMarks: number;    // marks on the plaza at once
  patrols: number;     // walking patrol watchmen
  patrolSpeed: number; // patrol walk speed (rad/s along their ring)
  merchants: boolean;  // rich marks that raise a commotion when robbed
  nobles: boolean;     // wandering marks
  constables: boolean; // disguised watch — robbing one costs luck
  vMult: number;       // purse value multiplier
}

export const NIGHTS: NightDef[] = [
  {
    id: 1, name: "Beggar's Yard",
    flavor: 'A sleepy corner of the city. One old watchman, half in his cups. Learn the trade.',
    time: 90, quota: 60, speed: 0.8, cone: 0.56, revMin: 6, revMax: 10,
    maxMarks: 3, patrols: 0, patrolSpeed: 0,
    merchants: false, nobles: false, constables: false, vMult: 1,
  },
  {
    id: 2, name: 'Cloth Market',
    flavor: 'Merchants count their takings under the awnings. Rob one and the whole square stirs.',
    time: 90, quota: 100, speed: 0.9, cone: 0.58, revMin: 5, revMax: 9,
    maxMarks: 4, patrols: 0, patrolSpeed: 0,
    merchants: true, nobles: false, constables: false, vMult: 1.1,
  },
  {
    id: 3, name: 'Harbor Steps',
    flavor: 'Nobles drift home from the pleasure barges, purses heavy, feet unsteady — and never still.',
    time: 90, quota: 150, speed: 1.0, cone: 0.6, revMin: 5, revMax: 9,
    maxMarks: 4, patrols: 0, patrolSpeed: 0,
    merchants: true, nobles: true, constables: false, vMult: 1.2,
  },
  {
    id: 4, name: 'Temple Rise',
    flavor: 'A second lantern walks the colonnade now. Two gazes to slip between.',
    time: 90, quota: 200, speed: 1.05, cone: 0.62, revMin: 5, revMax: 8,
    maxMarks: 5, patrols: 1, patrolSpeed: 0.5,
    merchants: true, nobles: true, constables: false, vMult: 1.35,
  },
  {
    id: 5, name: 'Gilded Row',
    flavor: 'The watch has salted the crowd with constables in plain coats. Mind the red plume.',
    time: 90, quota: 260, speed: 1.1, cone: 0.64, revMin: 4, revMax: 8,
    maxMarks: 5, patrols: 1, patrolSpeed: 0.55,
    merchants: true, nobles: true, constables: true, vMult: 1.5,
  },
  {
    id: 6, name: 'The Undermarket',
    flavor: 'Stolen goods bought and sold by torchlight. Everyone here watches everyone.',
    time: 85, quota: 330, speed: 1.18, cone: 0.66, revMin: 4, revMax: 7,
    maxMarks: 6, patrols: 1, patrolSpeed: 0.62,
    merchants: true, nobles: true, constables: true, vMult: 1.7,
  },
  {
    id: 7, name: "Magistrate's Square",
    flavor: 'The magistrate doubles the patrol after your last visit. You are becoming famous.',
    time: 85, quota: 400, speed: 1.25, cone: 0.68, revMin: 4, revMax: 7,
    maxMarks: 6, patrols: 2, patrolSpeed: 0.62,
    merchants: true, nobles: true, constables: true, vMult: 1.85,
  },
  {
    id: 8, name: 'The Old Bastion',
    flavor: 'Garrison pay night. Soldiers, gold, and a lantern that never seems to rest.',
    time: 85, quota: 480, speed: 1.32, cone: 0.7, revMin: 3, revMax: 6,
    maxMarks: 6, patrols: 2, patrolSpeed: 0.68,
    merchants: true, nobles: true, constables: true, vMult: 2.0,
  },
  {
    id: 9, name: 'Cathedral Close',
    flavor: 'Pilgrims, relic-sellers, and half the city watch. Steal beneath the bells.',
    time: 80, quota: 560, speed: 1.4, cone: 0.72, revMin: 3, revMax: 6,
    maxMarks: 7, patrols: 2, patrolSpeed: 0.75,
    merchants: true, nobles: true, constables: true, vMult: 2.2,
  },
  {
    id: 10, name: 'The Palace Court',
    flavor: 'The king’s own masquerade. Every purse is a fortune; every shadow holds a blade. One last job.',
    time: 100, quota: 700, speed: 1.5, cone: 0.74, revMin: 3, revMax: 5,
    maxMarks: 7, patrols: 3, patrolSpeed: 0.78,
    merchants: true, nobles: true, constables: true, vMult: 2.5,
  },
];
