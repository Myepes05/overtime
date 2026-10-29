import { ENEMIES, PHASES, WEAPON_ORDER, WEAPONS, type EnemyType, type WeaponId } from './config';
import { fmtCash, fmtTime } from './hud';
import type { Progress } from './progress';

/** Fits the 844×390 design stage into the viewport. */
function stage(bg: string, inner: string): HTMLElement {
  const screen = document.createElement('div');
  screen.className = 'screen';
  screen.style.background = bg;
  screen.innerHTML = `<div class="stage-box"><div class="stage" style="background:${bg}">${inner}</div></div>`;
  const box = screen.firstElementChild as HTMLElement;
  const st = box.firstElementChild as HTMLElement;
  const fit = () => {
    const s = Math.min(window.innerWidth / 844, window.innerHeight / 390);
    box.style.width = `${844 * s}px`;
    box.style.height = `${390 * s}px`;
    st.style.transform = `scale(${s})`;
  };
  fit();
  window.addEventListener('resize', fit);
  (screen as HTMLElement & { cleanup?: () => void }).cleanup = () => window.removeEventListener('resize', fit);
  return screen;
}

const HANDS_SVG = `
  <svg aria-hidden="true" width="260" height="170" viewBox="0 0 260 170" style="position:absolute;right:30px;bottom:-6px">
    <ellipse cx="96" cy="110" rx="34" ry="22" fill="#2B2F38"/>
    <path d="M70 96 Q74 70 100 68 Q126 70 130 92 L128 112 Q100 122 72 112 Z" fill="#C99A7A"/>
    <path d="M80 72 Q84 58 94 60 L98 74 Z" fill="#B88A6B"/>
    <path d="M118 108 L260 150 L260 170 L150 170 L104 120 Z" fill="#BFD3E6"/>
    <path d="M110 104 L136 100 L156 130 L124 138 Z" fill="#E9EEF3"/>
  </svg>`;

export interface SoundSettings {
  music: boolean;
  sfx: boolean;
}

export interface SoundHandlers {
  toggleMusic(): void;
  toggleSfx(): void;
}

export interface MenuHandlers extends SoundHandlers {
  clockIn(): void;
  closet(): void;
}

const soundLabel = (kind: 'MUSIC' | 'SFX', on: boolean) => `${kind} · ${on ? 'ON' : 'OFF'}`;

/** Two toggle buttons that update their own labels; the click sound plays after the toggle. */
function bindSound(el: HTMLElement, s: SoundSettings, h: SoundHandlers) {
  const m = el.querySelector<HTMLButtonElement>('[data-a="music"]')!;
  const f = el.querySelector<HTMLButtonElement>('[data-a="sfx"]')!;
  m.onclick = () => {
    h.toggleMusic();
    m.textContent = soundLabel('MUSIC', s.music);
    m.setAttribute('aria-pressed', String(s.music));
  };
  f.onclick = () => {
    h.toggleSfx();
    f.textContent = soundLabel('SFX', s.sfx);
    f.setAttribute('aria-pressed', String(s.sfx));
  };
}

const soundButtons = (s: SoundSettings, style = '') =>
  `<button class="btn" data-a="music" aria-pressed="${s.music}" style="${style}">${soundLabel('MUSIC', s.music)}</button>` +
  `<button class="btn" data-a="sfx" aria-pressed="${s.sfx}" style="${style}">${soundLabel('SFX', s.sfx)}</button>`;

export function menuScreen(p: Progress, sound: SoundSettings, h: MenuHandlers): HTMLElement {
  const agendaColor = (i: number) => (i < 2 ? '#4B5261' : i < 4 ? '#1C2230' : '#C7361F');
  const agenda = PHASES.map(
    (ph, i) => `<div class="menu-agenda-row"><span class="mono" style="font-weight:500;color:#4B5261">${fmtTime(ph.start)}</span><span style="font-weight:600;color:${agendaColor(i)}">${ph.name}${i === 5 ? ' · CEO' : ''}</span></div>`,
  ).join('');
  const el = stage('#D3D7DC', `
    <div aria-hidden="true" style="position:absolute;left:0;right:0;top:0;height:200px;background:#E4E6E9"></div>
    <div aria-hidden="true" style="position:absolute;left:40px;top:40px;width:150px;height:110px;background:#D6E4EE;border:6px solid #B9BEC6"></div>
    <div aria-hidden="true" style="position:absolute;left:660px;top:40px;width:150px;height:110px;background:#D6E4EE;border:6px solid #B9BEC6"></div>
    <div aria-hidden="true" style="position:absolute;left:0;right:0;top:178px;height:42px;background:#A9AFB8"></div>
    <svg aria-hidden="true" width="844" height="220" viewBox="0 0 844 220" style="position:absolute;left:0;top:40px;filter:blur(2px);opacity:0.7">
      <g fill="#4B5261"><ellipse cx="96" cy="118" rx="7" ry="8"/><path d="M86 128 Q96 124 106 128 L108 170 L84 170 Z"/></g>
      <g fill="#5A2A20"><ellipse cx="730" cy="112" rx="8" ry="9"/><path d="M718 124 Q730 119 742 124 L745 170 L715 170 Z"/></g>
    </svg>
    <div aria-hidden="true" style="position:absolute;left:0;right:0;bottom:0;height:150px;background:#E2DCCF;clip-path:polygon(8% 0,92% 0,100% 100%,0 100%)"></div>
    <div style="position:absolute;left:182px;top:18px;width:480px;height:270px;transform:perspective(900px) rotateX(5deg);transform-origin:50% 100%;background:#1C2230;border-radius:6px;padding:9px;box-shadow:0 18px 30px rgba(28,34,48,0.35)">
      <div style="width:100%;height:100%;background:#F5F3EE;padding:14px 16px;display:flex;gap:14px;overflow:hidden">
        <div style="flex:1 1 0;display:flex;flex-direction:column;gap:6px;min-width:0">
          <span class="tape" style="align-self:flex-start;padding:3px 6px">FLOOR 12 · OPEN PLAN</span>
          <h1 style="margin:0;font:700 52px/0.9 var(--cond);letter-spacing:-0.01em">OVERTIME</h1>
          <span style="font-size:12px;line-height:1.35;color:#4B5261">Hold the floor for 5:00 while management closes in.</span>
          <span style="font-size:11px;color:#4B5261">Shift <span class="mono" style="color:#1C2230">${p.shift}</span> · petty cash <span class="mono" style="color:#1C2230">${fmtCash(p.cash)}</span></span>
          <div style="display:flex;flex-direction:column;gap:6px;margin-top:auto">
            <button class="btn primary" data-a="clock" style="height:46px;justify-content:space-between;font-size:17px"><span>CLOCK IN</span><span class="mono" style="font-size:11px">5:00</span></button>
            <button class="btn" data-a="closet" style="justify-content:flex-start;background:transparent">SUPPLY CLOSET</button>
          </div>
        </div>
        <div style="width:168px;flex:none;border-left:1.5px solid #1C2230;padding-left:12px;display:flex;flex-direction:column;gap:5px">
          <span style="font:700 12px var(--cond);letter-spacing:0.06em">TODAY'S AGENDA</span>
          ${agenda}
        </div>
      </div>
    </div>
    <div aria-hidden="true" style="position:absolute;left:392px;top:286px;width:60px;height:36px;background:#2B2F38;clip-path:polygon(30% 0,70% 0,100% 100%,0 100%)"></div>
    <div aria-hidden="true" style="position:absolute;left:160px;top:40px;width:40px;height:40px;background:#F3E58A;transform:rotate(-8deg)"></div>
    <div aria-hidden="true" style="position:absolute;left:70px;top:270px;width:62px;height:70px;background:#FFFFFF;border-radius:4px 4px 12px 12px;box-shadow:inset -10px 0 0 #DADDE2,0 6px 10px rgba(0,0,0,0.15)"></div>
    <div aria-hidden="true" style="position:absolute;left:230px;top:330px;width:380px;height:60px;background:#2B2F38;border-radius:6px;transform:perspective(500px) rotateX(40deg);transform-origin:50% 100%"></div>
    ${HANDS_SVG}
    <div style="position:absolute;right:16px;top:12px;display:flex;gap:6px">${soundButtons(sound, 'font-size:11px;padding:0 10px;background:#F5F3EE')}</div>
  `);
  bindSound(el, sound, h);
  el.querySelector<HTMLButtonElement>('[data-a="clock"]')!.onclick = h.clockIn;
  el.querySelector<HTMLButtonElement>('[data-a="closet"]')!.onclick = h.closet;
  return el;
}

// ---------------------------------------------------------------- closet

export interface ClosetContext {
  progress: Progress;
  matchTime: number | null; // null = browsing from the menu / results
  selected: WeaponId;
}

export interface ClosetHandlers {
  buy(id: WeaponId): void;
  upgrade(id: WeaponId): void;
  equip(id: WeaponId): void;
  select(id: WeaponId): void;
  close(): void;
}

const isLocked = (id: WeaponId, t: number | null) => {
  const u = WEAPONS[id].unlockAt;
  return u > 0 && (t === null || t < u);
};

function statRows(id: WeaponId, level: number): Array<{ label: string; val: string; now: number; next: number }> {
  const d = WEAPONS[id];
  const cur = Math.max(0, level - 1);
  const nxt = Math.min(2, level === 0 ? 0 : level);
  const dmgMax = d.kind === 'beam' || d.kind === 'vortex' ? 400 : 160;
  const per = d.kind === 'beam' || d.kind === 'vortex' ? 'Damage / s' : d.pellets > 1 ? `Damage × ${d.pellets}` : 'Damage';
  const arrow = (a: number | string, b: number | string) => (a === b || level === 0 || level >= 3 ? `${a}` : `${a} → ${b}`);
  const rows = [
    { label: per, val: arrow(d.damage[cur], d.damage[nxt]), now: d.damage[cur] / dmgMax, next: d.damage[nxt] / dmgMax },
  ];
  if (d.kind === 'projectile' || d.kind === 'melee') rows.push({ label: 'Fire rate', val: `${d.fireRate}/s`, now: d.fireRate / 10, next: d.fireRate / 10 });
  else rows.push({ label: 'Overheat after', val: `${(100 / (d.heatPerSecond ?? 20)).toFixed(1)}s`, now: 100 / (d.heatPerSecond ?? 20) / 8, next: 100 / (d.heatPerSecond ?? 20) / 8 });
  if (id === 'stapler') rows.push({ label: 'Pierce', val: arrow(d.pierce[cur], d.pierce[nxt]), now: 0.1 + d.pierce[cur] * 0.3, next: 0.1 + d.pierce[nxt] * 0.3 });
  else if (d.magazine > 0) rows.push({ label: 'Magazine', val: `${d.magazine}`, now: d.magazine / 60, next: d.magazine / 60 });
  else if (d.slow) rows.push({ label: 'Slow', val: `${Math.round((1 - d.slow.factor) * 100)}%`, now: 1 - d.slow.factor, next: 1 - d.slow.factor });
  else if (d.critChance) rows.push({ label: 'Crit chance', val: `${Math.round(d.critChance * 100)}%`, now: d.critChance, next: d.critChance });
  else rows.push({ label: 'Range', val: `${d.range} m`, now: d.range / 40, next: d.range / 40 });
  return rows;
}

export function closetScreen(ctx: ClosetContext, h: ClosetHandlers): HTMLElement {
  const p = ctx.progress;
  const sel = ctx.selected;
  const d = WEAPONS[sel];
  const lv = p.levels[sel];
  const shelves: WeaponId[][] = [WEAPON_ORDER.slice(0, 3), WEAPON_ORDER.slice(3, 6), WEAPON_ORDER.slice(6)];
  const tag = (id: WeaponId) => {
    const l = p.levels[id];
    if (l > 0) return id === 'pencil' && l === 1 ? 'OWNED' : `LV ${l}`;
    if (isLocked(id, ctx.matchTime)) return fmtTime(WEAPONS[id].unlockAt);
    return fmtCash(WEAPONS[id].price);
  };
  const shelfHtml = shelves
    .map(
      (row) => `
    <div style="display:flex;flex-direction:column">
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;align-items:end;padding:0 10px;height:72px">
        ${row
          .map((id) => {
            const w = WEAPONS[id];
            const cls = ['shelf-item', id === sel ? 'sel' : '', isLocked(id, ctx.matchTime) && p.levels[id] === 0 ? 'locked' : ''].join(' ');
            return `<button class="${cls}" data-sel="${id}" style="height:${Math.max(44, w.shelfHeight)}px;background:${w.shelfColor};color:${w.shelfText}" aria-pressed="${id === sel}">${w.name}</button>`;
          })
          .join('')}
      </div>
      <div aria-hidden="true" style="height:10px;background:#B9BEC6;border-bottom:3px solid #5E6676"></div>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:0 10px">
        ${row.map((id) => `<span class="price-tag">${tag(id)}</span>`).join('')}
      </div>
    </div>`,
    )
    .join('');

  const stats = statRows(sel, lv)
    .map(
      (s) => `
    <div style="display:flex;flex-direction:column;gap:3px">
      <div style="display:flex;justify-content:space-between;font-size:10.5px;color:#4B5261"><span>${s.label}</span><span class="mono" style="color:#1C2230">${s.val}</span></div>
      <div class="stat-bar"><i style="width:${Math.min(100, s.next * 100)}%;background:#E4A99C"></i><i style="width:${Math.min(100, s.now * 100)}%;background:#1C2230"></i></div>
    </div>`,
    )
    .join('');

  // primary action
  let primary = '';
  const locked = isLocked(sel, ctx.matchTime);
  if (lv === 0 && locked) {
    primary = `<button class="btn primary" disabled style="justify-content:space-between"><span>${ctx.matchTime === null ? 'IN SHIFT ONLY' : 'LOCKED'}</span><span class="mono" style="font-size:13px">${fmtTime(d.unlockAt)}</span></button>`;
  } else if (lv === 0) {
    primary = `<button class="btn primary" data-a="buy" ${p.cash < d.price ? 'disabled' : ''} style="justify-content:space-between;font-size:15px"><span>BUY</span><span class="mono" style="font-size:13px">${fmtCash(d.price)}</span></button>`;
  } else if (lv < 3) {
    const cost = d.upgradeCost[lv - 1];
    primary = `<button class="btn primary" data-a="upgrade" ${p.cash < cost ? 'disabled' : ''} style="justify-content:space-between;font-size:15px"><span>UPGRADE</span><span class="mono" style="font-size:13px">${fmtCash(cost)}</span></button>`;
  } else {
    primary = `<button class="btn primary" disabled>MAX LEVEL</button>`;
  }
  const slot = p.loadout.indexOf(sel);
  let secondary = '';
  if (lv > 0 && slot === -1) secondary = `<button class="btn" data-a="equip" style="height:44px;font-size:12px">EQUIP${p.loadout[1] ? ` · REPLACES ${WEAPONS[p.loadout[1]].short}` : ''}</button>`;
  else if (slot >= 0) secondary = `<span class="tape" style="align-self:flex-start">EQUIPPED · SLOT ${slot + 1}</span>`;

  const lvLabel = lv === 0 ? 'NOT OWNED' : lv >= 3 ? 'LV 3 · MAX' : `LV ${lv} → ${lv + 1}`;
  const loadout = p.loadout.map((id) => (id ? WEAPONS[id].short : '—')).join(' / ');
  const closeLabel = ctx.matchTime === null ? 'CLOSE · BACK' : `CLOSE · RESUME ${fmtTime(ctx.matchTime)}`;

  const el = stage('#E4E6E9', `
    <div aria-hidden="true" style="position:absolute;left:0;top:0;width:220px;height:390px;background:#D3D7DC"></div>
    <div aria-hidden="true" style="position:absolute;right:0;top:0;width:120px;height:390px;background:#D3D7DC"></div>
    <div aria-hidden="true" style="position:absolute;left:220px;top:0;width:504px;height:390px;background:#8A919C"></div>
    <div aria-hidden="true" style="position:absolute;left:220px;top:0;width:504px;height:390px;background:#5E6676;clip-path:polygon(0 0,100% 0,92% 8%,8% 8%)"></div>
    <div aria-hidden="true" style="position:absolute;left:220px;top:0;width:504px;height:390px;background:#6E7686;clip-path:polygon(0 0,8% 8%,8% 100%,0 100%)"></div>
    <div aria-hidden="true" style="position:absolute;left:220px;top:0;width:504px;height:390px;background:#6E7686;clip-path:polygon(100% 0,92% 8%,92% 100%,100% 100%)"></div>
    <div aria-hidden="true" style="position:absolute;left:520px;top:8px;width:110px;height:8px;background:#FFFFFF;box-shadow:0 0 18px 4px rgba(255,255,255,0.6)"></div>
    <div style="position:absolute;left:262px;top:36px;width:420px;display:flex;flex-direction:column;gap:16px">${shelfHtml}</div>
    <svg aria-hidden="true" width="120" height="110" viewBox="0 0 120 110" style="position:absolute;left:0;bottom:-10px">
      <path d="M0 50 L60 40 L70 110 L0 110 Z" fill="#BFD3E6"/>
      <path d="M52 40 L74 36 L82 104 L62 108 Z" fill="#E9EEF3"/>
      <path d="M74 30 Q100 20 116 40 L112 74 Q92 84 78 70 Z" fill="#C99A7A"/>
    </svg>
    <div style="position:absolute;left:18px;top:62px;width:232px;height:316px;transform:rotate(-5deg);background:#8B6A45;border-radius:6px;padding:26px 10px 10px;box-shadow:0 14px 24px rgba(28,34,48,0.35)">
      <div aria-hidden="true" style="position:absolute;left:86px;top:6px;width:60px;height:16px;background:#A9AFB8;border-radius:3px"></div>
      <div style="background:#F5F3EE;height:100%;padding:10px 12px;display:flex;flex-direction:column;gap:7px">
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1.5px solid #1C2230;padding-bottom:4px;gap:6px">
          <span style="font:700 16px var(--cond);text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${d.name}</span>
          <span class="mono" style="font-size:10px;white-space:nowrap">${lvLabel}</span>
        </div>
        ${stats}
        <span style="font-size:10.5px;line-height:1.35;color:#4B5261">${d.note}</span>
        <div style="margin-top:auto;display:flex;flex-direction:column;gap:6px">${secondary}${primary}</div>
      </div>
    </div>
    <div style="position:absolute;top:12px;right:16px;display:flex;flex-direction:column;align-items:flex-end;gap:3px">
      <span class="tape">PETTY CASH</span>
      <span class="mono" style="font-size:16px">${fmtCash(p.cash)}</span>
      <span class="tape" style="margin-top:6px">LOADOUT</span>
      <span style="font:600 11px var(--cond);letter-spacing:0.04em;text-align:right;max-width:110px">${loadout}</span>
    </div>
    <button class="btn ink" data-a="close" style="position:absolute;right:16px;bottom:16px;font-size:13px">${closeLabel}</button>
  `);
  el.querySelectorAll<HTMLButtonElement>('[data-sel]').forEach((b) => (b.onclick = () => h.select(b.dataset.sel as WeaponId)));
  const on = (a: string, f: () => void) => {
    const b = el.querySelector<HTMLButtonElement>(`[data-a="${a}"]`);
    if (b) b.onclick = f;
  };
  on('buy', () => h.buy(sel));
  on('upgrade', () => h.upgrade(sel));
  on('equip', () => h.equip(sel));
  on('close', h.close);
  return el;
}

// ---------------------------------------------------------------- results

export interface MatchStats {
  time: number;
  won: boolean;
  quit: boolean; // clocked out from the pause menu
  kills: Record<EnemyType, number>;
  headshots: number;
  cashEarned: number;
  ceoDamage: number; // 0..1
  cause: string;
  causePhase: string;
  shift: number;
}

export interface ResultsHandlers {
  again(): void;
  closet(): void;
  desk(): void;
}

export function rating(s: MatchStats): string {
  if (s.won && s.ceoDamage >= 1) return 'Outstanding';
  if (s.won) return 'Exceeds expectations';
  if (s.time >= 240) return 'Meets expectations';
  if (s.time >= 120) return 'Needs improvement';
  return 'Unsatisfactory';
}

export function resultsScreen(s: MatchStats, h: ResultsHandlers): HTMLElement {
  const types: EnemyType[] = ['intern', 'teamLead', 'hrRep', 'manager', 'director', 'vp'];
  const total = types.reduce((a, t) => a + s.kills[t], 0) + s.kills.ceo;
  const rows = [
    ...types.map((t) => ({ k: ENEMIES[t].plural, v: String(s.kills[t]) })),
    { k: 'CEO damage', v: s.kills.ceo ? 'TERMINATED' : `${Math.round(s.ceoDamage * 100)}%` },
    { k: 'Total kills', v: String(total) },
    { k: 'Headshots', v: String(s.headshots) },
    { k: 'Petty cash', v: `+${fmtCash(s.cashEarned)}` },
  ]
    .map((r) => `<div style="display:flex;justify-content:space-between;font-size:12px;border-bottom:1px solid #D9D6CE;padding:3px 0"><span style="color:#4B5261">${r.k}</span><span class="mono">${r.v}</span></div>`)
    .join('');
  const note = s.quit
    ? `Manager’s note: clocked out early at ${fmtTime(s.time)}. HR will be in touch.`
    : s.won
    ? s.kills.ceo
      ? 'Manager’s note: clocked out at 05:00 after taking down the CEO. Promotion pending.'
      : 'Manager’s note: clocked out at 05:00. Survived the all-hands.'
    : `Manager’s note: let go at ${fmtTime(s.time)} by ${s.cause === 'The CEO' ? 'the CEO' : `${/^[AEIOU]/.test(s.cause) ? 'an' : 'a'} ${s.cause}`} during ${s.causePhase}.`;
  const el = stage('#E2DCCF', `
    <div aria-hidden="true" style="position:absolute;left:640px;top:24px;width:80px;height:80px;border-radius:50%;background:#5C4636;box-shadow:inset 0 0 0 8px #F5F3EE,0 8px 14px rgba(0,0,0,0.18)"></div>
    <div aria-hidden="true" style="position:absolute;left:40px;top:60px;width:100px;height:66px;background:#F3E58A;transform:rotate(-12deg)"></div>
    <div aria-hidden="true" style="position:absolute;left:90px;top:240px;width:90px;height:50px;background:radial-gradient(circle at 40% 50%,#6E0A0E 0 26%,transparent 27%),radial-gradient(circle at 75% 35%,#85121A 0 10%,transparent 11%)"></div>
    <div style="position:absolute;left:196px;top:16px;width:420px;height:400px;transform:perspective(1000px) rotateX(18deg);transform-origin:50% 0;background:#F5F3EE;box-shadow:0 20px 30px rgba(28,34,48,0.25);padding:20px 28px;display:flex;flex-direction:column;gap:9px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #1C2230;padding-bottom:6px">
        <h1 style="margin:0;font:700 22px var(--cond);letter-spacing:0.02em">PERFORMANCE REVIEW</h1>
        <span class="mono" style="font-size:10px;color:#4B5261">OVERTIME · SHIFT ${s.shift}</span>
      </div>
      <div style="display:flex;gap:22px;align-items:flex-end">
        <div style="display:flex;flex-direction:column">
          <span class="mono" style="font-size:10px;letter-spacing:0.1em;color:#4B5261">TIME SURVIVED</span>
          <span class="mono" style="font-size:32px;line-height:1.05">${fmtTime(s.time)}</span>
        </div>
        <div style="display:flex;flex-direction:column">
          <span class="mono" style="font-size:10px;letter-spacing:0.1em;color:#4B5261">RATING</span>
          <span style="font:700 22px var(--cond);color:${s.won ? '#2F6B3A' : '#C7361F'}">${rating(s)}</span>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:18px;row-gap:1px">${rows}</div>
      <span style="font-size:11.5px;color:#4B5261">${note}</span>
    </div>
    <svg aria-hidden="true" width="844" height="140" viewBox="0 0 844 140" style="position:absolute;left:0;bottom:0">
      <path d="M0 80 L160 60 L200 140 L0 140 Z" fill="#BFD3E6"/>
      <path d="M140 60 Q180 44 222 70 L228 110 Q190 124 156 108 Z" fill="#C99A7A"/>
      <path d="M660 80 L500 60 L460 140 L660 140 Z" fill="#BFD3E6"/>
      <path d="M520 60 Q480 44 438 70 L432 110 Q470 124 504 108 Z" fill="#C99A7A"/>
    </svg>
    <div style="position:absolute;right:16px;top:130px;display:flex;flex-direction:column;gap:8px;width:170px">
      <button class="btn primary" data-a="again" style="height:48px;font-size:16px">CLOCK IN AGAIN</button>
      <button class="btn" data-a="closet">SUPPLY CLOSET</button>
      <button class="btn" data-a="desk">BACK TO DESK</button>
    </div>
  `);
  el.querySelector<HTMLButtonElement>('[data-a="again"]')!.onclick = h.again;
  el.querySelector<HTMLButtonElement>('[data-a="closet"]')!.onclick = h.closet;
  el.querySelector<HTMLButtonElement>('[data-a="desk"]')!.onclick = h.desk;
  return el;
}

// ---------------------------------------------------------------- pause

export interface PauseHandlers extends SoundHandlers {
  resume(): void;
  restart(): void;
  quit(): void;
}

export function pauseScreen(time: number, sound: SoundSettings, h: PauseHandlers): HTMLElement {
  const el = document.createElement('div');
  el.className = 'screen';
  el.style.background = 'rgba(28,34,48,0.55)';
  el.innerHTML = `
    <div class="pause-panel" role="dialog" aria-label="Paused">
      <h2><span>PAUSED</span><span class="mono" style="font-size:16px">${fmtTime(time)}</span></h2>
      <div class="controls">
        <b>WASD</b> move · <b>Mouse</b> look · <b>Click</b> fire · <b>Q</b> swap · <b>R</b> reload · <b>F</b> coffee · <b>E</b> supply closet · <b>M</b> mute · <b>Esc</b> pause<br>
        Touch: stick bottom-left, drag the right half to look.
      </div>
      <button class="btn primary" data-a="resume" style="height:48px;font-size:16px">RESUME</button>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">${soundButtons(sound, 'font-size:12px')}</div>
      <button class="btn" data-a="restart">CLOCK IN AGAIN</button>
      <button class="btn" data-a="quit">CLOCK OUT · RESULTS</button>
    </div>`;
  bindSound(el, sound, h);
  el.querySelector<HTMLButtonElement>('[data-a="resume"]')!.onclick = h.resume;
  el.querySelector<HTMLButtonElement>('[data-a="restart"]')!.onclick = h.restart;
  el.querySelector<HTMLButtonElement>('[data-a="quit"]')!.onclick = h.quit;
  return el;
}
