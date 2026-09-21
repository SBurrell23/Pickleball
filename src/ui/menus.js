import { CHARACTERS, getCharacter } from '../game/characters.js';
import { DEFAULTS } from '../core/settings.js';
import { drawPortrait } from './portrait.js';
import { CURSOR_STYLES, CURSOR_COLORS, drawReticle } from './reticle.js';

const STAT_LABELS = {
  speed: 'Speed', power: 'Power', reach: 'Reach', control: 'Control', charge: 'Charge',
};

const SCHEMA = {
  Graphics: [
    { key: 'fpsCap', label: 'Frame rate cap', type: 'select',
      options: [[0, 'Display refresh'], [30, '30 fps'], [60, '60 fps'], [75, '75 fps'],
        [90, '90 fps'], [120, '120 fps'], [144, '144 fps'], [240, '240 fps']],
      note: 'Capping can reduce fan noise and input jitter on high-refresh displays.' },
    { key: 'antialias', label: 'Anti-aliasing', type: 'select',
      options: [['off', 'Off'], ['fxaa', 'FXAA (cheap)'], ['msaa', 'MSAA (sharpest)']],
      note: 'Switching rebuilds the renderer; the court lines are the thing it cleans up.' },
    { key: 'renderScale', label: 'Resolution scale', type: 'range',
      min: 0.4, max: 1, step: 0.05, fmt: (v) => Math.round(v * 100) + '%' },
    { key: 'shadows', label: 'Shadows', type: 'select',
      options: [['off', 'Off'], ['low', 'Hard'], ['high', 'Soft']] },
    { key: 'particles', label: 'Particle density', type: 'range',
      min: 0, max: 1.5, step: 0.1, fmt: (v) => (v === 0 ? 'Off' : Math.round(v * 100) + '%') },
    { key: 'trails', label: 'Ball trail', type: 'toggle' },
    { key: 'glow', label: 'Glow effects', type: 'toggle' },
    { key: 'crowd3d', label: 'Animated crowd', type: 'toggle' },
    { key: 'shake', label: 'Screen shake', type: 'range',
      min: 0, max: 1, step: 0.05, fmt: (v) => (v === 0 ? 'Off' : Math.round(v * 100) + '%') },
    { key: 'showFps', label: 'Show FPS counter', type: 'toggle' },
  ],
  Audio: [
    { key: 'master', label: 'Master volume', type: 'range', min: 0, max: 1, step: 0.05, fmt: pct },
    { key: 'sfx', label: 'Sound effects', type: 'range', min: 0, max: 1, step: 0.05, fmt: pct },
    { key: 'music', label: 'Music', type: 'range', min: 0, max: 1, step: 0.05, fmt: pct },
    { key: 'ambience', label: 'Crowd ambience', type: 'range', min: 0, max: 1, step: 0.05, fmt: pct },
    { key: 'muteOnBlur', label: 'Mute when window loses focus', type: 'toggle' },
  ],
  Gameplay: [
    { key: 'difficulty', label: 'CPU difficulty', type: 'select',
      options: [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']] },
    { key: 'meterAssist', label: 'Timing window', type: 'range',
      min: 0.7, max: 1.7, step: 0.1,
      fmt: (v) => (v < 0.95 ? 'Tight' : v < 1.15 ? 'Standard' : v < 1.45 ? 'Wide' : 'Very wide'),
      note: 'Widens the sweet spot on both meters. Purely a comfort option.' },
    { key: 'cameraMode', label: 'Camera', type: 'select',
      options: [['follow', 'Follow'], ['fixed', 'Fixed'], ['broadcast', 'Broadcast']] },
    { key: 'aimSensitivity', label: 'Aim sensitivity', type: 'range',
      min: 0.3, max: 2.5, step: 0.05, fmt: (v) => v.toFixed(2) + 'x' },
    { key: 'cursorStyle', label: 'Cursor', type: 'select', options: CURSOR_STYLES,
      note: 'The system cursor is hidden during a match -- this is what you aim with.' },
    { key: 'cursorColor', label: 'Cursor colour', type: 'select', options: CURSOR_COLORS },
    { key: 'cursorScale', label: 'Cursor size', type: 'range',
      min: 0.7, max: 1.8, step: 0.05, fmt: (v) => Math.round(v * 100) + '%' },
    { type: 'cursorPreview', label: 'Preview' },
    { key: 'showLanding', label: 'Show landing marker', type: 'toggle' },
    { key: 'colorblind', label: 'Colour mode', type: 'select',
      options: [['off', 'Default'], ['deuter', 'Deuteranopia'], ['protan', 'Protanopia'],
        ['tritan', 'Tritanopia']] },
  ],
};

function pct(v) { return Math.round(v * 100) + '%'; }

const CONTROLS = [
  ['W A S D', 'Move. W is always toward the net.'],
  ['Mouse', 'Aim. The marker on the far court is where the ball will land.'],
  ['Hold Left Click', 'Full power bar. All the pace you can get, but the sweet spot is a long way up.'],
  ['Hold Right Click', 'Half-length bar. Sweet spot in half the time — but it is only ever a dink.'],
  ['Release', 'Swing. Stop the marker in the sweet spot.'],
  ['Space', 'Hold while swinging for a softer, loopier ball.'],
  ['Shift', 'Dash. Costs stamina.'],
  ['Esc', 'Pause.'],
];

export class Menus {
  constructor(root, settings, audio, cb) {
    this.root = root;
    this.settings = settings;
    this.audio = audio;
    this.cb = cb;
    this.el = document.createElement('div');
    this.el.className = 'menu-layer';
    root.appendChild(this.el);
    this.screen = null;
    this.data = {};
    this.charIndex = -1;
    this.pendingRoute = 'local';
    this.settingsTab = 'Graphics';

    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      this.audio.uiClick();
      this.act(b.dataset.act, b.dataset.val, b);
    });
    this.el.addEventListener('pointerover', (e) => {
      if (e.target.closest('button, .char-card')) this.audio.uiHover();
    });
  }

  get visible() { return this.screen !== null; }

  show(name, data = {}) {
    this.screen = name;
    this.data = { ...this.data, ...data };
    this.el.classList.add('open');
    this.render();
  }

  hide() {
    this.screen = null;
    this.el.classList.remove('open');
    this.el.innerHTML = '';
  }

  // ---- actions -----------------------------------------------------------

  act(act, val) {
    switch (act) {
      case 'nav': this.show(val); break;
      case 'back': this.audio.uiBack(); this.show(val || 'main'); break;
      case 'route':
        this.pendingRoute = val;
        this.show('char');
        break;
      case 'char':
        this.charIndex = CHARACTERS.findIndex((c) => c.id === val);
        this.settings.set('lastCharacter', val);
        this.render();
        break;
      case 'mode':
        this.data.mode = val;
        this.render();
        break;
      case 'difficulty':
        this.settings.set('difficulty', val);
        this.render();
        break;
      case 'confirmChar': this.confirmChar(); break;
      case 'settingsTab': this.settingsTab = val; this.render(); break;
      case 'resetSettings':
        this.settings.reset();
        this.render();
        break;
      case 'join': this.doJoin(); break;
      case 'ready': this.cb.onReady?.(); break;
      case 'startMatch': this.cb.onStartMatch?.(); break;
      case 'copyCode': this.copyCode(); break;
      case 'resume': this.cb.onResume?.(); break;
      case 'quit': this.cb.onQuit?.(); break;
      case 'rematch': this.cb.onRematch?.(); break;
      case 'leaveLobby': this.cb.onLeave?.(); this.show('main'); break;
      default: break;
    }
  }

  confirmChar() {
    const charId = CHARACTERS[this.charIndex].id;
    const name = (this.el.querySelector('#playerName')?.value || '').trim().slice(0, 14);
    if (name) this.settings.set('playerName', name);
    const profile = { name: name || 'Player', charId };
    const config = { mode: this.data.mode || 'singles' };
    if (this.pendingRoute === 'local') this.cb.onStartLocal?.(profile, config);
    else if (this.pendingRoute === 'host') this.cb.onHost?.(profile, config);
    else this.show('join', { profile });
  }

  doJoin() {
    const code = (this.el.querySelector('#roomCode')?.value || '').trim().toUpperCase();
    if (!code) { this.setError('Enter the room code the host gave you.'); return; }
    const charId = CHARACTERS[this.charIndex].id;
    const name = this.settings.get('playerName') || 'Player';
    this.cb.onJoin?.(code, { name, charId });
  }

  copyCode() {
    const code = this.data.code || '';
    navigator.clipboard?.writeText(code).then(
      () => this.setNote('Code copied.'),
      () => this.setNote('Could not copy -- read it out instead.')
    );
  }

  setError(msg) {
    this.data.error = msg;
    const el = this.el.querySelector('#menuError');
    if (el) el.textContent = msg || '';
    else this.render();
  }

  setNote(msg) {
    const el = this.el.querySelector('#menuNote');
    if (el) el.textContent = msg || '';
  }

  setStatus(msg) {
    this.data.status = msg;
    const el = this.el.querySelector('#menuStatus');
    if (el) el.textContent = msg || '';
  }

  // ---- rendering ---------------------------------------------------------

  render() {
    const fn = this['screen_' + this.screen];
    if (!fn) { this.el.innerHTML = ''; return; }
    this.el.innerHTML = fn.call(this);
    this.afterRender();
  }

  afterRender() {
    // Portraits
    for (const cv of this.el.querySelectorAll('canvas[data-char]')) {
      const def = getCharacter(cv.dataset.char);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = cv.clientWidth || 110, h = cv.clientHeight || 140;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      const g = cv.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawPortrait(g, w, h, def);
    }
    // Live settings controls
    for (const input of this.el.querySelectorAll('[data-setting]')) {
      const key = input.dataset.setting;
      const handler = () => {
        let v;
        if (input.type === 'checkbox') v = input.checked;
        else if (input.type === 'range') v = parseFloat(input.value);
        else {
          v = input.value;
          if (typeof DEFAULTS[key] === 'number') v = parseFloat(v);
        }
        this.settings.set(key, v);
        const out = this.el.querySelector(`[data-out="${key}"]`);
        if (out) {
          const row = this.findRow(key);
          out.textContent = row && row.fmt ? row.fmt(this.settings.get(key)) : String(this.settings.get(key));
        }
      };
      const withPreview = () => { handler(); this.drawCursorPreview(); };
      input.addEventListener('input', withPreview);
      input.addEventListener('change', withPreview);
    }
    this.drawCursorPreview();
    const code = this.el.querySelector('#roomCode');
    if (code) {
      code.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.doJoin(); });
      code.focus();
    }
  }

  // Draw the reticle over bands of the colours it has to survive on court:
  // blue surface, teal kitchen, white line and green surround.
  drawCursorPreview() {
    const cv = this.el.querySelector('canvas[data-cursor-preview]');
    if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = cv.clientWidth || 224, h = cv.clientHeight || 76;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bands = ['#2f7fc4', '#1fa091', '#f4f7fb', '#3f7f63'];
    const bw = w / bands.length;
    bands.forEach((col, i) => { g.fillStyle = col; g.fillRect(i * bw, 0, bw + 1, h); });
    for (let i = 0; i < bands.length; i++) {
      drawReticle(g, (i + 0.5) * bw, h / 2,
        this.settings.get('cursorStyle'),
        this.settings.get('cursorColor'),
        this.settings.get('cursorScale'));
    }
  }

  findRow(key) {
    for (const rows of Object.values(SCHEMA)) {
      const r = rows.find((x) => x.key === key);
      if (r) return r;
    }
    return null;
  }

  frame(title, body, footer = '') {
    return `<div class="menu-panel">
      <div class="menu-head"><h1>${title}</h1></div>
      <div class="menu-body">${body}</div>
      <div class="menu-foot">${footer}</div>
    </div>`;
  }

  screen_main() {
    return `<div class="menu-panel wide title-panel">
      <div class="brand">
        <div class="brand-mark"></div>
        <div>
          <h1>PICKLEBALL</h1>
          <p class="tagline">Dink. Drive. Destroy.</p>
        </div>
      </div>
      <div class="menu-body">
        <div class="menu-grid">
          <button class="big" data-act="route" data-val="local">
            <strong>Single Player</strong><span>Play the CPU on your own court</span>
          </button>
          <button class="big" data-act="route" data-val="host">
            <strong>Host Online</strong><span>Create a room and share the code</span>
          </button>
          <button class="big" data-act="route" data-val="join">
            <strong>Join Online</strong><span>Enter a friend's room code</span>
          </button>
          <button class="big" data-act="nav" data-val="settings">
            <strong>Settings</strong><span>Graphics, audio and feel</span>
          </button>
          <button class="big" data-act="nav" data-val="controls">
            <strong>How to Play</strong><span>Controls and the rules that matter</span>
          </button>
        </div>
      </div>
      <div class="menu-foot"><span class="muted">Peer-to-peer. No account, no server, no install.</span></div>
    </div>`;
  }

  screen_char() {
    const saved = this.settings.get('lastCharacter');
    if (this.charIndex < 0) {
      this.charIndex = Math.max(0, CHARACTERS.findIndex((c) => c.id === saved));
    }
    const sel = CHARACTERS[this.charIndex];
    const mode = this.data.mode || 'singles';
    const cards = CHARACTERS.map((c, i) => `
      <div class="char-card ${i === this.charIndex ? 'sel' : ''}" data-act="char" data-val="${c.id}">
        <canvas data-char="${c.id}"></canvas>
        <div class="char-name">${c.name}</div>
        <div class="char-title">${c.title}</div>
      </div>`).join('');

    const stats = Object.entries(sel.stats).map(([k, v]) => {
      const pctv = Math.max(4, Math.min(100, ((v - 0.7) / 0.62) * 100));
      return `<div class="stat-row">
        <span>${STAT_LABELS[k]}</span>
        <div class="stat-bar"><i style="width:${pctv}%"></i></div>
      </div>`;
    }).join('');

    const routeLabel = this.pendingRoute === 'local' ? 'Start Match'
      : this.pendingRoute === 'host' ? 'Create Room' : 'Continue';

    const diff = this.settings.get('difficulty');
    const DIFFS = [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']];
    const modePicker = this.pendingRoute === 'join' ? '' : `
      <div class="picker">
        <span class="picker-label">Match</span>
        <div class="seg">
          <button class="${mode === 'singles' ? 'on' : ''}" data-act="mode" data-val="singles">Singles</button>
          <button class="${mode === 'doubles' ? 'on' : ''}" data-act="mode" data-val="doubles">Doubles</button>
        </div>
      </div>
      <div class="picker">
        <span class="picker-label">CPU difficulty</span>
        <div class="seg">
          ${DIFFS.map(([v, label]) => `<button class="${diff === v ? 'on' : ''}"
            data-act="difficulty" data-val="${v}">${label}</button>`).join('')}
        </div>
      </div>`;

    return `<div class="menu-panel wide">
      <div class="menu-head"><h1>Choose your player</h1></div>
      <div class="menu-body char-layout">
        <div class="char-grid">${cards}</div>
        <div class="char-detail">
          <h2>${sel.name} <small>${sel.title}</small></h2>
          <p class="blurb">${sel.blurb}</p>
          ${stats}
          <label class="field">
            <span>Name</span>
            <input id="playerName" maxlength="14" placeholder="Player"
              value="${escapeAttr(this.settings.get('playerName'))}">
          </label>
          ${modePicker}
        </div>
      </div>
      <div class="menu-foot">
        <button data-act="back" data-val="main">Back</button>
        <button class="primary" data-act="confirmChar">${routeLabel}</button>
      </div>
    </div>`;
  }

  screen_join() {
    return this.frame('Join a room', `
      <p class="muted">Ask the host for their five-character room code.</p>
      <label class="field big-field">
        <span>Room code</span>
        <input id="roomCode" maxlength="5" autocomplete="off" spellcheck="false"
          placeholder="ABCDE" style="text-transform:uppercase">
      </label>
      <p class="err" id="menuError">${this.data.error || ''}</p>
      <p class="muted" id="menuStatus">${this.data.status || ''}</p>
    `, `
      <button data-act="back" data-val="char">Back</button>
      <button class="primary" data-act="join">Connect</button>
    `);
  }

  screen_lobby() {
    const d = this.data;
    const players = (d.players || []).map((p) => `
      <li class="${p.ready ? 'ready' : ''}">
        <canvas data-char="${p.charId}" class="mini"></canvas>
        <span class="pl-name">${escapeHtml(p.name)}</span>
        <span class="pl-char">${getCharacter(p.charId).name}</span>
        <span class="pl-ping">${p.ping != null ? Math.round(p.ping) + ' ms' : ''}</span>
        <span class="pl-state">${p.isHost ? 'Host' : p.ready ? 'Ready' : 'Waiting'}</span>
      </li>`).join('');

    const need = d.mode === 'doubles' ? 4 : 2;
    const have = (d.players || []).length;
    const canStart = d.isHost && have >= 2;

    return this.frame('Lobby', `
      <div class="code-box">
        <span class="muted">Room code</span>
        <div class="code">${d.code || '-----'}</div>
        <button class="ghost" data-act="copyCode">Copy</button>
      </div>
      <p class="muted" id="menuNote"></p>
      <ul class="player-list">${players}</ul>
      <p class="muted">${have} of ${need} players — ${d.mode === 'doubles' ? 'Doubles' : 'Singles'}.
        ${have < need ? 'Empty slots are filled by the CPU.' : ''}</p>
      <p class="muted" id="menuStatus">${d.status || ''}</p>
    `, `
      <button data-act="leaveLobby">Leave</button>
      ${d.isHost
        ? `<button class="primary" data-act="startMatch" ${canStart ? '' : 'disabled'}>Start Match</button>`
        : `<button class="primary" data-act="ready">${d.ready ? 'Not ready' : 'Ready'}</button>`}
    `);
  }

  screen_settings() {
    const tabs = Object.keys(SCHEMA).concat(['Controls']);
    const tabBar = tabs.map((t) =>
      `<button class="tab ${t === this.settingsTab ? 'on' : ''}" data-act="settingsTab" data-val="${t}">${t}</button>`
    ).join('');

    let body;
    if (this.settingsTab === 'Controls') {
      body = `<table class="controls">${CONTROLS.map(
        ([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>`;
    } else {
      body = SCHEMA[this.settingsTab].map((row) => this.renderRow(row)).join('');
    }

    return this.frame('Settings', `
      <div class="tab-bar">${tabBar}</div>
      <div class="settings-list">${body}</div>
    `, `
      <button data-act="back" data-val="${this.data.returnTo || 'main'}">Back</button>
      <button data-act="resetSettings">Reset to defaults</button>
    `);
  }

  renderRow(row) {
    if (row.type === 'cursorPreview') {
      return `<div class="set-row">
        <div class="set-label"><span>${row.label}</span>
          <small>Exactly what you will see on court.</small></div>
        <div class="set-control">
          <canvas class="cursor-preview" data-cursor-preview width="224" height="76"></canvas>
        </div>
      </div>`;
    }
    const v = this.settings.get(row.key);
    let control = '';
    if (row.type === 'toggle') {
      control = `<label class="switch">
        <input type="checkbox" data-setting="${row.key}" ${v ? 'checked' : ''}>
        <i></i></label>`;
    } else if (row.type === 'range') {
      control = `<div class="range-wrap">
        <input type="range" data-setting="${row.key}" min="${row.min}" max="${row.max}"
          step="${row.step}" value="${v}">
        <span class="range-out" data-out="${row.key}">${row.fmt ? row.fmt(v) : v}</span>
      </div>`;
    } else if (row.type === 'select') {
      control = `<select data-setting="${row.key}">${row.options.map(([val, label]) =>
        `<option value="${val}" ${String(val) === String(v) ? 'selected' : ''}>${label}</option>`
      ).join('')}</select>`;
    }
    return `<div class="set-row">
      <div class="set-label"><span>${row.label}</span>
        ${row.note ? `<small>${row.note}</small>` : ''}</div>
      <div class="set-control">${control}</div>
    </div>`;
  }

  screen_controls() {
    return this.frame('How to play', `
      <table class="controls">${CONTROLS.map(
        ([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>
      <h3>The meters</h3>
      <p><b>Left click</b> is the <b>power bar</b>: it fills while you hold, and the sweet spot
      sits near the top. You want maximum power <i>and</i> a release inside the band, so it is a
      test of nerve. Hold too long and the shot overcooks into a floater.</p>
      <p><b>Right click</b> is the <b>short bar</b> — the same bar at half the length, so its
      sweet spot arrives in half the time. The catch is that it can only ever produce a dink.
      That is the real decision in this game: when a ball comes back too fast to fill a drive,
      you can force a mistimed big shot and get punished, or take a clean quick dink and stay
      in the rally.</p>
      <p>Standing at the kitchen line swaps left click for the <b>reaction bar</b>: a needle
      sweeps back and forth and the sweet spot moves every time. Power is fixed there, so it is
      purely about reacting in time.</p>
      <h3>Rules worth knowing</h3>
      <ul class="rules">
        <li><b>The kitchen</b> is the coloured zone by the net. You may stand in it, but you may
          not volley from it — let the ball bounce first.</li>
        <li><b>Two-bounce rule:</b> the serve and the return must both bounce before anyone
          can volley.</li>
        <li><b>Serving</b> is underhand and cross-court, and must clear the kitchen.</li>
        <li>Rally scoring to 11, win by 2.</li>
      </ul>
    `, `<button data-act="back" data-val="${this.data.returnTo || 'main'}">Back</button>`);
  }

  screen_pause() {
    return this.frame('Paused', `
      <p class="muted">${this.data.netNote || ''}</p>
    `, `
      <button class="primary" data-act="resume">Resume</button>
      <button data-act="nav" data-val="settings">Settings</button>
      <button data-act="quit">Quit to menu</button>
    `);
  }

  screen_results() {
    const d = this.data;
    const rows = (d.stats || []).map(([k, v]) =>
      `<tr><th>${k}</th><td>${v}</td></tr>`).join('');
    return this.frame(d.won ? 'You win' : 'You lose', `
      <div class="final-score">${d.score ? d.score.join(' - ') : ''}</div>
      <table class="controls">${rows}</table>
    `, `
      <button data-act="quit">Menu</button>
      ${d.canRematch ? '<button class="primary" data-act="rematch">Rematch</button>' : ''}
    `);
  }

  screen_connecting() {
    return this.frame('Connecting', `
      <div class="spinner"></div>
      <p class="muted" id="menuStatus">${this.data.status || 'Establishing peer connection…'}</p>
      <p class="err" id="menuError">${this.data.error || ''}</p>
    `, `<button data-act="back" data-val="main">Cancel</button>`);
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
function escapeAttr(s) { return escapeHtml(s); }
