-- Echo Drift PostgreSQL Production Schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name TEXT NOT NULL,
  email TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('daily', 'endless')),
  seed TEXT NOT NULL,
  score INTEGER NOT NULL,
  distance FLOAT NOT NULL,
  duration_ms INTEGER NOT NULL,
  collectibles_count INTEGER DEFAULT 0,
  pulses_count INTEGER DEFAULT 0,
  max_combo INTEGER DEFAULT 1,
  replay_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_runs_daily_leaderboard ON runs (mode, seed, score DESC);
CREATE INDEX IF NOT EXISTS idx_runs_user_id ON runs (user_id);
