/**
 * Canvas 2D HUD overlay — renders score, distance, speed, warnings, dodges, and cooldown indicators.
 */
export interface HudState {
  score: number;
  distance: number;
  speed: number;
  durationMs: number;
  echoWaveCooldownProgress: number; // 0 = just fired, 1 = ready
  enemiesDestroyed: number;
  dodgesCount: number;
  graceActive: boolean;
  waveCharges: number; // Current ammunition bullets (starts at 3)
  isSurgeActive?: boolean; // Temporary sonic surge boost
}

interface Popup {
  text: string;
  color: string;
  x: number;
  y: number;
  vy: number;
  alpha: number;
}

export class HudOverlay {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private warningFlash = 0;
  private popups: Popup[] = [];
  private dpr = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.onResize();
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.onResize(), 100);
    });
  }

  private onResize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  public flashWarning() {
    this.warningFlash = 1.0;
  }

  /**
   * Adds an animated floating notification (e.g. "+50 DODGE!", "+75 INTERCEPTED")
   */
  public addPopup(text: string, color = '#22d3ee', offsetX = 0, offsetY = 0) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.popups.push({
      text,
      color,
      x: w / 2 + (Math.random() - 0.5) * 60 + offsetX,
      y: h * 0.4 + (Math.random() - 0.5) * 30 + offsetY,
      vy: -1.2,
      alpha: 1.0
    });
  }

  public render(state: HudState) {
    const ctx = this.ctx;
    const w = window.innerWidth;
    const h = window.innerHeight;

    // Reset and scale for crisp High-DPI rendering
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.scale(this.dpr, this.dpr);

    // Responsive sizing variables
    const isMobile = w < 680 || h < 520;
    const padX = Math.max(14, Math.min(28, w * 0.04));
    const padY = Math.max(16, Math.min(32, h * 0.04));

    // Warning flash effect (red edge vignette)
    if (this.warningFlash > 0) {
      const grad = ctx.createRadialGradient(w / 2, h / 2, w * 0.25, w / 2, h / 2, w * 0.65);
      grad.addColorStop(0, 'transparent');
      grad.addColorStop(1, `rgba(239, 68, 68, ${this.warningFlash * 0.38})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      this.warningFlash = Math.max(0, this.warningFlash - 0.035);
    }

    // Grace period indicator (Shields)
    if (state.graceActive) {
      ctx.save();
      ctx.fillStyle = 'rgba(34, 211, 238, 0.12)';
      ctx.fillRect(0, 0, w, h);
      const shieldY = isMobile ? padY + 36 : padY + 52;
      ctx.font = isMobile ? '600 13px "Orbitron", sans-serif' : '600 16px "Orbitron", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(34, 211, 238, 0.9)';
      ctx.fillText('⚡ SHIELDS ACTIVE ⚡', w / 2, shieldY);
      ctx.restore();
    }

    // ---- Top-Left: Score ----
    ctx.save();
    ctx.fillStyle = '#22d3ee';
    const scoreFontSize = isMobile ? '700 20px "Orbitron", sans-serif' : '700 28px "Orbitron", sans-serif';
    ctx.font = scoreFontSize;
    ctx.textAlign = 'left';
    ctx.shadowColor = '#22d3ee';
    ctx.shadowBlur = 8;
    ctx.fillText(`${Math.floor(state.score)}`, padX, padY + (isMobile ? 18 : 22));
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#64748b';
    ctx.font = isMobile ? '400 9px "Space Mono", monospace' : '400 10px "Space Mono", monospace';
    ctx.fillText('SCORE', padX, padY + (isMobile ? 31 : 36));

    // Kills & Dodges (placed under score to keep bottom clear of thumb controls)
    const killsY = padY + (isMobile ? 46 : 56);
    ctx.fillStyle = '#f43f5e';
    ctx.font = isMobile ? '600 11px "Orbitron", sans-serif' : '600 13px "Orbitron", sans-serif';
    ctx.fillText(`✦ ${state.enemiesDestroyed}`, padX, killsY);

    ctx.fillStyle = '#ff5252';
    const dodgeOffsetX = isMobile ? 64 : 76;
    ctx.fillText(`⚡ ${state.dodgesCount}`, padX + dodgeOffsetX, killsY);

    ctx.fillStyle = '#64748b';
    ctx.font = '400 8px "Space Mono", monospace';
    ctx.fillText('KILLS', padX, killsY + 11);
    ctx.fillText('DODGES', padX + dodgeOffsetX, killsY + 11);
    ctx.restore();

    // ---- Top-Right: Distance, Speed & Time ----
    ctx.save();
    ctx.textAlign = 'right';
    ctx.fillStyle = '#e2e8f0';
    ctx.font = isMobile ? '600 15px "Orbitron", sans-serif' : '600 18px "Orbitron", sans-serif';
    ctx.fillText(`${state.distance.toFixed(0)}m`, w - padX, padY + (isMobile ? 16 : 20));

    ctx.fillStyle = '#64748b';
    ctx.font = isMobile ? '400 9px "Space Mono", monospace' : '400 10px "Space Mono", monospace';
    ctx.fillText(`${state.speed.toFixed(0)} u/s`, w - padX, padY + (isMobile ? 30 : 36));

    const sec = Math.floor(state.durationMs / 1000);
    const mm = String(Math.floor(sec / 60)).padStart(2, '0');
    const ss = String(sec % 60).padStart(2, '0');
    ctx.fillStyle = '#8b5cf6';
    ctx.font = isMobile ? '400 11px "Space Mono", monospace' : '400 12px "Space Mono", monospace';
    ctx.fillText(`${mm}:${ss}`, w - padX, padY + (isMobile ? 46 : 54));
    ctx.restore();

    // ---- Top-Center: Echo Wave Cooldown & Ammo Gauge ----
    ctx.save();
    const barWidth = isMobile ? Math.min(130, w * 0.35) : 160;
    const barHeight = 5;
    const barX = (w - barWidth) / 2;
    const barY = padY + (isMobile ? 14 : 18);

    // Background bar
    ctx.fillStyle = 'rgba(30, 41, 59, 0.7)';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth, barHeight, 3);
    ctx.fill();

    // Fill bar
    const fillWidth = barWidth * Math.min(1.0, Math.max(0, state.echoWaveCooldownProgress));
    const isReady = state.echoWaveCooldownProgress >= 1.0;
    const charges = state.waveCharges ?? 3;
    const hasAmmo = charges > 0;

    let fillColor = isReady && hasAmmo ? (state.isSurgeActive ? '#fbbf24' : '#22d3ee') : '#0e7490';
    if (!hasAmmo) fillColor = '#ef4444';

    ctx.fillStyle = fillColor;
    ctx.beginPath();
    ctx.roundRect(barX, barY, fillWidth, barHeight, 3);
    ctx.fill();

    if (isReady && hasAmmo) {
      ctx.shadowColor = state.isSurgeActive ? '#fbbf24' : '#22d3ee';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.roundRect(barX, barY, fillWidth, barHeight, 3);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Ammo Status Label above bar
    ctx.fillStyle = hasAmmo ? (isReady ? (state.isSurgeActive ? '#fbbf24' : '#22d3ee') : '#64748b') : '#ef4444';
    ctx.font = '600 8.5px "Space Mono", monospace';
    ctx.textAlign = 'center';

    let statusText = 'RECHARGING...';
    if (!hasAmmo) {
      statusText = '⚠ OUT OF AMMO — FIND REFILL';
    } else if (state.isSurgeActive) {
      statusText = `★ OVERCHARGE SURGE (${charges})`;
    } else if (isReady) {
      statusText = `ECHO READY (${charges} CHARGES)`;
    }
    ctx.fillText(statusText, w / 2, barY - 5);

    // Diamond Ammo Pips below bar
    const maxPips = Math.max(3, charges);
    const pipSpacing = isMobile ? 12 : 15;
    const pipsStartX = w / 2 - ((maxPips - 1) * pipSpacing) / 2;
    const pipsY = barY + barHeight + (isMobile ? 8 : 10);

    for (let i = 0; i < maxPips; i++) {
      const active = i < charges;
      const px = pipsStartX + i * pipSpacing;

      ctx.save();
      ctx.translate(px, pipsY);
      ctx.beginPath();
      ctx.moveTo(0, -4);
      ctx.lineTo(3.5, 0);
      ctx.lineTo(0, 4);
      ctx.lineTo(-3.5, 0);
      ctx.closePath();

      if (active) {
        ctx.fillStyle = state.isSurgeActive ? '#fbbf24' : '#22d3ee';
        ctx.shadowColor = state.isSurgeActive ? '#fbbf24' : '#22d3ee';
        ctx.shadowBlur = 6;
        ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(100, 116, 139, 0.4)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.restore();

    // ---- Crosshair ----
    ctx.save();
    ctx.strokeStyle = `rgba(34, 211, 238, ${isReady ? 0.5 : 0.2})`;
    ctx.lineWidth = 1;
    const cx = w / 2;
    const cy = h / 2;
    const size = isMobile ? 12 : 16;
    const gap = isMobile ? 4 : 6;

    ctx.beginPath();
    ctx.moveTo(cx - size, cy);
    ctx.lineTo(cx - gap, cy);
    ctx.moveTo(cx + gap, cy);
    ctx.lineTo(cx + size, cy);
    ctx.moveTo(cx, cy - size);
    ctx.lineTo(cx, cy - gap);
    ctx.moveTo(cx, cy + gap);
    ctx.lineTo(cx, cy + size);
    ctx.stroke();

    ctx.fillStyle = `rgba(34, 211, 238, ${isReady ? 0.7 : 0.3})`;
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ---- Floating Popups ----
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.y += p.vy;
      p.alpha -= 0.022;

      if (p.alpha <= 0) {
        this.popups.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.font = isMobile ? '700 13px "Orbitron", sans-serif' : '700 15px "Orbitron", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.fillText(p.text, p.x, p.y);
      ctx.restore();
    }
  }
}
