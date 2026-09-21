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

export const BALL = {
  R: 0.0365,
  GRAVITY: -16.5,       // heavier than real gravity: arcade snap
  DRAG: 0.0115,         // quadratic drag coefficient
  MAGNUS: 0.055,        // spin -> lateral/vertical force
  SPIN_DECAY: 0.72,     // per second
  REST_Y: 0.615,        // vertical restitution off the court
  FRICTION: 0.80,       // horizontal damping on bounce
  SPIN_TO_VEL: 0.16,    // spin converted to horizontal velocity on bounce
  NET_REST: 0.22,       // how dead the net is
  MAX_SPEED: 42,
  DEAD_SPEED: 0.9,      // below this after enough bounces the rally is over
};

export const PLAY = {
  TICK: 1 / 60,
  MAX_SUBSTEPS: 6,
  PLAYER_R: 0.36,
  PLAYER_H: 1.72,
  ACCEL: 46,
  DECEL: 38,
  TURN_ASSIST: 1.9,     // extra accel when reversing direction
  DASH_SPEED: 13.5,
  DASH_TIME: 0.17,
  DASH_CD: 0.85,
  DASH_COST: 34,
  STAMINA_MAX: 100,
  STAMINA_REGEN: 26,
  REACH_BASE: 1.32,     // paddle reach radius from player centre
  REACH_HEIGHT: 2.25,   // highest ball a player can reach
  SWING_WINDUP: 0.055,  // delay between release and the paddle being live
  SWING_ACTIVE: 0.14,   // how long contact stays live
  SWING_RECOVER: 0.20,  // cooldown after a swing
  SERVE_RESET: 1.15,    // pause between points
};

// Charge / timing mini-game tuning.
export const SWING = {
  CHARGE_TIME: 0.78,        // seconds for the power bar to fill (drive)
  OVERCHARGE: 0.26,         // grace after full before the shot fizzles
  DRIVE_SWEET_LO: 0.775,    // sweet band on the power bar
  DRIVE_SWEET_HI: 0.945,
  DRIVE_PERFECT_W: 0.055,   // perfect band, centred in the sweet zone
  DINK_CYCLE: 0.60,         // seconds for the needle to cross the bar and back
  DINK_SWEET_W: 0.185,      // width of the sweet zone (0..1 of the bar)
  DINK_PERFECT_W: 0.072,
  MIN_HOLD: 0.045,          // taps below this are treated as a quick block
};

export const RULES = {
  POINTS_TO_WIN: 11,
  WIN_BY: 2,
  DOUBLE_BOUNCE_SHOTS: 2,   // serve + return must both bounce
};

export const SIDE = { A: -1, B: 1 };

// Shot archetypes produced by the swing system.
export const SHOT = {
  DRIVE: 'drive',
  DINK: 'dink',
  VOLLEY: 'volley',
  LOB: 'lob',
  DROP: 'drop',
  SERVE: 'serve',
  BLOCK: 'block',
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
