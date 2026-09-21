import { settings, DIFFICULTY_LEVEL } from './core/settings.js';
import { Input } from './core/input.js';
import { AudioEngine } from './audio/audio.js';
import { View } from './render/view.js';
import { Hud } from './ui/hud.js';
import { Menus } from './ui/menus.js';
import { gearIcon } from './ui/icons.js';
import { Net } from './net/net.js';
import { Game } from './game/game.js';
import { CHARACTERS } from './game/characters.js';
import { createBotState } from './game/ai.js';
import { buildCourt, buildSky } from './render/assets.js';

const BOT_NAMES = ['Ruby', 'Mako', 'Juno', 'Vale', 'Nix', 'Otto'];

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

    // The court doubles as the menu backdrop, so it lives for the whole
    // session rather than being rebuilt per match.
    this.court = buildCourt(settings.get('shadows'));
    this.view.scene.add(this.court);
    this.sky = buildSky(this.view.sunDirection);
    this.view.scene.add(this.sky);
    this.view.setSky(this.sky);

    this.game = null;
    this.net = null;
    this.paused = false;
    this.lastTime = performance.now();

    this.input.on('press', (b) => this.game && !this.paused && this.game.onPress(b));
    this.input.on('release', (b) => this.game && this.game.onRelease(b));
    this.input.on('key', (code, down) => {
      if (!down) return;
      if (code === 'Escape') this.onEscape();
    });

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
      if (this.game && !this.menus.visible && this.game.mode === 'local') this.setPaused(true);
    });
    window.addEventListener('focus', () => this.audio.setMuted(false));

    this.menus.show('main');
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  onSettingChanged(key) {
    const rebuilt = this.view.onSettingChanged(key);
    if (rebuilt) {
      // A new canvas means input has to be rebound to it.
      this.input.dispose();
      this.input = new Input(this.view.renderer.domElement);
      this.input.on('press', (b) => this.game && !this.paused && this.game.onPress(b));
      this.input.on('release', (b) => this.game && this.game.onRelease(b));
      this.input.on('key', (c, d) => { if (d && c === 'Escape') this.onEscape(); });
      if (this.game) this.game.input = this.input;
    }
    this.audio.applySettings();
    if (this.game) this.game.onSettingChanged(key);
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
    const online = this.game.mode !== 'local';
    if (online) this.game.setPaused(false);
    else this.game.setPaused(p);
    this.input.enabled = !p;
    if (p) {
      this.input.releaseAll();
      this.menus.show('pause', {
        returnTo: 'pause',
        netNote: online ? 'This is an online match, so play continues while this is open.' : '',
      });
    } else {
      this.menus.hide();
    }
  }

  // ---- roster ------------------------------------------------------------

  buildRoster(config, humans) {
    const need = config.mode === 'doubles' ? 4 : 2;
    const level = DIFFICULTY_LEVEL[settings.get('difficulty')] ?? 0.55;
    const roster = [];
    for (let i = 0; i < need; i++) {
      const h = humans[i];
      if (h) {
        roster.push({
          id: h.id || 'h' + i, name: h.name || 'Player', charId: h.charId,
          team: i % 2, bot: false, netRec: h.netRec || null,
        });
      } else {
        const used = new Set(roster.map((r) => r.charId));
        const pick = CHARACTERS.find((c) => !used.has(c.id)) || CHARACTERS[0];
        roster.push({
          id: 'bot' + i, name: BOT_NAMES[i % BOT_NAMES.length], charId: pick.id,
          team: i % 2, bot: true, difficulty: level,
        });
      }
    }
    return roster;
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
    setTimeout(() => {
      if (!this.game) return;
      const online = this.game.mode !== 'local';
      this.menus.show('results', {
        won: result.won, score: result.score, stats: result.stats,
        canRematch: !online,
        // Online players should be able to run it back without re-sharing a
        // room code, so the lobby is one click away.
        canLobby: online && !!this.net,
        returnTo: 'results',
      });
      this.input.enabled = false;
    }, 2200);
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
      { name: this.hostProfile.name, charId: this.hostProfile.charId, isHost: true, ready: true },
      ...peers.map((r) => ({
        name: r.profile.name || 'Player',
        charId: r.profile.charId || 'volley',
        ready: !!r.ready,
        ping: r.ping.ms,
      })),
    ];
    this.lobby = {
      ...this.lobby, players, isHost: true, mode: this.hostConfig.mode, code: this.net.code,
    };
    this.net.sendCtrl({
      t: 'lobby', players, mode: this.hostConfig.mode, code: this.net.code,
    });
    if (this.menus.screen === 'lobby') this.menus.show('lobby', this.lobby);
  }

  onLobbyMessage(msg) {
    this.lobby = {
      ...this.lobby, players: msg.players, mode: msg.mode, code: msg.code, isHost: false,
    };
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
    const config = { ...this.hostConfig, seed: (Math.random() * 1e9) | 0 };
    const peers = this.net.peerList().filter((r) => r.profile);
    const humans = [
      { id: 'host', name: this.hostProfile.name, charId: this.hostProfile.charId },
      ...peers.map((r) => ({
        id: r.id, name: r.profile.name || 'Player',
        charId: r.profile.charId || 'volley', netRec: r,
      })),
    ];
    const roster = this.buildRoster(config, humans);

    // Each client needs to know which slot is theirs.
    const wire = roster.map((r) => ({
      id: r.id, name: r.name, charId: r.charId, team: r.team,
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
