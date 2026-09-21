import { SWING, QUALITY, QUALITY_POWER, QUALITY_SCATTER, SHOT } from './constants.js';

// Two distinct mini-games, chosen by where you are standing.
//
//  DRIVE (back court)  -- a power bar fills from 0 to 1 while you hold the
//    button. A sweet band sits near the top. You want maximum power AND a
//    release inside the band, so it is power + timing. Hold too long and the
//    swing overcooks into a weak pop-up.
//
//  DINK (at the kitchen) -- power is largely fixed and a needle ping-pongs
//    across a short bar at speed. The sweet zone is placed randomly each swing,
//    so it is pure quick reaction.

export const MODE = { DRIVE: 'drive', DINK: 'dink' };

export function createSwingState() {
  return {
    active: false,
    mode: MODE.DRIVE,
    t: 0,           // power-bar fill (drive) 0..1+overcharge
    held: 0,        // seconds the button has been down
    needle: 0,      // needle position (dink) 0..1
    dir: 1,
    sweetCenter: 0.5,
    overcooked: false,
    lastResult: null,
  };
}

export function beginSwing(sw, mode, tuning, rand = Math.random) {
  sw.active = true;
  sw.mode = mode;
  sw.t = 0;
  sw.held = 0;
  sw.dir = 1;
  sw.overcooked = false;
  if (mode === MODE.DINK) {
    // Random sweet-spot placement is what makes this a reaction test.
    sw.sweetCenter = 0.16 + rand() * 0.68;
    sw.needle = rand() < 0.5 ? 0 : 1;
    sw.dir = sw.needle === 0 ? 1 : -1;
  } else {
    sw.sweetCenter = (SWING.DRIVE_SWEET_LO + SWING.DRIVE_SWEET_HI) * 0.5;
    sw.needle = 0;
  }
  return sw;
}

export function updateSwing(sw, dt, tuning) {
  if (!sw.active) return sw;
  sw.held += dt;
  if (sw.mode === MODE.DRIVE) {
    sw.t += (dt / SWING.CHARGE_TIME) * tuning.chargeRate;
    if (sw.t > 1 + SWING.OVERCHARGE) {
      sw.t = 1 + SWING.OVERCHARGE;
      sw.overcooked = true;
    }
  } else {
    const speed = 2 / SWING.DINK_CYCLE; // a full there-and-back per DINK_CYCLE
    sw.needle += sw.dir * speed * dt;
    while (sw.needle > 1 || sw.needle < 0) {
      if (sw.needle > 1) { sw.needle = 2 - sw.needle; sw.dir = -1; }
      if (sw.needle < 0) { sw.needle = -sw.needle; sw.dir = 1; }
    }
    sw.t = Math.min(1, sw.held / SWING.CHARGE_TIME);
  }
  return sw;
}

// Geometry of the sweet zone, also used by the HUD so the bar always matches
// exactly what the resolver will score.
export function sweetZone(sw, tuning, assist = 1) {
  const scale = tuning.sweetScale * assist;
  if (sw.mode === MODE.DRIVE) {
    const half = ((SWING.DRIVE_SWEET_HI - SWING.DRIVE_SWEET_LO) * 0.5) * scale;
    const perfect = (SWING.DRIVE_PERFECT_W * 0.5) * scale;
    return { center: sw.sweetCenter, half, perfect, okHalf: half * 1.85 };
  }
  const half = (SWING.DINK_SWEET_W * 0.5) * scale;
  const perfect = (SWING.DINK_PERFECT_W * 0.5) * scale;
  return { center: sw.sweetCenter, half, perfect, okHalf: half * 1.9 };
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

  if (sw.mode === MODE.DRIVE) {
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
  } else {
    quality = gradeDistance(Math.abs(sw.needle - zone.center), zone);
    // Kitchen shots are about placement, not pace. A little extra hold adds
    // punch but the ceiling stays low.
    powerFrac = 0.30 + 0.32 * Math.min(1, sw.held / 0.55);
  }

  const result = {
    mode: sw.mode,
    quality,
    powerFrac,
    power: powerFrac * QUALITY_POWER[quality] * tuning.powerScale,
    scatter: QUALITY_SCATTER[quality] * tuning.scatterScale,
    charged: sw.mode === MODE.DRIVE && sw.t >= 0.98 && !sw.overcooked,
    t: sw.mode === MODE.DRIVE ? sw.t : sw.needle,
    held: sw.held,
  };
  sw.lastResult = result;
  return result;
}

// Decide which archetype a released swing becomes, from context.
export function classifyShot({ mode, soft, beforeBounce, ballHeight, netHeight, isServe, quality }) {
  if (isServe) return SHOT.SERVE;
  if (mode === MODE.DINK) {
    if (beforeBounce && ballHeight > netHeight + 0.42 && quality !== 'weak') return SHOT.SMASH;
    if (soft) return SHOT.DROP;
    if (beforeBounce) return SHOT.VOLLEY;
    return SHOT.DINK;
  }
  if (soft) return SHOT.LOB;
  if (beforeBounce && ballHeight > netHeight + 0.55 && quality === 'perfect') return SHOT.SMASH;
  return SHOT.DRIVE;
}
