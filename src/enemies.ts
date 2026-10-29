import * as THREE from 'three';
import { CEO, ENEMIES, GORE, HR_WRITEUP, MATCH, type EnemyDef, type EnemyType, type WeaponId } from './config';
import { audio } from './audio';
import { setOpacity, type Effects } from './effects';
import type { World } from './world';

const pick = <T>(a: T[]): T => a[(Math.random() * a.length) | 0];

export interface Rig {
  root: THREE.Group;
  body: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  stump: THREE.Mesh;
  legL: THREE.Group;
  legR: THREE.Group;
  shinL: THREE.Group;
  shinR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  foreL: THREE.Group;
  foreR: THREE.Group;
}

/** Realistic-proportion humanoid from simple meshes. Feet at y=0, ~1.86 m before scale. */
export function buildHumanoid(def: EnemyDef, shadows: boolean): Rig {
  const L = def.look;
  const m = (c: string) => new THREE.MeshLambertMaterial({ color: c });
  const skin = m(pick(L.skins));
  const hair = m(pick(L.hairs));
  const jacket = m(pick(L.jackets));
  const pants = m(pick(L.pants));
  const tie = m(pick(L.ties));
  const shirt = m('#F5F3EE');
  const shoe = m('#16191F');
  const blood = m('#6E0A0E');

  const mesh = (g: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(g, mat);
    o.position.set(x, y, z);
    if (shadows) o.castShadow = true;
    return o;
  };
  const group = (x = 0, y = 0, z = 0) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    return g;
  };

  const root = group();
  const body = group();
  root.add(body);

  // legs: hip pivot at y 0.95
  const makeLeg = (side: number) => {
    const leg = group(side * 0.1, 0.95, 0);
    leg.add(mesh(new THREE.CapsuleGeometry(0.075, 0.34, 3, 8), pants, 0, -0.23, 0));
    const shin = group(0, -0.47, 0);
    shin.add(mesh(new THREE.CapsuleGeometry(0.065, 0.32, 3, 8), pants, 0, -0.21, 0));
    shin.add(mesh(new THREE.BoxGeometry(0.11, 0.07, 0.27), shoe, 0, -0.44, 0.05));
    leg.add(shin);
    body.add(leg);
    return { leg, shin };
  };
  const l = makeLeg(-1);
  const r = makeLeg(1);

  // torso pivot at the hips so stagger leans from the waist
  const torso = group(0, 0.95, 0);
  body.add(torso);
  torso.add(mesh(new THREE.BoxGeometry(0.36, 0.14, 0.22), pants, 0, 0.03, 0)); // belt line
  const jacketMesh = mesh(new THREE.BoxGeometry(0.44, 0.56, 0.24), jacket, 0, 0.36, 0);
  torso.add(jacketMesh);
  torso.add(mesh(new THREE.BoxGeometry(0.46, 0.08, 0.26), jacket, 0, 0.6, 0)); // shoulders
  // white shirt V + tie
  const v = mesh(new THREE.BoxGeometry(0.12, 0.22, 0.01), shirt, 0, 0.52, 0.122);
  torso.add(v);
  torso.add(mesh(new THREE.BoxGeometry(0.045, 0.3, 0.012), tie, 0, 0.44, 0.128));
  torso.add(mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.1, 10), skin, 0, 0.68, 0)); // neck
  const stump = mesh(new THREE.CylinderGeometry(0.056, 0.056, 0.02, 10), blood, 0, 0.73, 0);
  stump.visible = false;
  torso.add(stump);

  // head pivot at the top of the neck
  const head = group(0, 0.72, 0);
  torso.add(head);
  const skull = mesh(new THREE.SphereGeometry(0.115, 14, 12), skin, 0, 0.12, 0.005);
  skull.scale.set(0.92, 1.1, 1.0);
  head.add(skull);
  const hairCap = mesh(new THREE.SphereGeometry(0.122, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), hair, 0, 0.15, -0.012);
  hairCap.scale.set(0.95, 0.85, 1.02);
  head.add(hairCap);
  head.add(mesh(new THREE.BoxGeometry(0.03, 0.04, 0.03), skin, 0, 0.1, 0.12)); // nose
  head.add(mesh(new THREE.BoxGeometry(0.02, 0.05, 0.04), skin, -0.105, 0.11, 0)); // ears
  head.add(mesh(new THREE.BoxGeometry(0.02, 0.05, 0.04), skin, 0.105, 0.11, 0));
  const eyes = m('#1C2230');
  head.add(mesh(new THREE.BoxGeometry(0.025, 0.012, 0.01), eyes, -0.04, 0.14, 0.108));
  head.add(mesh(new THREE.BoxGeometry(0.025, 0.012, 0.01), eyes, 0.04, 0.14, 0.108));

  // arms: shoulder pivot
  const makeArm = (side: number) => {
    const arm = group(side * 0.27, 0.58, 0);
    arm.add(mesh(new THREE.CapsuleGeometry(0.062, 0.22, 3, 8), jacket, 0, -0.15, 0));
    const fore = group(0, -0.31, 0);
    fore.add(mesh(new THREE.CapsuleGeometry(0.055, 0.2, 3, 8), jacket, 0, -0.13, 0));
    fore.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 8), shirt, 0, -0.26, 0)); // cuff
    fore.add(mesh(new THREE.BoxGeometry(0.07, 0.1, 0.04), skin, 0, -0.32, 0)); // hand
    arm.add(fore);
    torso.add(arm);
    return { arm, fore };
  };
  const al = makeArm(-1);
  const ar = makeArm(1);

  root.scale.setScalar(def.scale);
  return { root, body, torso, head, stump, legL: l.leg, legR: r.leg, shinL: l.shin, shinR: r.shin, armL: al.arm, armR: ar.arm, foreL: al.fore, foreR: ar.fore };
}

export interface HitResult {
  enemy: Enemy;
  t: number;
  head: boolean;
}

export class Enemy {
  readonly rig: Rig;
  readonly def: EnemyDef;
  hp: number;
  maxHp: number;
  damage: number;
  dead = false;
  removed = false;
  decapitated = false;
  deathT = 0;
  fallDir = 1;
  walkPhase = Math.random() * Math.PI * 2;
  attackCd = 0.5 + Math.random() * 0.5;
  attackAnim = 0;
  windup = 0; // > 0 while a melee blow is coming
  staggerT = 0;
  slowT = 0;
  slowFactor = 1;
  boostT = 0; // team lead aura
  pulled = new THREE.Vector3();
  readonly headPos = new THREE.Vector3();
  readonly neckPos = new THREE.Vector3();
  readonly radius: number;
  readonly height: number;
  pooled = false;
  // CEO
  phase2 = false;
  sinceArrival = 0;
  layoffT = 0;
  telegraph = 0; // > 0 while "GET BEHIND THE TABLE" is up

  constructor(readonly type: EnemyType, pos: THREE.Vector3, matchTime: number, shadows: boolean) {
    this.def = ENEMIES[type];
    this.rig = buildHumanoid(this.def, shadows);
    this.rig.root.position.copy(pos);
    const minutes = matchTime / 60;
    const hpScale = type === 'ceo' ? 1 : 1 + MATCH.hpScalePerMinute * minutes;
    this.maxHp = this.hp = Math.round(this.def.hp * hpScale);
    this.damage = this.def.damage * (1 + MATCH.damageScalePerMinute * minutes);
    this.radius = 0.32 * this.def.scale;
    this.height = 1.5 * this.def.scale;
    this.layoffT = CEO.layoffsInterval;
  }

  get pos(): THREE.Vector3 {
    return this.rig.root.position;
  }

  get alive(): boolean {
    return !this.dead;
  }
}

export interface EnemyEvents {
  onPlayerHit(damage: number, by: Enemy): void;
  onWriteUp(by: Enemy): void;
  onShockwave(by: Enemy): void;
}

interface WriteUp {
  mesh: THREE.Mesh;
  v: THREE.Vector3;
  life: number;
  from: Enemy;
}

export class Enemies {
  readonly list: Enemy[] = [];
  private readonly writeUps: WriteUp[] = [];
  private readonly paperGeo = new THREE.BoxGeometry(0.22, 0.01, 0.3);
  private readonly paperMat = new THREE.MeshLambertMaterial({ color: '#F5F3EE', side: THREE.DoubleSide });
  private flowTimer = 0;
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly world: World,
    private readonly fx: Effects,
    private readonly shadows: boolean,
  ) {}

  reset() {
    for (const e of this.list) this.scene.remove(e.rig.root);
    this.list.length = 0;
    for (const w of this.writeUps) this.scene.remove(w.mesh);
    this.writeUps.length = 0;
  }

  spawn(type: EnemyType, pos: THREE.Vector3, matchTime: number): Enemy {
    const e = new Enemy(type, pos, matchTime, this.shadows);
    this.scene.add(e.rig.root);
    this.list.push(e);
    audio.sfx('door', { pos });
    return e;
  }

  liveCount(excludeBoss = true): number {
    let n = 0;
    for (const e of this.list) if (!e.dead && !(excludeBoss && e.type === 'ceo')) n++;
    return n;
  }

  boss(): Enemy | null {
    for (const e of this.list) if (e.type === 'ceo' && !e.dead) return e;
    return null;
  }

  /** Segment test against every live enemy's head sphere and body cylinder. */
  raycast(a: THREE.Vector3, b: THREE.Vector3, skip?: Set<Enemy>): HitResult | null {
    let best: HitResult | null = null;
    const d = this.tmp.subVectors(b, a);
    for (const e of this.list) {
      if (e.dead || (skip && skip.has(e))) continue;
      const hr = 0.135 * e.def.scale;
      const th = segSphere(a, d, e.headPos, hr);
      if (th !== null && (!best || th < best.t)) best = { enemy: e, t: th, head: true };
      const tb = segCylinder(a, d, e.pos.x, e.pos.z, e.radius, 0, e.height);
      if (tb !== null && (!best || tb < best.t - 1e-4)) best = { enemy: e, t: tb, head: false };
    }
    return best;
  }

  /**
   * Apply damage. Returns { killed, dealt }.
   * dir is the shot direction (for gore and the fall).
   */
  damage(e: Enemy, amount: number, weapon: WeaponId, head: boolean, at: THREE.Vector3, dir: THREE.Vector3): { killed: boolean; dealt: number } {
    if (e.dead) return { killed: false, dealt: 0 };
    const resist = e.def.resist?.[weapon] ?? 1;
    let dealt = amount * resist * (head ? MATCH.headshotMultiplier : 1);
    dealt = Math.max(1, Math.round(dealt));
    e.hp -= dealt;
    e.staggerT = Math.min(0.35, 0.12 + dealt / 200);
    e.windup = 0; // a hit interrupts the swing
    this.fx.bloodBurst(at, dir, head ? 14 : 8);
    if (e.hp > 0) audio.sfx(head ? 'headshot' : 'hit', { pos: at });
    if (e.hp <= 0) {
      this.kill(e, head, dir);
      return { killed: true, dealt };
    }
    return { killed: false, dealt };
  }

  private kill(e: Enemy, head: boolean, dir: THREE.Vector3) {
    e.dead = true;
    e.hp = 0;
    e.deathT = 0;
    // fall away from the shot
    const facing = new THREE.Vector3(Math.sin(e.rig.root.rotation.y), 0, Math.cos(e.rig.root.rotation.y));
    e.fallDir = facing.dot(dir) > 0 ? 1 : -1;
    this.fx.bloodBurst(head ? e.headPos : e.pos.clone().setY(1.1 * e.def.scale), dir, GORE.killParticles, 1.2);
    audio.sfx('death', { pos: e.pos });
    if (head) {
      audio.sfx('headshot', { pos: e.pos });
      audio.sfx('decap', { pos: e.pos });
      e.decapitated = true;
      e.rig.stump.visible = true;
      this.fx.launchHead(e.rig.head, dir);
    }
  }

  update(dt: number, playerPos: THREE.Vector3, playerCovered: () => boolean, ev: EnemyEvents) {
    this.flowTimer -= dt;
    if (this.flowTimer <= 0) {
      this.world.updateFlow(playerPos);
      this.flowTimer = 0.3;
    }
    // team lead aura
    for (const e of this.list) e.boostT = Math.max(0, e.boostT - dt);
    for (const tl of this.list) {
      if (tl.dead || tl.type !== 'teamLead') continue;
      for (const e of this.list) {
        if (e.type === 'intern' && !e.dead && e.pos.distanceToSquared(tl.pos) < 36) e.boostT = 0.5;
      }
    }

    for (const e of this.list) {
      if (e.dead) this.updateDead(e, dt);
      else this.updateAlive(e, dt, playerPos, playerCovered, ev);
    }
    // separation between live enemies
    for (let i = 0; i < this.list.length; i++) {
      const a = this.list[i];
      if (a.dead) continue;
      for (let j = i + 1; j < this.list.length; j++) {
        const b = this.list[j];
        if (b.dead) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = (min - d) * 0.5;
          a.pos.x -= (dx / d) * push;
          a.pos.z -= (dz / d) * push;
          b.pos.x += (dx / d) * push;
          b.pos.z += (dz / d) * push;
        }
      }
    }
    // keep bodies out of the player's personal space (and the camera)
    for (const e of this.list) {
      if (e.dead) continue;
      const dx = e.pos.x - playerPos.x;
      const dz = e.pos.z - playerPos.z;
      const min = e.radius + 0.6;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min) {
        const d = Math.sqrt(d2) || 1e-3;
        e.pos.x = playerPos.x + (dx / d) * min;
        e.pos.z = playerPos.z + (dz / d) * min;
        this.world.resolveCircle(e.pos, e.radius);
      }
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      if (this.list[i].removed) {
        this.scene.remove(this.list[i].rig.root);
        this.list.splice(i, 1);
      }
    }
    this.updateWriteUps(dt, playerPos, ev);
  }

  private updateAlive(e: Enemy, dt: number, player: THREE.Vector3, playerCovered: () => boolean, ev: EnemyEvents) {
    const rig = e.rig;
    const def = e.def;
    e.attackCd -= dt;
    e.staggerT = Math.max(0, e.staggerT - dt);
    e.slowT = Math.max(0, e.slowT - dt);
    e.attackAnim = Math.max(0, e.attackAnim - dt);
    if (e.windup > 0) {
      e.windup -= dt;
      if (e.windup <= 0 && e.staggerT <= 0) {
        const reach = Math.hypot(player.x - e.pos.x, player.z - e.pos.z);
        if (reach < def.attackRange + 0.45) ev.onPlayerHit(e.damage, e);
      }
    }

    const toP = this.tmp2.set(player.x - e.pos.x, 0, player.z - e.pos.z);
    const dist = toP.length();
    toP.divideScalar(dist || 1);

    let speed = def.speed;
    if (e.boostT > 0) speed *= 1.35;
    if (e.slowT > 0) speed *= e.slowFactor;
    if (e.staggerT > 0) speed *= 0.3;

    // HR keeps their distance and throws write-ups
    let wantMove = dist > def.attackRange * 0.85;
    if (e.type === 'hrRep') {
      const canSee = dist < HR_WRITEUP.range && !this.world.raycast(this.tmp.copy(e.pos).setY(1.4), new THREE.Vector3(player.x, 1.3, player.z));
      if (canSee && dist < HR_WRITEUP.preferredDistance) wantMove = false;
      if (canSee && e.attackCd <= 0 && dist > 2.5) {
        e.attackCd = HR_WRITEUP.throwCooldown;
        e.attackAnim = 0.5;
        this.throwWriteUp(e, player);
        audio.sfx('writeupThrow', { pos: e.pos });
      }
    }

    // CEO: Layoffs
    if (e.type === 'ceo') this.updateCeo(e, dt, playerCovered, ev);

    // steering: direct if clear, else follow the flow field
    const dir = this.tmp.set(0, 0, 0);
    if (wantMove) {
      if (dist < 12 && !this.world.blocked2D(e.pos.x, e.pos.z, player.x, player.z, e.radius * 0.9)) dir.copy(toP);
      else if (!this.world.flowDirection(e.pos, dir)) dir.copy(toP);
    }
    if (e.pulled.lengthSq() > 0) {
      e.pos.addScaledVector(e.pulled, dt);
      e.pulled.set(0, 0, 0);
    }
    if (e.telegraph > 0) speed *= 0.2;
    e.pos.addScaledVector(dir, speed * dt);
    this.world.resolveCircle(e.pos, e.radius);

    // face the player (smoothly)
    const targetYaw = Math.atan2(toP.x, toP.z);
    let dy = targetYaw - rig.root.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    rig.root.rotation.y += dy * Math.min(1, dt * 6);

    // melee
    if (e.type !== 'hrRep' || dist < def.attackRange) {
      if (dist < def.attackRange + 0.2 && e.attackCd <= 0 && e.telegraph <= 0) {
        e.attackCd = def.attackCooldown;
        e.attackAnim = 0.45;
        e.windup = 0.25;
        audio.sfx('enemySwing', { pos: e.pos });
      }
    }

    // ---- animation: stiff corporate walk ----
    const moving = wantMove ? speed / def.speed : 0;
    e.walkPhase += dt * (moving > 0 ? 2.2 + speed * 1.5 : 0);
    const s = Math.sin(e.walkPhase);
    const amp = 0.5 * def.stiffness * Math.min(1, moving + 0.05);
    rig.legL.rotation.x = s * amp;
    rig.legR.rotation.x = -s * amp;
    rig.shinL.rotation.x = Math.max(0, -Math.cos(e.walkPhase)) * amp * 1.1;
    rig.shinR.rotation.x = Math.max(0, Math.cos(e.walkPhase)) * amp * 1.1;
    rig.armL.rotation.x = -s * amp * 0.6;
    rig.armR.rotation.x = s * amp * 0.6;
    rig.armL.rotation.z = -0.06;
    rig.armR.rotation.z = 0.06;
    rig.foreL.rotation.x = -0.18;
    rig.foreR.rotation.x = -0.18;
    rig.body.position.y = Math.abs(Math.cos(e.walkPhase)) * 0.025 * Math.min(1, moving);
    // attack: right arm swings down from overhead / forward
    if (e.attackAnim > 0) {
      const k = e.attackAnim / 0.45;
      rig.armR.rotation.x = -2.6 * Math.sin(k * Math.PI) - 0.2;
      rig.foreR.rotation.x = -0.6 * k;
    }
    // CEO telegraph: both arms raised
    if (e.telegraph > 0) {
      rig.armL.rotation.x = rig.armR.rotation.x = -2.9;
      rig.armL.rotation.z = -0.35;
      rig.armR.rotation.z = 0.35;
    }
    // stagger: lean back from the waist
    rig.torso.rotation.x = -e.staggerT * 1.2 + 0.03;
    rig.torso.rotation.z = Math.sin(e.walkPhase) * 0.02;
    rig.head.rotation.y = Math.sin(e.walkPhase * 0.3) * 0.05;

    rig.root.updateMatrixWorld(true);
    rig.head.getWorldPosition(e.headPos);
    e.headPos.y += 0.12 * def.scale;
  }

  private updateCeo(e: Enemy, dt: number, playerCovered: () => boolean, ev: EnemyEvents) {
    e.sinceArrival += dt;
    if (!e.phase2 && (e.hp < e.maxHp * CEO.phase2HpFraction || e.sinceArrival > CEO.phase2AfterSeconds)) e.phase2 = true;
    if (!e.phase2) return;
    if (e.telegraph > 0) {
      e.telegraph -= dt;
      if (e.telegraph <= 0) {
        e.telegraph = 0;
        this.fx.shockwave(e.pos);
        audio.sfx('shockwave');
        if (!playerCovered()) ev.onShockwave(e);
        e.layoffT = CEO.layoffsInterval;
      }
      return;
    }
    e.layoffT -= dt;
    if (e.layoffT <= CEO.telegraph) {
      e.telegraph = CEO.telegraph;
      audio.sfx('alarm');
      e.layoffT = 999;
    }
  }

  private updateDead(e: Enemy, dt: number) {
    const rig = e.rig;
    e.deathT += dt;
    const k = Math.min(1, e.deathT / 0.75);
    // fall over from the feet, with a little knee buckle first
    const ease = k < 0.25 ? k * 0.4 : 0.1 + (k - 0.25) / 0.75 * 0.9;
    const fall = ease * ease * (Math.PI / 2 - 0.06);
    rig.body.rotation.x = -e.fallDir * fall;
    rig.body.position.y = 0.12 * Math.sin(k * Math.PI) * 0.3;
    rig.legL.rotation.x = rig.legR.rotation.x = 0;
    rig.shinL.rotation.x = rig.shinR.rotation.x = k * 0.3;
    rig.armL.rotation.x = rig.armR.rotation.x = -k * 1.2 * e.fallDir;
    rig.torso.rotation.x = 0;
    if (k >= 1 && !e.pooled) {
      e.pooled = true;
      // pool under the chest
      const along = new THREE.Vector3(Math.sin(rig.root.rotation.y), 0, Math.cos(rig.root.rotation.y)).multiplyScalar(e.fallDir * 0.9 * e.def.scale);
      this.fx.bloodPool(e.pos.clone().add(along));
    }
    if (e.decapitated && e.deathT < 1.6 && Math.random() < 0.5) {
      rig.root.updateMatrixWorld(true);
      rig.stump.getWorldPosition(e.neckPos);
      this.fx.neckSpurt(e.neckPos);
    }
    const fadeStart = GORE.bodyFadeAfter;
    if (e.deathT > fadeStart) {
      const o = 1 - (e.deathT - fadeStart) / GORE.bodyFadeDuration;
      setOpacity(rig.root, Math.max(0, o));
      if (o <= 0) e.removed = true;
    }
  }

  private throwWriteUp(e: Enemy, target: THREE.Vector3) {
    const from = e.pos.clone().setY(1.6 * e.def.scale);
    const to = new THREE.Vector3(target.x, 1.2, target.z);
    const v = to.sub(from).normalize().multiplyScalar(HR_WRITEUP.projectileSpeed);
    const mesh = new THREE.Mesh(this.paperGeo, this.paperMat);
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.writeUps.push({ mesh, v, life: 2.5, from: e });
  }

  private updateWriteUps(dt: number, player: THREE.Vector3, ev: EnemyEvents) {
    for (let i = this.writeUps.length - 1; i >= 0; i--) {
      const w = this.writeUps[i];
      const a = w.mesh.position.clone();
      const b = a.clone().addScaledVector(w.v, dt);
      w.life -= dt;
      w.mesh.rotation.y += dt * 14;
      w.mesh.rotation.x = 0.4;
      let done = w.life <= 0;
      if (!done && this.world.raycast(a, b)) done = true;
      if (!done) {
        const t = segCylinder(a, b.clone().sub(a), player.x, player.z, 0.45, 0, 1.9);
        if (t !== null) {
          done = true;
          ev.onWriteUp(w.from);
        }
      }
      w.mesh.position.copy(b);
      if (done) {
        this.fx.paperBits(b, 6);
        this.scene.remove(w.mesh);
        this.writeUps.splice(i, 1);
      }
    }
  }
}

/** Segment a + t*d (t in 0..1) vs sphere. */
function segSphere(a: THREE.Vector3, d: THREE.Vector3, c: THREE.Vector3, r: number): number | null {
  const mx = a.x - c.x;
  const my = a.y - c.y;
  const mz = a.z - c.z;
  const A = d.x * d.x + d.y * d.y + d.z * d.z;
  const B = mx * d.x + my * d.y + mz * d.z;
  const C = mx * mx + my * my + mz * mz - r * r;
  if (C < 0) return 0;
  const disc = B * B - A * C;
  if (disc < 0 || A < 1e-12) return null;
  const t = (-B - Math.sqrt(disc)) / A;
  return t >= 0 && t <= 1 ? t : null;
}

/** Segment vs vertical cylinder (cx, cz, r) between y0 and y1. */
export function segCylinder(a: THREE.Vector3, d: THREE.Vector3, cx: number, cz: number, r: number, y0: number, y1: number): number | null {
  const mx = a.x - cx;
  const mz = a.z - cz;
  const A = d.x * d.x + d.z * d.z;
  const B = mx * d.x + mz * d.z;
  const C = mx * mx + mz * mz - r * r;
  let t: number;
  if (C < 0) t = 0;
  else {
    if (A < 1e-12) return null;
    const disc = B * B - A * C;
    if (disc < 0) return null;
    t = (-B - Math.sqrt(disc)) / A;
  }
  if (t < 0 || t > 1) return null;
  const y = a.y + d.y * t;
  if (y < y0 || y > y1) return null;
  return t;
}
