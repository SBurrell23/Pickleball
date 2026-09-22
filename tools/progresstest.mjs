// Season bookkeeping and achievements, headless. These are the rules that are
// easy to get subtly wrong and impossible to eyeball: how lives are spent,
// when the fourth one arrives, what a run does when it ends, and which
// achievements a given match should and should not hand out.

// localStorage stand-in, so the real persistence path is the one under test
// rather than a mock of it.
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const season = await import('../src/game/season.js');
const ach = await import('../src/game/achievements.js');
const { seasonLength, seasonRoster, enemyDef, ROSTER_SIZE } =
  await import('../src/game/enemies.js');
const avatar = await import('../src/game/avatar.js');

const failures = [];
let checks = 0;
function check(ok, msg) {
  checks++;
  if (!ok) failures.push(msg);
}
function eq(actual, expected, msg) {
  check(actual === expected, `${msg} -- expected ${expected}, got ${actual}`);
}

// ---- lives ----------------------------------------------------------------

function freshRun(difficulty = 'normal') {
  season._resetForTests();
  return season.startRun(difficulty);
}

{
  const run = freshRun();
  eq(run.lives, season.START_LIVES, 'a new run starts on three lives');
  eq(run.index, 0, 'a new run starts at the first rival');

  // Losing costs a life and does NOT advance the ladder.
  const a = season.recordResult(false);
  eq(a.lives, 2, 'a loss costs a life');
  eq(season.activeRun().index, 0, 'a loss leaves you on the same rival');
  eq(a.runOver, false, 'two lives left is not the end of the run');

  // Winning advances without refunding.
  const b = season.recordResult(true);
  eq(b.lives, 2, 'a win does not hand a life back');
  eq(season.activeRun().index, 1, 'a win moves you up the ladder');
}

{
  // Three losses in a row ends the run, and the run is gone afterwards.
  freshRun();
  season.recordResult(false);
  season.recordResult(false);
  const third = season.recordResult(false);
  eq(third.lives, 0, 'the third loss spends the last life');
  eq(third.runOver, true, 'running out of lives ends the run');
  eq(season.activeRun(), null, 'an ended run is not still active');
}

{
  // Season lengths are what the brief asked for, and every ladder opens on
  // the warm-up and ends on the champion.
  eq(seasonLength('easy'), 3, 'Easy is three matches');
  eq(seasonLength('normal'), 5, 'Normal is five matches');
  eq(seasonLength('hard'), 7, 'Hard is seven matches');
  eq(seasonLength('extreme'), 11, 'Extreme is the full eleven');
  for (const d of season.DIFFICULTIES) {
    const roster = seasonRoster(d);
    eq(roster.length, seasonLength(d), `${d}: the roster is as long as the season`);
    eq(roster[0], 0, `${d}: the ladder opens against the warm-up`);
    eq(roster[roster.length - 1], ROSTER_SIZE - 1, `${d}: the ladder ends on the champion`);
    eq(new Set(roster).size, roster.length, `${d}: nobody is faced twice`);
    for (let i = 1; i < roster.length; i++) {
      check(roster[i] > roster[i - 1], `${d}: the ladder walks up the roster in order`);
    }
  }
  eq(season.bonusAt('extreme'), 7,
    'on the full ladder the fourth life still lands after the seventh rival');
  for (const d of season.DIFFICULTIES) {
    const at = season.bonusAt(d);
    check(at >= 2, `${d}: the bonus life is not handed over immediately`);
    check(at < seasonLength(d), `${d}: the bonus life lands before the last match`);
  }
}

{
  // The fourth life lands once, on the rung bonusAt names, and the cap holds.
  for (const d of season.DIFFICULTIES) {
    const at = season.bonusAt(d);
    freshRun(d);
    for (let i = 0; i < at - 1; i++) {
      const r = season.recordResult(true);
      check(!r.bonusLife, `${d}: no bonus life after beating rival ${i + 1}`);
    }
    const hit = season.recordResult(true);
    eq(hit.bonusLife, true, `${d}: rival ${at} hands over the fourth life`);
    eq(hit.lives, season.MAX_LIVES, `${d}: and that is the fourth, not a fifth`);
    if (at + 1 <= seasonLength(d) - 1) {
      const next = season.recordResult(true);
      eq(next.bonusLife, false, `${d}: the bonus life is awarded once`);
    }
  }
}

{
  // A full clear: eleven wins, and the difficulty is recorded as completed.
  freshRun('hard');
  let last = null;
  for (let i = 0; i < seasonLength('hard'); i++) last = season.recordResult(true);
  eq(last.seasonComplete, true, 'seven wins completes the Hard season');
  eq(last.perfect, true, 'a run that never lost is flagged perfect');
  check(season.completedDifficulties().includes('hard'), 'the difficulty is banked');
  eq(season.activeRun(), null, 'a completed run is no longer active');
  eq(season.bestProgress('hard'), seasonLength('hard'), 'best progress reaches the end');

  // ...and clearing it unlocks the cosmetics gated behind it.
  const locked = avatar.optionsFor('accessory').find((o) => o.unlock === 'hard');
  check(!avatar.isUnlocked(locked, []), 'the headphones start locked');
  check(avatar.isUnlocked(locked, ['hard']), 'clearing Hard unlocks the headphones');
  // A saved look cannot smuggle a locked item past the gate.
  const smuggled = avatar.sanitizeLook({ accessory: locked.id }, []);
  check(smuggled.accessory !== locked.id, 'a locked item in storage is discarded');
  eq(avatar.sanitizeLook({ accessory: locked.id }, ['hard']).accessory, locked.id,
    'an earned item in storage is honoured');
}

{
  // A loss partway through marks the run imperfect for good.
  freshRun('easy');
  season.recordResult(true);
  season.recordResult(false);
  let last = null;
  for (let i = 0; i < seasonLength('easy') - 1; i++) last = season.recordResult(true);
  eq(last.seasonComplete, true, 'the run still completes after a dropped match');
  eq(last.perfect, false, 'a run that lost a life is not perfect');
}

// ---- the ladder itself -----------------------------------------------------

{
  // Rivals get stronger up the ladder and across difficulties, and the human
  // side never does.
  const first = enemyDef(0, 'easy');
  const last = enemyDef(seasonLength('extreme') - 1, 'extreme');
  const sum = (d) => Object.values(d.stats).reduce((a, b) => a + b, 0);
  check(sum(last) > sum(first) + 0.5, 'the last rival on Extreme dwarfs the first on Easy');
  for (const d of season.DIFFICULTIES) {
    for (let i = 1; i < seasonLength(d); i++) {
      check(sum(enemyDef(i, d)) >= sum(enemyDef(i - 1, d)) - 0.35,
        `${d}: rival ${i + 1} is not weaker than rival ${i} by much`);
    }
    check(sum(enemyDef(0, d)) >= 5, `${d}: the first rival is not below average overall`);
  }
  check(Object.values(avatar.PLAYER_STATS).every((v) => v === 1),
    'the human stat line is dead average on every axis');
}

// ---- achievements ----------------------------------------------------------

function summary(over = {}) {
  return {
    mode: 'local', matchMode: 'singles', won: true, myScore: 11, theirScore: 5,
    shots: 40, dinks: 20, drives: 10, lobs: 2, perfects: 5, weak: 2, chokes: 1,
    accuracy: 0.55, longestRally: 8, avgRally: 6, maxDeficit: 2,
    smashWinners: 0, lobWinners: 0, aces: 0, lobPunishes: 0, ...over,
  };
}
const ids = (list) => list.map((a) => a.id).sort();

{
  ach._resetForTests();
  const got = ids(ach.recordMatch(summary()));
  check(got.includes('first-win'), 'winning a match earns the first win');
  check(!got.includes('shutout'), 'an 11-5 win is not a shutout');
  check(!got.includes('no-chokes'), 'a win with a choke does not earn Steady Hands');
  // Nothing is ever handed out twice.
  const again = ids(ach.recordMatch(summary()));
  check(!again.includes('first-win'), 'an achievement is only awarded once');
}

{
  ach._resetForTests();
  const got = ids(ach.recordMatch(summary({
    theirScore: 0, chokes: 0, weak: 0, accuracy: 0.92, maxDeficit: 0,
  })));
  for (const id of ['shutout', 'no-chokes', 'iron-nerve', 'accurate-80', 'accurate-90', 'wire-to-wire']) {
    check(got.includes(id), `an 11-0 flawless win earns ${id}`);
  }
}

{
  ach._resetForTests();
  const got = ids(ach.recordMatch(summary({ mode: 'join', matchMode: 'doubles' })));
  check(got.includes('first-online'), 'winning online counts as online');
  check(got.includes('road-win'), 'winning as the joiner is an away win');
  check(got.includes('doubles-win'), 'an online doubles win counts');
  check(!got.includes('host-win'), 'joining is not hosting');
}

{
  ach._resetForTests();
  const got = ids(ach.recordMatch(summary({
    mode: 'season', difficulty: 'extreme', seasonComplete: true, seasonPerfect: true,
  })));
  for (const id of ['season-extreme', 'flawless', 'flawless-hard']) {
    check(got.includes(id), `clearing Extreme without a loss earns ${id}`);
  }
  check(!got.includes('season-hard'), 'clearing Extreme does not award the Hard clear');
}

{
  // Cumulative milestones fire on the match that crosses the line, not after.
  ach._resetForTests();
  let crossed = false;
  for (let i = 0; i < 3; i++) {
    const got = ids(ach.recordMatch(summary({ shots: 40 })));
    if (got.includes('shots-100')) crossed = i === 2;
  }
  check(crossed, 'the hundredth shot unlocks on the match that reaches it');
}

{
  // Losing badly should unlock nothing at all.
  ach._resetForTests();
  const got = ach.recordMatch(summary({
    won: false, myScore: 2, theirScore: 11, shots: 12, perfects: 0,
    accuracy: 0.2, longestRally: 4, avgRally: 4,
  }));
  eq(got.length, 0, 'a heavy defeat earns nothing');
}

{
  // Every achievement is reachable: one that no test can ever satisfy is a
  // bug, and a duplicate id would silently shadow one.
  const seen = new Set();
  for (const a of ach.ACHIEVEMENTS) {
    check(!seen.has(a.id), `duplicate achievement id ${a.id}`);
    seen.add(a.id);
    check(!!a.name && !!a.desc, `${a.id} is missing a name or description`);
    check(ach.GROUPS.includes(a.group) || a.manual,
      `${a.id} is in an unknown group`);
    check(a.manual || typeof a.test === 'function', `${a.id} has no test`);
  }
  check(ach.ACHIEVEMENTS.length >= 30,
    `only ${ach.ACHIEVEMENTS.length} achievements -- the brief asked for 30 to 50`);
  check(ach.ACHIEVEMENTS.length <= 50,
    `${ach.ACHIEVEMENTS.length} achievements is more than the brief asked for`);
}

// ---- venues ----------------------------------------------------------------

{
  // Every colour in the venue table is a string handed straight to a canvas
  // or a THREE.Color. A typo in one is invisible in node and silently paints
  // something black in the browser -- two of them shipped in the first draft
  // of this table, which is why this check exists.
  const { VENUES, TIMES, getVenue, getTime } = await import('../src/render/venues.js');
  const hex = /^#[0-9a-f]{6}$/i;
  const int = (v) => Number.isInteger(v) && v >= 0 && v <= 0xffffff;
  eq(VENUES.length, 5, 'there are five venues');
  eq(TIMES.length, 3, 'each has a day, dusk and night');
  const ids = new Set();
  for (const v of VENUES) {
    check(!ids.has(v.id), `duplicate venue id ${v.id}`);
    ids.add(v.id);
    check(!!v.name && !!v.blurb, `${v.id} is missing a name or blurb`);
    for (const part of ['court', 'kitchen', 'line', 'apron']) {
      for (const [k, c] of Object.entries(v[part])) {
        check(hex.test(c), `${v.id}.${part}.${k} is not a #rrggbb colour: ${c}`);
      }
    }
    check(hex.test(v.ground.base), `${v.id} ground base is not a colour`);
    for (const c of [...v.ground.blades, ...v.ground.patches]) {
      check(hex.test(c), `${v.id} ground palette has a bad colour: ${c}`);
    }
    check(v.scatter.colors.every(int), `${v.id} scatter colours must be integers`);
    check(int(v.fence.post) && int(v.stands.color) && int(v.lights.lamp),
      `${v.id} has a non-integer structure colour`);
    check(int(v.sky.zenith) && int(v.sky.horizon), `${v.id} sky is not integer colours`);
    check(!v.fog || (v.fog[0] > 0 && v.fog[1] > v.fog[0]), `${v.id} fog range is backwards`);
    check(v.stands.crowd >= 0 && v.stands.crowd <= 1, `${v.id} crowd fill is out of range`);
  }
  for (const t of TIMES) {
    check(int(t.key.color) && int(t.hemi.sky) && int(t.hemi.ground) && int(t.fill.color),
      `${t.id} has a non-integer light colour`);
    check(t.elevation > -1 && t.elevation < 1.6, `${t.id} sun elevation is implausible`);
    if (t.flood) check(t.flood.intensity > 0, `${t.id} flood is on but has no intensity`);
  }
  // Unknown ids fall back rather than exploding, because they arrive from a
  // peer and from saved settings.
  eq(getVenue('nonsense').id, 'rec', 'an unknown venue falls back to the rec courts');
  eq(getTime('nonsense').id, 'day', 'an unknown time falls back to day');

  // Every rung of every season ladder names a venue that exists, opens on the
  // rec courts and finishes on the championship court.
  for (const d of season.DIFFICULTIES) {
    const ladder = season.venueLadder(d);
    eq(ladder.length, seasonLength(d), `${d}: a court for every rung`);
    eq(ladder[0], 'rec', `${d}: the season opens on the rec courts`);
    eq(ladder[ladder.length - 1], 'championship',
      `${d}: the season finishes on the championship court`);
    for (const id of ladder) check(ids.has(id), `${d}: unknown venue ${id} on the ladder`);
  }
}

console.log(`${checks} checks, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error('FAIL: ' + f);
  process.exit(1);
}
console.log('season + achievement bookkeeping passed');
