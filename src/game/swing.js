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

// Two swings, chosen by which mouse button you hold. Both are filling power
// bars with a sweet band near the top; they differ in how long the bar is and
// what the shot can do.
//
//  DRIVE (left button) -- the full bar. A release inside the band with the bar
//    near full is the most pace available, so it is a test of nerve as much as
//    timing: every extra frame held is more power and more risk. Hold past the
//    end and the swing overcooks into a weak pop-up.
//
//  QUICK (right button) -- the same bar at half the length, so its sweet spot
//    arrives in roughly half the time, but it only ever produces a dink. The
//    point is the decision: when a fast ball leaves no time to fill a drive,
//    take a clean quick dink instead of a mistimed big one.

export const MODE = SWING_MODE;

// How long this mode's bar takes to fill end to end.
function fillTime(mode) {
  return mode === MODE.QUICK ? SWING.QUICK_CHARGE : SWING.CHARGE_TIME;
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
export function sweetZone(sw, tuning, assist = 1) {
  // The stat follows the shot, not the meter: the short bar produces a dink,
  // so it widens with the dink stat even though it is mechanically a bar.
  const stat = sw.mode === MODE.QUICK ? tuning.dinkSweet : tuning.driveSweet;
  const scale = stat * assist;
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

function gradeDistance(d, zone) {
  if (d <= zone.perfect) return QUALITY.PERFECT;
  if (d <= zone.half) return QUALITY.GOOD;
  if (d <= zone.okHalf) return QUALITY.OK;
  return QUALITY.WEAK;
}

// Resolve a button release into a shot. Returns null if the swing was not live.
export function releaseSwing(sw, tuning, assist = 1) {
  if (!sw.active) return null;
  sw.active = false;
  const zone = sweetZone(sw, tuning, assist);
  let quality;
  let powerFrac;

  if (sw.overcooked) {
    // Held past the end of the bar: the swing fizzles into a floater.
    quality = QUALITY.WEAK;
    powerFrac = 0.30;
  } else if (sw.held < SWING.MIN_HOLD) {
    // A tap is a controlled block rather than a failed drive.
    quality = QUALITY.OK;
    powerFrac = 0.34;
  } else {
    quality = gradeDistance(Math.abs(sw.t - zone.center), zone);
    powerFrac = Math.min(1, sw.t);
  }
  // The quick bar buys its speed with a hard ceiling on pace.
  if (sw.mode === MODE.QUICK) powerFrac *= SWING.QUICK_POWER;

  const result = {
    mode: sw.mode,
    quality,
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
export function classifyShot({ mode, soft, beforeBounce, ballHeight, netHeight, isServe, quality }) {
  if (isServe) return SHOT.SERVE;
  if (mode === MODE.QUICK) {
    // Always a soft ball. Deep in the court that reads as a drop; at the net
    // it is a dink, and a high one can still be punched away.
    if (beforeBounce && ballHeight > netHeight + 0.42 && quality === QUALITY.PERFECT) {
      return SHOT.SMASH;
    }
    return soft ? SHOT.DROP : SHOT.DINK;
  }
  if (soft) return SHOT.LOB;
  if (beforeBounce && ballHeight > netHeight + 0.55 && quality === QUALITY.PERFECT) {
    return SHOT.SMASH;
  }
  return SHOT.DRIVE;
}
