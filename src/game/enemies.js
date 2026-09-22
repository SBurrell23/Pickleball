// The season ladder: eleven rivals, faced in this order.
//
// Every one of them is stronger than you on paper -- the human side is pinned
// at 1.00 across the board (see avatar.js), so the only way the ladder gets
// harder is that the opposition gets better. Each rival has one thing they are
// genuinely dangerous at and a second they are merely good at, so losing to
// them tells you something specific about what to do differently.
//
// The numbers below are each rival at FULL strength, which is what they play
// at as the last name on the ladder at Hard. What they actually take onto the
// court is scaled by where they sit in the order and which season difficulty
// you picked -- see enemyDef(). The five faces carried over from the original
// roster keep their old identities and colours.

import { PLAY } from './constants.js';

export const ENEMIES = [
  {
    id: 'pip',
    name: 'Pip',
    title: 'The Warm-Up',
    blurb: 'Plays every ball back and nothing else. Beat her by being braver.',
    stats: { speed: 1.04, reach: 1.02, control: 1.10, drive: 0.98, dink: 1.06 },
    colors: { primary: 0x7fb069, secondary: 0xf4f7e8, trim: 0x33502a, skin: 0xe8b98c },
    build: { torso: 'slim', head: 'round', crest: 'ponytail', scale: 0.88, bulk: 0.86 },
  },
  {
    id: 'spot',
    name: 'Spot',
    title: 'Placement',
    blurb: 'Puts it where she said she would, even off a scrappy touch.',
    // Control measures as the weakest stat on the sheet (tools/roster.mjs),
    // so a pure control specialist was losing to the baseline at full
    // strength. Rounded out rather than inflated -- she is still the one
    // whose scrappy touches land where she meant them.
    stats: { speed: 1.08, reach: 1.10, control: 1.34, drive: 1.02, dink: 1.06 },
    colors: { primary: 0xc0392b, secondary: 0x2b2b30, trim: 0xf0a030, skin: 0xb5764d },
    build: { torso: 'tapered', head: 'round', crest: 'headband', scale: 0.94, bulk: 1.06 },
  },
  {
    id: 'zip',
    name: 'Zip',
    title: 'Speed',
    blurb: 'Gets to everything. Making the shot count is his weaker half.',
    stats: { speed: 1.24, reach: 1.02, control: 1.02, drive: 1.02, dink: 1.08 },
    colors: { primary: 0x33b6e0, secondary: 0xfdfdfd, trim: 0x1a5f7a, skin: 0xf0c9a0 },
    build: { torso: 'slim', head: 'round', crest: 'ponytail', scale: 0.86, bulk: 0.8 },
  },
  {
    id: 'moss',
    name: 'Moss',
    title: 'The Wall',
    blurb: 'Will dink at you until the sun goes down. Do not blink first.',
    stats: { speed: 1.00, reach: 1.08, control: 1.16, drive: 0.98, dink: 1.34 },
    colors: { primary: 0x2f6f4e, secondary: 0xcfe3cf, trim: 0x14301f, skin: 0x8d5a3b },
    build: { torso: 'blocky', head: 'round', crest: 'bucket', scale: 0.98, bulk: 1.22 },
  },
  {
    id: 'stretch',
    name: 'Stretch',
    title: 'Reach',
    blurb: 'Covers balls nobody else gets a paddle to, high or wide.',
    stats: { speed: 1.02, reach: 1.30, control: 1.06, drive: 1.02, dink: 1.06 },
    colors: { primary: 0x9b59b6, secondary: 0xf7e7ff, trim: 0x4a2159, skin: 0x8d5a3b },
    build: { torso: 'slim', head: 'round', crest: 'bun', scale: 1.04, bulk: 0.82 },
  },
  {
    id: 'ace',
    name: 'Ace',
    title: 'Drive',
    blurb: 'Lives on the big swing and does not apologise for it.',
    stats: { speed: 1.04, reach: 1.02, control: 1.02, drive: 1.34, dink: 1.00 },
    colors: { primary: 0xf39c12, secondary: 0x1c1c22, trim: 0xffe066, skin: 0xe8b98c },
    build: { torso: 'tapered', head: 'round', crest: 'mohawk', scale: 0.93, bulk: 0.98 },
  },
  {
    id: 'bulwark',
    name: 'Bulwark',
    title: 'Kitchen',
    blurb: 'Owns the net. Wins the dink exchange and dares you to speed it up.',
    stats: { speed: 1.00, reach: 1.12, control: 1.08, drive: 1.02, dink: 1.38 },
    colors: { primary: 0x37474f, secondary: 0xffc857, trim: 0x11181c, skin: 0x6b4a33 },
    build: { torso: 'blocky', head: 'square', crest: 'cap', scale: 1.02, bulk: 1.32 },
  },
  {
    id: 'echo',
    name: 'Echo',
    title: 'The Mirror',
    blurb: 'Gives you back exactly what you hit, one notch better.',
    stats: { speed: 1.12, reach: 1.14, control: 1.16, drive: 1.14, dink: 1.14 },
    colors: { primary: 0x5c6bc0, secondary: 0xe8eaf6, trim: 0x232a5c, skin: 0xd8a074 },
    build: { torso: 'tapered', head: 'round', crest: 'headphones', scale: 0.95, bulk: 1.0 },
  },
  {
    id: 'kestrel',
    name: 'Kestrel',
    title: 'The Hunter',
    blurb: 'Reads the third shot before you have decided on it.',
    stats: { speed: 1.22, reach: 1.18, control: 1.20, drive: 1.16, dink: 1.10 },
    colors: { primary: 0xb03a48, secondary: 0xffd9b0, trim: 0x2a1016, skin: 0xbe8455 },
    build: { torso: 'slim', head: 'round', crest: 'shades', scale: 0.97, bulk: 0.9 },
  },
  {
    id: 'obelisk',
    name: 'Obelisk',
    title: 'The Ceiling',
    blurb: 'Nothing goes over him and nothing goes past him. Go through.',
    stats: { speed: 1.08, reach: 1.36, control: 1.20, drive: 1.24, dink: 1.24 },
    colors: { primary: 0x2d3142, secondary: 0x9aa3b8, trim: 0x0c0e15, skin: 0x4a3425 },
    build: { torso: 'blocky', head: 'square', crest: 'beanie', scale: 1.08, bulk: 1.36 },
  },
  {
    id: 'sovereign',
    name: 'Sovereign',
    title: 'Champion',
    blurb: 'Eleven seasons, eleven titles. There is no weakness to find.',
    stats: { speed: 1.22, reach: 1.24, control: 1.28, drive: 1.26, dink: 1.26 },
    colors: { primary: 0xd8a52a, secondary: 0x2a2010, trim: 0xfff0b8, skin: 0xa06a43 },
    build: { torso: 'tapered', head: 'round', crest: 'crown', scale: 1.0, bulk: 1.04 },
  },
];

export const ENEMY_BY_ID = Object.fromEntries(ENEMIES.map((e) => [e.id, e]));
export const ROSTER_SIZE = ENEMIES.length;

// How many rivals a season is, by difficulty. Only Extreme is the full roster;
// the shorter ladders sample it. Easy being three matches is what makes it a
// thing somebody will actually finish.
export const SEASON_LENGTHS = { easy: 3, normal: 5, hard: 7, extreme: 11 };

export function seasonLength(difficulty) {
  return SEASON_LENGTHS[difficulty] ?? SEASON_LENGTHS.normal;
}

// Which rivals a season is made of, as indices into ENEMIES. Spread evenly
// across the roster and always including both ends, so every difficulty opens
// against the warm-up and finishes against Sovereign -- a three-match season
// is a whole season, not the first third of one.
export function seasonRoster(difficulty) {
  const n = seasonLength(difficulty);
  if (n >= ROSTER_SIZE) return ENEMIES.map((_, i) => i);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(Math.round((i / (n - 1)) * (ROSTER_SIZE - 1)));
  }
  return out;
}

// How far up a ladder a rung sits, 0 at the first match and 1 at the last.
// Everything that scales with progress reads this rather than a raw index, so
// a three-match season ramps just as steeply as an eleven-match one.
function rungFraction(difficulty, rung) {
  const n = seasonLength(difficulty);
  return n > 1 ? Math.max(0, Math.min(1, rung / (n - 1))) : 1;
}

// How much of a rival's full stat sheet they bring at a given rung.
function ladderStrength(difficulty, rung) {
  return 0.30 + 0.70 * rungFraction(difficulty, rung);
}

// And how much the chosen difficulty multiplies that by. Easy tops out well
// below a rival's paper sheet; Extreme takes them to all of it.
// Extreme stops short of 1.0 on purpose: stacking a rival's full paper sheet
// on top of the top of the skill band made the last rung measure at zero wins
// for every calibre of player, and a final boss nobody can beat is not a
// final boss.
export const DIFFICULTY_STAT_SCALE = {
  easy: 0.30, normal: 0.52, hard: 0.74, extreme: 0.92,
};

// The AI skill band each difficulty plays across, floor at the first rung and
// ceiling at the last. These are the same 0..1 numbers the bot has always
// taken.
export const DIFFICULTY_SKILL = {
  easy: [0.14, 0.34],
  normal: [0.28, 0.54],
  hard: [0.42, 0.68],
  extreme: [0.56, 0.80],
};

export function skillFor(difficulty, rung) {
  const [lo, hi] = DIFFICULTY_SKILL[difficulty] || DIFFICULTY_SKILL.normal;
  return lo + (hi - lo) * rungFraction(difficulty, rung);
}

// The rival standing on a given rung, as they actually walk onto the court:
// their signature shape, with every deviation from average scaled by how far
// up the ladder they are and how hard a season you chose. Scaling the
// deviation rather than the stat keeps them recognisable -- a weakened Ace is
// still a driver.
export function enemyDef(rung, difficulty) {
  const roster = seasonRoster(difficulty);
  const idx = roster[Math.max(0, Math.min(roster.length - 1, rung))] ?? 0;
  const base = ENEMIES[idx];
  const f = ladderStrength(difficulty, rung) * (DIFFICULTY_STAT_SCALE[difficulty] ?? 1);
  const stats = {};
  for (const [k, v] of Object.entries(base.stats)) {
    stats[k] = 1 + (v - 1) * f;
  }
  return { ...base, stats, ladderIndex: rung };
}

// Reach is the one stat that also depends on how tall the rig is, so the
// scouting card has to show the combined figure or Obelisk looks ordinary.
export function effectiveReach(def) {
  return PLAY.REACH_HEIGHT * (0.55 + 0.45 * def.build.scale) * def.stats.reach;
}
