import * as THREE from 'three';
import { SeededRNG, GAME_CONSTANTS } from '@echo-drift/shared';
import type { TunnelGenerator } from './TunnelGenerator.js';

export interface Obstacle {
  id: string;
  position: THREE.Vector3;
  radius: number;
  isHard: boolean;    // hard = instant kill, weak = destroyable
  hp: number;
  maxHp: number;
  mesh: THREE.Mesh | THREE.LineSegments;
  glowLight: THREE.PointLight;
  alive: boolean;
}

/**
 * Obstacle spawner — places hard (indestructible) and weak (echo-destroyable) obstacles
 * inside the tunnel ahead of the player.
 */
export class ObstacleManager {
  private obstacles: Obstacle[] = [];
  private rng: SeededRNG;
  private nextSpawnZ: number = 60;  // start spawning a bit ahead
  private idCounter = 0;

  constructor(
    private scene: THREE.Scene,
    private tunnel: TunnelGenerator,
    seed: string
  ) {
    this.rng = new SeededRNG(seed + '-obstacles');
  }

  /**
   * Spawn initial obstacles
   */
  public init() {
    for (let z = this.nextSpawnZ; z < GAME_CONSTANTS.OBSTACLE_SPAWN_AHEAD; z += GAME_CONSTANTS.OBSTACLE_MIN_DISTANCE) {
      this.spawnObstacle(z);
    }
    this.nextSpawnZ = GAME_CONSTANTS.OBSTACLE_SPAWN_AHEAD;
  }

  private spawnObstacle(z: number) {
    const center = this.tunnel.getTunnelCenter(z);
    const angle = this.rng.range(0, Math.PI * 2);
    const distFromCenter = this.rng.range(2.0, center.radius - 3.0);

    const x = center.x + Math.cos(angle) * distFromCenter;
    const y = center.y + Math.sin(angle) * distFromCenter;

    const isHard = this.rng.next() > 0.4; // 60% hard, 40% weak
    const radius = isHard ? this.rng.range(1.2, 2.2) : this.rng.range(0.8, 1.5);

    const id = `obs-${this.idCounter++}`;
    const position = new THREE.Vector3(x, y, z);

    let mesh: THREE.Mesh | THREE.LineSegments;

    if (isHard) {
      // Hard obstacle — jagged octahedron wireframe (looks dangerous)
      const geo = new THREE.OctahedronGeometry(radius, 0);
      const mat = new THREE.MeshBasicMaterial({
        color: GAME_CONSTANTS.PALETTE.OBSTACLE_HARD,
        wireframe: true,
        transparent: true,
        opacity: 0.8
      });
      mesh = new THREE.Mesh(geo, mat);
    } else {
      // Weak obstacle — softer icosahedron wireframe (looks breakable)
      const geo = new THREE.IcosahedronGeometry(radius, 0);
      const mat = new THREE.MeshBasicMaterial({
        color: GAME_CONSTANTS.PALETTE.OBSTACLE_WEAK,
        wireframe: true,
        transparent: true,
        opacity: 0.7
      });
      mesh = new THREE.Mesh(geo, mat);
    }

    mesh.position.copy(position);

    // Subtle rotation
    mesh.rotation.set(
      this.rng.range(0, Math.PI),
      this.rng.range(0, Math.PI),
      this.rng.range(0, Math.PI)
    );

    this.scene.add(mesh);

    // Glow light
    const glowColor = isHard ? GAME_CONSTANTS.PALETTE.OBSTACLE_HARD : GAME_CONSTANTS.PALETTE.OBSTACLE_WEAK;
    const light = new THREE.PointLight(glowColor, 0.4, 6.0);
    light.position.copy(position);
    this.scene.add(light);

    this.obstacles.push({
      id,
      position,
      radius,
      isHard,
      hp: isHard ? Infinity : GAME_CONSTANTS.WEAK_OBSTACLE_HP,
      maxHp: isHard ? Infinity : GAME_CONSTANTS.WEAK_OBSTACLE_HP,
      mesh,
      glowLight: light,
      alive: true
    });
  }

  /**
   * Update: spawn new obstacles ahead, rotate existing ones, remove old
   */
  public update(vesselZ: number, dt: number) {
    // Spawn new obstacles ahead
    while (this.nextSpawnZ < vesselZ + GAME_CONSTANTS.OBSTACLE_SPAWN_AHEAD) {
      this.spawnObstacle(this.nextSpawnZ);
      this.nextSpawnZ += GAME_CONSTANTS.OBSTACLE_MIN_DISTANCE + this.rng.range(-5, 10);
    }

    // Update and clean up
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];

      // Rotate slowly
      if (obs.alive) {
        obs.mesh.rotation.x += dt * 0.5;
        obs.mesh.rotation.y += dt * 0.3;
      }

      // Remove if far behind player
      if (obs.position.z < vesselZ - 30) {
        this.removeObstacle(i);
      }
    }
  }

  /**
   * Deal damage to an obstacle from echo wave. Returns true if destroyed.
   */
  public damageObstacle(obs: Obstacle, damage: number): boolean {
    if (obs.isHard || !obs.alive) return false;

    obs.hp -= damage;
    if (obs.hp <= 0) {
      obs.alive = false;
      // Visual destruction effect — flash and shrink
      const mat = obs.mesh.material as THREE.MeshBasicMaterial;
      mat.color.setHex(GAME_CONSTANTS.PALETTE.EXPLOSION);
      mat.opacity = 1.0;

      // Animate shrink
      const startScale = obs.mesh.scale.x;
      const startTime = performance.now();
      const animate = () => {
        const elapsed = (performance.now() - startTime) / 300;
        if (elapsed >= 1.0) {
          this.scene.remove(obs.mesh);
          this.scene.remove(obs.glowLight);
          return;
        }
        const s = startScale * (1.0 - elapsed);
        obs.mesh.scale.set(s, s, s);
        mat.opacity = 1.0 - elapsed;
        requestAnimationFrame(animate);
      };
      animate();
      return true;
    } else {
      // Flash on hit
      const mat = obs.mesh.material as THREE.MeshBasicMaterial;
      mat.color.setHex(GAME_CONSTANTS.PALETTE.OBSTACLE_WEAK_HIT);
      setTimeout(() => {
        if (obs.alive) mat.color.setHex(GAME_CONSTANTS.PALETTE.OBSTACLE_WEAK);
      }, 100);
    }
    return false;
  }

  public getObstacles(): Obstacle[] {
    return this.obstacles.filter(o => o.alive);
  }

  private removeObstacle(index: number) {
    const obs = this.obstacles[index];
    this.scene.remove(obs.mesh);
    this.scene.remove(obs.glowLight);
    obs.mesh.geometry.dispose();
    (obs.mesh.material as THREE.Material).dispose();
    this.obstacles.splice(index, 1);
  }

  public dispose() {
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      this.removeObstacle(i);
    }
  }
}
