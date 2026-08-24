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

    // Fade in over 3 seconds
    const now = this._ctx.currentTime;
    this._bgGain.gain.setValueAtTime(0, now);
    this._bgGain.gain.linearRampToValueAtTime(0.14, now + 3);

    this._bgOscs = [];

    // Bass drone layer — 3 oscillators with slow amplitude LFO
    const makeDrone = (freq, vol, lfoRate) => {
      const osc  = this._ctx.createOscillator();
      const lfo  = this._ctx.createOscillator();
      const lfoG = this._ctx.createGain();
      const gain = this._ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      lfo.type = 'sine';
      lfo.frequency.value = lfoRate;
      lfoG.gain.value = vol * 0.25;
      gain.gain.value = vol;
      lfo.connect(lfoG);
      lfoG.connect(gain.gain);
      osc.connect(gain);
      gain.connect(this._bgGain);
      osc.start();
      lfo.start();
      this._bgOscs.push(osc, lfo);
    };
    makeDrone(55,   0.55, 0.18);  // deep bass A1
    makeDrone(82.5, 0.30, 0.27);  // E2 — fifth above
    makeDrone(110,  0.18, 0.41);  // A2 — octave
    makeDrone(146,  0.10, 0.55);  // D3 — fourth (minor tension)

    // Eerie melody — A minor pentatonic arpeggio
    const scale   = [220, 261, 293, 349, 392, 440, 523, 392, 349, 293];
    let melStep   = 0;
    const bpm     = 72;
    const stepMs  = (60000 / bpm) / 2; // 8th notes

    this._melodyInterval = setInterval(() => {
      if (!this._bgRunning || this._muted) return;
      const freq = scale[melStep % scale.length];
      const t    = this._ctx.currentTime;
      const osc  = this._ctx.createOscillator();
      const gain = this._ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.07, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc.connect(gain);
      gain.connect(this._bgGain);
      osc.start(t);
      osc.stop(t + 0.6);
      melStep++;
    }, stepMs);

    // Kick pulse — every beat, low sine sweep (heartbeat quality)
    const beatMs = 60000 / bpm;
    this._kickInterval = setInterval(() => {
      if (!this._bgRunning || this._muted) return;
      const t    = this._ctx.currentTime;
      const osc  = this._ctx.createOscillator();
      const gain = this._ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(90, t);
      osc.frequency.exponentialRampToValueAtTime(22, t + 0.18);
      gain.gain.setValueAtTime(0.6, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(gain);
      gain.connect(this._bgGain);
      osc.start(t);
      osc.stop(t + 0.25);
    }, beatMs);

    // Hi-hat noise — off-beats
    this._hatInterval = setInterval(() => {
      if (!this._bgRunning || this._muted) return;
      const t       = this._ctx.currentTime;
      const bufSize = Math.ceil(this._ctx.sampleRate * 0.05);
      const buf     = this._ctx.createBuffer(1, bufSize, this._ctx.sampleRate);
      const d       = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
      const src  = this._ctx.createBufferSource();
      const filt = this._ctx.createBiquadFilter();
      const gain = this._ctx.createGain();
      src.buffer  = buf;
      filt.type   = 'highpass';
      filt.frequency.value = 6000;
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      src.connect(filt);
      filt.connect(gain);
      gain.connect(this._bgGain);
      src.start(t);
      src.stop(t + 0.06);
    }, beatMs);
  }

  stopBgMusic(fadeSecs = 1.5) {
    if (!this._bgRunning) return;
    this._bgRunning = false;
    clearInterval(this._melodyInterval);
    clearInterval(this._kickInterval);
    clearInterval(this._hatInterval);
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
    this._bgGain.gain.linearRampToValueAtTime(muted ? 0 : 0.14, now + 0.3);
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
