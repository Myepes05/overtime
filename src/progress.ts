import { PLAYER, WEAPON_ORDER, WEAPONS, type WeaponId } from './config';

/** Persistent wallet, owned weapons and loadout (kept between shifts). */
export interface Progress {
  cash: number;
  levels: Record<WeaponId, number>; // 0 = not owned, 1..3
  loadout: [WeaponId, WeaponId | null];
  shift: number;
}

const KEY = 'overtime.progress.v1';

export function defaultProgress(): Progress {
  const levels = {} as Record<WeaponId, number>;
  for (const id of WEAPON_ORDER) levels[id] = id === 'pencil' ? 1 : 0;
  return { cash: PLAYER.startCash, levels, loadout: ['pencil', null], shift: 1 };
}

export function loadProgress(): Progress {
  const base = defaultProgress();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const p = JSON.parse(raw) as Partial<Progress>;
    const levels = { ...base.levels, ...(p.levels ?? {}) };
    const valid = (id: unknown): id is WeaponId => typeof id === 'string' && id in WEAPONS && levels[id as WeaponId] > 0;
    const l0 = p.loadout?.[0];
    const l1 = p.loadout?.[1];
    return {
      cash: typeof p.cash === 'number' ? p.cash : base.cash,
      levels,
      loadout: [valid(l0) ? l0 : 'pencil', valid(l1) && l1 !== l0 ? l1 : null],
      shift: typeof p.shift === 'number' ? p.shift : 1,
    };
  } catch {
    return base;
  }
}

export function saveProgress(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: progress lasts for this session only */
  }
}
