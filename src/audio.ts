import { AUDIO } from './config';

// Everything here is synthesized live with the Web Audio API: no audio files.

export type Track = 'none' | 'menu' | 'match' | 'boss';
export type LoopId = 'laminator' | 'shredder';
export type SfxId =
  | 'pencil' | 'rubberBand' | 'stapler' | 'holePunch' | 'tapeGun'
  | 'swing' | 'slash' | 'reload' | 'reloadDone' | 'swap' | 'overheat' | 'impact'
  | 'hit' | 'headshot' | 'death' | 'decap' | 'enemySwing' | 'door'
  | 'hurt' | 'writeupThrow' | 'writeup' | 'coffee' | 'error'
  | 'cash' | 'buy' | 'click' | 'closetOpen' | 'closetClose'
  | 'alarm' | 'shockwave' | 'chime' | 'step';

interface Vec { x: number; z: number }
interface SfxOpts { pos?: Vec; delay?: number }
interface Running { stop(): void }

const KEY = 'overtime.audio.v1';
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Minimum gap between two plays of the same effect, so a 9-pellet hole punch doesn't stack 9 hits. */
const THROTTLE: Partial<Record<SfxId, number>> = {
  hit: 0.04, headshot: 0.05, impact: 0.05, cash: 0.08, door: 0.25, enemySwing: 0.06, step: 0.12, death: 0.03,
};

interface OscOpts {
  attack?: number;
  freqEnd?: number;
  filter?: number;
  filterEnd?: number;
  q?: number;
  sustain?: boolean; // hold until the end, then release
  detune?: number;
}

interface NoiseOpts {
  type?: BiquadFilterType;
  freq?: number;
  freqEnd?: number;
  q?: number;
  attack?: number;
  am?: number; // amplitude-modulation rate (Hz) for ripping / fluttering sounds
}

class AudioEngine {
  settings = { music: true, sfx: true };
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private musicDuck!: GainNode;
  private musicFilter!: BiquadFilterNode;
  private sfxBus!: GainNode;
  private reverbIn!: GainNode;
  private bassIn!: GainNode;
  private noiseBuf!: AudioBuffer;
  private readonly listener = { x: 0, z: 0, yaw: 0 };
  private readonly last = new Map<SfxId, number>();
  private readonly loops = new Map<LoopId, Running>();
  private amb: Running | null = null;
  private wantAmbience = false;
  // sequencer
  private track: Track = 'none';
  private intensity = 0;
  private step = 0;
  private nextTime = 0;

  constructor() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<AudioEngine['settings']>;
      if (typeof s.music === 'boolean') this.settings.music = s.music;
      if (typeof s.sfx === 'boolean') this.settings.sfx = s.sfx;
    } catch {
      /* defaults */
    }
  }

  // ------------------------------------------------------------ setup

  /** Browsers only allow audio after a user gesture: call this from one. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = AUDIO.master;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp);
    comp.connect(ctx.destination);

    this.musicBus = ctx.createGain();
    this.musicDuck = ctx.createGain();
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 18000;
    this.musicBus.connect(this.musicFilter);
    this.musicFilter.connect(this.musicDuck);
    this.musicDuck.connect(this.master);

    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);

    // small office-room reverb
    this.reverbIn = ctx.createGain();
    this.reverbIn.gain.value = AUDIO.reverb;
    const conv = ctx.createConvolver();
    conv.buffer = this.impulse(1.1);
    this.reverbIn.connect(conv);
    conv.connect(this.master);
    this.sfxBus.connect(this.reverbIn);
    const musicSend = ctx.createGain();
    musicSend.gain.value = 0.6;
    this.musicFilter.connect(musicSend);
    musicSend.connect(this.reverbIn);

    // shared overdriven bass chain for the boss track
    this.bassIn = ctx.createGain();
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 4);
    }
    shaper.curve = curve;
    const bassLp = ctx.createBiquadFilter();
    bassLp.type = 'lowpass';
    bassLp.frequency.value = 900;
    this.bassIn.connect(shaper);
    shaper.connect(bassLp);
    bassLp.connect(this.musicBus);

    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    this.applySettings();
    this.nextTime = ctx.currentTime + 0.1;
    setInterval(() => this.schedule(), 25);
    if (this.wantAmbience) this.ambience(true);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void ctx.suspend();
      else void ctx.resume();
    });
  }

  private impulse(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return buf;
  }

  private applySettings() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(this.settings.music ? AUDIO.music : 0, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.settings.sfx ? AUDIO.sfx : 0, t, 0.05);
  }

  setMusic(on: boolean) {
    this.settings.music = on;
    this.save();
  }

  setSfx(on: boolean) {
    this.settings.sfx = on;
    this.save();
  }

  toggleAll() {
    const on = !(this.settings.music || this.settings.sfx);
    this.settings.music = this.settings.sfx = on;
    this.save();
  }

  private save() {
    this.applySettings();
    try {
      localStorage.setItem(KEY, JSON.stringify(this.settings));
    } catch {
      /* session only */
    }
  }

  setListener(x: number, z: number, yaw: number) {
    this.listener.x = x;
    this.listener.z = z;
    this.listener.yaw = yaw;
  }

  /** Muffle the soundtrack (pause menu, supply closet). */
  muffle(on: boolean) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicFilter.frequency.setTargetAtTime(on ? 650 : 18000, t, 0.12);
    this.musicDuck.gain.setTargetAtTime(on ? 0.6 : 1, t, 0.12);
  }

  // ------------------------------------------------------------ primitives

  private osc(type: OscillatorType, freq: number, t: number, dur: number, vol: number, dest: AudioNode, o: OscOpts = {}) {
    const ctx = this.ctx!;
    const src = ctx.createOscillator();
    src.type = type;
    src.frequency.setValueAtTime(freq, t);
    if (o.freqEnd) src.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), t + dur);
    if (o.detune) src.detune.value = o.detune;
    const g = ctx.createGain();
    const a = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    if (o.sustain) {
      const rel = Math.min(0.25, dur * 0.4);
      g.gain.setValueAtTime(vol, t + Math.max(a, dur - rel));
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
    } else {
      g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a + 0.01, dur));
    }
    let node: AudioNode = src;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(o.filter, t);
      if (o.filterEnd) f.frequency.exponentialRampToValueAtTime(o.filterEnd, t + dur);
      f.Q.value = o.q ?? 0.8;
      src.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(dest);
    src.start(t);
    src.stop(t + dur + 0.05);
    return src;
  }

  private noise(t: number, dur: number, vol: number, dest: AudioNode, o: NoiseOpts = {}) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.frequency.setValueAtTime(o.freq ?? 1000, t);
    if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, t + dur);
    f.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    const a = o.attack ?? 0.002;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a + 0.01, dur));
    src.connect(f);
    if (o.am) {
      const am = ctx.createGain();
      am.gain.value = 0.5;
      const lfo = ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = o.am;
      const depth = ctx.createGain();
      depth.gain.value = 0.5;
      lfo.connect(depth);
      depth.connect(am.gain);
      f.connect(am);
      am.connect(g);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
    } else {
      f.connect(g);
    }
    g.connect(dest);
    src.start(t, Math.random() * 0.8);
    src.stop(t + dur + 0.05);
  }

  /** A short vocal grunt: sawtooth through three formant filters. */
  private grunt(t: number, f0: number, dur: number, vol: number, dest: AudioNode) {
    const ctx = this.ctx!;
    const src = ctx.createOscillator();
    src.type = 'sawtooth';
    src.frequency.setValueAtTime(f0, t);
    src.frequency.exponentialRampToValueAtTime(f0 * 0.68, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const [freq, q, amt] of [[650, 6, 1], [1100, 8, 0.6], [2400, 10, 0.25]]) {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq * rand(0.9, 1.1);
      f.Q.value = q;
      const fg = ctx.createGain();
      fg.gain.value = amt;
      src.connect(f);
      f.connect(fg);
      fg.connect(g);
    }
    g.connect(dest);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  private bell(t: number, freq: number, dur: number, vol: number, dest: AudioNode) {
    this.osc('sine', freq, t, dur, vol, dest);
    this.osc('sine', freq * 2.76, t, dur * 0.4, vol * 0.25, dest);
    this.osc('sine', freq * 5.4, t, dur * 0.15, vol * 0.1, dest);
  }

  /** Output node for an effect, panned and attenuated when it has a world position. */
  private out(pos?: Vec, vol = 1): AudioNode | null {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    if (pos) {
      const L = this.listener;
      const dx = pos.x - L.x;
      const dz = pos.z - L.z;
      const d = Math.hypot(dx, dz);
      if (d > AUDIO.maxDistance) return null;
      g.gain.value = (vol / (1 + d * 0.16)) * (1 - d / AUDIO.maxDistance);
      const p = ctx.createStereoPanner();
      const rx = Math.cos(L.yaw);
      const rz = -Math.sin(L.yaw);
      p.pan.value = d > 0.01 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) * 0.85 : 0;
      g.connect(p);
      p.connect(this.sfxBus);
    } else {
      g.gain.value = vol;
      g.connect(this.sfxBus);
    }
    return g;
  }

  // ------------------------------------------------------------ effects

  sfx(id: SfxId, opts: SfxOpts = {}) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.settings.sfx) return;
    const now = ctx.currentTime;
    const gap = THROTTLE[id];
    if (gap) {
      const prev = this.last.get(id) ?? -1;
      if (now - prev < gap) return;
      this.last.set(id, now);
    }
    const D = this.out(opts.pos);
    if (!D) return;
    const t = now + (opts.delay ?? 0);
    switch (id) {
      case 'pencil':
        this.noise(t, 0.18, 0.28, D, { freq: 1200, freqEnd: 3200, q: 1.2, attack: 0.03 });
        this.osc('triangle', 900, t, 0.03, 0.08, D);
        break;
      case 'rubberBand':
        this.osc('triangle', rand(380, 440), t, 0.09, 0.3, D, { freqEnd: 130 });
        this.noise(t, 0.03, 0.12, D, { type: 'highpass', freq: 3000 });
        break;
      case 'stapler':
        this.noise(t, 0.025, 0.35, D, { type: 'highpass', freq: 2500 });
        this.osc('square', 190, t, 0.05, 0.1, D, { freqEnd: 90, filter: 1200 });
        this.osc('sine', rand(3000, 3400), t + 0.005, 0.04, 0.05, D);
        break;
      case 'holePunch':
        this.osc('sine', 150, t, 0.2, 0.6, D, { freqEnd: 50 });
        this.noise(t, 0.12, 0.35, D, { type: 'lowpass', freq: 900 });
        this.noise(t + 0.04, 0.16, 0.12, D, { freq: 4000, q: 0.8 });
        break;
      case 'tapeGun':
        this.noise(t, 0.22, 0.6, D, { freq: 1800, q: 1.2, am: 42, attack: 0.01 });
        this.osc('square', 70, t, 0.05, 0.06, D, { filter: 600 });
        break;
      case 'swing':
        this.noise(t, 0.2, 0.45, D, { freq: 600, freqEnd: 1800, q: 1.4, attack: 0.04 });
        break;
      case 'slash':
        this.noise(t, 0.09, 0.35, D, { freq: 1400, q: 1.5 });
        this.osc('sine', 230, t, 0.1, 0.28, D, { freqEnd: 90 });
        break;
      case 'reload':
        this.noise(t, 0.02, 0.25, D, { type: 'highpass', freq: 3000 });
        this.osc('square', 600, t, 0.02, 0.04, D);
        this.noise(t + 0.2, 0.03, 0.2, D, { type: 'highpass', freq: 2200 });
        break;
      case 'reloadDone':
        this.noise(t, 0.02, 0.3, D, { type: 'highpass', freq: 2500 });
        this.osc('sine', 2200, t + 0.01, 0.08, 0.06, D);
        break;
      case 'swap':
        this.noise(t, 0.08, 0.14, D, { freq: 900, q: 0.8, attack: 0.02 });
        this.osc('triangle', 1400, t + 0.05, 0.02, 0.05, D);
        break;
      case 'overheat':
        this.noise(t, 0.7, 0.18, D, { type: 'highpass', freq: 5000, attack: 0.02 });
        this.osc('square', 880, t, 0.08, 0.05, D);
        this.osc('square', 660, t + 0.12, 0.1, 0.05, D);
        break;
      case 'impact':
        this.noise(t, 0.04, 0.4, D, { freq: 2000, q: 0.8 });
        break;
      case 'hit':
        this.osc('sine', 170, t, 0.08, 0.35, D, { freqEnd: 70 });
        this.noise(t, 0.06, 0.25, D, { type: 'lowpass', freq: 1300 });
        break;
      case 'headshot':
        this.noise(t, 0.13, 0.45, D, { freq: 950, freqEnd: 380, q: 3 });
        this.noise(t, 0.03, 0.22, D, { type: 'highpass', freq: 2200 });
        this.osc('square', 300, t, 0.07, 0.08, D, { freqEnd: 80, filter: 1500 });
        break;
      case 'death':
        this.grunt(t, rand(105, 185), rand(0.3, 0.42), 0.2, D);
        // body hitting the carpet as the fall finishes
        this.osc('sine', 95, t + 0.62, 0.28, 0.6, D, { freqEnd: 40 });
        this.noise(t + 0.62, 0.22, 0.3, D, { type: 'lowpass', freq: 500 });
        break;
      case 'decap':
        this.noise(t, 0.38, 0.9, D, { freq: 1300, freqEnd: 280, q: 2.5 });
        for (let i = 0; i < 3; i++) this.noise(t + 0.15 + i * 0.16, 0.08, 0.2, D, { type: 'lowpass', freq: 800 });
        break;
      case 'enemySwing':
        this.noise(t, 0.16, 0.3, D, { freq: 700, freqEnd: 1400, q: 1.2, attack: 0.04 });
        break;
      case 'door':
        this.noise(t, 0.02, 0.25, D, { type: 'highpass', freq: 2500 });
        this.osc('sine', 110, t + 0.03, 0.18, 0.3, D, { freqEnd: 60 });
        break;
      case 'hurt':
        this.osc('sine', 130, t, 0.16, 0.5, D, { freqEnd: 55 });
        this.noise(t, 0.1, 0.25, D, { type: 'lowpass', freq: 900 });
        this.grunt(t + 0.01, rand(150, 175), 0.22, 0.1, D);
        break;
      case 'writeupThrow':
        this.noise(t, 0.3, 0.3, D, { freq: 3000, q: 1, am: 24, attack: 0.03 });
        break;
      case 'writeup':
        this.noise(t, 0.06, 0.35, D, { freq: 2500, q: 1.2 });
        this.osc('sine', 210, t + 0.03, 0.12, 0.45, D, { freqEnd: 70 }); // rubber stamp
        this.osc('square', 330, t + 0.12, 0.25, 0.05, D, { freqEnd: 180, filter: 1000 });
        break;
      case 'coffee':
        this.noise(t, 0.55, 0.25, D, { freq: 1500, q: 1.5, am: 13, attack: 0.05 });
        this.osc('sine', 300, t + 0.45, 0.45, 0.12, D, { freqEnd: 900, attack: 0.05 });
        this.osc('sine', 600, t + 0.55, 0.4, 0.08, D, { freqEnd: 1300, attack: 0.05 });
        break;
      case 'error':
        this.osc('square', 150, t, 0.1, 0.07, D, { filter: 900 });
        this.osc('square', 150, t + 0.14, 0.1, 0.07, D, { filter: 900 });
        break;
      case 'cash':
        this.noise(t, 0.015, 0.1, D, { type: 'highpass', freq: 4000 });
        this.bell(t, 1568, 0.18, 0.09, D);
        this.bell(t + 0.06, 2093, 0.3, 0.08, D);
        break;
      case 'buy':
        this.noise(t, 0.16, 0.22, D, { type: 'lowpass', freq: 1200 });
        this.bell(t + 0.05, 2637, 0.6, 0.12, D);
        this.bell(t + 0.05, 1976, 0.5, 0.06, D);
        break;
      case 'click':
        this.osc('triangle', 1250, t, 0.03, 0.07, D);
        this.noise(t, 0.012, 0.06, D, { type: 'highpass', freq: 5000 });
        break;
      case 'closetOpen':
        this.noise(t, 0.02, 0.2, D, { type: 'highpass', freq: 3000 });
        this.osc('sawtooth', 170, t + 0.04, 0.55, 0.1, D, { freqEnd: 250, filter: 1100, q: 6 });
        break;
      case 'closetClose':
        this.osc('sine', 100, t, 0.22, 0.45, D, { freqEnd: 50 });
        this.noise(t, 0.02, 0.2, D, { type: 'highpass', freq: 2500 });
        break;
      case 'alarm':
        // four beeps across the ~2 s Layoffs telegraph
        for (let i = 0; i < 4; i++) this.osc('square', i % 2 ? 660 : 880, t + i * 0.48, 0.22, 0.09, D, { filter: 2500, sustain: true });
        break;
      case 'shockwave':
        this.osc('sine', 75, t, 1.1, 0.9, D, { freqEnd: 26 });
        this.noise(t, 0.9, 0.5, D, { type: 'lowpass', freq: 380, freqEnd: 120 });
        this.noise(t, 0.05, 0.3, D, { type: 'highpass', freq: 2000 });
        break;
      case 'chime':
        // office PA "ding-dong" at each phase change
        this.bell(t, 659, 1.2, 0.12, D);
        this.bell(t + 0.35, 523, 1.4, 0.12, D);
        break;
      case 'step':
        this.noise(t, 0.07, 0.1, D, { type: 'lowpass', freq: rand(400, 600) });
        this.osc('sine', rand(85, 100), t, 0.06, 0.08, D, { freqEnd: 55 });
        break;
    }
  }

  /** Continuous weapon sounds; call every frame with whether they should be playing. */
  setLoop(id: LoopId, on: boolean) {
    const cur = this.loops.get(id);
    if (on && !cur && this.ctx && this.ctx.state === 'running') this.loops.set(id, this.makeLoop(id));
    else if (!on && cur) {
      cur.stop();
      this.loops.delete(id);
    }
  }

  stopLoops() {
    for (const l of this.loops.values()) l.stop();
    this.loops.clear();
  }

  private makeLoop(id: LoopId): Running {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(1, t + 0.06);
    g.connect(this.sfxBus);
    const sources: AudioScheduledSourceNode[] = [];
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.connect(g);
    const add = (type: OscillatorType, f: number, vol: number, dest: AudioNode | AudioParam) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = vol;
      o.connect(og);
      if (dest instanceof AudioParam) og.connect(dest);
      else og.connect(dest);
      sources.push(o);
      return o;
    };
    const noise = (filter: BiquadFilterType, f: number, q: number, vol: number, am = 0) => {
      const n = ctx.createBufferSource();
      n.buffer = this.noiseBuf;
      n.loop = true;
      const nf = ctx.createBiquadFilter();
      nf.type = filter;
      nf.frequency.value = f;
      nf.Q.value = q;
      const ng = ctx.createGain();
      ng.gain.value = vol;
      n.connect(nf);
      nf.connect(ng);
      ng.connect(g);
      sources.push(n);
      if (am) {
        const lfo = ctx.createOscillator();
        lfo.type = 'square';
        lfo.frequency.value = am;
        const depth = ctx.createGain();
        depth.gain.value = vol * 0.8;
        lfo.connect(depth);
        depth.connect(ng.gain);
        sources.push(lfo);
      }
    };
    if (id === 'laminator') {
      // electric heat-beam hum with a wobble
      lp.frequency.value = 1500;
      lp.Q.value = 4;
      add('sawtooth', 110, 0.07, lp);
      add('sawtooth', 110.8, 0.07, lp);
      add('square', 220, 0.03, lp);
      add('sine', 7, 400, lp.frequency); // wobble the filter
      noise('highpass', 6000, 0.5, 0.025);
    } else {
      // shredder: motor + grinding paper
      lp.frequency.value = 450;
      add('sawtooth', 55, 0.14, lp);
      add('square', 82, 0.05, lp);
      noise('bandpass', 600, 0.8, 0.28, 28);
      noise('bandpass', 2400, 2, 0.06);
    }
    for (const s of sources) s.start(t);
    return {
      stop: () => {
        const n = ctx.currentTime;
        g.gain.cancelScheduledValues(n);
        g.gain.setTargetAtTime(0.0001, n, 0.04);
        for (const s of sources) s.stop(n + 0.3);
      },
    };
  }

  /** Office room tone: air handling + fluorescent hum, during a shift. */
  ambience(on: boolean) {
    this.wantAmbience = on;
    if (!this.ctx) return;
    if (on && !this.amb) {
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(1, t + 1.5);
      g.connect(this.sfxBus);
      const n = ctx.createBufferSource();
      n.buffer = this.noiseBuf;
      n.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 320;
      const ng = ctx.createGain();
      ng.gain.value = 0.07;
      n.connect(f);
      f.connect(ng);
      ng.connect(g);
      const hum = ctx.createOscillator();
      hum.frequency.value = 120;
      const hg = ctx.createGain();
      hg.gain.value = 0.006;
      hum.connect(hg);
      hg.connect(g);
      n.start(t);
      hum.start(t);
      this.amb = {
        stop: () => {
          const s = ctx.currentTime;
          g.gain.setTargetAtTime(0.0001, s, 0.3);
          n.stop(s + 1.5);
          hum.stop(s + 1.5);
        },
      };
    } else if (!on && this.amb) {
      this.amb.stop();
      this.amb = null;
    }
  }

  // ------------------------------------------------------------ soundtrack

  setTrack(track: Track) {
    if (this.track === track) return;
    this.track = track;
    this.step = 0;
    if (this.ctx) this.nextTime = this.ctx.currentTime + 0.06;
  }

  /** Match intensity 0..4 = the current phase (before the CEO). */
  setIntensity(i: number) {
    this.intensity = Math.max(0, Math.min(4, i));
  }

  private bpm(): number {
    if (this.track === 'menu') return AUDIO.menuBpm;
    if (this.track === 'boss') return AUDIO.bossBpm;
    return AUDIO.matchBpm[this.intensity];
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (this.track === 'none') {
      this.nextTime = ctx.currentTime + 0.05;
      return;
    }
    // catch up after a long stall instead of machine-gunning old steps
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.02;
    while (this.nextTime < ctx.currentTime + 0.12) {
      const sixteenth = 60 / this.bpm() / 4;
      if (this.track === 'menu') this.menuStep(this.step, this.nextTime, sixteenth);
      else if (this.track === 'match') this.matchStep(this.step, this.nextTime, sixteenth);
      else this.bossStep(this.step, this.nextTime, sixteenth);
      this.nextTime += sixteenth;
      this.step++;
    }
  }

  // instruments
  private kick(t: number, vol: number) {
    this.osc('sine', 150, t, 0.28, vol, this.musicBus, { freqEnd: 42 });
    this.noise(t, 0.012, vol * 0.25, this.musicBus, { type: 'highpass', freq: 3000 });
  }

  private snare(t: number, vol: number) {
    this.noise(t, 0.16, vol, this.musicBus, { freq: 1800, q: 0.7 });
    this.osc('triangle', 190, t, 0.08, vol * 0.5, this.musicBus, { freqEnd: 150 });
  }

  private hat(t: number, vol: number, open = false) {
    this.noise(t, open ? 0.16 : 0.04, vol, this.musicBus, { type: 'highpass', freq: 7000 });
  }

  private epiano(t: number, midi: number, dur: number, vol: number) {
    const f = mtof(midi);
    this.osc('sine', f, t, dur, vol, this.musicBus);
    this.osc('sine', f * 2, t, dur * 0.35, vol * 0.25, this.musicBus);
    this.osc('triangle', f, t, dur * 0.6, vol * 0.2, this.musicBus, { filter: 1800 });
  }

  private pad(t: number, notes: number[], dur: number, vol: number, cutoff: number) {
    for (const n of notes) {
      for (const det of [-8, 8]) this.osc('sawtooth', mtof(n), t, dur, vol, this.musicBus, { attack: Math.min(0.5, dur * 0.3), sustain: true, filter: cutoff, detune: det });
    }
  }

  private menuStep(step: number, t: number, s16: number) {
    const s = step & 15;
    const bar = (step >> 4) & 3;
    const loop = step >> 6;
    const roots = [48, 45, 41, 43];
    const chords = [[60, 64, 67, 71], [57, 60, 64, 67], [57, 60, 64, 65], [59, 62, 65, 69]];
    const melody = [
      [[0, 76], [3, 79], [6, 83], [10, 79], [14, 76]],
      [[0, 72], [4, 76], [8, 79], [12, 76]],
      [[0, 77], [3, 76], [6, 72], [10, 69]],
      [[0, 74], [4, 77], [8, 79], [12, 81]],
    ];
    const ch = chords[bar];
    if (s === 0) for (const n of ch) this.epiano(t, n, s16 * 14, 0.08);
    if (s === 6 || s === 10) for (const n of ch) this.epiano(t, n, s16 * 4, 0.05);
    if (s === 0) this.osc('triangle', mtof(roots[bar] - 12), t, s16 * 7, 0.3, this.musicBus, { filter: 500 });
    if (s === 8) this.osc('triangle', mtof(roots[bar] - 5), t, s16 * 5, 0.22, this.musicBus, { filter: 500 });
    if (s === 14) this.osc('triangle', mtof(roots[bar]), t, s16 * 2, 0.15, this.musicBus, { filter: 500 });
    if (s === 4 || s === 12) this.hat(t, 0.025);
    if (s % 2 === 1) this.noise(t, 0.05, 0.008, this.musicBus, { freq: 6000, q: 0.6, attack: 0.02 });
    // vibraphone melody on alternate passes
    if (loop % 2 === 1) {
      for (const [at, n] of melody[bar]) {
        if (at === s) this.bell(t, mtof(n), s16 * 6, 0.07, this.musicBus);
      }
    }
  }

  private matchStep(step: number, t: number, s16: number) {
    const s = step & 15;
    const bar = (step >> 4) & 3;
    const I = this.intensity;
    const roots = [45, 41, 48, 43]; // Am  F  C  G
    const chords = [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]];
    const root = roots[bar];
    const ch = chords[bar];

    if (s === 0) this.pad(t, ch, s16 * 16, 0.016, 900 + I * 200);
    // drums
    const kicks = [0, 8, 10];
    if (I >= 2) kicks.push(4, 12);
    if (I >= 4) kicks.push(14);
    if (kicks.includes(s)) this.kick(t, 0.5);
    if (I >= 1 && (s === 4 || s === 12)) this.snare(t, 0.22);
    if (I >= 3 && s === 15) this.snare(t, 0.07);
    if (I >= 4) this.hat(t, s % 2 ? 0.03 : 0.055);
    else if (I >= 3) {
      if (s % 2 === 0) this.hat(t, 0.045, s % 8 === 6);
    } else if (s % 4 === 2) this.hat(t, 0.045);
    // keyboard-typing clicks: the office motif
    if (s === 3 || s === 7 || s === 11 || s === 13) this.noise(t, 0.015, 0.035, this.musicBus, { type: 'highpass', freq: 4200 });
    // bass
    const bassVol = 0.15;
    if (I >= 4) {
      this.osc('sawtooth', mtof(root - 12 + (s % 4 === 2 ? 12 : 0)), t, s16 * 0.9, bassVol * 0.8, this.musicBus, { filter: 700 });
    } else if (I >= 2) {
      if (s % 2 === 0) this.osc('sawtooth', mtof(root - 12 + (s % 4 === 2 ? 12 : 0)), t, s16 * 1.8, bassVol, this.musicBus, { filter: 650 });
    } else if (s === 0 || s === 6 || s === 8 || s === 14) {
      this.osc('sawtooth', mtof(root - 12 + (s === 6 || s === 14 ? 12 : 0)), t, s16 * 2.5, bassVol, this.musicBus, { filter: 550 });
    }
    // arpeggio
    if (I >= 2 && (I >= 4 || s % 2 === 0)) {
      const k = I >= 4 ? s : s / 2;
      const n = ch[k % 3] + 12 + (Math.floor(k / 3) % 2) * 12;
      this.osc('square', mtof(n), t, s16 * 0.9, 0.032, this.musicBus, { filter: 1200 + I * 500 });
    }
    // stabs
    if (I >= 3 && (s === 3 || s === 11)) for (const n of ch) this.osc('sawtooth', mtof(n + 12), t, s16 * 1.5, 0.03, this.musicBus, { filter: 2600 });
    // lead hook on the last bar from phase 2
    if (I >= 1 && bar === 3) {
      const hook: Record<number, number> = { 0: 76, 3: 74, 6: 72, 8: 71, 12: 69 };
      if (hook[s] !== undefined) this.osc('triangle', mtof(hook[s]), t, s16 * 2.5, 0.06, this.musicBus, { filter: 3000 });
    }
  }

  private bossStep(step: number, t: number, s16: number) {
    const s = step & 15;
    const bar = (step >> 4) & 3;
    const roots = [38, 39, 38, 36]; // Dm  Eb  Dm  C
    const chords = [[50, 53, 57], [51, 55, 58], [50, 53, 57], [48, 52, 55]];
    const root = roots[bar];
    if (s % 4 === 0 || s === 14) this.kick(t, 0.6);
    if (s === 4 || s === 12) this.snare(t, 0.28);
    if (bar === 3 && s >= 12) this.snare(t, 0.06 + (s - 12) * 0.04);
    this.hat(t, s % 2 ? 0.025 : 0.05, s === 2 || s === 10);
    // overdriven 16th bass
    {
      const ctx = this.ctx!;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(root - 12 + (s % 4 === 2 ? 12 : 0));
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.09, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + s16 * 0.9);
      o.connect(g);
      g.connect(this.bassIn);
      o.start(t);
      o.stop(t + s16);
    }
    if (s === 0) {
      this.pad(t, chords[bar], s16 * 16, 0.02, 700);
      for (const n of chords[bar]) this.osc('sawtooth', mtof(n + 12), t, s16 * 3, 0.04, this.musicBus, { filter: 2200 });
    }
    // two-tone alarm motif
    if (bar % 2 === 0 && s % 4 === 0) this.osc('square', mtof(s % 8 === 0 ? 74 : 75), t, s16 * 3.5, 0.022, this.musicBus, { filter: 1800, sustain: true });
  }

  // ------------------------------------------------------------ stingers

  stinger(kind: 'boss' | 'win' | 'lose' | 'terminated') {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.03;
    const M = this.musicBus;
    switch (kind) {
      case 'boss':
        this.osc('sine', 62, t, 1.4, 0.9, M, { freqEnd: 28 });
        this.noise(t, 1.1, 0.35, M, { type: 'lowpass', freq: 420, freqEnd: 100 });
        this.pad(t, [50, 51, 57], 1.8, 0.05, 1300);
        break;
      case 'terminated':
        this.osc('sine', 85, t, 0.9, 0.7, M, { freqEnd: 30 });
        this.bell(t + 0.1, 1568, 0.8, 0.12, M);
        this.bell(t + 0.4, 1047, 1.2, 0.12, M);
        break;
      case 'win':
        [72, 76, 79, 84].forEach((n, i) => {
          this.epiano(t + i * 0.13, n, 0.6, 0.16);
          this.osc('square', mtof(n), t + i * 0.13, 0.2, 0.06, M, { filter: 2500 });
        });
        this.pad(t + 0.52, [60, 64, 67, 72], 1.8, 0.04, 2200);
        this.bell(t + 0.55, 2093, 1.6, 0.16, M);
        break;
      case 'lose': {
        // descending "you're fired" trombone
        const notes = [67, 66, 65, 64];
        notes.forEach((n, i) => {
          const last = i === notes.length - 1;
          this.osc('sawtooth', mtof(n), t + i * 0.4, last ? 1.1 : 0.38, 0.1, M, { filter: 1000, attack: 0.04, sustain: true });
        });
        this.kick(t + 1.75, 0.5);
        break;
      }
    }
  }

  /** Stinger, then the results screen settles into the desk music. */
  endOfShift(won: boolean) {
    this.stopLoops();
    this.ambience(false);
    this.muffle(false);
    this.setTrack('none');
    this.stinger(won ? 'win' : 'lose');
    setTimeout(() => {
      if (this.track === 'none') this.setTrack('menu');
    }, 2800);
  }
}

export const audio = new AudioEngine();
