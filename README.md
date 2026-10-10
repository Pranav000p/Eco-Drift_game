# 📡 Echo Drift

> **A minimalist, physics-based sonar-navigation web game**  
> *Pilot an acoustic vessel through a pitch-black procedural abyss. Illuminate hazards, resonance crystals, and winding caverns with acoustic sonar pulses.*

---

## ⚡ Key Features

- **Sonar Pulse Echo Mechanics**: Expanding wavefronts illuminate wireframe terrain, rotating laser hazards, and resonance crystals before fading into the dark.
- **Procedural Cavern System**: Deterministic spline tunnels driven by Mulberry32 PRNG and octave noise functions — same seed produces identical caverns.
- **Procedural Web Audio Engine**: Synthesizes sub-bass cavern drones, resonant sonar pings with acoustic reverb, combo crystal chimes, and collision impacts using the browser Web Audio API — zero heavy static audio files.
- **Daily Global Challenge & Endless Mode**: Synchronized with UTC midnight for a shared daily competition across all pilots worldwide.
- **Real-Time Ghost Relays & Replays**: WebSocket stream and replay verification allows players to race alongside top competitor ghost vessels.
- **Anti-Cheat Validation**: Deterministic server-side physics and velocity verification for all run submissions.
- **Telemetry Export Card**: One-click high-resolution Canvas2D telemetry end-card generator with clipboard copy and PNG download.

---

## 🚀 Quick Start (Zero Config)

### Prerequisites
- Node.js >= 18
- npm >= 9

### 1. Install & Run Locally

```bash
# Clone and enter directory
cd game

# Install all workspace dependencies
npm install

# Start both backend API (port 3001) and client dev server (port 5173)
npm run dev:all
```

Now open `http://localhost:5173` in your browser.

- Alternatively, run only the client in standalone offline mode:
  ```bash
  npm run dev
  ```

---

## 🕹️ Controls

| Action | Desktop Controls | Mobile / Touch |
|---|---|---|
| **Sonar Pulse** | `[ SPACE ]` or `[ Left Click ]` | `[ Tap Screen ]` |
| **Pitch & Drift Steering** | `[ W / S ]` or `[ Up / Down ]` or `[ Mouse Drag ]` | `[ Touch Drag Vector ]` |

---

## 🐳 Docker Deployment

To run the complete production stack (PostgreSQL 16, Redis 7, Echo Drift Fastify Server):

```bash
docker compose up -d
```

---

## 📂 Project Architecture

```
game/
├── package.json               # Root monorepo workspace
├── docker-compose.yml         # Postgres + Redis + Server containers
├── packages/
│   └── shared/                # Types, physics constants, Mulberry32 PRNG
└── apps/
    ├── client/                # Three.js + Canvas2D HUD + Procedural Audio + Vite
    └── server/                # Fastify REST API + WebSockets + Anti-cheat validation
```
