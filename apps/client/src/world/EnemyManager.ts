import * as THREE from 'three';
import { SeededRNG, GAME_CONSTANTS } from '@echo-drift/shared';
import type { TunnelGenerator } from './TunnelGenerator.js';

export interface EnemyBullet {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  mesh: THREE.Mesh;
  lifetime: number;
}

export interface Enemy {
  id: string;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  hp: number;
  maxHp: number;
  mesh: THREE.Group;
  hullLine: THREE.LineSegments;
  light: THREE.PointLight;
  alive: boolean;
  lastFireTime: number;
  spawnTime: number;
}

/**
 * Enemy ship spawner — enemy spaceships that fly toward the player,
 * firing bullets that the player must dodge.
 */
export class EnemyManager {
  private enemies: Enemy[] = [];
  private bullets: EnemyBullet[] = [];
  private rng: SeededRNG;
  private idCounter = 0;
  private lastSpawnTime = 0;
  private spawnInterval: number;
  private bulletGeometry: THREE.SphereGeometry;

  constructor(
    private scene: THREE.Scene,
    private tunnel: TunnelGenerator,
    seed: string
  ) {
    this.rng = new SeededRNG(seed + '-enemies');
    this.spawnInterval = GAME_CONSTANTS.ENEMY_SPAWN_INTERVAL_MS;
    this.bulletGeometry = new THREE.SphereGeometry(0.65, 12, 8);
  }

  /**
   * Spawn an enemy ship ahead of the player, flying toward them.
   */
  private spawnEnemy(vesselZ: number) {
    const spawnZ = vesselZ + 120 + this.rng.range(0, 60);
    const center = this.tunnel.getTunnelCenter(spawnZ);

    // Position within the tunnel
    const angle = this.rng.range(0, Math.PI * 2);
    const dist = this.rng.range(1.5, center.radius * 0.5);
    const x = center.x + Math.cos(angle) * dist;
    const y = center.y + Math.sin(angle) * dist;

    const position = new THREE.Vector3(x, y, spawnZ);

    // Enemy hull — inverted angular wireframe ship
    const group = new THREE.Group();

    const vertices = new Float32Array([
      // Aggressive angular enemy shape
      0, 0, -1.2,  -0.9, 0.2, 0.6,
      0, 0, -1.2,  0.9, 0.2, 0.6,
      0, 0, -1.2,  0, -0.5, 0.6,
      -0.9, 0.2, 0.6,  0.9, 0.2, 0.6,
      -0.9, 0.2, 0.6,  0, -0.5, 0.6,
      0.9, 0.2, 0.6,  0, -0.5, 0.6,
      // Dorsal spike
      0, 0, -1.2,  0, 0.6, 0.2,
      0, 0.6, 0.2,  -0.9, 0.2, 0.6,
      0, 0.6, 0.2,  0.9, 0.2, 0.6,
    ]);

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    const lineMat = new THREE.LineBasicMaterial({
      color: GAME_CONSTANTS.PALETTE.ENEMY_SHIP,
      transparent: true,
      opacity: 0.9
    });
    const hullLine = new THREE.LineSegments(lineGeo, lineMat);
    group.add(hullLine);

    group.position.copy(position);
    this.scene.add(group);

    // Engine glow
    const light = new THREE.PointLight(GAME_CONSTANTS.PALETTE.ENEMY_ACCENT, 0.8, 10);
    light.position.copy(position);
    this.scene.add(light);

    const id = `enemy-${this.idCounter++}`;
    this.enemies.push({
      id,
      position,
      velocity: new THREE.Vector3(0, 0, -GAME_CONSTANTS.ENEMY_SPEED),
      hp: GAME_CONSTANTS.ENEMY_HP,
      maxHp: GAME_CONSTANTS.ENEMY_HP,
      mesh: group,
      hullLine,
      light,
      alive: true,
      lastFireTime: performance.now(),
      spawnTime: performance.now()
    });
  }

  /**
   * Update enemy positions, fire bullets, and clean up
   */
  public update(vesselZ: number, vesselPos: THREE.Vector3, dt: number) {
    const now = performance.now();

    // Spawn new enemies periodically (difficulty ramps: shorter interval over time)
    const timeSinceLastSpawn = now - this.lastSpawnTime;
    const dynamicInterval = Math.max(1500, this.spawnInterval - vesselZ * 2);
    if (timeSinceLastSpawn > dynamicInterval) {
      this.spawnEnemy(vesselZ);
      this.lastSpawnTime = now;
    }

    // Update enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (!enemy.alive) continue;

      // Move toward player (fly backward through tunnel)
      enemy.position.addScaledVector(enemy.velocity, dt);
      enemy.mesh.position.copy(enemy.position);
      enemy.light.position.copy(enemy.position);

      // Face the player
      enemy.mesh.lookAt(vesselPos);

      // Animate: slight swaying
      const t = now * 0.002 + parseInt(enemy.id.split('-')[1]) * 1.5;
      enemy.mesh.rotation.z = Math.sin(t) * 0.15;

      // Fire bullets at player
      if (now - enemy.lastFireTime > GAME_CONSTANTS.ENEMY_FIRE_INTERVAL_MS) {
        this.fireBullet(enemy, vesselPos);
        enemy.lastFireTime = now;
      }

      // Remove if far behind player
      if (enemy.position.z < vesselZ - 40) {
        this.removeEnemy(i);
      }
    }

    // Update bullets
    this.updateBullets(dt, vesselZ);
  }

  private fireBullet(enemy: Enemy, targetPos: THREE.Vector3) {
    const direction = new THREE.Vector3()
      .subVectors(targetPos, enemy.position)
      .normalize();

    const bullet = {
      position: enemy.position.clone(),
      velocity: direction.multiplyScalar(GAME_CONSTANTS.ENEMY_BULLET_SPEED),
      mesh: new THREE.Mesh(
        this.bulletGeometry,
        new THREE.MeshBasicMaterial({
          color: GAME_CONSTANTS.PALETTE.ENEMY_BULLET,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending
        })
      ),
      lifetime: 0
    };

    bullet.mesh.position.copy(bullet.position);
    this.scene.add(bullet.mesh);
    this.bullets.push(bullet);
  }

  private updateBullets(dt: number, vesselZ: number) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.lifetime += dt;
      b.position.addScaledVector(b.velocity, dt);
      b.mesh.position.copy(b.position);

      // Remove old bullets
      if (b.lifetime > 4.0 || b.position.z < vesselZ - 20) {
        this.scene.remove(b.mesh);
        (b.mesh.material as THREE.Material).dispose();
        this.bullets.splice(i, 1);
      }
    }
  }

  /**
   * Damage an enemy. Returns true if killed.
   */
  public damageEnemy(enemy: Enemy, damage: number): boolean {
    if (!enemy.alive) return false;

    enemy.hp -= damage;

    // Flash on hit
    const mat = enemy.hullLine.material as THREE.LineBasicMaterial;
    mat.color.setHex(0xffffff);
    setTimeout(() => {
      if (enemy.alive) mat.color.setHex(GAME_CONSTANTS.PALETTE.ENEMY_SHIP);
    }, 80);

    if (enemy.hp <= 0) {
      enemy.alive = false;
      this.createExplosion(enemy.position);

      // Fade out
      const startTime = performance.now();
      const animate = () => {
        const elapsed = (performance.now() - startTime) / 400;
        if (elapsed >= 1.0) {
          this.scene.remove(enemy.mesh);
          this.scene.remove(enemy.light);
          return;
        }
        const s = 1.0 + elapsed * 0.5;
        enemy.mesh.scale.set(s, s, s);
        mat.opacity = 1.0 - elapsed;
        enemy.light.intensity = 3.0 * (1.0 - elapsed);
        requestAnimationFrame(animate);
      };
      animate();
      return true;
    }
    return false;
  }

  private createExplosion(pos: THREE.Vector3) {
    // Particle burst explosion
    const count = 30;
    const positions = new Float32Array(count * 3);
    const velocities: THREE.Vector3[] = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;
      velocities.push(new THREE.Vector3(
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 20
      ));
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: GAME_CONSTANTS.PALETTE.EXPLOSION,
      size: 0.3,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending
    });
    const points = new THREE.Points(geo, mat);
    this.scene.add(points);

    // Animate explosion particles
    const startTime = performance.now();
    const animateExplosion = () => {
      const elapsed = (performance.now() - startTime) / 800;
      if (elapsed >= 1.0) {
        this.scene.remove(points);
        geo.dispose();
        mat.dispose();
        return;
      }
      const posArr = geo.attributes.position.array as Float32Array;
      for (let i = 0; i < count; i++) {
        posArr[i * 3] += velocities[i].x * 0.016;
        posArr[i * 3 + 1] += velocities[i].y * 0.016;
        posArr[i * 3 + 2] += velocities[i].z * 0.016;
      }
      geo.attributes.position.needsUpdate = true;
      mat.opacity = 1.0 - elapsed;
      requestAnimationFrame(animateExplosion);
    };
    animateExplosion();
  }

  public getEnemies(): Enemy[] {
    return this.enemies.filter(e => e.alive);
  }

  public getBullets(): EnemyBullet[] {
    return this.bullets;
  }

  private removeEnemy(index: number) {
    const enemy = this.enemies[index];
    this.scene.remove(enemy.mesh);
    this.scene.remove(enemy.light);
    enemy.hullLine.geometry.dispose();
    (enemy.hullLine.material as THREE.Material).dispose();
    this.enemies.splice(index, 1);
  }

  public dispose() {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      this.removeEnemy(i);
    }
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      this.scene.remove(b.mesh);
      (b.mesh.material as THREE.Material).dispose();
    }
    this.bullets = [];
    this.bulletGeometry.dispose();
  }
}
