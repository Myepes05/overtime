// Balance and tuning for Overtime.
// EVERY number in this file is a PLACEHOLDER for the prototype: tune freely.

export type EnemyType = 'intern' | 'teamLead' | 'hrRep' | 'manager' | 'director' | 'vp' | 'ceo';
export type WeaponId =
  | 'pencil'
  | 'rubberBand'
  | 'stapler'
  | 'holePunch'
  | 'tapeGun'
  | 'letterOpener'
  | 'laminator'
  | 'shredder';

export interface Look {
  jackets: string[];
  pants: string[];
  ties: string[];
  skins: string[];
  hairs: string[];
}

export interface EnemyDef {
  name: string;
  plural: string;
  hp: number; // PLACEHOLDER
  speed: number; // m/s, PLACEHOLDER
  damage: number; // per melee hit, PLACEHOLDER
  attackRange: number;
  attackCooldown: number; // s
  cash: number; // petty cash per kill, PLACEHOLDER
  scale: number; // body scale (1 = ~1.75 m)
  stiffness: number; // walk-cycle amplitude multiplier (lower = stiffer)
  /** Damage multiplier per weapon (armor). Missing = 1. */
  resist?: Partial<Record<WeaponId, number>>;
  look: Look;
}

const SKINS = ['#E8C4A6', '#D8AE8C', '#C99A7A', '#A8754F', '#8D5B3E', '#6E4630', '#4E3122'];
const HAIRS = ['#1B1B1B', '#3A2A1E', '#5B4636', '#8A919C', '#C3C8CF', '#7A4A26'];

export const ENEMIES: Record<EnemyType, EnemyDef> = {
  intern: {
    name: 'Intern', plural: 'Interns',
    hp: 40, speed: 3.3, damage: 4, attackRange: 1.15, attackCooldown: 1.2, cash: 8, scale: 0.96, stiffness: 1.1,
    look: { jackets: ['#4B5261', '#6B7A8F', '#7A3B4A', '#5E6676'], pants: ['#2B2F38', '#3B3F48', '#5E5446'], ties: ['#8A919C', '#7A3B4A', '#3E5A6E'], skins: SKINS, hairs: HAIRS },
  },
  teamLead: {
    name: 'Team Lead', plural: 'Team Leads',
    hp: 90, speed: 2.8, damage: 9, attackRange: 1.2, attackCooldown: 1.1, cash: 18, scale: 1.0, stiffness: 0.9,
    look: { jackets: ['#3E5A6E', '#2F4A3A', '#4B5261'], pants: ['#2B2F38', '#16191F'], ties: ['#C3C8CF', '#E0B341'], skins: SKINS, hairs: HAIRS },
  },
  hrRep: {
    name: 'HR Rep', plural: 'HR Reps',
    hp: 70, speed: 2.6, damage: 6, attackRange: 1.2, attackCooldown: 1.2, cash: 22, scale: 0.97, stiffness: 0.8,
    look: { jackets: ['#8C6A8E', '#B5523B', '#5A606B'], pants: ['#2B2F38', '#3B3F48'], ties: ['#F5F3EE', '#E8C4A6'], skins: SKINS, hairs: HAIRS },
  },
  manager: {
    name: 'Manager', plural: 'Managers',
    hp: 260, speed: 1.9, damage: 20, attackRange: 1.35, attackCooldown: 1.6, cash: 40, scale: 1.08, stiffness: 0.65,
    look: { jackets: ['#2B2F38', '#3B3F48', '#4A3A2E'], pants: ['#16191F', '#2B2F38'], ties: ['#C7361F', '#5A2A20', '#3E5A6E'], skins: SKINS, hairs: HAIRS },
  },
  director: {
    name: 'Director', plural: 'Directors',
    hp: 320, speed: 2.4, damage: 16, attackRange: 1.3, attackCooldown: 1.3, cash: 60, scale: 1.04, stiffness: 0.6,
    // Armored blazer: pencils barely scratch it.
    resist: { pencil: 0.2, rubberBand: 0.5 },
    look: { jackets: ['#1E2430', '#141B2B'], pants: ['#0B1222', '#16191F'], ties: ['#5A2A20', '#8A919C'], skins: SKINS, hairs: HAIRS },
  },
  vp: {
    name: 'VP', plural: 'VPs',
    hp: 420, speed: 3.9, damage: 24, attackRange: 1.35, attackCooldown: 0.9, cash: 110, scale: 1.05, stiffness: 0.7,
    look: { jackets: ['#141B2B', '#2B2F38'], pants: ['#0B1222'], ties: ['#C7361F', '#E0B341'], skins: SKINS, hairs: HAIRS },
  },
  ceo: {
    name: 'The CEO', plural: 'CEO',
    hp: 5200, speed: 2.1, damage: 34, attackRange: 1.7, attackCooldown: 1.5, cash: 1500, scale: 1.22, stiffness: 0.5,
    look: { jackets: ['#141B2B'], pants: ['#0B1222'], ties: ['#C7361F'], skins: ['#D8AE8C'], hairs: ['#C3C8CF'] },
  },
};

export const ENEMY_ORDER: EnemyType[] = ['intern', 'teamLead', 'hrRep', 'manager', 'director', 'vp', 'ceo'];

export interface PhaseDef {
  start: number; // seconds into the match
  name: string;
  who: string;
  spawnInterval: number; // seconds between spawn events, PLACEHOLDER
  weights: Partial<Record<EnemyType, number>>; // spawn mix, PLACEHOLDER
}

export const PHASES: PhaseDef[] = [
  { start: 0, name: 'Onboarding', who: 'Interns', spawnInterval: 4.5, weights: { intern: 1 } },
  { start: 60, name: 'Stand-up', who: '+ Team Leads', spawnInterval: 3.6, weights: { intern: 6, teamLead: 2 } },
  { start: 120, name: 'Performance review', who: '+ Managers, HR', spawnInterval: 3.0, weights: { intern: 5, teamLead: 2, hrRep: 2, manager: 2 } },
  { start: 180, name: 'Restructuring', who: '+ Directors', spawnInterval: 2.6, weights: { intern: 4, teamLead: 2, hrRep: 2, manager: 2, director: 2 } },
  { start: 240, name: 'Board meeting', who: '+ VPs', spawnInterval: 2.3, weights: { intern: 3, teamLead: 2, hrRep: 2, manager: 2, director: 2, vp: 2 } },
  { start: 270, name: 'All-hands', who: 'The CEO', spawnInterval: 3.0, weights: { intern: 4, teamLead: 1, hrRep: 1, manager: 1, director: 1, vp: 1 } },
];

export const MATCH = {
  duration: 300, // 5:00, reaching it is a win
  bossTime: 270, // 4:30
  maxLiveEnemies: 28, // performance cap (CEO not counted)
  internPack: [2, 4] as [number, number], // interns spawn in packs
  minSpawnDistance: 9, // m from the player
  /** Enemy HP and damage scale up as the clock runs. */
  hpScalePerMinute: 0.22,
  damageScalePerMinute: 0.12,
  headshotCashBonus: 0.5, // +50% petty cash on headshot kills
  headshotMultiplier: 2,
};

export const PLAYER = {
  eyeHeight: 1.6,
  radius: 0.35,
  speed: 4.8, // m/s
  maxWellbeing: 100,
  mouseSensitivity: 0.0022,
  touchLookSensitivity: 0.0055,
  keyTurnSpeed: 2.4, // rad/s with arrow keys
  slowFactor: 0.5, // HR write-up
  slowDuration: 3,
  hurtCooldown: 0.35, // s of i-frames after a hit, so a crowd cannot stack damage instantly
  closetRange: 2.6,
  startCash: 0,
};

export const COFFEE = {
  heal: 30, // PLACEHOLDER
  speedMultiplier: 1.45,
  boostDuration: 4,
  cooldown: 25,
};

export const HR_WRITEUP = {
  range: 13,
  preferredDistance: 7.5,
  throwCooldown: 2.8,
  projectileSpeed: 11,
  damage: 6,
};

export const CEO = {
  phase2HpFraction: 0.7, // Layoffs starts below this HP...
  phase2AfterSeconds: 8, // ...or this long after arrival
  layoffsInterval: 6, // s between shockwaves
  telegraph: 2, // s warning ("GET BEHIND THE TABLE")
  shockwaveDamage: 32, // PLACEHOLDER
  shockwaveRadius: 32,
};

export type WeaponKind = 'projectile' | 'melee' | 'beam' | 'vortex';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  short: string; // label on the swap chip / fire button
  kind: WeaponKind;
  price: number; // 0 = starter
  upgradeCost: [number, number]; // to level 2, to level 3
  unlockAt: number; // match seconds before it can be bought
  damage: [number, number, number]; // per hit (or per second for beam / vortex)
  fireRate: number; // shots per second (unused for beam / vortex)
  magazine: number; // 0 = unlimited
  reload: number; // s
  pellets: number;
  spread: number; // radians
  projectileSpeed: number;
  gravity: number;
  pierce: [number, number, number]; // extra enemies passed through
  range: number;
  slow?: { factor: number; duration: number };
  critChance?: number;
  critMultiplier?: number;
  heatPerSecond?: number; // beam / vortex overheat
  coolPerSecond?: number;
  pull?: number; // vortex pull speed m/s
  shelfColor: string;
  shelfText: string;
  shelfHeight: number;
  note: string;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pencil: {
    id: 'pencil', name: 'No. 2 Pencil', short: 'PENCIL', kind: 'projectile',
    price: 0, upgradeCost: [120, 300], unlockAt: 0,
    damage: [26, 34, 44], fireRate: 2.4, magazine: 0, reload: 0, pellets: 1, spread: 0.004,
    projectileSpeed: 34, gravity: 2.5, pierce: [0, 0, 0], range: 40,
    shelfColor: '#E0B341', shelfText: '#1C2230', shelfHeight: 34,
    note: 'Single throw. Sharpened for every occasion. Level 3 is a carpenter pencil.',
  },
  rubberBand: {
    id: 'rubberBand', name: 'Rubber band', short: 'RUBBER BAND', kind: 'projectile',
    price: 150, upgradeCost: [200, 380], unlockAt: 0,
    damage: [9, 12, 16], fireRate: 7, magazine: 0, reload: 0, pellets: 1, spread: 0.018,
    projectileSpeed: 42, gravity: 0, pierce: [0, 0, 0], range: 30,
    shelfColor: '#B5523B', shelfText: '#FFFFFF', shelfHeight: 30,
    note: 'Fast, low damage. Snaps forever.',
  },
  stapler: {
    id: 'stapler', name: 'Desk stapler', short: 'STAPLER', kind: 'projectile',
    price: 420, upgradeCost: [480, 750], unlockAt: 0,
    damage: [18, 24, 31], fireRate: 9, magazine: 60, reload: 1.6, pellets: 1, spread: 0.022,
    projectileSpeed: 55, gravity: 0, pierce: [0, 0, 1], range: 40,
    shelfColor: '#2B2F38', shelfText: '#FFFFFF', shelfHeight: 50,
    note: 'Rapid fire, magazine of 60. Level 3 becomes Heavy-Duty Stapler: staples pierce one extra enemy.',
  },
  holePunch: {
    id: 'holePunch', name: 'Hole punch', short: 'HOLE PUNCH', kind: 'projectile',
    price: 600, upgradeCost: [550, 900], unlockAt: 0,
    damage: [14, 18, 23], fireRate: 1.4, magazine: 8, reload: 2.0, pellets: 9, spread: 0.11,
    projectileSpeed: 38, gravity: 1, pierce: [0, 0, 0], range: 18,
    shelfColor: '#5A606B', shelfText: '#FFFFFF', shelfHeight: 48,
    note: 'Shotgun spread of paper chads. Devastating up close.',
  },
  tapeGun: {
    id: 'tapeGun', name: 'Tape gun', short: 'TAPE GUN', kind: 'projectile',
    price: 900, upgradeCost: [700, 1000], unlockAt: 0,
    damage: [16, 21, 27], fireRate: 4.5, magazine: 30, reload: 1.8, pellets: 1, spread: 0.02,
    projectileSpeed: 30, gravity: 0.5, pierce: [0, 0, 0], range: 30,
    slow: { factor: 0.45, duration: 2.5 },
    shelfColor: '#3E5A6E', shelfText: '#FFFFFF', shelfHeight: 56,
    note: 'Packing tape slows targets for a few seconds.',
  },
  letterOpener: {
    id: 'letterOpener', name: 'Letter opener', short: 'LETTER OPENER', kind: 'melee',
    price: 1100, upgradeCost: [800, 1200], unlockAt: 0,
    damage: [70, 95, 125], fireRate: 2.6, magazine: 0, reload: 0, pellets: 1, spread: 0,
    projectileSpeed: 0, gravity: 0, pierce: [1, 1, 2], range: 2.4,
    critChance: 0.35, critMultiplier: 2.5,
    shelfColor: '#C3C8CF', shelfText: '#1C2230', shelfHeight: 40,
    note: 'Melee. 35% chance to crit for 2.5x. Hits two targets at Level 3.',
  },
  laminator: {
    id: 'laminator', name: 'Laminator', short: 'LAMINATOR', kind: 'beam',
    price: 1400, upgradeCost: [900, 1400], unlockAt: 180,
    damage: [160, 210, 270], fireRate: 0, magazine: 0, reload: 0, pellets: 1, spread: 0,
    projectileSpeed: 0, gravity: 0, pierce: [0, 0, 0], range: 16,
    heatPerSecond: 22, coolPerSecond: 30,
    shelfColor: '#2B2F38', shelfText: '#FFFFFF', shelfHeight: 60,
    note: 'Continuous heat beam (damage per second). Overheats; let it cool.',
  },
  shredder: {
    id: 'shredder', name: 'Shredder', short: 'SHREDDER', kind: 'vortex',
    price: 1800, upgradeCost: [1100, 1600], unlockAt: 240,
    damage: [190, 250, 330], fireRate: 0, magazine: 0, reload: 0, pellets: 1, spread: 0,
    projectileSpeed: 0, gravity: 0, pierce: [0, 0, 0], range: 6,
    heatPerSecond: 18, coolPerSecond: 24, pull: 4.5,
    shelfColor: '#1C2230', shelfText: '#FFFFFF', shelfHeight: 72,
    note: 'Pulls enemies in and grinds everything within 2.5 m (damage per second).',
  },
};

export const WEAPON_ORDER: WeaponId[] = [
  'pencil', 'rubberBand', 'stapler',
  'holePunch', 'tapeGun', 'letterOpener',
  'laminator', 'shredder',
];

export const GORE = {
  bodyFadeAfter: 5, // s before corpses fade
  bodyFadeDuration: 1.2,
  maxParticles: 700,
  maxDecals: 180,
  hitParticles: 10,
  killParticles: 26,
  poolSize: [0.9, 1.4] as [number, number], // m, blood pool diameter range
};

export const AUDIO = {
  master: 0.8,
  music: 0.5,
  sfx: 0.9,
  reverb: 0.16, // office room reverb send
  menuBpm: 88,
  matchBpm: [104, 110, 116, 122, 128], // per phase; the soundtrack adds layers as it speeds up
  bossBpm: 138,
  footstepEvery: 0.8, // metres walked per footstep
  maxDistance: 34, // enemy sounds fade out by this distance
};
