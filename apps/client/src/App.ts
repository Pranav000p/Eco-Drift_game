import * as THREE from 'three';
import { GAME_CONSTANTS } from '@echo-drift/shared';
import { SceneManager } from './render/SceneManager.js';
import { EchoWaveSystem } from './render/EchoWaveSystem.js';
import { VesselRenderer } from './render/VesselRenderer.js';
import { TunnelGenerator } from './world/TunnelGenerator.js';
import { ObstacleManager } from './world/ObstacleManager.js';
import { EnemyManager } from './world/EnemyManager.js';
import { RedBallManager } from './world/RedBallManager.js';
import { InputController } from './core/InputController.js';
import { audio } from './core/AudioManager.js';
import { HudOverlay } from './hud/HudOverlay.js';
import { WaveRefillManager } from './world/WaveRefillManager.js';

import { leaderboardService } from './core/LeaderboardService.js';
import { LeaderboardModal } from './hud/LeaderboardModal.js';

export type GameState = 'MENU' | 'PLAYING' | 'GAMEOVER';

export class App {
  private state: GameState = 'MENU';
  private sceneMgr: SceneManager;
  private echoWaveSys: EchoWaveSystem;
  private playerVessel: VesselRenderer;
  private tunnel: TunnelGenerator | null = null;
  private obstacles: ObstacleManager | null = null;
  private enemies: EnemyManager | null = null;
  private redBalls: RedBallManager | null = null;
  private waveRefills: WaveRefillManager | null = null;
  private input: InputController;
  private hud: HudOverlay;
  private leaderboardModal: LeaderboardModal;

  // Player state
  private vesselPos = new THREE.Vector3(0, 0, 0);
  private vesselVel = new THREE.Vector3(0, 0, GAME_CONSTANTS.BASE_FORWARD_SPEED);
  private vesselRot = new THREE.Euler(0, 0, 0, 'YXZ');

  // Wave weapon ammo & surge state
  private waveCharges = 3;
  private readonly maxWaveCharges = 9;
  private surgeTimer = 0;

  // Run metrics
  private score = 0;
  private distance = 0;
  private runStartTime = 0;
  private durationMs = 0;
  private enemiesDestroyed = 0;
  private dodgesCount = 0;
  private echoWavesFired = 0;
  private lastEchoWaveTime = -9999;
  private graceTimer = 0;
  private currentSeed = '';
  private lastSubmittedRunId: string | null = null;

  // HTML UI elements
  private titleScreenEl: HTMLElement;
  private gameoverScreenEl: HTMLElement;
  private audioStatusLabel: HTMLElement;

  private lastTime = 0;

  constructor() {
    const webglCanvas = document.getElementById('webgl-canvas') as HTMLCanvasElement;
    const hudCanvas = document.getElementById('hud-canvas') as HTMLCanvasElement;

    this.sceneMgr = new SceneManager(webglCanvas);
    this.echoWaveSys = new EchoWaveSystem(this.sceneMgr.scene);
    this.playerVessel = new VesselRenderer(this.sceneMgr.scene);
    this.playerVessel.setVisible(false);

    this.input = new InputController(document.getElementById('app')!);
    this.hud = new HudOverlay(hudCanvas);
    this.leaderboardModal = new LeaderboardModal();

    this.titleScreenEl = document.getElementById('title-screen')!;
    this.gameoverScreenEl = document.getElementById('gameover-screen')!;
    this.audioStatusLabel = document.getElementById('audio-status-label')!;

    this.setupUIEvents();
    this.updateDeviceInstructionHints();

    // Initial camera position for menu
    this.sceneMgr.camera.position.set(0, 1.5, -8);
    this.sceneMgr.camera.lookAt(0, 0, 15);

    requestAnimationFrame(this.loop.bind(this));
  }

  private updateDeviceInstructionHints() {
    const isTouch = (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia('(pointer: coarse)').matches
    );

    const steerHint = document.getElementById('hint-steer');
    const fireHint = document.getElementById('hint-fire');
    if (isTouch) {
      if (steerHint) steerHint.innerText = '[ LEFT THUMB ] DRAG JOYSTICK';
      if (fireHint) fireHint.innerText = '[ RIGHT THUMB ] TAP FIRE WAVE';
    } else {
      if (steerHint) steerHint.innerText = '[ W/A/S/D ] or [ ARROWS ]';
      if (fireHint) fireHint.innerText = '[ SPACE ] or [ CLICK ]';
    }
  }

  private setupUIEvents() {
    document.getElementById('btn-start')?.addEventListener('click', () => {
      this.startRun();
    });

    document.getElementById('btn-retry')?.addEventListener('click', () => {
      this.startRun();
    });

    document.getElementById('btn-return-menu')?.addEventListener('click', () => {
      this.returnToMenu();
    });

    document.getElementById('btn-audio-toggle')?.addEventListener('click', () => {
      audio.init();
      const active = audio.toggleMute();
      this.audioStatusLabel.innerText = active ? 'ENABLED' : 'MUTED';
    });

    // Pilot Callsign Input
    const pilotInput = document.getElementById('pilot-name-input') as HTMLInputElement;
    if (pilotInput) {
      pilotInput.value = leaderboardService.getPilotName();
      const updateName = () => {
        leaderboardService.setPilotName(pilotInput.value);
      };
      pilotInput.addEventListener('change', updateName);
      pilotInput.addEventListener('blur', updateName);
    }

    // Leaderboard Open Triggers
    document.getElementById('btn-open-leaderboard')?.addEventListener('click', () => {
      this.leaderboardModal.open();
    });
    document.getElementById('btn-top-leaderboard')?.addEventListener('click', () => {
      this.leaderboardModal.open();
    });
    document.getElementById('btn-gameover-leaderboard')?.addEventListener('click', () => {
      this.leaderboardModal.open(this.lastSubmittedRunId || undefined);
    });

    // Fullscreen Toggle
    const fsBtn = document.getElementById('btn-fullscreen');
    if (fsBtn) {
      fsBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      });
      document.addEventListener('fullscreenchange', () => {
        const isFs = !!document.fullscreenElement;
        fsBtn.classList.toggle('active', isFs);
      });
    }

    window.addEventListener('resize', () => {
      this.updateDeviceInstructionHints();
    });
  }

  private startRun() {
    audio.init();
    audio.resume();

    const seed = `echo-${Date.now()}`;
    this.currentSeed = seed;
    this.lastSubmittedRunId = null;

    // Reset rank banner
    const rankBanner = document.getElementById('end-rank-banner');
    if (rankBanner) rankBanner.classList.add('hidden');

    // Clean up previous world
    this.tunnel?.dispose();
    this.obstacles?.dispose();
    this.enemies?.dispose();
    this.waveRefills?.dispose();
    this.echoWaveSys.clear();

    // Spawn new world
    this.tunnel = new TunnelGenerator(this.sceneMgr.scene, seed);
    this.tunnel.initTunnel();

    this.obstacles = new ObstacleManager(this.sceneMgr.scene, this.tunnel, seed);
    this.obstacles.init();

    this.enemies = new EnemyManager(this.sceneMgr.scene, this.tunnel, seed);
    this.redBalls = new RedBallManager(this.sceneMgr.scene, this.tunnel, seed);
    this.waveRefills = new WaveRefillManager(this.sceneMgr.scene, this.tunnel, seed);
    this.waveRefills.init();

    // Reset player
    const startCenter = this.tunnel.getTunnelCenter(0);
    this.vesselPos.set(startCenter.x, startCenter.y, 0);
    this.vesselVel.set(0, 0, GAME_CONSTANTS.BASE_FORWARD_SPEED);
    this.vesselRot.set(0, 0, 0);

    this.playerVessel.setVisible(true);
    this.playerVessel.updateTransform(this.vesselPos, 0, 0, 0);

    // Reset metrics
    this.score = 0;
    this.distance = 0;
    this.runStartTime = performance.now();
    this.durationMs = 0;
    this.enemiesDestroyed = 0;
    this.dodgesCount = 0;
    this.echoWavesFired = 0;
    this.lastEchoWaveTime = -9999;
    this.graceTimer = GAME_CONSTANTS.GRACE_PERIOD_SEC;
    this.waveCharges = 3;
    this.surgeTimer = 0;

    // UI transition
    this.titleScreenEl.classList.remove('active');
    this.titleScreenEl.classList.add('hidden');
    this.gameoverScreenEl.classList.add('hidden');
    this.gameoverScreenEl.classList.remove('active');

    this.input.reset();
    this.input.setTouchControlsVisible(true);
    this.state = 'PLAYING';
  }

  private fireEchoWave() {
    const isSurge = this.surgeTimer > 0;
    const cooldown = isSurge ? GAME_CONSTANTS.ECHO_WAVE_COOLDOWN_MS * 0.5 : GAME_CONSTANTS.ECHO_WAVE_COOLDOWN_MS;
    const now = performance.now();
    if (now - this.lastEchoWaveTime < cooldown) return;

    // Limited ammo check
    if (this.waveCharges <= 0) {
      audio.playEmptyClick();
      this.hud.addPopup('NO AMMO! FIND REFILL CORE', '#ef4444', 0, -25);
      this.input.triggerHaptic(25);
      return;
    }

    this.lastEchoWaveTime = now;
    this.waveCharges--;
    this.echoWavesFired++;

    // Fire forward in the direction the ship is facing
    const direction = new THREE.Vector3(0, 0, 1);
    this.echoWaveSys.fire(this.vesselPos.clone(), direction);
    audio.playEchoWave();
  }

  private onDeath(cause: string) {
    this.state = 'GAMEOVER';
    this.input.setTouchControlsVisible(false);
    this.input.triggerHaptic(60);
    audio.playCollision();

    // Show game over screen with cause of death
    this.gameoverScreenEl.classList.remove('hidden');
    this.gameoverScreenEl.classList.add('active');

    const alertEl = this.gameoverScreenEl.querySelector('.alert-status');
    if (alertEl) {
      alertEl.textContent = `DESTROYED: ${cause.toUpperCase()}`;
    }

    const finalScore = Math.floor(this.score);
    document.getElementById('end-score-display')!.innerText = `${finalScore}`;
    document.getElementById('end-distance')!.innerText = `${this.distance.toFixed(0)} m`;
    document.getElementById('end-enemies')!.innerText = `${this.enemiesDestroyed}`;
    const dodgesEl = document.getElementById('end-dodges');
    if (dodgesEl) dodgesEl.innerText = `${this.dodgesCount}`;
    document.getElementById('end-waves')!.innerText = `${this.echoWavesFired}`;

    const sec = Math.floor(this.durationMs / 1000);
    const mm = String(Math.floor(sec / 60)).padStart(2, '0');
    const ss = String(sec % 60).padStart(2, '0');
    document.getElementById('end-time')!.innerText = `${mm}:${ss}`;

    // Automatically submit run to global leaderboard
    const seed = this.currentSeed;
    const finalDist = this.distance;
    const finalDur = this.durationMs;
    const kills = this.enemiesDestroyed;
    const dodges = this.dodgesCount;

    leaderboardService.submitRun({
      seed,
      score: finalScore,
      distance: finalDist,
      durationMs: finalDur,
      enemiesDestroyed: kills,
      dodgesCount: dodges
    }).then((res) => {
      if (res && res.success) {
        this.lastSubmittedRunId = res.runId;
        const rankBanner = document.getElementById('end-rank-banner');
        const rankText = document.getElementById('end-rank-text');
        if (rankBanner && rankText) {
          rankText.innerText = `GLOBAL RANK #${res.rank} OF ${res.totalRuns}`;
          rankBanner.classList.remove('hidden');
        }
      }
    });
  }

  private returnToMenu() {
    this.state = 'MENU';
    this.input.setTouchControlsVisible(false);
    this.playerVessel.setVisible(false);

    // Clean up world
    this.tunnel?.dispose();
    this.obstacles?.dispose();
    this.enemies?.dispose();
    this.redBalls?.reset();
    this.waveRefills?.dispose();
    this.echoWaveSys.clear();
    this.tunnel = null;
    this.obstacles = null;
    this.enemies = null;
    this.redBalls = null;
    this.waveRefills = null;

    this.gameoverScreenEl.classList.remove('active');
    this.gameoverScreenEl.classList.add('hidden');
    this.titleScreenEl.classList.remove('hidden');
    this.titleScreenEl.classList.add('active');
  }

  private loop(time: number) {
    requestAnimationFrame(this.loop.bind(this));

    if (!this.lastTime) this.lastTime = time;
    const dt = Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;

    if (this.state === 'PLAYING') {
      this.updateGame(dt);
    } else if (this.state === 'MENU' || this.state === 'GAMEOVER') {
      // Allow controller / enter key to launch or restart
      const inputState = this.input.poll();
      if (inputState.menuActionRequested) {
        this.startRun();
      }

      // Idle camera drift on title screen
      if (this.state === 'MENU') {
        const t = time * 0.0004;
        this.sceneMgr.camera.position.x = Math.sin(t) * 3.0;
        this.sceneMgr.camera.position.y = Math.cos(t * 0.7) * 1.5 + 2.0;
      }
    }

    this.sceneMgr.render();
  }

  private updateGame(dt: number) {
    this.durationMs = performance.now() - this.runStartTime;

    // Input
    const inputState = this.input.poll();
    if (inputState.fireRequested) {
      this.fireEchoWave();
    }

    // Grace period
    if (this.graceTimer > 0) {
      this.graceTimer -= dt;
    }

    // Speed — ramps up over time
    const warmupRatio = Math.min(1.0, this.distance / 80);
    const baseSpeed = GAME_CONSTANTS.BASE_FORWARD_SPEED * (0.5 + 0.5 * warmupRatio);
    const currentSpeed = Math.min(
      GAME_CONSTANTS.MAX_FORWARD_SPEED,
      baseSpeed + Math.max(0, this.distance - 80) * 0.008
    );
    this.vesselVel.z = currentSpeed;

    // Auto-centering (gentle pull toward tunnel center)
    const tunnelCenter = this.tunnel?.getTunnelCenter(this.vesselPos.z);
    if (tunnelCenter) {
      const dxCenter = tunnelCenter.x - this.vesselPos.x;
      const dyCenter = tunnelCenter.y - this.vesselPos.y;
      const isSteeringX = Math.abs(inputState.steerX) > 0.08;
      const isSteeringY = Math.abs(inputState.steerY) > 0.08;
      const centerStrength = 2.5;
      if (!isSteeringX) {
        this.vesselVel.x += dxCenter * centerStrength * dt;
      }
      if (!isSteeringY) {
        this.vesselVel.y += dyCenter * centerStrength * dt;
      }
    }

    // Steering
    const targetVx = inputState.steerX * GAME_CONSTANTS.MAX_STEER_SPEED;
    const targetVy = inputState.steerY * GAME_CONSTANTS.MAX_STEER_SPEED;

    this.vesselVel.x += (targetVx - this.vesselVel.x) * (1.0 - GAME_CONSTANTS.STEER_DAMPING);
    this.vesselVel.y += (targetVy - this.vesselVel.y) * (1.0 - GAME_CONSTANTS.STEER_DAMPING);

    // Apply movement
    this.vesselPos.x += this.vesselVel.x * dt;
    this.vesselPos.y += this.vesselVel.y * dt;
    this.vesselPos.z += this.vesselVel.z * dt;
    this.distance = this.vesselPos.z;

    // Banking angles
    const pitch = -this.vesselVel.y * 0.03;
    const roll = -this.vesselVel.x * 0.06;
    const yaw = -this.vesselVel.x * 0.02;
    this.vesselRot.set(pitch, yaw, roll);

    this.playerVessel.updateTransform(this.vesselPos, pitch, yaw, roll);
    this.playerVessel.updateTrail(this.vesselPos, dt);

    // Score from distance
    this.score += currentSpeed * dt * GAME_CONSTANTS.SCORE_PER_METER * 0.3;
    // Score from time survived
    this.score += dt * GAME_CONSTANTS.SCORE_PER_SECOND;

    // Sonic surge boost countdown
    if (this.surgeTimer > 0) {
      this.surgeTimer -= dt;
      if (this.surgeTimer < 0) this.surgeTimer = 0;
    }

    // Update world systems
    this.echoWaveSys.update(dt);
    this.tunnel?.update(this.vesselPos.z, dt);
    this.obstacles?.update(this.vesselPos.z, dt);
    this.enemies?.update(this.vesselPos.z, this.vesselPos, dt);
    this.waveRefills?.update(this.vesselPos.z, dt);

    // Refill powerup collection
    const collectedRefill = this.waveRefills?.checkPlayerCollision(this.vesselPos, GAME_CONSTANTS.PLAYER_HIT_RADIUS);
    if (collectedRefill) {
      this.waveCharges = Math.min(this.maxWaveCharges, this.waveCharges + 3);
      this.surgeTimer = 4.0;
      this.score += 250;
      audio.playRefill();
      this.input.triggerHaptic(45);
      this.hud.addPopup('+3 WAVE AMMO! [SONIC SURGE]', '#22d3ee', 0, -25);
    }

    // Update red balls and process dodges
    const dodgeResult = this.redBalls?.update(this.vesselPos.z, this.vesselPos, dt);
    if (dodgeResult && dodgeResult.dodgedCount > 0) {
      this.dodgesCount += dodgeResult.dodgedCount;
      const pts = dodgeResult.dodgedCount * GAME_CONSTANTS.RED_BALL_DODGE_SCORE;
      this.score += pts;
      audio.playDodge();
      this.input.triggerHaptic(20);
      this.hud.addPopup(`+${pts} DODGE!`, '#ff5252');
      this.hud.flashWarning();
    }

    // ---- COLLISION DETECTION ----
    if (this.graceTimer <= 0) {
      // 1. Tunnel wall collision
      if (tunnelCenter) {
        const dx = this.vesselPos.x - tunnelCenter.x;
        const dy = this.vesselPos.y - tunnelCenter.y;
        const distFromCenter = Math.sqrt(dx * dx + dy * dy);
        if (distFromCenter > tunnelCenter.radius - GAME_CONSTANTS.PLAYER_HIT_RADIUS) {
          this.onDeath('wall');
          return;
        }
      }

      // 2. Obstacle collision (hard = instant death)
      const activeObstacles = this.obstacles?.getObstacles() || [];
      for (const obs of activeObstacles) {
        const dist = this.vesselPos.distanceTo(obs.position);
        if (dist < obs.radius + GAME_CONSTANTS.PLAYER_HIT_RADIUS) {
          if (obs.isHard) {
            this.onDeath('obstacle');
            return;
          }
        }
      }

      // 3. Red plasma ball collision (must dodge them!)
      const redBalls = this.redBalls?.getBalls() || [];
      for (const ball of redBalls) {
        const dist = this.vesselPos.distanceTo(ball.position);
        if (dist < ball.radius + GAME_CONSTANTS.PLAYER_HIT_RADIUS) {
          this.onDeath('red plasma ball');
          return;
        }
      }

      // 4. Enemy bullet collision
      const bullets = this.enemies?.getBullets() || [];
      for (const bullet of bullets) {
        const dist = this.vesselPos.distanceTo(bullet.position);
        if (dist < GAME_CONSTANTS.ENEMY_BULLET_RADIUS + GAME_CONSTANTS.PLAYER_HIT_RADIUS) {
          this.onDeath('bullet');
          return;
        }
      }

      // 5. Direct enemy ship collision
      const activeEnemies = this.enemies?.getEnemies() || [];
      for (const enemy of activeEnemies) {
        const dist = this.vesselPos.distanceTo(enemy.position);
        if (dist < GAME_CONSTANTS.ENEMY_HIT_RADIUS + GAME_CONSTANTS.PLAYER_HIT_RADIUS) {
          this.onDeath('enemy');
          return;
        }
      }
    }

    // ---- ECHO WAVE vs WORLD COLLISION ----
    const waves = this.echoWaveSys.getActiveWaves();
    for (const wave of waves) {
      // vs Enemies
      const aliveEnemies = this.enemies?.getEnemies() || [];
      for (const enemy of aliveEnemies) {
        const dist = wave.origin.distanceTo(enemy.position);
        if (dist < wave.currentRadius + GAME_CONSTANTS.ENEMY_HIT_RADIUS) {
          const killed = this.enemies?.damageEnemy(enemy, wave.damage);
          if (killed) {
            this.enemiesDestroyed++;
            this.score += GAME_CONSTANTS.ENEMY_KILL_SCORE;
            audio.playExplosion();
          }
        }
      }

      // vs Weak Obstacles
      const aliveObstacles = this.obstacles?.getObstacles() || [];
      for (const obs of aliveObstacles) {
        if (!obs.isHard) {
          const dist = wave.origin.distanceTo(obs.position);
          if (dist < wave.currentRadius + obs.radius) {
            const destroyed = this.obstacles?.damageObstacle(obs, wave.damage);
            if (destroyed) {
              this.score += 100;
              audio.playObstacleBreak();
            }
          }
        }
      }
      // vs Red Balls (can intercept with echo sound wave)
      const destroyedBalls = this.redBalls?.checkEchoWaveCollisions(wave.origin, wave.currentRadius) || 0;
      if (destroyedBalls > 0) {
        this.score += destroyedBalls * GAME_CONSTANTS.RED_BALL_DESTROY_SCORE;
        this.hud.addPopup(`+${destroyedBalls * GAME_CONSTANTS.RED_BALL_DESTROY_SCORE} BLAST!`, '#22d3ee');
      }
    }

    // Update Camera
    const speedRatio = Math.max(0, (currentSpeed - GAME_CONSTANTS.BASE_FORWARD_SPEED * 0.5) / (GAME_CONSTANTS.MAX_FORWARD_SPEED - GAME_CONSTANTS.BASE_FORWARD_SPEED * 0.5));
    this.sceneMgr.updateCamera(this.vesselPos, this.vesselRot, speedRatio, dt);

    // Render HUD
    const now = performance.now();
    const isSurge = this.surgeTimer > 0;
    const cooldown = isSurge ? GAME_CONSTANTS.ECHO_WAVE_COOLDOWN_MS * 0.5 : GAME_CONSTANTS.ECHO_WAVE_COOLDOWN_MS;
    const cooldownProgress = Math.min(1.0, (now - this.lastEchoWaveTime) / cooldown);
    this.input.updateCooldown(cooldownProgress, this.waveCharges, isSurge);

    this.hud.render({
      score: this.score,
      distance: this.distance,
      speed: currentSpeed,
      durationMs: this.durationMs,
      echoWaveCooldownProgress: cooldownProgress,
      enemiesDestroyed: this.enemiesDestroyed,
      dodgesCount: this.dodgesCount,
      graceActive: this.graceTimer > 0,
      waveCharges: this.waveCharges,
      isSurgeActive: isSurge
    });
  }
}
