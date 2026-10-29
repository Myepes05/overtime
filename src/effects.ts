import * as THREE from 'three';
import { GORE } from './config';
import type { World } from './world';

const BLOOD_A = new THREE.Color('#6E0A0E');
const BLOOD_B = new THREE.Color('#85121A');

interface Particle {
  alive: boolean;
  p: THREE.Vector3;
  v: THREE.Vector3;
  life: number;
  size: number;
  paper: boolean;
}

interface Decal {
  mesh: THREE.Mesh;
  grow: number; // seconds of remaining growth
  target: number;
}

interface FlyingHead {
  obj: THREE.Object3D;
  v: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  neck: THREE.Vector3;
  bleed: number;
  rest: boolean;
}

/** Blood bursts, floor/wall decals, pools, detached heads and the CEO shockwave ring. */
export class Effects {
  private readonly particles: Particle[] = [];
  private readonly inst: THREE.InstancedMesh;
  private readonly decals: Decal[] = [];
  private decalCursor = 0;
  private readonly heads: FlyingHead[] = [];
  private readonly splatTex: THREE.Texture[];
  private readonly poolTex: THREE.Texture;
  private readonly dummy = new THREE.Object3D();
  private readonly ring: THREE.Mesh;
  private ringT = -1;
  private ringOrigin = new THREE.Vector3();
  private readonly paperColor = new THREE.Color('#F5F3EE');

  constructor(private readonly scene: THREE.Scene, private readonly world: World) {
    this.inst = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: '#FFFFFF' }),
      GORE.maxParticles,
    );
    this.inst.frustumCulled = false;
    this.inst.count = 0;
    scene.add(this.inst);
    for (let i = 0; i < GORE.maxParticles; i++) {
      this.particles.push({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, size: 0.03, paper: false });
      this.inst.setColorAt(i, BLOOD_A);
    }
    this.splatTex = [makeSplat('#6E0A0E', 11), makeSplat('#85121A', 23), makeSplat('#6E0A0E', 37)];
    this.poolTex = makePool();
    const decalGeo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < GORE.maxDecals; i++) {
      const m = new THREE.Mesh(
        decalGeo,
        new THREE.MeshLambertMaterial({
          map: this.splatTex[0],
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        }),
      );
      m.visible = false;
      m.renderOrder = 1;
      scene.add(m);
      this.decals.push({ mesh: m, grow: 0, target: 1 });
    }
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.92, 1, 64),
      new THREE.MeshBasicMaterial({ color: '#F5F3EE', transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    scene.add(this.ring);
  }

  reset() {
    for (const p of this.particles) p.alive = false;
    for (const d of this.decals) d.mesh.visible = false;
    for (const h of this.heads) this.scene.remove(h.obj);
    this.heads.length = 0;
    this.ringT = -1;
    this.ring.visible = false;
  }

  private spawnParticle(pos: THREE.Vector3, vel: THREE.Vector3, size: number, paper = false) {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.alive) continue;
      p.alive = true;
      p.p.copy(pos);
      p.v.copy(vel);
      p.life = 1.4;
      p.size = size;
      p.paper = paper;
      this.inst.setColorAt(i, paper ? this.paperColor : Math.random() < 0.5 ? BLOOD_A : BLOOD_B);
      return;
    }
  }

  /** Blood burst at a hit point, spraying along dir; may paint the wall behind. */
  bloodBurst(pos: THREE.Vector3, dir: THREE.Vector3, count = GORE.hitParticles, force = 1) {
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      v.set(dir.x * 2.5 + (Math.random() - 0.5) * 3, 1 + Math.random() * 2.5, dir.z * 2.5 + (Math.random() - 0.5) * 3).multiplyScalar(force);
      this.spawnParticle(pos, v, 0.025 + Math.random() * 0.04);
    }
    // spatter on a wall/partition behind the target
    const end = pos.clone().addScaledVector(dir, 3.2);
    end.y -= 0.4;
    const hit = this.world.raycast(pos, end);
    if (hit && hit.normal.y === 0) {
      const at = pos.clone().lerp(end, hit.t).addScaledVector(hit.normal, 0.012);
      this.placeDecal(at, hit.normal, 0.5 + Math.random() * 0.6 * force);
    } else if (Math.random() < 0.6) {
      const at = pos.clone().addScaledVector(dir, 0.6 + Math.random());
      at.y = 0;
      this.placeDecal(at, new THREE.Vector3(0, 1, 0), 0.3 + Math.random() * 0.5);
    }
  }

  paperBits(pos: THREE.Vector3, count: number) {
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      v.set((Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3);
      this.spawnParticle(pos, v, 0.03, true);
    }
  }

  placeDecal(at: THREE.Vector3, normal: THREE.Vector3, size: number, pool = false): Decal {
    const d = this.decals[this.decalCursor];
    this.decalCursor = (this.decalCursor + 1) % this.decals.length;
    const m = d.mesh;
    const material = m.material as THREE.MeshLambertMaterial;
    material.map = pool ? this.poolTex : this.splatTex[(Math.random() * this.splatTex.length) | 0];
    material.opacity = pool ? 0.95 : 0.9;
    material.needsUpdate = true;
    m.position.copy(at);
    if (normal.y > 0.5) {
      m.position.y = 0.006 + Math.random() * 0.004;
      m.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2);
    } else {
      m.rotation.set(0, Math.atan2(normal.x, normal.z), Math.random() * Math.PI * 2);
    }
    m.visible = true;
    if (pool) {
      d.grow = 3;
      d.target = size;
      m.scale.setScalar(0.05);
    } else {
      d.grow = 0;
      m.scale.setScalar(size);
    }
    return d;
  }

  bloodPool(at: THREE.Vector3) {
    const [a, b] = GORE.poolSize;
    this.placeDecal(new THREE.Vector3(at.x, 0, at.z), new THREE.Vector3(0, 1, 0), a + Math.random() * (b - a), true);
  }

  /** Detach a head: the object is reparented to the scene and tumbles. */
  launchHead(head: THREE.Object3D, dir: THREE.Vector3) {
    const wp = new THREE.Vector3();
    const wq = new THREE.Quaternion();
    const ws = new THREE.Vector3();
    head.getWorldPosition(wp);
    head.getWorldQuaternion(wq);
    head.getWorldScale(ws);
    head.removeFromParent();
    head.position.copy(wp);
    head.quaternion.copy(wq);
    head.scale.copy(ws);
    this.scene.add(head);
    this.heads.push({
      obj: head,
      v: new THREE.Vector3(dir.x * 3.2 + (Math.random() - 0.5), 2.6 + Math.random(), dir.z * 3.2 + (Math.random() - 0.5)),
      spin: new THREE.Vector3(Math.random() * 10 - 5, Math.random() * 6 - 3, Math.random() * 10 - 5),
      life: GORE.bodyFadeAfter + GORE.bodyFadeDuration,
      neck: wp.clone(),
      bleed: 1.2,
      rest: false,
    });
    this.bloodBurst(wp, dir, GORE.killParticles, 1.3);
  }

  /** Neck fountain for a decapitated body. */
  neckSpurt(pos: THREE.Vector3) {
    const v = new THREE.Vector3((Math.random() - 0.5) * 1.2, 2 + Math.random() * 2, (Math.random() - 0.5) * 1.2);
    this.spawnParticle(pos, v, 0.03 + Math.random() * 0.03);
  }

  shockwave(origin: THREE.Vector3) {
    this.ringOrigin.copy(origin);
    this.ringT = 0;
    this.ring.visible = true;
  }

  update(dt: number) {
    // particles
    let n = 0;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.alive) continue;
      p.life -= dt;
      p.v.y -= (p.paper ? 4 : 9.8) * dt;
      if (p.paper) p.v.multiplyScalar(1 - 2 * dt);
      p.p.addScaledVector(p.v, dt);
      if (p.p.y <= 0.01) {
        p.alive = false;
        if (!p.paper && Math.random() < 0.12) {
          this.placeDecal(new THREE.Vector3(p.p.x, 0, p.p.z), new THREE.Vector3(0, 1, 0), 0.12 + Math.random() * 0.2);
        }
        continue;
      }
      if (p.life <= 0) {
        p.alive = false;
        continue;
      }
      this.dummy.position.copy(p.p);
      this.dummy.scale.setScalar(p.size);
      this.dummy.rotation.set(p.life * 5, p.life * 3, 0);
      this.dummy.updateMatrix();
      this.inst.setMatrixAt(n, this.dummy.matrix);
      if (this.inst.instanceColor) {
        const c = p.paper ? this.paperColor : (i & 1 ? BLOOD_A : BLOOD_B);
        this.inst.setColorAt(n, c);
      }
      n++;
    }
    this.inst.count = n;
    this.inst.instanceMatrix.needsUpdate = true;
    if (this.inst.instanceColor) this.inst.instanceColor.needsUpdate = true;

    // growing pools
    for (const d of this.decals) {
      if (d.grow <= 0 || !d.mesh.visible) continue;
      d.grow -= dt;
      const k = 1 - Math.max(0, d.grow) / 3;
      d.mesh.scale.setScalar(0.05 + (d.target - 0.05) * (1 - (1 - k) * (1 - k)));
    }

    // heads
    for (let i = this.heads.length - 1; i >= 0; i--) {
      const h = this.heads[i];
      h.life -= dt;
      if (h.bleed > 0) {
        h.bleed -= dt;
        if (Math.random() < 0.6) this.neckSpurt(h.neck);
      }
      if (!h.rest) {
        h.v.y -= 9.8 * dt;
        h.obj.position.addScaledVector(h.v, dt);
        h.obj.rotation.x += h.spin.x * dt;
        h.obj.rotation.y += h.spin.y * dt;
        h.obj.rotation.z += h.spin.z * dt;
        if (h.obj.position.y < 0.12) {
          h.obj.position.y = 0.12;
          if (Math.abs(h.v.y) < 1.2) {
            h.rest = true;
            this.placeDecal(new THREE.Vector3(h.obj.position.x, 0, h.obj.position.z), new THREE.Vector3(0, 1, 0), 0.45);
          } else {
            h.v.y *= -0.35;
            h.v.x *= 0.6;
            h.v.z *= 0.6;
            h.spin.multiplyScalar(0.5);
          }
        }
        // keep it inside the room
        const b = this.world.bounds;
        h.obj.position.x = Math.max(-b.halfW + 0.2, Math.min(b.halfW - 0.2, h.obj.position.x));
        h.obj.position.z = Math.max(-b.halfD + 0.2, Math.min(b.halfD - 0.2, h.obj.position.z));
      }
      if (h.life < GORE.bodyFadeDuration) setOpacity(h.obj, Math.max(0, h.life / GORE.bodyFadeDuration));
      if (h.life <= 0) {
        this.scene.remove(h.obj);
        this.heads.splice(i, 1);
      }
    }

    // shockwave ring
    if (this.ringT >= 0) {
      this.ringT += dt;
      const k = this.ringT / 0.9;
      if (k >= 1) {
        this.ringT = -1;
        this.ring.visible = false;
      } else {
        const r = 0.5 + k * 30;
        this.ring.scale.set(r, r, 1);
        this.ring.position.set(this.ringOrigin.x, 0.3, this.ringOrigin.z);
        (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.75 * (1 - k);
      }
    }
  }
}

export function setOpacity(obj: THREE.Object3D, o: number) {
  obj.traverse((c) => {
    const m = (c as THREE.Mesh).material as THREE.Material | undefined;
    if (!m || Array.isArray(m)) return;
    if (!m.transparent) {
      m.transparent = true;
      m.needsUpdate = true;
    }
    m.opacity = o;
  });
}

function makeSplat(color: string, seed: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.fillStyle = color;
  g.beginPath();
  g.arc(64, 64, 26, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 18; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 20 + rnd() * 38;
    const r = 3 + rnd() * 10 * (1 - d / 70);
    g.beginPath();
    g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, Math.max(1.5, r), 0, Math.PI * 2);
    g.fill();
    // streak toward centre
    g.lineWidth = Math.max(1, r * 0.8);
    g.strokeStyle = color;
    g.beginPath();
    g.moveTo(64 + Math.cos(a) * 22, 64 + Math.sin(a) * 22);
    g.lineTo(64 + Math.cos(a) * d, 64 + Math.sin(a) * d);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makePool(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#6E0A0E';
  g.beginPath();
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r = 50 + Math.sin(i * 2.3) * 6 + Math.cos(i * 1.7) * 5;
    const x = 64 + Math.cos(a) * r;
    const y = 64 + Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.fill();
  g.fillStyle = '#85121A';
  g.beginPath();
  g.ellipse(58, 58, 26, 20, 0.4, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
