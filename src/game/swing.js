import {
  SWING, SWING_MODE, QUALITY, QUALITY_POWER, QUALITY_SCATTER, SHOT,
} from './constants.js';

// How much the sweet band widens for whoever is standing under a lob, from
// how high the ball got since it was last struck. A ball that never left
// waist height is worth nothing; a genuine moon ball is worth the lot. The
// caller feeds in the apex so this stays the single definition of the curve.
export function lobBonus(apexY) {
  const { LOB_APEX_LO: lo, LOB_APEX_HI: hi, LOB_SWEET } = SWING;
  // Linear between the two heights: the floor already excludes half-hearted
  // lifts, so easing on top of it left ordinary lobs paying out almost
  // nothing, which is not what the mechanic is for.
  const k = Math.max(0, Math.min(1, (apexY - lo) / (hi - lo)));
  return 1 + (LOB_SWEET - 1) * k;
}

// Three swings. Two of them fill a power bar with a sweet band near the top
// and differ in how long the bar is; the third has no bar at all.
//
//  DRIVE (left button) -- the full bar. A release inside the band with the bar
//    near full is the most pace available, so it is a test of nerve as much as
//    timing: every extra frame held is more power and more risk. Hold past the
//    end, into the red, and the shot is gone -- netted or long.
//
//  QUICK (right button) -- the same bar at half the length, so its sweet spot
//    arrives in roughly half the time, but it only ever produces a dink. The
//    point is the decision: when a fast ball leaves no time to fill a drive,
//    take a clean quick dink instead of a mistimed big one.
//
//  LOB (space) -- no bar. It fires the frame you press it, which is the whole
//    of its value: a smash arrives faster than even the short bar can fill,
//    so this is the only legal answer to one. In exchange it hands the ball
//    back high and slow, which is the best thing your opponent can be given.
//    Reach for it when the alternative is not reaching the ball at all.

export const MODE = SWING_MODE;

// How long this mode's bar takes to fill end to end. The lob has no bar and
// never reaches here -- it does not go through beginSwing at all.
function fillTime(mode) {
  return mode === MODE.QUICK ? SWING.QUICK_CHARGE : SWING.CHARGE_TIME;
}

/**
 * The instant lob. Shaped exactly like a releaseSwing result so the callers
 * that queue a shot do not have to care which of the three produced it, but
 * built rather than graded: there is no bar to have been on time for.
 *
 * Quality is fixed at OK. Not GOOD, because a shot you did not have to time
 * should not sit above one you did; not WEAK, because WEAK floats the ball
 * in the sim and a lob that floats on top of being a lob is unplayable.
 */
export function lobSwing(tuning, rand = Math.random) {
  return {
    mode: MODE.LOB,
    quality: QUALITY.OK,
    choke: false,
    accuracy: SWING.LOB_ACCURACY,
    powerFrac: SWING.LOB_POWER,
    power: SWING.LOB_POWER * QUALITY_POWER[QUALITY.OK] * tuning.powerScale,
    // Its own scatter rather than the quality table's: the point of the shot
    // is that it lands roughly where you pointed, so the fuzz is a property
    // of the swing, not of how well it was struck.
    scatter: SWING.LOB_SCATTER * tuning.scatterScale,
    t: 0,
    held: 0,
    rand: rand(),
  };
}

/**
 * How much the sweet band shrinks for a player who is swinging on the move.
 * 1 standing still, PRESSURE_ZONE at a full run. This is what makes where you
 * put the ball matter: before it, a shot someone had to sprint for graded the
 * same as one at their feet.
 */
export function pressureScale(speed) {
  const k = Math.max(0, Math.min(1, speed / SWING.PRESSURE_SPEED));
  return 1 + (SWING.PRESSURE_ZONE - 1) * k;
}

export function createSwingState() {
  return {
    active: false,
    mode: MODE.DRIVE,
    t: 0,           // bar fill, 0..1+overcharge
    held: 0,        // seconds the button has been down
    sweetCenter: (SWING.DRIVE_SWEET_LO + SWING.DRIVE_SWEET_HI) * 0.5,
    zoneScale: 1,
    lobBonus: 1,
    overcooked: false,
    lastResult: null,
  };
}

export function beginSwing(sw, mode, tuning, rand = Math.random, zoneScale = 1) {
  sw.active = true;
  sw.mode = mode;
  // Shrinks the sweet and good bands without touching the wider "ok" shoulder,
  // so a harder swing costs you quality rather than becoming unplayable.
  sw.zoneScale = zoneScale;
  // Ratcheted upward by the caller while the ball climbs, never downward, so
  // the band you were aiming at cannot shrink out from under your thumb.
  sw.lobBonus = 1;
  sw.t = 0;
  sw.held = 0;
  sw.overcooked = false;
  sw.sweetCenter = (SWING.DRIVE_SWEET_LO + SWING.DRIVE_SWEET_HI) * 0.5;
  return sw;
}

export function updateSwing(sw, dt, tuning) {
  if (!sw.active) return sw;
  sw.held += dt;
  sw.t += (dt / fillTime(sw.mode)) * tuning.chargeRate;
  if (sw.t > 1 + SWING.OVERCHARGE) {
    sw.t = 1 + SWING.OVERCHARGE;
    sw.overcooked = true;
  }
  return sw;
}

// Geometry of the sweet zone, also used by the HUD so the bar always matches
// exactly what the resolver will score.
export function sweetZone(sw, tuning) {
  // The stat follows the shot, not the meter: the short bar produces a dink,
  // so it widens with the dink stat even though it is mechanically a bar.
  const scale = sw.mode === MODE.QUICK ? tuning.dinkSweet : tuning.driveSweet;
  const z = (sw.zoneScale ?? 1) * (sw.lobBonus ?? 1);
  const base = ((SWING.DRIVE_SWEET_HI - SWING.DRIVE_SWEET_LO) * 0.5) * scale;
  const half = base * z;
  return {
    center: sw.sweetCenter,
    half,
    perfect: (SWING.DRIVE_PERFECT_W * 0.5) * scale * z,
    // Derived from the unshrunk band: tightening a swing should cost you the
    // top grades, not make the shot impossible to land at all. A lob bonus can
    // widen the sweet band past the shoulder, so keep a margin outside it --
    // otherwise a widened swing drops straight from good to weak with no ok
    // grade in between, which is a harsher cliff than the narrow version.
    okHalf: Math.max(base * 1.85, half * 1.22),
  };
}

// How cleanly a release was struck, 0..1. Anything inside the perfect band
// scores a flat 100%, and it falls away to nothing at the outer edge of the
// ok shoulder -- so a player who hits perfect every time averages exactly
// 100, which is what the end-of-match accuracy column promises.
function accuracyAt(d, zone) {
  if (d <= zone.perfect) return 1;
  const span = Math.max(1e-4, zone.okHalf - zone.perfect);
  return Math.max(0, 1 - (d - zone.perfect) / span);
}

function gradeDistance(d, zone) {
  if (d <= zone.perfect) return QUALITY.PERFECT;
  if (d <= zone.half) return QUALITY.GOOD;
  if (d <= zone.okHalf) return QUALITY.OK;
  return QUALITY.WEAK;
}

// Resolve a button release into a shot. Returns null if the swing was not live.
export function releaseSwing(sw, tuning) {
  if (!sw.active) return null;
  sw.active = false;
  const zone = sweetZone(sw, tuning);
  let quality;
  let powerFrac;

  // Past the end of the bar is the red, and the red is a blunder rather than
  // a soft shot: the swing arrives late and wild, and the ball is going into
  // the net or over the baseline whatever else is true about it. Note this is
  // the whole overcharge region, not just the cap -- the bar turns red the
  // moment it fills, and from there the shot is already lost.
  const choke = sw.t > 1;

  let accuracy;

  if (choke) {
    quality = QUALITY.WEAK;
    powerFrac = 0.30;
    accuracy = 0;
  } else if (sw.held < SWING.MIN_HOLD) {
    // A tap is a controlled block rather than a failed drive.
    quality = QUALITY.OK;
    powerFrac = 0.34;
    // There is no timing to grade on a block, so score it as whatever a shot
    // sitting in the middle of the ok shoulder would get.
    accuracy = accuracyAt((zone.half + zone.okHalf) * 0.5, zone);
  } else {
    const d = Math.abs(sw.t - zone.center);
    quality = gradeDistance(d, zone);
    powerFrac = Math.min(1, sw.t);
    accuracy = accuracyAt(d, zone);
  }
  // The quick bar buys its speed with a hard ceiling on pace.
  if (sw.mode === MODE.QUICK) powerFrac *= SWING.QUICK_POWER;

  const result = {
    mode: sw.mode,
    quality,
    choke,
    accuracy,
    powerFrac,
    power: powerFrac * QUALITY_POWER[quality] * tuning.powerScale,
    scatter: QUALITY_SCATTER[quality] * tuning.scatterScale,
    t: sw.t,
    held: sw.held,
  };
  sw.lastResult = result;
  return result;
}

// Decide which archetype a released swing becomes, from context.
export function classifyShot({
  mode, beforeBounce, ballHeight, netHeight, isServe, quality, offLob = false,
}) {
  if (isServe) return SHOT.SERVE;
  // Space is a lob and only a lob. It used to be a modifier held with the
  // drive, which meant the game's one escape shot was also its least
  // discoverable -- and it cost the drive nothing to reach for.
  if (mode === MODE.LOB) return SHOT.LOB;
  if (mode === MODE.QUICK) {
    // Always a dink. Space does nothing here: the short bar is already the
    // soft option, and giving it a second softness modifier only made the
    // two shots harder to tell apart. A high one can still be punched away.
    if (beforeBounce && ballHeight > netHeight + 0.42 && quality === QUALITY.PERFECT
      && !offLob) {
      return SHOT.SMASH;
    }
    return SHOT.DINK;
  }
  // Not off a lob. One passes down through the smash band on its way to the
  // floor, so without this the shot was: go up, get put away -- measured at
  // 9% against an identical opponent who simply never used it. An overhead
  // off a genuine lob is the hardest ball in the sport; here it was free.
  //
  // This asks what the ball WAS, not how high it got. Judging by height
  // caught ordinary play instead: a dink reaches 2.95m at the median and
  // 4.79m at the ninetieth, so a height rule generous enough to cover lobs
  // was quietly banning the smash off half the dinks in the game.
  if (beforeBounce && ballHeight > netHeight + 0.55 && quality === QUALITY.PERFECT
    && !offLob) {
    return SHOT.SMASH;
  }
  return SHOT.DRIVE;
}
