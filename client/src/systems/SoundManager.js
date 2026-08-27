// Procedural WebAudio sounds — no audio files required
export default class SoundManager {
  constructor() {
    this._ctx = null;
    this._muted = false;
    this._masterGain = null;
    this._init();
  }

  _init() {
    try {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      this._masterGain = this._ctx.createGain();
      this._masterGain.gain.value = 0.5;
      this._masterGain.connect(this._ctx.destination);
    } catch {
      // Audio not supported
    }
  }

  _resume() {
    if (this._ctx?.state === 'suspended') this._ctx.resume();
  }

  _tone(freq, type, duration, gainVal = 0.4, startTime = 0) {
    if (!this._ctx || this._muted) return;
    this._resume();
    const t = this._ctx.currentTime + startTime;
    const osc = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(gainVal, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(this._masterGain);
    osc.start(t);
    osc.stop(t + duration);
  }

  _noise(duration, gainVal = 0.3, startTime = 0) {
    if (!this._ctx || this._muted) return;
    this._resume();
    const t = this._ctx.currentTime + startTime;
    const bufSize = this._ctx.sampleRate * duration;
    const buf = this._ctx.createBuffer(1, bufSize, this._ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src = this._ctx.createBufferSource();
    src.buffer = buf;
    const filter = this._ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 400;
    filter.Q.value = 0.5;
    const gain = this._ctx.createGain();
    gain.gain.setValueAtTime(gainVal, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this._masterGain);
    src.start(t);
    src.stop(t + duration);
  }

  // ── Game sounds ──────────────────────────────────────────────────────────

  playJump() {
    this._tone(220, 'sine', 0.08, 0.3);
    this._tone(440, 'sine', 0.12, 0.2, 0.05);
  }

  playLand() {
    this._noise(0.08, 0.2);
    this._tone(80, 'sine', 0.15, 0.3);
  }

  playCollect() {
    // Sparkly ascending arpeggio
    [523, 659, 784, 1047].forEach((f, i) => {
      this._tone(f, 'sine', 0.18, 0.25, i * 0.07);
    });
  }

  playBetPlace() {
    this._tone(440, 'square', 0.04, 0.15);
    this._tone(550, 'square', 0.04, 0.15, 0.05);
  }

  playCashout() {
    // Ching-ching: two metallic coin ring strikes
    if (!this._ctx || this._muted) return;
    this._resume();
    const ching = (delay) => {
      [[1760, 0.5], [2960, 0.28], [4800, 0.12], [7200, 0.06]].forEach(([freq, g]) => {
        const osc = this._ctx.createOscillator();
        const gain = this._ctx.createGain();
        const t = this._ctx.currentTime + delay;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(g, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
        osc.connect(gain); gain.connect(this._masterGain);
        osc.start(t); osc.stop(t + 0.55);
      });
      this._noise(0.025, 0.5, delay); // click transient
    };
    ching(0);
    ching(0.22);
  }

  playCrash() {
    // Water crash — loud splash + deep rumble
    if (!this._ctx || this._muted) return;
    this._resume();
    const t = this._ctx.currentTime;
    const mkNoise = (startT, dur, gainVal, lpFreq) => {
      const bufSize = Math.ceil(this._ctx.sampleRate * dur);
      const buf = this._ctx.createBuffer(1, bufSize, this._ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
      const src = this._ctx.createBufferSource();
      src.buffer = buf;
      const filt = this._ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = lpFreq;
      const gain = this._ctx.createGain();
      gain.gain.setValueAtTime(gainVal, t + startT);
      gain.gain.exponentialRampToValueAtTime(0.001, t + startT + dur);
      src.connect(filt); filt.connect(gain); gain.connect(this._masterGain);
      src.start(t + startT); src.stop(t + startT + dur);
    };
    mkNoise(0, 0.9, 1.4, 600);   // low water body
    mkNoise(0, 0.5, 0.9, 3500);  // mid splash
    mkNoise(0, 0.25, 0.5, 9000); // high sparkle
    // Deep thud
    const osc = this._ctx.createOscillator();
    const g = this._ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(22, t + 0.35);
    g.gain.setValueAtTime(0.8, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(g); g.connect(this._masterGain);
    osc.start(t); osc.stop(t + 0.35);
  }

  playJumpScareCrash() {
    // Sudden boom for jump scare moment
    if (!this._ctx || this._muted) return;
    this._resume();
    const t = this._ctx.currentTime;
    const bufSize = Math.ceil(this._ctx.sampleRate * 0.06);
    const buf = this._ctx.createBuffer(1, bufSize, this._ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
    const src = this._ctx.createBufferSource();
    src.buffer = buf;
    const g = this._ctx.createGain();
    g.gain.setValueAtTime(2.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    src.connect(g); g.connect(this._masterGain);
    src.start(t); src.stop(t + 0.1);
    // Follow immediately with water crash
    this.playCrash();
  }

  playExplosion() {
    this._noise(0.5, 0.5);
    this._tone(60, 'sine', 0.4, 0.5);
    this._tone(120, 'sine', 0.3, 0.4, 0.05);
  }

  playFloodWarning() {
    // Ominous deep rumble + alert beeps
    this._tone(55, 'sine', 0.9, 0.4);
    this._tone(110, 'sine', 0.6, 0.25, 0.1);
    this._noise(0.4, 0.12, 0.05);
    [0.3, 0.65, 1.0].forEach(d => {
      this._tone(880, 'square', 0.12, 0.22, d);
      this._tone(660, 'square', 0.10, 0.15, d + 0.12);
    });
  }

  playFloodRise() {
    this._noise(0.2, 0.15);
    this._tone(100, 'sine', 0.4, 0.2);
  }

  playShock() {
    // Electric buzz
    this._tone(800, 'square', 0.15, 0.3);
    this._tone(600, 'square', 0.15, 0.2, 0.05);
    this._tone(900, 'square', 0.1, 0.15, 0.1);
  }

  playMagicWorm() {
    // Ascending magical chime — sparkly wonder feeling
    [523, 659, 784, 988, 1319, 1568].forEach((f, i) => {
      this._tone(f, 'sine', 0.25, 0.20, i * 0.08);
    });
    this._noise(0.06, 0.05, 0.35);
  }

  playSlip() {
    // Silk friction squeak — descending pitch like thread sliding through spinnerets
    this._tone(1100, 'sine', 0.04, 0.13);
    this._tone(750,  'sine', 0.06, 0.11, 0.03);
    this._tone(380,  'sine', 0.07, 0.08, 0.07);
    this._noise(0.05, 0.07, 0.02);
  }

  playTick() {
    this._tone(800, 'sine', 0.03, 0.05);
  }

  // ── Background Music ─────────────────────────────────────────────────────

  startBgMusic() {
    if (!this._ctx || this._bgRunning) return;
    this._resume();
    this._bgRunning = true;

    this._bgGain = this._ctx.createGain();
    this._bgGain.gain.value = 0;
    this._bgGain.connect(this._ctx.destination);

    const now = this._ctx.currentTime;
    this._bgGain.gain.setValueAtTime(0, now);
    this._bgGain.gain.linearRampToValueAtTime(0.20, now + 3);

    this._bgOscs = [];

    // ── Deep pipe rumble — pressurised water far away ────────────────────
    const makeDrone = (freq, vol, lfoRate) => {
      const osc  = this._ctx.createOscillator();
      const lfo  = this._ctx.createOscillator();
      const lfoG = this._ctx.createGain();
      const gain = this._ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = freq;
      lfo.type = 'sine'; lfo.frequency.value = lfoRate;
      lfoG.gain.value = vol * 0.20;
      gain.gain.value = vol;
      lfo.connect(lfoG); lfoG.connect(gain.gain);
      osc.connect(gain); gain.connect(this._bgGain);
      osc.start(); lfo.start();
      this._bgOscs.push(osc, lfo);
    };
    makeDrone(40,  0.50, 0.07);   // sub rumble
    makeDrone(55,  0.28, 0.13);   // A1 bass
    makeDrone(110, 0.10, 0.21);   // A2 octave harmonic

    // ── Continuous distant water rush (looping noise) ─────────────────────
    const rushBuf = this._ctx.createBuffer(1, this._ctx.sampleRate * 2, this._ctx.sampleRate);
    const rd = rushBuf.getChannelData(0);
    for (let i = 0; i < rd.length; i++) rd[i] = Math.random() * 2 - 1;
    const rushSrc = this._ctx.createBufferSource();
    rushSrc.buffer = rushBuf; rushSrc.loop = true;
    const rushLp = this._ctx.createBiquadFilter();
    rushLp.type = 'lowpass'; rushLp.frequency.value = 220;
    const rushGain = this._ctx.createGain();
    rushGain.gain.value = 0.055;
    rushSrc.connect(rushLp); rushLp.connect(rushGain); rushGain.connect(this._bgGain);
    rushSrc.start();
    this._bgOscs.push(rushSrc);

    // ── Hollow pipe drip synthesiser ──────────────────────────────────────
    // Each drip: water transient + bubble frequency sweep + hollow resonance + echo
    const _drip = (freq, vol, at = 0) => {
      if (!this._ctx || this._muted) return;
      const t = this._ctx.currentTime + at;

      // Plop transient — bandpass noise burst
      const nb = this._ctx.createBuffer(1, Math.ceil(this._ctx.sampleRate * 0.03), this._ctx.sampleRate);
      const nd = nb.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      const ns = this._ctx.createBufferSource(); ns.buffer = nb;
      const nf = this._ctx.createBiquadFilter();
      nf.type = 'bandpass'; nf.frequency.value = freq * 2.2; nf.Q.value = 7;
      const ng = this._ctx.createGain();
      ng.gain.setValueAtTime(vol * 0.75, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
      ns.connect(nf); nf.connect(ng); ng.connect(this._bgGain);
      ns.start(t); ns.stop(t + 0.035);

      // Bubble oscillation — frequency sweeps down as bubble collapses (the "hollow" character)
      const bOsc = this._ctx.createOscillator();
      bOsc.type = 'sine';
      bOsc.frequency.setValueAtTime(freq * 1.5, t);
      bOsc.frequency.exponentialRampToValueAtTime(freq * 0.92, t + 0.09);
      const bG = this._ctx.createGain();
      bG.gain.setValueAtTime(vol * 0.55, t);
      bG.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
      bOsc.connect(bG); bG.connect(this._bgGain);
      bOsc.start(t); bOsc.stop(t + 0.15);

      // Hollow resonance body — triangle, long decay through pipe walls
      const rOsc = this._ctx.createOscillator();
      rOsc.type = 'triangle'; rOsc.frequency.value = freq;
      const rG = this._ctx.createGain();
      rG.gain.setValueAtTime(vol, t + 0.004);
      rG.gain.setValueAtTime(vol * 0.45, t + 0.09);
      rG.gain.exponentialRampToValueAtTime(0.001, t + 0.75);
      rOsc.connect(rG); rG.connect(this._bgGain);
      rOsc.start(t + 0.002); rOsc.stop(t + 0.80);

      // Echo — reflection off far pipe wall, slightly flat pitch
      const eOsc = this._ctx.createOscillator();
      eOsc.type = 'triangle'; eOsc.frequency.value = freq * 0.997;
      const eG = this._ctx.createGain();
      eG.gain.setValueAtTime(vol * 0.22, t + 0.16);
      eG.gain.exponentialRampToValueAtTime(0.001, t + 0.58);
      eOsc.connect(eG); eG.connect(this._bgGain);
      eOsc.start(t + 0.16); eOsc.stop(t + 0.62);
    };

    const scale  = [220, 261.6, 293.7, 329.6, 392, 440, 523.3, 587.3];
    const beatMs = 60000 / 76;
    this._melodyInterval = null; // no melodic sequence — pure ambient drips only

    // ── Random ambient drips — background texture, irregular timing ───────
    const schedAmbient = () => {
      if (!this._bgRunning) return;
      const f   = scale[Math.floor(Math.random() * scale.length)];
      const oct = Math.random() < 0.2 ? 0.5 : 1; // occasional octave-down deep drip
      _drip(f * oct, 0.07 + Math.random() * 0.08);
      this._ambientDripTO = setTimeout(schedAmbient, 800 + Math.random() * 2400);
    };
    schedAmbient();

    // ── Deep slow accent drip — large drop every few beats ───────────────
    this._deepDripInterval = setInterval(() => {
      if (!this._bgRunning || this._muted) return;
      if (Math.random() < 0.5) _drip(55 + Math.random() * 50, 0.32);
    }, beatMs * 4);
  }

  stopBgMusic(fadeSecs = 1.5) {
    if (!this._bgRunning) return;
    this._bgRunning = false;
    clearInterval(this._melodyInterval);
    clearInterval(this._deepDripInterval);
    clearTimeout(this._ambientDripTO);
    if (this._bgGain && this._ctx) {
      const now = this._ctx.currentTime;
      this._bgGain.gain.setValueAtTime(this._bgGain.gain.value, now);
      this._bgGain.gain.linearRampToValueAtTime(0, now + fadeSecs);
      setTimeout(() => {
        this._bgOscs?.forEach(osc => { try { osc.stop(); } catch {} });
        this._bgOscs = [];
      }, (fadeSecs + 0.2) * 1000);
    }
  }

  setBgMusicMute(muted) {
    if (!this._bgGain || !this._ctx) return;
    const now = this._ctx.currentTime;
    this._bgGain.gain.setValueAtTime(this._bgGain.gain.value, now);
    this._bgGain.gain.linearRampToValueAtTime(muted ? 0 : 0.20, now + 0.3);
  }

  // ── Cinematic intro music ────────────────────────────────────────────────
  // Original "Climbing Spider" theme: ascending/descending in A minor,
  // digital square-wave melody over kick-snare-hat beat.
  // Captures the climbing-spider spirit without copying Itsy Bitsy Spider.
  startCinematicMusic() {
    if (!this._ctx) return;
    if (this._cinRunning) return;
    this._cinRunning = true;
    this._resume();

    const ctx    = this._ctx;
    const BPM    = 108;
    const eighth = 60 / BPM / 2;   // ~0.278 s per 8th note

    const cinGain = ctx.createGain();
    cinGain.gain.setValueAtTime(0, ctx.currentTime);
    cinGain.gain.linearRampToValueAtTime(0.30, ctx.currentTime + 1.4);
    cinGain.connect(ctx.destination);
    this._cinGain = cinGain;

    // ── Melody: 4-bar loop, original ascending/descending phrase ─────────
    // Bar 1 — spider climbs (stepwise up)
    // Bar 2 — wobbles at the top (rests give a syncopated skip)
    // Bar 3 — descends (water coming, reverse steps)
    // Bar 4 — resolves, ready to loop
    const MEL = [
      329.6, 329.6, 392,   440,   392,   440,   523.3, 440,
      392,   329.6, 392,   440,   0,     329.6, 392,   0,
      440,   392,   329.6, 293.7, 329.6, 293.7, 261.6, 293.7,
      329.6, 329.6, 392,   440,   392,   329.6, 329.6, 0,
    ];

    // ── Bass: triangle, quarter-note pulse ────────────────────────────────
    const BASS = [
      110, 130.8, 110, 164.8,
      110, 164.8, 110, 164.8,
      174.6, 130.8, 196, 164.8,
      110, 110, 164.8, 110,
    ];

    const total = MEL.length;   // 32 steps = 4 bars
    let step = 0;

    const kick = (at) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(110, at);
      o.frequency.exponentialRampToValueAtTime(42, at + 0.07);
      g.gain.setValueAtTime(0.50, at);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.16);
      o.connect(g); g.connect(cinGain);
      o.start(at); o.stop(at + 0.18);
    };

    const snare = (at) => {
      const len = Math.ceil(ctx.sampleRate * 0.10);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d   = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = buf;
      const bp  = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.7;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.20, at);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.10);
      src.connect(bp); bp.connect(g); g.connect(cinGain);
      src.start(at); src.stop(at + 0.11);
    };

    const hat = (at, vol) => {
      const len = Math.ceil(ctx.sampleRate * 0.032);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d   = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = buf;
      const hp  = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 8000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, at);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.032);
      src.connect(hp); hp.connect(g); g.connect(cinGain);
      src.start(at); src.stop(at + 0.035);
    };

    const tick = () => {
      if (!this._cinRunning) return;
      const now  = ctx.currentTime;
      const s    = step % total;
      const beat = s % 8;           // position within the current bar (0-7)

      // Lead melody — square wave (chiptune digital character)
      const freq = MEL[s];
      if (freq > 0) {
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.setValueAtTime(freq, now);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.12, now);
        g.gain.setValueAtTime(0.12, now + eighth * 0.55);
        g.gain.exponentialRampToValueAtTime(0.001, now + eighth * 0.88);
        o.connect(g); g.connect(cinGain);
        o.start(now); o.stop(now + eighth);
      }

      // Bass — every quarter note (every 2 eighth steps)
      if (beat % 2 === 0) {
        const bf = BASS[Math.floor(s / 2)];
        const o  = ctx.createOscillator();
        o.type   = 'triangle';
        o.frequency.setValueAtTime(bf, now);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.26, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + eighth * 1.7);
        o.connect(g); g.connect(cinGain);
        o.start(now); o.stop(now + eighth * 2);
      }

      // Drums: kick on 1 & 3, snare on 2 & 4, hi-hat every 8th
      if (beat === 0 || beat === 4) kick(now);
      if (beat === 2 || beat === 6) snare(now);
      hat(now, beat % 2 === 0 ? 0.12 : 0.06);

      step++;
    };

    this._cinInterval = setInterval(tick, eighth * 1000);
    tick();  // fire immediately on beat 1
  }

  stopCinematicMusic(fadeSecs = 1.0) {
    this._cinRunning = false;
    clearInterval(this._cinInterval);
    this._cinInterval = null;
    if (this._cinGain && this._ctx) {
      const now = this._ctx.currentTime;
      this._cinGain.gain.setValueAtTime(this._cinGain.gain.value, now);
      this._cinGain.gain.linearRampToValueAtTime(0, now + fadeSecs);
      setTimeout(() => { this._cinGain = null; }, (fadeSecs + 0.1) * 1000);
    }
  }

  playHitSplash() {
    // Brief water impact — droplet hits spider
    this._noise(0.07, 0.16);
    this._tone(320, 'sine', 0.06, 0.10);
    this._tone(180, 'sine', 0.08, 0.08, 0.03);
  }

  startPipeGroan(mult) {
    if (!this._ctx || this._muted) return;
    if (this._groanRunning) {
      // Update intensity without re-initialising
      if (this._groanGain) {
        const vol = Math.min(0.14, 0.04 + (mult - 20) * 0.0028);
        this._groanGain.gain.linearRampToValueAtTime(vol, this._ctx.currentTime + 0.8);
      }
      return;
    }
    this._groanRunning = true;
    this._resume();
    const ctx = this._ctx;

    this._groanGain = ctx.createGain();
    const vol = Math.min(0.14, 0.04 + (mult - 20) * 0.0028);
    this._groanGain.gain.value = 0;
    this._groanGain.gain.linearRampToValueAtTime(vol, ctx.currentTime + 2.5);
    this._groanGain.connect(this._masterGain);

    // Low pipe resonance oscillator
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 46;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 160;
    osc.connect(lp);
    lp.connect(this._groanGain);
    osc.start();
    this._groanOsc = osc;

    // Slow tremolo LFO
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.28;
    lfoGain.gain.value = 0.018;
    lfo.connect(lfoGain);
    lfoGain.connect(this._groanGain.gain);
    lfo.start();
    this._groanLfo = lfo;

    // Periodic creak bursts
    const creak = () => {
      if (!this._groanRunning) return;
      this._noise(0.10, 0.05 + Math.random() * 0.05);
      this._tone(50 + Math.random() * 40, 'sine', 0.16, 0.07);
      this._groanCreakTO = setTimeout(creak, 1800 + Math.random() * 3200);
    };
    creak();
  }

  stopPipeGroan(fadeSecs = 1.2) {
    if (!this._groanRunning) return;
    this._groanRunning = false;
    clearTimeout(this._groanCreakTO);
    if (this._groanGain && this._ctx) {
      const now = this._ctx.currentTime;
      this._groanGain.gain.setValueAtTime(this._groanGain.gain.value, now);
      this._groanGain.gain.linearRampToValueAtTime(0, now + fadeSecs);
      setTimeout(() => {
        try { this._groanOsc?.stop(); } catch (_) {}
        try { this._groanLfo?.stop(); } catch (_) {}
        this._groanOsc = null;
        this._groanLfo = null;
        this._groanGain = null;
      }, (fadeSecs + 0.15) * 1000);
    }
  }

  toggleMute() {
    this._muted = !this._muted;
    if (this._masterGain) {
      this._masterGain.gain.value = this._muted ? 0 : 0.5;
    }
    return this._muted;
  }

  isMuted() { return this._muted; }
}

// Singleton
export const sound = new SoundManager();
