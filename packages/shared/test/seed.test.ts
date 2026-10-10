import { SeededRNG, DeterministicNoise, getUtcDailySeed } from '../src/seed.js';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  }
}

console.log('--- Testing SeededRNG Determinism ---');
const rng1 = new SeededRNG('test-seed-123');
const val1_1 = rng1.next();
const val1_2 = rng1.next();

const rng2 = new SeededRNG('test-seed-123');
const val2_1 = rng2.next();
const val2_2 = rng2.next();

assert(val1_1 === val2_1, 'RNG step 1 must be identical for identical seeds');
assert(val1_2 === val2_2, 'RNG step 2 must be identical for identical seeds');
console.log('✓ SeededRNG determinism passed');

console.log('--- Testing DeterministicNoise Continuity ---');
const noise1 = new DeterministicNoise('echo-2026-09-23');
const noise2 = new DeterministicNoise('echo-2026-09-23');

for (let z = 0; z < 100; z += 5) {
  const n1 = noise1.octave1D(z * 0.05);
  const n2 = noise2.octave1D(z * 0.05);
  assert(Math.abs(n1 - n2) < 0.000001, `Noise at z=${z} must match across instances`);
}
console.log('✓ DeterministicNoise continuity passed');

console.log('--- Testing UTC Daily Seed Generator ---');
const date = new Date(Date.UTC(2026, 8, 23, 12, 0, 0));
const dailySeed = getUtcDailySeed(date);
assert(dailySeed === 'echo-2026-09-23', `Expected echo-2026-09-23, got ${dailySeed}`);
console.log('✓ UTC daily seed format passed');

console.log('\nAll verification tests passed successfully! 🎉');
