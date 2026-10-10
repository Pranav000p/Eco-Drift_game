import * as THREE from 'three';
import { GAME_CONSTANTS } from '@echo-drift/shared';

export class VesselRenderer {
  public group: THREE.Group;
  private hullLine: THREE.LineSegments;
  private thrusterLight: THREE.PointLight;
  private particleGroup: THREE.Points;
  private particlePositions: Float32Array;
  private particleLifetimes: Float32Array;
  private maxParticles = 80;
  public readonly isGhost: boolean;

  constructor(scene: THREE.Scene, isGhost = false) {
    this.isGhost = isGhost;
    this.group = new THREE.Group();

    const color = isGhost ? GAME_CONSTANTS.PALETTE.ENEMY_SHIP : GAME_CONSTANTS.PALETTE.VESSEL;
    const accentColor = isGhost ? GAME_CONSTANTS.PALETTE.ENEMY_ACCENT : GAME_CONSTANTS.PALETTE.VESSEL_ACCENT;

    // Spaceship wireframe — sleek delta-wing fighter
    const vertices = new Float32Array([
      // Nose to left wing
      0, 0, 1.4,  -1.0, -0.15, -0.7,
      // Left wing to thruster
      -1.0, -0.15, -0.7,  0, -0.05, -0.6,
      // Thruster to right wing
      0, -0.05, -0.6,  1.0, -0.15, -0.7,
      // Right wing to nose
      1.0, -0.15, -0.7,  0, 0, 1.4,
      // Nose to dorsal fin
      0, 0, 1.4,  0, 0.55, -0.5,
      // Dorsal fin to thruster
      0, 0.55, -0.5,  0, -0.05, -0.6,
      // Left wing to dorsal
      -1.0, -0.15, -0.7,  0, 0.55, -0.5,
      // Right wing to dorsal
      1.0, -0.15, -0.7,  0, 0.55, -0.5,
      // Wing tips (extra detail)
      -1.0, -0.15, -0.7,  -0.6, -0.08, 0.2,
      1.0, -0.15, -0.7,  0.6, -0.08, 0.2,
      // Undercarriage struts
      -0.4, -0.12, 0.0,  0.4, -0.12, 0.0,
    ]);

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

    const lineMat = new THREE.LineBasicMaterial({
      color,
      linewidth: 1.5,
      transparent: true,
      opacity: isGhost ? 0.7 : 0.95
    });

    this.hullLine = new THREE.LineSegments(lineGeo, lineMat);
    this.group.add(this.hullLine);

    // Engine glow
    this.thrusterLight = new THREE.PointLight(accentColor, isGhost ? 0.5 : 1.0, 8.0);
    this.thrusterLight.position.set(0, 0, -0.7);
    this.group.add(this.thrusterLight);

    // Particle engine trail
    this.particlePositions = new Float32Array(this.maxParticles * 3);
    this.particleLifetimes = new Float32Array(this.maxParticles);

    const partGeo = new THREE.BufferGeometry();
    partGeo.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));

    const partMat = new THREE.PointsMaterial({
      color: accentColor,
      size: 0.15,
      transparent: true,
      opacity: isGhost ? 0.4 : 0.75,
      blending: THREE.AdditiveBlending
    });

    this.particleGroup = new THREE.Points(partGeo, partMat);
    scene.add(this.particleGroup);
    scene.add(this.group);
  }

  public updateTransform(pos: THREE.Vector3, pitch: number, yaw: number, roll: number) {
    this.group.position.copy(pos);
    this.group.rotation.set(pitch, yaw, roll);
  }

  public updateTrail(pos: THREE.Vector3, dt: number) {
    // Spawn particle at thruster
    for (let i = 0; i < this.maxParticles; i++) {
      if (this.particleLifetimes[i] <= 0) {
        this.particleLifetimes[i] = 0.5;
        this.particlePositions[i * 3] = pos.x + (Math.random() - 0.5) * 0.18;
        this.particlePositions[i * 3 + 1] = pos.y + (Math.random() - 0.5) * 0.18;
        this.particlePositions[i * 3 + 2] = pos.z - 0.7;
        break;
      }
    }

    // Update existing
    for (let i = 0; i < this.maxParticles; i++) {
      if (this.particleLifetimes[i] > 0) {
        this.particleLifetimes[i] -= dt;
        this.particlePositions[i * 3 + 2] -= 5.0 * dt;
      } else {
        this.particlePositions[i * 3 + 1] = -9999;
      }
    }

    this.particleGroup.geometry.attributes.position.needsUpdate = true;
  }

  public setVisible(visible: boolean) {
    this.group.visible = visible;
    this.particleGroup.visible = visible;
  }

  public dispose(scene: THREE.Scene) {
    scene.remove(this.group);
    scene.remove(this.particleGroup);
    this.hullLine.geometry.dispose();
    (this.hullLine.material as THREE.Material).dispose();
    this.particleGroup.geometry.dispose();
    (this.particleGroup.material as THREE.Material).dispose();
  }
}
