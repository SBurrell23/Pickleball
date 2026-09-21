import * as THREE from '../../vendor/three.module.js';
import { COURT, PLAY, QUALITY } from './constants.js';
import { Sim, PHASE, SWINGSTATE } from './sim.js';
import { getCharacter, swingTuning } from './characters.js';
import { createBotState, updateBot } from './ai.js';
import { predictLanding } from './ballistics.js';
import {
  MODE, createSwingState, beginSwing, updateSwing, releaseSwing, sweetZone, classifyShot,
} from './swing.js';
import { buildBall, buildBallShadow, animateCrowd } from '../render/assets.js';
import { buildCharacter, animateCharacter, paddleWorldPos } from '../render/character.js';
import { Effects } from '../render/fx.js';
import { SnapshotBuffer, ErrorCorrector } from '../net/interp.js';
import { SNAPSHOT_HZ } from '../net/net.js';

const TICK = PLAY.TICK;
const MAX_CATCHUP = 5;

// How close to the kitchen you must be for the reaction meter to take over
// from the power meter.
const KITCHEN_BAND = COURT.KITCHEN + 0.85;

// Charge sparks tint toward this as the meter fills.
const SPARK_HOT = new THREE.Color(0xfff3a8);

export class Game {
  constructor({ view, hud, audio, input, settings, net, mode, court }) {
    this.view = view;
    this.court = court;
    this.hud = hud;
    this.audio = audio;
    this.input = input;
    this.settings = settings;
    this.net = net;
    this.mode = mode; // 'local' | 'host' | 'client'
    this.isAuthority = mode !== 'client';

    this.scene = view.scene;
    this.fx = new Effects(this.scene, settings);
    this.rigs = [];
    this.bots = [];
    this.accum = 0;
    this.running = false;
    this.paused = false;
    this.myIdx = 0;
    this.stats = { hits: 0, perfect: 0, longest: 0, faults: 0 };

    this.swing = createSwingState();
    this.aim = new THREE.Vector3(0, 0.02, 0);
    this.aimWorld = new THREE.Vector3();
    this._paddlePos = new THREE.Vector3();
    this._sparkColor = new THREE.Color();
    this.sparkAccum = [];
    this.lastNeedleDir = 1;

    this.snapBuf = new SnapshotBuffer();
    this.corrector = new ErrorCorrector();
    this.inputHistory = [];
    this.inputAccum = 0;
    this.snapAccum = 0;
  }

  // ---- setup -------------------------------------------------------------

  start(config, roster, myIdx) {
    this.config = config;
    this.myIdx = myIdx;
    this.sim = new Sim({ ...config, players: roster });
    this.bots = this.sim.players.map((p) =>
      (p.bot ? createBotState(p.difficulty) : null));

    this.crowd = this.court ? this.court.getObjectByName('crowd') : null;

    this.ballObj = buildBall();
    this.scene.add(this.ballObj);
    this.ballShadow = buildBallShadow();
    this.scene.add(this.ballShadow);

    for (const p of this.sim.players) {
      const rig = buildCharacter(getCharacter(p.charId));
      this.scene.add(rig);
      this.rigs.push(rig);
    }

    const me = this.sim.players[this.myIdx];
    this.view.setSide(me.side);
    this.view.snapCamera(me.x, me.z);

    // Client-side prediction state for the local player.
    if (!this.isAuthority) this.pred = { ...me };

    this.applyGlow();
    this.running = true;
    this.hud.setNames(this.teamLabel(0), this.teamLabel(1));
    this.hud.setScore(0, 0, this.sim.serveTeam, me.side);
    this.hud.message('GAME ON', 'big', 1.2);
    this.audio.countdown(true);
  }

  teamLabel(team) {
    const names = this.sim.players.filter((p) => p.team === team).map((p) => p.name);
    return names.join(' & ') || 'Team';
  }

  applyGlow() {
    const on = this.settings.get('glow');
    this.fx.pMat.blending = on ? THREE.AdditiveBlending : THREE.NormalBlending;
    this.fx.trail.material.blending = on ? THREE.AdditiveBlending : THREE.NormalBlending;
    for (const r of this.fx.rings) {
      r.mesh.material.blending = on ? THREE.AdditiveBlending : THREE.NormalBlending;
    }
    const bm = this.ballObj.userData.mesh.material;
    bm.emissiveIntensity = on ? 0.25 : 0.0;
  }

  onSettingChanged(key) {
    if (key === 'glow') this.applyGlow();
    if (key === 'crowd3d' && this.crowd) this.crowd.visible = this.settings.get('crowd3d');
  }

  dispose() {
    this.running = false;
    if (this.ballObj) this.scene.remove(this.ballObj);
    if (this.ballShadow) this.scene.remove(this.ballShadow);
    for (const r of this.rigs) this.scene.remove(r);
    this.rigs.length = 0;
  }

  // ---- local player input ------------------------------------------------

  get me() { return this.sim.players[this.myIdx]; }
  get myTuning() { return swingTuning(getCharacter(this.me.charId)); }

  // Movement is expressed from behind the player, so W is toward the net and
  // D is screen-right whichever side you are on. The camera sits at
  // z = side * (HALF_L + k) looking at the net, which flips BOTH axes relative
  // to world space -- screen-right is world x * side, screen-forward is -z * side.
  movementInput() {
    const a = this.input.axis();
    const s = this.me.side;
    return { mx: a.x * s, mz: a.z * -s };
  }

  updateAim() {
    const m = this.input.mouse;
    this.view.aimPoint(m.ndcX, m.ndcY, this.aimWorld);
    const sens = this.settings.get('aimSensitivity');
    const oppSide = -this.me.side;
    let ax = this.aimWorld.x * sens;
    let az = this.aimWorld.z;
    // Always resolve to a point on the opponent's half.
    if (Math.sign(az) !== oppSide) az = oppSide * 1.2;
    ax = Math.max(-(COURT.HALF_W + 0.5), Math.min(COURT.HALF_W + 0.5, ax));
    az = oppSide * Math.max(0.6, Math.min(COURT.HALF_L + 0.6, Math.abs(az)));
    this.aim.set(ax, 0.02, az);
  }

  currentSwingMode() {
    return Math.abs(this.me.z) < KITCHEN_BAND ? MODE.DINK : MODE.DRIVE;
  }

  canStartSwing() {
    if (this.paused || !this.running) return false;
    const me = this.me;
    if (me.swingState !== SWINGSTATE.IDLE && this.isAuthority) return false;
    if (this.sim.phase === PHASE.POINT || this.sim.phase === PHASE.GAMEOVER) return false;
    if (this.sim.phase === PHASE.SERVE && this.sim.serverIdx !== this.myIdx) return false;
    return true;
  }

  onPress(button) {
    if (button !== 0) return;
    if (!this.canStartSwing()) return;
    if (this.swing.active) return;
    // Serving always uses the power meter -- there is no incoming ball to react to.
    const mode = this.sim.phase === PHASE.SERVE ? MODE.DRIVE : this.currentSwingMode();
    beginSwing(this.swing, mode, this.myTuning);
    this.audio.chargeStart();
  }

  onRelease(button) {
    if (button !== 0 || !this.swing.active) return;
    const tune = this.myTuning;
    const assist = this.settings.get('meterAssist');
    const res = releaseSwing(this.swing, tune, assist);
    this.audio.chargeStop();
    if (!res) return;

    const isServe = this.sim.phase === PHASE.SERVE && this.sim.serverIdx === this.myIdx;
    const ball = this.sim.ball;
    const shot = classifyShot({
      mode: res.mode,
      soft: this.input.soft,
      beforeBounce: ball.bouncesSinceHit === 0,
      ballHeight: ball.p.y,
      netHeight: COURT.NET_H_CENTER,
      isServe,
      quality: res.quality,
    });

    const payload = {
      shot,
      power: res.power,
      scatter: res.scatter,
      quality: res.quality,
      ax: this.aim.x,
      az: this.aim.z,
      star: res.charged && this.input.special && this.me.special >= 1,
      rewind: 0,
    };

    if (this.isAuthority) {
      this.sim.queueSwing(this.myIdx, payload);
    } else {
      this.net.sendSwing(payload);
      this.startLocalSwingAnim();
    }
    if (res.quality === QUALITY.PERFECT) this.stats.perfect++;
  }

  // Clients animate their own swing straight away rather than waiting a round
  // trip for the host to confirm it.
  startLocalSwingAnim() {
    this.pred.swingState = SWINGSTATE.WINDUP;
    this.pred.swingT = 0;
    this.pred.swingSide =
      (this.sim.ball.p.x - this.pred.x) * (this.pred.side < 0 ? 1 : -1) >= 0 ? 1 : -1;
  }

  advanceLocalSwingAnim(p, dt) {
    if (p.swingState === SWINGSTATE.IDLE) return;
    p.swingT += dt;
    if (p.swingState === SWINGSTATE.WINDUP && p.swingT >= PLAY.SWING_WINDUP) {
      p.swingState = SWINGSTATE.ACTIVE; p.swingT = 0;
    } else if (p.swingState === SWINGSTATE.ACTIVE && p.swingT >= PLAY.SWING_ACTIVE) {
      p.swingState = SWINGSTATE.RECOVER; p.swingT = 0;
    } else if (p.swingState === SWINGSTATE.RECOVER && p.swingT >= PLAY.SWING_RECOVER) {
      p.swingState = SWINGSTATE.IDLE; p.swingT = 0;
    }
  }

  localInput() {
    const mv = this.movementInput();
    return {
      mx: mv.mx, mz: mv.mz,
      ax: this.aim.x, az: this.aim.z,
      dash: this.input.dash,
      charging: this.swing.active,
      chargeVis: this.swing.mode === MODE.DRIVE ? this.swing.t : this.swing.needle,
    };
  }

  // ---- frame -------------------------------------------------------------

  update(dt) {
    if (!this.running) return;
    this.updateAim();

    if (this.swing.active && !this.paused) {
      updateSwing(this.swing, dt, this.myTuning);
      const zone = sweetZone(this.swing, this.myTuning, this.settings.get('meterAssist'));
      const pos = this.swing.mode === MODE.DRIVE ? this.swing.t : this.swing.needle;
      const inSweet = Math.abs(pos - zone.center) <= zone.half;
      this.audio.chargeUpdate(Math.min(1, this.swing.t), inSweet);
      if (this.swing.mode === MODE.DINK && this.swing.dir !== this.lastNeedleDir) {
        this.lastNeedleDir = this.swing.dir;
        this.audio.needleTick(true);
      }
      // An overcooked drive fires itself so the charge cannot be held forever.
      if (this.swing.mode === MODE.DRIVE && this.swing.overcooked && this.swing.t >= 1.26) {
        this.onRelease(0);
      }
    }

    if (this.isAuthority) this.updateAuthority(dt);
    else this.updateClient(dt);

    this.render(dt);
  }

  // ---- authority (local host / online host) ------------------------------

  updateAuthority(dt) {
    if (this.paused) return;
    this.accum += dt;
    let steps = 0;
    while (this.accum >= TICK && steps < MAX_CATCHUP) {
      this.accum -= TICK;
      steps++;
      this.simTick();
    }
    // A long stall (tab hidden) should not be replayed frame by frame.
    if (this.accum > TICK * MAX_CATCHUP) this.accum = 0;

    if (this.mode === 'host') {
      this.snapAccum += dt;
      const interval = 1 / SNAPSHOT_HZ;
      if (this.snapAccum >= interval) {
        this.snapAccum = this.snapAccum % interval;
        this.broadcast();
      }
    }
  }

  simTick() {
    const inputs = [];
    for (const p of this.sim.players) {
      if (p.idx === this.myIdx && this.mode !== 'client') {
        inputs[p.idx] = this.localInput();
      } else if (p.bot) {
        inputs[p.idx] = updateBot(this.sim, p, this.bots[p.idx], TICK);
      } else {
        inputs[p.idx] = this.consumeRemoteInput(p);
      }
    }
    this.sim.step(TICK, inputs);
    this.handleEvents(this.sim.drainEvents(), true);
  }

  // Pull one buffered input per tick, which is what the client replays against.
  consumeRemoteInput(p) {
    const rec = p.netRec;
    if (!rec) return { mx: 0, mz: 0 };
    const q = rec.inputQueue || [];
    let msg = null;
    if (q.length > 0) {
      // Drain a little faster when the buffer has grown, so a burst of late
      // packets does not leave the player permanently behind.
      const extra = q.length > 5 ? Math.min(3, q.length - 3) : 0;
      for (let i = 0; i < extra; i++) q.shift();
      msg = q.shift();
      rec.lastInput = msg;
    } else {
      msg = rec.lastInput; // hold the last known input through a gap
    }
    if (!msg) return { mx: 0, mz: 0 };
    rec.lastAppliedSeq = msg.s;
    return {
      mx: msg.mx, mz: msg.mz, ax: msg.ax, az: msg.az,
      dash: !!msg.d, charging: !!msg.ch, chargeVis: msg.cv,
    };
  }

  broadcast() {
    const snap = this.sim.snapshot();
    // Each client needs its own ack, so snapshots are addressed per peer.
    for (const rec of this.net.peerList()) {
      // Envelope keys go last so a snapshot field can never shadow them.
      this.net.sendFast({ ...snap, ht: this.net.now(), ack: rec.lastAppliedSeq || 0, t: 'snap' },
        rec.id);
    }
  }

  onRemoteSwing(rec, msg) {
    const p = this.sim.players.find((x) => x.netRec === rec);
    if (!p) return;
    const interp = SnapshotBuffer.delayFor(rec.ping, SNAPSHOT_HZ);
    const rewind = this.net.rewindFor(rec, interp);
    this.sim.queueSwing(p.idx, {
      shot: msg.shot, power: msg.power, scatter: msg.scatter, quality: msg.quality,
      ax: msg.ax, az: msg.az, star: msg.star, rewind,
    });
  }

  // ---- client ------------------------------------------------------------

  updateClient(dt) {
    if (this.paused) return;
    const ping = this.net.ping;
    const interp = SnapshotBuffer.delayFor(ping, SNAPSHOT_HZ);
    const hostNow = this.net.now() + ping.offset;
    const sample = this.snapBuf.sample(hostNow - interp);
    if (sample) this.sim.restore(sample);

    // Send input on the same fixed cadence the host consumes it.
    this.inputAccum += dt;
    let guard = 0;
    while (this.inputAccum >= TICK && guard < MAX_CATCHUP) {
      this.inputAccum -= TICK;
      guard++;
      const inp = this.localInput();
      const seq = this.net.sendInput(inp);
      this.inputHistory.push({ seq, inp });
      if (this.inputHistory.length > 180) this.inputHistory.shift();
      // Predict our own movement immediately using the shared movement code.
      this.sim.stepPlayer(this.pred, TICK, inp);
      this.advanceLocalSwingAnim(this.pred, TICK);
    }
    if (this.inputAccum > TICK * MAX_CATCHUP) this.inputAccum = 0;

    this.corrector.update(dt);

    // Render the local player from the prediction, not the delayed snapshot.
    const me = this.sim.players[this.myIdx];
    me.x = this.pred.x + this.corrector.x;
    me.z = this.pred.z + this.corrector.z;
    me.vx = this.pred.vx; me.vz = this.pred.vz;
    me.facing = this.pred.facing;
    me.swingState = this.pred.swingState;
    me.swingT = this.pred.swingT;
    me.swingSide = this.pred.swingSide;
    me.charging = this.swing.active;
    me.chargeVis = this.swing.mode === MODE.DRIVE ? this.swing.t : this.swing.needle;
  }

  onSnapshot(msg) {
    this.snapBuf.push(msg);
    if (!this.pred) return;
    const auth = msg.p[this.myIdx];
    if (!auth) return;

    const beforeX = this.pred.x, beforeZ = this.pred.z;

    // Rewind to the authoritative state and replay everything the host has
    // not acknowledged yet. This is what keeps prediction honest.
    this.pred.x = auth[0]; this.pred.z = auth[1];
    this.pred.vx = auth[2]; this.pred.vz = auth[3];
    this.pred.facing = auth[4];
    this.pred.stamina = auth[5];
    this.pred.special = auth[6];
    this.pred.dashT = auth[11];

    const ack = msg.ack || 0;
    while (this.inputHistory.length && this.inputHistory[0].seq <= ack) {
      this.inputHistory.shift();
    }
    const savedPhase = this.sim.phase;
    this.sim.phase = msg.ph;
    for (const h of this.inputHistory) this.sim.stepPlayer(this.pred, TICK, h.inp);
    this.sim.phase = savedPhase;

    // Fold the difference into a decaying offset rather than snapping.
    const hard = this.corrector.apply(this.pred.x - beforeX, this.pred.z - beforeZ);
    if (hard) { this.corrector.x = 0; this.corrector.z = 0; }
  }

  onRemoteEvents(events) { this.handleEvents(events, false); }

  // ---- events -> sound + effects -----------------------------------------

  handleEvents(events, isLocal) {
    if (!events.length) return;
    if (this.mode === 'host') {
      // Strip the fields clients do not need before sending.
      this.net.broadcastEvents(events.filter((e) => e.type !== 'serveSetup'));
    }
    const mySide = this.me.side;
    for (const e of events) {
      switch (e.type) {
        case 'hit': {
          this.stats.hits++;
          const ch = getCharacter(this.sim.players[e.idx]?.charId);
          this.audio.paddleHit(e.power, e.quality, e.star);
          this.fx.hitEffect(e.pos, e.quality, e.power, e.star, ch.colors.primary);
          if (e.idx === this.myIdx) {
            const label = { perfect: 'PERFECT', good: 'GOOD', ok: 'OK', weak: 'MISTIMED' }[e.quality];
            if (e.quality === 'weak') this.hud.message(label, 'warn', 0.7);
          }
          break;
        }
        case 'bounce':
          if (!e.dead) {
            this.audio.bounce(Math.abs(this.sim.ball.v.y) + 6);
            this.fx.bounceEffect(e.pos, 14, e.inBounds);
            if (!e.inBounds) this.hud.message('OUT', 'warn', 1.0);
          }
          break;
        case 'net':
          this.audio.netHit();
          this.fx.netEffect(e.pos);
          break;
        case 'whiff':
          this.audio.whiff();
          if (e.idx === this.myIdx) this.hud.message('MISSED', 'warn', 0.8);
          break;
        case 'dash':
          this.audio.dash();
          break;
        case 'fault':
          this.stats.faults++;
          this.hud.message(e.reason.toUpperCase(), 'warn', 1.3);
          break;
        case 'point': {
          const myTeam = this.me.team;
          const won = e.team === myTeam;
          this.audio.pointWon(won);
          this.hud.message(e.reason, 'info', 1.5);
          this.hud.setScore(e.score[0], e.score[1], e.serveTeam, mySide);
          this.stats.longest = Math.max(this.stats.longest, e.rallyShots || 0);
          this.fx.addShake(won ? 0.4 : 0.2);
          break;
        }
        case 'game':
          this.onGameOver(e);
          break;
        default:
          break;
      }
    }
  }

  onGameOver(e) {
    const won = e.winner === this.me.team;
    this.audio.gameOver(won);
    this.hud.message(won ? 'GAME!' : 'DEFEAT', 'big', 3);
    this.onFinish?.({
      won, score: e.score,
      stats: [
        ['Shots hit', this.stats.hits],
        ['Perfect timing', this.stats.perfect],
        ['Longest rally', this.stats.longest + ' shots'],
        ['Faults', this.stats.faults],
      ],
    });
  }

  // ---- rendering ---------------------------------------------------------

  render(dt) {
    const sim = this.sim;
    const me = this.me;
    const time = performance.now() / 1000;

    for (let i = 0; i < this.rigs.length; i++) {
      const p = sim.players[i];
      const rig = this.rigs[i];
      rig.position.set(p.x, 0, p.z);
      rig.rotation.y = p.facing;
      const glide = animateCharacter(rig, p, dt, time);
      if (glide && Math.hypot(p.vx, p.vz) > 4.0) this.fx.dustPuff(p.x, p.z, 0.45);
      this.chargeSparks(p, rig, i, dt);
    }

    const b = sim.ball;
    this.ballObj.position.set(b.p.x, b.p.y, b.p.z);
    const spinRate = Math.hypot(b.v.x, b.v.z) * 1.4;
    this.ballObj.rotation.x += spinRate * dt;
    this.ballObj.rotation.y += b.sideSpin * dt * 3;

    // Ball shadow scales with height so altitude is readable at a glance.
    const h = Math.max(0, b.p.y);
    const sc = 0.30 + h * 0.12;
    this.ballShadow.position.set(b.p.x, 0.028, b.p.z);
    this.ballShadow.scale.setScalar(sc);
    this.ballShadow.material.opacity = Math.max(0.05, 0.55 - h * 0.11);

    const trailColor = this.settings.get('glow') ? 0xfff2a0 : 0xdddd88;
    this.fx.updateTrail(b.p, dt, this.settings.get('trails') && b.live, trailColor);

    // Landing marker: your aim while charging, otherwise where the ball lands.
    if (this.swing.active) {
      this.fx.setLanding(this.aim.x, this.aim.z, true, 0.55);
    } else if (b.live && sim.phase === PHASE.RALLY) {
      const land = predictLanding(b, 3);
      const incoming = Math.sign(land.z) === me.side;
      this.fx.setLanding(land.x, land.z, !land.hitNet,
        incoming ? Math.max(0, 1 - land.t / 1.1) * 0.8 : 0);
    } else {
      this.fx.setLanding(0, 0, false);
    }

    if (this.crowd && this.settings.get('crowd3d')) {
      animateCrowd(this.crowd, time, Math.min(1, this.fx.shake));
    }

    this.fx.update(dt, this.view.camera, this.view.renderer.domElement.height);
    this.view.updateCamera(me.x, me.z, dt, this.fx);

    this.updateHud(dt);
  }

  // Sparks stream off a paddle that is winding up. The rate and colour track
  // the charge, so from across the court you can see how loaded a shot is.
  chargeSparks(p, rig, i, dt) {
    if (!p.charging || p.chargeVis <= 0.04) { this.sparkAccum[i] = 0; return; }
    const charge = Math.min(1, p.chargeVis);
    this.sparkAccum[i] = (this.sparkAccum[i] || 0) + dt * (8 + charge * 46);
    if (this.sparkAccum[i] < 1) return;
    const ch = getCharacter(p.charId);
    this._sparkColor.set(ch.colors.primary).lerp(SPARK_HOT, 0.35 + charge * 0.6);
    paddleWorldPos(rig, this._paddlePos);
    while (this.sparkAccum[i] >= 1) {
      this.sparkAccum[i] -= 1;
      this.fx.burst(this._paddlePos.x, this._paddlePos.y, this._paddlePos.z, 1, {
        color: this._sparkColor,
        spread: 0.3 + charge * 0.8,
        life: 0.28 + charge * 0.2,
        gravity: -1.6,
        size: 0.9 + charge * 1.5,
        up: 0.7,
      });
    }
  }

  updateHud(dt) {
    const me = this.me;
    this.hud.update(dt);
    this.hud.setNetStats({
      ping: this.net ? this.net.pingMs : 0,
      fps: this.view.fps,
      showFps: this.settings.get('showFps'),
      loss: this.net ? this.net.ping.loss : 0,
      mode: this.mode,
    });

    let shotLabel = null;
    if (this.swing.active) {
      if (this.sim.phase === PHASE.SERVE) shotLabel = 'SERVE';
      else if (this.swing.mode === MODE.DINK) {
        shotLabel = this.input.soft ? 'DROP — REACTION' : 'KITCHEN — REACTION';
      } else {
        shotLabel = this.input.soft ? 'LOB — POWER' : 'DRIVE — POWER';
      }
    }

    this.hud.draw({
      swing: this.swing,
      tuning: this.myTuning,
      me,
      shotLabel,
      mouse: this.input.mouse,
      showCrosshair: true,
    });

    this.hud.setHint(this.hintFor());
  }

  hintFor() {
    const sim = this.sim;
    if (sim.phase === PHASE.SERVE) {
      return sim.serverIdx === this.myIdx
        ? 'Hold <b>Left Click</b> to serve — release in the sweet spot'
        : 'Let the serve bounce before you return it';
    }
    if (sim.phase === PHASE.RALLY && sim.ball.shotCount < 3 && sim.ball.bouncesSinceHit === 0) {
      return 'Two-bounce rule — let it bounce';
    }
    if (sim.inKitchen(this.me) && sim.ball.bouncesSinceHit === 0 && sim.ball.live) {
      return 'You are in the kitchen — no volleys';
    }
    return '';
  }

  setPaused(p) {
    this.paused = p;
    if (p && this.swing.active) {
      this.swing.active = false;
      this.audio.chargeStop();
    }
  }
}
