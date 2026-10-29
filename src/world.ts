import * as THREE from 'three';

/** Axis-aligned box used for both movement and line-of-sight / projectile blocking. */
export interface Box {
  minX: number; maxX: number;
  minY: number; maxY: number;
  minZ: number; maxZ: number;
}

export interface RayHit {
  t: number; // 0..1 along the segment
  normal: THREE.Vector3;
}

const HALF_W = 20;
const HALF_D = 14;
const WALL_H = 3;
const CELL = 0.5;

const mat = (color: string) => new THREE.MeshLambertMaterial({ color });

export class World {
  readonly group = new THREE.Group();
  /** Footprints that stop movement (walls, whole desk pods, tables). */
  readonly solids: Box[] = [];
  /** 3D boxes that stop projectiles and sight lines (walls, desks, partitions). */
  readonly blockers: Box[] = [];
  readonly spawnPoints: THREE.Vector3[] = [];
  readonly ceoSpawn = new THREE.Vector3(15, 0, -12.6);
  readonly playerStart = new THREE.Vector3(0, 0, -2.5);
  readonly closetDoor = new THREE.Vector3(-19.6, 0, -2);
  readonly bounds = { halfW: HALF_W, halfD: HALF_D };

  // navigation grid
  readonly gw = Math.round((HALF_W * 2) / CELL);
  readonly gd = Math.round((HALF_D * 2) / CELL);
  private blocked: Uint8Array;
  private dist: Uint16Array;
  private queue: Int32Array;

  constructor(private readonly shadows: boolean) {
    this.blocked = new Uint8Array(this.gw * this.gd);
    this.dist = new Uint16Array(this.gw * this.gd);
    this.queue = new Int32Array(this.gw * this.gd);
    this.build();
    this.buildNav();
  }

  // ---------- construction ----------

  private box(w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, cast = true): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y + h / 2, z);
    if (this.shadows) {
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
    }
    this.group.add(mesh);
    return mesh;
  }

  private addBlocker(cx: number, cz: number, w: number, d: number, minY: number, maxY: number) {
    this.blockers.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, minY, maxY });
  }

  private addSolid(cx: number, cz: number, w: number, d: number, h = WALL_H) {
    this.solids.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, minY: 0, maxY: h });
  }

  private build() {
    const wallM = mat('#D3D7DC');
    const wallM2 = mat('#DADDE2');
    const trim = mat('#A9AFB8');
    const dark = mat('#2B2F38');

    // floor with a subtle carpet tile texture
    const floorTex = makeCarpetTexture();
    floorTex.repeat.set(HALF_W, HALF_D);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF_W * 2, HALF_D * 2),
      new THREE.MeshLambertMaterial({ map: floorTex }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = this.shadows;
    this.group.add(floor);

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, HALF_D * 2), new THREE.MeshBasicMaterial({ color: '#E6E8EA' }));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = WALL_H;
    this.group.add(ceiling);

    // ceiling light panels
    const panelM = new THREE.MeshBasicMaterial({ color: '#FFFFFF' });
    const panelGeo = new THREE.PlaneGeometry(1.2, 0.6);
    for (let x = -16; x <= 16; x += 4) {
      for (let z = -11; z <= 11; z += 4.4) {
        const p = new THREE.Mesh(panelGeo, panelM);
        p.rotation.x = Math.PI / 2;
        p.position.set(x, WALL_H - 0.01, z);
        this.group.add(p);
      }
    }

    // outside: sky + skyline (seen through the windows)
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(200, 60), new THREE.MeshBasicMaterial({ color: '#CFDCE6' }));
    sky.position.set(0, 10, -60);
    this.group.add(sky);
    const sky2 = sky.clone();
    sky2.rotation.y = -Math.PI / 2;
    sky2.position.set(60, 10, 0);
    this.group.add(sky2);
    const cityM = new THREE.MeshBasicMaterial({ color: '#AEBCC9' });
    const cityM2 = new THREE.MeshBasicMaterial({ color: '#B9C6D1' });
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i++) {
      const h = 6 + rnd() * 26;
      const b = new THREE.Mesh(new THREE.BoxGeometry(5 + rnd() * 6, h, 5), i % 2 ? cityM : cityM2);
      b.position.set(-60 + i * 4.8, h / 2 - 12, -40 - rnd() * 12);
      this.group.add(b);
      const b2 = b.clone();
      b2.position.set(40 + rnd() * 12, h / 2 - 12, -50 + i * 4);
      this.group.add(b2);
    }

    // ---- perimeter walls ----
    // north (z = -HALF_D): window wall
    this.windowWall('north', wallM, dark);
    // east (x = HALF_W): window wall from z -12 to 2, then solid with an elevator door
    this.windowWall('east', wallM2, dark);
    // south: solid with two doors
    this.box(HALF_W * 2, WALL_H, 0.3, 0, 0, HALF_D + 0.15, wallM2, false);
    // west: solid with closet + one spawn door
    this.box(0.3, WALL_H, HALF_D * 2, -HALF_W - 0.15, 0, 0, wallM, false);
    // skirting
    this.box(HALF_W * 2, 0.1, 0.04, 0, 0, HALF_D - 0.02, trim, false);
    this.box(0.04, 0.1, HALF_D * 2, -HALF_W + 0.02, 0, 0, trim, false);

    // perimeter colliders
    for (const b of [
      { cx: 0, cz: -HALF_D - 0.5, w: HALF_W * 2 + 2, d: 1 },
      { cx: 0, cz: HALF_D + 0.5, w: HALF_W * 2 + 2, d: 1 },
      { cx: -HALF_W - 0.5, cz: 0, w: 1, d: HALF_D * 2 + 2 },
      { cx: HALF_W + 0.5, cz: 0, w: 1, d: HALF_D * 2 + 2 },
    ]) {
      this.addSolid(b.cx, b.cz, b.w, b.d);
      this.addBlocker(b.cx, b.cz, b.w, b.d, -1, WALL_H + 1);
    }

    // ---- doors (spawn points) ----
    const doors: Array<{ x: number; z: number; ry: number }> = [
      { x: -16, z: -HALF_D, ry: 0 },
      { x: -6, z: HALF_D, ry: Math.PI },
      { x: 10, z: HALF_D, ry: Math.PI },
      { x: HALF_W, z: 8, ry: -Math.PI / 2 },
      { x: -HALF_W, z: 9, ry: Math.PI / 2 },
    ];
    for (const d of doors) {
      this.door(d.x, d.z, d.ry, '#5E6676', false);
      const inward = new THREE.Vector3(Math.sin(d.ry), 0, Math.cos(d.ry));
      this.spawnPoints.push(new THREE.Vector3(d.x, 0, d.z).addScaledVector(inward, 1.2));
    }
    // supply closet door (west wall), with a sign
    this.door(-HALF_W, -2, Math.PI / 2, '#3E5A6E', true);

    // ---- desk pods (cover) ----
    const podXs = [-13, -6.5, 0, 6.5];
    const podZs = [-9, -2.5, 4, 10];
    for (const x of podXs) {
      for (const z of podZs) {
        if (x === 0 && z === -2.5) continue; // open space where the shift starts
        if (x === -13 && z === -2.5) continue; // aisle to the supply closet
        this.deskPod(x, z);
      }
    }

    // ---- boardroom (north-east corner) ----
    this.boardroom();

    // ---- props ----
    this.plant(-19, -13);
    this.plant(-19, 13);
    this.plant(9, 13);
    this.plant(3, -13.2);
    this.printer(-19.2, 4.5);
    this.printer(3, 13.3);
    this.waterCooler(-19.3, -4.4);
  }

  private windowWall(side: 'north' | 'east', wallM: THREE.Material, mullionM: THREE.Material) {
    const glass = new THREE.MeshBasicMaterial({ color: '#D6E4EE', transparent: true, opacity: 0.28, depthWrite: false });
    const sill = 0.9;
    const head = 2.55;
    if (side === 'north') {
      const z = -HALF_D - 0.15;
      this.box(HALF_W * 2, sill, 0.3, 0, 0, z, wallM, false);
      this.box(HALF_W * 2, WALL_H - head, 0.3, 0, head, z, wallM, false);
      for (let x = -HALF_W; x <= HALF_W; x += 2.5) this.box(0.12, head - sill, 0.32, x, sill, z, mullionM, false);
      const g = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, head - sill), glass);
      g.position.set(0, (sill + head) / 2, z);
      this.group.add(g);
    } else {
      const x = HALF_W + 0.15;
      // windows z -14..2, solid z 2..14 (elevator lobby door lives there)
      const wz0 = -HALF_D;
      const wz1 = 2;
      const wl = wz1 - wz0;
      const wc = (wz0 + wz1) / 2;
      this.box(0.3, sill, wl, x, 0, wc, wallM, false);
      this.box(0.3, WALL_H - head, wl, x, head, wc, wallM, false);
      for (let z = wz0; z <= wz1; z += 2.5) this.box(0.32, head - sill, 0.12, x, sill, z, mullionM, false);
      const g = new THREE.Mesh(new THREE.PlaneGeometry(wl, head - sill), glass);
      g.rotation.y = -Math.PI / 2;
      g.position.set(x, (sill + head) / 2, wc);
      this.group.add(g);
      this.box(0.3, WALL_H, HALF_D - wz1, x, 0, (wz1 + HALF_D) / 2, wallM, false);
    }
  }

  private door(x: number, z: number, ry: number, color: string, closet: boolean) {
    const g = new THREE.Group();
    const frame = mat('#2B2F38');
    const panel = mat(color);
    const add = (w: number, h: number, d: number, px: number, py: number, pz: number, m: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(px, py, pz);
      g.add(mesh);
    };
    add(1.3, 0.1, 0.12, 0, 2.2, 0.02, frame);
    add(0.1, 2.25, 0.12, -0.6, 1.1, 0.02, frame);
    add(0.1, 2.25, 0.12, 0.6, 1.1, 0.02, frame);
    add(1.1, 2.15, 0.05, 0, 1.075, 0.01, panel);
    add(0.04, 0.04, 0.14, 0.42, 1.05, 0.06, mat('#C3C8CF'));
    if (closet) {
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.22),
        new THREE.MeshBasicMaterial({ map: makeSignTexture('SUPPLY CLOSET') }),
      );
      sign.position.set(0, 1.75, 0.04);
      g.add(sign);
    } else {
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(0.42, 0.14),
        new THREE.MeshBasicMaterial({ map: makeSignTexture('EXIT') }),
      );
      sign.position.set(0, 2.45, 0.04);
      g.add(sign);
    }
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    this.group.add(g);
  }

  private deskPod(cx: number, cz: number) {
    const top = mat('#E2DCCF');
    const leg = mat('#8A919C');
    const part = mat('#A9AFB8');
    const partFrame = mat('#C3C8CF');
    const screen = mat('#2B2F38');
    const screenFace = new THREE.MeshBasicMaterial({ color: '#D6E4EE' });
    const chair = mat('#2B2F38');
    const W = 3.4; // two desks side by side
    const D = 1.8; // two desks back to back
    const deskH = 0.75;
    const partH = 1.25;
    // desk tops (two rows) + legs
    for (const side of [-1, 1]) {
      const z = cz + side * (D / 4);
      this.box(W, 0.05, D / 2 - 0.04, cx, deskH - 0.05, z, top);
      for (const lx of [-W / 2 + 0.06, 0, W / 2 - 0.06]) this.box(0.05, deskH - 0.05, D / 2 - 0.15, cx + lx, 0, z, leg);
      // monitors + keyboards facing outward
      for (const mx of [-W / 4, W / 4]) {
        const m = this.box(0.55, 0.34, 0.04, cx + mx, deskH + 0.12, cz + side * 0.2, screen);
        const face = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.29), screenFace);
        face.position.set(0, 0, side * 0.021);
        if (side < 0) face.rotation.y = Math.PI;
        m.add(face);
        this.box(0.06, 0.12, 0.06, cx + mx, deskH, cz + side * 0.2, screen);
        this.box(0.42, 0.02, 0.14, cx + mx, deskH, cz + side * 0.55, mat('#3B3F48'));
        // office chair
        const chx = cx + mx;
        const chz = cz + side * (D / 2 + 0.45);
        this.box(0.48, 0.08, 0.46, chx, 0.45, chz, chair);
        this.box(0.46, 0.5, 0.07, chx, 0.55, chz + side * 0.22, chair);
        this.box(0.05, 0.42, 0.05, chx, 0.03, chz, leg);
        this.box(0.5, 0.04, 0.05, chx, 0.02, chz, leg);
        this.box(0.05, 0.04, 0.5, chx, 0.02, chz, leg);
      }
    }
    // partitions: centre spine + two ends
    this.box(W + 0.1, partH, 0.06, cx, 0, cz, part);
    this.box(W + 0.12, 0.04, 0.08, cx, partH, cz, partFrame);
    for (const ex of [-1, 1]) {
      this.box(0.06, partH, D, cx + ex * (W / 2 + 0.05), 0, cz, part);
      this.box(0.08, 0.04, D + 0.02, cx + ex * (W / 2 + 0.05), partH, cz, partFrame);
    }

    // movement: the whole pod (desks + chairs zone stays walkable around)
    this.addSolid(cx, cz, W + 0.2, D + 0.1, partH);
    // shots / sight: desk tops (low) and partitions (high)
    this.addBlocker(cx, cz, W, D, 0, deskH);
    this.addBlocker(cx, cz, W + 0.1, 0.08, 0, partH);
    this.addBlocker(cx - (W / 2 + 0.05), cz, 0.08, D, 0, partH);
    this.addBlocker(cx + (W / 2 + 0.05), cz, 0.08, D, 0, partH);
  }

  private boardroom() {
    const glass = new THREE.MeshBasicMaterial({ color: '#C9D8E3', transparent: true, opacity: 0.22, depthWrite: false });
    const band = mat('#D9D6CE');
    const frame = mat('#4B5261');
    const x0 = 10;
    const z1 = -5;
    // carpet patch (darker wood-look floor)
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W - x0, z1 + HALF_D), mat('#5C4636'));
    fl.rotation.x = -Math.PI / 2;
    fl.position.set((x0 + HALF_W) / 2, 0.004, (z1 - HALF_D) / 2);
    fl.receiveShadow = this.shadows;
    this.group.add(fl);
    // glass walls with gaps: along z = z1 (x 10..20, gap 13..15.5); along x = x0 (z -14..-5, gap -10.5..-8)
    const glassSeg = (ax: number, az: number, bx: number, bz: number) => {
      const len = Math.hypot(bx - ax, bz - az);
      const cx = (ax + bx) / 2;
      const cz = (az + bz) / 2;
      const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
      const g = new THREE.Mesh(new THREE.BoxGeometry(alongX ? len : 0.04, WALL_H, alongX ? 0.04 : len), glass);
      g.position.set(cx, WALL_H / 2, cz);
      this.group.add(g);
      this.box(alongX ? len : 0.05, 0.2, alongX ? 0.05 : len, cx, 1.0, cz, band, false);
      this.box(alongX ? len : 0.08, 0.06, alongX ? 0.08 : len, cx, 0, cz, frame, false);
      this.box(alongX ? len : 0.08, 0.06, alongX ? 0.08 : len, cx, WALL_H - 0.06, cz, frame, false);
      const w = alongX ? len : 0.12;
      const d = alongX ? 0.12 : len;
      this.addSolid(cx, cz, w, d);
      this.addBlocker(cx, cz, w, d, 0, WALL_H);
    };
    glassSeg(x0, z1, 13, z1);
    glassSeg(15.5, z1, HALF_W, z1);
    glassSeg(x0, -HALF_D, x0, -10.5);
    glassSeg(x0, -8, x0, z1);

    // long boardroom table — the cover for the CEO fight
    const tx = 15;
    const tz = -9.5;
    const tw = 5.2;
    const td = 1.6;
    this.box(tw, 0.07, td, tx, 0.7, tz, mat('#4A3A2E'));
    this.box(tw - 0.6, 0.7, 0.1, tx, 0, tz, mat('#2B2F38'));
    for (const ex of [-1, 1]) this.box(0.1, 0.7, td - 0.3, tx + ex * (tw / 2 - 0.4), 0, tz, mat('#2B2F38'));
    for (let i = -2; i <= 2; i++) {
      for (const side of [-1, 1]) {
        const ch = mat('#1C2230');
        this.box(0.5, 0.08, 0.5, tx + i * 1.0, 0.46, tz + side * 1.2, ch);
        this.box(0.5, 0.6, 0.07, tx + i * 1.0, 0.5, tz + side * 1.45, ch);
      }
    }
    this.addSolid(tx, tz, tw + 0.1, td + 0.1, 0.78);
    this.addBlocker(tx, tz, tw, td, 0, 0.77);
    // a screen on the wall
    const scr = this.box(3.2, 1.6, 0.06, tx, 1.1, -HALF_D + 0.05, mat('#1C2230'), false);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.45), new THREE.MeshBasicMaterial({ map: makeSignTexture('Q4 · HEADCOUNT −30%', '#F5F3EE', '#C7361F') }));
    face.position.z = 0.035;
    scr.add(face);
  }

  private plant(x: number, z: number) {
    this.box(0.5, 0.5, 0.5, x, 0, z, mat('#4B5261'));
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), mat('#2F6B3A'));
    leaves.position.set(x, 1.05, z);
    leaves.scale.set(1, 1.3, 1);
    if (this.shadows) leaves.castShadow = true;
    this.group.add(leaves);
    this.addSolid(x, z, 0.6, 0.6, 1.5);
    this.addBlocker(x, z, 0.5, 0.5, 0, 0.5);
  }

  private printer(x: number, z: number) {
    this.box(0.9, 0.95, 0.65, x, 0, z, mat('#C3C8CF'));
    this.box(0.7, 0.12, 0.5, x, 0.95, z, mat('#5A606B'));
    this.addSolid(x, z, 1, 0.75, 1.1);
    this.addBlocker(x, z, 0.9, 0.65, 0, 1.07);
  }

  private waterCooler(x: number, z: number) {
    this.box(0.36, 1.0, 0.36, x, 0, z, mat('#F5F3EE'));
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.42, 12), new THREE.MeshLambertMaterial({ color: '#9EC3DA', transparent: true, opacity: 0.8 }));
    bottle.position.set(x, 1.21, z);
    this.group.add(bottle);
    this.addSolid(x, z, 0.45, 0.45, 1.4);
  }

  // ---------- collision ----------

  /** Push a circle (XZ) out of every solid. Mutates pos. */
  resolveCircle(pos: THREE.Vector3, r: number) {
    for (let pass = 0; pass < 2; pass++) {
      for (const b of this.solids) {
        const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
        const dx = pos.x - cx;
        const dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          pos.x = cx + (dx / d) * r;
          pos.z = cz + (dz / d) * r;
        } else {
          // centre inside the box: push out along the shallowest axis
          const left = pos.x - b.minX;
          const right = b.maxX - pos.x;
          const near = pos.z - b.minZ;
          const far = b.maxZ - pos.z;
          const m = Math.min(left, right, near, far);
          if (m === left) pos.x = b.minX - r;
          else if (m === right) pos.x = b.maxX + r;
          else if (m === near) pos.z = b.minZ - r;
          else pos.z = b.maxZ + r;
        }
      }
    }
  }

  /** First blocker hit along segment a→b, or null. */
  raycast(a: THREE.Vector3, b: THREE.Vector3, minTopY = -Infinity): RayHit | null {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    let best: RayHit | null = null;
    let bestT = 1;
    for (const box of this.blockers) {
      if (box.maxY < minTopY) continue;
      const r = slab(a.x, a.y, a.z, dx, dy, dz, box);
      if (r !== null && r.t < bestT) {
        bestT = r.t;
        best = r;
      }
    }
    return best;
  }

  /** True if the 2D line between the two points crosses a movement solid (inflated by r). */
  blocked2D(ax: number, az: number, bx: number, bz: number, r: number): boolean {
    const dx = bx - ax;
    const dz = bz - az;
    for (const s of this.solids) {
      const box: Box = { minX: s.minX - r, maxX: s.maxX + r, minY: -1, maxY: 1, minZ: s.minZ - r, maxZ: s.maxZ + r };
      if (slab(ax, 0, az, dx, 0, dz, box)) return true;
    }
    return false;
  }

  // ---------- navigation (flow field toward the player) ----------

  private cellIndex(x: number, z: number): number {
    const gx = Math.floor((x + HALF_W) / CELL);
    const gz = Math.floor((z + HALF_D) / CELL);
    if (gx < 0 || gz < 0 || gx >= this.gw || gz >= this.gd) return -1;
    return gz * this.gw + gx;
  }

  private buildNav() {
    const r = 0.32;
    for (let gz = 0; gz < this.gd; gz++) {
      for (let gx = 0; gx < this.gw; gx++) {
        const x = -HALF_W + (gx + 0.5) * CELL;
        const z = -HALF_D + (gz + 0.5) * CELL;
        let blocked = 0;
        for (const s of this.solids) {
          if (x > s.minX - r && x < s.maxX + r && z > s.minZ - r && z < s.maxZ + r) {
            blocked = 1;
            break;
          }
        }
        this.blocked[gz * this.gw + gx] = blocked;
      }
    }
  }

  /** BFS from the target, filling the distance field. */
  updateFlow(target: THREE.Vector3) {
    this.dist.fill(0xffff);
    let start = this.cellIndex(target.x, target.z);
    if (start < 0) return;
    if (this.blocked[start]) {
      // player hugging a desk: seed from the nearest free neighbour
      const gx = start % this.gw;
      const gz = (start / this.gw) | 0;
      outer: for (let rr = 1; rr < 4; rr++) {
        for (let oz = -rr; oz <= rr; oz++) {
          for (let ox = -rr; ox <= rr; ox++) {
            const nx = gx + ox;
            const nz = gz + oz;
            if (nx < 0 || nz < 0 || nx >= this.gw || nz >= this.gd) continue;
            const i = nz * this.gw + nx;
            if (!this.blocked[i]) {
              start = i;
              break outer;
            }
          }
        }
      }
    }
    let head = 0;
    let tail = 0;
    this.dist[start] = 0;
    this.queue[tail++] = start;
    const w = this.gw;
    while (head < tail) {
      const i = this.queue[head++];
      const gx = i % w;
      const gz = (i / w) | 0;
      const nd = this.dist[i] + 1;
      if (gx > 0) this.visit(i - 1, nd, () => (this.queue[tail++] = i - 1));
      if (gx < w - 1) this.visit(i + 1, nd, () => (this.queue[tail++] = i + 1));
      if (gz > 0) this.visit(i - w, nd, () => (this.queue[tail++] = i - w));
      if (gz < this.gd - 1) this.visit(i + w, nd, () => (this.queue[tail++] = i + w));
    }
  }

  private visit(i: number, nd: number, push: () => void) {
    if (this.blocked[i] || this.dist[i] <= nd) return;
    this.dist[i] = nd;
    push();
  }

  /** Writes a unit XZ direction that walks down the flow field. Returns false if no field here. */
  flowDirection(pos: THREE.Vector3, out: THREE.Vector3): boolean {
    const i = this.cellIndex(pos.x, pos.z);
    if (i < 0) return false;
    const w = this.gw;
    const gx = i % w;
    const gz = (i / w) | 0;
    let best = this.dist[i];
    let bx = 0;
    let bz = 0;
    for (let oz = -1; oz <= 1; oz++) {
      for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oz) continue;
        const nx = gx + ox;
        const nz = gz + oz;
        if (nx < 0 || nz < 0 || nx >= w || nz >= this.gd) continue;
        const ni = nz * w + nx;
        if (this.blocked[ni]) continue;
        // no corner cutting
        if (ox && oz && (this.blocked[gz * w + nx] || this.blocked[nz * w + gx])) continue;
        const d = this.dist[ni] + (ox && oz ? 0.4 : 0);
        if (d < best) {
          best = d;
          bx = ox;
          bz = oz;
        }
      }
    }
    if (!bx && !bz) return false;
    // aim at the centre of the chosen cell for smoother steering
    const tx = -HALF_W + (gx + bx + 0.5) * CELL;
    const tz = -HALF_D + (gz + bz + 0.5) * CELL;
    out.set(tx - pos.x, 0, tz - pos.z);
    if (out.lengthSq() < 1e-6) out.set(bx, 0, bz);
    out.normalize();
    return true;
  }
}

/** Segment (origin + t*dir, t in 0..1) vs AABB slab test. */
function slab(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: Box): RayHit | null {
  let tmin = 0;
  let tmax = 1;
  let axis = -1;
  let sign = 0;
  const o = [ox, oy, oz];
  const d = [dx, dy, dz];
  const mn = [b.minX, b.minY, b.minZ];
  const mx = [b.maxX, b.maxY, b.maxZ];
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-9) {
      if (o[k] < mn[k] || o[k] > mx[k]) return null;
      continue;
    }
    const inv = 1 / d[k];
    let t1 = (mn[k] - o[k]) * inv;
    let t2 = (mx[k] - o[k]) * inv;
    let s = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      s = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      axis = k;
      sign = s;
    }
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (axis < 0) return { t: 0, normal: new THREE.Vector3(0, 1, 0) }; // started inside
  const n = new THREE.Vector3();
  n.setComponent(axis, sign);
  return { t: tmin, normal: n };
}

function makeCarpetTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#8A919C';
  g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 380; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
    g.fillRect(Math.random() * 64, Math.random() * 64, 2, 2);
  }
  g.strokeStyle = 'rgba(0,0,0,0.08)';
  g.lineWidth = 1;
  g.strokeRect(0.5, 0.5, 63, 63);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeSignTexture(text: string, bg = '#1C2230', fg = '#F5F3EE'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = fg;
  g.font = '600 52px "IBM Plex Mono", monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
