/** Persistent Guild progression: a nine-node skill tree bought with banked coin. */

export type Branch = 'fingers' | 'shadow' | 'guile';

export interface Skill {
  id: string;
  branch: Branch;
  tier: 1 | 2 | 3;
  name: string;
  desc: string;
  cost: number;
}

export const BRANCH_NAMES: Record<Branch, string> = {
  fingers: 'Fingers',
  shadow: 'Shadow',
  guile: 'Guile',
};

export const SKILLS: Skill[] = [
  { id: 'fingers1', branch: 'fingers', tier: 1, name: 'Nimble Fingers', desc: 'Every purse yields a quarter more coin.', cost: 50 },
  { id: 'fingers2', branch: 'fingers', tier: 2, name: "Cutpurse's Eye", desc: 'Purses run 20% richer, and one more mark walks each plaza.', cost: 150 },
  { id: 'fingers3', branch: 'fingers', tier: 3, name: 'Legend of the Guild', desc: 'Your name alone loosens purse-strings: half again more coin.', cost: 350 },
  { id: 'shadow1', branch: 'shadow', tier: 1, name: 'Soft Boots', desc: 'The watch turns a tenth slower.', cost: 60 },
  { id: 'shadow2', branch: 'shadow', tier: 2, name: 'Second Heart', desc: 'Begin every night with one more luck.', cost: 180 },
  { id: 'shadow3', branch: 'shadow', tier: 3, name: 'Cloak of Ash', desc: 'Begin every night with a smoke charge — vanish when seen.', cost: 320 },
  { id: 'guile1', branch: 'guile', tier: 1, name: "Fence's Friend", desc: 'The fence offers three relics instead of two.', cost: 80 },
  { id: 'guile2', branch: 'guile', tier: 2, name: 'Long Dusk', desc: 'Dawn comes fifteen seconds later, every night.', cost: 200 },
  { id: 'guile3', branch: 'guile', tier: 3, name: 'Marked Cards', desc: 'The fence approaches every four purses instead of five.', cost: 400 },
];

export interface SaveData {
  night: number;     // current campaign night, 1-based
  coffers: number;   // banked coin available to spend
  skills: string[];  // owned skill ids
  won: boolean;      // finished the final night at least once
}

const KEY = 'cutpurse-save-v1';

export function loadSave(): SaveData {
  const fresh: SaveData = { night: 1, coffers: 0, skills: [], won: false };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh;
    const d = JSON.parse(raw) as Partial<SaveData>;
    return {
      night: typeof d.night === 'number' ? Math.max(1, Math.min(99, d.night)) : 1,
      coffers: typeof d.coffers === 'number' ? Math.max(0, Math.floor(d.coffers)) : 0,
      skills: Array.isArray(d.skills) ? d.skills.filter(id => SKILLS.some(s => s.id === id)) : [],
      won: d.won === true,
    };
  } catch {
    return fresh;
  }
}

export function persist(save: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* private browsing etc — the run still works, it just won't survive reload */
  }
}

export type SkillStatus = 'owned' | 'available' | 'poor' | 'locked';

export function skillStatus(save: SaveData, sk: Skill): SkillStatus {
  if (save.skills.includes(sk.id)) return 'owned';
  if (sk.tier > 1) {
    const prev = SKILLS.find(s => s.branch === sk.branch && s.tier === sk.tier - 1);
    if (prev && !save.skills.includes(prev.id)) return 'locked';
  }
  return save.coffers >= sk.cost ? 'available' : 'poor';
}

/** Attempt to buy; mutates save and persists on success. */
export function buySkill(save: SaveData, sk: Skill): boolean {
  if (skillStatus(save, sk) !== 'available') return false;
  save.coffers -= sk.cost;
  save.skills.push(sk.id);
  persist(save);
  return true;
}
