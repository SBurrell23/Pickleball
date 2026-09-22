// Season mode: a ladder of rivals faced one at a time, on whichever of the
// four difficulties you pick. Easy is three matches, Normal five, Hard seven
// and Extreme the full eleven. Three lives to start, with a fourth handed over
// about two thirds of the way up. Lose a match and it costs a life and you
// face the same rival again -- the ladder never moves on without you.
//
// The whole run lives in localStorage so a season survives closing the tab,
// which matters when clearing one is eleven matches long.

import { ENEMIES, seasonLength, seasonRoster, enemyDef, skillFor } from './enemies.js';

const KEY = 'pickleball.season.v1';

export const DIFFICULTIES = ['easy', 'normal', 'hard', 'extreme'];
export const DIFFICULTY_NAME = {
  easy: 'Easy', normal: 'Normal', hard: 'Hard', extreme: 'Extreme',
};

export const START_LIVES = 3;
export const MAX_LIVES = 4;

// Where the fourth life lands: after the seventh of eleven, and the same
// fraction of every shorter ladder, never on the last rung (a life handed
// over as the season ends is not a reprieve).
export function bonusAt(difficulty) {
  const n = seasonLength(difficulty);
  return Math.max(2, Math.min(n - 1, Math.round((n * 7) / 11)));
}

function blank() {
  return { active: null, completed: [], best: {}, clears: {} };
}

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw || typeof raw !== 'object') return blank();
    const out = blank();
    if (Array.isArray(raw.completed)) {
      out.completed = raw.completed.filter((d) => DIFFICULTIES.includes(d));
    }
    if (raw.best && typeof raw.best === 'object') {
      for (const d of DIFFICULTIES) {
        const n = Math.round(Number(raw.best[d]));
        if (Number.isFinite(n) && n > 0) out.best[d] = Math.min(seasonLength(d), n);
      }
    }
    if (raw.clears && typeof raw.clears === 'object') {
      for (const d of DIFFICULTIES) {
        const n = Math.round(Number(raw.clears[d]));
        if (Number.isFinite(n) && n > 0) out.clears[d] = n;
      }
    }
    out.active = sanitizeRun(raw.active);
    return out;
  } catch {
    return blank();
  }
}

function sanitizeRun(r) {
  if (!r || typeof r !== 'object') return null;
  if (!DIFFICULTIES.includes(r.difficulty)) return null;
  const index = Math.max(0,
    Math.min(seasonLength(r.difficulty) - 1, Math.round(Number(r.index)) || 0));
  const lives = Math.max(0, Math.min(MAX_LIVES, Math.round(Number(r.lives))));
  if (!lives) return null;                       // a dead run is not an active one
  return {
    difficulty: r.difficulty,
    index,
    lives,
    bonusGiven: !!r.bonusGiven,
    losses: Math.max(0, Math.round(Number(r.losses)) || 0),
    perfect: r.perfect !== false,                // no lives lost so far
    started: Number(r.started) || Date.now(),
  };
}

let state = null;

export function seasonState() {
  if (!state) state = read();
  return state;
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private mode, quota, or storage turned off -- the run just will not
       survive a reload, which is better than refusing to play. */
  }
}

/** Difficulties whose season has been cleared at least once. */
export function completedDifficulties() { return seasonState().completed.slice(); }

/** How far the player has ever got on a difficulty, 0..SEASON_LENGTH. */
export function bestProgress(difficulty) { return seasonState().best[difficulty] || 0; }

export function clearCount(difficulty) { return seasonState().clears[difficulty] || 0; }

export function activeRun() { return seasonState().active; }

export function startRun(difficulty) {
  const d = DIFFICULTIES.includes(difficulty) ? difficulty : 'normal';
  seasonState().active = {
    difficulty: d,
    index: 0,
    lives: START_LIVES,
    bonusGiven: false,
    losses: 0,
    perfect: true,
    started: Date.now(),
  };
  persist();
  return state.active;
}

export function abandonRun() {
  seasonState().active = null;
  persist();
}

/** The rival a run is currently facing, with the AI skill they will play at. */
export function currentRival(run) {
  if (!run) return null;
  return {
    index: run.index,
    def: enemyDef(run.index, run.difficulty),
    skill: skillFor(run.difficulty, run.index),
  };
}

/** A preview of the whole ladder for a difficulty. */
export function ladderFor(difficulty) {
  return seasonRoster(difficulty).map((_, i) => ({
    index: i,
    def: enemyDef(i, difficulty),
    skill: skillFor(difficulty, i),
  }));
}

export { seasonLength };

// Fold a finished match into the run. Returns what happened, which is what
// the UI narrates -- nothing else needs to reconstruct it.
export function recordResult(won) {
  const run = seasonState().active;
  if (!run) return null;
  const beaten = run.index;
  const len = seasonLength(run.difficulty);
  const out = {
    won, difficulty: run.difficulty, index: beaten, length: len,
    rival: enemyDef(beaten, run.difficulty), bonusLife: false, runOver: false,
    seasonComplete: false, lives: run.lives, perfect: run.perfect,
  };

  if (!won) {
    run.lives -= 1;
    run.losses += 1;
    run.perfect = false;
    out.lives = run.lives;
    out.perfect = false;
    if (run.lives <= 0) {
      out.runOver = true;
      state.active = null;
    }
    persist();
    return out;
  }

  const reached = beaten + 1;
  if (reached > (state.best[run.difficulty] || 0)) state.best[run.difficulty] = reached;

  // The fourth life lands the moment the seventh rival goes down, not at the
  // start of the eighth match -- you should feel it as a reward.
  if (!run.bonusGiven && reached >= bonusAt(run.difficulty)) {
    run.bonusGiven = true;
    if (run.lives < MAX_LIVES) {
      run.lives += 1;
      out.bonusLife = true;
    }
  }

  if (reached >= len) {
    out.seasonComplete = true;
    out.perfect = run.perfect;
    if (!state.completed.includes(run.difficulty)) state.completed.push(run.difficulty);
    state.clears[run.difficulty] = (state.clears[run.difficulty] || 0) + 1;
    state.active = null;
  } else {
    run.index = reached;
  }
  out.lives = run.lives;
  persist();
  return out;
}

// Test seam: lets the harness drive a season without a browser behind it.
export function _resetForTests(next) {
  state = next ? { ...blank(), ...next } : blank();
  return state;
}
