import * as THREE from 'three';
import { COFFEE, PLAYER } from './config';
import type { Input } from './input';
import type { World } from './world';

export class Player {
  readonly pos = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  wellbeing: number = PLAYER.maxWellbeing;
  slowT = 0;
  boostT = 0;
  coffeeCd = 0;
  hurtCd = 0;
  hurtFlash = 0;
  private bob = 0;
  private readonly vel = new THREE.Vector3();

  reset(start: THREE.Vector3) {
    this.pos.copy(start);
    this.yaw = 0;
    this.pitch = 0;
    this.wellbeing = PLAYER.maxWellbeing;
    this.slowT = this.boostT = this.coffeeCd = this.hurtCd = this.hurtFlash = 0;
    this.vel.set(0, 0, 0);
  }

  /** Returns 0..1 movement amount (for head/hand bob). */
  update(dt: number, input: Input, world: World, camera: THREE.PerspectiveCamera): number {
    this.slowT = Math.max(0, this.slowT - dt);
    this.boostT = Math.max(0, this.boostT - dt);
    this.coffeeCd = Math.max(0, this.coffeeCd - dt);
    this.hurtCd = Math.max(0, this.hurtCd - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);

    const look = input.consumeLook();
    const turn = input.keyTurn();
    this.yaw -= look.dx + turn.x * PLAYER.keyTurnSpeed * dt;
    this.pitch -= look.dy + turn.y * PLAYER.keyTurnSpeed * 0.6 * dt;
    this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch));

    const axes = input.moveAxes();
    let speed = PLAYER.speed;
    if (this.slowT > 0) speed *= PLAYER.slowFactor;
    if (this.boostT > 0) speed *= COFFEE.speedMultiplier;
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    const tx = (fx * axes.y + rx * axes.x) * speed;
    const tz = (fz * axes.y + rz * axes.x) * speed;
    const k = Math.min(1, dt * 12);
    this.vel.x += (tx - this.vel.x) * k;
    this.vel.z += (tz - this.vel.z) * k;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    world.resolveCircle(this.pos, PLAYER.radius);

    const moving = Math.min(1, Math.hypot(this.vel.x, this.vel.z) / PLAYER.speed);
    this.bob += dt * moving * 9;
    camera.position.set(this.pos.x, PLAYER.eyeHeight + Math.abs(Math.sin(this.bob)) * 0.035 * moving, this.pos.z);
    camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    return moving;
  }

  coffee(): boolean {
    if (this.coffeeCd > 0) return false;
    this.wellbeing = Math.min(PLAYER.maxWellbeing, this.wellbeing + COFFEE.heal);
    this.boostT = COFFEE.boostDuration;
    this.coffeeCd = COFFEE.cooldown;
    return true;
  }

  hurt(amount: number): boolean {
    if (this.hurtCd > 0) return false;
    this.wellbeing = Math.max(0, this.wellbeing - amount);
    this.hurtCd = PLAYER.hurtCooldown;
    this.hurtFlash = 0.25;
    return true;
  }
}
