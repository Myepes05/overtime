import * as THREE from 'three';
import { WEAPONS, type WeaponDef, type WeaponId } from './config';
import { audio } from './audio';
import type { Effects } from './effects';
import type { Enemies, Enemy } from './enemies';
import type { World } from './world';

export interface WeaponSlot {
  id: WeaponId;
  level: number; // 1..3
  ammo: number;
  reloadT: number;
  cd: number;
  heat: number; // 0..100
  overheated: boolean;
}

export function makeSlot(id: WeaponId, level: number): WeaponSlot {
  return { id, level, ammo: WEAPONS[id].magazine, reloadT: 0, cd: 0, heat: 0, overheated: false };
}

export interface HitReport {
  enemy: Enemy;
  dealt: number;
  head: boolean;
  killed: boolean;
  crit: boolean;
  weapon: WeaponId;
}

interface Projectile {
  mesh: THREE.Object3D;
  v: THREE.Vector3;
  life: number;
  damage: number;
  pierce: number;
  hit: Set<Enemy>;
  weapon: WeaponDef;
  gravity: number;
  spin: number;
}

const SLEEVE = '#BFD3E6'; // neutral light-blue shirt
const CUFF = '#E9EEF3';
const SKIN = '#C99A7A';

const lam = (c: string) => new THREE.MeshLambertMaterial({ color: c });

/** First-person hands + weapon, rendered in their own scene on top of the world. */
class ViewModel {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(55, 1, 0.01, 10);
  private readonly rig = new THREE.Group();
  private readonly right = new THREE.Group();
  private readonly left = new THREE.Group();
  private readonly models: Partial<Record<WeaponId, THREE.Group>> = {};
  private current: WeaponId = 'pencil';
  kick = 0;
  swing = 0;
  hideHeld = 0;
  bob = 0;
  reloadDip = 0;

  constructor() {
    this.scene.add(new THREE.HemisphereLight('#FFFFFF', '#8A919C', 2.2));
    const sun = new THREE.DirectionalLight('#FFFFFF', 1.4);
    sun.position.set(-1, 2, 1);
    this.scene.add(sun);
    this.camera.add(this.rig);

    this.right.add(arm());
    this.right.position.set(0.24, -0.22, -0.4);
    this.right.rotation.set(0.08, 0.12, 0.05);
    this.rig.add(this.right);
    this.left.add(arm());
    this.left.position.set(-0.04, -0.33, -0.47);
    this.left.rotation.set(0.12, -0.5, -0.4);
    this.rig.add(this.left);
    this.scene.add(this.camera);

    for (const id of Object.keys(WEAPONS) as WeaponId[]) {
      const g = buildWeaponModel(id);
      g.visible = false;
      this.right.add(g);
      this.models[id] = g;
    }
    this.show('pencil');
  }

  show(id: WeaponId) {
    this.models[this.current]!.visible = false;
    this.current = id;
    this.models[id]!.visible = true;
    const twoHanded = id === 'stapler' || id === 'tapeGun' || id === 'holePunch' || id === 'laminator' || id === 'shredder';
    this.left.visible = twoHanded;
    this.reloadDip = 0.35; // little raise animation on swap
  }

  update(dt: number, moving: number, time: number, spinning: boolean) {
    this.kick = Math.max(0, this.kick - dt * 6);
    this.swing = Math.max(0, this.swing - dt * 3.2);
    this.hideHeld = Math.max(0, this.hideHeld - dt);
    this.reloadDip = Math.max(0, this.reloadDip - dt);
    this.bob += dt * moving * 9;
    const bx = Math.sin(this.bob) * 0.012 * moving;
    const by = Math.abs(Math.cos(this.bob)) * 0.012 * moving + Math.sin(time * 1.6) * 0.003;
    const dip = Math.sin(Math.min(1, this.reloadDip / 0.35) * Math.PI) * 0.12;
    this.rig.position.set(bx, -by - dip, this.kick * 0.07);
    this.rig.rotation.set(this.kick * 0.22, 0, 0);
    // letter opener swing: arc right-to-left
    if (this.current === 'letterOpener' && this.swing > 0) {
      const k = Math.sin((1 - this.swing) * Math.PI);
      this.right.rotation.set(0.08 - k * 0.6, 0.12 + k * 1.1, 0.05 + k * 0.5);
    } else {
      this.right.rotation.set(0.08, 0.12, 0.05);
    }
    const m = this.models[this.current]!;
    const held = m.getObjectByName('held');
    if (held) held.visible = this.hideHeld <= 0;
    const spinner = m.getObjectByName('spin');
    if (spinner && spinning) spinner.rotation.x += dt * 30;
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    // keep the hands in the bottom-right on portrait / narrow screens too
    this.camera.fov = aspect < 1.3 ? 70 : 55;
    this.camera.updateProjectionMatrix();
  }

  muzzleWorldOffset(): THREE.Vector3 {
    return new THREE.Vector3(0.16, -0.14, -0.5);
  }
}

function arm(): THREE.Group {
  const g = new THREE.Group();
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.07, 0.55, 12), lam(SLEEVE));
  sleeve.rotation.x = Math.PI / 2;
  sleeve.position.set(0, -0.02, 0.3);
  g.add(sleeve);
  const fold = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 12), lam('#AFC4D8'));
  fold.rotation.x = Math.PI / 2;
  fold.position.set(0, -0.02, 0.18);
  g.add(fold);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.054, 0.04, 12), lam(CUFF));
  cuff.rotation.x = Math.PI / 2;
  cuff.position.set(0, -0.02, 0.03);
  g.add(cuff);
  const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.05, 10), lam(SKIN));
  wrist.rotation.x = Math.PI / 2;
  wrist.position.set(0, -0.02, 0.0);
  g.add(wrist);
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.05, 0.1), lam(SKIN));
  hand.position.set(0, -0.015, -0.06);
  g.add(hand);
  const fingers = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.035, 0.05), lam('#B88A6B'));
  fingers.position.set(0.004, -0.04, -0.1);
  fingers.rotation.x = 0.5;
  g.add(fingers);
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.04, 2, 6), lam(SKIN));
  thumb.position.set(-0.04, 0.0, -0.09);
  thumb.rotation.set(Math.PI / 2, 0, 0.4);
  g.add(thumb);
  return g;
}

function buildWeaponModel(id: WeaponId): THREE.Group {
  const g = new THREE.Group();
  const held = new THREE.Group();
  held.name = 'held';
  g.add(held);
  const add = (geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number, parent: THREE.Object3D = held, basic = false) => {
    const m = new THREE.Mesh(geo, basic ? new THREE.MeshBasicMaterial({ color }) : lam(color));
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  switch (id) {
    case 'pencil': {
      const body = add(new THREE.CylinderGeometry(0.011, 0.011, 0.17, 6), '#E0B341', 0, 0, -0.13);
      body.rotation.x = Math.PI / 2;
      const tip = add(new THREE.ConeGeometry(0.011, 0.035, 6), '#E2C69A', 0, 0, -0.232);
      tip.rotation.x = -Math.PI / 2;
      const lead = add(new THREE.ConeGeometry(0.004, 0.012, 6), '#2B2F38', 0, 0, -0.25);
      lead.rotation.x = -Math.PI / 2;
      const ferrule = add(new THREE.CylinderGeometry(0.012, 0.012, 0.016, 8), '#C3C8CF', 0, 0, -0.04);
      ferrule.rotation.x = Math.PI / 2;
      const eraser = add(new THREE.CylinderGeometry(0.011, 0.011, 0.016, 8), '#E39A93', 0, 0, -0.024);
      eraser.rotation.x = Math.PI / 2;
      held.position.set(0.0, -0.02, -0.04);
      held.rotation.set(0.1, 0, 0);
      break;
    }
    case 'rubberBand': {
      const band = add(new THREE.TorusGeometry(0.035, 0.004, 6, 20), '#C9A26B', 0, 0.01, -0.13);
      band.scale.set(0.5, 1, 2.2);
      band.rotation.x = Math.PI / 2;
      const finger = add(new THREE.CapsuleGeometry(0.012, 0.09, 2, 6), SKIN, 0.0, 0.01, -0.15);
      finger.rotation.x = Math.PI / 2;
      break;
    }
    case 'stapler': {
      add(new THREE.BoxGeometry(0.055, 0.025, 0.22), '#2B2F38', 0, -0.03, -0.14);
      const top = add(new THREE.BoxGeometry(0.05, 0.03, 0.2), '#2B2F38', 0, 0.0, -0.15);
      top.rotation.x = -0.06;
      add(new THREE.BoxGeometry(0.052, 0.006, 0.18), '#8A919C', 0, 0.017, -0.15);
      add(new THREE.BoxGeometry(0.03, 0.01, 0.02), '#C3C8CF', 0, -0.015, -0.255);
      break;
    }
    case 'holePunch': {
      add(new THREE.BoxGeometry(0.13, 0.04, 0.1), '#5A606B', 0, -0.03, -0.14);
      add(new THREE.BoxGeometry(0.13, 0.012, 0.11), '#3B3F48', 0, 0.0, -0.145);
      for (const x of [-0.035, 0.035]) {
        const c = add(new THREE.CylinderGeometry(0.012, 0.012, 0.045, 10), '#C3C8CF', x, -0.01, -0.19);
        c.rotation.x = Math.PI / 2;
      }
      break;
    }
    case 'tapeGun': {
      add(new THREE.BoxGeometry(0.03, 0.12, 0.03), '#3E5A6E', 0, -0.06, -0.08);
      add(new THREE.BoxGeometry(0.03, 0.03, 0.2), '#3E5A6E', 0, 0.02, -0.14);
      const roll = add(new THREE.TorusGeometry(0.05, 0.022, 8, 18), '#C8A46A', 0, 0.07, -0.13);
      roll.rotation.y = Math.PI / 2;
      roll.name = 'spin';
      add(new THREE.BoxGeometry(0.06, 0.008, 0.04), '#C3C8CF', 0, 0.02, -0.25);
      break;
    }
    case 'letterOpener': {
      add(new THREE.BoxGeometry(0.02, 0.022, 0.08), '#5C4636', 0, 0, -0.07);
      add(new THREE.BoxGeometry(0.04, 0.01, 0.012), '#8A919C', 0, 0, -0.115);
      const blade = add(new THREE.BoxGeometry(0.016, 0.004, 0.2), '#D3D7DC', 0, 0, -0.22);
      blade.scale.set(1, 1, 1);
      const tip = add(new THREE.ConeGeometry(0.008, 0.03, 4), '#D3D7DC', 0, 0, -0.335);
      tip.rotation.x = -Math.PI / 2;
      held.rotation.set(0.15, 0, 0);
      break;
    }
    case 'laminator': {
      add(new THREE.BoxGeometry(0.24, 0.07, 0.17), '#2B2F38', -0.06, -0.03, -0.17);
      add(new THREE.BoxGeometry(0.2, 0.01, 0.01), '#E8742E', -0.06, 0.0, -0.26, held, true);
      add(new THREE.BoxGeometry(0.03, 0.01, 0.02), '#2F6B3A', 0.03, 0.006, -0.12, held, true);
      break;
    }
    case 'shredder': {
      add(new THREE.BoxGeometry(0.22, 0.15, 0.17), '#1C2230', -0.06, -0.06, -0.18);
      add(new THREE.BoxGeometry(0.2, 0.012, 0.02), '#4B5261', -0.06, 0.02, -0.26);
      const spin = new THREE.Group();
      spin.name = 'spin';
      spin.position.set(-0.06, -0.01, -0.265);
      held.add(spin);
      for (let i = 0; i < 6; i++) {
        const tooth = add(new THREE.BoxGeometry(0.19, 0.008, 0.008), '#8A919C', 0, 0, 0, spin);
        tooth.position.set(0, Math.cos(i) * 0.012, Math.sin(i) * 0.012);
      }
      break;
    }
  }
  return g;
}

function projectileTemplate(id: WeaponId): THREE.Object3D {
  const g = new THREE.Group();
  const mesh = (geo: THREE.BufferGeometry, color: string) => {
    const m = new THREE.Mesh(geo, lam(color));
    g.add(m);
    return m;
  };
  switch (id) {
    case 'pencil': {
      const b = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.19, 6), '#E0B341');
      b.rotation.x = Math.PI / 2;
      const t = mesh(new THREE.ConeGeometry(0.012, 0.04, 6), '#2B2F38');
      t.rotation.x = -Math.PI / 2;
      t.position.z = -0.11;
      break;
    }
    case 'rubberBand': {
      const t = mesh(new THREE.TorusGeometry(0.03, 0.005, 5, 12), '#C9A26B');
      t.scale.set(1, 0.5, 1);
      break;
    }
    case 'stapler':
      mesh(new THREE.BoxGeometry(0.03, 0.006, 0.012), '#D3D7DC');
      break;
    case 'holePunch': {
      const c = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.003, 8), '#F5F3EE');
      c.rotation.x = Math.PI / 2;
      break;
    }
    case 'tapeGun':
      mesh(new THREE.BoxGeometry(0.06, 0.004, 0.12), '#C8A46A');
      break;
    default:
      mesh(new THREE.BoxGeometry(0.02, 0.02, 0.02), '#F5F3EE');
  }
  return g;
}

/** Firing logic for every weapon, projectiles, beam and vortex. */
export class Weapons {
  readonly view = new ViewModel();
  private readonly projectiles: Projectile[] = [];
  private readonly templates = new Map<WeaponId, THREE.Object3D>();
  private readonly beam: THREE.Mesh;
  private tickT = 0;
  firingBeam = false;
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly world: World,
    private readonly enemies: Enemies,
    private readonly fx: Effects,
    private readonly onHit: (h: HitReport) => void,
  ) {
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 1, 6, 1, true),
      new THREE.MeshBasicMaterial({ color: '#E8742E', transparent: true, opacity: 0.85, depthWrite: false }),
    );
    this.beam.visible = false;
    scene.add(this.beam);
  }

  reset() {
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    this.projectiles.length = 0;
    this.beam.visible = false;
  }

  select(slot: WeaponSlot) {
    this.view.show(slot.id);
    slot.cd = Math.max(slot.cd, 0.25);
  }

  reload(slot: WeaponSlot) {
    const def = WEAPONS[slot.id];
    if (def.magazine > 0 && slot.ammo < def.magazine && slot.reloadT <= 0) {
      slot.reloadT = def.reload;
      this.view.reloadDip = 0.35;
      audio.sfx('reload');
    }
  }

  /** Per frame. camera is the world camera. Returns true while "spinning" for vortex viewmodel. */
  update(dt: number, slot: WeaponSlot, firing: boolean, camera: THREE.PerspectiveCamera, moving: number, time: number) {
    const def = WEAPONS[slot.id];
    slot.cd -= dt;
    if (slot.reloadT > 0) {
      slot.reloadT -= dt;
      if (slot.reloadT <= 0) {
        slot.reloadT = 0;
        slot.ammo = def.magazine;
        audio.sfx('reloadDone');
      }
    }
    const lv = slot.level - 1;
    const aim = camera.getWorldDirection(new THREE.Vector3());
    const eye = camera.getWorldPosition(new THREE.Vector3());
    this.firingBeam = false;
    this.beam.visible = false;
    let spinning = false;

    if (def.kind === 'projectile' || def.kind === 'melee') {
      if (firing && slot.cd <= 0 && slot.reloadT <= 0 && (def.magazine === 0 || slot.ammo > 0)) {
        slot.cd = 1 / def.fireRate;
        if (def.magazine > 0) {
          slot.ammo--;
          if (slot.ammo <= 0) this.reload(slot);
        }
        if (def.kind === 'melee') this.melee(def, lv, eye, aim);
        else this.shoot(def, lv, eye, aim, camera);
      }
    } else {
      // heat weapons
      if (slot.overheated) {
        slot.heat -= (def.coolPerSecond ?? 30) * dt;
        if (slot.heat <= 30) slot.overheated = false;
      } else if (firing) {
        slot.heat += (def.heatPerSecond ?? 20) * dt;
        if (slot.heat >= 100) {
          slot.heat = 100;
          slot.overheated = true;
          audio.sfx('overheat');
        }
      } else {
        slot.heat -= (def.coolPerSecond ?? 30) * dt;
      }
      slot.heat = Math.max(0, Math.min(100, slot.heat));
      if (firing && !slot.overheated) {
        this.tickT -= dt;
        const tick = this.tickT <= 0;
        if (tick) this.tickT = 0.1;
        if (def.kind === 'beam') this.beamFire(def, lv, eye, aim, camera, tick);
        else {
          spinning = true;
          this.vortex(def, lv, eye, aim, dt, tick);
        }
        this.view.kick = Math.max(this.view.kick, 0.15 + Math.random() * 0.1);
      }
    }

    audio.setLoop('laminator', this.firingBeam);
    audio.setLoop('shredder', spinning);
    this.updateProjectiles(dt);
    this.view.update(dt, moving, time, spinning);
  }

  private muzzle(camera: THREE.PerspectiveCamera): THREE.Vector3 {
    return camera.localToWorld(this.view.muzzleWorldOffset());
  }

  private shoot(def: WeaponDef, lv: number, eye: THREE.Vector3, aim: THREE.Vector3, camera: THREE.PerspectiveCamera) {
    this.view.kick = def.id === 'holePunch' ? 1 : def.id === 'pencil' ? 0.5 : 0.35;
    if (def.id === 'pencil' || def.id === 'rubberBand' || def.id === 'stapler' || def.id === 'holePunch' || def.id === 'tapeGun') audio.sfx(def.id);
    if (def.id === 'pencil') this.view.hideHeld = 0.22;
    // aim point: whatever the crosshair ray touches first
    const far = eye.clone().addScaledVector(aim, def.range);
    const wh = this.world.raycast(eye, far);
    const eh = this.enemies.raycast(eye, far);
    let t = wh ? wh.t : 1;
    if (eh && eh.t < t) t = eh.t;
    const target = eye.clone().lerp(far, t);
    const muzzle = this.muzzle(camera);
    // close targets: shoot from the eye so we never miss what the crosshair covers
    const from = t * def.range < 2.5 ? eye.clone().addScaledVector(aim, 0.2) : muzzle;
    const baseDir = target.sub(from).normalize();
    for (let i = 0; i < def.pellets; i++) {
      const d = baseDir.clone();
      d.x += (Math.random() - 0.5) * 2 * def.spread;
      d.y += (Math.random() - 0.5) * 2 * def.spread;
      d.z += (Math.random() - 0.5) * 2 * def.spread;
      d.normalize();
      const tpl = this.templates.get(def.id) ?? projectileTemplate(def.id);
      this.templates.set(def.id, tpl);
      const mesh = tpl.clone();
      mesh.position.copy(from);
      mesh.lookAt(from.clone().sub(d));
      this.scene.add(mesh);
      this.projectiles.push({
        mesh,
        v: d.multiplyScalar(def.projectileSpeed * (0.92 + Math.random() * 0.16)),
        life: def.range / def.projectileSpeed + 0.3,
        damage: def.damage[lv],
        pierce: def.pierce[lv],
        hit: new Set(),
        weapon: def,
        gravity: def.gravity,
        spin: def.id === 'rubberBand' || def.id === 'holePunch' ? 20 : 0,
      });
    }
  }

  private updateProjectiles(dt: number) {
    const a = this.tmpA;
    const b = this.tmpB;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.v.y -= p.gravity * dt;
      a.copy(p.mesh.position);
      b.copy(a).addScaledVector(p.v, dt);
      const wh = this.world.raycast(a, b);
      const wt = wh ? wh.t : 1;
      let dead = p.life <= 0 || b.y < 0;
      const eh = this.enemies.raycast(a, b, p.hit);
      if (eh && eh.t <= wt) {
        const at = a.clone().lerp(b, eh.t);
        const dir = p.v.clone().setY(0).normalize();
        const r = this.enemies.damage(eh.enemy, p.damage, p.weapon.id, eh.head, at, dir);
        if (p.weapon.slow) {
          eh.enemy.slowT = p.weapon.slow.duration;
          eh.enemy.slowFactor = p.weapon.slow.factor;
        }
        this.onHit({ enemy: eh.enemy, dealt: r.dealt, head: eh.head, killed: r.killed, crit: false, weapon: p.weapon.id });
        p.hit.add(eh.enemy);
        if (p.pierce > 0) p.pierce--;
        else dead = true;
      } else if (wh) {
        dead = true;
        const at = a.clone().lerp(b, wt);
        if (p.weapon.id === 'holePunch' || p.weapon.id === 'pencil') this.fx.paperBits(at, 2);
        audio.sfx('impact', { pos: at });
      }
      p.mesh.position.copy(b);
      if (p.spin) p.mesh.rotateZ(p.spin * dt);
      if (dead) {
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }

  private melee(def: WeaponDef, lv: number, eye: THREE.Vector3, aim: THREE.Vector3) {
    this.view.swing = 1;
    audio.sfx('swing');
    const flat = aim.clone().setY(0).normalize();
    const targets: Array<{ e: Enemy; d: number }> = [];
    for (const e of this.enemies.list) {
      if (e.dead) continue;
      const to = new THREE.Vector3(e.pos.x - eye.x, 0, e.pos.z - eye.z);
      const d = to.length() - e.radius;
      if (d > def.range) continue;
      if (to.normalize().dot(flat) < 0.6) continue;
      targets.push({ e, d });
    }
    targets.sort((x, y) => x.d - y.d);
    // pierce = how many targets one swing can hit
    for (const { e } of targets.slice(0, Math.max(1, def.pierce[lv]))) {
      const crit = Math.random() < (def.critChance ?? 0);
      // a crit to the face counts as a headshot if the crosshair is on the head
      const headRay = this.enemies.raycast(eye, eye.clone().addScaledVector(aim, def.range + 1));
      const head = !!headRay && headRay.enemy === e && headRay.head;
      const at = head ? e.headPos.clone() : e.pos.clone().setY(1.2 * e.def.scale);
      const dmg = def.damage[lv] * (crit ? def.critMultiplier ?? 2 : 1);
      const r = this.enemies.damage(e, dmg, def.id, head, at, flat);
      audio.sfx('slash');
      this.onHit({ enemy: e, dealt: r.dealt, head, killed: r.killed, crit, weapon: def.id });
    }
  }

  private beamFire(def: WeaponDef, lv: number, eye: THREE.Vector3, aim: THREE.Vector3, camera: THREE.PerspectiveCamera, tick: boolean) {
    this.firingBeam = true;
    const far = eye.clone().addScaledVector(aim, def.range);
    const wh = this.world.raycast(eye, far);
    const eh = this.enemies.raycast(eye, far);
    let t = wh ? wh.t : 1;
    if (eh && eh.t < t) t = eh.t;
    const end = eye.clone().lerp(far, t);
    const start = this.muzzle(camera);
    // draw the beam
    const mid = start.clone().add(end).multiplyScalar(0.5);
    const len = start.distanceTo(end);
    this.beam.position.copy(mid);
    this.beam.scale.set(1, len, 1);
    this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
    this.beam.visible = true;
    (this.beam.material as THREE.MeshBasicMaterial).opacity = 0.65 + Math.random() * 0.3;
    if (tick && eh && (!wh || eh.t <= wh.t)) {
      const r = this.enemies.damage(eh.enemy, def.damage[lv] * 0.1, def.id, eh.head, end, aim.clone().setY(0).normalize());
      this.onHit({ enemy: eh.enemy, dealt: r.dealt, head: eh.head, killed: r.killed, crit: false, weapon: def.id });
    }
  }

  private vortex(def: WeaponDef, lv: number, eye: THREE.Vector3, aim: THREE.Vector3, dt: number, tick: boolean) {
    const flat = aim.clone().setY(0).normalize();
    if (Math.random() < dt * 30) this.fx.paperBits(eye.clone().addScaledVector(aim, 0.8).setY(1.2), 1);
    for (const e of this.enemies.list) {
      if (e.dead) continue;
      const to = new THREE.Vector3(e.pos.x - eye.x, 0, e.pos.z - eye.z);
      const d = to.length();
      if (d > def.range) continue;
      to.normalize();
      if (to.dot(flat) < 0.45) continue;
      if (e.type !== 'ceo') e.pulled.copy(to).multiplyScalar(-(def.pull ?? 4));
      if (tick && d < 2.5 + e.radius) {
        const r = this.enemies.damage(e, def.damage[lv] * 0.1, def.id, false, e.pos.clone().setY(1.0 * e.def.scale), to.clone().negate());
        this.onHit({ enemy: e, dealt: r.dealt, head: false, killed: r.killed, crit: false, weapon: def.id });
      }
    }
  }
}
