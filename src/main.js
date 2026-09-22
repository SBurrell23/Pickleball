import { settings, DIFFICULTY_LEVEL } from './core/settings.js';
import { Input } from './core/input.js';
import { AudioEngine } from './audio/audio.js';
import { View } from './render/view.js';
import { Hud } from './ui/hud.js';
import { Menus } from './ui/menus.js';
import { gearIcon } from './ui/icons.js';
import { Net } from './net/net.js';
import { Game } from './game/game.js';
import { createBotState } from './game/ai.js';
import { ENEMIES, enemyDef, skillFor } from './game/enemies.js';
import { loadLook, sanitizeRemoteLook, DEFAULT_LOOK, lookIsCustom, allUnlocked }
  from './game/avatar.js';
import {
  activeRun, currentRival, startRun, abandonRun, recordResult,
  completedDifficulties, DIFFICULTY_NAME,
} from './game/season.js';
import { recordMatch, grant } from './game/achievements.js';
import { buildCourt, buildSky } from './render/assets.js';
import { getVenue, playableVenue } from './render/venues.js';
import { venueForRung } from './game/season.js';

// What clearing a season on each difficulty hands over. Written out rather
// than derived so the season-complete screen can name the prizes.
// Which modes actually have another human on the other end. Asking "is it
// not local?" was fine when local was the only offline mode; season is one
// too, and treating it as networked left it unpausable.
function isOnline(mode) {
  return mode === 'host' || mode === 'join' || mode === 'client';
}

const REWARDS = {
  easy: ['Ball Yellow kit', 'Lime paddle', 'Mohawk'],
  normal: ['Surf kit', 'Ice paddle', 'Sash shirt', 'Bucket Hat'],
  hard: ['Ember kit', 'Obsidian paddle', 'Headphones'],
  extreme: ['Champion Gold kit', 'Champion Gold paddle', 'Champion shirt', 'Crown'],
};

function rewardsFor(difficulty) { return REWARDS[difficulty] || []; }

// Rebuilding the venue throws away a whole scene's worth of geometry and
// canvas textures. Without this, switching courts a few times in a session
// leaks every one of them -- the same mistake the effects system made.
function disposeTree(root) {
  const seen = new Set();
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of mats) {
      if (seen.has(m)) continue;
      seen.add(m);
      // Walk every property rather than a list of the ones we remembered:
      // the named list missed emissiveMap the moment the skyline added one,
      // and the leak only shows up after switching venues a few times.
      for (const key of Object.keys(m)) {
        const val = m[key];
        if (val && val.isTexture) val.dispose();
      }
      m.dispose();
    }
  });
}

class App {
  constructor() {
    this.stage = document.getElementById('stage');
    this.overlay = document.getElementById('overlay');
    this.view = new View(this.stage, settings);
    this.audio = new AudioEngine(settings);
    this.input = new Input(this.view.renderer.domElement);
    this.hud = new Hud(this.overlay, settings);
    this.hud.dom.style.display = 'none';
    this.hud.canvas.style.display = 'none';

    this.menus = new Menus(this.overlay, settings, this.audio, {
      onStartLocal: (p, c) => this.startLocal(p, c),
      onHost: (p, c) => this.startHost(p, c),
      onJoin: (code, p) => this.startJoin(code, p),
      onReady: () => this.toggleReady(),
      onStartMatch: () => this.hostStartMatch(),
      onResume: () => this.setPaused(false),
      onQuit: () => this.quitToMenu(),
      onRematch: () => this.rematch(),
      onLeave: () => this.teardownNet(),
      onBackToLobby: () => this.backToLobby(true),
      onChangeCharacter: (p) => this.changeCharacter(p),
      onLobbyMode: (m) => this.setLobbyMode(m),
      onVenue: (v) => this.onVenuePicked(v),
      onSeasonStart: (d) => this.startSeason(d),
      onSeasonPlay: () => this.playSeasonMatch(),
      onSeasonQuit: () => this.quitSeason(),
      onSeasonContinue: () => this.afterSeasonMatch(),
      onLookSaved: (look) => {
        // Earned the moment somebody makes the player their own.
        if (lookIsCustom(look)) {
          const a = grant('dressed');
          if (a) this.announce([a]);
        }
      },
      onScreen: (s) => this.gear.classList.toggle('on', s === 'settings'),
    });

    // Settings are one click away from anywhere, including mid-point. The
    // overlay is pointer-events:none so the aiming cursor passes through it --
    // the button itself opts back in.
    this.gear = document.createElement('button');
    this.gear.type = 'button';
    this.gear.className = 'gear-btn';
    this.gear.title = 'Settings';
    this.gear.setAttribute('aria-label', 'Settings');
    this.gear.innerHTML = gearIcon();
    this.gear.addEventListener('click', () => {
      this.audio.uiClick();
      this.toggleSettings();
    });
    this.overlay.appendChild(this.gear);

    // Achievement toasts. Their own rail rather than the HUD's message queue:
    // an achievement is not an event in the point, and it should not push the
    // OUT call out of the way.
    this.toastRail = document.createElement('div');
    this.toastRail.className = 'toast-rail';
    this.overlay.appendChild(this.toastRail);

    // The court doubles as the menu backdrop, so it lives for the whole
    // session rather than being rebuilt per match.
    //
    // Clamped once, here, rather than at each of the five places the setting
    // is read. Courts only ever unlock, never lock again, so a choice that is
    // out of reach at boot is out of reach for the session -- and writing the
    // fallback back means a save from before the courts were gated stops
    // asking for one it cannot have.
    this.venueId = playableVenue(settings.get('venue'), completedDifficulties());
    if (this.venueId !== settings.get('venue')) settings.set('venue', this.venueId);
    this.buildScene();

    this.game = null;
    this.net = null;
    this.paused = false;
    this.lastTime = performance.now();

    this.bindInput();

    settings.onChange((key) => this.onSettingChanged(key));

    // The audio context can only start from a gesture.
    const kick = () => {
      this.audio.init();
      this.audio.startMusic();
      window.removeEventListener('pointerdown', kick);
      window.removeEventListener('keydown', kick);
    };
    window.addEventListener('pointerdown', kick);
    window.addEventListener('keydown', kick);

    window.addEventListener('blur', () => {
      if (settings.get('muteOnBlur')) this.audio.setMuted(true);
      if (this.game && !this.menus.visible && !isOnline(this.game.mode)) this.setPaused(true);
    });
    window.addEventListener('focus', () => this.audio.setMuted(false));

    this.menus.show('main');
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  // The court and the sky are the venue, so changing venue means rebuilding
  // both. They live for the whole session rather than per match -- the menu
  // uses them as its backdrop -- so this is also what disposes the old one.
  buildScene() {
    if (this.court) { this.view.scene.remove(this.court); disposeTree(this.court); }
    if (this.sky) { this.view.scene.remove(this.sky); disposeTree(this.sky); }
    this.court = buildCourt(settings.get('shadows'), this.venueId);
    this.view.scene.add(this.court);
    this.sky = buildSky(this.view.sunDirection, this.venueId);
    this.view.scene.add(this.sky);
    this.view.setSky(this.sky);
    this.view.setScene(this.venueId);
    if (this.game) this.game.setCourt(this.court);
  }

  // From the picker: change the backdrop immediately so the choice is a
  // preview rather than a promise, and tell the room about it if we host one.
  onVenuePicked(venueId) {
    this.setVenue(venueId);
    if (this.net && this.net.isHost && this.hostConfig) {
      this.hostConfig.venue = venueId;
      this.refreshLobby();
    }
  }

  /**
   * Point the session at a venue. A no-op when nothing changed, because
   * rebuilding the court costs a few hundred milliseconds of texture work
   * and the lobby calls this on every roster update.
   */
  setVenue(venueId) {
    const v = getVenue(venueId).id;
    if (v === this.venueId) return;
    this.venueId = v;
    this.buildScene();
  }

  onSettingChanged(key) {
    const rebuilt = this.view.onSettingChanged(key);
    if (rebuilt) {
      // A new canvas means input has to be rebound to it.
      this.input.dispose();
      this.input = new Input(this.view.renderer.domElement);
      this.bindInput();
      if (this.game) this.game.input = this.input;
    }
    this.audio.applySettings();
    if (key === 'shadows') this.buildScene();
    if (this.game) this.game.onSettingChanged(key);
  }


  // One place, because there are two: the constructor binds the first canvas
  // and a graphics setting that rebuilds the renderer binds the next one. The
  // two copies had already drifted -- the rebound set handled Escape with a
  // different shape -- so a new binding added to one of them would have been
  // a bug nobody saw until the player changed a setting mid-session.
  bindInput() {
    this.input.on('press', (b) => this.game && !this.paused && this.game.onPress(b));
    this.input.on('release', (b) => this.game && this.game.onRelease(b));
    this.input.on('key', (code, down) => {
      if (!down) return;
      if (code === 'Escape') { this.onEscape(); return; }
      // Space is its own swing rather than a modifier held with the drive, so
      // it is bound beside the buttons instead of read off the key set when
      // the mouse comes up. Keydown only: there is nothing to hold.
      if (code === 'Space' && this.game && !this.paused) this.game.onLob();
    });
  }

  onEscape() {
    if (this.menus.visible) {
      if (this.menus.screen === 'settings' || this.menus.screen === 'controls') {
        this.menus.act('back', this.menus.data.returnTo || (this.game ? 'pause' : 'main'));
      } else if (this.menus.screen === 'pause') {
        this.setPaused(false);
      }
      return;
    }
    if (this.game) this.setPaused(true);
  }

  // The gear behaves like a toggle: a second click backs out exactly the way
  // the Back button would, so it is never a one-way trip into a submenu.
  toggleSettings() {
    if (this.menus.screen === 'settings') {
      this.menus.act('back', this.menus.data.returnTo || (this.game ? 'pause' : 'main'));
      return;
    }
    if (this.menus.visible) {
      this.menus.show('settings', { returnTo: this.menus.screen });
      return;
    }
    if (this.game) {
      // Mid-match. Pause first, so Back lands on the pause menu rather than
      // dropping the player straight back into a live point. An online match
      // keeps simulating -- see setPaused.
      this.setPaused(true);
      this.menus.show('settings', { returnTo: 'pause' });
      return;
    }
    this.menus.show('settings', { returnTo: 'main' });
  }

  setPaused(p) {
    if (!this.game) return;
    // Online matches keep simulating: pausing a peer-to-peer game would stall
    // the other player, so Esc only opens the menu.
    this.paused = p;
    const online = isOnline(this.game.mode);
    if (online) this.game.setPaused(false);
    else this.game.setPaused(p);
    this.input.enabled = !p;
    if (p) {
      this.input.releaseAll();
      this.menus.show('pause', {
        returnTo: 'pause',
        netNote: online ? 'This is an online match, so play continues while this is open.' : '',
        seasonNote: this.game.mode === 'season',
      });
    } else {
      this.menus.hide();
    }
  }

  // ---- roster ------------------------------------------------------------

  buildRoster(config, humans) {
    const need = config.mode === 'doubles' ? 4 : 2;
    const diff = settings.get('difficulty');
    const level = DIFFICULTY_LEVEL[diff] ?? 0.55;
    const roster = [];
    // Exhibition bots are rivals off the ladder, taken from the middle of it
    // and scaled to the chosen difficulty -- the same opponents the season
    // uses, so an exhibition is a fair rehearsal for one.
    const pool = ENEMIES.map((_, i) => i).sort(() => Math.random() - 0.5);
    let picked = 0;
    for (let i = 0; i < need; i++) {
      const h = humans[i];
      if (h) {
        roster.push({
          id: h.id || 'h' + i, name: h.name || 'Player',
          look: h.look || DEFAULT_LOOK,
          team: i % 2, bot: false, netRec: h.netRec || null,
        });
      } else {
        const ladderIndex = pool[picked++ % pool.length];
        const def = enemyDef(ladderIndex, diff);
        roster.push({
          id: 'bot' + i, name: def.name, def,
          team: i % 2, bot: true, difficulty: level,
        });
      }
    }
    return roster;
  }

  // Slides one in, holds it, slides it out. Several at once stack down the
  // rail rather than replacing each other.
  toast(title, sub = 'Achievement') {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<b>★</b><span><em>${sub}</em><strong></strong></span>`;
    el.querySelector('strong').textContent = title;
    this.toastRail.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 450);
    }, 3600);
  }

  announce(earned) {
    if (!earned || !earned.length) return;
    // Space them out so three at once is legible rather than a pile.
    earned.slice(0, 5).forEach((a, i) => {
      setTimeout(() => this.toast(a.name), i * 550);
    });
    this.audio.uiClick();
  }

  // ---- season ------------------------------------------------------------

  forfeitSeasonMatch() {
    if (!this.game || this.game.mode !== 'season' || !this.seasonContext) return;
    const ctx = this.seasonContext;
    this.seasonContext = null;
    const out = recordResult(false);
    if (!out) return;
    this.hud.message('FORFEIT', 'warn', 2);
    recordMatch({
      mode: 'season', matchMode: 'singles', won: false,
      myScore: 0, theirScore: 0, shots: 0, dinks: 0, drives: 0, lobs: 0,
      perfects: 0, weak: 0, chokes: 0, accuracy: 0, longestRally: 0,
      avgRally: 0, maxDeficit: 0, smashWinners: 0, lobWinners: 0, aces: 0,
      lobPunishes: 0, difficulty: ctx.difficulty, rivalId: ctx.rivalId,
      livesBefore: ctx.livesBefore, livesAfter: out.lives,
    });
  }


  startSeason(difficulty) {
    startRun(difficulty);
    this.menus.show('season');
  }

  quitSeason() {
    abandonRun();
    this.menus.show('season');
  }

  playSeasonMatch() {
    const run = activeRun();
    if (!run) { this.menus.show('season'); return; }
    const rival = currentRival(run);
    this.teardownNet();
    this.seasonContext = {
      difficulty: run.difficulty, index: run.index,
      rivalId: rival.def.id, livesBefore: run.lives,
    };
    // The venue is the ladder's, not the player's: rec courts early and
    // the championship court for the final.
    this.setVenue(venueForRung(run.difficulty, run.index));
    const me = this.menus.profile();
    const roster = [
      { id: 'me', name: me.name, look: me.look, team: 0, bot: false },
      {
        id: 'rival', name: rival.def.name, def: rival.def,
        team: 1, bot: true, difficulty: rival.skill,
      },
    ];
    this.beginMatch('season', { mode: 'singles', seed: (Math.random() * 1e9) | 0 },
      roster, 0);
  }

  // Everything that has to happen once a match is in the books, whichever
  // mode it was: the season ledger, then achievements, then what to show.
  settleMatch(result) {
    const summary = result.summary || {};
    const ctx = this.seasonContext;
    let outcome = null;
    if (this.game && this.game.mode === 'season' && ctx) {
      outcome = recordResult(result.won);
      summary.difficulty = ctx.difficulty;
      summary.rivalId = ctx.rivalId;
      summary.livesBefore = ctx.livesBefore;
      if (outcome) {
        summary.livesAfter = outcome.lives;
        summary.bonusLife = outcome.bonusLife;
        summary.seasonComplete = outcome.seasonComplete;
        summary.seasonPerfect = outcome.perfect;
      }
      this.seasonContext = null;
    }
    const earned = recordMatch(summary);
    if (allUnlocked(completedDifficulties())) {
      const a = grant('collector');
      if (a) earned.push(a);
    }
    return { outcome, earned, summary };
  }

  // ---- match lifecycle ---------------------------------------------------

  beginMatch(mode, config, roster, myIdx) {
    // Starting a match over a live one used to strand the old Game: its
    // effects stayed in the shared scene drawing their last frame forever.
    // Most callers tore down first, but not all of them, and the lobby now
    // makes match-after-match the normal path -- so do it here where it
    // cannot be forgotten.
    this.endMatch();
    this.audio.init();
    this.menus.hide();
    this.hud.dom.style.display = '';
    this.hud.canvas.style.display = '';
    this.hud.clearMessages();
    this.paused = false;
    this.input.enabled = true;

    this.game = new Game({
      view: this.view, hud: this.hud, audio: this.audio, input: this.input,
      settings, net: this.net, mode, court: this.court,
    });
    this.game.onFinish = (r) => this.onMatchFinished(r);
    this.lastConfig = { mode, config, roster, myIdx };
    this.game.start(config, roster, myIdx);
  }

  endMatch() {
    if (!this.game) return;
    this.game.dispose();
    this.game = null;
    this.hud.dom.style.display = 'none';
    this.hud.canvas.style.display = 'none';
  }

  onMatchFinished(result) {
    // Settle immediately -- the ledger should not depend on the player
    // sitting through the celebration -- but show the screen after it.
    const settled = this.settleMatch(result);
    this.announce(settled.earned);
    setTimeout(() => {
      if (!this.game) return;
      const mode = this.game.mode;
      const online = isOnline(mode);
      this.menus.show('results', {
        won: result.won, score: result.score, stats: result.stats,
        players: result.players,
        earned: settled.earned,
        season: settled.outcome,
        canRematch: mode === 'local',
        // Online players should be able to run it back without re-sharing a
        // room code, so the lobby is one click away.
        canLobby: online && !!this.net,
        canSeason: mode === 'season',
        returnTo: 'results',
      });
      this.input.enabled = false;
    }, 2200);
  }

  // From the results screen of a season match: either back to the ladder, or
  // to the screen that says how the run ended.
  afterSeasonMatch() {
    const o = this.menus.data.season;
    this.endMatch();
    this.paused = false;
    this.input.enabled = true;
    if (o && (o.seasonComplete || o.runOver)) {
      this.menus.show('seasonOver', {
        seasonComplete: !!o.seasonComplete,
        seasonPerfect: !!o.perfect,
        difficulty: o.difficulty,
        index: o.index,
        rivalName: o.rival ? o.rival.name : '',
        rewards: o.seasonComplete ? rewardsFor(o.difficulty) : [],
      });
    } else {
      this.menus.show('season');
    }
  }

  // Drop out of a finished online match and back to the lobby, ready to start
  // another. The host brings everyone with it; a client only moves itself.
  backToLobby(broadcast) {
    if (!this.net) { this.quitToMenu(); return; }
    this.endMatch();
    this.matchStarted = false;
    this.paused = false;
    this.input.enabled = true;
    if (this.net.isHost) {
      if (broadcast) this.net.sendCtrl({ t: 'toLobby' });
      this.refreshLobby();
      this.menus.show('lobby', this.lobby);
    } else {
      this.lobby = { ...(this.lobby || {}), isHost: false, ready: false };
      this.menus.show('lobby', this.lobby);
    }
  }

  changeCharacter(profile) {
    if (!this.net) { this.menus.show('main'); return; }
    if (this.net.isHost) {
      this.hostProfile = { ...this.hostProfile, ...profile };
      this.lobby = { ...this.lobby, myName: this.hostProfile.name };
      this.refreshLobby();
    } else {
      this.joinProfile = { ...this.joinProfile, ...profile };
      this.lobby = { ...this.lobby, myName: this.joinProfile.name };
      this.net.sendCtrl({ t: 'profile', profile: this.joinProfile });
    }
    this.menus.show('lobby', this.lobby);
  }

  setLobbyMode(mode) {
    if (!this.net || !this.net.isHost) return;
    this.hostConfig = { ...this.hostConfig, mode };
    this.refreshLobby();
  }

  rematch() {
    const l = this.lastConfig;
    if (!l) return this.quitToMenu();
    this.endMatch();
    this.beginMatch(l.mode, l.config, l.roster, l.myIdx);
  }

  quitToMenu() {
    // Walking out of a season match is a forfeit. Without this, losing badly
    // and quitting before the last point is a free retry, which makes the
    // three lives decorative.
    this.forfeitSeasonMatch();
    this.endMatch();
    this.teardownNet();
    this.paused = false;
    this.input.enabled = true;
    this.menus.show('main');
  }

  teardownNet() {
    if (this.net) { this.net.close(); this.net = null; }
    this.lobby = null;
    this.matchStarted = false;
  }

  // ---- local -------------------------------------------------------------

  startLocal(profile, config) {
    this.teardownNet();
    const roster = this.buildRoster(config, [{ id: 'me', ...profile }]);
    this.setVenue(config.venue || settings.get('venue'));
    this.beginMatch('local', { ...config, seed: (Math.random() * 1e9) | 0 }, roster, 0);
  }

  // ---- hosting -----------------------------------------------------------

  async startHost(profile, config) {
    this.teardownNet();
    this.hostProfile = profile;
    this.hostConfig = config;
    this.menus.show('connecting', { status: 'Creating room…', error: '' });
    this.net = this.makeNet();
    try {
      const code = await this.net.host(profile, config);
      this.lobby = {
        code, isHost: true, mode: config.mode, players: [], myName: profile.name,
      };
      this.refreshLobby();
      this.menus.show('lobby', this.lobby);
    } catch (err) {
      this.menus.show('connecting', { status: '', error: err.message || 'Could not create a room' });
    }
  }

  async startJoin(code, profile) {
    this.teardownNet();
    this.joinProfile = profile;
    this.menus.show('connecting', { status: 'Connecting to ' + code + '…', error: '' });
    this.net = this.makeNet();
    try {
      await this.net.join(code, profile);
      this.lobby = {
        code, isHost: false, mode: 'singles', players: [], ready: false,
        myName: profile.name,
      };
      this.menus.show('lobby', this.lobby);
    } catch (err) {
      this.menus.show('join', { error: err.message || 'Could not join', profile });
    }
  }

  makeNet() {
    return new Net({
      onPeerJoined: (rec) => this.onPeerJoined(rec),
      onPeerLeft: (rec, why) => this.onPeerLeft(rec, why),
      onLobbyChange: () => this.refreshLobby(),
      onLobby: (msg) => this.onLobbyMessage(msg),
      onStart: (msg) => this.onStartMessage(msg),
      onReturnToLobby: () => this.backToLobby(false),
      onSnapshot: (msg) => this.game && this.game.onSnapshot(msg),
      onEvents: (ev) => this.game && this.game.onRemoteEvents(ev),
      onInput: (rec, msg) => {
        if (!rec.inputQueue) rec.inputQueue = [];
        rec.inputQueue.push(msg);
        if (rec.inputQueue.length > 24) rec.inputQueue.splice(0, rec.inputQueue.length - 12);
      },
      onSwing: (rec, msg) => this.game && this.game.onRemoteSwing(rec, msg),
      onDisconnected: (why) => this.onDisconnected(why),
      onError: (msg) => this.menus.setStatus(msg),
      onStatus: () => {},
    });
  }

  // A room only has room for so many. Without this a third person joining a
  // singles room connects, sits in the lobby, and is silently never dealt in.
  roomCapacity() { return (this.hostConfig?.mode === 'doubles') ? 4 : 2; }

  onPeerJoined(rec) {
    const seated = this.net.peerList().filter((r) => r.profile && r !== rec).length;
    if (this.matchStarted) {
      this.net.sendCtrl({ t: 'reject', why: 'That match has already started.' }, rec.id);
      setTimeout(() => this.net && this.net._dropPeer(rec.id, 'match in progress'), 400);
      return;
    }
    if (seated + 2 > this.roomCapacity()) {
      this.net.sendCtrl({
        t: 'reject',
        why: `That room is full (${this.roomCapacity()} players).`,
      }, rec.id);
      // Give the message a moment to flush before the channel closes.
      setTimeout(() => this.net && this.net._dropPeer(rec.id, 'room full'), 400);
      return;
    }
    this.refreshLobby();
  }

  onPeerLeft(rec, why) {
    if (this.game && this.game.mode === 'host') {
      // Hand the abandoned slot to the CPU so the match can carry on.
      const p = this.game.sim.players.find((x) => x.netRec === rec);
      if (p) {
        p.bot = true;
        p.netRec = null;
        p.difficulty = DIFFICULTY_LEVEL[settings.get('difficulty')] ?? 0.55;
        this.game.bots[p.idx] = createBotState(p.difficulty);
        this.hud.message(p.name + ' left — CPU taking over', 'warn', 2.4);
      }
    }
    this.refreshLobby();
  }

  onDisconnected(why) {
    this.hud.message(why || 'Disconnected', 'warn', 3);
    this.endMatch();
    this.teardownNet();
    this.menus.show('main');
  }

  refreshLobby() {
    if (!this.net || !this.net.isHost) return;
    const peers = this.net.peerList().filter((r) => r.profile);
    const players = [
      {
        name: this.hostProfile.name,
        look: this.hostProfile.look,
        isHost: true, ready: true,
      },
      // A peer's look is whatever they say it is: we cannot audit somebody
      // else's unlocks, only make what they send safe to draw.
      ...peers.map((r) => ({
        name: r.profile.name || 'Player',
        look: sanitizeRemoteLook(r.profile.look),
        ready: !!r.ready,
        ping: r.ping.ms,
      })),
    ];
    const venue = this.hostConfig.venue || settings.get('venue');
    this.lobby = {
      ...this.lobby, players, isHost: true, mode: this.hostConfig.mode,
      code: this.net.code, venue,
    };
    this.net.sendCtrl({
      t: 'lobby', players, mode: this.hostConfig.mode, code: this.net.code, venue,
    });
    if (this.menus.screen === 'lobby') this.menus.show('lobby', this.lobby);
  }

  onLobbyMessage(msg) {
    this.lobby = {
      ...this.lobby, players: msg.players, mode: msg.mode, code: msg.code,
      venue: msg.venue, isHost: false,
    };
    // Show the host's court behind the lobby, so a joiner knows where they
    // are going before the match starts.
    this.setVenue(msg.venue);
    if (this.menus.screen === 'lobby') this.menus.show('lobby', this.lobby);
  }

  toggleReady() {
    if (!this.net || this.net.isHost) return;
    this.lobby.ready = !this.lobby.ready;
    this.net.sendCtrl({ t: 'ready', ready: this.lobby.ready, profile: this.joinProfile });
    this.menus.show('lobby', this.lobby);
  }

  hostStartMatch() {
    if (!this.net || !this.net.isHost) return;
    this.matchStarted = true;
    const config = {
      ...this.hostConfig, seed: (Math.random() * 1e9) | 0,
      venue: this.hostConfig.venue || settings.get('venue'),
    };
    this.setVenue(config.venue);
    const peers = this.net.peerList().filter((r) => r.profile);
    const humans = [
      { id: 'host', name: this.hostProfile.name, look: this.hostProfile.look },
      ...peers.map((r) => ({
        id: r.id, name: r.profile.name || 'Player',
        look: sanitizeRemoteLook(r.profile.look), netRec: r,
      })),
    ];
    const roster = this.buildRoster(config, humans);

    // Each client needs to know which slot is theirs.
    // The whole appearance goes on the wire: with custom players there is no
    // id the other side could look a character up by.
    const wire = roster.map((r) => ({
      id: r.id, name: r.name, look: r.look, def: r.def, team: r.team,
      bot: r.bot, difficulty: r.difficulty,
    }));
    for (const rec of this.net.peerList()) {
      const idx = roster.findIndex((r) => r.netRec === rec);
      if (idx < 0) continue;
      this.net.sendCtrl({ t: 'start', config, roster: wire, yourIdx: idx }, rec.id);
    }
    this.beginMatch('host', config, roster, 0);
  }

  onStartMessage(msg) {
    // Everyone plays the same court: the host's pick arrives with the match.
    this.setVenue(msg.config.venue);
    this.beginMatch('client', msg.config, msg.roster, msg.yourIdx);
  }

  // ---- main loop ---------------------------------------------------------

  loop(now) {
    requestAnimationFrame(this.loop);
    if (!this.view.shouldRender(now)) return;

    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    // Clamp so an alt-tab does not produce one enormous step.
    if (!isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 0.1);
    this.view.trackFps(dt);

    this.view.updateSun(dt);
    if (this.net) this.net.tick(dt);

    if (this.game) {
      this.game.update(dt);
    } else {
      // Idle menu scene: slowly orbit so the background is not static.
      // Wider orbit than the play camera needs, because the lens is narrow.
      const t = now / 1000;
      this.view.camera.position.set(Math.sin(t * 0.07) * 27, 12.5, Math.cos(t * 0.07) * 27);
      this.view.camera.lookAt(0, 0.6, 0);
    }

    this.view.render();
  }
}

// Fail loudly in the page rather than silently in the console.
try {
  window.__app = new App();
} catch (err) {
  const el = document.getElementById('overlay') || document.body;
  el.innerHTML = `<div class="fatal"><h1>Could not start</h1><pre>${
    String(err && err.stack || err)}</pre></div>`;
  throw err;
}
