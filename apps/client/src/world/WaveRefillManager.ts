import * as THREE from 'three';
import { SeededRNG } from '@echo-drift/shared';
import type { TunnelGenerator } from './TunnelGenerator.js';

export interface WaveRefillItem {
  id: string;
  position: THREE.Vector3;
  baseY: number;
  radius: number;
  group: THREE.Group;
  light: THREE.PointLight;
  coreMesh: THREE.Mesh;
  outerRing: THREE.Mesh;
  haloMesh: THREE.Mesh;
  alive: boolean;
  bobPhase: number;
  rotationSpeed: number;
}

/**
 * WaveRefillManager — spawns glowing floating Sonic Energy Batteries inside the tunnel.
 * Collecting one grants +3 Echo Wave ammunition charges and a brief surge!
 */
export class WaveRefillManager {
  private items: WaveRefillItem[] = [];
  private rng: SeededRNG;
  private nextSpawnZ = 85;
  private readonly SPAWN_INTERVAL_DISTANCE = 160; // spawns every ~160m ahead
  private readonly SPAWN_AHEAD_DISTANCE = 320;
  private idCounter = 0;
  private totalElapsed = 0;

  constructor(
    private scene: THREE.Scene,
    private tunnel: TunnelGenerator,
    seed: string
  ) {
    this.rng = new SeededRNG(seed + '-refills');
  }

  public init() {
    this.clear();
    // Spawn initial wave refill items
    for (let z = this.nextSpawnZ; z < this.SPAWN_AHEAD_DISTANCE; z += this.SPAWN_INTERVAL_DISTANCE) {
      this.spawnRefill(z);
    }
    this.nextSpawnZ = this.SPAWN_AHEAD_DISTANCE;
  }

  private spawnRefill(z: number) {
    const center = this.tunnel.getTunnelCenter(z);
    const angle = this.rng.range(0, Math.PI * 2);
    // Position comfortably within reach inside the tunnel
    const distFromCenter = this.rng.range(1.0, center.radius - 3.5);

    const x = center.x + Math.cos(angle) * distFromCenter;
    const y = center.y + Math.sin(angle) * distFromCenter;

    const id = `refill-${this.idCounter++}`;
    const position = new THREE.Vector3(x, y, z);
    const radius = 1.4;

    const group = new THREE.Group();
    group.position.copy(position);

    // 1. Glowing Inner Crystal Core (Diamond octahedron)
    const coreGeo = new THREE.OctahedronGeometry(0.7, 0);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: false,
      transparent: true,
      opacity: 0.95
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    group.add(coreMesh);

    // 2. Wireframe Overlay on Core for cybernetic structure
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      transparent: true,
      opacity: 0.9
    });
    const wireMesh = new THREE.Mesh(coreGeo, wireMat);
    wireMesh.scale.setScalar(1.05);
    group.add(wireMesh);

    // 3. Orbiting Torus Energy Ring
    const ringGeo = new THREE.TorusGeometry(1.2, 0.08, 8, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      wireframe: false,
      transparent: true,
      opacity: 0.85
    });
    const outerRing = new THREE.Mesh(ringGeo, ringMat);
    group.add(outerRing);

    // 4. Secondary Cross-Ring (Golden harmonic resonator)
    const subRingGeo = new THREE.TorusGeometry(0.95, 0.05, 8, 24);
    const subRingMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      wireframe: false,
      transparent: true,
      opacity: 0.75
    });
    const subRing = new THREE.Mesh(subRingGeo, subRingMat);
    subRing.rotation.x = Math.PI / 2;
    group.add(subRing);

    // 5. Pulsing Translucent Energy Halo
    const haloGeo = new THREE.SphereGeometry(1.3, 16, 16);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      transparent: true,
      opacity: 0.22,
      wireframe: true
    });
    const haloMesh = new THREE.Mesh(haloGeo, haloMat);
    group.add(haloMesh);

    this.scene.add(group);

    // Dynamic Cyan PointLight that illuminates tunnel walls
    const light = new THREE.PointLight(0x22d3ee, 1.2, 8.5);
    light.position.copy(position);
    this.scene.add(light);

    this.items.push({
      id,
      position,
      baseY: y,
      radius,
      group,
      light,
      coreMesh,
      outerRing,
      haloMesh,
      alive: true,
      bobPhase: this.rng.range(0, Math.PI * 2),
      rotationSpeed: this.rng.range(2.2, 3.5)
    });
  }

  public update(playerZ: number, dt: number) {
    this.totalElapsed += dt;

    // Spawn more items ahead
    while (this.nextSpawnZ < playerZ + this.SPAWN_AHEAD_DISTANCE) {
      this.spawnRefill(this.nextSpawnZ);
      this.nextSpawnZ += this.SPAWN_INTERVAL_DISTANCE + this.rng.range(-20, 20);
    }

    // Animate and cull
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];

      if (!item.alive) {
        this.removeItem(i);
        continue;
      }

      // Rotate group components
      item.coreMesh.rotation.y += dt * item.rotationSpeed;
      item.coreMesh.rotation.x += dt * (item.rotationSpeed * 0.6);

      item.outerRing.rotation.x += dt * (item.rotationSpeed * 1.2);
      item.outerRing.rotation.y += dt * item.rotationSpeed;

      item.haloMesh.rotation.z -= dt * 0.8;

      // Floating bobbing motion
      const bob = Math.sin(this.totalElapsed * 3.5 + item.bobPhase) * 0.35;
      item.group.position.y = item.baseY + bob;
      item.position.y = item.baseY + bob;
      item.light.position.y = item.baseY + bob;

      // Pulse halo scale
      const pulse = 1.0 + Math.sin(this.totalElapsed * 5.0 + item.bobPhase) * 0.12;
      item.haloMesh.scale.setScalar(pulse);

      // Cull items passed behind player
      if (item.position.z < playerZ - 20) {
        this.removeItem(i);
      }
    }
  }

  /**
   * Check if player collides with any refill pickup
   */
  public checkPlayerCollision(playerPos: THREE.Vector3, playerHitRadius: number): WaveRefillItem | null {
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      if (!item.alive) continue;

      const dist = playerPos.distanceTo(item.position);
      if (dist < item.radius + playerHitRadius + 0.6) {
        item.alive = false;
        return item;
      }
    }
    return null;
  }

  private removeItem(index: number) {
    const item = this.items[index];
    this.scene.remove(item.group);
    this.scene.remove(item.light);
    item.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material?.dispose();
        }
      }
    });
    this.items.splice(index, 1);
  }

  public clear() {
    for (let i = this.items.length - 1; i >= 0; i--) {
      this.removeItem(i);
    }
    this.items = [];
    this.nextSpawnZ = 85;
  }

  public dispose() {
    this.clear();
  }
}
