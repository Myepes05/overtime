import * as THREE from 'three';
import { MATCH, PHASES, type EnemyType, type PhaseDef } from './config';
import type { Enemies } from './enemies';
import type { World } from './world';

export function phaseIndexAt(t: number): number {
  let i = 0;
  for (let k = 0; k < PHASES.length; k++) if (t >= PHASES[k].start) i = k;
  return i;
}

export function phaseAt(t: number): PhaseDef {
  return PHASES[phaseIndexAt(t)];
}

/** Spawns waves from the doors; the mix and the rate come from the current phase. */
export class Spawner {
  private timer = 1.5;
  bossSpawned = false;

  reset() {
    this.timer = 1.5;
    this.bossSpawned = false;
  }

  update(dt: number, t: number, enemies: Enemies, world: World, player: THREE.Vector3): EnemyType | null {
    if (!this.bossSpawned && t >= MATCH.bossTime) {
      this.bossSpawned = true;
      enemies.spawn('ceo', world.ceoSpawn.clone(), t);
      return 'ceo';
    }
    this.timer -= dt;
    if (this.timer > 0) return null;
    const phase = phaseAt(t);
    this.timer = phase.spawnInterval * (0.8 + Math.random() * 0.4);
    if (enemies.liveCount() >= MATCH.maxLiveEnemies) return null;

    const type = weightedPick(phase.weights);
    const door = this.pickDoor(world, player);
    if (type === 'intern') {
      const [a, b] = MATCH.internPack;
      const n = a + Math.floor(Math.random() * (b - a + 1));
      for (let i = 0; i < n && enemies.liveCount() < MATCH.maxLiveEnemies; i++) {
        const p = door.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.6, 0, (Math.random() - 0.5) * 1.6));
        world.resolveCircle(p, 0.32);
        enemies.spawn('intern', p, t);
      }
    } else {
      enemies.spawn(type, door.clone(), t);
    }
    return type;
  }

  private pickDoor(world: World, player: THREE.Vector3): THREE.Vector3 {
    const far = world.spawnPoints.filter((p) => p.distanceTo(player) >= MATCH.minSpawnDistance);
    const list = far.length ? far : world.spawnPoints;
    return list[(Math.random() * list.length) | 0];
  }
}

function weightedPick(w: Partial<Record<EnemyType, number>>): EnemyType {
  const entries = Object.entries(w) as Array<[EnemyType, number]>;
  let total = 0;
  for (const [, v] of entries) total += v;
  let r = Math.random() * total;
  for (const [k, v] of entries) {
    r -= v;
    if (r <= 0) return k;
  }
  return entries[0][0];
}
