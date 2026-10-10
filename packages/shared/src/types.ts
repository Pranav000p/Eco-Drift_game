export type GameMode = 'daily' | 'endless' | 'speedrun';

export interface GhostFrame {
  t: number;
  x: number;
  y: number;
  z: number;
  p?: number;
  pitch?: number;
  yaw?: number;
  roll?: number;
}

export interface RunSubmission {
  userId: string;
  displayName: string;
  mode: GameMode;
  seed: string;
  score: number;
  distance: number;
  durationMs: number;
  enemiesDestroyed?: number;
  dodgesCount?: number;
  collectiblesCount?: number;
  pulsesCount?: number;
  maxCombo?: number;
  replayData?: GhostFrame[];
}

export interface LeaderboardEntry {
  rank: number;
  id?: string;
  userId: string;
  displayName: string;
  mode?: GameMode;
  seed?: string;
  score: number;
  distance: number;
  durationMs: number;
  enemiesDestroyed?: number;
  dodgesCount?: number;
  createdAt: string;
  hasGhost?: boolean;
  hasReplay?: boolean;
}

export interface AuthSession {
  userId: string;
  displayName: string;
  token: string;
}

export interface DailySeedResponse {
  seed: string;
  date: string;
  expiresAt: string;
  remainingMs: number;
}

export interface GhostMessage {
  userId?: string;
  displayName?: string;
  frame?: GhostFrame;
  [key: string]: unknown;
}
