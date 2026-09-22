import { DEFAULTS } from '../core/settings.js';
import { drawPortrait } from './portrait.js';
import { CharacterPreview } from './preview.js';
import { CURSOR_STYLES, CURSOR_COLORS, drawReticle } from './reticle.js';
import { icon } from './icons.js';
import {
  avatarDef, cleanName, optionsFor, findOption, isUnlocked, loadLook, saveLook,
} from '../game/avatar.js';
import { cssHex } from '../game/color.js';
import {
  VENUES, getVenue, venueUnlocked, playableVenue,
} from '../render/venues.js';
import { seasonLength } from '../game/enemies.js';
import {
  DIFFICULTIES, DIFFICULTY_NAME, START_LIVES, MAX_LIVES, bonusAt,
  ladderFor, completedDifficulties, bestProgress, activeRun, clearCount,
} from '../game/season.js';
import {
  ACHIEVEMENTS, GROUPS, achievementState, unlockedCount,
} from '../game/achievements.js';

const STAT_LABELS = {
  speed: 'Speed', reach: 'Reach', control: 'Control', drive: 'Drive', dink: 'Dink',
};

// What a rival's stat bar is measuring, for the scouting card. Your own stats
// are not shown anywhere: they are the same every match, so there is nothing
// to read. These describe what the number does TO YOU.
const STAT_THREAT = {
  speed: 'Covers the court faster than you do.',
  reach: 'Digs out wide balls and gets above floaters.',
  control: 'A scrappy touch still lands where they meant it.',
  drive: 'A wider sweet spot on the big swing.',
  dink: 'A wider sweet spot in the kitchen exchange.',
};

// What each stat actually drives, written against the code rather than the
// vibe. Kept honest deliberately: a stat screen that describes something the
// simulation does not do is worse than no stat screen.
const STAT_TIPS = {
  speed: {
    title: 'Running speed',
    body: 'How fast you move and how far a dash carries you. Nothing else — it does not affect your shots.',
  },
  reach: {
    title: 'Paddle reach',
    body: 'How far the paddle can still meet the ball — both out to the side and overhead. High reach digs out wide balls and gets above floaters.',
  },
  control: {
    title: 'Accuracy',
    body: 'How close a mistimed shot still lands to where you aimed. High control means a scrappy touch does not become a wild one.',
  },
  drive: {
    title: 'Drive sweet spot',
    body: 'Widens the sweet spot on the full power bar — the left-click shot. Makes the big swing easier to time cleanly.',
  },
  dink: {
    title: 'Dink sweet spot',
    body: 'Widens the sweet spot on the kitchen needle and on the short right-click bar. Both of your soft shots get easier to nail.',
  },
};

// Power and wind-up speed are the same for everyone, and the select screen
// says so rather than leaving people to wonder why they are missing.
const FIXED_NOTE = 'Shot power and wind-up speed are the same for every character.';

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
    { key: 'netFade', label: 'See through the net', type: 'toggle',
      note: 'Fades the net away around the cursor while you aim at it, so you can see the far kitchen through it. Off by default -- it changes what the court looks like, not what it does.' },
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
      options: [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard'],
        ['extreme', 'Extreme']],
      note: 'Extreme bots read the ball almost instantly, cover the whole court and only sprint for balls they would otherwise miss.' },
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

// Movement and the odds and ends. The three swings get their own cards on the
// How to Play screen rather than a row each here -- they are the game, and a
// table row does not have space to say why you would pick one.
const CONTROLS = [
  ['W A S D', 'Move. W is always toward the net, whichever end you are at.'],
  ['Mouse', 'Aim. The marker on the far court is where the ball will land.'],
  ['Shift', 'Dash. Costs stamina, and a spent bar is slow to come back.'],
  ['Esc', 'Pause.'],
];

// The three swings, as cards. Key, name, one line on what it is for, and the
// catch -- because every one of them is a trade and the trade is the game.
const SWINGS = [
  {
    key: 'Left Click', name: 'Drive', tag: 'Full bar',
    what: 'The whole power bar, sweet spot near the top. All the pace you can '
      + 'get, and the only swing that can really hurt anybody.',
    cost: 'The longest wait, and the most rope to hang yourself with. Overfill '
      + 'the bar and you choke it -- straight into the net off a low ball, over '
      + 'the baseline off a high one. Either way the point is gone.',
  },
  {
    key: 'Right Click', name: 'Dink', tag: 'Half bar',
    what: 'The same bar at half the length, so the sweet spot arrives in half '
      + 'the time. The answer when a ball comes back too fast to fill a drive.',
    cost: 'It can never hit hard -- you stay in the rally rather than win it. '
      + 'And the red is still the red: overfill the short bar and you choke it '
      + 'exactly the same way.',
  },
  {
    key: 'Space', name: 'Lob', tag: 'No bar',
    what: 'Fires the instant you press it -- no charge, no timing -- and it '
      + 'stretches further than either of the others, so it reaches balls at '
      + 'your shoelaces or above your head that nothing else touches.',
    cost: 'It hands back a high, slow ball with seconds to line it up. This is '
      + 'the shot for when the alternative is not reaching the ball at all.',
  },
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
    this.pendingRoute = 'local';
    this.settingsTab = 'Graphics';
    this.achieveTab = GROUPS[0];
    // Portraits are drawn from a full definition now, not an id: a human's
    // look is chosen rather than looked up. Screens register the defs they
    // want drawn and reference them by index.
    this._portraits = [];
    // Working copy of the look while the editor is open, so backing out of
    // the editor does not have to undo anything.
    this.draft = null;

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
    // Status and error lines belong to the screen that put them there. Merging
    // data forward is what carried "Creating room..." out of the connecting
    // screen and left it sitting under the lobby's player list.
    const moved = this.screen !== name;
    // A half-answered confirmation must not be waiting when you come back.
    if (moved) this.confirmQuit = false;
    this.screen = name;
    this.data = moved
      ? { ...this.data, status: '', error: '', ...data }
      : { ...this.data, ...data };
    this.el.classList.add('open');
    this.render();
    this.cb.onScreen?.(this.screen);
  }

  hide() {
    if (this.preview) this.preview.stop();
    this.screen = null;
    this._renderedScreen = null;
    this.el.classList.remove('open');
    this.el.innerHTML = '';
    this.cb.onScreen?.(null);
  }

  // ---- actions -----------------------------------------------------------

  act(act, val, el) {
    switch (act) {
      case 'nav': this.show(val); break;
      case 'back': this.audio.uiBack(); this.show(val || 'main'); break;
      case 'route':
        this.pendingRoute = val;
        if (val === 'local') this.show('exhibition');
        else if (val === 'host') this.cb.onHost?.(this.profile(), { mode: 'singles' });
        else this.show('join');
        break;
      case 'mode':
        this.data.mode = val;
        this.render();
        break;
      case 'difficulty':
        this.settings.set('difficulty', val);
        this.render();
        break;
      case 'venue':
        // The button is disabled, but the setting is also reachable from an
        // older save, so the guard lives with the write rather than the click.
        if (!venueUnlocked(val, completedDifficulties())) break;
        this.settings.set('venue', val);
        this.cb.onVenue?.(val);
        this.render();
        break;
      case 'playExhibition':
        this.cb.onStartLocal?.(this.profile(), { mode: this.data.mode || 'singles' });
        break;

      // ---- player editor --------------------------------------------------
      case 'editor':
        this.draft = { ...this.look() };
        this.show('creator', { returnTo: val || 'main' });
        break;
      case 'look': this.editLook(el); break;
      case 'creatorSave': this.saveDraft(); break;
      case 'creatorCancel':
        this.audio.uiBack();
        this.draft = null;
        this.show(this.data.returnTo || 'main');
        break;

      // ---- season ---------------------------------------------------------
      case 'seasonStart': this.cb.onSeasonStart?.(val); break;
      case 'seasonPlay': this.cb.onSeasonPlay?.(); break;
      case 'seasonQuit': {
        // Abandoning wipes the run, and there is no undo. Worth a question --
        // but only once there is something to lose: on a fresh ladder with
        // nobody beaten yet, the prompt is just a click in the way.
        const run = activeRun();
        if (run && run.index > 0 && !this.confirmQuit) {
          this.confirmQuit = true;
          this.render();
          break;
        }
        this.confirmQuit = false;
        this.cb.onSeasonQuit?.();
        break;
      }
      case 'seasonQuitCancel':
        this.audio.uiBack();
        this.confirmQuit = false;
        this.render();
        break;

      case 'achieveTab': this.achieveTab = val; this.render(); break;
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
      case 'changeChar':
        this.draft = { ...this.look() };
        this.show('creator', { returnTo: 'lobby' });
        break;
      case 'lobbyMode':
        this.data.mode = val;
        this.cb.onLobbyMode?.(val);
        this.render();
        break;
      case 'toLobby': this.cb.onBackToLobby?.(); break;
      case 'seasonContinue': this.cb.onSeasonContinue?.(); break;
      default: break;
    }
  }

  /** What gets sent to the other side, and what a local match is built from. */
  profile() {
    const look = this.look();
    return { name: look.name, look };
  }

  // One swatch or chip click. The draft is edited in place and the screen
  // re-rendered, so the preview is always the thing that would be saved.
  editLook(el) {
    if (!this.draft) this.draft = { ...this.look() };
    const slot = el?.dataset?.slot;
    if (slot === 'random') {
      const completed = completedDifficulties();
      for (const key of ['shirtColor', 'paddleColor', 'skin', 'shirt', 'accessory']) {
        const pool = optionsFor(key).filter((o) => isUnlocked(o, completed));
        this.draft[key] = pool[(Math.random() * pool.length) | 0].id;
      }
    } else if (slot) {
      this.draft[slot] = el.dataset.val;
    }
    this.captureName();
    this.render();
  }

  // The name input is a live DOM value, so it has to be folded into the draft
  // before anything re-renders or it is lost on the next swatch click.
  captureName() {
    const typed = this.el.querySelector('#playerName');
    if (typed && this.draft) this.draft.name = cleanName(typed.value);
  }

  saveDraft() {
    this.captureName();
    const saved = this.commitLook(this.draft || {});
    this.settings.set('playerName', saved.name);
    this.draft = null;
    this.cb.onLookSaved?.(saved);
    const back = this.data.returnTo || 'main';
    if (back === 'lobby') this.cb.onChangeCharacter?.(this.profile());
    this.show(back);
  }

  // ---- venue picker -------------------------------------------------------

  // Shared by the exhibition screen and the lobby, so the host and a solo
  // player are choosing from the same control rather than two that drift.
  // Swatches rather than names alone: a court is a look, and the two colours
  // that matter are the surface and the kitchen.
  venuePicker(venueId, disabled = false) {
    const completed = completedDifficulties();
    // Locked courts are still shown, with the season that opens them. Hiding
    // them would hide the reason to play one.
    const cards = VENUES.map((v) => {
      const locked = !venueUnlocked(v.id, completed);
      return `
      <button class="venue-card ${v.id === venueId ? 'on' : ''} ${locked ? 'locked' : ''}"
        data-act="venue" data-val="${v.id}" ${disabled || locked ? 'disabled' : ''}
        title="${locked
          ? `Locked — clear the ${DIFFICULTY_NAME[v.unlock]} season`
          : escapeAttr(v.blurb)}">
        <span class="venue-swatch" style="--a:${v.court.surface};--b:${v.kitchen.surface};--c:${v.ground.base}"></span>
        <span class="venue-text">
          <strong>${escapeHtml(v.name)}</strong>
          ${locked ? `<em>Clear ${DIFFICULTY_NAME[v.unlock]}</em>` : ''}
        </span>
      </button>`;
    }).join('');
    const locked = VENUES.filter((v) => !venueUnlocked(v.id, completed)).length;
    return `
      <div class="picker">
        <span class="picker-label">Court</span>
        <div class="venues">${cards}</div>
      </div>
      <p class="muted fine venue-blurb">${escapeHtml(getVenue(venueId).blurb)}${
        locked ? ` ${locked} more court${locked === 1 ? ' is' : 's are'}
          waiting behind a cleared season.` : ''}</p>`;
  }

  /** The chosen court, or the rec courts if the choice is no longer allowed. */
  venueChoice() {
    return playableVenue(this.settings.get('venue'), completedDifficulties());
  }

  // ---- exhibition ---------------------------------------------------------

  screen_exhibition() {
    const mode = this.data.mode || 'singles';
    const diff = this.settings.get('difficulty');
    return this.frame('Exhibition', `
      <p>A single match against the CPU. Nothing is at stake and nothing is
        unlocked — the season is where the ladder lives.</p>
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
          ${DIFFICULTIES.map((v) => `<button class="${diff === v ? 'on' : ''}"
            data-act="difficulty" data-val="${v}">${DIFFICULTY_NAME[v]}</button>`).join('')}
        </div>
      </div>
      ${this.venuePicker(this.venueChoice())}
    `, `
      <button data-act="back" data-val="main">Back</button>
      <button data-act="editor" data-val="exhibition">My Player</button>
      <button class="primary" data-act="playExhibition">Start Match</button>
    `);
  }

  doJoin() {
    const code = (this.el.querySelector('#roomCode')?.value || '').trim().toUpperCase();
    if (!code) { this.setError('Enter the room code the host gave you.'); return; }
    this.cb.onJoin?.(code, this.profile());
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
    if (!fn) {
      // Blanking the layer silently is how a missing screen turns into "the
      // button does nothing" -- which is exactly how screen_join went missing
      // for a commit. Say so instead.
      console.error(`Menus: no screen named "${this.screen}"`);
      this.el.innerHTML = '';
      this._renderedScreen = null;
      return;
    }

    // Picking a character or a difficulty re-renders the same screen. Rebuilding
    // the markup is fine, but the panel must not replay its entrance animation
    // or restart from the top, or every click looks like the dialog flashed.
    const sameScreen = this._renderedScreen === this.screen;
    const oldBody = this.el.querySelector('.menu-body');
    const scroll = sameScreen && oldBody ? oldBody.scrollTop : 0;
    const typed = sameScreen
      ? (this.el.querySelector('#playerName') || {}).value : undefined;

    this._portraits = [];
    this.el.innerHTML = fn.call(this);
    this._renderedScreen = this.screen;

    const panel = this.el.querySelector('.menu-panel');
    if (panel && !sameScreen) panel.classList.add('enter');
    const body = this.el.querySelector('.menu-body');
    if (body && scroll) body.scrollTop = scroll;
    // A half-typed name would otherwise be thrown away by the re-render.
    const nameInput = this.el.querySelector('#playerName');
    if (nameInput && typed !== undefined) nameInput.value = typed;

    this.afterRender();
  }

  // Custom tooltip: one element reused for every stat row, positioned beside
  // the row it belongs to and flipped if it would run off the panel.
  bindStatTips() {
    const rows = this.el.querySelectorAll('[data-tip]');
    if (!rows.length) return;
    let tip = this.el.querySelector('.tip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'tip';
      this.el.appendChild(tip);
    }
    const show = (row) => {
      const info = STAT_TIPS[row.dataset.tip];
      if (!info) return;
      tip.innerHTML = `<strong>${info.title}</strong><span>${info.body}</span>`;
      tip.classList.add('on');
      const r = row.getBoundingClientRect();
      const host = this.el.getBoundingClientRect();
      tip.style.visibility = 'hidden';
      tip.style.left = '0px';
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      let left = r.left - host.left - tw - 14;
      if (left < 8) left = r.right - host.left + 14;          // flip to the right
      left = Math.min(left, host.width - tw - 8);
      let top = r.top - host.top + r.height / 2 - th / 2;
      top = Math.max(8, Math.min(top, host.height - th - 8));
      tip.style.left = left + 'px';
      tip.style.top = top + 'px';
      tip.style.visibility = '';
    };
    const hide = () => tip.classList.remove('on');
    for (const row of rows) {
      row.addEventListener('pointerenter', () => show(row));
      row.addEventListener('pointerleave', hide);
      row.addEventListener('focus', () => show(row));
      row.addEventListener('blur', hide);
    }
  }

  // Register a definition and return the canvas that will hold its portrait.
  portrait(def, cls = '') {
    const i = this._portraits.push(def) - 1;
    return `<canvas data-portrait="${i}"${cls ? ` class="${cls}"` : ''}></canvas>`;
  }

  afterRender() {
    // Live 3D preview, if this screen wants one. There is a single renderer
    // moved between hosts -- only one preview is ever on screen at a time.
    const stage = this.el.querySelector('[data-live]');
    if (stage) {
      if (!this.preview) this.preview = new CharacterPreview();
      this.preview.attach(stage, this.myDef(this.draft || this.look()));
    } else if (this.preview) {
      this.preview.stop();
    }

    // Portraits
    for (const cv of this.el.querySelectorAll('canvas[data-portrait]')) {
      const def = this._portraits[+cv.dataset.portrait];
      if (!def) continue;
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
    this.bindStatTips();
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

  frame(title, body, footer = '', cls = '') {
    return `<div class="menu-panel${cls ? ' ' + cls : ''}">
      <div class="menu-head"><h1>${title}</h1></div>
      <div class="menu-body">${body}</div>
      <div class="menu-foot">${footer}</div>
    </div>`;
  }

  screen_main() {
    const done = completedDifficulties();
    const earned = unlockedCount();
    const pct = Math.round((earned / ACHIEVEMENTS.length) * 100);
    const run = activeRun();
    const me = this.look();

    // A ring of pips, one per difficulty, filled as each season is cleared.
    // The headline tile should say where you are up to without being read.
    const pips = DIFFICULTIES.map((d) => `<i class="${
      done.includes(d) ? 'on' : ''}" title="${DIFFICULTY_NAME[d]}"></i>`).join('');

    return `<div class="menu-panel wide title-panel">
      <div class="brand">
        <div class="brand-mark"></div>
        <div>
          <h1>PICKLEBALL</h1>
          <p class="tagline">Dink. Drive. Destroy.</p>
        </div>
      </div>
      <div class="menu-body home">
        <section class="home-sec">
          <h3 class="sec-label">Play</h3>
          <div class="home-row lead">
            <button class="tile hero ${run ? 'live' : ''}" data-act="nav" data-val="season">
              <strong>${icon('trophy')}Season</strong>
              <span>${this.seasonTagline()}</span>
              <div class="pips">${pips}</div>
            </button>
            <button class="tile" data-act="route" data-val="local">
              <strong>${icon('paddle')}Exhibition</strong>
              <span>One match against the CPU. Nothing at stake.</span>
            </button>
          </div>
        </section>

        <section class="home-sec">
          <h3 class="sec-label">Online</h3>
          <div class="home-row two">
            <button class="tile" data-act="route" data-val="host">
              <strong>${icon('host')}Host a Room</strong>
              <span>Create a room and share the code</span>
            </button>
            <button class="tile" data-act="route" data-val="join">
              <strong>${icon('join')}Join a Room</strong>
              <span>Enter a friend's room code</span>
            </button>
          </div>
        </section>

        <section class="home-sec">
          <h3 class="sec-label">Your player</h3>
          <div class="home-row two">
            <button class="tile face" data-act="editor" data-val="main">
              <span class="tile-face" data-live></span>
              <span class="tile-text">
                <strong>${escapeHtml(me.name)}</strong>
                <span>Name, kit, paddle and headwear</span>
              </span>
            </button>
            <button class="tile" data-act="nav" data-val="achievements">
              <strong>${icon('medal')}Achievements</strong>
              <span>${earned} of ${ACHIEVEMENTS.length} earned</span>
              <div class="tile-bar"><i style="width:${pct}%"></i></div>
            </button>
          </div>
        </section>
      </div>
      <div class="menu-foot home-foot">
        <span class="muted">Peer-to-peer. No account, no server, no install.</span>
        <span class="home-links">
          <button data-act="nav" data-val="controls">${icon('book')}How to Play</button>
          <button data-act="nav" data-val="settings">${icon('cog')}Settings</button>
        </span>
      </div>
    </div>`;
  }

  // ---- the player ---------------------------------------------------------

  /** The saved look, kept on `this` so a screen can read it without re-parsing. */
  look() {
    if (!this._look) this._look = loadLook(completedDifficulties());
    return this._look;
  }

  myDef(look) { return avatarDef(look || this.look()); }

  commitLook(look) {
    this._look = saveLook(look, completedDifficulties());
    return this._look;
  }

  seasonTagline() {
    const run = activeRun();
    if (run) {
      return `Resume — ${DIFFICULTY_NAME[run.difficulty]}, rival `
        + `${run.index + 1} of ${seasonLength(run.difficulty)}`;
    }
    const done = completedDifficulties().length;
    if (!done) return `Eleven rivals, three lives`;
    if (done >= DIFFICULTIES.length) return 'All four cleared. Again?';
    return `${done} of ${DIFFICULTIES.length} difficulties cleared`;
  }

  // ---- player editor ------------------------------------------------------

  screen_creator() {
    const d = this.draft || (this.draft = { ...this.look() });
    const completed = completedDifficulties();
    const def = avatarDef(d);

    const swatches = (slot) => optionsFor(slot).map((o) => {
      const on = d[slot] === o.id;
      const locked = !isUnlocked(o, completed);
      return `<button class="swatch ${on ? 'on' : ''} ${locked ? 'locked' : ''}"
        style="--sw:${cssHex(o.hex)}" data-act="look" data-slot="${slot}"
        data-val="${o.id}" title="${escapeAttr(o.name)}${locked ? ' — locked' : ''}"
        ${locked ? 'disabled' : ''}><i></i></button>`;
    }).join('');

    const chips = (slot) => optionsFor(slot).map((o) => {
      const on = d[slot] === o.id;
      const locked = !isUnlocked(o, completed);
      return `<button class="chip ${on ? 'on' : ''} ${locked ? 'locked' : ''}"
        data-act="look" data-slot="${slot}" data-val="${o.id}"
        ${locked ? 'disabled' : ''}>${escapeHtml(o.name)}${
        locked ? `<em>${DIFFICULTY_NAME[o.unlock]}</em>` : ''}</button>`;
    }).join('');

    const shirtNote = findOption('shirt', d.shirt).note || '';
    const lockedLeft = [...optionsFor('shirtColor'), ...optionsFor('paddleColor'),
      ...optionsFor('shirt'), ...optionsFor('accessory')]
      .filter((o) => !isUnlocked(o, completed)).length;

    return `<div class="menu-panel wide">
      <div class="menu-head"><h1>My Player</h1></div>
      <div class="menu-body creator">
        <div class="creator-preview">
          <div class="live-stage" data-live></div>
          <div class="creator-name">${escapeHtml(d.name)}</div>
          <p class="muted fine">Everybody plays with the same stats. This is
            purely how you turn up.</p>
        </div>
        <div class="creator-opts">
          <label class="field">
            <span>Name</span>
            <input id="playerName" maxlength="14" placeholder="Player"
              value="${escapeAttr(d.name)}">
          </label>
          <div class="opt-row"><span class="opt-label">Kit colour</span>
            <div class="swatches">${swatches('shirtColor')}</div></div>
          <div class="opt-row"><span class="opt-label">Paddle</span>
            <div class="swatches">${swatches('paddleColor')}</div></div>
          <div class="opt-row"><span class="opt-label">Skin</span>
            <div class="swatches">${swatches('skin')}</div></div>
          <div class="opt-row"><span class="opt-label">Shirt</span>
            <div class="chips">${chips('shirt')}</div></div>
          <p class="muted fine">${escapeHtml(shirtNote)}</p>
          <div class="opt-row"><span class="opt-label">Headwear</span>
            <div class="chips">${chips('accessory')}</div></div>
          ${lockedLeft ? `<p class="muted fine">${lockedLeft} item${
            lockedLeft === 1 ? '' : 's'} still locked — clear a season on
            each difficulty to earn them.</p>` : ''}
        </div>
      </div>
      <div class="menu-foot">
        <button data-act="creatorCancel">Cancel</button>
        <button data-act="look" data-slot="random" data-val="1">Surprise Me</button>
        <button class="primary" data-act="creatorSave">Save</button>
      </div>
    </div>`;
  }

  // ---- season -------------------------------------------------------------

  screen_season() {
    const run = activeRun();
    if (run) return this.seasonLadder(run);

    const cards = DIFFICULTIES.map((id) => {
      const done = completedDifficulties().includes(id);
      const best = bestProgress(id);
      const clears = clearCount(id);
      const n = seasonLength(id);
      return `<button class="big diff-card ${done ? 'done' : ''}"
        data-act="seasonStart" data-val="${id}">
        <strong>${DIFFICULTY_NAME[id]}</strong>
        <span><b>${n} matches</b> &mdash; ${done
          ? `cleared${clears > 1 ? ` ×${clears}` : ''}`
          : best ? `best: rival ${best} of ${n}` : 'not yet attempted'}</span>
      </button>`;
    }).join('');

    return this.frame('Season', `
      <p>A ladder of rivals, faced one at a time, each better than the last.
        Every ladder opens against the warm-up and finishes against the
        champion &mdash; the harder the season, the more of the roster stands
        between them.</p>
      <p>You get <b>${START_LIVES} lives</b>. Lose a match and it costs one and
        you face the same rival again. Get two thirds of the way up and you are
        handed a ${MAX_LIVES}th.</p>
      <p class="muted">Every rival is stronger than you on paper. You are the
        same player in every match.</p>
      <div class="menu-grid two">${cards}</div>
    `, `<button data-act="back" data-val="main">Back</button>`);
  }

  seasonLadder(run) {
    const rungs = ladderFor(run.difficulty);
    const rows = rungs.map((r) => {
      const state = r.index < run.index ? 'beaten'
        : r.index === run.index ? 'next' : 'ahead';
      return `<li class="rung ${state}">
        <span class="rung-no">${r.index + 1}</span>
        ${this.portrait(r.def, 'mini')}
        <span class="rung-name">${escapeHtml(r.def.name)}</span>
        <span class="rung-title">${escapeHtml(r.def.title)}</span>
        <span class="rung-state">${state === 'beaten' ? 'Beaten'
          : state === 'next' ? 'Up next' : ''}</span>
      </li>`;
    }).join('');

    return `<div class="menu-panel wide">
      <div class="menu-head">
        <h1>Season — ${DIFFICULTY_NAME[run.difficulty]}</h1>
        <div class="lives" title="${run.lives} of ${MAX_LIVES} lives left">
          ${Array.from({ length: MAX_LIVES }, (_, i) =>
            `<i class="${i < run.lives ? 'on' : ''}"></i>`).join('')}
        </div>
      </div>
      <div class="menu-body">
        <ul class="ladder">${rows}</ul>
      </div>
      <div class="menu-foot">
        <button data-act="seasonQuit">Abandon</button>
        <button data-act="back" data-val="main">Main Menu</button>
        <button class="primary" data-act="nav" data-val="scout">
          Face ${escapeHtml(rungs[run.index].def.name)}</button>
      </div>
      ${this.confirmQuit ? `<div class="veil">
        <div class="ask">
          <strong>Abandon this run?</strong>
          <p>${run.index === 1 ? 'One rival' : `${run.index} rivals`} beaten on
            ${DIFFICULTY_NAME[run.difficulty]}. The ladder is wiped and you
            start again from the bottom.</p>
          <div class="ask-row">
            <button data-act="seasonQuitCancel">Keep Playing</button>
            <button class="danger" data-act="seasonQuit">Abandon Run</button>
          </div>
        </div>
      </div>` : ''}
    </div>`;
  }

  // The one place stats are shown. Yours never change, so there is nothing to
  // read there -- but knowing what a rival is dangerous at is the whole point
  // of a ladder you face one at a time.
  screen_scout() {
    const run = activeRun();
    if (!run) return this.screen_season();
    const r = ladderFor(run.difficulty)[run.index];
    const bars = Object.entries(r.def.stats).map(([k, v]) => {
      const over = Math.round((v - 1) * 100);
      const pct = Math.max(3, Math.min(100, ((v - 0.9) / 0.5) * 100));
      const hot = over >= 12;
      return `<div class="stat-row" title="${escapeAttr(STAT_THREAT[k])}">
        <span>${STAT_LABELS[k]}</span>
        <div class="stat-bar ${hot ? 'hot' : ''}"><i style="width:${pct}%"></i></div>
        <span class="stat-rel ${over > 0 ? 'up' : ''}">${
          over > 0 ? `+${over}%` : 'even'}</span>
      </div>`;
    }).join('');
    const worst = Object.entries(r.def.stats).sort((a, b) => b[1] - a[1])[0];

    return `<div class="menu-panel wide">
      <div class="menu-head"><h1>Rival ${run.index + 1} of ${seasonLength(run.difficulty)}</h1>
        <div class="lives">${Array.from({ length: MAX_LIVES }, (_, i) =>
          `<i class="${i < run.lives ? 'on' : ''}"></i>`).join('')}</div>
      </div>
      <div class="menu-body char-layout">
        <div class="scout-face">${this.portrait(r.def, 'big-portrait')}</div>
        <div class="char-detail">
          <h2>${escapeHtml(r.def.name)} <small>${escapeHtml(r.def.title)}</small></h2>
          <p class="blurb">${escapeHtml(r.def.blurb)}</p>
          ${bars}
          <p class="fixed-note">Watch out for their ${
            STAT_LABELS[worst[0]].toLowerCase()}. ${STAT_THREAT[worst[0]]}</p>
        </div>
      </div>
      <div class="menu-foot">
        <button data-act="back" data-val="season">Back</button>
        <button class="primary" data-act="seasonPlay">Play</button>
      </div>
    </div>`;
  }

  screen_seasonOver() {
    const d = this.data;
    const won = !!d.seasonComplete;
    const body = won
      ? `<p>You beat all ${seasonLength(d.difficulty)} rivals on
           <b>${DIFFICULTY_NAME[d.difficulty]}</b>${
           d.seasonPerfect ? ' without losing a single life' : ''}.</p>
         ${d.rewards && d.rewards.length ? `<h3>Unlocked</h3>
           <ul class="reward-list">${d.rewards.map((x) =>
             `<li>${escapeHtml(x)}</li>`).join('')}</ul>` : ''}`
      : `<p>Out of lives against <b>${escapeHtml(d.rivalName || 'the ladder')}</b>,
           rival ${(d.index || 0) + 1} of ${seasonLength(d.difficulty)} on
           <b>${DIFFICULTY_NAME[d.difficulty]}</b>.</p>
         <p class="muted">The ladder resets, but what you unlocked stays
           unlocked.</p>`;
    return this.frame(won ? 'Season complete' : 'Season over', body, `
      <button data-act="back" data-val="main">Main Menu</button>
      <button class="primary" data-act="nav" data-val="season">Season</button>
    `);
  }

  // ---- achievements -------------------------------------------------------

  screen_achievements() {
    const st = achievementState();
    // Each tab carries its own tally, so you can see where the gaps are
    // without clicking through all six to find out.
    const tally = {};
    for (const a of ACHIEVEMENTS) {
      const t = tally[a.group] || (tally[a.group] = { got: 0, all: 0 });
      t.all += 1;
      if (st.unlocked[a.id]) t.got += 1;
    }
    const tabs = GROUPS.map((g) => {
      const t = tally[g] || { got: 0, all: 0 };
      return `<button class="tab ${g === this.achieveTab ? 'on' : ''}
        ${t.got === t.all ? 'full' : ''}" data-act="achieveTab" data-val="${g}">${g}
        <em>${t.got}/${t.all}</em></button>`;
    }).join('');
    const list = ACHIEVEMENTS.filter((a) => a.group === this.achieveTab);
    const rows = list.map((a) => {
      const got = !!st.unlocked[a.id];
      return `<li class="ach ${got ? 'got' : ''}">
        <span class="ach-mark">${got ? '✓' : ''}</span>
        <span class="ach-text"><strong>${escapeHtml(a.name)}</strong>
          <em>${escapeHtml(a.desc)}</em></span>
      </li>`;
    }).join('');
    const done = unlockedCount();
    const pct = Math.round((done / ACHIEVEMENTS.length) * 100);
    return this.frame('Achievements', `
      <div class="ach-progress">
        <div class="ach-bar"><i style="width:${pct}%"></i></div>
        <span>${done} / ${ACHIEVEMENTS.length}</span>
      </div>
      <div class="tab-bar">${tabs}</div>
      <ul class="ach-list">${rows}</ul>
    `, `<button data-act="back" data-val="main">Back</button>`, 'wide');
  }

  screen_join() {
    return this.frame('Join a room', `
      <p class="muted">Ask the host for their five-character room code. You
        will play as <b>${escapeHtml(this.look().name)}</b> &mdash; the court
        and the match type are the host's to pick.</p>
      <label class="field big-field">
        <span>Room code</span>
        <input id="roomCode" maxlength="5" autocomplete="off" spellcheck="false"
          placeholder="ABCDE" style="text-transform:uppercase">
      </label>
      <p class="err" id="menuError">${this.data.error || ''}</p>
      <p class="muted" id="menuStatus">${this.data.status || ''}</p>
    `, `
      <button data-act="back" data-val="main">Back</button>
      <button data-act="editor" data-val="join">My Player</button>
      <button class="primary" data-act="join">Connect</button>
    `);
  }

  screen_lobby() {
    const d = this.data;
    const players = (d.players || []).map((p) => `
      <li class="${p.ready ? 'ready' : ''}">
        ${this.portrait(avatarDef(p.look), 'mini')}
        <span class="pl-name">${escapeHtml(p.name)}</span>
        <span class="pl-char">${escapeHtml(findOption('shirt', p.look?.shirt).name)}
          ${escapeHtml(findOption('accessory', p.look?.accessory).name)}</span>
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
      ${d.isHost ? `<div class="picker">
        <span class="picker-label">Match</span>
        <div class="seg">
          <button class="${d.mode === 'singles' ? 'on' : ''}" data-act="lobbyMode" data-val="singles">Singles</button>
          <button class="${d.mode === 'doubles' ? 'on' : ''}" data-act="lobbyMode" data-val="doubles">Doubles</button>
        </div>
      </div>
      ${this.venuePicker(d.venue || 'rec')}`
    : `<p class="muted">Court: <b>${escapeHtml(getVenue(d.venue).name)}</b>.
         The host picks.</p>`}
      <p class="muted" id="menuStatus">${d.status || ''}</p>
    `, `
      <button data-act="leaveLobby">Leave</button>
      <button data-act="changeChar">Change Character</button>
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
    const swings = SWINGS.map((sw) => `
      <div class="swing-card">
        <div class="swing-head">
          <strong>${sw.name}</strong>
          <span class="kbd">${sw.key}</span>
        </div>
        <span class="swing-tag">${sw.tag}</span>
        <p>${sw.what}</p>
        <p class="cost"><b>The catch.</b> ${sw.cost}</p>
      </div>`).join('');

    const keys = CONTROLS.map(([k, v]) => `
      <div class="key-row"><span class="kbd">${k}</span><span>${v}</span></div>`).join('');

    const rules = [
      ['The kitchen', 'The coloured zone at the net. Stand in it all you like, '
        + 'but you may not volley from it -- let the ball bounce first.'],
      ['Balls that land in your kitchen', 'Only the dink can lift one back. '
        + 'Drive it or lob it off the floor down there and you bury it in the net.'],
      ['Plant your feet', 'Starting a swing while you are running narrows the '
        + 'sweet spot. Getting to the ball early is worth as much as timing it.'],
      ['Two bounces first', 'The serve and the return must both bounce before '
        + 'anyone is allowed to volley.'],
      ['Serving', 'Underhand and cross-court, and it has to clear the kitchen.'],
      ['Scoring', 'Rally scoring to 11, win by two.'],
    ].map(([k, v]) => `<li><b>${k}.</b> ${v}</li>`).join('');

    return this.frame('How to play', `
      <section class="home-sec">
        <h3 class="sec-label">The three swings</h3>
        <div class="swing-cards">${swings}</div>
      </section>
      <section class="home-sec">
        <div class="howto-split">
          <div>
            <h3 class="sec-label">Everything else</h3>
            <div class="key-grid">${keys}</div>
          </div>
          <div>
            <h3 class="sec-label">Rules worth knowing</h3>
            <ul class="rules">${rules}</ul>
          </div>
        </div>
      </section>
    `, `<button data-act="back" data-val="${this.data.returnTo || 'main'}">Back</button>`,
    'wide');
  }

  screen_pause() {
    const note = this.data.netNote
      || (this.data.seasonNote ? 'Quitting a season match forfeits it — it '
        + 'costs a life, the same as losing.' : '');
    return this.frame('Paused', `
      <p class="muted">${note}</p>
    `, `
      <button class="primary" data-act="resume">Resume</button>
      <button data-act="nav" data-val="settings">Settings</button>
      <button data-act="quit">${this.data.seasonNote ? 'Forfeit' : 'Quit to menu'}</button>
    `);
  }

  screen_results() {
    const d = this.data;
    const rows = (d.stats || []).map(([k, v]) =>
      `<tr><th>${k}</th><td>${v}</td></tr>`).join('');
    const players = d.players || [];
    // Everyone on the court, not just you -- including the CPU, which is the
    // only way to see what actually beat you.
    const board = players.length ? `
      <div class="scorecard-wrap"><table class="scorecard">
        <thead><tr>
          <th class="who">Player</th>
          <th>Shots</th><th>Dinks</th><th>Drives</th><th>Lobs</th>
          <th>Chokes</th>
          <th class="acc"><span class="lg">Accuracy</span><span class="sm">Acc</span></th>
        </tr></thead>
        <tbody>${players.map((p) => `
          <tr class="${p.you ? 'me' : ''}${p.won ? ' won' : ''}">
            <th class="who">
              ${this.portrait(p.def, 'mini')}
              <span>${escapeHtml(p.name)}</span>
              ${p.you ? '<em>you</em>' : p.bot ? '<em>cpu</em>' : ''}
            </th>
            <td>${p.shots}</td><td>${p.dinks}</td><td>${p.drives}</td><td>${p.lobs}</td>
            <td class="${p.chokes ? 'bad' : ''}">${p.chokes}</td>
            <td class="acc">${Math.round(p.accuracy * 100)}%</td>
          </tr>`).join('')}</tbody>
      </table></div>
      <p class="muted fine">Shots counts every ball struck, serves included.
        Accuracy is all of them averaged &mdash; 100% is perfect timing every
        time.</p>` : '';
    const sn = d.season;
    const seasonNote = sn ? `<p class="season-note ${sn.won ? 'good' : 'bad'}">${
      sn.seasonComplete ? `Season cleared on ${DIFFICULTY_NAME[sn.difficulty]}.`
        : sn.runOver ? 'Out of lives. The run ends here.'
          : sn.won ? `${escapeHtml(sn.rival.name)} beaten${
            sn.bonusLife ? ' — and that is your fourth life' : ''}.`
            : `${sn.lives} ${sn.lives === 1 ? 'life' : 'lives'} left. Same rival again.`
    }</p>` : '';
    const earned = (d.earned || []).length ? `
      <h3>Achievements earned</h3>
      <ul class="reward-list">${d.earned.map((a) =>
        `<li><strong>${escapeHtml(a.name)}</strong> — ${escapeHtml(a.desc)}</li>`
      ).join('')}</ul>` : '';
    return this.frame(d.won ? 'You win' : 'You lose', `
      <div class="final-score">${d.score ? d.score.join(' - ') : ''}</div>
      ${seasonNote}
      ${board}
      <table class="controls">${rows}</table>
      ${earned}
    `, `
      ${d.canSeason ? '' : '<button data-act="quit">Menu</button>'}
      ${d.canRematch ? '<button class="primary" data-act="rematch">Rematch</button>' : ''}
      ${d.canLobby ? '<button class="primary" data-act="toLobby">Back to Lobby</button>' : ''}
      ${d.canSeason ? '<button class="primary" data-act="seasonContinue">Continue</button>' : ''}
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
