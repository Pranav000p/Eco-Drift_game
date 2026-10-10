import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RunSubmission, LeaderboardEntry, GhostFrame, GameMode } from '@echo-drift/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'runs.json');

export interface StoredUser {
  id: string;
  displayName: string;
  email?: string;
  createdAt: string;
}

export interface StoredRun extends RunSubmission {
  id: string;
  createdAt: string;
}

export interface RecordRunResult extends StoredRun {
  rank: number;
  totalRuns: number;
}

class GameStore {
  private users: Map<string, StoredUser> = new Map();
  private runs: StoredRun[] = [];

  constructor() {
    this.loadFromDisk();
  }

  private loadFromDisk() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.users)) {
          this.users = new Map(parsed.users.map((u: StoredUser) => [u.id, u]));
        }
        if (Array.isArray(parsed.runs) && parsed.runs.length > 0) {
          this.runs = parsed.runs;
          return;
        }
      }
    } catch (err) {
      console.warn('Could not load existing store data, seeding initial benchmarks:', err);
    }

    this.seedInitialData();
    this.saveToDisk();
  }

  private saveToDisk() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const data = {
        users: Array.from(this.users.values()),
        runs: this.runs
      };
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save game data to disk:', err);
    }
  }

  private seedInitialData() {
    // Generate initial leaderboard benchmarks so players have rivals to beat
    const botPilots = [
      { name: 'NEXUS-7', score: 3840, distance: 740, durationMs: 48000, enemiesDestroyed: 4, dodgesCount: 8 },
      { name: 'VOID_DRIFTER', score: 2950, distance: 580, durationMs: 38000, enemiesDestroyed: 3, dodgesCount: 6 },
      { name: 'CHRONO_SONAR', score: 2120, distance: 430, durationMs: 29000, enemiesDestroyed: 2, dodgesCount: 5 },
      { name: 'ECHO_WALKER', score: 1450, distance: 310, durationMs: 22000, enemiesDestroyed: 1, dodgesCount: 3 },
      { name: 'ABYSS_DIVER', score: 820, distance: 180, durationMs: 14000, enemiesDestroyed: 0, dodgesCount: 2 }
    ];

    const todayDate = new Date().toISOString().slice(0, 10);
    const dailySeed = `echo-${todayDate}`;

    botPilots.forEach((pilot, idx) => {
      const uId = crypto.randomUUID();
      this.users.set(uId, {
        id: uId,
        displayName: pilot.name,
        createdAt: new Date(Date.now() - 3600000 * (idx + 1)).toISOString()
      });

      // Synthetic ghost trace for top bot
      const dummyReplay: GhostFrame[] = [];
      const frameCount = Math.floor(pilot.durationMs / 100);
      for (let f = 0; f < Math.min(frameCount, 150); f++) {
        dummyReplay.push({
          t: f * 100,
          x: Math.sin(f * 0.15) * 2.5,
          y: Math.cos(f * 0.12) * 2.0,
          z: (f / frameCount) * pilot.distance,
          p: f % 18 === 0 ? 1 : 0
        });
      }

      this.runs.push({
        id: crypto.randomUUID(),
        userId: uId,
        displayName: pilot.name,
        mode: 'endless',
        seed: dailySeed,
        score: pilot.score,
        distance: pilot.distance,
        durationMs: pilot.durationMs,
        enemiesDestroyed: pilot.enemiesDestroyed,
        dodgesCount: pilot.dodgesCount,
        collectiblesCount: Math.floor(pilot.score / 250),
        pulsesCount: Math.floor(pilot.durationMs / 1200),
        maxCombo: Math.min(4, idx + 1),
        replayData: dummyReplay,
        createdAt: new Date(Date.now() - 3600000 * (idx + 1)).toISOString()
      });
    });
  }

  public async getOrCreateUser(userId?: string, displayName?: string): Promise<StoredUser> {
    if (userId && this.users.has(userId)) {
      const user = this.users.get(userId)!;
      if (displayName && displayName !== user.displayName) {
        user.displayName = displayName;
        this.saveToDisk();
      }
      return user;
    }

    const newId = userId || crypto.randomUUID();
    const name = displayName || `Vessel-${newId.slice(0, 5).toUpperCase()}`;
    const newUser: StoredUser = {
      id: newId,
      displayName: name,
      createdAt: new Date().toISOString()
    };
    this.users.set(newId, newUser);
    this.saveToDisk();
    return newUser;
  }

  public async getUser(userId: string): Promise<StoredUser | undefined> {
    return this.users.get(userId);
  }

  public async recordRun(submission: RunSubmission): Promise<RecordRunResult> {
    const run: StoredRun = {
      ...submission,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString()
    };

    // Ensure user exists
    await this.getOrCreateUser(submission.userId, submission.displayName);

    this.runs.push(run);
    this.saveToDisk();

    // Calculate global rank (1 = highest score)
    const rank = this.runs.filter((r) => r.score > run.score).length + 1;

    return {
      ...run,
      rank,
      totalRuns: this.runs.length
    };
  }

  public async getLeaderboard(
    mode: string = 'all',
    seed: string = '',
    limit = 50,
    order: 'desc' | 'asc' = 'desc'
  ): Promise<{ entries: LeaderboardEntry[]; total: number; bestScore: number; worstScore: number }> {
    // Filter matching runs
    let matching = this.runs.filter((r) => {
      if (mode !== 'all' && r.mode !== mode) return false;
      if (seed && r.seed !== seed) return false;
      return true;
    });

    const total = matching.length;
    if (total === 0) {
      return { entries: [], total: 0, bestScore: 0, worstScore: 0 };
    }

    // Sort to determine global absolute ranks (always best-first)
    const absoluteSorted = [...matching].sort((a, b) => b.score - a.score);
    const bestScore = absoluteSorted[0]?.score ?? 0;
    const worstScore = absoluteSorted[absoluteSorted.length - 1]?.score ?? 0;

    // Attach global absolute rank to each run
    const withRank = absoluteSorted.map((r, idx) => ({
      ...r,
      globalRank: idx + 1
    }));

    // Apply requested sort order
    if (order === 'asc') {
      // Worst to best
      withRank.sort((a, b) => a.score - b.score);
    }

    const sliced = withRank.slice(0, limit);

    const entries: LeaderboardEntry[] = sliced.map((r, index) => ({
      rank: order === 'asc' ? total - r.globalRank + 1 : r.globalRank,
      id: r.id,
      userId: r.userId,
      displayName: r.displayName,
      mode: r.mode,
      seed: r.seed,
      score: r.score,
      distance: r.distance,
      durationMs: r.durationMs,
      enemiesDestroyed: r.enemiesDestroyed ?? 0,
      dodgesCount: r.dodgesCount ?? 0,
      createdAt: r.createdAt,
      hasGhost: Boolean(r.replayData && r.replayData.length > 0)
    }));

    return {
      entries,
      total,
      bestScore,
      worstScore
    };
  }

  public async getTopGhosts(seed: string, limit = 3): Promise<{ userId: string; displayName: string; frames: GhostFrame[] }[]> {
    const matching = this.runs
      .filter((r) => r.seed === seed && r.replayData && r.replayData.length > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return matching.map((r) => ({
      userId: r.userId,
      displayName: r.displayName,
      frames: r.replayData!
    }));
  }
}

export const store = new GameStore();
