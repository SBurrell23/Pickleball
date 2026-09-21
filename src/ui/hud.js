import { MODE, sweetZone } from '../game/swing.js';
import { PLAY } from '../game/constants.js';
import { drawReticle } from './reticle.js';

// The swing meter is the thing the player actually looks at, so it is drawn on
// its own canvas rather than as DOM: the sweet zone has to line up with what
// the resolver scores, to the pixel, at any frame rate.

const CB_FILTERS = {
  off: null,
  deuter: { good: '#2c7bc8', perfect: '#e4ef3f', bad: '#c46a00' },
  protan: { good: '#3aa0d8', perfect: '#e4ef3f', bad: '#9b7500' },
  tritan: { good: '#16988a', perfect: '#ff7ab6', bad: '#b03030' },
};

export class Hud {
  constructor(root, settings) {
    this.settings = settings;
    this.root = root;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'hud-canvas';
    root.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    this.dom = document.createElement('div');
    this.dom.className = 'hud-dom';
    this.dom.innerHTML = `
      <div class="hud-top">
        <div class="scoreboard" id="scoreboard">
          <div class="score-team" id="teamA">
            <span class="serve-dot" id="serveA"></span>
            <span class="team-name" id="nameA">You</span>
            <span class="team-score" id="scoreA">0</span>
          </div>
          <div class="score-sep">-</div>
          <div class="score-team right" id="teamB">
            <span class="team-score" id="scoreB">0</span>
            <span class="team-name" id="nameB">Rival</span>
            <span class="serve-dot" id="serveB"></span>
          </div>
        </div>
        <div class="net-stats" id="netStats"></div>
      </div>
      <div class="hud-center" id="hudCenter"></div>
      <div class="hud-hint" id="hudHint"></div>
    `;
    root.appendChild(this.dom);

    this.el = {
      scoreA: this.dom.querySelector('#scoreA'),
      scoreB: this.dom.querySelector('#scoreB'),
      nameA: this.dom.querySelector('#nameA'),
      nameB: this.dom.querySelector('#nameB'),
      serveA: this.dom.querySelector('#serveA'),
      serveB: this.dom.querySelector('#serveB'),
      netStats: this.dom.querySelector('#netStats'),
      center: this.dom.querySelector('#hudCenter'),
      hint: this.dom.querySelector('#hudHint'),
    };

    this.messages = [];
    this.hintText = '';
    this.resize();
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.root.removeChild(this.canvas);
    this.root.removeChild(this.dom);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.root.clientWidth, h = this.root.clientHeight;
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
  }

  setNames(a, b) {
    this.el.nameA.textContent = a;
    this.el.nameB.textContent = b;
  }

  setScore(a, b, serveTeam, mySide) {
    this.el.scoreA.textContent = a;
    this.el.scoreB.textContent = b;
    this.el.serveA.classList.toggle('on', serveTeam === 0);
    this.el.serveB.classList.toggle('on', serveTeam === 1);
    this.dom.classList.toggle('flip', mySide === 1);
  }

  setNetStats({ ping, fps, showFps, loss, mode }) {
    const bits = [];
    if (mode && mode !== 'local') {
      const cls = ping < 60 ? 'good' : ping < 130 ? 'ok' : 'bad';
      bits.push(`<span class="stat ${cls}">${Math.round(ping)} ms</span>`);
      if (loss > 0.02) bits.push(`<span class="stat bad">${Math.round(loss * 100)}% loss</span>`);
    }
    if (showFps) bits.push(`<span class="stat">${Math.round(fps)} fps</span>`);
    this.el.netStats.innerHTML = bits.join('');
  }

  // Big transient callouts: OUT, KITCHEN, point reasons, countdowns.
  message(text, kind = 'info', ttl = 1.4) {
    this.messages.push({ text, kind, ttl, max: ttl });
    if (this.messages.length > 3) this.messages.shift();
    this._renderMessages();
  }

  clearMessages() { this.messages.length = 0; this._renderMessages(); }

  _renderMessages() {
    this.el.center.innerHTML = this.messages
      .map((m) => `<div class="msg ${m.kind}">${m.text}</div>`).join('');
  }

  setHint(text) {
    if (text === this.hintText) return;
    this.hintText = text;
    this.el.hint.innerHTML = text ? `<span>${text}</span>` : '';
  }

  update(dt) {
    let dirty = false;
    for (const m of this.messages) { m.ttl -= dt; if (m.ttl <= 0) dirty = true; }
    if (dirty) {
      this.messages = this.messages.filter((m) => m.ttl > 0);
      this._renderMessages();
    }
  }

  // ---- canvas layer ------------------------------------------------------

  draw(state) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.w, this.h);

    if (state.swing && state.swing.active) this._drawSwingMeter(g, state);
    this._drawPlayerMeters(g, state);
    if (state.showCrosshair) this._drawCrosshair(g, state.mouse);
  }

  _palette() {
    const cb = CB_FILTERS[this.settings.get('colorblind')];
    return cb || { good: '#16988a', perfect: '#e4ef3f', bad: '#ef5b4c' };
  }

  _drawSwingMeter(g, state) {
    const sw = state.swing;
    const tune = state.tuning;
    const assist = this.settings.get('meterAssist');
    const zone = sweetZone(sw, tune, assist);
    const pal = this._palette();

    const quick = sw.mode === MODE.QUICK;
    // The quick bar is literally half the length of the drive bar. That is the
    // whole point of it, so it has to look like it.
    const full = Math.min(420, this.w * 0.42);
    const W = quick ? full * 0.5 : full;
    const H = 26;
    const x = (this.w - W) / 2;
    const y = this.h - 128;
    const r = H / 2;

    // Track
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.55)';
    g.shadowBlur = 14;
    this._roundRect(g, x - 3, y - 3, W + 6, H + 6, r + 3);
    g.fillStyle = 'rgba(16,32,44,0.92)';
    g.fill();
    g.restore();

    this._roundRect(g, x, y, W, H, r);
    g.fillStyle = 'rgba(255,255,255,0.14)';
    g.fill();

    // Sweet zone
    const zl = Math.max(0, zone.center - zone.half);
    const zr = Math.min(1, zone.center + zone.half);
    g.save();
    this._roundRect(g, x, y, W, H, r);
    g.clip();
    // Wider "ok" shoulder, drawn dimmer so the target reads clearly.
    const ol = Math.max(0, zone.center - zone.okHalf);
    const or = Math.min(1, zone.center + zone.okHalf);
    g.fillStyle = 'rgba(120,200,255,0.15)';
    g.fillRect(x + ol * W, y, (or - ol) * W, H);
    g.fillStyle = this._alpha(pal.good, 0.42);
    g.fillRect(x + zl * W, y, (zr - zl) * W, H);
    const pl = Math.max(0, zone.center - zone.perfect);
    const pr = Math.min(1, zone.center + zone.perfect);
    g.fillStyle = this._alpha(pal.perfect, 0.92);
    g.fillRect(x + pl * W, y, (pr - pl) * W, H);

    {
      // Power fill up to the current bar position. The quick bar is tinted
      // teal so the two modes are never mistaken for each other mid-rally.
      const t = Math.min(1.26, sw.t);
      const grad = g.createLinearGradient(x, 0, x + W, 0);
      if (quick) {
        grad.addColorStop(0, 'rgba(40,190,170,0.75)');
        grad.addColorStop(1, 'rgba(120,240,215,0.9)');
      } else {
        grad.addColorStop(0, 'rgba(90,170,255,0.75)');
        grad.addColorStop(0.7, 'rgba(120,220,255,0.85)');
        grad.addColorStop(1, 'rgba(255,220,120,0.9)');
      }
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = grad;
      g.fillRect(x, y, Math.min(1, t) * W, H);
      g.globalCompositeOperation = 'source-over';
      if (sw.t > 1) {
        // Overcharge: the bar reddens as the shot goes off the boil.
        const over = Math.min(1, (sw.t - 1) / 0.26);
        g.fillStyle = this._alpha(pal.bad, 0.35 + over * 0.5);
        g.fillRect(x, y, W, H);
      }
    }
    g.restore();

    // Needle / release marker
    const pos = Math.min(1.0, sw.t);
    const nx = x + pos * W;
    const inSweet = Math.abs(pos - zone.center) <= zone.half;
    const inPerfect = Math.abs(pos - zone.center) <= zone.perfect;
    g.save();
    g.strokeStyle = inPerfect ? pal.perfect : inSweet ? pal.good : '#ffffff';
    g.lineWidth = inPerfect ? 5 : 3.5;
    g.shadowColor = g.strokeStyle;
    g.shadowBlur = inSweet ? 16 : 6;
    g.beginPath();
    g.moveTo(nx, y - 7);
    g.lineTo(nx, y + H + 7);
    g.stroke();
    g.restore();

    // Border
    this._roundRect(g, x, y, W, H, r);
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 2.5;
    g.stroke();

    // Label
    g.font = '700 12px "Trebuchet MS", system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.fillText(
      state.shotLabel || 'POWER',
      x + W / 2, y - 12
    );

    // Ghost of the full drive bar behind the quick one, so the trade being
    // made -- half the wait, half the reach -- is visible while you hold it.
    if (quick) {
      const fx = (this.w - full) / 2;
      g.save();
      g.setLineDash([5, 6]);
      g.strokeStyle = 'rgba(255,255,255,0.28)';
      g.lineWidth = 1.5;
      this._roundRect(g, fx, y, full, H, r);
      g.stroke();
      g.restore();
    }

    if (sw.t > 1) {
      g.fillStyle = pal.bad;
      g.fillText('OVERCOOKED', x + W / 2, y + H + 22);
    }
  }

  _drawPlayerMeters(g, state) {
    const p = state.me;
    if (!p) return;
    const pad = 26;
    const w = 260, h = 20;
    const x = pad, y = this.h - pad - 42;
    const st = Math.max(0, Math.min(1, p.stamina / PLAY.STAMINA_MAX));
    const low = st <= 0.34;

    g.save();
    g.shadowColor = 'rgba(0,0,0,0.5)';
    g.shadowBlur = 10;
    this._roundRect(g, x - 4, y - 4, w + 8, h + 8, h / 2 + 4);
    g.fillStyle = 'rgba(16,32,44,0.92)';
    g.fill();
    g.restore();

    this._roundRect(g, x, y, w, h, h / 2);
    g.fillStyle = 'rgba(255,255,255,0.14)';
    g.fill();

    if (st > 0.01) {
      g.save();
      this._roundRect(g, x, y, w, h, h / 2);
      g.clip();
      const grad = g.createLinearGradient(x, 0, x + w, 0);
      if (low) {
        grad.addColorStop(0, '#ef8b3c');
        grad.addColorStop(1, '#ffcf5c');
      } else {
        grad.addColorStop(0, '#16988a');
        grad.addColorStop(1, '#55e6cd');
      }
      g.fillStyle = grad;
      g.fillRect(x, y, w * st, h);
      g.restore();
    }

    this._roundRect(g, x, y, w, h, h / 2);
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 2.5;
    g.stroke();

    g.font = '900 12px "Trebuchet MS", system-ui, sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(16,32,44,0.9)';
    g.fillText('STAMINA', x + 11, y + h / 2 + 1);
    g.fillStyle = low ? '#3a2410' : '#ffffff';
    g.fillText('STAMINA', x + 10, y + h / 2);
    g.textBaseline = 'alphabetic';
  }

  // The OS cursor is hidden over the canvas, so this is the only pointer the
  // player has -- it always draws.
  _drawCrosshair(g, mouse) {
    if (!mouse || !mouse.inside) return;
    drawReticle(g, mouse.x, mouse.y,
      this.settings.get('cursorStyle'),
      this.settings.get('cursorColor'),
      this.settings.get('cursorScale'));
  }

  _roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  _alpha(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
}
