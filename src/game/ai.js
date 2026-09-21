import { COURT, PLAY, SWING, SHOT } from './constants.js';
import { PHASE, SWINGSTATE } from './sim.js';
import { getCharacter, swingTuning } from './characters.js';
import {
  MODE, createSwingState, beginSwing, updateSwing, releaseSwing, classifyShot,
  lobBonus,
} from './swing.js';

// The paddle goes live SWING_WINDUP after release and stays live for
// SWING_ACTIVE. Firing this far ahead of contact centres that window on the
// ball, which is the whole trick to making the bot connect cleanly.
const CONTACT_LEAD = PLAY.SWING_WINDUP + PLAY.SWING_ACTIVE * 0.45;

// Difficulty 0..1 scales how tightly the bot hits the timing windows, how
// early it reads the ball, and how well it covers the court.
export function createBotState(difficulty = 0.6) {
  return {
    difficulty,
    sw: createSwingState(),
    mode: MODE.DRIVE,
    committed: false,
    startBias: 0,
    target: { x: 0, z: 0 },
    intercept: null,
    soft: false,
    leadAtStart: 0.42,
    reactionT: 0,
    lastShotSeen: -1,
    reactDelay: 0,
    posErr: { x: 0, z: 0 },
    heldGoal: null,
    idleJitter: Math.random() * 6.283,
  };
}

// Walk the ball forward and find when it first becomes playable for this bot.
function predictArrival(sim, p) {
  const b = sim.ball;
  if (!b.live) return null;
  const sign = p.side;
  let x = b.p.x, y = b.p.y, z = b.p.z;
  let vx = b.v.x, vy = b.v.y, vz = b.v.z;
  let spin = b.spin;
  const dt = 1 / 90;
  let t = 0;
  let bounced = b.bouncesSinceHit;
  let firstLanding = null;

  while (t < 3.0) {
    const sp = Math.hypot(vx, vy, vz);
    const d = 0.0115 * sp;
    const hsp = Math.hypot(vx, vz);
    vx += -d * vx * dt;
    vz += -d * vz * dt;
    vy += (-16.5 - d * vy - 0.055 * spin * hsp) * dt;
    x += vx * dt; y += vy * dt; z += vz * dt;
    t += dt;
    if (y <= 0.0365) {
      y = 0.0365; vy = -vy * 0.615;
      vx *= 0.8; vz *= 0.8; spin *= 0.35;
      bounced++;
      if (!firstLanding) firstLanding = { x, z, t };
      if (bounced >= 2) break;
    }
    // Playable: on our side, at a comfortable height, and legal to strike.
    // Volleys only become legal from the third shot of the rally (the serve
    // and the return must both bounce) and never from inside the kitchen.
    if (Math.sign(z) === sign && y > 0.32 && y < 1.85) {
      // The kitchen rule is about where the player's feet are, not the ball.
      // The bot sets up ~0.3m behind the ball, so that is what decides it.
      const standZ = Math.abs(z) + 0.30;
      const legalVolley = bounced > 0
        || (b.shotCount >= 3 && standZ > COURT.KITCHEN + PLAY.PLAYER_R * 0.5);
      if (legalVolley) return { t, x, y, z, bounced, landing: firstLanding };
    }
  }
  if (firstLanding) {
    return {
      t: firstLanding.t + 0.22, x: firstLanding.x, y: 0.75,
      z: firstLanding.z, bounced: 1, landing: firstLanding,
    };
  }
  return null;
}

function pickTarget(sim, p, st, aggressive) {
  const opp = sim.players.filter((o) => o.team !== p.team);
  const oppSide = -p.side;
  const d = st.difficulty;
  // Aim away from wherever the opposition is standing.
  let awayX = 0;
  if (opp.length) {
    const avg = opp.reduce((s, o) => s + o.x, 0) / opp.length;
    awayX = avg > 0 ? -1 : 1;
  }
  const spread = COURT.HALF_W * (0.42 + 0.45 * d);
  let tx = awayX * spread * (0.5 + Math.random() * 0.6);
  let tz = aggressive
    ? oppSide * (COURT.HALF_L * (0.58 + Math.random() * 0.3))
    : oppSide * (COURT.KITCHEN * (0.5 + Math.random() * 0.45));
  // Weaker bots miss their spot more.
  const noise = (1 - d) * 1.3;
  tx += (Math.random() * 2 - 1) * noise;
  tz += (Math.random() * 2 - 1) * noise * oppSide;
  tx = Math.max(-(COURT.HALF_W - 0.25), Math.min(COURT.HALF_W - 0.25, tx));
  return { x: tx, z: tz };
}

// In doubles both partners can see the same ball coming and both chase it,
// which leaves the court open and sometimes leaves nobody committed. Whoever
// is closer to the intercept calls it; the index is the tie-break so both
// sides reach the same answer.
function ballIsMine(sim, p, arrival) {
  if (!arrival) return true;
  const myD = Math.hypot(p.x - arrival.x, p.z - arrival.z);
  for (const mate of sim.players) {
    if (mate === p || mate.team !== p.team) continue;
    const d = Math.hypot(mate.x - arrival.x, mate.z - arrival.z);
    if (d < myD - 0.2) return false;
    if (Math.abs(d - myD) <= 0.2 && mate.idx < p.idx) return false;
  }
  return true;
}

// True when hitting the ball right now would be a fault.
function volleyIllegal(sim, p) {
  return sim.ball.bouncesSinceHit === 0
    && (sim.ball.shotCount < 3 || sim.inKitchen(p));
}

function fireSwing(sim, p, st, tune) {
  const res = releaseSwing(st.sw, tune);
  const beforeBounce = sim.ball.bouncesSinceHit === 0;
  const shot = classifyShot({
    mode: st.sw.mode, soft: st.soft, beforeBounce,
    ballHeight: sim.ball.p.y, netHeight: COURT.NET_H_CENTER,
    isServe: false, quality: res.quality,
  });
  sim.queueSwing(p.idx, {
    shot, mode: res.mode, power: res.power, scatter: res.scatter,
    quality: res.quality, ax: st.target.x, az: st.target.z, rewind: 0,
  });
}

export function updateBot(sim, p, st, dt) {
  const inp = { mx: 0, mz: 0, dash: false, charging: false, chargeVis: 0 };
  const ch = getCharacter(p.charId);
  const tune = swingTuning(ch);
  const d = st.difficulty;

  if (sim.phase === PHASE.POINT || sim.phase === PHASE.GAMEOVER) {
    st.sw.active = false;
    st.committed = false;
    st.reactionT = 0;
    return inp;
  }

  // ---- serving ----
  if (sim.phase === PHASE.SERVE) {
    if (p.idx !== sim.serverIdx) return inp;
    if (st.sw.active) {
      updateSwing(st.sw, dt, tune);
      inp.charging = true;
      inp.chargeVis = st.sw.t;
      // The serve has no incoming ball to time against, so the bar is
      // everything: release near the sweet band with skill-scaled error.
      const aim = 0.86 + st.startBias;
      if (st.sw.t >= aim || st.sw.overcooked) {
        const res = releaseSwing(st.sw, tune);
        sim.queueSwing(p.idx, {
          shot: SHOT.SERVE, mode: res.mode, power: res.power, scatter: res.scatter,
          quality: res.quality, ax: st.target.x, az: st.target.z, rewind: 0,
        });
        st.committed = true;
      }
    } else if (!st.committed) {
      st.reactionT += dt;
      if (st.reactionT > 0.45 + (1 - d) * 0.6) {
        beginSwing(st.sw, MODE.DRIVE, tune, Math.random, SWING.SERVE_ZONE);
        st.target = {
          x: sim.serveTargetXSign * (COURT.HALF_W * (0.35 + Math.random() * 0.5)),
          z: -p.side * (COURT.KITCHEN + 1.2 + Math.random() * 2.6),
        };
        // Scaled by the same factor the serve band was tightened by. The zone
        // size is a difficulty knob for the player; for a bot, how well it
        // serves should stay governed by its difficulty, not by how narrow the
        // band happens to be -- otherwise tightening it just makes bots inept.
        st.startBias = (Math.random() * 2 - 1)
          * ((1 - d) * 0.22 + 0.012) * SWING.SERVE_ZONE;
      }
    }
    return inp;
  }

  st.reactionT = 0;
  st.committed = false;

  // ---- positioning ----
  const arrival = predictArrival(sim, p);
  st.intercept = arrival;
  let goalX, goalZ;

  // Reading a new shot takes a moment, and the read is not perfect. This is
  // what actually limits court coverage -- without it a bot with a correct
  // trajectory solver simply never misses.
  if (sim.ball.shotCount !== st.lastShotSeen) {
    st.lastShotSeen = sim.ball.shotCount;
    // Pace is what makes a shot hard to read. Without this a 27 m/s smash was
    // tracked exactly as well as a floated dink, and put-aways came back.
    const pace = Math.min(1, Math.hypot(sim.ball.v.x, sim.ball.v.z) / 22);
    st.reactDelay = (0.085 + (1 - d) * 0.30) * (1 + pace * 0.85);
    const r = (1 - d) * 1.25 + pace * 0.6 * (1 - d * 0.45);
    const ang = Math.random() * Math.PI * 2;
    const mag = Math.sqrt(Math.random()) * r;
    st.posErr = { x: Math.cos(ang) * mag, z: Math.sin(ang) * mag };
  }
  if (st.reactDelay > 0) st.reactDelay -= dt;

  const mine = ballIsMine(sim, p, arrival);
  st.mine = mine;

  if (arrival && !mine) {
    // Partner has it: cover the other half instead of crowding them.
    const away = -(Math.sign(arrival.x) || 1);
    goalX = away * COURT.HALF_W * 0.45;
    goalZ = p.side * (COURT.KITCHEN + 0.7);
    st.heldGoal = { x: goalX, z: goalZ };
  } else if (arrival && st.reactDelay <= 0) {
    goalX = arrival.x + st.posErr.x;
    // Stand a little behind the ball so the swing has room.
    goalZ = arrival.z + p.side * 0.30 + st.posErr.z;
    st.heldGoal = { x: goalX, z: goalZ };
  } else if (st.heldGoal) {
    goalX = st.heldGoal.x;
    goalZ = st.heldGoal.z;
  } else if (arrival) {
    goalX = arrival.x;
    goalZ = arrival.z + p.side * 0.30;
  } else {
    // Recover toward the kitchen line, which is where pickleball is won.
    const push = 0.35 + d * 0.5;
    goalX = Math.sin(sim.time * 0.7 + st.idleJitter) * 0.6;
    goalZ = p.side * (COURT.KITCHEN + 0.45 + (1 - push) * 3.0);
  }
  goalZ = Math.max(0.35, Math.min(COURT.HALF_L + 1.2, Math.abs(goalZ))) * p.side;
  goalX = Math.max(-(COURT.HALF_W + 1.4), Math.min(COURT.HALF_W + 1.4, goalX));

  const dx = goalX - p.x, dz = goalZ - p.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 0.10) {
    // Ease off near the target. Without this a bot runs at full speed until it
    // is 10cm away and then overshoots, which made extra speed a liability
    // instead of an advantage -- a faster character measured as a worse one.
    const ease = Math.min(1, dist / 0.85);
    inp.mx = (dx / dist) * ease;
    inp.mz = (dz / dist) * ease;
    // Dash for balls that are genuinely out of range.
    if (dist > 2.6 && arrival && arrival.t < 0.9 && d > 0.35) inp.dash = true;
  }

  // ---- swinging ----
  if (st.sw.active) {
    updateSwing(st.sw, dt, tune);
    const lb = lobBonus(Math.max(sim.ball.peakY ?? 0, sim.ball.p.y));
    if (lb > st.sw.lobBonus) st.sw.lobBonus = lb;
    inp.charging = true;
    inp.chargeVis = st.sw.t;

    if (!arrival) {
      // The read changed -- abandon rather than swing at nothing.
      if (st.sw.held > 1.3) st.sw.active = false;
      return inp;
    }
    if (volleyIllegal(sim, p)) {
      // Hold: contacting the ball right now would hand over the point.
      if (st.sw.overcooked) st.sw.active = false;
      return inp;
    }
    if (arrival.t <= CONTACT_LEAD || st.sw.overcooked) fireSwing(sim, p, st, tune);
    return inp;
  }

  if (p.swingState === SWINGSTATE.IDLE && arrival && mine) {
    // Never start a swing that would land on an illegal volley.
    if (arrival.bounced === 0 && (sim.inKitchen(p) || sim.ball.shotCount < 3)) return inp;

    // A ball that bounces in the kitchen can only be lifted back soft; driving
    // it buries the ball in the net. The decision is made before contact, so if
    // the bounce has not happened yet this has to be read off the predicted
    // landing rather than the flag, which still describes the previous bounce.
    const alreadyBounced = sim.ball.bouncesSinceHit > 0;
    const mustDink = alreadyBounced
      ? sim.ball.bounceInKitchen
      : !!(arrival.bounced > 0 && arrival.landing
        && Math.abs(arrival.landing.z) < COURT.KITCHEN);
    const atKitchen = Math.abs(p.z) < COURT.KITCHEN + 0.85;
    st.startBias = (Math.random() * 2 - 1) * ((1 - d) * 0.32 + 0.012);

    // Begin so that the bar reaches the sweet band exactly as the ball arrives.
    // Starting early or late is what costs the bot its timing grade.
    const aim = 0.86 + st.startBias;
    const driveNeed = (aim * SWING.CHARGE_TIME) / tune.chargeRate + CONTACT_LEAD;
    const quickNeed = (aim * SWING.QUICK_CHARGE) / tune.chargeRate + CONTACT_LEAD;

    let mode;
    if (mustDink) {
      mode = MODE.QUICK;
    } else if (arrival.t > driveNeed) {
      // Plenty of warning. Occasionally take the short bar anyway, as a drop.
      if (d > 0.45 && Math.random() < 0.14) mode = MODE.QUICK;
      else return inp; // wait; the drive starts when the time is right
    } else if (arrival.t >= driveNeed - 0.06) {
      // This is the frame the drive window opens on. Take it.
      mode = MODE.DRIVE;
    } else {
      // The drive window has already gone -- the ball came too fast. A good bot
      // takes the short bar and lands a clean dink rather than forcing a
      // mistimed big shot, which is the choice the mechanic offers the player.
      mode = d > 0.4 ? MODE.QUICK : MODE.DRIVE;
    }

    const chargeNeeded = (mode === MODE.QUICK ? quickNeed : driveNeed) - CONTACT_LEAD;
    if (arrival.t <= chargeNeeded + CONTACT_LEAD) {
      beginSwing(st.sw, mode, tune);
      // Bots get the same reward for putting away a lob that a player does,
      // so throwing one up is a real risk rather than a free reset.
      st.sw.lobBonus = lobBonus(Math.max(sim.ball.peakY ?? 0, sim.ball.p.y));
      st.mode = mode;
      st.leadAtStart = arrival.t;

      // If the ball will still be sitting up above the net at contact, this is
      // an attackable ball. Previously the bot judged aggression purely by its
      // own court position, so it would smash a floater straight into the
      // kitchen -- right at an opponent standing on the line.
      const attackable = arrival.bounced === 0
        && arrival.y > COURT.NET_H_CENTER + 0.40;
      // Speed-ups keep a kitchen exchange from becoming a stalemate.
      const speedUp = !mustDink && atKitchen
        && arrival.y > COURT.NET_H_CENTER + 0.12
        && Math.random() < 0.25 + d * 0.15;

      // A good bot resets with a soft ball when it is pinned deep.
      const pinnedDeep = Math.abs(arrival.z) > COURT.HALF_L * 0.72;
      st.soft = attackable || speedUp
        ? false
        : (atKitchen ? Math.random() < 0.18 : (pinnedDeep && Math.random() < 0.3 * d));
      const aggressive = attackable || speedUp || (!st.soft && !atKitchen);
      st.target = pickTarget(sim, p, st, aggressive);
    }
  }

  return inp;
}
