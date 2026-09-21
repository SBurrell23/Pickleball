// Peer-to-peer transport. The host is authoritative: it runs the simulation
// and broadcasts snapshots; clients stream input and render an interpolated
// view of the host's world.
//
// Each peer link uses two data channels:
//   ctrl  - reliable+ordered, for lobby/handshake/control
//   fast  - unreliable, for input and snapshots (dropping one is cheaper than
//           waiting for a retransmit)

const PROTOCOL = 3;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no look-alikes
const PREFIX = 'pkbl-';

export const PING_INTERVAL = 0.35;
export const SNAPSHOT_HZ = 25;

function makeCode(n = 5) {
  let s = '';
  const buf = new Uint32Array(n);
  (globalThis.crypto || {}).getRandomValues?.(buf);
  for (let i = 0; i < n; i++) {
    const r = buf[i] || Math.floor(Math.random() * 0xffffffff);
    s += CODE_ALPHABET[r % CODE_ALPHABET.length];
  }
  return s;
}

// Rolling latency estimate. Uses the lowest recent RTTs, which tracks the real
// path latency instead of being dragged around by occasional spikes.
class PingTracker {
  constructor() {
    this.samples = [];
    this.rtt = 0.08;
    this.offset = 0;
    this.jitter = 0.01;
    this.pending = new Map();
    this.seq = 0;
    this.lastSent = 0;
    this.loss = 0;
    this.sent = 0;
    this.recv = 0;
  }

  nextPing(now) {
    this.seq++;
    this.sent++;
    this.pending.set(this.seq, now);
    // Anything older than 3s is never coming back.
    for (const [k, t] of this.pending) if (now - t > 3) this.pending.delete(k);
    this.lastSent = now;
    return this.seq;
  }

  onPong(id, sentAt, remoteTime, now) {
    const t0 = this.pending.get(id) ?? sentAt;
    this.pending.delete(id);
    this.recv++;
    const rtt = Math.max(0, now - t0);
    this.samples.push(rtt);
    if (this.samples.length > 24) this.samples.shift();

    const sorted = [...this.samples].sort((a, b) => a - b);
    // Median of the fastest third: a stable floor for the link.
    const lo = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 3)));
    const base = lo[Math.floor(lo.length / 2)];
    this.rtt = this.rtt * 0.65 + base * 0.35;

    let acc = 0;
    for (const s of sorted) acc += Math.abs(s - base);
    this.jitter = sorted.length ? acc / sorted.length : 0;

    // Remote clock offset, corrected for one-way trip.
    const est = remoteTime + rtt / 2 - now;
    this.offset = this.offset === 0 ? est : this.offset * 0.88 + est * 0.12;
    this.loss = this.sent > 0 ? Math.max(0, 1 - this.recv / this.sent) : 0;
  }

  get ms() { return this.rtt * 1000; }
}

export class Net {
  constructor(handlers = {}) {
    this.h = handlers;
    this.peer = null;
    this.isHost = false;
    this.code = null;
    this.selfId = null;
    this.peers = new Map();   // peerId -> { ctrl, fast, ping, profile, slot, alive }
    this.hostLink = null;     // client side
    this.ping = new PingTracker();
    this.clockStart = performance.now() / 1000;
    this.destroyed = false;
    this.inputSeq = 0;
    this.status = 'idle';
    this.rejected = false;
  }

  now() { return performance.now() / 1000 - this.clockStart; }

  _status(s, detail) {
    this.status = s;
    this.h.onStatus?.(s, detail);
  }

  _lib() {
    const P = window.Peer;
    if (!P) throw new Error('PeerJS failed to load');
    return P;
  }

  _peerOptions() {
    return {
      debug: 0,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' },
        ],
      },
    };
  }

  // ---- hosting -----------------------------------------------------------

  host(profile, config) {
    return new Promise((resolve, reject) => {
      const Peer = this._lib();
      this.isHost = true;
      this.profile = profile;
      this.config = config;
      this.code = makeCode();
      this._status('connecting', 'Creating room');

      const attempt = (tries) => {
        const id = PREFIX + this.code;
        const peer = new Peer(id, this._peerOptions());
        this.peer = peer;

        peer.on('open', (pid) => {
          this.selfId = pid;
          this._status('hosting', this.code);
          resolve(this.code);
        });
        peer.on('connection', (conn) => this._onHostConnection(conn));
        peer.on('error', (err) => {
          if (err.type === 'unavailable-id' && tries > 0) {
            // Code collision on the signalling server: pick another.
            peer.destroy();
            this.code = makeCode();
            attempt(tries - 1);
            return;
          }
          if (this.status === 'connecting') {
            this._status('error', this._explain(err));
            reject(err);
          } else {
            this.h.onError?.(this._explain(err));
          }
        });
        peer.on('disconnected', () => {
          if (!this.destroyed) peer.reconnect();
        });
      };
      attempt(4);
    });
  }

  _onHostConnection(conn) {
    const pid = conn.peer;
    let rec = this.peers.get(pid);
    if (!rec) {
      rec = {
        id: pid, ctrl: null, fast: null, ping: new PingTracker(),
        profile: null, alive: true, lastInput: null, lastAppliedSeq: 0,
      };
      this.peers.set(pid, rec);
    }
    if (conn.label === 'fast') rec.fast = conn;
    else rec.ctrl = conn;

    conn.on('data', (msg) => this._onHostMessage(rec, msg));
    conn.on('close', () => this._dropPeer(pid, 'left the match'));
    conn.on('error', () => this._dropPeer(pid, 'connection error'));
  }

  _dropPeer(pid, why) {
    const rec = this.peers.get(pid);
    if (!rec || !rec.alive) return;
    rec.alive = false;
    this.peers.delete(pid);
    this.h.onPeerLeft?.(rec, why);
  }

  // ---- joining -----------------------------------------------------------

  join(code, profile) {
    return new Promise((resolve, reject) => {
      const Peer = this._lib();
      this.isHost = false;
      this.profile = profile;
      this.code = String(code || '').trim().toUpperCase();
      if (!this.code) { reject(new Error('Enter a room code')); return; }
      this._status('connecting', 'Looking for room');

      const peer = new Peer(null, this._peerOptions());
      this.peer = peer;
      let settled = false;

      const fail = (msg) => {
        if (settled) return;
        settled = true;
        this._status('error', msg);
        reject(new Error(msg));
      };

      const timeout = setTimeout(() => fail('No answer from that room code'), 15000);

      peer.on('open', (pid) => {
        this.selfId = pid;
        const target = PREFIX + this.code;
        const ctrl = peer.connect(target, { label: 'ctrl', reliable: true, serialization: 'json' });
        const fast = peer.connect(target, { label: 'fast', reliable: false, serialization: 'json' });
        this.hostLink = { ctrl, fast, ping: this.ping };

        ctrl.on('open', () => {
          clearTimeout(timeout);
          settled = true;
          this._status('connected');
          this.sendCtrl({ t: 'hello', v: PROTOCOL, profile });
          resolve();
        });
        ctrl.on('data', (m) => this._onClientMessage(m));
        ctrl.on('close', () => {
          // A rejected peer already got the real reason; the channel closing
          // straight afterwards is expected, not a second failure.
          if (this.rejected) return;
          this.h.onDisconnected?.('Host closed the match');
        });
        ctrl.on('error', () => fail('Could not reach that room'));
        fast.on('data', (m) => this._onClientMessage(m));
        fast.on('error', () => { /* unreliable channel; ignore transient errors */ });
      });

      peer.on('error', (err) => {
        clearTimeout(timeout);
        const msg = this._explain(err);
        if (!settled) fail(msg);
        else this.h.onError?.(msg);
      });
      peer.on('disconnected', () => { if (!this.destroyed) peer.reconnect(); });
    });
  }

  _explain(err) {
    switch (err && err.type) {
      case 'peer-unavailable': return 'No room with that code';
      case 'unavailable-id': return 'Room code already in use';
      case 'network': return 'Lost contact with the matchmaking server';
      case 'server-error': return 'Matchmaking server is unavailable';
      case 'browser-incompatible': return 'This browser cannot do WebRTC';
      case 'webrtc': return 'WebRTC error establishing the link';
      default: return (err && err.message) || 'Connection failed';
    }
  }

  // ---- sending -----------------------------------------------------------

  sendCtrl(msg, targetId = null) {
    if (this.isHost) {
      for (const rec of this.peers.values()) {
        if (targetId && rec.id !== targetId) continue;
        if (rec.ctrl && rec.ctrl.open) { try { rec.ctrl.send(msg); } catch { /* channel closing */ } }
      }
    } else if (this.hostLink?.ctrl?.open) {
      try { this.hostLink.ctrl.send(msg); } catch { /* channel closing */ }
    }
  }

  sendFast(msg, targetId = null) {
    if (this.isHost) {
      for (const rec of this.peers.values()) {
        if (targetId && rec.id !== targetId) continue;
        const c = rec.fast && rec.fast.open ? rec.fast : rec.ctrl;
        if (c && c.open) { try { c.send(msg); } catch { /* dropped */ } }
      }
    } else {
      const c = this.hostLink?.fast?.open ? this.hostLink.fast : this.hostLink?.ctrl;
      if (c && c.open) { try { c.send(msg); } catch { /* dropped */ } }
    }
  }

  // ---- ping loop ---------------------------------------------------------

  tick(dt) {
    const now = this.now();
    if (this.isHost) {
      for (const rec of this.peers.values()) {
        if (now - rec.ping.lastSent >= PING_INTERVAL) {
          this.sendFast({ t: 'ping', i: rec.ping.nextPing(now), c: now }, rec.id);
        }
      }
    } else if (this.hostLink) {
      if (now - this.ping.lastSent >= PING_INTERVAL) {
        this.sendFast({ t: 'ping', i: this.ping.nextPing(now), c: now });
      }
    }
  }

  // ---- message handling --------------------------------------------------

  _onHostMessage(rec, msg) {
    if (!msg || typeof msg !== 'object') return;
    const now = this.now();
    switch (msg.t) {
      case 'hello':
        if (msg.v !== PROTOCOL) {
          this.sendCtrl({ t: 'reject', why: 'Different game version -- both sides need to reload' }, rec.id);
          return;
        }
        rec.profile = msg.profile || {};
        this.h.onPeerJoined?.(rec);
        break;
      case 'ping':
        this.sendFast({ t: 'pong', i: msg.i, c: msg.c, r: now }, rec.id);
        break;
      case 'pong':
        rec.ping.onPong(msg.i, msg.c, msg.r, now);
        break;
      case 'profile':
        // Character swapped in the lobby. Kept separate from 'ready' so it
        // does not have to masquerade as a readiness toggle.
        rec.profile = { ...rec.profile, ...msg.profile };
        this.h.onLobbyChange?.();
        break;
      case 'ready':
        rec.profile = { ...rec.profile, ...msg.profile };
        rec.ready = !!msg.ready;
        this.h.onLobbyChange?.();
        break;
      case 'in':
        rec.lastInput = msg;
        this.h.onInput?.(rec, msg);
        break;
      case 'sw':
        this.h.onSwing?.(rec, msg);
        break;
      case 'chat':
        this.h.onChat?.(rec, String(msg.m || '').slice(0, 160));
        break;
      default:
        break;
    }
  }

  _onClientMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    const now = this.now();
    switch (msg.t) {
      case 'ping':
        this.sendFast({ t: 'pong', i: msg.i, c: msg.c, r: now });
        break;
      case 'pong':
        this.ping.onPong(msg.i, msg.c, msg.r, now);
        break;
      case 'lobby':
        this.h.onLobby?.(msg);
        break;
      case 'start':
        this.h.onStart?.(msg);
        break;
      case 'toLobby':
        this.h.onReturnToLobby?.();
        break;
      case 'snap':
        this.h.onSnapshot?.(msg);
        break;
      case 'ev':
        this.h.onEvents?.(msg.e || []);
        break;
      case 'reject':
        this.rejected = true;
        this.h.onDisconnected?.(msg.why || 'Rejected by host');
        break;
      case 'chat':
        this.h.onChat?.(null, String(msg.m || '').slice(0, 160));
        break;
      default:
        break;
    }
  }

  // ---- gameplay helpers --------------------------------------------------

  sendInput(inp) {
    this.inputSeq++;
    this.sendFast({
      t: 'in', s: this.inputSeq,
      mx: +inp.mx.toFixed(3), mz: +inp.mz.toFixed(3),
      ax: +inp.ax.toFixed(2), az: +inp.az.toFixed(2),
      ch: inp.charging ? 1 : 0, cv: +(inp.chargeVis || 0).toFixed(3),
      d: inp.dash ? 1 : 0,
    });
    return this.inputSeq;
  }

  sendSwing(payload) {
    // Control channel: a lost swing is a lost point, so this one must arrive.
    // Envelope keys last, so a payload field can never shadow the message type.
    this.sendCtrl({ ...payload, ct: this.now(), t: 'sw' });
  }

  broadcastEvents(events) {
    if (!events.length) return;
    this.sendCtrl({ t: 'ev', e: events });
  }

  // Host-side view of how far behind a given client's perception is: half the
  // round trip plus the interpolation delay they render at.
  rewindFor(rec, interpDelay) {
    if (!rec) return 0;
    return Math.min(0.28, rec.ping.rtt / 2 + interpDelay);
  }

  peerList() { return [...this.peers.values()]; }

  get pingMs() {
    if (this.isHost) {
      const l = this.peerList();
      if (!l.length) return 0;
      return Math.max(...l.map((r) => r.ping.ms));
    }
    return this.ping.ms;
  }

  close() {
    this.destroyed = true;
    try {
      for (const rec of this.peers.values()) {
        rec.ctrl?.close(); rec.fast?.close();
      }
      this.hostLink?.ctrl?.close();
      this.hostLink?.fast?.close();
      this.peer?.destroy();
    } catch { /* already torn down */ }
    this.peers.clear();
    this.hostLink = null;
    this.peer = null;
    this._status('idle');
  }
}
