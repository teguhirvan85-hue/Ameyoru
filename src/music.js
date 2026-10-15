// Generative music: small synthesized bands that never play the same bar twice.
// One "style" per place (lo-fi on the street, piano at home, city pop in karaoke, chiptune in the arcade, jazz in
// the kissa and izakaya), radio stations in the car. A style with a recording (music_<style> in files.json) plays that
// instead. Styles crossfade; heavy rain thins the drums; dialogue and trains duck it.

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
// chords: [root (midi), intervals]
const C = (root, ...iv) => ({ root, iv });
const PROG = {
  lofi: [C(53, 0, 4, 7, 11, 14), C(52, 0, 3, 7, 10, 14), C(50, 0, 3, 7, 10, 14), C(48, 0, 4, 7, 11, 14)],
  lofi2: [C(57, 0, 3, 7, 10, 14), C(50, 0, 3, 7, 10, 14), C(55, 0, 4, 7, 10, 14), C(48, 0, 4, 7, 11, 14)],
  piano: [C(57, 0, 3, 7, 10, 14), C(53, 0, 4, 7, 11, 16), C(48, 0, 4, 7, 11, 14), C(55, 0, 4, 7, 9, 14)],
  bright: [C(48, 0, 4, 7, 11), C(57, 0, 3, 7, 10), C(50, 0, 3, 7, 10), C(55, 0, 4, 7, 10)],
  citypop: [C(53, 0, 4, 7, 11, 14), C(52, 0, 4, 8, 10, 15), C(57, 0, 3, 7, 10, 14), C(55, 0, 3, 7, 10, 14), C(48, 0, 4, 7, 10, 14), C(53, 0, 4, 7, 11, 14), C(58, 0, 4, 7, 11, 14), C(57, 0, 4, 7, 10, 13)],
  jazz: [C(50, 0, 3, 7, 10, 14), C(55, 0, 4, 10, 14, 21), C(48, 0, 4, 7, 11, 14), C(57, 0, 4, 10, 13)],
  chip: [C(48, 0, 4, 7), C(55, 0, 4, 7), C(57, 0, 3, 7), C(53, 0, 4, 7)],
};

// each style: tempo, progression, how loud each part is, swing, lo-fi-ness, and its overall level
const STYLES = {
  street: { outdoor: true, bpm: 70, prog: 'lofi', parts: { pad: 0.45, keys: 0.3, drums: 0.0 }, swing: 0.12, lofi: 0.8, rests: 0.35, level: 0.42 },
  shotengai: { outdoor: true, bpm: 80, prog: 'lofi2', parts: { pad: 0.2, keys: 0.42, bass: 0.45, drums: 0.4 }, swing: 0.14, lofi: 1, level: 0.5 },
  quiet: { bpm: 62, prog: 'piano', parts: { piano: 0.55, pad: 0.15 }, swing: 0, lofi: 0.5, level: 0.45 },
  konbini: { bpm: 116, prog: 'bright', parts: { keys: 0.35, bass: 0.35, hats: 0.2, bell: 0.22 }, swing: 0, lofi: 0.2, level: 0.5 },
  arcade: { bpm: 138, prog: 'chip', parts: { chip: 0.32, chipBass: 0.35, drums: 0.3 }, swing: 0, lofi: 0, level: 0.75 },
  karaoke: { bpm: 100, prog: 'citypop', parts: { keys: 0.4, bass: 0.55, drums: 0.5, lead: 0.32, pad: 0.18 }, swing: 0.05, lofi: 0.1, level: 0.55 },
  jazz: { bpm: 92, prog: 'jazz', parts: { keys: 0.4, bass: 0.45, brush: 0.35 }, swing: 0.3, lofi: 0.6, level: 0.4 },
  citypop: { bpm: 108, prog: 'citypop', parts: { keys: 0.4, bass: 0.55, drums: 0.5, lead: 0.3, pad: 0.2 }, swing: 0.04, lofi: 0.15, level: 0.5 },
  lofi: { bpm: 78, prog: 'lofi2', parts: { pad: 0.2, keys: 0.45, bass: 0.45, drums: 0.45 }, swing: 0.15, lofi: 1, level: 0.5 },
};
// which style plays where (room ambience kind → style); null = the street
const BY_PLACE = { null: 'street', street: 'street', shotengai: 'shotengai', quiet: 'quiet', konbini: 'konbini', arcade: 'arcade', karaoke: 'karaoke', kissa: 'jazz', izakaya: 'jazz', ramen: 'jazz', pachinko: null, station: null, laundry: 'konbini', gacha: 'arcade' };
export const STATIONS = [['citypop', 'FM Hoshimi · City Pop'], ['jazz', 'Ameyoru Jazz'], ['lofi', 'Lo-fi Rain'], [null, 'Radio off']];

export class Music {
  constructor(ctx, out) {
    this.ctx = ctx; this.files = {};
    this.duckG = ctx.createGain(); this.duckG.connect(out);
    // the radio speaker: thin and boxy
    this.radioHP = ctx.createBiquadFilter(); this.radioHP.type = 'highpass'; this.radioHP.frequency.value = 20;
    this.radioPk = ctx.createBiquadFilter(); this.radioPk.type = 'peaking'; this.radioPk.frequency.value = 2200; this.radioPk.gain.value = 0;
    this.radioHP.connect(this.radioPk).connect(this.duckG);
    // lo-fi chain: a warm lowpass and a soft saturation, with vinyl crackle on top
    this.lofiLP = ctx.createBiquadFilter(); this.lofiLP.type = 'lowpass'; this.lofiLP.frequency.value = 6000; this.lofiLP.Q.value = 0.5;
    const sat = ctx.createWaveShaper(); const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 1.6) / Math.tanh(1.6); }
    sat.curve = curve;
    this.lofiLP.connect(sat).connect(this.radioHP);
    this.crackle = ctx.createGain(); this.crackle.gain.value = 0; this.crackle.connect(this.radioHP);
    const n = ctx.sampleRate * 3, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() < 0.0004 ? (Math.random() * 2 - 1) * 0.8 : 0) + (Math.random() * 2 - 1) * 0.012;
    const cs = ctx.createBufferSource(); cs.buffer = buf; cs.loop = true;
    const cf = ctx.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = 3000; cf.Q.value = 0.4;
    cs.connect(cf).connect(this.crackle); cs.start();
    // a slow tape wobble shared by all pitched notes
    this.wob = ctx.createOscillator(); this.wob.frequency.value = 0.35;
    this.wobG = ctx.createGain(); this.wobG.gain.value = 6; this.wob.connect(this.wobG); this.wob.start();
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = this.noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.deck = null; this.place = null; this.radio = false; this.station = 0; this.rain = 0; this.duckK = 1; this.duckT = 1;
    this.setPlace(null);
    // its own clock, so a slow frame never starves the band
    let last = performance.now();
    setInterval(() => { const now = performance.now(); this.update(Math.min(0.2, (now - last) / 1000)); last = now; }, 30);
  }

  // ---------- choosing what plays ----------
  setPlace(kind) { this.place = kind; const k = kind ?? 'null'; if (!this.radio) this.play(k in BY_PLACE ? BY_PLACE[k] : null); }
  setRadio(on) {
    this.radio = on;
    const t = this.ctx.currentTime;
    this.radioHP.frequency.setTargetAtTime(on ? 140 : 20, t, 0.1); this.radioPk.gain.setTargetAtTime(on ? 5 : 0, t, 0.1);
    if (on) this.play(STATIONS[this.station][0]); else this.setPlace(this.place);
  }
  nextStation() {
    this.station = (this.station + 1) % STATIONS.length;
    if (this.radio) { this.static(); this.play(STATIONS[this.station][0]); }
    return STATIONS[this.station][1];
  }
  get stationName() { return STATIONS[this.station][1]; }
  setRain(k) { this.rain = k; }
  duck(k) { this.duckT = k; }

  play(name) {
    if (this.deck?.name === name) return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (this.deck) {
      const old = this.deck; old.stopped = true;
      old.gain.gain.cancelScheduledValues(t); old.gain.gain.setTargetAtTime(0, t, 0.8);
      old.src?.stop(t + 4);
      setTimeout(() => old.gain.disconnect(), 5000);
    }
    if (!name) { this.deck = null; this.crackle.gain.setTargetAtTime(0, t, 0.5); return; }
    const S = STYLES[name], gain = ctx.createGain();
    gain.gain.value = 0; gain.gain.setTargetAtTime(S.level * 2.4, t + 0.1, 0.9);
    gain.connect(S.lofi > 0.3 ? this.lofiLP : this.radioHP);
    this.lofiLP.frequency.setTargetAtTime(S.lofi > 0.3 ? 6500 - S.lofi * 3500 : 9000, t, 0.5);
    this.crackle.gain.setTargetAtTime(S.lofi * 0.25, t, 0.5);
    const deck = { name, S, gain, prog: PROG[S.prog], step: 0, bar: 0, next: t + 0.15, rest: false, motif: null, seed: Math.random() * 1e9 };
    // a recording for this style replaces the band
    const f = this.files[`music_${name}`] || this.files[`radio_${name}`];
    if (f) { const s = ctx.createBufferSource(); s.buffer = f.buf; s.loop = true; s.connect(gain); s.start(t + 0.1); deck.src = s; }
    this.deck = deck;
  }
  // a burst of radio static between stations
  static() {
    const ctx = this.ctx, t = ctx.currentTime, s = ctx.createBufferSource(); s.buffer = this.noise;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    s.connect(g).connect(this.radioHP); s.start(t, 0, 0.5);
  }

  // ---------- the scheduler: notes are booked a little ahead of time ----------
  update(dt) {
    const ctx = this.ctx, t = ctx.currentTime;
    this.duckK += (this.duckT - this.duckK) * Math.min(1, dt * 4);
    this.duckG.gain.setTargetAtTime(this.duckK, t, 0.05);
    const D = this.deck; if (!D || D.src) return;
    if (D.next < t - 0.5) D.next = t + 0.05; // after a pause (hidden tab), don't race to catch up
    const sixteenth = 60 / D.S.bpm / 4;
    while (D.next < t + 0.25) {
      this.tick(D, D.next, sixteenth);
      D.step++;
      if (D.step === 16) { D.step = 0; D.bar++; this.newBar(D); }
      // swing: every second sixteenth is late
      D.next += sixteenth * (D.step % 2 ? 1 + D.S.swing : 1 - D.S.swing);
    }
  }
  newBar(D) {
    // some styles leave bars out now and then (the street gets breathing space)
    D.rest = D.S.rests ? Math.random() < D.S.rests && D.bar % 4 !== 0 : false;
    if (D.bar % 8 === 0) D.motif = null;
  }
  chord(D) { return D.prog[D.bar % D.prog.length]; }
  nextChord(D) { return D.prog[(D.bar + 1) % D.prog.length]; }

  tick(D, t, s16) {
    const S = D.S, P = S.parts, st = D.step, ch = this.chord(D), r = Math.random;
    const dk = S.outdoor && !this.radio ? 1 - Math.min(1, this.rain * 1.1) * 0.8 : 1; // heavy rain outside thins the drums
    const out = D.gain, beat = s16 * 4;
    const notes = (lo, hi) => ch.iv.map((i) => ch.root + i).map((m) => { while (m < lo) m += 12; while (m > hi) m -= 12; return m; });
    // ---- pad: the whole chord, swelling
    if (P.pad && st === 0) for (const m of notes(55, 74)) this.pad(t, mtof(m), beat * 4.2, P.pad * 0.06, out);
    if (D.rest) return;
    // ---- electric piano comping
    if (P.keys) {
      const hit = S.prog === 'jazz' ? st === 0 || st === 6 || (st === 10 && r() < 0.4)
        : S.prog === 'bright' ? st % 4 === 2
        : S.prog === 'citypop' ? st === 0 || st === 3 || st === 6 || st === 10 || st === 14
        : st === 0 || (st === 10 && r() < 0.5) || (st === 6 && r() < 0.25);
      if (hit) {
        const len = st === 0 && S.prog !== 'citypop' ? beat * 2.5 : beat * 0.6;
        notes(55, 77).forEach((m, i) => this.epiano(t + i * (S.prog === 'lofi' || S.prog === 'lofi2' ? 0.012 : 0.004), mtof(m), len, P.keys * 0.05 * (st === 0 ? 1 : 0.7), out));
      }
    }
    // ---- piano: broken chords and a few melody notes (the apartment)
    if (P.piano) {
      const arp = notes(48, 72);
      if (st % 3 === 0 && st < 15) this.piano(t, mtof(arp[(st / 3) % arp.length] + (st === 0 ? -12 : 0)), beat * 3, P.piano * 0.08, out);
      if ((st === 8 || st === 14) && r() < 0.35) this.piano(t, mtof(notes(72, 86)[Math.floor(r() * 3)]), beat * 2, P.piano * 0.06, out);
    }
    // ---- bass
    if (P.bass) {
      const root = ch.root - 24 + (ch.root < 50 ? 12 : 0), nx = this.nextChord(D).root - 24 + (this.nextChord(D).root < 50 ? 12 : 0);
      const pat = S.prog === 'citypop' ? { 0: root, 3: root + 12, 6: root + 7, 8: root, 11: root + 12, 14: nx - 1 }
        : S.prog === 'jazz' ? { 0: root, 4: root + 7, 8: root + 12, 12: nx + (nx > root ? -1 : 1) }
        : S.prog === 'bright' ? { 0: root, 4: root + 7, 8: root + 12, 12: root + 7 }
        : { 0: root, 7: root + (r() < 0.5 ? 7 : 12), 10: root, 14: r() < 0.4 ? nx - 2 : undefined };
      if (pat[st] !== undefined) this.bass(t, mtof(pat[st]), S.prog === 'citypop' ? s16 * 2.2 : beat * 0.9, P.bass * 0.22, out, S.prog === 'citypop');
    }
    // ---- drums
    if (P.drums && dk > 0.02) {
      const v = P.drums * dk;
      if (S.prog === 'citypop' || S.prog === 'chip') {
        if (st === 0 || st === 8 || (st === 10 && r() < 0.5)) this.kick(t, v * 0.5, out);
        if (st === 4 || st === 12) this.snare(t, v * 0.32, out);
        if (st % 2 === 0) this.hat(t, v * (st % 4 === 2 ? 0.12 : 0.07), out, st === 14 && S.prog === 'citypop');
      } else {
        if (st === 0 || (st === 7 && r() < 0.6) || st === 10) this.kick(t, v * 0.45, out);
        if (st === 4 || st === 12) this.snare(t, v * 0.22, out, true);
        if (st % 2 === 0 && r() < 0.9) this.hat(t + (r() - 0.5) * 0.01, v * (0.04 + r() * 0.04), out);
      }
    }
    if (P.hats && st % 2 === 0) this.hat(t, P.hats * 0.08 * (st % 4 === 2 ? 1 : 0.5), out);
    // ---- brushes and ride (jazz)
    if (P.brush) {
      if (st === 0 || st === 4 || st === 8 || st === 12 || (st === 6 && r() < 0.6) || (st === 14 && r() < 0.6)) this.ride(t, P.brush * 0.05 * dk + 0.005, out);
      if (st === 4 || st === 12) this.brush(t, P.brush * 0.08 * dk, s16 * 3, out);
    }
    // ---- shop bell melody (konbini)
    if (P.bell && (st === 0 || st === 6 || st === 12) && r() < 0.6) this.bell(t, mtof(notes(76, 91)[Math.floor(r() * 4)]), P.bell * 0.05, out);
    // ---- chiptune
    if (P.chip) {
      const arp = notes(60, 84);
      this.chip(t, mtof(arp[st % arp.length]), s16 * 0.9, P.chip * 0.035, out, 'square');
      if (st % 4 === 0 && r() < 0.5) this.chip(t, mtof(arp[(st / 4) % arp.length] + 12), s16 * 3, P.chip * 0.03, out, 'square');
    }
    if (P.chipBass && st % 2 === 0) this.chip(t, mtof(ch.root - 12 + (st % 4 ? 12 : 0)), s16 * 1.6, P.chipBass * 0.09, out, 'triangle');
    // ---- lead melody (city pop / karaoke): a two-bar motif from the chord and the pentatonic, repeated and varied
    if (P.lead) {
      if (!D.motif) D.motif = this.makeMotif();
      const ev = D.motif[(D.bar % 2) * 16 + st];
      if (ev) {
        const pool = [...notes(67, 84), ...[0, 2, 4, 7, 9].map((i) => 72 + i)].sort((a, b) => a - b);
        const m = pool[Math.min(pool.length - 1, Math.floor(ev.deg * pool.length))];
        this.lead(t, mtof(m), s16 * ev.len, P.lead * 0.05, out);
      }
    }
  }
  makeMotif() {
    const m = [], r = Math.random;
    let i = 0, deg = 0.5;
    while (i < 32) {
      if (r() < 0.7) { const len = [1, 2, 2, 3, 4][Math.floor(r() * 5)]; deg = Math.max(0, Math.min(0.99, deg + (r() - 0.5) * 0.35)); m[i] = { deg, len }; i += len; }
      else i += 2;
    }
    return m;
  }

  // ---------- instruments ----------
  osc(type, f, t) {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    this.wobG.connect(o.detune);
    o.onended = () => { try { this.wobG.disconnect(o.detune); } catch { /* already gone */ } };
    return o;
  }
  env(t, a, peak, dur, dest) { const g = this.ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); g.connect(dest); return g; }
  epiano(t, f, dur, v, dest) {
    // two sines and a short FM "bark" at the attack
    const g = this.env(t, 0.005, v, dur + 0.6, dest);
    const o1 = this.osc('sine', f, t), o2 = this.osc('sine', f * 2.001, t), m = this.osc('sine', f * 7, t);
    const mg = this.ctx.createGain(); mg.gain.setValueAtTime(f * 1.2, t); mg.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
    m.connect(mg).connect(o1.frequency);
    const g2 = this.ctx.createGain(); g2.gain.value = 0.18; o2.connect(g2).connect(g);
    o1.connect(g);
    for (const o of [o1, o2, m]) { o.start(t); o.stop(t + dur + 0.7); }
  }
  piano(t, f, dur, v, dest) {
    const g = this.env(t, 0.003, v, dur + 1.2, dest);
    const o1 = this.osc('triangle', f, t), o2 = this.osc('sine', f * 2, t), o3 = this.osc('sine', f * 3.01, t);
    const g2 = this.ctx.createGain(); g2.gain.value = 0.3; const g3 = this.ctx.createGain(); g3.gain.setValueAtTime(0.15, t); g3.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o1.connect(g); o2.connect(g2).connect(g); o3.connect(g3).connect(g);
    for (const o of [o1, o2, o3]) { o.start(t); o.stop(t + dur + 1.3); }
  }
  pad(t, f, dur, v, dest) {
    const ctx = this.ctx, lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + dur * 0.35); g.gain.linearRampToValueAtTime(0, t + dur);
    lp.connect(g).connect(dest);
    for (const det of [-7, 7]) { const o = this.osc('sawtooth', f, t); o.detune.value = det; o.connect(lp); o.start(t); o.stop(t + dur + 0.1); }
  }
  bass(t, f, dur, v, dest, slap) {
    const ctx = this.ctx, lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(slap ? 1800 : 700, t); lp.frequency.exponentialRampToValueAtTime(300, t + 0.2);
    const g = this.env(t, 0.006, v, dur + 0.15, dest);
    lp.connect(g);
    const o = this.osc('triangle', f, t), o2 = this.osc('sine', f, t); o.connect(lp); o2.connect(g);
    for (const x of [o, o2]) { x.start(t); x.stop(t + dur + 0.2); }
    if (slap) this.noiseHit(t, 1200, 4, 0.025, v * 0.2, dest);
  }
  lead(t, f, dur, v, dest) {
    const ctx = this.ctx, lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.02); g.gain.setValueAtTime(v, t + dur * 0.8); g.gain.linearRampToValueAtTime(0, t + dur + 0.05);
    lp.connect(g).connect(dest);
    const vib = ctx.createOscillator(); vib.frequency.value = 5.5; const vg = ctx.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(12, t + Math.min(0.3, dur));
    vib.connect(vg);
    for (const [type, k] of [['sawtooth', 0.5], ['square', 0.3]]) { const o = this.osc(type, f, t); vg.connect(o.detune); const og = ctx.createGain(); og.gain.value = k; o.connect(og).connect(lp); o.start(t); o.stop(t + dur + 0.1); }
    vib.start(t); vib.stop(t + dur + 0.1);
  }
  bell(t, f, v, dest) { const g = this.env(t, 0.002, v, 1.2, dest); for (const [k, a] of [[1, 1], [2.76, 0.3], [5.4, 0.12]]) { const o = this.osc('sine', f * k, t); const og = this.ctx.createGain(); og.gain.value = a; o.connect(og).connect(g); o.start(t); o.stop(t + 1.25); } }
  chip(t, f, dur, v, dest, type) { const g = this.env(t, 0.002, v, dur, dest); const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + dur + 0.02); }
  noiseHit(t, f, q, dur, v, dest, type = 'bandpass') {
    const ctx = this.ctx, s = ctx.createBufferSource(); s.buffer = this.noise;
    const bf = ctx.createBiquadFilter(); bf.type = type; bf.frequency.value = f; bf.Q.value = q;
    const g = this.env(t, 0.002, v, dur, dest);
    s.connect(bf).connect(g); s.start(t, Math.random() * 0.5, dur + 0.05);
  }
  kick(t, v, dest) {
    const o = this.ctx.createOscillator(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    const g = this.env(t, 0.003, v, 0.32, dest); o.connect(g); o.start(t); o.stop(t + 0.35);
  }
  snare(t, v, dest, soft) {
    this.noiseHit(t, soft ? 1500 : 2200, 0.8, soft ? 0.16 : 0.2, v, dest);
    const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    const g = this.env(t, 0.002, v * 0.5, 0.1, dest); o.connect(g); o.start(t); o.stop(t + 0.12);
  }
  hat(t, v, dest, open) { this.noiseHit(t, 8000, 1, open ? 0.25 : 0.04, v, dest, 'highpass'); }
  ride(t, v, dest) { this.noiseHit(t, 6500, 6, 0.5, v, dest); }
  brush(t, v, dur, dest) {
    const ctx = this.ctx, s = ctx.createBufferSource(); s.buffer = this.noise;
    const bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 3500; bf.Q.value = 0.6;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + dur * 0.3); g.gain.linearRampToValueAtTime(0, t + dur);
    s.connect(bf).connect(g).connect(dest); s.start(t, Math.random() * 0.5, dur + 0.05);
  }
}
