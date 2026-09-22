const KEY = 'pickleball.settings.v1';

export const DEFAULTS = {
  // Graphics
  fpsCap: 0,             // 0 = display refresh (uncapped rAF)
  antialias: 'msaa',     // off | fxaa | msaa
  renderScale: 1.0,      // 0.5 .. 1.0
  shadows: 'high',       // off | low | high
  particles: 1.0,        // 0 .. 1.5 density multiplier
  trails: true,
  glow: true,
  shake: 0.7,            // 0 .. 1
  showFps: false,
  crowd3d: true,

  // Audio
  master: 0.85,
  sfx: 1.0,
  music: 0.45,
  ambience: 0.5,
  muteOnBlur: true,

  // Gameplay / feel
  difficulty: 'normal',  // easy | normal | hard | extreme
  aimSensitivity: 1.0,
  // The OS cursor is hidden during play, so the reticle is not optional --
  // these choose what it looks like instead of whether it exists.
  cursorStyle: 'reticle',
  cursorColor: 'ball',
  cursorScale: 1.0,
  showLanding: true,
  cameraMode: 'follow',  // follow | fixed | broadcast
  colorblind: 'off',     // off | deuter | protan | tritan
  venue: 'rec',          // which court to play on outside the season
  screenShakeOnHit: true,

  // Net
  playerName: '',
};

export const DIFFICULTY_LEVEL = { easy: 0.30, normal: 0.58, hard: 0.86, extreme: 1.0 };

function clampNum(v, lo, hi, dflt) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  if (!isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, n));
}

const RANGES = {
  renderScale: [0.4, 1.0], particles: [0, 1.5], shake: [0, 1],
  master: [0, 1], sfx: [0, 1], music: [0, 1], ambience: [0, 1],
  aimSensitivity: [0.3, 2.5], cursorScale: [0.7, 1.8],
};

const ENUMS = {
  antialias: ['off', 'fxaa', 'msaa'],
  shadows: ['off', 'low', 'high'],
  difficulty: ['easy', 'normal', 'hard', 'extreme'],
  cameraMode: ['follow', 'fixed', 'broadcast'],
  colorblind: ['off', 'deuter', 'protan', 'tritan'],
  venue: ['rec', 'forest', 'desert', 'marsh', 'championship'],
  cursorStyle: ['reticle', 'ring', 'cross', 'dot', 'chevron', 'target'],
  cursorColor: ['white', 'ball', 'teal', 'orange', 'magenta', 'ink'],
};

function sanitize(raw) {
  const out = { ...DEFAULTS };
  if (!raw || typeof raw !== 'object') return out;
  for (const k of Object.keys(DEFAULTS)) {
    if (!(k in raw)) continue;
    const v = raw[k];
    const dflt = DEFAULTS[k];
    if (RANGES[k]) out[k] = clampNum(v, RANGES[k][0], RANGES[k][1], dflt);
    else if (ENUMS[k]) out[k] = ENUMS[k].includes(v) ? v : dflt;
    else if (typeof dflt === 'boolean') out[k] = !!v;
    else if (typeof dflt === 'number') out[k] = clampNum(v, -1e6, 1e6, dflt);
    else if (typeof dflt === 'string') out[k] = String(v).slice(0, 24);
  }
  out.fpsCap = [0, 30, 60, 75, 90, 120, 144, 240].includes(out.fpsCap) ? out.fpsCap : 0;
  return out;
}

class Settings {
  constructor() {
    this.values = sanitize(this.load());
    this.listeners = new Set();
  }

  load() {
    try {
      const s = localStorage.getItem(KEY);
      return s ? JSON.parse(s) : null;
    } catch {
      return null; // private browsing, blocked storage, corrupt JSON
    }
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.values));
    } catch {
      /* storage unavailable; settings simply do not persist */
    }
  }

  get(k) { return this.values[k]; }
  all() { return this.values; }

  set(k, v) {
    if (!(k in DEFAULTS)) return;
    const prev = this.values[k];
    const next = sanitize({ ...this.values, [k]: v })[k];
    if (prev === next) return;
    this.values[k] = next;
    this.save();
    for (const fn of this.listeners) fn(k, next, prev);
  }

  reset() {
    const prev = { ...this.values };
    this.values = { ...DEFAULTS };
    this.save();
    for (const k of Object.keys(DEFAULTS)) {
      if (prev[k] !== this.values[k]) {
        for (const fn of this.listeners) fn(k, this.values[k], prev[k]);
      }
    }
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  difficultyLevel() { return DIFFICULTY_LEVEL[this.values.difficulty] ?? 0.55; }
}

export const settings = new Settings();
