/**
 * Mulberry32 32-bit deterministic PRNG.
 */
export class SeededRNG {
  private state: number;

  constructor(seed: string | number) {
    this.state = typeof seed === 'number' ? seed >>> 0 : SeededRNG.hashString(seed);
  }

  public static hashString(str: string): number {
    let hash = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      hash = Math.imul(hash ^ str.charCodeAt(i), 3432918353);
      hash = (hash << 13) | (hash >>> 19);
    }
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    return (hash ^ (hash >>> 16)) >>> 0;
  }

  /**
   * Returns a deterministic float in [0, 1)
   */
  public next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Returns a deterministic float in [min, max)
   */
  public range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /**
   * Returns a deterministic integer in [min, max]
   */
  public int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  public choice<T>(array: T[]): T {
    return array[this.int(0, array.length - 1)];
  }
}

/**
 * 1D / 2D smooth deterministic cosine/cubic interpolation noise for tunnel geometry.
 */
export class DeterministicNoise {
  private rng: SeededRNG;
  private perm: number[] = [];

  constructor(seed: string | number) {
    this.rng = new SeededRNG(seed);
    const p: number[] = [];
    for (let i = 0; i < 256; i++) {
      p.push(i);
    }
    // Fisher-Yates shuffle
    for (let i = 255; i > 0; i--) {
      const j = this.rng.int(0, i);
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }
    this.perm = p.concat(p);
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(t: number, a: number, b: number): number {
    return a + t * (b - a);
  }

  private grad1d(hash: number, x: number): number {
    return (hash & 1) === 0 ? x : -x;
  }

  public noise1D(x: number): number {
    const xi = Math.floor(x) & 255;
    const xf = x - Math.floor(x);
    const u = this.fade(xf);

    const g0 = this.grad1d(this.perm[xi], xf);
    const g1 = this.grad1d(this.perm[xi + 1], xf - 1);

    return this.lerp(u, g0, g1) * 2.0;
  }

  public octave1D(x: number, octaves = 3, persistence = 0.5): number {
    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxValue = 0;
    for (let i = 0; i < octaves; i++) {
      total += this.noise1D(x * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }
    return total / maxValue;
  }
}

/**
 * Generates the deterministic daily seed string based on UTC date.
 * Format: "echo-YYYY-MM-DD"
 */
export function getUtcDailySeed(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `echo-${y}-${m}-${d}`;
}
