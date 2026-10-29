import { PLAYER } from './config';

export type Action = 'swap' | 'interact' | 'coffee' | 'pause' | 'reload';

/**
 * Collects desktop (keyboard + pointer-locked mouse) and touch (joystick + look drag + buttons) input
 * into one per-frame snapshot.
 */
export class Input {
  readonly keys = new Set<string>();
  /** Movement intent from the joystick, x = strafe right, y = forward. */
  readonly stick = { x: 0, y: 0 };
  lookDX = 0;
  lookDY = 0;
  firing = false;
  touchMode: boolean;
  enabled = false; // only true while a match is running

  private actions: Action[] = [];
  private mouseFire = false;
  private touchFire = false;
  private stickId: number | null = null;
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  private stickCenter = { x: 0, y: 0 };
  onTouchModeChange: (touch: boolean) => void = () => {};

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly touchLayer: HTMLElement,
    private readonly knob: HTMLElement,
    ring: HTMLElement,
  ) {
    this.touchMode = matchMedia('(pointer: coarse)').matches;

    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      this.keys.add(e.code);
      if (e.repeat) return;
      if (e.code === 'KeyQ') this.actions.push('swap');
      else if (e.code === 'KeyE') this.actions.push('interact');
      else if (e.code === 'KeyF') this.actions.push('coffee');
      else if (e.code === 'KeyR') this.actions.push('reload');
      else if (e.code === 'Escape' || e.code === 'KeyP') this.actions.push('pause');
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseFire = this.touchFire = false;
    });

    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') this.setTouchMode(true);
    });
    // desktop mouse
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled || e.button !== 0) return;
      if (!this.touchMode && document.pointerLockElement !== canvas) this.lock();
      this.mouseFire = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseFire = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      this.lookDX += e.movementX * PLAYER.mouseSensitivity;
      this.lookDY += e.movementY * PLAYER.mouseSensitivity;
    });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === canvas) this.setTouchMode(false);
    });

    // touch: joystick on the left half, look-drag on the right half
    touchLayer.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      this.setTouchMode(true);
      if (!this.enabled) return;
      e.preventDefault();
      if (e.clientX < window.innerWidth * 0.45 && this.stickId === null) {
        this.stickId = e.pointerId;
        const r = ring.getBoundingClientRect();
        this.stickCenter = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        this.updateStick(e.clientX, e.clientY);
      } else if (this.lookId === null) {
        this.lookId = e.pointerId;
        this.lookLast = { x: e.clientX, y: e.clientY };
      }
    });
    window.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickId) this.updateStick(e.clientX, e.clientY);
      else if (e.pointerId === this.lookId) {
        this.lookDX += (e.clientX - this.lookLast.x) * PLAYER.touchLookSensitivity;
        this.lookDY += (e.clientY - this.lookLast.y) * PLAYER.touchLookSensitivity;
        this.lookLast = { x: e.clientX, y: e.clientY };
      }
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId === this.stickId) {
        this.stickId = null;
        this.stick.x = this.stick.y = 0;
        this.knob.style.transform = 'translate(0px, 0px)';
      }
      if (e.pointerId === this.lookId) this.lookId = null;
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  /** Wire a touch/click button to an action (or, for fire, a hold state). */
  bindButton(el: HTMLElement, action: Action | 'fire') {
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (e.pointerType !== 'mouse') this.setTouchMode(true);
      if (!this.enabled && action !== 'pause') return;
      if (action === 'fire') {
        this.touchFire = true;
        const up = (ev: PointerEvent) => {
          if (ev.pointerId !== e.pointerId) return;
          this.touchFire = false;
          window.removeEventListener('pointerup', up);
          window.removeEventListener('pointercancel', up);
        };
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
      } else {
        this.actions.push(action);
      }
    });
  }

  lock() {
    if (this.touchMode) return;
    try {
      const p = this.canvas.requestPointerLock() as unknown;
      if (p instanceof Promise) p.catch(() => {});
    } catch {
      /* pointer lock unavailable: keyboard turning still works */
    }
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  setTouchMode(t: boolean) {
    if (this.touchMode === t) return;
    this.touchMode = t;
    this.onTouchModeChange(t);
  }

  private updateStick(x: number, y: number) {
    const max = 30;
    let dx = x - this.stickCenter.x;
    let dy = y - this.stickCenter.y;
    const len = Math.hypot(dx, dy);
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    this.stick.x = dx / max;
    this.stick.y = -dy / max;
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  /** Movement axes from keyboard + stick, x = right, y = forward. */
  moveAxes(): { x: number; y: number } {
    let x = this.stick.x;
    let y = this.stick.y;
    if (this.keys.has('KeyW')) y += 1;
    if (this.keys.has('KeyS')) y -= 1;
    if (this.keys.has('KeyD')) x += 1;
    if (this.keys.has('KeyA')) x -= 1;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  /** Arrow-key turning, for when pointer lock is unavailable. */
  keyTurn(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('ArrowDown')) y += 1;
    return { x, y };
  }

  consumeActions(): Action[] {
    const a = this.actions;
    this.actions = [];
    return a;
  }

  consumeLook(): { dx: number; dy: number } {
    const r = { dx: this.lookDX, dy: this.lookDY };
    this.lookDX = this.lookDY = 0;
    return r;
  }

  isFiring(): boolean {
    return this.enabled && (this.mouseFire || this.touchFire);
  }

  reset() {
    this.keys.clear();
    this.mouseFire = this.touchFire = false;
    this.actions = [];
    this.lookDX = this.lookDY = 0;
    this.stick.x = this.stick.y = 0;
    this.stickId = this.lookId = null;
    this.knob.style.transform = 'translate(0px, 0px)';
  }

  get layer(): HTMLElement {
    return this.touchLayer;
  }
}
