import { PHASES, PLAYER, WEAPONS, type WeaponId } from './config';
import { phaseIndexAt } from './spawner';

export const fmtTime = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
export const fmtCash = (n: number) => `$${Math.floor(n).toLocaleString('en-US')}`;

const ICON_PAUSE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F5F3EE" stroke-width="2.4" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>';
const ICON_SWAP = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3l4 4-4 4M3 7h18M7 21l-4-4 4-4M21 17H3"/></svg>';
const ICON_COFFEE = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9zM16 11h2a2 2 0 0 1 0 4h-2M8 3v3M12 3v3"/></svg>';
const ICON_STAPLER = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 15h18v3H3zM4 15l2-6h12l2 3M9 9V7h8v2"/></svg>';

export interface HudState {
  time: number;
  wellbeing: number;
  cash: number;
  weapon: WeaponId;
  level: number;
  other: WeaponId | null;
  ammo: number;
  reloading: boolean;
  heat: number;
  overheated: boolean;
  coffeeCd: number;
  slowT: number;
  boostT: number;
  nearCloset: boolean;
  boss: { hp: number; max: number; phase2: boolean; telegraph: boolean } | null;
  hurt: number;
  locked: boolean;
  touch: boolean;
}

/** DOM HUD layered over the canvas. Only writes to the DOM when a value changes. */
export class Hud {
  readonly root: HTMLElement;
  readonly pauseBtn: HTMLButtonElement;
  readonly swapBtn: HTMLButtonElement;
  readonly coffeeBtn: HTMLButtonElement;
  readonly fireBtn: HTMLButtonElement;
  readonly closetBtn: HTMLButtonElement;
  readonly ring: HTMLElement;
  readonly knob: HTMLElement;
  private readonly q: Record<string, HTMLElement> = {};
  private readonly cache = new Map<string, string>();
  private hitTimer = 0;
  private cashTimer = 0;
  private markTimer = 0;

  constructor(parent: HTMLElement) {
    const root = document.createElement('div');
    root.id = 'hud';
    root.hidden = true;
    root.innerHTML = `
      <div class="hurt" data-q="hurt"></div>
      <div class="hud-wb" data-q="wb">
        <div class="row"><span class="tape">WELLBEING</span><span class="num" data-q="wbNum">100</span></div>
        <div class="wb-bar"><div class="wb-fill" data-q="wbFill"></div></div>
        <div class="hud-status" data-q="status"></div>
      </div>
      <div class="slip hud-timer" data-q="timer">
        <span class="time" data-q="time">00:00</span>
        <div class="segs" data-q="segs">${'<i></i>'.repeat(6)}</div>
        <span class="phase" data-q="phase">PHASE 1 · ONBOARDING</span>
      </div>
      <div class="slip hud-boss" data-q="boss" hidden>
        <div class="row"><span class="name">THE CEO</span><span class="when" data-q="bossWhen">ALL-HANDS · 04:30</span></div>
        <div class="boss-bar"><div class="boss-fill" data-q="bossFill"></div></div>
        <span class="sub" data-q="bossSub">Phase 1 · Keynote</span>
      </div>
      <span class="tape red telegraph" data-q="telegraph" hidden>GET BEHIND THE TABLE</span>
      <div class="hud-cash">
        <div class="cash">
          <span class="tape">PETTY CASH</span>
          <span class="amount" data-q="cash">$0</span>
          <span class="cash-pop" data-q="cashPop"></span>
        </div>
        <button class="pause-btn tap" aria-label="Pause" data-q="pause">${ICON_PAUSE}</button>
      </div>
      <div class="crosshair" data-q="cross"><i></i><i></i><i></i><i></i></div>
      <span class="tape hit-label" data-q="hit"></span>
      <div class="prompt" data-q="prompt" hidden>
        <button class="btn ink tap" data-q="closet"><span class="key" style="background:#F5F3EE;color:#1C2230">E</span>&nbsp;OPEN SUPPLY CLOSET</button>
      </div>
      <span class="tape lock-hint" data-q="lockHint" hidden>CLICK TO AIM · MOUSE LOOK</span>
      <div class="stick-ring" data-q="ring" role="img" aria-label="Move joystick"><div class="stick-knob" data-q="knob"></div></div>
      <div class="hint" data-q="hint"><b>WASD</b> move · <b>Mouse</b> look · <b>Click</b> fire · <b>Q</b> swap · <b>R</b> reload · <b>F</b> coffee · <b>E</b> closet · <b>M</b> mute · <b>Esc</b> pause</div>
      <div class="hud-actions">
        <button class="swap-chip tap" data-q="swap" aria-label="Swap weapon">${ICON_SWAP}<span data-q="swapName">PENCIL</span><span class="key">Q</span></button>
        <div class="row">
          <button class="ability tap" data-q="coffee" aria-label="Coffee break">${ICON_COFFEE}<span class="cd" data-q="coffeeCd" hidden></span><span class="key">F</span></button>
          <button class="fire tap" data-q="fire" aria-label="Fire"><span data-q="fireIcon"></span><span class="fname" data-q="fireName">PENCIL</span><span class="ammo" data-q="ammo"></span></button>
        </div>
      </div>`;
    parent.appendChild(root);
    root.querySelectorAll<HTMLElement>('[data-q]').forEach((el) => (this.q[el.dataset.q!] = el));
    this.root = root;
    this.pauseBtn = this.q.pause as HTMLButtonElement;
    this.swapBtn = this.q.swap as HTMLButtonElement;
    this.coffeeBtn = this.q.coffee as HTMLButtonElement;
    this.fireBtn = this.q.fire as HTMLButtonElement;
    this.closetBtn = this.q.closet as HTMLButtonElement;
    this.ring = this.q.ring;
    this.knob = this.q.knob;
    const hint = this.q.hint;
    setTimeout(() => (hint.hidden = true), 12000);
  }

  private set(key: string, el: HTMLElement, prop: 'text' | 'width' | 'hidden' | 'class' | 'html', value: string) {
    const k = `${key}.${prop}`;
    if (this.cache.get(k) === value) return;
    this.cache.set(k, value);
    if (prop === 'text') el.textContent = value;
    else if (prop === 'html') el.innerHTML = value;
    else if (prop === 'width') el.style.width = value;
    else if (prop === 'hidden') el.hidden = value === '1';
    else el.className = value;
  }

  show(v: boolean) {
    this.root.hidden = !v;
  }

  resetHint() {
    this.q.hint.hidden = false;
    setTimeout(() => (this.q.hint.hidden = true), 12000);
  }

  update(s: HudState, dt: number) {
    const q = this.q;
    // wellbeing
    const wb = Math.ceil(s.wellbeing);
    const pct = (s.wellbeing / PLAYER.maxWellbeing) * 100;
    this.set('wbNum', q.wbNum, 'text', String(wb));
    this.set('wbFill', q.wbFill, 'width', `${pct.toFixed(1)}%`);
    this.set('wb', q.wb, 'class', pct < 30 ? 'hud-wb low' : 'hud-wb');
    const status: string[] = [];
    if (s.slowT > 0) status.push(`<span class="tape red">WRITTEN UP · SLOWED ${Math.ceil(s.slowT)}s</span>`);
    if (s.boostT > 0) status.push(`<span class="tape">COFFEE · ${Math.ceil(s.boostT)}s</span>`);
    this.set('status', q.status, 'html', status.join(''));

    // timer or boss bar
    const pi = phaseIndexAt(s.time);
    if (s.boss) {
      this.set('timer', q.timer, 'hidden', '1');
      this.set('boss', q.boss, 'hidden', '0');
      this.set('bossWhen', q.bossWhen, 'text', `ALL-HANDS · ${fmtTime(s.time)}`);
      this.set('bossFill', q.bossFill, 'width', `${((s.boss.hp / s.boss.max) * 100).toFixed(1)}%`);
      this.set('bossSub', q.bossSub, 'text', s.boss.hp <= 0 ? 'Terminated · hold out until 05:00' : s.boss.phase2 ? 'Phase 2 · Layoffs: cover is being cleared' : 'Phase 1 · Keynote');
      this.set('telegraph', q.telegraph, 'hidden', s.boss.telegraph ? '0' : '1');
    } else {
      this.set('timer', q.timer, 'hidden', '0');
      this.set('boss', q.boss, 'hidden', '1');
      this.set('telegraph', q.telegraph, 'hidden', '1');
      this.set('time', q.time, 'text', fmtTime(s.time));
      this.set('phase', q.phase, 'text', `PHASE ${pi + 1} · ${PHASES[pi].name.toUpperCase()}`);
      const segKey = String(pi);
      if (this.cache.get('segs') !== segKey) {
        this.cache.set('segs', segKey);
        Array.from(q.segs.children).forEach((c, i) => (c.className = i < pi ? 'done' : i === pi ? 'now' : ''));
      }
    }

    // cash
    this.set('cash', q.cash, 'text', fmtCash(s.cash));
    this.cashTimer -= dt;
    if (this.cashTimer <= 0) q.cashPop.classList.remove('show');

    // weapon cluster
    const def = WEAPONS[s.weapon];
    const lvl = s.level > 1 ? ` L${s.level}` : '';
    this.set('swapName', q.swapName, 'html', s.other ? `${def.short}${lvl} <span class="other">/ ${WEAPONS[s.other].short}</span>` : `${def.short}${lvl}`);
    this.set('swap', q.swap, 'class', 'swap-chip tap');
    this.set('fireName', q.fireName, 'text', s.weapon === 'stapler' ? '' : def.short);
    this.set('fireIcon', q.fireIcon, 'html', s.weapon === 'stapler' ? ICON_STAPLER : '');
    let ammo = '';
    if (def.kind === 'beam' || def.kind === 'vortex') ammo = s.overheated ? 'COOLING' : `HEAT ${Math.round(s.heat)}%`;
    else if (s.reloading) ammo = 'RELOAD';
    else if (def.magazine > 0) ammo = `${s.ammo}/${def.magazine}`;
    else ammo = def.kind === 'melee' ? 'MELEE' : 'THROW';
    this.set('ammo', q.ammo, 'text', ammo);
    this.set('fire', q.fire, 'class', s.reloading || s.overheated ? 'fire tap reloading' : 'fire tap');
    this.fireBtn.setAttribute('aria-label', `Fire ${def.name}, ${ammo}`);

    // coffee
    this.set('coffee', q.coffee, 'class', s.coffeeCd > 0 ? 'ability tap cooling' : 'ability tap');
    this.set('coffeeCdH', q.coffeeCd, 'hidden', s.coffeeCd > 0 ? '0' : '1');
    this.set('coffeeCd', q.coffeeCd, 'text', String(Math.ceil(s.coffeeCd)));

    this.set('prompt', q.prompt, 'hidden', s.nearCloset ? '0' : '1');
    this.set('lockHint', q.lockHint, 'hidden', !s.touch && !s.locked ? '0' : '1');
    q.hurt.style.opacity = String(Math.min(1, s.hurt * 4) * 0.8);

    // transient feedback
    this.hitTimer -= dt;
    if (this.hitTimer <= 0) q.hit.classList.remove('show');
    this.markTimer -= dt;
    if (this.markTimer <= 0) q.cross.className = 'crosshair';
  }

  hitMarker(kill: boolean) {
    this.q.cross.className = kill ? 'crosshair kill' : 'crosshair hit';
    this.markTimer = kill ? 0.18 : 0.08;
  }

  hitLabel(text: string, red = false) {
    const el = this.q.hit;
    el.textContent = text;
    el.className = red ? 'tape red hit-label show' : 'tape hit-label show';
    this.hitTimer = 0.7;
  }

  cashPop(amount: number) {
    const el = this.q.cashPop;
    el.textContent = `+${fmtCash(amount)}`;
    el.classList.add('show');
    this.cashTimer = 0.6;
  }
}
