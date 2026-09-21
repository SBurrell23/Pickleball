// Every sound effect in the game is synthesized here; the only audio file is
// the background music track.
// Layout: sources -> bus (sfx / music / ambience) -> master -> limiter -> out.

const MUSIC_TRACK = 'assets/audio/arcade-fun-time.mp3';

export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.ready = false;
    this.started = false;
    this.musicTimer = null;
    this.step = 0;
    this.nextNoteTime = 0;
    this.bpm = 104;
    this.chargeVoice = null;
    this.musicEl = null;
    this.suspendedByBlur = false;
  }

  // Must be called from a user gesture or the context stays suspended.
  init() {
    if (this.ctx) return this.resume();
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -8;
    this.limiter.knee.value = 8;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.2;
    this.limiter.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.connect(this.limiter);

    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.ambBus = ctx.createGain();
    for (const b of [this.sfxBus, this.musicBus, this.ambBus]) b.connect(this.master);

    // A little room on the impacts, built from a synthesized impulse.
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(1.6, 2.6);
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.16;
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.master);

    this.noiseBuf = this._noiseBuffer(2.0);
    this.ready = true;
    this.applySettings();
    this._startAmbience();
    return this.resume();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') return this.ctx.resume();
  }

  applySettings() {
    if (!this.ready) return;
    const s = this.settings.all();
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.master, t, 0.02);
    this.sfxBus.gain.setTargetAtTime(s.sfx, t, 0.02);
    this.musicBus.gain.setTargetAtTime(s.music * 0.5, t, 0.05);
    this.ambBus.gain.setTargetAtTime(s.ambience * 0.6, t, 0.05);
  }

  setMuted(m) {
    if (!this.ready) return;
    this.master.gain.setTargetAtTime(m ? 0 : this.settings.get('master'),
      this.ctx.currentTime, 0.03);
  }

  // ---- primitives --------------------------------------------------------

  _noiseBuffer(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  _noise(bus, { dur = 0.1, type = 'bandpass', freq = 1200, q = 1, gain = 0.5,
    attack = 0.001, sweepTo = null, playbackRate = 1, send = 0 } = {}) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = playbackRate;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.setValueAtTime(freq, t);
    filt.Q.value = q;
    if (sweepTo) filt.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt); filt.connect(g); g.connect(bus);
    if (send > 0) { const sg = ctx.createGain(); sg.gain.value = send; g.connect(sg); sg.connect(this.reverb); }
    src.start(t);
    src.stop(t + dur + 0.02);
    return { src, g };
  }

  _tone(bus, { freq = 440, dur = 0.15, type = 'sine', gain = 0.3, attack = 0.002,
    endFreq = null, delay = 0, send = 0 } = {}) {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(bus);
    if (send > 0) { const sg = ctx.createGain(); sg.gain.value = send; g.connect(sg); sg.connect(this.reverb); }
    osc.start(t);
    osc.stop(t + dur + 0.02);
    return { osc, g };
  }

  // ---- game sounds -------------------------------------------------------

  // The pickleball "POCK": a hollow perforated plastic ball against a stiff
  // composite face. It is almost all transient -- a hard bright click, a short
  // hollow body resonance, and nothing sustained. Power raises pitch and level.
  paddleHit(power = 0.5, quality = 'good') {
    if (!this.ready) return;
    const p = Math.max(0, Math.min(1, power));

    // The click itself: very short, very bright.
    this._noise(this.sfxBus, {
      dur: 0.022 + p * 0.008, type: 'bandpass', freq: 2600 + p * 2200, q: 0.9,
      gain: 0.34 + p * 0.30, send: 0.28,
    });
    // Hollow body of the ball, dropping fast.
    const body = 540 + p * 330;
    this._tone(this.sfxBus, {
      freq: body, endFreq: body * 0.62, dur: 0.055, type: 'triangle',
      gain: 0.24 + p * 0.20, send: 0.3,
    });
    // The ring off the paddle face.
    this._tone(this.sfxBus, {
      freq: 1450 + p * 700, endFreq: 900 + p * 400, dur: 0.038, type: 'sine',
      gain: 0.14 + p * 0.12, send: 0.2,
    });
    // Air moving through the holes.
    this._noise(this.sfxBus, {
      dur: 0.05, type: 'highpass', freq: 5200, gain: 0.05 + p * 0.06,
    });

    if (quality === 'perfect') this.perfectChime();
    if (quality === 'weak') {
      // Off-centre: duller, with the frame buzz instead of the sweet spot.
      this._noise(this.sfxBus, { dur: 0.10, type: 'bandpass', freq: 300, q: 1.4, gain: 0.20 });
    }
  }

  perfectChime(big = false) {
    if (!this.ready) return;
    const g = big ? 0.22 : 0.13;
    this._tone(this.sfxBus, { freq: 1320, dur: 0.22, type: 'sine', gain: g, send: 0.5 });
    this._tone(this.sfxBus, { freq: 1980, dur: 0.18, type: 'sine', gain: g * 0.6, delay: 0.015, send: 0.5 });
    if (big) this._tone(this.sfxBus, { freq: 2640, dur: 0.3, type: 'sine', gain: 0.08, delay: 0.03, send: 0.6 });
  }

  // Off the court surface: the same hollow ball, but against something dead.
  // Duller and shorter than the paddle, with no ring.
  bounce(speed = 8) {
    if (!this.ready) return;
    const v = Math.max(0, Math.min(1, speed / 22));
    this._noise(this.sfxBus, {
      dur: 0.028, type: 'bandpass', freq: 1500 + v * 900, q: 1.1,
      gain: 0.10 + v * 0.20, send: 0.2,
    });
    this._tone(this.sfxBus, {
      freq: 400 + v * 210, endFreq: 190, dur: 0.055, type: 'triangle',
      gain: 0.13 + v * 0.18, send: 0.18,
    });
    this._noise(this.sfxBus, {
      dur: 0.04, type: 'highpass', freq: 4200, gain: 0.03 + v * 0.04,
    });
  }

  // Chain-link: a bright metallic rattle that dies immediately.
  fenceHit(speed = 6) {
    if (!this.ready) return;
    const v = Math.max(0, Math.min(1, speed / 16));
    this._noise(this.sfxBus, {
      dur: 0.14, type: 'bandpass', freq: 3400, q: 0.7, gain: 0.10 + v * 0.16,
      sweepTo: 1800, send: 0.2,
    });
    for (let i = 0; i < 3; i++) {
      this._tone(this.sfxBus, {
        freq: 1900 + i * 640 + Math.random() * 200, dur: 0.07, type: 'sine',
        gain: 0.035 + v * 0.03, delay: i * 0.012,
      });
    }
  }

  netHit() {
    if (!this.ready) return;
    this._noise(this.sfxBus, { dur: 0.16, type: 'lowpass', freq: 700, gain: 0.3, sweepTo: 220, send: 0.2 });
    this._tone(this.sfxBus, { freq: 130, endFreq: 70, dur: 0.14, type: 'sine', gain: 0.14 });
  }

  whiff() {
    if (!this.ready) return;
    this._noise(this.sfxBus, {
      dur: 0.19, type: 'bandpass', freq: 1500, sweepTo: 380, q: 0.8, gain: 0.17,
    });
  }

  dash() {
    if (!this.ready) return;
    this._noise(this.sfxBus, {
      dur: 0.22, type: 'bandpass', freq: 500, sweepTo: 1700, q: 0.7, gain: 0.14,
    });
  }

  // Rising tone while the power bar fills; pitch tracks the bar exactly so you
  // can time the release by ear as well as by eye.
  chargeStart() {
    if (!this.ready || this.chargeVoice) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 1400;
    osc.type = 'sawtooth';
    osc.frequency.value = 160;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.055, ctx.currentTime + 0.05);
    osc.connect(filt); filt.connect(g); g.connect(this.sfxBus);
    osc.start();
    this.chargeVoice = { osc, g, filt };
  }

  chargeUpdate(t01, inSweet) {
    if (!this.chargeVoice) return;
    const now = this.ctx.currentTime;
    const f = 160 + Math.pow(Math.max(0, t01), 1.15) * 420;
    this.chargeVoice.osc.frequency.setTargetAtTime(f, now, 0.02);
    this.chargeVoice.filt.frequency.setTargetAtTime(inSweet ? 3200 : 1200, now, 0.03);
    this.chargeVoice.g.gain.setTargetAtTime(inSweet ? 0.085 : 0.05, now, 0.03);
  }

  chargeStop() {
    if (!this.chargeVoice) return;
    const { osc, g } = this.chargeVoice;
    const t = this.ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(Math.max(0.0002, g.gain.value), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    osc.stop(t + 0.09);
    this.chargeVoice = null;
  }

  // Fast ticking while the kitchen needle sweeps, so the reaction test has an
  // audible pulse too.
  needleTick(edge = false) {
    if (!this.ready) return;
    this._tone(this.sfxBus, {
      freq: edge ? 880 : 1500, dur: 0.03, type: 'square', gain: edge ? 0.03 : 0.045,
    });
  }

  pointWon(won) {
    if (!this.ready) return;
    const notes = won ? [523.25, 659.25, 783.99, 1046.5] : [659.25, 587.33, 493.88, 392.0];
    notes.forEach((f, i) => {
      this._tone(this.musicBus, {
        freq: f, dur: 0.30, type: 'triangle', gain: 0.24, delay: i * 0.075, send: 0.4,
      });
    });
    if (won) this.cheer(0.7);
  }

  gameOver(won) {
    if (!this.ready) return;
    const seq = won
      ? [523.25, 659.25, 783.99, 1046.5, 1318.5]
      : [440, 415.3, 392, 349.23];
    seq.forEach((f, i) => {
      this._tone(this.musicBus, {
        freq: f, dur: 0.6, type: 'triangle', gain: 0.26, delay: i * 0.13, send: 0.6,
      });
      this._tone(this.musicBus, {
        freq: f * 2, dur: 0.4, type: 'sine', gain: 0.08, delay: i * 0.13, send: 0.6,
      });
    });
    if (won) this.cheer(1.0);
  }

  cheer(intensity = 0.6) {
    if (!this.ready) return;
    const dur = 1.1 + intensity * 1.0;
    this._noise(this.ambBus, {
      dur, type: 'bandpass', freq: 700, q: 0.6, gain: 0.12 * intensity,
      attack: 0.12, sweepTo: 1500,
    });
    this._noise(this.ambBus, {
      dur: dur * 0.8, type: 'highpass', freq: 1800, gain: 0.05 * intensity, attack: 0.2,
    });
  }

  uiClick() { if (this.ready) this._tone(this.sfxBus, { freq: 660, endFreq: 880, dur: 0.06, type: 'square', gain: 0.07 }); }
  uiHover() { if (this.ready) this._tone(this.sfxBus, { freq: 440, dur: 0.035, type: 'sine', gain: 0.035 }); }
  uiBack() { if (this.ready) this._tone(this.sfxBus, { freq: 500, endFreq: 300, dur: 0.09, type: 'square', gain: 0.07 }); }
  countdown(last = false) {
    if (!this.ready) return;
    this._tone(this.sfxBus, { freq: last ? 880 : 520, dur: last ? 0.4 : 0.14, type: 'triangle', gain: 0.16, send: 0.3 });
  }

  // ---- ambience ----------------------------------------------------------

  _startAmbience() {
    const ctx = this.ctx;
    // A steady low crowd murmur, gently modulated so it never sits still.
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 620; lp.Q.value = 0.4;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 160;
    const g = ctx.createGain();
    g.gain.value = 0.055;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.022;
    lfo.connect(lfoGain); lfoGain.connect(g.gain);
    src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(this.ambBus);
    src.start(); lfo.start();
    this.ambience = { src, g, lfo };
  }

  // ---- music -------------------------------------------------------------

  // The soundtrack is a real file, streamed through a media element rather than
  // decoded with decodeAudioData: it is nine minutes long, and decoding it to
  // PCM would sit on a couple of hundred megabytes of memory for no benefit.
  // Routing it through the music bus keeps the volume slider working on it.
  startMusic() {
    if (!this.ready || this.musicEl || this.musicTimer) return;
    let el;
    try {
      el = new Audio(MUSIC_TRACK);
      el.loop = true;
      el.preload = 'auto';
      el.crossOrigin = 'anonymous';
      const node = this.ctx.createMediaElementSource(el);
      node.connect(this.musicBus);
    } catch {
      this._startSynthMusic();
      return;
    }
    this.musicEl = el;
    // If the file cannot be fetched or played, fall back to the synthesized
    // loop so the game is never silent.
    el.addEventListener('error', () => this._fallbackToSynth(), { once: true });
    const played = el.play();
    if (played && played.catch) played.catch(() => this._fallbackToSynth());
  }

  _fallbackToSynth() {
    if (this.musicEl) {
      try { this.musicEl.pause(); } catch { /* already gone */ }
      this.musicEl = null;
    }
    this._startSynthMusic();
  }

  stopMusic() {
    if (this.musicEl) {
      try { this.musicEl.pause(); } catch { /* already gone */ }
      this.musicEl = null;
    }
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
  }

  // Fallback only: the procedural loop that shipped before the track existed.
  _startSynthMusic() {
    if (!this.ready || this.musicTimer) return;
    this.step = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.musicTimer = setInterval(() => this._schedule(), 25);
  }

  _schedule() {
    if (!this.ready) return;
    const secPerStep = 60 / this.bpm / 4; // sixteenths
    while (this.nextNoteTime < this.ctx.currentTime + 0.12) {
      this._playStep(this.step, this.nextNoteTime);
      this.nextNoteTime += secPerStep;
      this.step = (this.step + 1) % 64;
    }
  }

  _playStep(step, time) {
    const ctx = this.ctx;
    const bar = Math.floor(step / 16);
    const s = step % 16;
    // i - VI - III - VII in A minor, the usual sports-menu loop.
    const roots = [110.0, 87.31, 130.81, 98.0];
    const root = roots[bar];

    const note = (freq, dur, type, gain, dly = 0) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      const t = time + dly;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.musicBus);
      o.start(t); o.stop(t + dur + 0.02);
    };

    if (s % 4 === 0) note(root / 2, 0.30, 'triangle', 0.17);      // bass
    if (s === 6 || s === 14) note(root / 2, 0.16, 'triangle', 0.11);

    // Plucky arpeggio over the top.
    const arp = [1, 1.5, 2, 2.5, 3, 2.5, 2, 1.5];
    if (s % 2 === 0) {
      const f = root * arp[(s / 2) % arp.length];
      note(f, 0.13, 'square', 0.035);
      note(f * 2.005, 0.09, 'sine', 0.018);
    }

    // Percussion
    if (s % 8 === 0) {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(140, time);
      o.frequency.exponentialRampToValueAtTime(45, time + 0.12);
      g.gain.setValueAtTime(0.28, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.15);
      o.connect(g); g.connect(this.musicBus);
      o.start(time); o.stop(time + 0.17);
    }
    if (s % 4 === 2) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass'; f.frequency.value = 7000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.05, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);
      src.connect(f); f.connect(g); g.connect(this.musicBus);
      src.start(time); src.stop(time + 0.06);
    }
  }
}
