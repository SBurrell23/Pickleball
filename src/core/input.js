// Keyboard + mouse. Movement is read as a raw axis pair; the camera decides
// how that maps into world space, so W is always "toward the net" for whichever
// side you are playing.

const MOVE_KEYS = {
  KeyW: [0, 1], KeyS: [0, -1], KeyA: [-1, 0], KeyD: [1, 0],
  ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
};

export class Input {
  constructor(target) {
    this.el = target;
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, ndcX: 0, ndcY: 0, inside: false };
    this.primaryDown = false;
    this.secondaryDown = false;
    this.enabled = true;
    this.handlers = { press: [], release: [], key: [] };
    this._bind();
  }

  on(evt, fn) { this.handlers[evt].push(fn); return this; }
  _fire(evt, ...args) { for (const fn of this.handlers[evt]) fn(...args); }

  _bind() {
    const el = this.el;
    this._onKeyDown = (e) => {
      if (!this.enabled) return;
      if (e.repeat) { if (MOVE_KEYS[e.code]) e.preventDefault(); return; }
      this.keys.add(e.code);
      this._fire('key', e.code, true, e);
      // Stop the page scrolling out from under the game.
      if (MOVE_KEYS[e.code] || e.code === 'Space') e.preventDefault();
    };
    this._onKeyUp = (e) => {
      this.keys.delete(e.code);
      this._fire('key', e.code, false, e);
    };
    this._onBlur = () => {
      // Release everything, otherwise the player keeps running after alt-tab.
      this.keys.clear();
      if (this.primaryDown) { this.primaryDown = false; this._fire('release', 0); }
      this.secondaryDown = false;
    };

    this._onMove = (e) => {
      const r = el.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
      this.mouse.ndcX = (this.mouse.x / r.width) * 2 - 1;
      this.mouse.ndcY = -((this.mouse.y / r.height) * 2 - 1);
      this.mouse.inside = true;
    };
    this._onLeave = () => { this.mouse.inside = false; };
    this._onEnter = () => { this.mouse.inside = true; };
    this._onDown = (e) => {
      if (!this.enabled) return;
      this._onMove(e);
      if (e.button === 0) { this.primaryDown = true; this._fire('press', 0); }
      if (e.button === 2) { this.secondaryDown = true; this._fire('press', 2); }
      e.preventDefault();
    };
    this._onUp = (e) => {
      if (e.button === 0 && this.primaryDown) {
        this.primaryDown = false;
        this._fire('release', 0);
      }
      if (e.button === 2) { this.secondaryDown = false; this._fire('release', 2); }
    };
    this._onCtx = (e) => e.preventDefault();

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    el.addEventListener('pointermove', this._onMove);
    el.addEventListener('pointerleave', this._onLeave);
    el.addEventListener('pointerenter', this._onEnter);
    el.addEventListener('pointerdown', this._onDown);
    // Listen for release on the window so dragging off-canvas still releases.
    window.addEventListener('pointerup', this._onUp);
    el.addEventListener('contextmenu', this._onCtx);
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    this.el.removeEventListener('pointermove', this._onMove);
    this.el.removeEventListener('pointerleave', this._onLeave);
    this.el.removeEventListener('pointerenter', this._onEnter);
    this.el.removeEventListener('pointerdown', this._onDown);
    window.removeEventListener('pointerup', this._onUp);
    this.el.removeEventListener('contextmenu', this._onCtx);
  }

  // Raw movement intent: x = right, z = toward the net.
  axis() {
    let x = 0, z = 0;
    for (const code of this.keys) {
      const m = MOVE_KEYS[code];
      if (m) { x += m[0]; z += m[1]; }
    }
    const len = Math.hypot(x, z);
    if (len > 1) { x /= len; z /= len; }
    return { x, z };
  }

  down(code) { return this.keys.has(code); }

  get dash() { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'); }
  // Right button is its own swing now, so only Space softens a shot.
  get soft() { return this.keys.has('Space'); }

  releaseAll() {
    this.keys.clear();
    this.primaryDown = false;
    this.secondaryDown = false;
  }
}
