import {
  COURT, BALL, FENCE, PLAY, RULES, SHOT, QUALITY, SWING_MODE,
} from './constants.js';
import { getCharacter } from './characters.js';
import { netHeightAt, solveToLand, clampSpeed, speedOf } from './ballistics.js';
import { mulberry32, randDisc } from './rng.js';

// Flight-time envelopes per shot archetype. Power squeezes the flight time
// toward the minimum, which is what makes a well-timed drive feel fast.
const FLIGHT = {
  [SHOT.DRIVE]:  { base: 1.32, min: 0.70, spin:  1.00 },
  [SHOT.SMASH]:  { base: 0.70, min: 0.34, spin:  1.35 },
  [SHOT.VOLLEY]: { base: 1.02, min: 0.64, spin:  0.55 },
  [SHOT.DINK]:   { base: 1.06, min: 0.80, spin: -0.60 },
  [SHOT.DROP]:   { base: 1.38, min: 1.00, spin: -0.90 },
  [SHOT.LOB]:    { base: 2.15, min: 1.60, spin: -0.30 },
  [SHOT.SERVE]:  { base: 1.38, min: 0.95, spin:  0.20 },
};

const NET_CLEARANCE = {
  [SHOT.DRIVE]: 0.11, [SHOT.SMASH]: 0.06, [SHOT.VOLLEY]: 0.10,
  [SHOT.DINK]: 0.17, [SHOT.DROP]: 0.20, [SHOT.LOB]: 0.55,
  [SHOT.SERVE]: 0.22,
};

export const PHASE = { SERVE: 'serve', RALLY: 'rally', POINT: 'point', GAMEOVER: 'gameover' };
export const SWINGSTATE = { IDLE: 0, WINDUP: 1, ACTIVE: 2, RECOVER: 3 };

function sideOf(team) { return team === 0 ? -1 : 1; }

export class Sim {
  constructor(config = {}) {
    this.config = {
      mode: config.mode || 'singles',
      scoring: config.scoring || 'rally',
      pointsToWin: config.pointsToWin || RULES.POINTS_TO_WIN,
      winBy: config.winBy ?? RULES.WIN_BY,
      seed: config.seed || 1234,
      players: config.players || [],
    };
    this.rand = mulberry32(this.config.seed);
    this.events = [];
    this.ballHistory = [];
    this.reset();
  }

  reset() {
    const cfg = this.config;
    this.tick = 0;
    this.time = 0;
    this.phase = PHASE.SERVE;
    this.phaseT = 0;
    this.score = [0, 0];
    this.serveTeam = 0;
    this.winner = -1;
    this.rallyShots = 0;

    this.players = cfg.players.map((p, i) => {
      const ch = getCharacter(p.charId);
      const team = p.team ?? (i % 2);
      return {
        idx: i,
        id: p.id,
        name: p.name || 'P' + (i + 1),
        charId: ch.id,
        bot: !!p.bot,
        difficulty: p.difficulty ?? 0.6,
        netRec: p.netRec || null,
        team,
        side: sideOf(team),
        x: 0, z: sideOf(team) * (COURT.HALF_L - 0.6),
        vx: 0, vz: 0,
        facing: sideOf(team) > 0 ? Math.PI : 0,
        stamina: PLAY.STAMINA_MAX,
        dashT: 0, dashCd: 0, dashDx: 0, dashDz: 0,
        swingState: SWINGSTATE.IDLE,
        swingT: 0,
        swingSide: 1,
        pending: null,
        charging: false,
        chargeVis: 0,
        lastContact: -99,
        speed: ch.stats.speed,
        reach: PLAY.REACH_BASE * ch.stats.reach,
        // Reach is both: a long player covers wide balls and high ones. Body
        // scale contributes but is damped, otherwise a tall character with a
        // high reach stat compounds into an unreachable advantage overhead.
        reachY: PLAY.REACH_HEIGHT * (0.55 + 0.45 * ch.build.scale) * ch.stats.reach,
        scale: ch.build.scale,
        anim: { lean: 0, swing: 0, run: 0 },
      };
    });

    this.ball = {
      p: { x: 0, y: 1, z: 0 }, v: { x: 0, y: 0, z: 0 },
      spin: 0, sideSpin: 0,
      live: false, held: true,
      lastHit: -1, lastTeam: -1,
      shotCount: 0, bouncesSinceHit: 0, bounceInKitchen: false,
    };
    this.ballHistory.length = 0;
    this.setupServe();
  }

  // ---- serving -----------------------------------------------------------

  teamPlayers(team) { return this.players.filter((p) => p.team === team); }

  serverIndex() {
    const team = this.serveTeam;
    const list = this.teamPlayers(team);
    if (list.length === 0) return 0;
    if (list.length === 1) return list[0].idx;
    // In doubles the two partners alternate as the score advances.
    return list[this.score[team] % 2 === 0 ? 0 : 1].idx;
  }

  // Server stands right when their score is even, the standard convention.
  serveFromRight() { return this.score[this.serveTeam] % 2 === 0; }

  setupServe() {
    const srv = this.serverIndex();
    const server = this.players[srv];
    const side = server.side;
    // Facing +z, right hand side is +x; facing -z it flips.
    const rightX = side < 0 ? 1 : -1;
    const sx = (this.serveFromRight() ? rightX : -rightX) * (COURT.HALF_W * 0.5);

    this.serverIdx = srv;
    this.serveTargetXSign = -Math.sign(sx) || 1;

    for (const p of this.players) {
      p.vx = 0; p.vz = 0;
      p.charging = false; p.chargeVis = 0;
      p.swingState = SWINGSTATE.IDLE; p.swingT = 0; p.pending = null;
      p.dashT = 0;
      p.stamina = Math.min(PLAY.STAMINA_MAX, p.stamina + 30);
      p.facing = p.side > 0 ? Math.PI : 0;
    }
    server.x = sx;
    server.z = side * (COURT.HALF_L + 0.45);

    const recvTeam = 1 - this.serveTeam;
    const recvList = this.teamPlayers(recvTeam);
    const recvSide = sideOf(recvTeam);
    const wantX = this.serveTargetXSign * (COURT.HALF_W * 0.5);
    let receiver = recvList[0];
    if (recvList.length > 1) {
      receiver = recvList[this.score[recvTeam] % 2 === 0 ? 0 : 1];
      const partner = recvList.find((p) => p !== receiver);
      partner.x = -wantX;
      partner.z = recvSide * (COURT.KITCHEN + 0.35);
    }
    if (receiver) {
      receiver.x = wantX;
      receiver.z = recvSide * (COURT.HALF_L - 0.25);
    }

    if (this.config.mode === 'doubles') {
      const srvList = this.teamPlayers(this.serveTeam);
      const partner = srvList.find((p) => p !== server);
      if (partner) { partner.x = -sx; partner.z = side * (COURT.HALF_L - 0.4); }
    }

    const b = this.ball;
    b.held = true; b.live = false;
    b.p.x = sx - side * 0.08; b.p.y = 0.95; b.p.z = server.z - side * 0.25;
    b.v.x = 0; b.v.y = 0; b.v.z = 0;
    b.spin = 0; b.sideSpin = 0;
    b.lastHit = -1; b.lastTeam = -1;
    b.shotCount = 0; b.bouncesSinceHit = 0; b.bounceInKitchen = false;
    this.rallyShots = 0;
    this.phase = PHASE.SERVE;
    this.phaseT = 0;
    this.emit({ type: 'serveSetup', idx: srv, right: this.serveFromRight() });
  }

  // ---- public API --------------------------------------------------------

  emit(e) { this.events.push(e); }
  drainEvents() { const e = this.events; this.events = []; return e; }

  queueSwing(idx, payload) {
    const p = this.players[idx];
    if (!p) return false;
    if (p.swingState !== SWINGSTATE.IDLE) return false;
    if (this.phase === PHASE.POINT || this.phase === PHASE.GAMEOVER) return false;
    if (this.phase === PHASE.SERVE && idx !== this.serverIdx) return false;
    p.pending = payload;
    p.swingState = SWINGSTATE.WINDUP;
    p.swingT = 0;
    p.charging = false;
    p.chargeVis = 0;
    p.swingSide = (this.ball.p.x - p.x) * (p.side < 0 ? 1 : -1) >= 0 ? 1 : -1;
    // Remember which shot this swing was aimed at. If somebody else gets to
    // the ball first the swing is abandoned rather than becoming a stale
    // paddle that fouls the next shot -- which matters a lot in doubles.
    p.pending.atShot = this.ball.shotCount;
    this.emit({ type: 'swingStart', idx, shot: payload.shot });
    return true;
  }

  // Ball position some seconds in the past, for lag compensation on the host.
  ballAtRewind(dt) {
    if (dt <= 0 || this.ballHistory.length === 0) return this.ball.p;
    const target = this.time - dt;
    for (let i = this.ballHistory.length - 1; i >= 0; i--) {
      if (this.ballHistory[i].t <= target) return this.ballHistory[i].p;
    }
    return this.ballHistory[0].p;
  }

  // ---- stepping ----------------------------------------------------------

  step(dt, inputs) {
    this.time += dt;
    this.tick++;

    for (const p of this.players) this.stepPlayer(p, dt, inputs[p.idx] || {});

    if (this.phase === PHASE.SERVE) {
      const s = this.players[this.serverIdx];
      // Keep the held ball glued to the server paddle.
      this.ball.p.x = s.x - s.side * 0.08;
      this.ball.p.y = 0.95;
      this.ball.p.z = s.z - s.side * 0.30;
    } else if (this.phase === PHASE.RALLY) {
      this.stepBall(dt);
    } else if (this.phase === PHASE.POINT) {
      this.phaseT += dt;
      if (this.ball.live) this.stepBall(dt, true);
      if (this.phaseT >= PLAY.SERVE_RESET) {
        if (this.winner >= 0) this.phase = PHASE.GAMEOVER;
        else this.setupServe();
      }
    }

    for (const p of this.players) this.resolveSwing(p, dt);

    this.ballHistory.push({
      t: this.time,
      p: { x: this.ball.p.x, y: this.ball.p.y, z: this.ball.p.z },
    });
    while (this.ballHistory.length > 64) this.ballHistory.shift();
  }

  stepPlayer(p, dt, inp) {
    if (p.dashCd > 0) p.dashCd -= dt;
    if (p.dashT > 0) {
      p.dashT -= dt;
      p.vx = p.dashDx * PLAY.DASH_SPEED * p.speed;
      p.vz = p.dashDz * PLAY.DASH_SPEED * p.speed;
    } else {
      let mx = inp.mx || 0, mz = inp.mz || 0;
      const m = Math.hypot(mx, mz);
      if (m > 1) { mx /= m; mz /= m; }
      const maxV = 6.35 * p.speed * (p.swingState === SWINGSTATE.IDLE ? 1 : 0.55)
                 * (p.charging ? 0.74 : 1);
      const tx = mx * maxV, tz = mz * maxV;
      // Reversing direction gets extra bite so quick changes feel responsive.
      const rev = (tx * p.vx + tz * p.vz) < 0 ? PLAY.TURN_ASSIST : 1;
      const a = (m > 0.01 ? PLAY.ACCEL * rev : PLAY.DECEL) * dt;
      p.vx += Math.max(-a, Math.min(a, tx - p.vx));
      p.vz += Math.max(-a, Math.min(a, tz - p.vz));
      if (m < 0.01 && Math.hypot(p.vx, p.vz) < 0.12) { p.vx = 0; p.vz = 0; }

      if (inp.dash && p.dashCd <= 0 && p.stamina >= PLAY.DASH_COST && m > 0.01) {
        p.dashT = PLAY.DASH_TIME;
        p.dashCd = PLAY.DASH_CD;
        p.stamina -= PLAY.DASH_COST;
        p.dashDx = mx; p.dashDz = mz;
        this.emit({ type: 'dash', idx: p.idx });
      }
    }
    p.stamina = Math.min(PLAY.STAMINA_MAX, p.stamina + PLAY.STAMINA_REGEN * dt);

    p.x += p.vx * dt;
    p.z += p.vz * dt;

    // Court bounds: never cross the net, never wander too far out.
    const minZ = (this.phase === PHASE.SERVE && p.idx === this.serverIdx)
      ? COURT.HALF_L + 0.05 : 0.22;
    if (p.side < 0) p.z = Math.max(-(COURT.HALF_L + COURT.RUNOFF), Math.min(-minZ, p.z));
    else p.z = Math.min(COURT.HALF_L + COURT.RUNOFF, Math.max(minZ, p.z));
    const maxX = COURT.HALF_W + COURT.RUNOFF;
    p.x = Math.max(-maxX, Math.min(maxX, p.x));

    const dx = this.ball.p.x - p.x, dz = this.ball.p.z - p.z;
    const want = Math.atan2(dx, dz);
    let d = want - p.facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    p.facing += d * Math.min(1, dt * 11);

    // Keep the forehand/backhand read live while idle, so the floating paddle
    // sits on the correct side before the swing is committed.
    if (p.swingState === SWINGSTATE.IDLE) {
      p.swingSide = (this.ball.p.x - p.x) * (p.side < 0 ? 1 : -1) >= 0 ? 1 : -1;
    }
    p.charging = !!inp.charging && p.swingState === SWINGSTATE.IDLE;
    p.chargeVis = inp.chargeVis || 0;
    p.anim.run = Math.hypot(p.vx, p.vz);
  }

  inKitchen(p) {
    return Math.abs(p.z) < COURT.KITCHEN + PLAY.PLAYER_R * 0.5 && p.z * p.side > 0;
  }

  // ---- ball --------------------------------------------------------------

  stepBall(dt, afterPoint = false) {
    const b = this.ball;
    if (!b.live) return;
    const sp = speedOf(b.v);
    const steps = Math.max(1, Math.min(PLAY.MAX_SUBSTEPS, Math.ceil((sp * dt) / 0.09)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) this.substepBall(h, afterPoint);
  }

  substepBall(dt, afterPoint) {
    const b = this.ball;
    const prevZ = b.p.z;
    const prevY = b.p.y;

    const s = speedOf(b.v);
    const drag = BALL.DRAG * s;
    const hsp = Math.hypot(b.v.x, b.v.z);
    b.v.x += (-drag * b.v.x + BALL.MAGNUS * b.sideSpin * hsp) * dt;
    b.v.z += -drag * b.v.z * dt;
    b.v.y += (BALL.GRAVITY - drag * b.v.y - BALL.MAGNUS * b.spin * hsp) * dt;
    b.spin *= Math.pow(BALL.SPIN_DECAY, dt);
    b.sideSpin *= Math.pow(BALL.SPIN_DECAY, dt);

    b.p.x += b.v.x * dt;
    b.p.y += b.v.y * dt;
    b.p.z += b.v.z * dt;

    // Net plane crossing
    if (prevZ * b.p.z < 0) {
      const f = prevZ / (prevZ - b.p.z);
      const xAt = b.p.x - b.v.x * dt * (1 - f);
      const yAt = prevY + (b.p.y - prevY) * f;
      if (Math.abs(xAt) <= COURT.HALF_W + 0.06 && yAt < netHeightAt(xAt)) {
        b.p.z = prevZ * 0.06;
        b.v.z *= -BALL.NET_REST;
        b.v.x *= 0.34;
        b.v.y *= 0.30;
        b.spin *= 0.2;
        this.emit({ type: 'net', pos: { x: xAt, y: yAt, z: 0 } });
      }
    }

    // Ground
    if (b.p.y <= BALL.R && b.v.y < 0) {
      b.p.y = BALL.R;
      b.v.y = -b.v.y * BALL.REST_Y;
      const kick = BALL.SPIN_TO_VEL * b.spin * hsp;
      const dirx = hsp > 0.01 ? b.v.x / hsp : 0;
      const dirz = hsp > 0.01 ? b.v.z / hsp : 0;
      b.v.x = b.v.x * BALL.FRICTION + dirx * kick;
      b.v.z = b.v.z * BALL.FRICTION + dirz * kick;
      b.v.x += b.sideSpin * 0.4;
      b.spin *= 0.35;
      b.sideSpin *= 0.4;
      if (!afterPoint) this.onBounce();
      else if (Math.abs(b.v.y) > 1.2) {
        // Keep the dead ball alive for looks, but do not spam tiny bounces.
        this.emit({
          type: 'bounce',
          pos: { x: b.p.x, y: b.p.y, z: b.p.z }, inBounds: true, dead: true,
        });
      }
      if (Math.abs(b.v.y) < 0.9 && Math.hypot(b.v.x, b.v.z) < BALL.DEAD_SPEED * 1.8) {
        b.live = false;
      }
    }

    // Perimeter fence. Below the rail it is caught and dies at the foot of the
    // fence; above it the ball clears and is gone.
    if (b.p.y < FENCE.H) {
      if (Math.abs(b.p.x) > FENCE.X) {
        b.p.x = Math.sign(b.p.x) * FENCE.X;
        b.v.x *= -FENCE.REST;
        b.v.y *= 0.55; b.v.z *= 0.55;
        this.emit({ type: 'fence', pos: { x: b.p.x, y: b.p.y, z: b.p.z } });
      }
      if (Math.abs(b.p.z) > FENCE.Z) {
        b.p.z = Math.sign(b.p.z) * FENCE.Z;
        b.v.z *= -FENCE.REST;
        b.v.y *= 0.55; b.v.x *= 0.55;
        this.emit({ type: 'fence', pos: { x: b.p.x, y: b.p.y, z: b.p.z } });
      }
    }

    if (Math.abs(b.p.x) > 60 || Math.abs(b.p.z) > 60) b.live = false;
  }

  inBounds(x, z) {
    const t = COURT.LINE_W * 0.5 + BALL.R;
    return Math.abs(x) <= COURT.HALF_W + t && Math.abs(z) <= COURT.HALF_L + t;
  }

  inServiceBox(x, z, side, xSign) {
    const t = COURT.LINE_W * 0.5 + BALL.R;
    if (Math.sign(z) !== side) return false;
    if (Math.abs(z) < COURT.KITCHEN - t) return false;
    if (Math.abs(z) > COURT.HALF_L + t) return false;
    if (Math.abs(x) > COURT.HALF_W + t) return false;
    return Math.sign(x) === xSign || Math.abs(x) < t;
  }

  onBounce() {
    const b = this.ball;
    const x = b.p.x, z = b.p.z;
    const side = Math.sign(z) || 1;
    const good = this.inBounds(x, z);
    b.bouncesSinceHit++;
    // A ball that lands in the kitchen may only be sent back soft.
    b.bounceInKitchen = Math.abs(z) < COURT.KITCHEN;
    this.emit({ type: 'bounce', pos: { x, y: b.p.y, z }, inBounds: good, side });

    const hitterTeam = b.lastTeam;
    if (hitterTeam < 0) return;
    const hitterSide = sideOf(hitterTeam);

    // Landed back on the hitter's own half: it never got over the net.
    if (side === hitterSide) {
      this.awardPoint(1 - hitterTeam, good ? 'Into the net' : 'Out');
      return;
    }

    // The serve is judged on its first bounce only. Where it goes after that
    // is ordinary rally play.
    if (b.shotCount === 1 && b.bouncesSinceHit === 1) {
      const recvSide = sideOf(1 - this.serveTeam);
      if (!this.inServiceBox(x, z, recvSide, this.serveTargetXSign)) {
        this.awardPoint(1 - this.serveTeam, 'Serve out');
      }
      return;
    }

    // Two bounces on the receiving side ends the rally, regardless of where
    // the second one lands -- so this has to be checked before the line call.
    if (b.bouncesSinceHit >= 2) {
      this.awardPoint(hitterTeam, 'Double bounce');
      return;
    }

    if (!good) this.awardPoint(1 - hitterTeam, 'Out');
  }

  awardPoint(team, reason) {
    if (this.phase === PHASE.POINT || this.phase === PHASE.GAMEOVER) return;
    let scored = false;
    if (this.config.scoring === 'sideout') {
      if (team === this.serveTeam) { this.score[team]++; scored = true; }
      else this.serveTeam = team;
    } else {
      this.score[team]++; scored = true;
      this.serveTeam = team;
    }
    const a = this.score[0], bs = this.score[1];
    const lead = Math.abs(a - bs);
    const top = Math.max(a, bs);
    if (top >= this.config.pointsToWin && lead >= this.config.winBy) {
      this.winner = a > bs ? 0 : 1;
    }
    this.phase = PHASE.POINT;
    this.phaseT = 0;
    for (const p of this.players) { p.charging = false; p.pending = null; }
    this.emit({
      type: 'point', team, reason, scored,
      score: [this.score[0], this.score[1]],
      serveTeam: this.serveTeam, winner: this.winner,
      rallyShots: this.rallyShots,
    });
    if (this.winner >= 0) {
      this.emit({ type: 'game', winner: this.winner, score: [this.score[0], this.score[1]] });
    }
  }

  // ---- swing resolution --------------------------------------------------

  canReach(p, bp) {
    if (bp.y > p.reachY) return false;
    if (bp.y < 0.03) return false;
    const dx = bp.x - p.x, dz = bp.z - p.z;
    const horiz = Math.hypot(dx, dz);
    // High balls are harder to get a paddle on at full stretch.
    const shrink = 1 - 0.26 * Math.max(0, (bp.y - 0.95) / 0.85);
    return horiz <= p.reach * shrink;
  }

  resolveSwing(p, dt) {
    if (p.swingState === SWINGSTATE.IDLE) return;
    p.swingT += dt;
    p.anim.swing = p.swingT;

    if (p.swingState === SWINGSTATE.WINDUP) {
      if (p.swingT >= PLAY.SWING_WINDUP) {
        p.swingState = SWINGSTATE.ACTIVE;
        p.swingT = 0;
      }
      return;
    }

    if (p.swingState === SWINGSTATE.ACTIVE) {
      const hit = this.tryContact(p);
      if (hit || p.swingT >= PLAY.SWING_ACTIVE) {
        if (!hit && this.phase !== PHASE.SERVE) this.emit({ type: 'whiff', idx: p.idx });
        p.swingState = SWINGSTATE.RECOVER;
        p.swingT = 0;
        if (!hit) p.pending = null;
      }
      return;
    }

    if (p.swingT >= PLAY.SWING_RECOVER) {
      p.swingState = SWINGSTATE.IDLE;
      p.swingT = 0;
    }
  }

  tryContact(p) {
    const b = this.ball;
    const pend = p.pending;
    if (!pend) return false;

    if (this.phase === PHASE.SERVE) {
      if (p.idx !== this.serverIdx) return false;
      this.launch(p, pend, { x: b.p.x, y: b.p.y, z: b.p.z }, true);
      return true;
    }

    if (this.phase !== PHASE.RALLY) return false;
    if (!b.live) return false;
    if (pend.atShot !== undefined && pend.atShot !== b.shotCount) {
      p.pending = null; // somebody already played this ball
      return false;
    }
    if (b.bouncesSinceHit >= 2) return false;
    if (b.lastHit === p.idx && b.bouncesSinceHit === 0) return false; // no double hit
    if (b.p.z * p.side < -0.18) return false; // ball is on the other side

    let contact = null;
    if (this.canReach(p, b.p)) contact = { x: b.p.x, y: b.p.y, z: b.p.z };
    else if (pend.rewind > 0) {
      const old = this.ballAtRewind(pend.rewind);
      if (this.canReach(p, old)) contact = { x: b.p.x, y: b.p.y, z: b.p.z };
    }
    if (!contact) return false;

    const beforeBounce = b.bouncesSinceHit === 0;

    // Kitchen rule: no volleying from inside the non-volley zone.
    if (beforeBounce && this.inKitchen(p)) {
      this.emit({ type: 'fault', idx: p.idx, reason: 'Kitchen volley' });
      this.awardPoint(1 - p.team, 'Kitchen volley');
      return true;
    }

    // Two-bounce rule: the serve and the return must both bounce first.
    if (beforeBounce && b.shotCount < RULES.DOUBLE_BOUNCE_SHOTS + 1) {
      this.emit({ type: 'fault', idx: p.idx, reason: 'Must bounce' });
      this.awardPoint(1 - p.team, 'Two-bounce rule');
      return true;
    }

    this.launch(p, pend, contact, false, beforeBounce);
    return true;
  }

  launch(p, pend, contact, isServe, beforeBounce = false) {
    const b = this.ball;
    const oppSide = -p.side;
    const kitchenBounce = b.bounceInKitchen;
    const shot = pend.shot || (isServe ? SHOT.SERVE : SHOT.DRIVE);
    const env = FLIGHT[shot] || FLIGHT[SHOT.DRIVE];

    const power = Math.max(0, Math.min(1.45, pend.power ?? 0.6));
    const scatter = Math.max(0, pend.scatter ?? 0.5);
    const quality = pend.quality || QUALITY.OK;

    // The aim point is taken as given, serve or not. A serve used to be forced
    // into the diagonal box, which made aiming it decorative and meant a serve
    // could never actually be missed -- now placing it is the player's job and
    // the service-box check on the first bounce is a real rule again.
    let tx = pend.ax ?? 0;
    let tz = pend.az ?? oppSide * (COURT.HALF_L * 0.6);
    tx = Math.max(-(COURT.HALF_W + 0.55), Math.min(COURT.HALF_W + 0.55, tx));
    tz = oppSide * Math.max(0.55, Math.min(COURT.HALF_L + 0.7, Math.abs(tz)));

    // Mistimed shots fall short as well as wide, which is what gets punished.
    if (quality === QUALITY.WEAK) { tz *= 0.74; tx *= 0.9; }

    if (scatter > 0) {
      const off = randDisc(this.rand, scatter);
      tx += off.x;
      tz += off.z * 1.35;
      // Scatter must never push the aim back over the net -- a mistimed shot
      // still travels forward, it just lands somewhere worse. Re-clamp after
      // the roll so bad timing costs you depth and width, not direction.
      tx = Math.max(-(COURT.HALF_W + 1.5), Math.min(COURT.HALF_W + 1.5, tx));
      tz = oppSide * Math.max(0.35, Math.min(COURT.HALF_L + 1.7, Math.abs(tz)));
    }

    const from = {
      x: contact.x,
      y: Math.max(0.30, Math.min(2.3, contact.y)),
      z: contact.z + oppSide * 0.06,
    };

    let T = Math.max(env.min, env.base - (env.base - env.min) * Math.min(1, power));
    // Mistimed contact floats the ball. Sitting it up is what turns a bad
    // touch into an attackable ball for the opponent, so the timing bars
    // matter beyond raw pace.
    if (quality === QUALITY.WEAK) T *= 1.45;
    else if (quality === QUALITY.OK) T *= 1.13;
    const spin = env.spin * (0.55 + 0.6 * Math.min(1, power));
    const clearance = NET_CLEARANCE[shot] ?? 0.12;

    // A well-struck ball finds the arc that clears the net; a mistimed one does not.
    const allowLoft = quality !== QUALITY.WEAK;
    // A ball that bounced in your kitchen can only be lifted back over with a
    // soft shot. Trying to drive one buries it in the net -- which is what
    // happens in life too when you swing hard on a ball at your feet.
    const drivingOffKitchen = !beforeBounce && kitchenBounce
      && pend.mode === SWING_MODE.DRIVE;

    let v;
    if (drivingOffKitchen) {
      const NET_T = 0.24;
      const aimY = netHeightAt(from.x) * 0.5;
      v = {
        x: (from.x * 0.9 - from.x) / NET_T,
        y: (aimY - from.y) / NET_T - 0.5 * BALL.GRAVITY * NET_T,
        z: (0 - from.z) / NET_T,
      };
    } else {
      v = solveToLand(from, { x: tx, z: tz }, T, spin, clearance, allowLoft).v;
    }
    clampSpeed(v, BALL.MAX_SPEED);

    b.p.x = from.x; b.p.y = from.y; b.p.z = from.z;
    b.v.x = v.x; b.v.y = v.y; b.v.z = v.z;
    b.spin = spin;
    b.sideSpin = (pend.side ?? 0) * 0.6;
    b.live = true; b.held = false;
    b.lastHit = p.idx; b.lastTeam = p.team;
    b.bouncesSinceHit = 0;
    b.bounceInKitchen = false;
    b.shotCount++;
    this.rallyShots++;
    p.lastContact = this.time;
    p.pending = null;

    if (isServe) { this.phase = PHASE.RALLY; this.phaseT = 0; }

    this.emit({
      type: 'hit', idx: p.idx, shot, quality,
      power: Math.min(1, power), speed: speedOf(v),
      pos: { x: from.x, y: from.y, z: from.z },
      target: { x: tx, z: tz },
      beforeBounce,
      illegalDrive: drivingOffKitchen,
    });
  }

  // ---- snapshots ---------------------------------------------------------

  // Field names are deliberately short and must not collide with the network
  // envelope keys (`t` is the message type on the wire), hence `tm` for time.
  snapshot() {
    return {
      k: this.tick, tm: this.time, ph: this.phase, pt: this.phaseT,
      sc: [this.score[0], this.score[1]], st: this.serveTeam, si: this.serverIdx,
      sx: this.serveTargetXSign, w: this.winner, rs: this.rallyShots,
      b: {
        p: [this.ball.p.x, this.ball.p.y, this.ball.p.z],
        v: [this.ball.v.x, this.ball.v.y, this.ball.v.z],
        s: this.ball.spin, ss: this.ball.sideSpin,
        l: this.ball.live ? 1 : 0, h: this.ball.held ? 1 : 0,
        lh: this.ball.lastHit, lt: this.ball.lastTeam,
        sh: this.ball.shotCount, bb: this.ball.bouncesSinceHit,
      },
      p: this.players.map((p) => ([
        p.x, p.z, p.vx, p.vz, p.facing, p.stamina,
        p.swingState, p.swingT, p.charging ? 1 : 0, p.chargeVis, p.dashT,
      ])),
    };
  }

  restore(s) {
    this.tick = s.k; this.time = s.tm; this.phase = s.ph; this.phaseT = s.pt;
    this.score = [s.sc[0], s.sc[1]]; this.serveTeam = s.st; this.serverIdx = s.si;
    this.serveTargetXSign = s.sx; this.winner = s.w; this.rallyShots = s.rs;
    const b = this.ball;
    b.p.x = s.b.p[0]; b.p.y = s.b.p[1]; b.p.z = s.b.p[2];
    b.v.x = s.b.v[0]; b.v.y = s.b.v[1]; b.v.z = s.b.v[2];
    b.spin = s.b.s; b.sideSpin = s.b.ss;
    b.live = !!s.b.l; b.held = !!s.b.h;
    b.lastHit = s.b.lh; b.lastTeam = s.b.lt;
    b.shotCount = s.b.sh; b.bouncesSinceHit = s.b.bb;
    for (let i = 0; i < this.players.length && i < s.p.length; i++) {
      const p = this.players[i], a = s.p[i];
      p.x = a[0]; p.z = a[1]; p.vx = a[2]; p.vz = a[3]; p.facing = a[4];
      p.stamina = a[5]; p.swingState = a[6]; p.swingT = a[7];
      p.charging = !!a[8]; p.chargeVis = a[9]; p.dashT = a[10];
    }
  }
}
