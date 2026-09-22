// Achievements. Every one is decided from the same two things: a summary of
// the match that just finished, and a running tally kept across matches. No
// achievement peeks at live game state, which keeps the whole system testable
// without a browser -- see tools/progresstest.mjs.
//
// `test(m, t)` receives:
//   m  the match summary  (see Game.matchSummary)
//   t  the persistent totals AFTER this match has been folded in

const KEY = 'pickleball.achievements.v1';

export const GROUPS = ['Season', 'Match', 'Shotmaking', 'Style', 'Online', 'Milestones'];

const online = (m) => m.mode === 'host' || m.mode === 'join';

export const ACHIEVEMENTS = [
  // ---- Season ------------------------------------------------------------
  { id: 'season-easy', group: 'Season', name: 'Rookie Season',
    desc: 'Clear the season on Easy.',
    test: (m) => m.seasonComplete && m.difficulty === 'easy' },
  { id: 'season-normal', group: 'Season', name: 'Club Champion',
    desc: 'Clear the season on Normal.',
    test: (m) => m.seasonComplete && m.difficulty === 'normal' },
  { id: 'season-hard', group: 'Season', name: 'Tour Champion',
    desc: 'Clear the season on Hard.',
    test: (m) => m.seasonComplete && m.difficulty === 'hard' },
  { id: 'season-extreme', group: 'Season', name: 'Immortal',
    desc: 'Clear the season on Extreme.',
    test: (m) => m.seasonComplete && m.difficulty === 'extreme' },
  { id: 'grand-slam', group: 'Season', name: 'Grand Slam',
    desc: 'Clear the season on all four difficulties.',
    test: (m, t) => t.seasonsCleared >= 4 && t.clearedSet.size >= 4 },
  { id: 'flawless', group: 'Season', name: 'Not A Scratch',
    desc: 'Clear a season without losing a single life.',
    test: (m) => m.seasonComplete && m.seasonPerfect },
  { id: 'flawless-hard', group: 'Season', name: 'Untouchable',
    desc: 'Clear Hard or Extreme without losing a life.',
    test: (m) => m.seasonComplete && m.seasonPerfect
      && (m.difficulty === 'hard' || m.difficulty === 'extreme') },
  { id: 'halfway', group: 'Season', name: 'Second Wind',
    desc: 'Beat the seventh rival and earn your fourth life.',
    test: (m) => m.bonusLife },
  { id: 'sovereign', group: 'Season', name: 'Regicide',
    desc: 'Beat Sovereign.',
    test: (m) => m.won && m.rivalId === 'sovereign' },
  { id: 'last-life', group: 'Season', name: 'On The Brink',
    desc: 'Win a season match while down to your last life.',
    test: (m) => m.won && m.mode === 'season' && m.livesBefore === 1 },
  { id: 'clutch-run', group: 'Season', name: 'Off The Canvas',
    desc: 'Clear a season after being down to one life.',
    test: (m, t) => m.seasonComplete && t.wasOnLastLife },

  // ---- Match -------------------------------------------------------------
  { id: 'first-win', group: 'Match', name: 'On The Board',
    desc: 'Win a match.', test: (m) => m.won },
  { id: 'shutout', group: 'Match', name: 'Bagel',
    desc: 'Win a match 11-0.',
    test: (m) => m.won && m.theirScore === 0 && m.myScore >= 11 },
  { id: 'comeback', group: 'Match', name: 'Comeback Kid',
    desc: 'Win after trailing by five points.',
    test: (m) => m.won && m.maxDeficit >= 5 },
  { id: 'deuce', group: 'Match', name: 'Extra Time',
    desc: 'Win a match that went past eleven.',
    test: (m) => m.won && m.myScore > 11 },
  { id: 'no-chokes', group: 'Match', name: 'Steady Hands',
    desc: 'Win a match without choking once.',
    test: (m) => m.won && m.chokes === 0 && m.shots >= 20 },
  { id: 'marathon', group: 'Match', name: 'Marathon',
    desc: 'Play a rally of twenty shots or more.',
    test: (m) => m.longestRally >= 20 },
  { id: 'epic', group: 'Match', name: 'Somebody Stop Them',
    desc: 'Play a rally of thirty-five shots or more.',
    test: (m) => m.longestRally >= 35 },
  { id: 'wire-to-wire', group: 'Match', name: 'Wire To Wire',
    desc: 'Win a match having never trailed.',
    test: (m) => m.won && m.maxDeficit === 0 && m.myScore >= 11 },

  // ---- Shotmaking --------------------------------------------------------
  { id: 'accurate-80', group: 'Shotmaking', name: 'Dialled In',
    desc: 'Finish a match at 80% accuracy or better.',
    test: (m) => m.accuracy >= 0.80 && m.shots >= 20 },
  { id: 'accurate-90', group: 'Shotmaking', name: 'Surgical',
    desc: 'Finish a match at 90% accuracy or better.',
    test: (m) => m.accuracy >= 0.90 && m.shots >= 20 },
  { id: 'perfect-10', group: 'Shotmaking', name: 'Ten Out Of Ten',
    desc: 'Strike ten perfect shots in one match.',
    test: (m) => m.perfects >= 10 },
  { id: 'perfect-25', group: 'Shotmaking', name: 'Metronome',
    desc: 'Strike twenty-five perfect shots in one match.',
    test: (m) => m.perfects >= 25 },
  { id: 'smash-winner', group: 'Shotmaking', name: 'Put Away',
    desc: 'End a point with a perfectly struck smash.',
    test: (m) => m.smashWinners >= 1 },
  { id: 'lob-winner', group: 'Shotmaking', name: 'Over The Top',
    desc: 'Win a point with a lob.',
    test: (m) => m.lobWinners >= 1 },
  { id: 'ace', group: 'Shotmaking', name: 'Ace',
    desc: 'Win a point on a serve nobody got back.',
    test: (m) => m.aces >= 1 },
  { id: 'ace-3', group: 'Shotmaking', name: 'Service Game',
    desc: 'Serve three unreturnable serves in one match.',
    test: (m) => m.aces >= 3 },
  { id: 'dinker', group: 'Shotmaking', name: 'Kitchen Resident',
    desc: 'Hit thirty dinks in one match.',
    test: (m) => m.dinks >= 30 },
  { id: 'driver', group: 'Shotmaking', name: 'Heavy Artillery',
    desc: 'Hit twenty drives in one match.',
    test: (m) => m.drives >= 20 },
  { id: 'skyward', group: 'Shotmaking', name: 'Weather Balloon',
    desc: 'Put up ten lobs in one match.',
    test: (m) => m.lobs >= 10 },
  { id: 'punish-lob', group: 'Shotmaking', name: 'Don’t Lob Me',
    desc: 'Answer a lob with a perfect shot.',
    test: (m) => m.lobPunishes >= 1 },

  // ---- Style -------------------------------------------------------------
  { id: 'soft-hands', group: 'Style', name: 'Soft Hands',
    desc: 'Win a match without hitting a single drive.',
    test: (m) => m.won && m.drives === 0 && m.shots >= 20 },
  { id: 'no-dinks', group: 'Style', name: 'No Time For Touch',
    desc: 'Win a match without hitting a single dink.',
    test: (m) => m.won && m.dinks === 0 && m.shots >= 20 },
  { id: 'lob-lord', group: 'Style', name: 'Airmail',
    desc: 'Win a match having lobbed more than you drove.',
    test: (m) => m.won && m.lobs > m.drives && m.lobs >= 5 },
  { id: 'iron-nerve', group: 'Style', name: 'Iron Nerve',
    desc: 'Win a match without a single mistimed shot.',
    test: (m) => m.won && m.weak === 0 && m.shots >= 20 },
  { id: 'patient', group: 'Style', name: 'The Long Game',
    desc: 'Win a match where the rallies averaged ten shots.',
    test: (m) => m.won && m.avgRally >= 10 },
  { id: 'blitz', group: 'Style', name: 'Quick Work',
    desc: 'Win a match where the rallies averaged under four shots.',
    test: (m) => m.won && m.avgRally > 0 && m.avgRally < 4 && m.myScore >= 11 },

  // ---- Online ------------------------------------------------------------
  { id: 'first-online', group: 'Online', name: 'Good Connection',
    desc: 'Win an online match.', test: (m) => m.won && online(m) },
  { id: 'online-5', group: 'Online', name: 'Regular',
    desc: 'Win five online matches.', test: (m, t) => t.onlineWins >= 5 },
  { id: 'online-25', group: 'Online', name: 'Local Legend',
    desc: 'Win twenty-five online matches.', test: (m, t) => t.onlineWins >= 25 },
  { id: 'online-bagel', group: 'Online', name: 'Merciless',
    desc: 'Win an online match 11-0.',
    test: (m) => m.won && online(m) && m.theirScore === 0 && m.myScore >= 11 },
  { id: 'doubles-win', group: 'Online', name: 'Better Together',
    desc: 'Win an online doubles match.',
    test: (m) => m.won && online(m) && m.matchMode === 'doubles' },
  { id: 'road-win', group: 'Online', name: 'Away Days',
    desc: 'Win an online match you joined rather than hosted.',
    test: (m) => m.won && m.mode === 'join' },
  { id: 'host-win', group: 'Online', name: 'House Rules',
    desc: 'Win an online match you hosted.',
    test: (m) => m.won && m.mode === 'host' },

  // ---- Milestones --------------------------------------------------------
  { id: 'shots-100', group: 'Milestones', name: 'Getting Warm',
    desc: 'Hit one hundred shots.', test: (m, t) => t.shots >= 100 },
  { id: 'shots-1000', group: 'Milestones', name: 'Court Rat',
    desc: 'Hit one thousand shots.', test: (m, t) => t.shots >= 1000 },
  { id: 'wins-10', group: 'Milestones', name: 'Ten Up',
    desc: 'Win ten matches.', test: (m, t) => t.wins >= 10 },
  { id: 'wins-50', group: 'Milestones', name: 'Fifty Up',
    desc: 'Win fifty matches.', test: (m, t) => t.wins >= 50 },
  { id: 'dressed', group: 'Milestones', name: 'Looking The Part',
    desc: 'Change your kit in the player editor.',
    manual: true },
  { id: 'collector', group: 'Milestones', name: 'Full Wardrobe',
    desc: 'Unlock every cosmetic in the game.',
    manual: true },
];

export const ACHIEVEMENT_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

function blankTotals() {
  return {
    matches: 0, wins: 0, onlineWins: 0, shots: 0, perfects: 0, chokes: 0,
    seasonsCleared: 0, cleared: [], wasOnLastLife: false,
  };
}

function blank() { return { unlocked: {}, totals: blankTotals() }; }

let store = null;

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw || typeof raw !== 'object') return blank();
    const out = blank();
    if (raw.unlocked && typeof raw.unlocked === 'object') {
      for (const id of Object.keys(raw.unlocked)) {
        if (ACHIEVEMENT_BY_ID[id]) out.unlocked[id] = Number(raw.unlocked[id]) || Date.now();
      }
    }
    if (raw.totals && typeof raw.totals === 'object') {
      for (const k of Object.keys(out.totals)) {
        const v = raw.totals[k];
        if (Array.isArray(out.totals[k]) && Array.isArray(v)) out.totals[k] = v.slice();
        else if (typeof out.totals[k] === 'boolean') out.totals[k] = !!v;
        else if (Number.isFinite(Number(v))) out.totals[k] = Number(v);
      }
    }
    return out;
  } catch {
    return blank();
  }
}

export function achievementState() {
  if (!store) store = read();
  return store;
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* see season.js */ }
}

export function isUnlocked(id) { return !!achievementState().unlocked[id]; }
export function unlockedCount() { return Object.keys(achievementState().unlocked).length; }

/** Grant one directly. Used by the few that are not about a finished match. */
export function grant(id) {
  const s = achievementState();
  if (!ACHIEVEMENT_BY_ID[id] || s.unlocked[id]) return null;
  s.unlocked[id] = Date.now();
  persist();
  return ACHIEVEMENT_BY_ID[id];
}

/**
 * Fold a finished match into the tally and return whatever it just unlocked.
 * Totals are updated first so a milestone can be earned by the match that
 * crossed it, which is what players expect.
 */
export function recordMatch(m) {
  const s = achievementState();
  const t = s.totals;
  t.matches += 1;
  if (m.won) t.wins += 1;
  if (m.won && (m.mode === 'host' || m.mode === 'join')) t.onlineWins += 1;
  t.shots += m.shots || 0;
  t.perfects += m.perfects || 0;
  t.chokes += m.chokes || 0;
  if (m.mode === 'season' && (m.livesBefore === 1 || m.livesAfter === 1)) t.wasOnLastLife = true;
  if (m.seasonComplete) {
    t.seasonsCleared += 1;
    if (!t.cleared.includes(m.difficulty)) t.cleared.push(m.difficulty);
    t.wasOnLastLife = false;                     // reset for the next run
  }

  // `clearedSet` is a convenience for the tests above and is not persisted.
  const view = { ...t, clearedSet: new Set(t.cleared) };
  const earned = [];
  for (const a of ACHIEVEMENTS) {
    if (a.manual || s.unlocked[a.id]) continue;
    let ok = false;
    try { ok = !!a.test(m, view); } catch { ok = false; }
    if (ok) {
      s.unlocked[a.id] = Date.now();
      earned.push(a);
    }
  }
  persist();
  return earned;
}

export function _resetForTests() { store = blank(); return store; }
