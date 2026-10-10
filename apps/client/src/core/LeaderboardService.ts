import type { RunSubmission, LeaderboardEntry } from '@echo-drift/shared';

export interface LeaderboardResponse {
  mode: string;
  seed: string;
  order: 'desc' | 'asc';
  total: number;
  bestScore: number;
  worstScore: number;
  entries: LeaderboardEntry[];
}

export interface RunSubmitResponse {
  success: boolean;
  runId: string;
  score: number;
  rank: number;
  totalRuns: number;
}

const DEFAULT_CALLSIGNS = [
  'NEXUS-9', 'PHOENIX-7', 'VIPER-X', 'DRIFTER-01', 'CYBER-FOX',
  'TITAN-4', 'SPECTRE-8', 'CHRONO-3', 'SOLARIS-5', 'GHOST-00'
];

export class LeaderboardService {
  private userId: string;
  private pilotName: string;

  constructor() {
    this.userId = this.getOrCreateUserId();
    this.pilotName = this.getOrCreatePilotName();
  }

  public getUserId(): string {
    return this.userId;
  }

  public getPilotName(): string {
    return this.pilotName;
  }

  public setPilotName(name: string) {
    const trimmed = name.trim().slice(0, 16) || 'PILOT-01';
    this.pilotName = trimmed;
    try {
      localStorage.setItem('echo_pilot_name', trimmed);
    } catch {
      // Storage restricted
    }
  }

  private getOrCreateUserId(): string {
    try {
      const stored = localStorage.getItem('echo_user_id');
      if (stored) return stored;
      const newId = 'usr_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
      localStorage.setItem('echo_user_id', newId);
      return newId;
    } catch {
      return 'usr_' + Math.random().toString(36).substring(2, 10);
    }
  }

  private getOrCreatePilotName(): string {
    try {
      const stored = localStorage.getItem('echo_pilot_name');
      if (stored && stored.trim().length > 0) return stored.trim();
      const randName = DEFAULT_CALLSIGNS[Math.floor(Math.random() * DEFAULT_CALLSIGNS.length)];
      localStorage.setItem('echo_pilot_name', randName);
      return randName;
    } catch {
      return 'PILOT-01';
    }
  }

  public async submitRun(data: {
    seed: string;
    score: number;
    distance: number;
    durationMs: number;
    enemiesDestroyed: number;
    dodgesCount: number;
  }): Promise<RunSubmitResponse | null> {
    const payload: RunSubmission = {
      userId: this.userId,
      displayName: this.pilotName,
      mode: 'endless',
      seed: data.seed,
      score: Math.floor(data.score),
      distance: parseFloat(data.distance.toFixed(1)),
      durationMs: Math.floor(data.durationMs),
      enemiesDestroyed: data.enemiesDestroyed,
      dodgesCount: data.dodgesCount
    };

    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        console.warn('Leaderboard run submit failed status:', res.status);
        return null;
      }

      return (await res.json()) as RunSubmitResponse;
    } catch (err) {
      console.warn('Network error submitting run to leaderboard:', err);
      return null;
    }
  }

  public async getLeaderboard(order: 'desc' | 'asc' = 'desc', limit = 50): Promise<LeaderboardResponse | null> {
    try {
      const res = await fetch(`/api/leaderboard?limit=${limit}&order=${order}&mode=all`);
      if (!res.ok) {
        console.warn('Failed to fetch leaderboard:', res.status);
        return null;
      }
      return (await res.json()) as LeaderboardResponse;
    } catch (err) {
      console.warn('Network error fetching leaderboard:', err);
      return null;
    }
  }
}

export const leaderboardService = new LeaderboardService();
