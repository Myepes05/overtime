import * as THREE from 'three';
import { audio } from './audio';
import { AUDIO, CEO, ENEMY_ORDER, HR_WRITEUP, MATCH, PLAYER, WEAPONS, type EnemyType, type WeaponId } from './config';
import { Effects } from './effects';
import { Enemies, type Enemy } from './enemies';
import { Hud } from './hud';
import { Input } from './input';
import { Player } from './player';
import { loadProgress, saveProgress, type Progress } from './progress';
import { closetScreen, menuScreen, pauseScreen, resultsScreen, type MatchStats } from './screens';
import { phaseAt, phaseIndexAt, Spawner } from './spawner';
import { makeSlot, Weapons, type HitReport, type WeaponSlot } from './weapons';
import { World } from './world';

export type Mode = 'menu' | 'playing' | 'paused' | 'closet' | 'results';

const emptyKills = (): Record<EnemyType, number> => Object.fromEntries(ENEMY_ORDER.map((t) => [t, 0])) as Record<EnemyType, number>;

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(75, 1, 0.05, 200);
  readonly world: World;
  readonly fx: Effects;
  readonly enemies: Enemies;
  readonly weapons: Weapons;
  readonly player = new Player();
  readonly input: Input;
  readonly spawner = new Spawner();
  readonly hud: Hud;
  progress: Progress = loadProgress();

  mode: Mode = 'menu';
  inMatch = false;
  t = 0;
  slots: [WeaponSlot, WeaponSlot | null] = [makeSlot('pencil', 1), null];
  active = 0;
  stats!: MatchStats;
  private lastStats: MatchStats | null = null;
  private screenEl: (HTMLElement & { cleanup?: () => void }) | null = null;
  private closetReturn: 'match' | 'menu' | 'results' = 'menu';
  private closetSel: WeaponId = 'stapler';
  private expectUnlock = false;
  private clock = new THREE.Timer();
  private elapsed = 0;
  private moving = 0;
  private phaseIdx = 0;
  private stepDist = 0;
  private readonly shadows: boolean;

  constructor(canvas: HTMLCanvasElement, private readonly uiRoot: HTMLElement, touchLayer: HTMLElement) {
    const coarse = matchMedia('(pointer: coarse)').matches;
    this.shadows = !coarse;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !coarse, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.5 : 2));
    this.renderer.autoClear = false;
    this.renderer.shadowMap.enabled = this.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // daylight office
    this.scene.background = new THREE.Color('#CFDCE6');
    this.scene.fog = new THREE.Fog('#DDE3E8', 28, 70);
    this.scene.add(new THREE.HemisphereLight('#FFFFFF', '#8A919C', 1.9));
    this.scene.add(new THREE.AmbientLight('#FFFFFF', 0.35));
    const sun = new THREE.DirectionalLight('#FFF8EC', 1.6);
    sun.position.set(14, 22, -18);
    sun.target.position.set(0, 0, 0);
    if (this.shadows) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      const c = sun.shadow.camera;
      c.left = -26;
      c.right = 26;
      c.top = 22;
      c.bottom = -22;
      c.near = 1;
      c.far = 70;
      sun.shadow.bias = -0.0006;
      sun.shadow.normalBias = 0.02;
    }
    this.scene.add(sun, sun.target);
    this.scene.add(this.camera);

    this.world = new World(this.shadows);
    this.scene.add(this.world.group);
    this.fx = new Effects(this.scene, this.world);
    this.enemies = new Enemies(this.scene, this.world, this.fx, this.shadows);
    this.weapons = new Weapons(this.scene, this.world, this.enemies, this.fx, (h) => this.onHit(h));

    this.hud = new Hud(uiRoot);
    this.input = new Input(canvas, touchLayer, this.hud.knob, this.hud.ring);
    this.input.bindButton(this.hud.fireBtn, 'fire');
    this.input.bindButton(this.hud.coffeeBtn, 'coffee');
    this.input.bindButton(this.hud.swapBtn, 'swap');
    this.input.bindButton(this.hud.pauseBtn, 'pause');
    this.input.bindButton(this.hud.closetBtn, 'interact');
    const applyTouch = (t: boolean) => document.body.classList.toggle('touch', t);
    applyTouch(this.input.touchMode);
    this.input.onTouchModeChange = applyTouch;

    // audio may only start after a user gesture
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM' && !e.repeat) {
        audio.toggleAll();
        if (this.mode === 'menu') this.showMenu();
      }
    });
    uiRoot.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b && !b.closest('#hud') && !b.dataset.silent) audio.sfx('click');
    });

    document.addEventListener('pointerlockchange', () => {
      if (!this.input.locked && this.mode === 'playing' && !this.expectUnlock) this.pause();
      this.expectUnlock = false;
    });
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'playing') this.pause();
    });
    this.resize();
    this.showMenu();
    this.loop();
  }

  // ---------------------------------------------------------------- flow

  private setScreen(el: HTMLElement | null) {
    if (this.screenEl) {
      this.screenEl.cleanup?.();
      this.screenEl.remove();
    }
    this.screenEl = el;
    if (el) this.uiRoot.appendChild(el);
  }

  private releasePointer() {
    if (this.input.locked) {
      this.expectUnlock = true;
      this.input.unlock();
    }
  }

  showMenu() {
    this.mode = 'menu';
    this.inMatch = false;
    this.input.enabled = false;
    this.hud.show(false);
    this.releasePointer();
    audio.stopLoops();
    audio.ambience(false);
    audio.muffle(false);
    audio.setTrack('menu');
    this.setScreen(
      menuScreen(this.progress, audio.settings, {
        clockIn: () => this.startMatch(),
        closet: () => this.openCloset('menu'),
        toggleMusic: () => audio.setMusic(!audio.settings.music),
        toggleSfx: () => audio.setSfx(!audio.settings.sfx),
      }),
    );
  }

  startMatch() {
    this.enemies.reset();
    this.fx.reset();
    this.weapons.reset();
    this.spawner.reset();
    this.player.reset(this.world.playerStart);
    this.player.yaw = Math.PI; // face the room (towards +z)
    this.t = 0;
    const [a, b] = this.progress.loadout;
    this.slots = [makeSlot(a, this.progress.levels[a]), b ? makeSlot(b, this.progress.levels[b]) : null];
    this.active = 0;
    this.weapons.select(this.slots[0]);
    this.stats = {
      time: 0, won: false, quit: false, kills: emptyKills(), headshots: 0, cashEarned: 0, ceoDamage: 0,
      cause: 'Intern', causePhase: 'Onboarding', shift: this.progress.shift,
    };
    this.inMatch = true;
    this.phaseIdx = 0;
    this.stepDist = 0;
    audio.stopLoops();
    audio.setIntensity(0);
    audio.setTrack('match');
    audio.ambience(true);
    this.input.reset();
    this.hud.resetHint();
    this.resume();
  }

  resume() {
    this.setScreen(null);
    this.mode = 'playing';
    this.input.enabled = true;
    this.input.reset();
    this.hud.show(true);
    audio.muffle(false);
    this.input.lock();
    this.clock.update();
  }

  pause() {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    this.input.enabled = false;
    this.releasePointer();
    audio.stopLoops();
    audio.muffle(true);
    this.setScreen(
      pauseScreen(this.t, audio.settings, {
        toggleMusic: () => audio.setMusic(!audio.settings.music),
        toggleSfx: () => audio.setSfx(!audio.settings.sfx),
        resume: () => this.resume(),
        restart: () => this.startMatch(),
        quit: () => this.endMatch(false, true),
      }),
    );
  }

  openCloset(from: 'match' | 'menu' | 'results') {
    this.closetReturn = from;
    if (from === 'match') {
      this.mode = 'closet';
      this.input.enabled = false;
      this.releasePointer();
      audio.stopLoops();
      audio.muffle(true);
    }
    audio.sfx('closetOpen');
    this.renderCloset();
  }

  private renderCloset() {
    this.setScreen(
      closetScreen(
        { progress: this.progress, matchTime: this.closetReturn === 'match' ? this.t : null, selected: this.closetSel },
        {
          select: (id) => {
            this.closetSel = id;
            this.renderCloset();
          },
          buy: (id) => this.buy(id),
          upgrade: (id) => this.upgrade(id),
          equip: (id) => this.equip(id),
          close: () => this.closeCloset(),
        },
      ),
    );
  }

  private closeCloset() {
    audio.sfx('closetClose');
    if (this.closetReturn === 'match') this.resume();
    else if (this.closetReturn === 'results' && this.lastStats) this.showResults(this.lastStats);
    else this.showMenu();
  }

  private endMatch(won: boolean, quit = false) {
    this.inMatch = false;
    this.input.enabled = false;
    this.mode = 'results';
    this.stats.time = Math.min(MATCH.duration, this.t);
    this.stats.won = won;
    this.stats.quit = quit;
    const boss = this.enemies.list.find((e) => e.type === 'ceo');
    if (boss) this.stats.ceoDamage = 1 - Math.max(0, boss.hp) / boss.maxHp;
    this.progress.shift++;
    saveProgress(this.progress);
    this.releasePointer();
    audio.endOfShift(won);
    this.lastStats = { ...this.stats, kills: { ...this.stats.kills } };
    this.showResults(this.lastStats);
  }

  private showResults(s: MatchStats) {
    this.mode = 'results';
    this.hud.show(false);
    this.setScreen(
      resultsScreen(s, {
        again: () => this.startMatch(),
        closet: () => this.openCloset('results'),
        desk: () => this.showMenu(),
      }),
    );
  }

  // ---------------------------------------------------------------- economy

  private equipRule(id: WeaponId) {
    const lo = this.progress.loadout;
    if (lo.includes(id)) return;
    if (!lo[1]) lo[1] = id;
    else {
      // replace the slot that is not in hand during a match, otherwise slot 2
      const replace = this.inMatch ? 1 - this.active : 1;
      if (replace === 0) lo[0] = id;
      else lo[1] = id;
    }
    if (this.inMatch) {
      const i = lo.indexOf(id);
      this.slots[i] = makeSlot(id, this.progress.levels[id]);
    }
  }

  private buy(id: WeaponId) {
    const d = WEAPONS[id];
    if (this.progress.levels[id] > 0 || this.progress.cash < d.price) return;
    this.progress.cash -= d.price;
    this.progress.levels[id] = 1;
    this.equipRule(id);
    audio.sfx('buy');
    saveProgress(this.progress);
    this.renderCloset();
  }

  private upgrade(id: WeaponId) {
    const lv = this.progress.levels[id];
    if (lv < 1 || lv >= 3) return;
    const cost = WEAPONS[id].upgradeCost[lv - 1];
    if (this.progress.cash < cost) return;
    this.progress.cash -= cost;
    this.progress.levels[id] = lv + 1;
    audio.sfx('buy');
    for (const s of this.slots) if (s && s.id === id) s.level = lv + 1;
    saveProgress(this.progress);
    this.renderCloset();
  }

  private equip(id: WeaponId) {
    if (this.progress.levels[id] < 1) return;
    this.equipRule(id);
    audio.sfx('swap');
    saveProgress(this.progress);
    this.renderCloset();
  }

  // ---------------------------------------------------------------- combat events

  private onHit(h: HitReport) {
    const boss = h.enemy.type === 'ceo';
    if (boss) this.stats.ceoDamage = 1 - Math.max(0, h.enemy.hp) / h.enemy.maxHp;
    this.hud.hitMarker(h.killed);
    if (h.head && h.dealt > 0) this.hud.hitLabel(`HEADSHOT −${h.dealt}`);
    else if (h.crit) this.hud.hitLabel(`CRIT −${h.dealt}`);
    if (!h.killed) return;
    this.stats.kills[h.enemy.type]++;
    if (h.head) this.stats.headshots++;
    const cash = Math.round(h.enemy.def.cash * (h.head ? 1 + MATCH.headshotCashBonus : 1));
    this.progress.cash += cash;
    this.stats.cashEarned += cash;
    this.hud.cashPop(cash);
    audio.sfx('cash');
    if (boss) {
      this.hud.hitLabel('CEO TERMINATED', true);
      audio.stinger('terminated');
    }
  }

  private hurtPlayer(amount: number, by: Enemy, cause?: string) {
    if (this.mode !== 'playing') return;
    if (!this.player.hurt(amount)) return;
    audio.sfx('hurt');
    this.stats.cause = cause ?? by.def.name;
    this.stats.causePhase = by.type === 'ceo' && by.phase2 ? 'Layoffs' : phaseAt(this.t).name;
    if (this.player.wellbeing <= 0) this.endMatch(false);
  }

  /** True if a desk, partition or table is between the CEO and the player (at waist height). */
  private playerCovered(boss: Enemy): boolean {
    const a = new THREE.Vector3(boss.pos.x, 0.5, boss.pos.z);
    const b = new THREE.Vector3(this.player.pos.x, 0.5, this.player.pos.z);
    return !!this.world.raycast(a, b);
  }

  // ---------------------------------------------------------------- loop

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.weapons.view.resize(w / h);
  }

  private loop = () => {
    requestAnimationFrame(this.loop);
    this.clock.update();
    const dt = Math.min(0.05, this.clock.getDelta());
    this.elapsed += dt;
    if (this.mode === 'playing') this.update(dt);
    if (this.inMatch) {
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
      this.renderer.clearDepth();
      this.renderer.render(this.weapons.view.scene, this.weapons.view.camera);
    }
  };

  private update(dt: number) {
    this.t += dt;
    const input = this.input;
    for (const a of input.consumeActions()) {
      if (a === 'pause') {
        this.pause();
        return;
      }
      if (a === 'swap' && this.slots[1]) {
        audio.sfx('swap');
        this.active = 1 - this.active;
        this.weapons.select(this.slots[this.active]!);
      }
      if (a === 'reload') this.weapons.reload(this.slots[this.active]!);
      if (a === 'coffee') audio.sfx(this.player.coffee() ? 'coffee' : 'error');
      if (a === 'interact' && this.nearCloset()) {
        this.openCloset('match');
        return;
      }
    }

    this.moving = this.player.update(dt, input, this.world, this.camera);
    audio.setListener(this.player.pos.x, this.player.pos.z, this.player.yaw);
    this.stepDist += this.moving * PLAYER.speed * dt;
    if (this.stepDist >= AUDIO.footstepEvery) {
      this.stepDist = 0;
      audio.sfx('step');
    }
    this.camera.updateMatrixWorld();
    const slot = this.slots[this.active]!;
    this.weapons.update(dt, slot, input.isFiring(), this.camera, this.moving, this.elapsed);

    if (this.spawner.update(dt, this.t, this.enemies, this.world, this.player.pos) === 'ceo') {
      audio.setTrack('boss');
      audio.stinger('boss');
    }
    const pi = phaseIndexAt(this.t);
    if (pi !== this.phaseIdx) {
      this.phaseIdx = pi;
      audio.setIntensity(pi);
      if (pi < 5) audio.sfx('chime');
    }
    const boss = this.enemies.boss();
    this.enemies.update(dt, this.player.pos, () => (boss ? this.playerCovered(boss) : false), {
      onPlayerHit: (dmg, by) => this.hurtPlayer(dmg, by),
      onWriteUp: (by) => {
        this.player.slowT = PLAYER.slowDuration;
        audio.sfx('writeup');
        this.hurtPlayer(HR_WRITEUP.damage * (1 + MATCH.damageScalePerMinute * (this.t / 60)), by, 'HR Rep');
      },
      onShockwave: (by) => this.hurtPlayer(CEO.shockwaveDamage, by, 'The CEO'),
    });
    this.fx.update(dt);
    if (this.mode !== 'playing') return; // died this frame

    if (this.t >= MATCH.duration) {
      this.endMatch(true);
      return;
    }

    const ceo = this.enemies.list.find((e) => e.type === 'ceo') ?? null;
    const def = WEAPONS[slot.id];
    const other = this.slots[1 - this.active];
    this.hud.update(
      {
        time: this.t,
        wellbeing: this.player.wellbeing,
        cash: this.progress.cash,
        weapon: slot.id,
        level: slot.level,
        other: other ? other.id : null,
        ammo: slot.ammo,
        reloading: def.magazine > 0 && slot.reloadT > 0,
        heat: slot.heat,
        overheated: slot.overheated,
        coffeeCd: this.player.coffeeCd,
        slowT: this.player.slowT,
        boostT: this.player.boostT,
        nearCloset: this.nearCloset(),
        boss: ceo ? { hp: Math.max(0, ceo.hp), max: ceo.maxHp, phase2: ceo.phase2, telegraph: !ceo.dead && ceo.telegraph > 0 } : null,
        hurt: this.player.hurtFlash,
        locked: this.input.locked,
        touch: this.input.touchMode,
      },
      dt,
    );
  }

  private nearCloset(): boolean {
    const d = this.world.closetDoor;
    return Math.hypot(this.player.pos.x - d.x, this.player.pos.z - d.z) < PLAYER.closetRange;
  }

  // ---------------------------------------------------------------- dev helpers

  debug() {
    return {
      game: this,
      audio,
      skipTo: (t: number) => {
        this.t = t;
      },
      cash: (n: number) => {
        this.progress.cash += n;
        saveProgress(this.progress);
      },
      die: () => {
        this.player.hurtCd = 0;
        this.player.wellbeing = 1;
        this.hurtPlayer(999, this.enemies.list[0] ?? ({ def: { name: 'Intern' }, type: 'intern', phase2: false } as unknown as Enemy));
      },
      /** Aim the camera at the nearest live enemy's head. */
      aimNearest: () => {
        let best: Enemy | null = null;
        let bd = Infinity;
        for (const e of this.enemies.list) {
          if (e.dead) continue;
          const d = e.pos.distanceTo(this.player.pos);
          if (d < bd) {
            bd = d;
            best = e;
          }
        }
        if (!best) return null;
        const to = best.headPos.clone().sub(this.camera.position);
        this.player.yaw = Math.atan2(-to.x, -to.z);
        this.player.pitch = Math.atan2(to.y, Math.hypot(to.x, to.z));
        return { type: best.type, dist: bd };
      },
      teleport: (x: number, z: number) => this.player.pos.set(x, 0, z),
      state: () => ({ mode: this.mode, t: this.t, wellbeing: this.player.wellbeing, cash: this.progress.cash, live: this.enemies.liveCount(false), kills: { ...this.stats?.kills }, loadout: this.progress.loadout }),
    };
  }
}

