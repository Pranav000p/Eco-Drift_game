import { GAME_CONSTANTS, type RunSubmission } from '@echo-drift/shared';

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export function validateRunSubmission(run: RunSubmission): ValidationResult {
  if (!run.seed || typeof run.seed !== 'string') {
    return { valid: false, reason: 'Missing or invalid seed' };
  }

  if (run.durationMs <= 0 || run.distance <= 0) {
    return { valid: false, reason: 'Invalid duration or distance' };
  }

  const durationSec = run.durationMs / 1000;

  // Maximum physically achievable distance within this duration
  const maxPossibleSpeed = GAME_CONSTANTS.MAX_FORWARD_SPEED * GAME_CONSTANTS.VALIDATION.MAX_SPEED_TOLERANCE;
  const maxPossibleDistance = maxPossibleSpeed * durationSec + 5.0; // 5m cushion

  if (run.distance > maxPossibleDistance) {
    return {
      valid: false,
      reason: `Physically implausible distance: ${run.distance.toFixed(1)}m in ${durationSec.toFixed(1)}s (max possible: ${maxPossibleDistance.toFixed(1)}m)`
    };
  }

  // Minimum duration check per meter
  const minRequiredMs = run.distance * GAME_CONSTANTS.VALIDATION.MIN_DURATION_PER_METER_MS;
  if (run.durationMs < minRequiredMs) {
    return {
      valid: false,
      reason: `Duration too fast for distance traveled: ${run.durationMs}ms for ${run.distance}m`
    };
  }

  // Maximum score bounds check
  const maxScoreFromDistance = run.distance * GAME_CONSTANTS.SCORE_PER_METER;
  const maxScoreFromTime = durationSec * GAME_CONSTANTS.SCORE_PER_SECOND;
  const maxScoreFromEnemies = (run.enemiesDestroyed ?? Math.ceil(durationSec / 2)) * GAME_CONSTANTS.ENEMY_KILL_SCORE;
  const maxScoreFromDodges = (run.dodgesCount ?? Math.ceil(durationSec * 2)) * GAME_CONSTANTS.RED_BALL_DODGE_SCORE;
  const maxScoreFromCrystals = (run.collectiblesCount ?? 0) * GAME_CONSTANTS.CRYSTAL_BASE_SCORE * GAME_CONSTANTS.COMBO_MAX_MULTIPLIER;
  const maxAllowedScore = (maxScoreFromDistance + maxScoreFromTime + maxScoreFromEnemies + maxScoreFromDodges + maxScoreFromCrystals) * 2.0 + 1000;

  if (run.score > maxAllowedScore) {
    return {
      valid: false,
      reason: `Score exceeds mathematical ceiling: claimed ${run.score}, ceiling ${Math.round(maxAllowedScore)}`
    };
  }

  // Replay frame sanity checks
  if (run.replayData && run.replayData.length > 1) {
    let lastT = -1;
    let lastZ = -10;

    for (let i = 0; i < run.replayData.length; i++) {
      const f = run.replayData[i];
      if (f.t < lastT) {
        return { valid: false, reason: `Replay timestamp non-monotonic at frame ${i}` };
      }
      if (f.z < lastZ - 1.0) {
        return { valid: false, reason: `Replay Z coordinate backwards jump at frame ${i}` };
      }
      lastT = f.t;
      lastZ = f.z;
    }
  }

  return { valid: true };
}
