// Resolves a roster entry into the definition the sim and both renderers use.
//
// There are two kinds of competitor now. A human is an avatar: a fixed stat
// line with a look they chose (avatar.js). A bot is a rival off the season
// ladder, scaled by where it sits and how hard a season you picked
// (enemies.js). Both resolve to the same shape -- { id, name, stats, colors,
// build } -- so nothing downstream has to care which it is.

import { avatarDef, PLAYER_STATS, DEFAULT_LOOK } from './avatar.js';
import { ENEMY_BY_ID, ENEMIES, enemyDef } from './enemies.js';

export { PLAYER_STATS };

// A roster entry carries whichever of these it has:
//   look      -- a human's chosen appearance
//   enemyId   -- a named rival, optionally with ladderIndex + difficulty
//   (neither) -- the default avatar, which is what the exhibition bots use
export function resolveDef(entry) {
  if (!entry) return avatarDef(DEFAULT_LOOK);
  if (entry.def) return entry.def;
  if (entry.look) return avatarDef(entry.look);
  if (entry.enemyId) {
    const idx = ENEMIES.findIndex((e) => e.id === entry.enemyId);
    if (idx >= 0 && entry.difficulty !== undefined && entry.ladderIndex !== undefined) {
      return enemyDef(entry.ladderIndex, entry.seasonDifficulty || 'hard');
    }
    const base = ENEMY_BY_ID[entry.enemyId];
    if (base) return base;
  }
  return avatarDef(entry.look || DEFAULT_LOOK);
}

// Look up a rival by name, for anything that only has an id to work from.
export function getEnemy(id) { return ENEMY_BY_ID[id] || ENEMIES[0]; }

// Per-character tuning applied to the timing mini-games. Wind-up speed and
// shot power are fixed for everyone; only the sweet-spot widths and the
// scatter on a mistimed shot vary.
export function swingTuning(char) {
  const s = (char && char.stats) || PLAYER_STATS;
  return {
    chargeRate: 1,
    powerScale: 1,
    // ~1.0 at a stat of 1.0, so the human side is exactly the baseline.
    // The coefficient is steep enough that a rival's wider sweet spot is a
    // difference you can feel, not one only a spreadsheet sees.
    driveSweet: 0.34 + s.drive * 0.68,
    dinkSweet: 0.34 + s.dink * 0.68,
    scatterScale: 1.78 - s.control * 0.80,
  };
}
