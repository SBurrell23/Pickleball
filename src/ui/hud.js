import { MODE, sweetZone } from '../game/swing.js';

// The swing meter is the thing the player actually looks at, so it is drawn on
// its own canvas rather than as DOM: the sweet zone has to line up with what
// the resolver scores, to the pixel, at any frame rate.

const CB_FILTERS = {
  off: null,
  deuter: { good: '#2f7fd0', perfect: '#ffe066', bad: '#c46a00' },
  protan: { good: '#3aa0d8', perfect: '#ffe066', bad: '#9b7500' },
  tritan: { good: '#2fa87a', perfect: '#ff7ab6', bad: '#b03030' },
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
    return cb || { good: '#3ddc84', perfect: '#ffe066', bad: '#ff6b5e' };
  }

  _drawSwingMeter(g, state) {
    const sw = state.swing;
    const tune = state.tuning;
    const assist = this.settings.get('meterAssist');
    const zone = sweetZone(sw, tune, assist);
    const pal = this._palette();

    const isDrive = sw.mode === MODE.DRIVE;
    const W = isDrive ? Math.min(420, this.w * 0.42) : Math.min(300, this.w * 0.30);
    const H = isDrive ? 26 : 30;
    const x = (this.w - W) / 2;
    const y = this.h - (isDrive ? 118 : 122);
    const r = H / 2;

    // Track
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.55)';
    g.shadowBlur = 14;
    this._roundRect(g, x - 3, y - 3, W + 6, H + 6, r + 3);
    g.fillStyle = 'rgba(10,14,20,0.82)';
    g.fill();
    g.restore();

    this._roundRect(g, x, y, W, H, r);
    g.fillStyle = 'rgba(28,36,48,0.95)';
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

    if (isDrive) {
      // Power fill up to the current bar position.
      const t = Math.min(1.26, sw.t);
      const grad = g.createLinearGradient(x, 0, x + W, 0);
      grad.addColorStop(0, 'rgba(90,170,255,0.75)');
      grad.addColorStop(0.7, 'rgba(120,220,255,0.85)');
      grad.addColorStop(1, 'rgba(255,220,120,0.9)');
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
    const pos = isDrive ? Math.min(1.0, sw.t) : sw.needle;
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
    g.strokeStyle = 'rgba(255,255,255,0.28)';
    g.lineWidth = 1.5;
    g.stroke();

    // Label
    g.font = '700 12px "Trebuchet MS", system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillStyle = 'rgba(220,235,250,0.85)';
    g.fillText(
      isDrive ? (state.shotLabel || 'POWER') : (state.shotLabel || 'REACTION'),
      x + W / 2, y - 12
    );

    if (isDrive && sw.t > 1) {
      g.fillStyle = pal.bad;
      g.fillText('OVERCOOKED', x + W / 2, y + H + 22);
    }
  }

  _drawPlayerMeters(g, state) {
    const p = state.me;
    if (!p) return;
    const pad = 26;
    const w = 168, h = 9;
    const x = pad, y = this.h - pad - 30;

    // Stamina
    g.fillStyle = 'rgba(10,14,20,0.7)';
    this._roundRect(g, x - 3, y - 3, w + 6, h + 6, 6); g.fill();
    g.fillStyle = 'rgba(60,80,100,0.6)';
    this._roundRect(g, x, y, w, h, 4); g.fill();
    const st = Math.max(0, Math.min(1, p.stamina / 100));
    g.fillStyle = st > 0.34 ? '#5ad1ff' : '#ff9f43';
    this._roundRect(g, x, y, w * st, h, 4); g.fill();

    // Special meter
    const y2 = y + 16;
    g.fillStyle = 'rgba(10,14,20,0.7)';
    this._roundRect(g, x - 3, y2 - 3, w + 6, h + 6, 6); g.fill();
    g.fillStyle = 'rgba(60,80,100,0.6)';
    this._roundRect(g, x, y2, w, h, 4); g.fill();
    const sp = Math.max(0, Math.min(1, p.special));
    if (sp >= 1) {
      const pulse = 0.65 + 0.35 * Math.sin(performance.now() / 120);
      g.save();
      g.shadowColor = '#ffd24a';
      g.shadowBlur = 14 * pulse;
      g.fillStyle = '#ffd24a';
      this._roundRect(g, x, y2, w, h, 4); g.fill();
      g.restore();
    } else {
      g.fillStyle = '#b07de8';
      this._roundRect(g, x, y2, w * sp, h, 4); g.fill();
    }

    g.font = '600 10px "Trebuchet MS", system-ui, sans-serif';
    g.textAlign = 'left';
    g.fillStyle = 'rgba(200,220,240,0.72)';
    g.fillText('STAMINA', x, y - 6);
    g.fillText(sp >= 1 ? 'STAR READY  [E]' : 'STAR', x, y2 + h + 12);
  }

  _drawCrosshair(g, mouse) {
    if (!mouse || !this.settings.get('showReticle')) return;
    const { x, y } = mouse;
    g.save();
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(x, y, 7, 0, Math.PI * 2);
    g.moveTo(x - 13, y); g.lineTo(x - 4, y);
    g.moveTo(x + 4, y); g.lineTo(x + 13, y);
    g.moveTo(x, y - 13); g.lineTo(x, y - 4);
    g.moveTo(x, y + 4); g.lineTo(x, y + 13);
    g.stroke();
    g.restore();
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
