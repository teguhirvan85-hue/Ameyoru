// Sound for Ameyoru, all through Web Audio.
// Four buses (music, ambience, effects, voice) → master, each with its own volume (the audio panel, key O).
// Effects and ambience also feed three reverbs (small room, hall, street slapback) whose sends follow where you are.
// Things in the world can be positional emitters (a crossing bell, a train, a shop's noise leaking out).
// Every sound has a synthesized version; when a real recording is listed in assets/audio/files.json it is used instead.
import { Music } from './music.js';

// recordings that can replace the synthesized sounds: slot → file in assets/audio (only those in files.json load)
export const SLOTS = {
  rain_street: 'loop', rain_roof: 'loop', city_far: 'loop', birds: 'loop', insects: 'loop', drip: 'shot',
  konbini: 'loop', izakaya: 'loop', ramen: 'loop', arcade: 'loop', pachinko: 'loop', station: 'loop', laundry: 'loop', kissa: 'loop',
  station_announce: 'shot', train_pass: 'loop', car_pass: 'shot',
  step_wet: 'steps', step_tile: 'steps', step_wood: 'steps', step_metal: 'steps',
  can_open: 'shot', bed_creak: 'shot', chair_creak: 'shot', car_door_open: 'shot', car_door_close: 'shot', wiper: 'loop',
  voice_ren: 'steps', voice_mio: 'steps',
  // music recordings that replace a generative style (optional)
  music_street: 'loop', music_shotengai: 'loop', music_quiet: 'loop', music_konbini: 'loop', music_arcade: 'loop', music_karaoke: 'loop', music_jazz: 'loop',
  radio_citypop: 'loop', radio_jazz: 'loop', radio_lofi: 'loop',
};

// where you are → reverb sends [small, hall, street] and how loud the inside tone is
const PLACES = {
  street: { rev: [0, 0, 0.16] },
  shotengai: { rev: [0, 0.3, 0.05], hum: 0.04, murmur: 0.08 },
  station: { rev: [0, 0.32, 0], hum: 0.12, murmur: 0.1 },
  konbini: { rev: [0.14, 0, 0], hum: 0.3, murmur: 0.04 },
  arcade: { rev: [0.18, 0.05, 0], hum: 0.2, murmur: 0.1 },
  izakaya: { rev: [0.14, 0, 0], hum: 0.1, murmur: 0.45 },
  ramen: { rev: [0.12, 0, 0], hum: 0.12, murmur: 0.25 },
  kissa: { rev: [0.12, 0, 0], hum: 0.08, murmur: 0.12 },
  karaoke: { rev: [0.1, 0, 0], hum: 0.15, murmur: 0.06 },
  quiet: { rev: [0.1, 0, 0], hum: 0.1, murmur: 0 },
  pachinko: { rev: [0.16, 0.06, 0], hum: 0.2, murmur: 0.05 },
  laundry: { rev: [0.14, 0, 0], hum: 0.3, murmur: 0 },
  gacha: { rev: [0.14, 0, 0], hum: 0.2, murmur: 0.03 },
};
// what each room leaks out of its door: a synthesized bed (and a recording slot if there is one)
const LEAK = { konbini: 'konbini', arcade: 'arcade', izakaya: 'izakaya', ramen: 'ramen', karaoke: 'karaoke', pachinko: 'pachinko', kissa: 'kissa', station: 'station', laundry: 'laundry', gacha: 'gacha' };

const VOL_KEY = 'ameyoru.audio';
const DEFAULT_VOL = { music: 0.55, amb: 0.85, sfx: 0.9, voice: 0.8, master: 0.9 };

export class Sound {
  constructor() {
    this.ctx = null; this.muted = false; this.bellT = 0; this.files = {};
    try { this.vol = { ...DEFAULT_VOL, ...JSON.parse(localStorage.getItem(VOL_KEY) || '{}') }; } catch { this.vol = { ...DEFAULT_VOL }; }
  }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    const ctx = this.ctx = new C();
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : this.vol.master;
    // a gentle limiter so a train, a bell and the music together never clip
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -10; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
    this.master.connect(comp).connect(ctx.destination);
    this.bus = {};
    for (const k of ['music', 'amb', 'sfx', 'voice']) { const g = ctx.createGain(); g.gain.value = this.vol[k]; g.connect(this.master); this.bus[k] = g; }

    // noise buffers
    const n = ctx.sampleRate * 2;
    this.white = ctx.createBuffer(1, n, ctx.sampleRate);
    const w = this.white.getChannelData(0);
    for (let i = 0; i < n; i++) w[i] = Math.random() * 2 - 1;
    this.brown = ctx.createBuffer(1, n, ctx.sampleRate);
    const b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }

    // reverbs: generated impulse responses (decaying, darkening noise)
    this.rev = [[0.45, 2600], [2.2, 3200], [0.9, 1800]].map(([len, tone], i) => {
      const conv = ctx.createConvolver(); conv.buffer = this.impulse(len, tone, i === 2);
      const send = ctx.createGain(); send.gain.value = 0;
      send.connect(conv).connect(this.master);
      return send;
    });
    // effects and ambience go dry to their bus and wet through the sends
    this.fx = ctx.createGain(); this.fx.connect(this.bus.sfx);
    for (const s of this.rev) this.fx.connect(s);

    // outdoor sound (rain, traffic, city) runs through a bus that gets muffled when you're inside
    this.outBus = ctx.createGain(); this.outLP = ctx.createBiquadFilter(); this.outLP.type = 'lowpass'; this.outLP.frequency.value = 20000;
    this.outBus.connect(this.outLP).connect(this.bus.amb);
    this.outLP.connect(this.rev[2]);
    this.inBus = ctx.createGain(); this.inBus.connect(this.bus.amb);
    for (const s of this.rev) this.inBus.connect(s);

    const loop = (buf, filters, gain, dest = this.outBus) => {
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      let node = s;
      for (const [type, f, q] of filters) { const bf = ctx.createBiquadFilter(); bf.type = type; bf.frequency.value = f; if (q) bf.Q.value = q; node.connect(bf); node = bf; }
      const g = ctx.createGain(); g.gain.value = gain;
      node.connect(g).connect(dest);
      s.start(0, Math.random() * 1.5);
      return g;
    };
    this.loop = loop;
    // rain: hiss on the street, fizz, low roar; plus rain drumming on a roof right above you (awnings, arcade roof)
    this.rainGains = [loop(this.white, [['lowpass', 1600], ['highpass', 300]], 0.3), loop(this.white, [['highpass', 4500]], 0.05), loop(this.brown, [['lowpass', 400]], 0.22)];
    this.rainBase = [0.3, 0.05, 0.22];
    this.roofRain = loop(this.white, [['bandpass', 2300, 0.7]], 0, this.inBus);
    this.roofLow = loop(this.brown, [['lowpass', 260]], 0, this.inBus);
    // the city far off: a low hum that's louder by day
    this.cityHum = loop(this.brown, [['lowpass', 180], ['highpass', 40]], 0.05);
    // room tones: fridge/neon hum, murmur of voices
    this.hum = loop(this.brown, [['lowpass', 110]], 0, this.inBus);
    this.murmur = loop(this.brown, [['bandpass', 520], ['lowpass', 900]], 0, this.inBus);
    this.blipT = 0; this.room = null; this.rainK = 1; this.place = 'street';
    // a passing train (positional), traffic, your own car
    this.trainEm = this.emitter(0, 0, 0, { ref: 12, roll: 0.9 });
    this.rumble = loop(this.brown, [['lowpass', 140]], 0, this.trainEm.in);
    this.screech = loop(this.white, [['bandpass', 3800, 6]], 0, this.trainEm.in);
    this.carEm = this.emitter(0, 0, 0, { ref: 5, roll: 1.2 });
    this.hiss = loop(this.white, [['bandpass', 1400]], 0, this.carEm.in);
    this.engine = loop(this.brown, [['lowpass', 260]], 0, this.carEm.in);
    this.bellEm = this.emitter(0, 2, 0, { ref: 6, roll: 1 });
    // the north (north.js): the sea slapping the quay, the expressway's roar overhead — each from its nearest point
    this.seaEm = this.emitter(176, 0, 120, { ref: 10, roll: 1.1, max: 140 });
    this.seaLow = loop(this.brown, [['lowpass', 320], ['highpass', 50]], 0, this.seaEm.in);
    this.seaLap = loop(this.white, [['bandpass', 750, 0.9], ['lowpass', 1400]], 0, this.seaEm.in);
    this.expEm = this.emitter(106, 15, 0, { ref: 16, roll: 1, max: 220 });
    this.expRoar = loop(this.brown, [['bandpass', 240, 0.6], ['lowpass', 1100]], 0, this.expEm.in);
    this.expHiss = loop(this.white, [['bandpass', 2400, 0.7]], 0, this.expEm.in);
    this.hornT = 30 + Math.random() * 40;
    // you: breathing after a long run
    this.breathT = 0; this.runFor = 0;
    // footsteps go through a gentle lowpass: just the heel and sole, no gritty hiss
    this.stepLP = ctx.createBiquadFilter(); this.stepLP.type = 'lowpass'; this.stepLP.frequency.value = 2400; this.stepLP.Q.value = 0.5;
    this.stepLP.connect(this.fx);
    // your car: an engine note (oscillators, not just noise) for gear changes
    this.eng = this.engineVoice();
    // day/night life: birds by day, insects on dry nights (synth chirps, or recordings)
    this.lifeT = 0; this.daylight = 0; this.minute = 0;
    // leaks: shops heard from outside, through their door
    this.leaks = [];
    this.music = new Music(ctx, this.bus.music);
    this.applyVolumes();
    this.loadFiles();
  }

  // a decaying noise impulse; street = a few early echoes (building fronts) and a short tail
  impulse(len, tone, slap) {
    const ctx = this.ctx, sr = ctx.sampleRate, n = Math.floor(sr * len), buf = ctx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0; const a = Math.exp(-2 * Math.PI * tone / sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, env = Math.pow(1 - i / n, slap ? 4 : 2.2) * Math.exp(-t * (slap ? 5 : 1.6));
        lp = lp * a + (Math.random() * 2 - 1) * (1 - a);
        d[i] = lp * env * 2.2;
      }
      if (slap) for (const [dt, g] of [[0.045, 0.5], [0.11, 0.35], [0.19, 0.22]]) { const i = Math.floor((dt + c * 0.007) * sr); if (i < n) d[i] += g; }
    }
    return buf;
  }

  // ---------- recordings ----------
  async loadFiles() {
    let list = [];
    try { const r = await fetch('assets/audio/files.json', { cache: 'no-store' }); if (r.ok) list = await r.json(); } catch { /* no recordings yet */ }
    await Promise.all(list.map(async ({ slot, file, gain = 1 }) => {
      try {
        const buf = await this.ctx.decodeAudioData(await (await fetch(`assets/audio/${file}`)).arrayBuffer());
        this.files[slot] = { buf, gain, hits: SLOTS[slot] === 'steps' ? this.onsets(buf) : null };
      } catch (e) { console.warn('[ameyoru] audio file failed', file, e); }
    }));
    this.music.files = this.files;
    this.startFileLoops();
    if (list.length) console.info('[ameyoru] audio files', Object.keys(this.files).join(', '));
  }
  // a recording with several hits in a row (footsteps, voice bits): where each one starts
  onsets(buf) {
    const d = buf.getChannelData(0), sr = buf.sampleRate, hop = Math.floor(sr * 0.01), env = [];
    for (let i = 0; i + hop < d.length; i += hop) { let s = 0; for (let j = 0; j < hop; j++) s += d[i + j] * d[i + j]; env.push(Math.sqrt(s / hop)); }
    const peak = Math.max(...env), out = [];
    let lastHit = -1e9;
    for (let i = 1; i < env.length; i++) if (env[i] > peak * 0.25 && env[i - 1] <= peak * 0.25 && i - lastHit > 18) { out.push(Math.max(0, (i - 1) * hop / sr - 0.005)); lastHit = i; }
    return out.length ? out : [0];
  }
  // play a recording (or a slice of one) into a node; returns true if there was one
  playFile(slot, { dest = this.fx, gain = 1, rate = 1, at = 0, dur } = {}) {
    const f = this.files[slot]; if (!f || !this.ctx) return false;
    const s = this.ctx.createBufferSource(); s.buffer = f.buf; s.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = gain * f.gain;
    s.connect(g).connect(dest);
    let off = 0;
    if (f.hits) { off = f.hits[Math.floor(Math.random() * f.hits.length)]; dur = dur ?? 0.45; }
    const t0 = this.ctx.currentTime + at;
    // a slice fades out at its end instead of being cut off (a cut clicks)
    if (dur) { const v = gain * f.gain; g.gain.setValueAtTime(v, t0 + dur * 0.6); g.gain.linearRampToValueAtTime(0, t0 + dur); }
    s.start(t0, off, dur);
    return true;
  }
  fileLoop(slot, dest, gain = 0) {
    const f = this.files[slot]; if (!f) return null;
    const s = this.ctx.createBufferSource(); s.buffer = f.buf; s.loop = true;
    const trim = this.ctx.createGain(); trim.gain.value = f.gain;   // per-file level from files.json
    const g = this.ctx.createGain(); g.gain.value = gain;
    s.connect(trim).connect(g).connect(dest); s.start(0, Math.random() * f.buf.duration);
    return g;
  }
  // recordings that replace synthesized beds
  startFileLoops() {
    const F = this.files;
    if (F.rain_street) { this.rainFile = this.fileLoop('rain_street', this.outBus); for (const g of this.rainGains) g.gain.value = 0; this.rainBase = [0.12, 0.02, 0.08]; }
    if (F.rain_roof) this.roofFile = this.fileLoop('rain_roof', this.inBus);
    if (F.city_far) this.cityFile = this.fileLoop('city_far', this.outBus);
    if (F.birds) this.birdFile = this.fileLoop('birds', this.outBus);
    if (F.insects) this.bugFile = this.fileLoop('insects', this.outBus);
    if (F.train_pass) this.trainFile = this.fileLoop('train_pass', this.trainEm.in);
    for (const L of this.leaks) if (F[L.kind] && !L.file) L.file = this.fileLoop(L.kind, L.em.in, 0.6);
    this.roomFiles = {};
    for (const k of ['konbini', 'izakaya', 'ramen', 'arcade', 'pachinko', 'station', 'laundry', 'kissa']) if (F[k]) this.roomFiles[k] = this.fileLoop(k, this.inBus);
    this.applyOut();
  }

  // ---------- positional sound ----------
  emitter(x, y, z, { ref = 4, roll = 1, max = 80 } = {}) {
    const ctx = this.ctx, p = ctx.createPanner();
    p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = roll; p.maxDistance = max;
    p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z;
    const inp = ctx.createGain(), muffle = ctx.createBiquadFilter(); muffle.type = 'lowpass'; muffle.frequency.value = 20000;
    inp.connect(muffle).connect(p).connect(this.bus.amb);
    p.connect(this.rev[2]);
    return { in: inp, p, muffle, set: (a, b, c) => { const t = ctx.currentTime; p.positionX.setTargetAtTime(a, t, 0.05); p.positionY.setTargetAtTime(b, t, 0.05); p.positionZ.setTargetAtTime(c, t, 0.05); } };
  }
  // the ears follow the camera
  setListener(pos, fwd) {
    if (!this.ctx) return;
    const L = this.ctx.listener, t = this.ctx.currentTime;
    if (L.positionX) {
      L.positionX.setTargetAtTime(pos.x, t, 0.03); L.positionY.setTargetAtTime(pos.y, t, 0.03); L.positionZ.setTargetAtTime(pos.z, t, 0.03);
      L.forwardX.setTargetAtTime(fwd.x, t, 0.03); L.forwardY.setTargetAtTime(fwd.y, t, 0.03); L.forwardZ.setTargetAtTime(fwd.z, t, 0.03);
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else { L.setPosition(pos.x, pos.y, pos.z); L.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0); }
  }
  // shops you can hear from the street: [{ x, z, y, kind, room }]
  addLeaks(list) {
    if (!this.ctx) { this.pendingLeaks = list; return; }
    for (const r of list) {
      if (!LEAK[r.kind]) continue;
      const em = this.emitter(r.x, (r.y ?? 0) + 1.5, r.z, { ref: 2.5, roll: 1.6, max: 40 });
      const L = { ...r, em, beds: this.leakBed(r.kind, em.in) };
      if (this.files[r.kind]) L.file = this.fileLoop(r.kind, em.in, 0.6);
      this.leaks.push(L);
    }
  }
  // the synthesized noise of a shop: murmur, a hum, and for some a beat
  leakBed(kind, dest) {
    const v = { izakaya: [0.5, 0.05], ramen: [0.3, 0.1], konbini: [0.06, 0.25], arcade: [0.12, 0.2], pachinko: [0.15, 0.3], karaoke: [0.08, 0.05], kissa: [0.15, 0.04], station: [0.12, 0.15], laundry: [0.02, 0.3], gacha: [0.06, 0.15] }[kind] || [0.1, 0.1];
    return [this.loop(this.brown, [['bandpass', 520], ['lowpass', 900]], v[0] * 0.5, dest), this.loop(this.brown, [['lowpass', 120]], v[1] * 0.5, dest)];
  }

  // ---------- one-shots ----------
  burst({ freq = 900, q = 1, dur = 0.08, gain = 0.15, at = 0, dest = this.fx, type = 'bandpass' }) {
    const ctx = this.ctx, t = ctx.currentTime + at;
    const s = ctx.createBufferSource(); s.buffer = this.white;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 1.8, dur + 0.02);
  }
  tone(f, d, dur, vol = 0.12, type = 'sine', dest = this.fx, f2 = null) {
    const ctx = this.ctx, t = ctx.currentTime + d;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }

  // a footstep on what's under you: wet asphalt, tiles, wood, metal stairs, carpet. Just the step itself:
  // a recording slice (or a synthesized thud), softened at the top so there's no crackle
  step(run, surface = 'wet') {
    if (!this.ctx) return;
    const k = run ? 1.3 : 1, slot = { wet: 'step_wet', tile: 'step_tile', wood: 'step_wood', metal: 'step_metal', carpet: 'step_wood' }[surface];
    this.stepLP.frequency.setValueAtTime(surface === 'metal' ? 3500 : surface === 'carpet' ? 1200 : 2400, this.ctx.currentTime);
    if (this.playFile(slot, { dest: this.stepLP, gain: (surface === 'carpet' ? 0.4 : 0.8) * k, rate: 0.94 + Math.random() * 0.12, dur: 0.35 })) return;
    const r = () => Math.random(), d = this.stepLP;
    if (surface === 'metal') {
      this.burst({ freq: 160, q: 1, dur: 0.08, gain: 0.2 * k, dest: d });
      this.burst({ freq: 950 + r() * 200, q: 12, dur: 0.22, gain: 0.07 * k, dest: d });
    } else if (surface === 'wood') {
      this.tone(120 + r() * 30, 0, 0.09, 0.12 * k, 'sine', d, 80);
      this.burst({ freq: 600, q: 1.2, dur: 0.06, gain: 0.07 * k, dest: d });
    } else if (surface === 'tile') {
      this.burst({ freq: 180, q: 1.5, dur: 0.07, gain: 0.22 * k, dest: d });
      this.burst({ freq: 1400, q: 3, dur: 0.03, gain: 0.06 * k, dest: d });
    } else {
      this.burst({ freq: 140 + r() * 40, q: 1.2, dur: 0.1, gain: (surface === 'carpet' ? 0.12 : 0.25) * k, dest: d });
      if (surface === 'wet') this.burst({ freq: 700 + r() * 300, q: 1, dur: 0.07, gain: 0.08 * k, dest: d });
    }
  }

  ding(vol) {
    const ctx = this.ctx, t = ctx.currentTime;
    for (const [f, k] of [[760, 1], [1210, 0.45], [2050, 0.2]]) {
      const o = ctx.createOscillator(); o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol * k, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
      o.connect(g).connect(this.bellEm.in); o.start(t); o.stop(t + 0.4);
    }
  }
  clunk() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    this.burst({ freq: 300, q: 2, dur: 0.12, gain: 0.35 });
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(180, t + 0.18); o.frequency.exponentialRampToValueAtTime(60, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.setValueAtTime(0.4, t + 0.18); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g).connect(this.fx); o.start(t); o.stop(t + 0.5);
  }
  chime() {
    if (!this.ctx) return;
    [[1046, 0], [1568, 0.08], [2093, 0.16]].forEach(([f, d]) => this.tone(f, d, 0.6, 0.12));
  }
  meow() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(520, t); o.frequency.linearRampToValueAtTime(820, t + 0.15); o.frequency.linearRampToValueAtTime(560, t + 0.5);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1200; f.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(f).connect(g).connect(this.fx); o.start(t); o.stop(t + 0.6);
  }

  // ---------- foley for what the character does ----------
  click(at = 0) { if (this.ctx) { this.burst({ freq: 3000, q: 4, dur: 0.03, gain: 0.12, at }); this.tone(1900, at + 0.02, 0.05, 0.03, 'square'); } }
  canOpen(at = 0) {
    if (!this.ctx) return;
    if (this.playFile('can_open', { at, gain: 0.8 })) return;
    this.burst({ freq: 2400, q: 3, dur: 0.03, gain: 0.25, at });
    this.burst({ freq: 5200, q: 0.8, dur: 0.45, gain: 0.12, at: at + 0.02, type: 'highpass' });
  }
  gulp(at = 0) { if (this.ctx) for (let i = 0; i < 3; i++) this.tone(240 - i * 20, at + i * 0.42, 0.14, 0.09, 'sine', this.fx, 120); }
  tap(at = 0) { if (this.ctx) this.burst({ freq: 4200 + Math.random() * 800, q: 5, dur: 0.018, gain: 0.05, at }); }
  rustle(at = 0, k = 1) { if (this.ctx) this.burst({ freq: 2600, q: 0.6, dur: 0.35, gain: 0.07 * k, at }); }
  creak(kind = 'chair', at = 0) {
    if (!this.ctx) return;
    if (this.playFile(kind === 'bed' ? 'bed_creak' : 'chair_creak', { at, gain: 0.7 })) return;
    const ctx = this.ctx, t = ctx.currentTime + at, base = kind === 'bed' ? 210 : 380;
    // a rubbed squeak: a sawtooth wobbling in pitch, through a resonant band
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(base, t); o.frequency.linearRampToValueAtTime(base * 1.4, t + 0.18); o.frequency.linearRampToValueAtTime(base * 0.9, t + 0.4);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = base * 3; f.Q.value = 8;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(f).connect(g).connect(this.fx); o.start(t); o.stop(t + 0.5);
    if (kind === 'bed') { this.tone(95, at, 0.25, 0.1, 'sine', this.fx, 70); for (let i = 0; i < 3; i++) this.tone(620 + i * 90, at + 0.08 + i * 0.05, 0.25, 0.012, 'triangle'); }
  }
  // a little voice sound from your character (recording slot only; nothing synthesized would sound right)
  voice(who, gain = 0.7) { this.playFile(`voice_${who}`, { dest: this.bus?.voice, gain, dur: 0.9 }); }

  // ---------- doors ----------
  // an automatic door's chime, a konbini's tune, a wooden sliding door's rumble, a hinge's creak, a car door
  door(kind, open) {
    if (!this.ctx) return;
    if (kind === 'gate') { this.tone(1760, 0, 0.12, 0.06, 'square'); return; }
    if (kind === 'konbini') {
      // the shop's own doorbell tune (ours, not a chain's): a bright two-bar phrase on a soft square
      if (open) [[1175, 0], [988, 0.16], [784, 0.32], [988, 0.48], [1175, 0.64], [1568, 0.8], [1319, 1.04]].forEach(([f, d]) => { this.tone(f, d, 0.32, 0.05, 'square'); this.tone(f * 2, d, 0.2, 0.012, 'sine'); });
      this.burst({ freq: 200, q: 0.6, dur: 0.5, gain: 0.05 });
      return;
    }
    if (kind === 'auto') { this.tone(988, 0, 0.5, 0.08); this.tone(784, 0.28, 0.7, 0.08); this.burst({ freq: 200, q: 0.6, dur: 0.5, gain: 0.05 }); }
    else if (kind === 'car') {
      if (open) { if (!this.playFile('car_door_open', { gain: 0.8 })) { this.burst({ freq: 1800, q: 4, dur: 0.04, gain: 0.15 }); this.burst({ freq: 500, q: 1, dur: 0.15, gain: 0.06, at: 0.03 }); } }
      else if (!this.playFile('car_door_close', { gain: 0.9 })) { this.tone(70, 0, 0.25, 0.35, 'sine', this.fx, 45); this.burst({ freq: 240, q: 1, dur: 0.16, gain: 0.35 }); this.burst({ freq: 1500, q: 3, dur: 0.04, gain: 0.08, at: 0.01 }); }
    } else if (kind === 'wood') { this.burst({ freq: 260, q: 0.8, dur: 0.35, gain: 0.22 }); this.burst({ freq: 900, q: 2, dur: 0.06, gain: open ? 0.04 : 0.12 }); }
    else if (kind === 'swing') { this.burst({ freq: 420, q: 4, dur: 0.25, gain: 0.08 }); if (!open) this.burst({ freq: 180, q: 1, dur: 0.12, gain: 0.3 }); }
    else { this.burst({ freq: 700, q: 1.2, dur: 0.3, gain: 0.12 }); if (!open) this.burst({ freq: 300, q: 2, dur: 0.08, gain: 0.18 }); }
  }
  horn() { if (this.ctx) { this.tone(415, 0, 0.45, 0.07, 'square'); this.tone(523, 0, 0.45, 0.06, 'square'); } }
  beep() { if (this.ctx) { this.tone(2200, 0, 0.12, 0.06, 'square'); this.tone(2200, 0.16, 0.12, 0.06, 'square'); } }
  capsule() { if (this.ctx) { for (let i = 0; i < 6; i++) this.burst({ freq: 1800 + i * 120, q: 6, dur: 0.04, gain: 0.07, at: i * 0.05 }); this.clunk(); } }
  win() { if (this.ctx) [523, 659, 784, 1046].forEach((f, i) => this.tone(f, i * 0.11, 0.35, 0.09, 'triangle')); }
  lose() { if (this.ctx) [392, 330, 262].forEach((f, i) => this.tone(f, i * 0.16, 0.4, 0.07, 'triangle')); }
  // the platform melody when a train stands at the station (an original 8-note bell tune), then the announcement
  departure() {
    if (!this.ctx) return;
    [659, 784, 880, 1047, 988, 880, 784, 880].forEach((f, i) => { this.tone(f, i * 0.28, 0.5, 0.05, 'sine'); this.tone(f * 3, i * 0.28, 0.25, 0.01, 'sine'); });
    this.playFile('station_announce', { dest: this.bus.voice, at: 2.6, gain: 0.7 });
  }

  // ---------- car ----------
  engineVoice() {
    const ctx = this.ctx, o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
    o1.type = 'sawtooth'; o2.type = 'square'; o1.frequency.value = 30; o2.frequency.value = 15;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300; f.Q.value = 2;
    const g = ctx.createGain(); g.gain.value = 0;
    const m2 = ctx.createGain(); m2.gain.value = 0.5;
    o1.connect(f); o2.connect(m2).connect(f); f.connect(g).connect(this.carEm.in);
    o1.start(); o2.start();
    return { o1, o2, f, g, gear: 1 };
  }
  // your car: k = speed share (0..1, <0 reversing). Engine pitch climbs through the gears; tyres hiss on the wet road
  setEngine(k, throttle = 0) {
    if (!this.ctx) return; this.ownEngine = k;
    const t = this.ctx.currentTime, a = Math.abs(k), E = this.eng;
    const gears = [0, 0.14, 0.3, 0.5, 0.72, 1.01];
    let gear = 1; while (gear < 5 && a > gears[gear]) gear++;
    const into = (a - gears[gear - 1]) / (gears[gear] - gears[gear - 1]);
    const rpm = k === 0 && !this.inCar ? 0 : 900 + into * 3600 + throttle * 300;
    const hz = rpm / 60 * 2;
    E.o1.frequency.setTargetAtTime(hz, t, 0.08); E.o2.frequency.setTargetAtTime(hz / 2, t, 0.08);
    E.f.frequency.setTargetAtTime(200 + rpm * 0.18 + throttle * 400, t, 0.1);
    E.g.gain.setTargetAtTime(this.inCar ? 0.05 + throttle * 0.05 + a * 0.04 : 0, t, 0.1);
    this.engine.gain.setTargetAtTime(this.inCar ? 0.15 + a * 0.3 : 0, t, 0.1);
    this.hiss.gain.setTargetAtTime(a * (0.15 + 0.3 * this.rainK), t, 0.1);
  }
  // in a car or not (puts the car's sounds on you), and the wipers when it rains
  setCar(on, pos) {
    if (!this.ctx) return;
    if (on && pos) this.carEm.set(pos.x, pos.y + 0.6, pos.z);
    if (on === !!this.inCar) return;
    this.inCar = on;
    if (!on) { this.eng.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2); this.ownEngine = 0; }
    this.music.setRadio(on);
    this.applyOut();
  }
  wipe() {
    if (!this.ctx || this.files.wiper) return;   // the recording runs as a loop instead (see update)
    this.tone(110, 0, 0.5, 0.025, 'sawtooth', this.fx, 130);
    this.burst({ freq: 1800, q: 6, dur: 0.18, gain: 0.03, at: 0.3 });
  }

  // ---------- per frame ----------
  // s: world sound state (bell, train, traffic); p: the player's position; me: { speed, run }
  update(dt, s, p, me = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.pendingLeaks) { const l = this.pendingLeaks; this.pendingLeaks = null; this.addLeaks(l); }
    if (s.bellPos) this.bellEm.set(s.bellPos.x, s.bellPos.y, s.bellPos.z);
    if (s.bell) {
      this.bellT -= dt;
      if (this.bellT <= 0) { this.bellT = 0.46; this.ding(0.3); }
    } else this.bellT = 0;
    // the train: positional when we know where it is, otherwise right on you (riding inside)
    if (s.trainPos) this.trainEm.set(s.trainPos.x, s.trainPos.y ?? 5, s.trainPos.z);
    else this.trainEm.set(p.x, p.y + 1, p.z);
    const near = Math.max(0, 1 - s.trainDist / 160);
    const tg = near > 0 ? 0.6 + near * 0.5 : 0;
    this.rumble.gain.setTargetAtTime(this.trainFile ? tg * 0.25 : tg, t, 0.2);
    this.screech.gain.setTargetAtTime(near > 0.6 && s.trainBraking ? 0.03 : 0, t, 0.3);
    this.trainFile?.gain.setTargetAtTime(tg * 0.9, t, 0.2);
    // traffic (the AI car), unless you're driving
    if (!this.inCar) {
      if (s.carPos) this.carEm.set(s.carPos.x, 0.6, s.carPos.z);
      const c = (s.carDist ?? 999) < 60 ? 1 : 0, sp = Math.min(1, (s.carSpeed ?? 0) / 10);
      this.hiss.gain.setTargetAtTime(c * sp * (0.2 + 0.3 * this.rainK), t, 0.15);
      this.engine.gain.setTargetAtTime(c * (0.25 + sp * 0.3), t, 0.15);
    }
    // wipers: the recording loops while you drive in the rain
    if (this.files.wiper) {
      if (!this.wiperG) this.wiperG = this.fileLoop('wiper', this.fx);
      this.wiperG.gain.setTargetAtTime(this.inCar && this.rainK > 0.12 ? 0.5 : 0, t, 0.3);
    }
    // arcade: cabinets chirping now and then
    if ((this.room === 'arcade' || this.room === 'gacha') && (this.blipT -= dt) <= 0) {
      this.blipT = 0.15 + Math.random() * 0.5;
      const f = [523, 659, 784, 880, 1046, 1318][Math.floor(Math.random() * 6)];
      this.tone(f, 0, 0.12, 0.025, Math.random() < 0.5 ? 'square' : 'triangle', this.inBus);
    }
    // pachinko: a rain of steel balls
    if (this.room === 'pachinko' && !this.roomFiles?.pachinko && (this.blipT -= dt) <= 0) { this.blipT = 0.02 + Math.random() * 0.05; this.burst({ freq: 3000 + Math.random() * 3000, q: 9, dur: 0.03, gain: 0.03, dest: this.inBus }); }
    // you: puffing after a long run
    const sp = me.speed || 0;
    this.runFor = me.run && sp > 3 ? this.runFor + dt : Math.max(0, this.runFor - dt * 0.6);
    if (this.runFor > 5 && (this.breathT -= dt) <= 0) {
      this.breathT = me.run ? 0.75 : 1.1;
      const k = Math.min(1, (this.runFor - 5) / 4) * 0.06;
      this.burst({ freq: 1100, q: 0.7, dur: 0.28, gain: k, dest: this.bus.voice });
      this.burst({ freq: 800, q: 0.7, dur: 0.35, gain: k * 0.8, at: 0.36, dest: this.bus.voice });
    }
    // leaks: a shop's sound comes through its door when you're outside, and is muffled from further in
    for (const L of this.leaks) {
      const d = Math.hypot(p.x - L.x, p.z - L.z), inside = this.roomRef === L.room;
      const k = inside || d > 30 ? 0 : 1;
      L.em.in.gain.setTargetAtTime(k, t, 0.3);
      L.em.muffle.frequency.setTargetAtTime(d < 3 ? 2500 : 900, t, 0.3);
    }
    // the sea and the expressway (north.js geometry: quay at x 176, expressway along x 106 at 15 m)
    if (this.seaEm) {
      const near = p.x > 60 && p.z > 20;
      const sz = Math.min(300, Math.max(-100, p.z)), wave = 0.6 + 0.4 * Math.sin(t * 0.45) * Math.sin(t * 0.21 + 1);
      this.seaEm.set(176, 0, sz);
      this.seaLow.gain.setTargetAtTime(near ? 0.55 * wave : 0, t, 0.4);
      this.seaLap.gain.setTargetAtTime(near ? 0.08 * wave * wave : 0, t, 0.3);
      const ez = Math.min(278, Math.max(-232, p.z));
      this.expEm.set(106, 15, ez);
      const onIt = p.y > 10 && Math.abs(p.x - 106) < 20;
      this.expRoar.gain.setTargetAtTime(p.x > 40 ? (onIt ? 0.25 : 0.5) : 0, t, 0.5);
      this.expHiss.gain.setTargetAtTime(p.x > 40 ? 0.05 : 0, t, 0.5);
      // now and then a ship's horn out in the harbour
      if (p.x > 90 && (this.hornT -= dt) <= 0) { this.hornT = 60 + Math.random() * 90; this.shipHorn(); }
    }
    this.life(dt);
  }
  shipHorn() {
    if (!this.ctx) return;
    for (const [f, v] of [[92, 0.16], [138, 0.1], [184, 0.05]]) { this.tone(f, 0, 3.4, v, 'sawtooth', this.seaEm.in); this.tone(f, 4.0, 1.6, v * 0.8, 'sawtooth', this.seaEm.in); }
  }
  // thunder: a crack (close) and a long rolling rumble; delay = how far away the strike was
  thunder(k = 1, delay = 1) {
    if (!this.ctx) return;
    const d = this.outBus;
    if (delay < 1) this.burst({ freq: 1200, q: 0.5, dur: 0.5, gain: 0.35 * k, at: delay, dest: d });
    for (let i = 0; i < 5; i++) this.burst({ freq: 90 + Math.random() * 60, q: 0.5, dur: 1.7, gain: (0.7 - i * 0.1) * k, at: delay + i * (0.35 + Math.random() * 0.35), dest: d, type: 'lowpass' });
  }
  // birds by day, insects on quiet nights; city hum louder by day; all of it hushed by the rain
  setTime(minute, daylight) { this.minute = minute; this.daylight = daylight; }
  life(dt) {
    const t = this.ctx.currentTime, dry = 1 - Math.min(1, this.rainK * 1.6), d = this.daylight, out = this.room ? 0.3 : 1;
    const morning = Math.max(0, 1 - Math.abs(this.minute - 420) / 150);
    const birdK = (d * 0.5 + morning * 0.8) * (0.3 + 0.7 * dry), bugK = (1 - d) * dry * (this.minute > 1200 || this.minute < 240 ? 1 : 0.4);
    this.cityHum.gain.setTargetAtTime((0.04 + d * 0.08) * out, t, 1);
    this.cityFile?.gain.setTargetAtTime((0.25 + d * 0.35) * out, t, 1);
    this.birdFile?.gain.setTargetAtTime(birdK * 0.6 * out, t, 1);
    this.bugFile?.gain.setTargetAtTime(bugK * 0.4 * out, t, 1);
    if ((this.lifeT -= dt) > 0) return;
    this.lifeT = 0.4 + Math.random() * 1.6;
    if (!this.birdFile && Math.random() < birdK * out) {
      // a sparrow: two or three quick falling chirps
      const n = 2 + Math.floor(Math.random() * 3), f = 3800 + Math.random() * 1600;
      for (let i = 0; i < n; i++) this.tone(f * (1 - i * 0.04), i * 0.11, 0.07, 0.018, 'sine', this.outBus, f * 0.7);
    }
    if (!this.bugFile && Math.random() < bugK * out * 0.8) {
      // a cricket: a short trill
      for (let i = 0; i < 6; i++) this.tone(4700, i * 0.035, 0.025, 0.008, 'sine', this.outBus);
    }
    // under a roof in the rain: now and then a fat drip off the edge
    if (this.underRoof && this.rainK > 0.2 && Math.random() < 0.6) {
      if (!this.playFile('drip', { dest: this.outBus, gain: 0.4, rate: 0.8 + Math.random() * 0.4 })) this.tone(900 + Math.random() * 900, 0, 0.12, 0.02, 'sine', this.outBus, 400);
    }
  }

  // how hard it rains (weather), and whether there's a roof over you
  setRain(k) { this.rainK = k; this.applyOut(); }
  setShelter(under) { if (this.underRoof !== under) { this.underRoof = under; this.applyOut(); } }
  // which room you're in (its ambience kind) — and which room object, so its leak is silenced
  setRoom(kind, ref = null) {
    this.roomRef = ref;
    if (!this.ctx || this.room === kind) return;
    this.room = kind; this.applyOut();
    const t = this.ctx.currentTime, P = PLACES[kind || 'street'] || PLACES.quiet;
    // a recording of the room replaces most of the synthesized murmur
    const real = this.roomFiles?.[kind] ? 0.3 : 1;
    this.hum.gain.setTargetAtTime(P.hum || 0, t, 0.4); this.murmur.gain.setTargetAtTime((P.murmur || 0) * real, t, 0.4);
    this.rev.forEach((s, i) => s.gain.setTargetAtTime(P.rev[i] * 0.9, t, 0.4));
    for (const [k, g] of Object.entries(this.roomFiles || {})) g.gain.setTargetAtTime(k === kind ? 0.7 : 0, t, 0.5);
    this.music.setPlace(kind);
  }
  applyOut() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, inside = !!this.room && this.room !== 'shotengai', covered = this.room === 'shotengai';
    this.outLP.frequency.setTargetAtTime(inside ? 420 : covered ? 2500 : 20000, t, 0.25);
    this.outBus.gain.setTargetAtTime(inside ? 0.45 : 1, t, 0.25);
    const rk = 0.15 + 0.85 * this.rainK;
    this.rainGains.forEach((g, i) => g.gain.setTargetAtTime(this.rainBase[i] * rk * (this.rainK > 0.01 ? 1 : 0.15), t, 0.5));
    this.rainFile?.gain.setTargetAtTime(0.8 * this.rainK, t, 0.5);
    // rain drumming on the roof above you: an awning, the arcade's roof, your apartment's window
    const roof = (this.underRoof || covered || this.room === 'quiet') && this.rainK > 0.02 ? this.rainK : 0;
    this.roofRain.gain.setTargetAtTime(this.roofFile ? 0 : roof * 0.05, t, 0.4);
    this.roofLow.gain.setTargetAtTime(this.roofFile ? 0 : roof * 0.12, t, 0.4);
    this.roofFile?.gain.setTargetAtTime(roof * 0.7, t, 0.4);
    for (const em of [this.trainEm, this.bellEm, ...(this.inCar ? [] : [this.carEm])]) em.muffle.frequency.setTargetAtTime(inside ? 500 : covered ? 2500 : 20000, t, 0.25);
    this.music.setRain(this.rainK);
  }

  // ---------- volumes ----------
  setVolume(k, v) {
    this.vol[k] = Math.max(0, Math.min(1, v));
    try { localStorage.setItem(VOL_KEY, JSON.stringify(this.vol)); } catch { /* storage unavailable */ }
    this.applyVolumes();
  }
  applyVolumes() {
    if (!this.ctx) return;
    for (const k of Object.keys(this.bus)) this.bus[k].gain.setTargetAtTime(this.vol[k], this.ctx.currentTime, 0.05);
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.vol.master, this.ctx.currentTime, 0.05);
  }
  // music dips under dialogue, a passing train, the crossing bell
  duck(k) { this.music?.duck(k); }
  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : this.vol.master, this.ctx.currentTime, 0.05);
    return this.muted;
  }
}
