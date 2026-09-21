// Court + physics constants. Units are metres / seconds unless noted.
// Real pickleball court is 20ft x 44ft; the kitchen (non-volley zone) is 7ft deep.

export const COURT = {
  HALF_W: 3.048,        // 10 ft
  HALF_L: 6.7056,       // 22 ft (net at z = 0)
  KITCHEN: 2.1336,      // 7 ft from the net
  NET_H_CENTER: 0.8636, // 34 in
  NET_H_POST: 0.9144,   // 36 in
  LINE_W: 0.05,
  RUNOFF: 3.2,          // how far past the lines a player may chase
};

// The surround. The ball is stopped by the fence rather than sailing off into
// the grass, and the render side builds the apron and fence from the same
// numbers so the two can never disagree.
export const FENCE = {
  X: COURT.HALF_W + 3.4,
  Z: COURT.HALF_L + 3.6,
  H: 1.15,
  REST: 0.26,   // chain-link is dead; the ball drops rather than rebounds
};

export const BALL = {
  // Larger than a real 74mm ball on purpose: at this camera distance a
  // true-scale ball is a speck and you cannot read its height.
  R: 0.052,
  GRAVITY: -16.5,       // heavier than real gravity: arcade snap
  DRAG: 0.0115,         // quadratic drag coefficient
  MAGNUS: 0.055,        // spin -> lateral/vertical force
  SPIN_DECAY: 0.72,     // per second
  REST_Y: 0.615,        // vertical restitution off the court
  FRICTION: 0.80,       // horizontal damping on bounce
  SPIN_TO_VEL: 0.16,    // spin converted to horizontal velocity on bounce
  NET_REST: 0.22,       // how dead the net is
  MAX_SPEED: 27,
  DEAD_SPEED: 0.9,      // below this after enough bounces the rally is over
};

export const PLAY = {
  TICK: 1 / 60,
  MAX_SUBSTEPS: 6,
  PLAYER_R: 0.28,
  PLAYER_H: 1.25,
  ACCEL: 42,
  DECEL: 35,
  TURN_ASSIST: 1.9,     // extra accel when reversing direction
  DASH_SPEED: 11.2,
  DASH_TIME: 0.17,
  DASH_CD: 0.85,
  DASH_COST: 30,
  STAMINA_MAX: 80,
  STAMINA_REGEN: 8.7,   // roughly a third of what it was: a spent bar is a
                        // real cost for the next several seconds
  REACH_BASE: 1.20,     // paddle reach radius from player centre
  REACH_HEIGHT: 2.20,   // highest ball a player can reach (times character scale);
                        // generous on purpose -- if the smaller characters
                        // cannot get above a floater, nobody can ever put a
                        // ball away and rallies never end
  SWING_WINDUP: 0.055,  // delay between release and the paddle being live
  SWING_ACTIVE: 0.14,   // how long contact stays live
  SWING_RECOVER: 0.20,  // cooldown after a swing
  SERVE_RESET: 1.15,    // pause between points
};

// The two swings. Left button is the full power bar, right button the short
// one. Lives here rather than in swing.js so the simulation can reason about
// which swing produced a shot without importing the mini-game.
export const SWING_MODE = { DRIVE: 'drive', QUICK: 'quick' };

// Charge / timing mini-game tuning.
export const SWING = {
  CHARGE_TIME: 0.78,        // seconds for the power bar to fill (drive)
  OVERCHARGE: 0.26,         // grace after full before the shot fizzles
  DRIVE_SWEET_LO: 0.775,    // sweet band on the power bar
  DRIVE_SWEET_HI: 0.945,
  DRIVE_PERFECT_W: 0.055,   // perfect band, centred in the sweet zone
  // Serving gives you unlimited time to watch the bar, so its bands are much
  // tighter than a rallying shot's -- otherwise every serve is a free perfect.
  // Only serves are affected; rally timing is unchanged.
  SERVE_ZONE: 1 / 3,        // serving off the full bar
  SERVE_ZONE_QUICK: 1 / 2,  // serving off the short bar, already harder
  QUICK_CHARGE: 0.38,       // short bar: reaches its sweet spot in about half
                            // the time of a full drive
  QUICK_POWER: 0.50,        // and can never hit anywhere near a drive's pace
  MIN_HOLD: 0.045,          // taps below this are treated as a quick block
};

export const RULES = {
  POINTS_TO_WIN: 11,
  WIN_BY: 2,
  DOUBLE_BOUNCE_SHOTS: 2,   // serve + return must both bounce
};

// Shot archetypes produced by the swing system.
export const SHOT = {
  DRIVE: 'drive',
  DINK: 'dink',
  VOLLEY: 'volley',
  LOB: 'lob',
  DROP: 'drop',
  SERVE: 'serve',
  SMASH: 'smash',
};

export const QUALITY = {
  PERFECT: 'perfect',
  GOOD: 'good',
  OK: 'ok',
  WEAK: 'weak',
  WHIFF: 'whiff',
};

export const QUALITY_POWER = {
  perfect: 1.0,
  good: 0.88,
  ok: 0.71,
  weak: 0.48,
  whiff: 0.0,
};

// Aim scatter in metres at the target, before character control is applied.
export const QUALITY_SCATTER = {
  perfect: 0.0,
  good: 0.28,
  ok: 0.85,
  weak: 2.1,
  whiff: 0.0,
};
