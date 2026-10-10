import * as THREE from 'three';
import { SeededRNG, GAME_CONSTANTS } from '@echo-drift/shared';
import type { TunnelGenerator } from './TunnelGenerator.js';
import { audio } from '../core/AudioManager.js';

export interface RedBall {
  id: string;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  mesh: THREE.Group;
  halo: THREE.Mesh;
  cage: THREE.Mesh;
  radius: number;
  spawnTime: number;
  dodged: boolean;
  trailPoints: THREE.Points;
  trailPositions: Float32Array;
}

export interface RedBallDebris {
  positions: Float32Array;
  velocities: Float32Array;
  lifetimes: Float32Array;
  mesh: THREE.Points;
  age: number;
  maxAge: number;
}

/**
 * Red Ball Hazard Manager:
 * Spawns fewer, highly visible red plasma balls that magnetically attract
 * towards the player's spaceship wherever it maneuvers, creating an intense
 * homing-missile dodging challenge.
 */
export class RedBallManager {
  private balls: RedBall[] = [];
  private debrisSystems: RedBallDebris[] = [];
  private rng: SeededRNG;
  private idCounter = 0;
  private lastWaveTime = 0;
  private waveInterval: number;

  // Shared geometries and materials
  private coreGeometry: THREE.SphereGeometry;
  private cageGeometry: THREE.SphereGeometry;
  private haloGeometry: THREE.RingGeometry;
  private coreMaterial: THREE.MeshBasicMaterial;
  private cageMaterial: THREE.MeshBasicMaterial;
  private haloMaterial: THREE.MeshBasicMaterial;
  private trailMaterial: THREE.PointsMaterial;
  private debrisMaterial: THREE.PointsMaterial;

  private readonly TRAIL_COUNT = 16;

  constructor(
    private scene: THREE.Scene,
    private tunnel: TunnelGenerator,
    seed: string
  ) {
    this.rng = new SeededRNG(seed + '-attracted-balls');
    this.waveInterval = GAME_CONSTANTS.RED_BALL_SPAWN_INTERVAL_MS;

    const r = GAME_CONSTANTS.RED_BALL_RADIUS;
    this.coreGeometry = new THREE.SphereGeometry(r, 16, 12);
    this.cageGeometry = new THREE.SphereGeometry(r * 1.2, 10, 8);
    this.haloGeometry = new THREE.RingGeometry(r * 0.85, r * 1.55, 18);

    this.coreMaterial = new THREE.MeshBasicMaterial({
      color: GAME_CONSTANTS.PALETTE.RED_BALL_CORE,
      depthWrite: true
    });

    this.cageMaterial = new THREE.MeshBasicMaterial({
      color: GAME_CONSTANTS.PALETTE.RED_BALL_OUTLINE,
      wireframe: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending
    });

    this.haloMaterial = new THREE.MeshBasicMaterial({
      color: GAME_CONSTANTS.PALETTE.RED_BALL_GLOW,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });

    this.trailMaterial = new THREE.PointsMaterial({
      color: GAME_CONSTANTS.PALETTE.RED_BALL_GLOW,
      size: 0.35,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending
    });

    this.debrisMaterial = new THREE.PointsMaterial({
      color: GAME_CONSTANTS.PALETTE.RED_BALL_CORE,
      size: 0.45,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending
    });
  }

  /**
   * Spawns fewer balls (1 ball, occasionally 2 at high distance)
   * that home towards the player's spaceship.
   */
  private spawnWave(vesselZ: number, vesselPos: THREE.Vector3) {
    // Hard cap on active balls so screen is never crowded
    if (this.balls.length >= GAME_CONSTANTS.RED_BALL_MAX_ACTIVE) {
      return;
    }

    const spawnAheadZ = vesselZ + 115 + this.rng.range(0, 30);
    const center = this.tunnel.getTunnelCenter(spawnAheadZ);

    // Number of balls to spawn: 1 ball most of the time; 2 balls once player travels past 250m
    const count = (vesselZ > 250 && this.rng.next() < 0.4) ? 2 : 1;

    for (let i = 0; i < count; i++) {
      if (this.balls.length >= GAME_CONSTANTS.RED_BALL_MAX_ACTIVE) break;

      // Spawn near the tunnel rim or offset, curving toward the ship
      const angle = this.rng.range(0, Math.PI * 2);
      const radiusOffset = this.rng.range(3.0, 7.5);
      const spawnX = center.x + Math.cos(angle) * radiusOffset;
      const spawnY = center.y + Math.sin(angle) * radiusOffset;
      const spawnZ = spawnAheadZ + i * 18.0;

      this.createBall(new THREE.Vector3(spawnX, spawnY, spawnZ), vesselPos);
    }
  }

  private createBall(spawnPos: THREE.Vector3, targetPos: THREE.Vector3) {
    const id = `redball-${++this.idCounter}`;

    // Initial velocity towards player
    const toTarget = new THREE.Vector3().subVectors(targetPos, spawnPos).normalize();
    const velocity = new THREE.Vector3(
      toTarget.x * 6.0,
      toTarget.y * 6.0,
      -GAME_CONSTANTS.RED_BALL_SPEED
    );

    // Group for mesh
    const group = new THREE.Group();

    // 1. Emissive core
    const coreMesh = new THREE.Mesh(this.coreGeometry, this.coreMaterial);
    group.add(coreMesh);

    // 2. Wireframe energy cage
    const cageMesh = new THREE.Mesh(this.cageGeometry, this.cageMaterial);
    group.add(cageMesh);

    // 3. Facing aura halo
    const haloMesh = new THREE.Mesh(this.haloGeometry, this.haloMaterial);
    group.add(haloMesh);

    group.position.copy(spawnPos);
    this.scene.add(group);

    // 4. Spark trail
    const trailPositions = new Float32Array(this.TRAIL_COUNT * 3);
    for (let i = 0; i < this.TRAIL_COUNT; i++) {
      trailPositions[i * 3 + 0] = spawnPos.x;
      trailPositions[i * 3 + 1] = spawnPos.y;
      trailPositions[i * 3 + 2] = spawnPos.z;
    }
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    const trailMesh = new THREE.Points(trailGeo, this.trailMaterial.clone());
    this.scene.add(trailMesh);

    this.balls.push({
      id,
      position: spawnPos.clone(),
      velocity,
      mesh: group,
      halo: haloMesh,
      cage: cageMesh,
      radius: GAME_CONSTANTS.RED_BALL_RADIUS,
      spawnTime: performance.now(),
      dodged: false,
      trailPoints: trailMesh,
      trailPositions
    });
  }

  /**
   * Main update loop:
   * Magnetically attracts red balls toward the spaceship wherever it moves,
   * loosening the attraction at close range so the player can dodge.
   */
  public update(
    vesselZ: number,
    vesselPos: THREE.Vector3,
    dt: number
  ): { dodgedCount: number; closeDodgePositions: THREE.Vector3[] } {
    const now = performance.now();
    let dodgedCount = 0;
    const closeDodgePositions: THREE.Vector3[] = [];

    // Periodic spawning with generous interval (less balls)
    const timeSinceLastWave = now - this.lastWaveTime;
    const dynamicInterval = Math.max(1800, this.waveInterval - vesselZ * 0.8);

    if (timeSinceLastWave > dynamicInterval) {
      this.spawnWave(vesselZ, vesselPos);
      this.lastWaveTime = now;
    }

    // Update active balls
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const ball = this.balls[i];

      // Distance in Z towards the player
      const deltaZ = ball.position.z - vesselPos.z;

      // HOMING & ATTRACTION PHYSICS:
      // When far away (deltaZ > 14m), strong magnetic attraction towards spaceship.
      // When closer (deltaZ <= 14m), attraction reduces so the player can dodge away!
      if (deltaZ > 0) {
        const dx = vesselPos.x - ball.position.x;
        const dy = vesselPos.y - ball.position.y;
        const distXY = Math.sqrt(dx * dx + dy * dy);

        // Attraction ramp: strong when far (>14m), diminishing when entering dodge window (<14m)
        let attractionRatio = 1.0;
        if (deltaZ < 14) {
          attractionRatio = Math.max(0.08, (deltaZ - 2.0) / 12.0);
        }

        const force = GAME_CONSTANTS.RED_BALL_ATTRACTION_FORCE * attractionRatio;
        if (distXY > 0.1) {
          const dirX = dx / distXY;
          const dirY = dy / distXY;
          ball.velocity.x += dirX * force * dt;
          ball.velocity.y += dirY * force * dt;
        }

        // Damping on X and Y to prevent chaotic shaking while turning smoothly
        const damping = Math.pow(0.86, dt * 60);
        ball.velocity.x *= damping;
        ball.velocity.y *= damping;
      }

      // Maintain steady forward-closing speed
      ball.velocity.z = -GAME_CONSTANTS.RED_BALL_SPEED;

      // Apply movement
      ball.position.addScaledVector(ball.velocity, dt);
      ball.mesh.position.copy(ball.position);

      // Animate spin and pulse
      ball.cage.rotation.x += dt * 3.5;
      ball.cage.rotation.y += dt * 5.0;
      ball.halo.lookAt(vesselPos);
      const pulse = 1.0 + Math.sin(now * 0.01 + i) * 0.18;
      ball.halo.scale.set(pulse, pulse, pulse);

      // Update particle trail
      this.updateBallTrail(ball, dt);

      // DODGE DETECTION:
      // When ball passes behind the player's Z position without colliding
      if (!ball.dodged && ball.position.z < vesselPos.z) {
        const distToPlayer = ball.position.distanceTo(vesselPos);
        if (distToPlayer <= GAME_CONSTANTS.RED_BALL_DODGE_RADIUS) {
          ball.dodged = true;
          dodgedCount++;
          closeDodgePositions.push(ball.position.clone());
        }
      }

      // Remove ball if well behind player
      if (ball.position.z < vesselZ - 25) {
        this.removeBall(i);
      }
    }

    // Update debris particles
    this.updateDebris(dt);

    return { dodgedCount, closeDodgePositions };
  }

  private updateBallTrail(ball: RedBall, _dt: number) {
    const pos = ball.trailPositions;
    // Shift positions down the trail
    for (let i = this.TRAIL_COUNT - 1; i > 0; i--) {
      pos[i * 3 + 0] = pos[(i - 1) * 3 + 0];
      pos[i * 3 + 1] = pos[(i - 1) * 3 + 1];
      pos[i * 3 + 2] = pos[(i - 1) * 3 + 2];
    }
    // Set head of trail to current ball position
    pos[0] = ball.position.x;
    pos[1] = ball.position.y;
    pos[2] = ball.position.z;

    ball.trailPoints.geometry.attributes.position.needsUpdate = true;
  }

  /**
   * Destroys any red balls caught in the expanding echo wave.
   */
  public checkEchoWaveCollisions(waveOrigin: THREE.Vector3, waveRadius: number): number {
    let destroyed = 0;

    for (let i = this.balls.length - 1; i >= 0; i--) {
      const ball = this.balls[i];
      const dist = ball.position.distanceTo(waveOrigin);

      if (dist <= waveRadius && dist >= Math.max(0, waveRadius - 3.0)) {
        this.spawnExplosion(ball.position);
        audio.playRedBallDestroy();
        this.removeBall(i);
        destroyed++;
      }
    }

    return destroyed;
  }

  private spawnExplosion(pos: THREE.Vector3) {
    const particleCount = 16;
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);
    const lifetimes = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3 + 0] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;

      const theta = this.rng.range(0, Math.PI * 2);
      const phi = this.rng.range(0, Math.PI);
      const spd = this.rng.range(9, 24);

      velocities[i * 3 + 0] = Math.sin(phi) * Math.cos(theta) * spd;
      velocities[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * spd;
      velocities[i * 3 + 2] = Math.cos(phi) * spd;

      lifetimes[i] = this.rng.range(0.3, 0.65);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mesh = new THREE.Points(geo, this.debrisMaterial.clone());
    this.scene.add(mesh);

    this.debrisSystems.push({
      positions,
      velocities,
      lifetimes,
      mesh,
      age: 0,
      maxAge: 0.65
    });
  }

  private updateDebris(dt: number) {
    for (let d = this.debrisSystems.length - 1; d >= 0; d--) {
      const sys = this.debrisSystems[d];
      sys.age += dt;

      if (sys.age >= sys.maxAge) {
        this.scene.remove(sys.mesh);
        sys.mesh.geometry.dispose();
        (sys.mesh.material as THREE.Material).dispose();
        this.debrisSystems.splice(d, 1);
        continue;
      }

      const count = sys.lifetimes.length;
      for (let i = 0; i < count; i++) {
        sys.positions[i * 3 + 0] += sys.velocities[i * 3 + 0] * dt;
        sys.positions[i * 3 + 1] += sys.velocities[i * 3 + 1] * dt;
        sys.positions[i * 3 + 2] += sys.velocities[i * 3 + 2] * dt;
      }

      sys.mesh.geometry.attributes.position.needsUpdate = true;
      (sys.mesh.material as THREE.PointsMaterial).opacity = 1.0 - (sys.age / sys.maxAge);
    }
  }

  private removeBall(index: number) {
    const ball = this.balls[index];
    this.scene.remove(ball.mesh);
    this.scene.remove(ball.trailPoints);
    ball.trailPoints.geometry.dispose();
    (ball.trailPoints.material as THREE.Material).dispose();
    this.balls.splice(index, 1);
  }

  public getBalls(): RedBall[] {
    return this.balls;
  }

  public reset() {
    for (const ball of this.balls) {
      this.scene.remove(ball.mesh);
      this.scene.remove(ball.trailPoints);
      ball.trailPoints.geometry.dispose();
      (ball.trailPoints.material as THREE.Material).dispose();
    }
    this.balls = [];

    for (const sys of this.debrisSystems) {
      this.scene.remove(sys.mesh);
      sys.mesh.geometry.dispose();
      (sys.mesh.material as THREE.Material).dispose();
    }
    this.debrisSystems = [];

    this.lastWaveTime = 0;
    this.idCounter = 0;
  }
}
