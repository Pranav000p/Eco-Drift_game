# Echo Drift — Implementation Plan

**A minimalist, physics-based sonar-navigation web game**
Stack: Three.js + HTML Canvas overlay, TypeScript, Node.js, WebSocket, PostgreSQL/Redis

---

## 1. Concept Summary

The player pilots a small vessel through a procedurally generated dark cavern. There is no ambient light. Tapping/clicking emits a sonar pulse that briefly illuminates nearby terrain, hazards, and collectibles as glowing wireframe outlines before fading back to black. The player builds a mental map from memory and reflex. Runs are short (60–120s), procedurally seeded, and support a daily global-leaderboard mode.

**Design pillars:**
- One-input core loop (tap/click, plus directional drift via mouse/touch position)
- Minimalist visual language: pure black background, thin neon linework, no clutter
- Short session length, high replayability, daily competitive hook

---

## 2. Visual & Aesthetic Direction

- **Palette:** `#05060a` background, single accent color per run (cyan `#5EEAD4`, or swappable via cosmetic unlocks), white for player vessel, red/amber for hazards only.
- **Shapes:** thin stroked geometry only (1–1.5px equivalent), no fills except subtle radial glow. Avoid textures entirely — everything is line + bloom.
- **Typography:** one typeface (e.g. `Space Grotesk` or `IBM Plex Mono`), all-caps small labels, generous letter-spacing, minimal HUD text.
- **Motion:** pulse rings ease-out expand + fade (cubic-bezier), never linear. Camera has slight parallax drift, no hard cuts.
- **UI chrome:** near-invisible until needed. Score/timer fade in only on interaction; menus are full-bleed black with centered thin-line typography.
- **Sound (optional v2):** procedural sonar "ping" via Web Audio, low-frequency ambient drone, no music track (keeps focus + file size small).

---

## 3. Tech Architecture

```
┌─────────────────────────────┐
│         Client (SPA)        │
│  Vite + TypeScript          │
│  Three.js (render layer)    │
│  Canvas2D (HUD overlay)     │
│  Zustand (game state)       │
└──────────────┬───────────────┘
               │ REST + WebSocket
┌──────────────▼───────────────┐
│        Node.js Backend       │
│  Fastify (API)               │
│  ws / socket.io (ghosts)     │
│  Seed generator (daily seed) │
│  Auth: anonymous UUID + opt  │
│         email upgrade        │
└──────────────┬───────────────┘
               │
      ┌────────┴─────────┐
      ▼                   ▼
  PostgreSQL           Redis
  (users, runs,        (leaderboard cache,
   leaderboard)         rate limits, sessions)
```

**Why this split:** rendering and game logic stay 100% client-side for responsiveness (no server round-trip needed for gameplay); the server only handles identity, run submission/validation, leaderboards, and optional ghost data.

---

## 4. Project Structure

```
echo-drift/
├── apps/
│   ├── client/
│   │   ├── src/
│   │   │   ├── core/
│   │   │   │   ├── GameLoop.ts
│   │   │   │   ├── InputController.ts
│   │   │   │   └── SeededRandom.ts
│   │   │   ├── render/
│   │   │   │   ├── SceneManager.ts        // Three.js scene/camera/renderer
│   │   │   │   ├── PulseSystem.ts         // sonar ring geometry + shader
│   │   │   │   ├── TerrainMesh.ts         // cavern wall generation
│   │   │   │   ├── VesselRenderer.ts
│   │   │   │   ├── PostProcessing.ts      // bloom pass (UnrealBloomPass)
│   │   │   │   └── shaders/
│   │   │   │       ├── pulse.vert.glsl
│   │   │   │       └── pulse.frag.glsl
│   │   │   ├── hud/
│   │   │   │   ├── HudOverlay.ts          // Canvas2D HUD
│   │   │   │   ├── MemoryMap.ts           // fading discovered-map trail
│   │   │   │   └── EndCard.ts             // shareable result image
│   │   │   ├── world/
│   │   │   │   ├── CavernGenerator.ts     // procedural gen from seed
│   │   │   │   ├── CollisionSystem.ts
│   │   │   │   ├── Hazards.ts
│   │   │   │   └── Collectibles.ts
│   │   │   ├── state/
│   │   │   │   └── gameStore.ts           // Zustand store
│   │   │   ├── net/
│   │   │   │   ├── api.ts                 // REST calls
│   │   │   │   └── ghostSocket.ts         // WS ghost replay stream
│   │   │   ├── App.ts
│   │   │   └── main.ts
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── package.json
│   └── server/
│       ├── src/
│       │   ├── routes/
│       │   │   ├── runs.ts                // POST /runs, GET /leaderboard
│       │   │   ├── auth.ts                // anon session issuance
│       │   │   └── daily.ts               // GET /daily-seed
│       │   ├── ws/
│       │   │   └── ghostRelay.ts
│       │   ├── db/
│       │   │   ├── schema.sql
│       │   │   └── client.ts              // pg / drizzle
│       │   ├── cache/
│       │   │   └── redis.ts
│       │   ├── validation/
│       │   │   └── runValidator.ts        // anti-cheat: replay sanity check
│       │   └── server.ts
│       └── package.json
├── packages/
│   └── shared/
│       └── src/
│           ├── types.ts                   // shared TS types (Run, Seed, etc.)
│           └── constants.ts
├── docker-compose.yml
├── turbo.json / nx.json (monorepo tooling)
└── README.md
```

---

## 5. Core Gameplay Systems

### 5.1 Sonar Pulse System
- On input: spawn expanding ring mesh (`RingGeometry` or shader-based SDF circle) at vessel position.
- Ring radius grows over ~0.8–1.2s via shader uniform `uTime`; opacity fades with `1.0 - (radius / maxRadius)`.
- As ring passes over terrain/hazard/collectible meshes, those objects briefly increase their own opacity/emissive intensity (checked via distance-from-ring-center each frame, not literal collision).
- Object "reveal decay": once pulsed, an object's visibility fades out over ~1.5–2.5s using an exponential falloff — this is the core memory-challenge mechanic.

### 5.2 Procedural Cavern Generation
- Seeded RNG (mulberry32 or similar, deterministic) drives:
  - A scrolling tunnel built from Perlin/Simplex-noise-perturbed wall splines (2D, extruded slightly for Three.js depth).
  - Hazard placement (spikes, rotating obstacles) with spacing constraints to guarantee solvability.
  - Collectible placement (score orbs, rare "clarity" pickups that widen next pulse radius).
- Daily mode reuses a fixed seed generated server-side at UTC midnight; endless/practice mode uses `Date.now()`-based random seed client-side.

### 5.3 Vessel & Controls
- Movement: vessel drifts forward automatically at constant speed (auto-scroller) OR free-roam with WASD/touch-drag — **recommend auto-scroll forward** for simplicity and mobile-friendliness; player only steers vertically/laterally.
- Single input does double duty: tap = pulse, hold-and-drag = steering vector.
- Collision with wall/hazard = run ends, triggers end card.

### 5.4 Scoring & Progression
- Score = distance traveled + collectibles - implicit time bonus for daily mode.
- Combo multiplier for chaining collectible pickups within one pulse reveal.
- Persistent meta-progression (optional v2): cosmetic pulse colors/vessel trims unlocked via total distance milestones — no pay-to-win, purely cosmetic.

---

## 6. Backend & Data Model

### 6.1 Database Schema (PostgreSQL)

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name TEXT,
  email TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  mode TEXT CHECK (mode IN ('daily','endless')),
  seed TEXT NOT NULL,
  score INTEGER NOT NULL,
  distance FLOAT NOT NULL,
  duration_ms INTEGER NOT NULL,
  replay_data JSONB,           -- compressed input trace for ghost + anti-cheat
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_runs_daily_leaderboard ON runs (mode, seed, score DESC);
```

### 6.2 API Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/anon` | issue anonymous UUID + JWT session |
| GET | `/daily-seed` | today's seed + expiry timestamp |
| POST | `/runs` | submit completed run (validated server-side) |
| GET | `/leaderboard?mode=daily` | top N scores for current seed |
| GET | `/leaderboard/around/:userId` | player's rank ± nearby players |
| WS | `/ghosts/:seed` | stream/receive lightweight ghost position data |

### 6.3 Anti-Cheat (lightweight, don't over-engineer for v1)
- Server recomputes final score bounds from submitted `replay_data` (input timestamps + seed) using the same deterministic simulation — reject submissions where recomputed score deviates beyond tolerance.
- Rate-limit run submissions per session via Redis.

---

## 7. Performance Targets

- 60fps on mid-range mobile (test on ~2021 Android mid-tier device)
- Initial load < 2.5s on 4G (code-split Three.js, lazy-load post-processing bundle)
- Total JS bundle (gzipped) target: < 350KB for core game
- Use `OffscreenCanvas` + Web Worker for HUD/minimap rendering if main-thread frame time exceeds budget

---

## 8. Milestone Plan

**Phase 1 — Core Prototype (Week 1–2)**
- Three.js scene boilerplate, vessel movement, single pulse reveal mechanic on primitive shapes
- No backend yet; local-only

**Phase 2 — Procedural World + Game Feel (Week 3–4)**
- Cavern generator, hazards, collectibles, collision, bloom post-processing
- Polish pulse shader, decay timing, camera parallax
- Minimalist HUD + end card

**Phase 3 — Backend + Daily Mode (Week 5–6)**
- Node/Fastify API, Postgres schema, anon auth, run submission + validation
- Daily seed generation (cron or on-demand computed from UTC date)
- Leaderboard UI

**Phase 4 — Social/Retention Layer (Week 7)**
- Ghost replays via WebSocket
- Shareable end-card image export (Canvas → PNG → Web Share API / clipboard)
- Analytics events (session start, run complete, share click) via lightweight self-hosted or Plausible

**Phase 5 — Production Hardening (Week 8)**
- Load testing on leaderboard endpoints
- CDN for static assets (Cloudflare/Vercel edge)
- Error monitoring (Sentry), uptime monitoring
- Mobile touch-input QA pass across devices

---

## 9. Deployment

- **Client:** static build (Vite) → Vercel/Netlify/Cloudflare Pages
- **Server:** Node/Fastify → Fly.io / Railway / Render (containerized via Docker)
- **DB:** managed Postgres (Neon/Supabase/RDS) + managed Redis (Upstash)
- **CI/CD:** GitHub Actions — lint/typecheck/test → build → deploy on merge to `main`

```yaml
# docker-compose.yml (local dev)
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: dev
    ports: ["5432:5432"]
  redis:
    image: redis:7
    ports: ["6379:6379"]
```

---

## 10. Key npm Packages

**Client:** `three`, `zustand`, `vite`, `typescript`, `three/examples/jsm/postprocessing/*` (UnrealBloomPass), `simplex-noise`

**Server:** `fastify`, `ws` (or `socket.io`), `pg` or `drizzle-orm`, `ioredis`, `zod` (validation), `jsonwebtoken`

---

## 11. Success Metrics (post-launch)

- D1/D7 retention (daily-seed mode is the primary lever here)
- Average session length vs. runs-per-session (want high replay count, not long sessions)
- Share-click rate from end card
- Leaderboard participation rate (% of players who submit a run vs. just play once)

---

## Next Steps for Antigravity IDE

1. Scaffold monorepo (`apps/client`, `apps/server`, `packages/shared`) per structure above.
2. Start with Phase 1 prototype — get the pulse-reveal loop feeling good before touching backend.
3. Lock the visual language (Section 2) into a small `theme.ts`/CSS variables file early so every subsequent component pulls from one source of truth.
