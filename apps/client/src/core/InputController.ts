export interface InputState {
  steerX: number;  // -1 (left) to +1 (right)
  steerY: number;  // -1 (down) to +1 (up)
  fireRequested: boolean;
  menuActionRequested?: boolean;
}

export class InputController {
  private targetX: number = 0;
  private targetY: number = 0;
  private fireTriggered: boolean = false;
  private menuActionTriggered: boolean = false;
  private isPointerDown: boolean = false;

  private keys: { [key: string]: boolean } = {};

  // Touch state
  private isTouchDevice: boolean = false;
  private steerTouchId: number | null = null;
  private joystickOriginX: number = 0;
  private joystickOriginY: number = 0;
  private readonly maxJoystickRadius: number = 46;

  // DOM elements for on-screen touch controls
  private touchControlsEl: HTMLElement | null = null;
  private joystickBaseEl: HTMLElement | null = null;
  private joystickHandleEl: HTMLElement | null = null;
  private fireBtnEl: HTMLElement | null = null;

  constructor(private container: HTMLElement) {
    this.detectTouchDevice();
    this.cacheTouchElements();
    this.bindEvents();
  }

  private detectTouchDevice() {
    this.isTouchDevice = (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia('(pointer: coarse)').matches
    );
  }

  private cacheTouchElements() {
    this.touchControlsEl = document.getElementById('touch-controls');
    this.joystickBaseEl = document.getElementById('touch-joystick-base');
    this.joystickHandleEl = document.getElementById('touch-joystick-handle');
    this.fireBtnEl = document.getElementById('touch-btn-fire');
  }

  public setTouchControlsVisible(visible: boolean) {
    if (!this.touchControlsEl) {
      this.cacheTouchElements();
    }
    if (this.touchControlsEl) {
      // Show touch controls if it's a touch device or window is mobile-sized
      const shouldShow = visible && (this.isTouchDevice || window.innerWidth <= 1024);
      if (shouldShow) {
        this.touchControlsEl.classList.remove('hidden');
        this.touchControlsEl.classList.add('active');
      } else {
        this.touchControlsEl.classList.add('hidden');
        this.touchControlsEl.classList.remove('active');
      }
    }
  }

  public updateCooldown(progress: number, charges = 3, isSurgeActive = false) {
    if (!this.fireBtnEl) return;
    const ready = progress >= 1.0 && charges > 0;
    if (ready) {
      this.fireBtnEl.classList.add('ready');
      this.fireBtnEl.classList.remove('recharging', 'no-ammo');
      this.fireBtnEl.classList.toggle('surge-active', isSurgeActive);
    } else {
      this.fireBtnEl.classList.remove('ready', 'surge-active');
      this.fireBtnEl.classList.add('recharging');
      this.fireBtnEl.classList.toggle('no-ammo', charges <= 0);
    }

    const labelEl = this.fireBtnEl.querySelector('.fire-btn-text');
    if (labelEl) {
      if (charges <= 0) {
        labelEl.textContent = 'NO AMMO';
      } else if (isSurgeActive) {
        labelEl.textContent = `★ SURGE (${charges})`;
      } else {
        labelEl.textContent = `WAVE (${charges})`;
      }
    }

    this.fireBtnEl.style.setProperty('--cooldown-progress', `${Math.min(1, Math.max(0, progress))}`);
  }

  public triggerHaptic(duration = 20) {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(duration);
      } catch {
        // Ignore haptics errors if blocked
      }
    }
  }

  private bindEvents() {
    // Keyboard
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'Space') {
        e.preventDefault();
        this.fireTriggered = true;
      }
      if (e.code === 'Enter') {
        this.menuActionTriggered = true;
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    // Mouse Controls (for desktop mouse drag/click)
    this.container.addEventListener('mousedown', (e) => {
      // Ignore if clicking UI buttons
      if ((e.target as HTMLElement)?.closest('button') || (e.target as HTMLElement)?.closest('.screen')) {
        return;
      }
      this.isPointerDown = true;
      this.fireTriggered = true;
      this.updateSteerFromPointer(e.clientX, e.clientY);
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isPointerDown) {
        this.updateSteerFromPointer(e.clientX, e.clientY);
      }
    });

    window.addEventListener('mouseup', () => {
      this.isPointerDown = false;
      this.targetX = 0;
      this.targetY = 0;
    });

    // Touch Controls
    window.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
    window.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
    window.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });
    window.addEventListener('touchcancel', (e) => this.handleTouchEnd(e), { passive: false });

    // Fire button explicit touch/click
    if (this.fireBtnEl) {
      this.fireBtnEl.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.fireTriggered = true;
        this.triggerHaptic(25);
        this.fireBtnEl?.classList.add('pressed');
      }, { passive: false });

      this.fireBtnEl.addEventListener('touchend', (e) => {
        e.preventDefault();
        this.fireBtnEl?.classList.remove('pressed');
      }, { passive: false });

      this.fireBtnEl.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.fireTriggered = true;
      });
    }
  }

  private handleTouchStart(e: TouchEvent) {
    this.isTouchDevice = true;

    // Check if touch is on menu screen buttons
    const target = e.target as HTMLElement;
    if (target?.closest('.screen.active') || target?.closest('#btn-fullscreen')) {
      return; // let menu buttons handle their standard click
    }

    const screenWidth = window.innerWidth;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const isLeftSide = touch.clientX < screenWidth * 0.52;

      if (isLeftSide && this.steerTouchId === null) {
        // Anchor virtual joystick at finger position
        e.preventDefault();
        this.steerTouchId = touch.identifier;
        this.joystickOriginX = touch.clientX;
        this.joystickOriginY = touch.clientY;

        if (this.joystickBaseEl && this.joystickHandleEl) {
          this.joystickBaseEl.style.left = `${touch.clientX}px`;
          this.joystickBaseEl.style.top = `${touch.clientY}px`;
          this.joystickBaseEl.classList.add('touching');
          this.joystickHandleEl.style.transform = `translate(0px, 0px)`;
        }
      } else if (!isLeftSide) {
        // Right side touch -> FIRE
        e.preventDefault();
        this.fireTriggered = true;
        this.triggerHaptic(20);
        this.fireBtnEl?.classList.add('pressed');
      }
    }
  }

  private handleTouchMove(e: TouchEvent) {
    if (this.steerTouchId === null) return;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === this.steerTouchId) {
        e.preventDefault();
        const dx = touch.clientX - this.joystickOriginX;
        const dy = touch.clientY - this.joystickOriginY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        const clampedDist = Math.min(dist, this.maxJoystickRadius);
        const angle = Math.atan2(dy, dx);

        const clampedX = Math.cos(angle) * clampedDist;
        const clampedY = Math.sin(angle) * clampedDist;

        // Visual handle position
        if (this.joystickHandleEl) {
          this.joystickHandleEl.style.transform = `translate(${clampedX}px, ${clampedY}px)`;
        }

        // Normalized steering value with comfortable curve
        const norm = clampedDist / this.maxJoystickRadius;
        const curved = Math.pow(norm, 1.15); // gentle center control
        this.targetX = Math.cos(angle) * curved;
        this.targetY = -Math.sin(angle) * curved; // inverted: up is positive Y
        break;
      }
    }
  }

  private handleTouchEnd(e: TouchEvent) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === this.steerTouchId) {
        this.steerTouchId = null;
        this.targetX = 0;
        this.targetY = 0;
        if (this.joystickBaseEl && this.joystickHandleEl) {
          this.joystickBaseEl.classList.remove('touching');
          this.joystickHandleEl.style.transform = `translate(0px, 0px)`;
        }
      } else {
        this.fireBtnEl?.classList.remove('pressed');
      }
    }
  }

  private updateSteerFromPointer(clientX: number, clientY: number) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cx = w * 0.5;
    const cy = h * 0.5;

    const dx = (clientX - cx) / (w * 0.38);
    const dy = -(clientY - cy) / (h * 0.38);

    this.targetX = Math.max(-1, Math.min(1, dx));
    this.targetY = Math.max(-1, Math.min(1, dy));
  }

  private pollGamepad(): { x: number; y: number; fire: boolean; menu: boolean } {
    if (typeof navigator.getGamepads !== 'function') {
      return { x: 0, y: 0, fire: false, menu: false };
    }

    const gamepads = navigator.getGamepads();
    for (const gp of gamepads) {
      if (!gp) continue;

      let gx = 0;
      let gy = 0;
      let gFire = false;
      let gMenu = false;

      // Left analog stick
      if (Math.abs(gp.axes[0]) > 0.12) gx += gp.axes[0];
      if (Math.abs(gp.axes[1]) > 0.12) gy -= gp.axes[1];

      // D-Pad
      if (gp.buttons[14]?.pressed) gx -= 1.0; // Left
      if (gp.buttons[15]?.pressed) gx += 1.0; // Right
      if (gp.buttons[12]?.pressed) gy += 1.0; // Up
      if (gp.buttons[13]?.pressed) gy -= 1.0; // Down

      // Action buttons: A / Cross (0), RB (5), RT (7)
      if (gp.buttons[0]?.pressed || gp.buttons[5]?.pressed || gp.buttons[7]?.pressed) {
        gFire = true;
      }

      // Start / Menu button (9 or 0)
      if (gp.buttons[9]?.pressed || gp.buttons[8]?.pressed) {
        gMenu = true;
      }

      if (gx !== 0 || gy !== 0 || gFire || gMenu) {
        return {
          x: Math.max(-1, Math.min(1, gx)),
          y: Math.max(-1, Math.min(1, gy)),
          fire: gFire,
          menu: gMenu
        };
      }
    }

    return { x: 0, y: 0, fire: false, menu: false };
  }

  public poll(): InputState {
    let x = this.targetX;
    let y = this.targetY;

    // Keyboard WASD / Arrows
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) x -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) x += 1;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) y += 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) y -= 1;

    // Gamepad
    const gp = this.pollGamepad();
    if (Math.abs(gp.x) > 0.05) x = gp.x;
    if (Math.abs(gp.y) > 0.05) y = gp.y;

    x = Math.max(-1, Math.min(1, x));
    y = Math.max(-1, Math.min(1, y));

    const fire = this.fireTriggered || gp.fire;
    this.fireTriggered = false;

    const menu = this.menuActionTriggered || gp.menu;
    this.menuActionTriggered = false;

    return {
      steerX: x,
      steerY: y,
      fireRequested: fire,
      menuActionRequested: menu
    };
  }

  public reset() {
    this.targetX = 0;
    this.targetY = 0;
    this.fireTriggered = false;
    this.menuActionTriggered = false;
    this.isPointerDown = false;
    this.steerTouchId = null;
    this.keys = {};
    if (this.joystickBaseEl && this.joystickHandleEl) {
      this.joystickBaseEl.classList.remove('touching');
      this.joystickHandleEl.style.transform = `translate(0px, 0px)`;
    }
    this.fireBtnEl?.classList.remove('pressed');
  }
}
