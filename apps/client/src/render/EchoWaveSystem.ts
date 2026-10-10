import * as THREE from 'three';
import { GAME_CONSTANTS } from '@echo-drift/shared';

export interface ActiveEchoWave {
  origin: THREE.Vector3;
  direction: THREE.Vector3;
  currentRadius: number;
  speed: number;
  lifetime: number;
  damage: number;
  mesh: THREE.Mesh;
  ring: THREE.LineLoop;
}

/**
 * Echo Wave weapon system — expanding sonic rings that damage enemies and weak obstacles.
 */
export class EchoWaveSystem {
  private waves: ActiveEchoWave[] = [];
  private sphereGeometry: THREE.SphereGeometry;
  private ringGeometry: THREE.BufferGeometry;

  constructor(private scene: THREE.Scene) {
    this.sphereGeometry = new THREE.SphereGeometry(1, 24, 16);
    this.ringGeometry = this.createRingGeometry();
  }

  private createRingGeometry(): THREE.BufferGeometry {
    const segments = 48;
    const positions = new Float32Array(segments * 3);
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      positions[i * 3] = Math.cos(angle);
      positions[i * 3 + 1] = Math.sin(angle);
      positions[i * 3 + 2] = 0;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }

  /**
   * Fire an echo wave from the vessel position in the forward direction
   */
  public fire(origin: THREE.Vector3, direction: THREE.Vector3) {
    // Glowing sphere mesh
    const sphereMat = new THREE.MeshBasicMaterial({
      color: GAME_CONSTANTS.PALETTE.ECHO_WAVE,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      wireframe: true,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(this.sphereGeometry, sphereMat);
    mesh.position.copy(origin);
    mesh.scale.set(0.3, 0.3, 0.3);
    this.scene.add(mesh);

    // Bright ring outline
    const ringMat = new THREE.LineBasicMaterial({
      color: GAME_CONSTANTS.PALETTE.ECHO_WAVE_INNER,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending
    });
    const ring = new THREE.LineLoop(this.ringGeometry.clone(), ringMat);
    ring.position.copy(origin);
    ring.scale.set(0.3, 0.3, 0.3);
    this.scene.add(ring);

    this.waves.push({
      origin: origin.clone(),
      direction: direction.clone().normalize(),
      currentRadius: 0.3,
      speed: GAME_CONSTANTS.ECHO_WAVE_SPEED,
      lifetime: 0,
      damage: GAME_CONSTANTS.ECHO_WAVE_DAMAGE,
      mesh,
      ring
    });
  }

  public update(dt: number) {
    const maxLifetime = GAME_CONSTANTS.ECHO_WAVE_LIFETIME_SEC;

    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.lifetime += dt;
      w.currentRadius += w.speed * dt * 0.15;

      // Move forward
      w.origin.addScaledVector(w.direction, w.speed * dt);

      // Update mesh
      const scale = w.currentRadius;
      w.mesh.position.copy(w.origin);
      w.mesh.scale.set(scale, scale, scale * 0.3);
      w.ring.position.copy(w.origin);
      w.ring.scale.set(scale, scale, 1);

      // Face forward along movement
      w.ring.lookAt(
        w.origin.x + w.direction.x,
        w.origin.y + w.direction.y,
        w.origin.z + w.direction.z
      );

      // Fade
      const progress = w.lifetime / maxLifetime;
      const meshMat = w.mesh.material as THREE.MeshBasicMaterial;
      const ringMat = w.ring.material as THREE.LineBasicMaterial;
      meshMat.opacity = Math.max(0, 0.3 * (1.0 - progress));
      ringMat.opacity = Math.max(0, 0.9 * (1.0 - progress));

      if (w.lifetime >= maxLifetime) {
        this.scene.remove(w.mesh);
        this.scene.remove(w.ring);
        meshMat.dispose();
        ringMat.dispose();
        w.ring.geometry.dispose();
        this.waves.splice(i, 1);
      }
    }
  }

  /**
   * Get all active waves for collision detection
   */
  public getActiveWaves(): ActiveEchoWave[] {
    return this.waves;
  }

  public clear() {
    for (const w of this.waves) {
      this.scene.remove(w.mesh);
      this.scene.remove(w.ring);
      (w.mesh.material as THREE.Material).dispose();
      (w.ring.material as THREE.Material).dispose();
      w.ring.geometry.dispose();
    }
    this.waves = [];
  }
}
