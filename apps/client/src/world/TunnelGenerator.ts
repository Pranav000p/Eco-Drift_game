import * as THREE from 'three';
import { DeterministicNoise, GAME_CONSTANTS } from '@echo-drift/shared';

export interface TunnelRing {
  index: number;
  z: number;
  centerX: number;
  centerY: number;
  radius: number;
  mesh: THREE.LineLoop;
}

/**
 * Procedural infinite tunnel generator.
 * Creates a large cylindrical tunnel with gently curving path.
 */
export class TunnelGenerator {
  private noise: DeterministicNoise;
  private rings: TunnelRing[] = [];
  private longitudinalLines: THREE.LineSegments[] = [];
  private pointsPerRing = GAME_CONSTANTS.TUNNEL_SEGMENTS_PER_RING;
  private ringTemplate: THREE.BufferGeometry;

  constructor(
    private scene: THREE.Scene,
    seed: string
  ) {
    this.noise = new DeterministicNoise(seed);
    this.ringTemplate = this.createRingTemplate();
  }

  private createRingTemplate(): THREE.BufferGeometry {
    const positions = new Float32Array(this.pointsPerRing * 3);
    for (let i = 0; i < this.pointsPerRing; i++) {
      const angle = (i / this.pointsPerRing) * Math.PI * 2;
      positions[i * 3] = Math.cos(angle);
      positions[i * 3 + 1] = Math.sin(angle);
      positions[i * 3 + 2] = 0;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }

  /**
   * Get the tunnel center and radius at a given Z depth.
   * The tunnel gently curves but stays large enough for gameplay.
   */
  public getTunnelCenter(z: number): { x: number; y: number; radius: number } {
    const scale = 0.012;
    const nx = this.noise.octave1D(z * scale, 3);
    const ny = this.noise.octave1D(z * scale + 100, 3);

    const amplitude = GAME_CONSTANTS.TUNNEL_CURVE_AMPLITUDE;
    const x = nx * amplitude;
    const y = ny * amplitude * 0.6;
    const radius = GAME_CONSTANTS.TUNNEL_RADIUS;

    return { x, y, radius };
  }

  public initTunnel() {
    for (let i = 0; i < GAME_CONSTANTS.VISIBLE_SEGMENTS; i++) {
      this.spawnRing(i);
    }
    this.createLongitudinalRails();
  }

  private spawnRing(index: number) {
    const z = index * GAME_CONSTANTS.SEGMENT_LENGTH;
    const center = this.getTunnelCenter(z);

    const mat = new THREE.LineBasicMaterial({
      color: GAME_CONSTANTS.PALETTE.TUNNEL_WALL,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending
    });

    const mesh = new THREE.LineLoop(this.ringTemplate.clone(), mat);
    mesh.position.set(center.x, center.y, z);
    mesh.scale.set(center.radius, center.radius, 1);

    this.scene.add(mesh);

    this.rings.push({
      index,
      z,
      centerX: center.x,
      centerY: center.y,
      radius: center.radius,
      mesh
    });
  }

  private createLongitudinalRails() {
    const railCount = 8;
    for (let r = 0; r < railCount; r++) {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(GAME_CONSTANTS.VISIBLE_SEGMENTS * 6);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

      const mat = new THREE.LineBasicMaterial({
        color: GAME_CONSTANTS.PALETTE.TUNNEL_GLOW,
        transparent: true,
        opacity: 0.06,
        blending: THREE.AdditiveBlending
      });

      const line = new THREE.LineSegments(geo, mat);
      this.scene.add(line);
      this.longitudinalLines.push(line);
    }
  }

  /**
   * Updates tunnel: recycles rings behind the player and spawns new ones ahead.
   * Adds a pulsing glow effect to nearby rings.
   */
  public update(vesselZ: number, _dt = 0) {
    const currentSegment = Math.floor(vesselZ / GAME_CONSTANTS.SEGMENT_LENGTH);

    // Recycle old rings behind
    while (this.rings.length > 0 && this.rings[0].index < currentSegment - 3) {
      const old = this.rings.shift()!;
      this.scene.remove(old.mesh);
      old.mesh.geometry.dispose();
      (old.mesh.material as THREE.Material).dispose();
    }

    // Spawn ahead
    const furthestIndex = this.rings.length > 0 ? this.rings[this.rings.length - 1].index : currentSegment;
    const targetFurthest = currentSegment + GAME_CONSTANTS.VISIBLE_SEGMENTS;
    for (let i = furthestIndex + 1; i <= targetFurthest; i++) {
      this.spawnRing(i);
    }

    // Glow proximity effect — rings near the player glow brighter
    const wallColor = new THREE.Color(GAME_CONSTANTS.PALETTE.TUNNEL_WALL);
    const glowColor = new THREE.Color(GAME_CONSTANTS.PALETTE.TUNNEL_GLOW);
    const accentColor = new THREE.Color(GAME_CONSTANTS.PALETTE.TUNNEL_ACCENT);
    const time = performance.now() * 0.001;

    for (const ring of this.rings) {
      const dist = Math.abs(ring.z - vesselZ);
      const proximity = Math.max(0, 1.0 - dist / 80);
      const pulse = Math.sin(time * 2 + ring.index * 0.3) * 0.15 + 0.85;

      const mat = ring.mesh.material as THREE.LineBasicMaterial;

      // Blend between wall color and glow based on distance
      const lerpFactor = proximity * pulse * 0.6;
      mat.color.copy(wallColor).lerp(
        ring.index % 3 === 0 ? accentColor : glowColor,
        lerpFactor
      );
      mat.opacity = 0.15 + proximity * 0.6 * pulse;
    }

    // Update rail lines
    this.updateLongitudinalRails();
  }

  private updateLongitudinalRails() {
    if (this.rings.length < 2) return;

    const railCount = this.longitudinalLines.length;
    for (let r = 0; r < railCount; r++) {
      const angle = (r / railCount) * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      const line = this.longitudinalLines[r];
      const posAttr = line.geometry.attributes.position as THREE.BufferAttribute;
      const positions = posAttr.array as Float32Array;

      let pIdx = 0;
      for (let i = 0; i < this.rings.length - 1 && pIdx < positions.length - 5; i++) {
        const r1 = this.rings[i];
        const r2 = this.rings[i + 1];

        positions[pIdx++] = r1.centerX + cosA * r1.radius;
        positions[pIdx++] = r1.centerY + sinA * r1.radius;
        positions[pIdx++] = r1.z;

        positions[pIdx++] = r2.centerX + cosA * r2.radius;
        positions[pIdx++] = r2.centerY + sinA * r2.radius;
        positions[pIdx++] = r2.z;
      }

      // Zero out remaining positions
      while (pIdx < positions.length) {
        positions[pIdx++] = 0;
      }

      posAttr.needsUpdate = true;
    }
  }

  public dispose() {
    for (const ring of this.rings) {
      this.scene.remove(ring.mesh);
      ring.mesh.geometry.dispose();
      (ring.mesh.material as THREE.Material).dispose();
    }
    for (const line of this.longitudinalLines) {
      this.scene.remove(line);
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    }
    this.ringTemplate.dispose();
    this.rings = [];
    this.longitudinalLines = [];
  }
}
