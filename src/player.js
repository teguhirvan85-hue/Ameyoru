// The hero. Uses a VRM avatar when one is loaded (procedural idle/walk/run on its humanoid bones);
// otherwise falls back to a placeholder built from primitives. Faces +Z.
import * as THREE from 'three';
import { blob } from './textures.js';

const WALK = 1.8, RUN = 5.0, RADIUS = 0.32;
// fallback ground speeds (m/s) if a clip's own speed can't be measured from its feet
const CLIP_WALK = 1.45, CLIP_RUN = 3.9;
// transition clips play faster than recorded so the controls stay snappy
const RATE = { start: 1.5, stop: 1, turn: 1.7 };
// extra forward lean on top of the clips (radians): Mixamo locomotion reads a bit upright on these avatars
const LEAN = { walk: 0.12, run: 0.2 };
// rooted clips that loop (sitting still, holding the wheel)
const LOOPED = ['sitIdle', 'drive'];
// one-off (or looping) clips played in place over standing still
const GESTURES = ['push', 'pick', 'talk', 'open', 'text', 'sing', 'drink'];
// walking pace on stairs (m/s, along the ground) and how fast the stairs clips climb (m/s, upwards)
const STAIRS = { up: 0.95, down: 1.15, run: 1.8, clipUp: 0.35, clipDown: 0.54 };
// the sitting clips' timing (s): where they start, and when they're done enough to move on
const SIT = { down0: 0.9, downEnd: 2.8, up0: 0.6, upEnd: 2.6 };
const smooth = (t) => t * t * (3 - 2 * t);
// small things held in the hands, placed in the raw hand bones' frames (fingers along ±x, palm towards −y)
function makeProps() {
  // phone: lies on the left palm (raw left hand: fingers along −x, palm facing −z), screen up
  const phone = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.072, 0.009), new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.35, metalness: 0.6 }));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.135, 0.062), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.75, 1.1) }));
  screen.rotation.y = Math.PI; screen.position.z = -0.0052;
  phone.add(body, screen); phone.position.set(-0.07, 0, -0.03); phone.visible = false;
  // mic: gripped in the right fist (fingers along +x), its head pointing back towards the mouth
  const mic = new THREE.Group();
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.012, 0.18, 12), new THREE.MeshStandardMaterial({ color: 0x202226, roughness: 0.4, metalness: 0.5 }));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.032, 14, 10), new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.6, metalness: 0.7 }));
  grip.position.y = 0.02; head.position.y = 0.12; mic.add(grip, head);
  mic.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0.64, 0.07, -0.76).normalize());
  mic.position.set(0.05, 0, 0); mic.visible = false;
  // can: in the left fist while drinking, top towards the mouth (raw left hand: up is about −z there)
  const can = new THREE.Group();
  const tin = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.122, 16), new THREE.MeshStandardMaterial({ color: 0x2f6fd0, roughness: 0.3, metalness: 0.7 }));
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.029, 0.033, 0.01, 16), new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.3, metalness: 0.9 }));
  lid.position.y = 0.066; can.add(tin, lid);
  can.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1));
  can.position.set(-0.05, -0.035, 0); can.visible = false;
  return { phone, mic, can };
}
const _lean = new THREE.Quaternion(), _axisX = new THREE.Vector3(1, 0, 0);

export class Player {
  constructor(scene) {
    const g = this.group = new THREE.Group(); g.userData.dynamic = true;
    scene.add(g);
    const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o });
    const hoodie = M(0x9a9da6), pants = M(0x22252c), skin = M(0xf0c6a4), hair = M(0x1c2440, { roughness: 0.5 }), shoe = M(0xe9e9ee);
    const mk = (geo, mat, x, y, z, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };

    // ---------- placeholder body ----------
    const body = this.body = new THREE.Group();
    g.add(body);
    this.legs = [-1, 1].map((s) => {
      const pivot = new THREE.Group(); pivot.position.set(s * 0.1, 0.9, 0); body.add(pivot);
      mk(new THREE.CapsuleGeometry(0.075, 0.62, 4, 8), pants, 0, -0.42, 0, pivot);
      mk(new THREE.BoxGeometry(0.12, 0.08, 0.25), shoe, 0, -0.85, 0.04, pivot);
      return pivot;
    });
    mk(new THREE.CapsuleGeometry(0.18, 0.3, 4, 10), hoodie, 0, 1.2, 0, body).scale.set(1.12, 1, 0.72);
    mk(new THREE.SphereGeometry(0.12, 10, 8), hoodie, 0, 1.42, -0.09, body).scale.set(1.25, 0.7, 0.8);
    const head = this.head = new THREE.Group(); head.position.set(0, 1.56, 0); body.add(head);
    mk(new THREE.SphereGeometry(0.125, 16, 12), skin, 0, 0, 0, head);
    const cap = mk(new THREE.SphereGeometry(0.138, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 0.012, -0.012, head);
    cap.rotation.x = -0.28;
    mk(new THREE.SphereGeometry(0.12, 12, 10), hair, 0, -0.02, -0.05, head);
    for (const s of [-1, 1]) mk(new THREE.SphereGeometry(0.014, 8, 6), M(0x111111), s * 0.042, 0, 0.118, head);
    this.arms = [-1, 1].map((s) => {
      const pivot = new THREE.Group(); pivot.position.set(s * 0.25, 1.4, 0); body.add(pivot);
      mk(new THREE.CapsuleGeometry(0.052, 0.46, 4, 8), hoodie, 0, -0.27, 0, pivot);
      pivot.userData.hand = mk(new THREE.SphereGeometry(0.05, 8, 6), skin, 0, -0.56, 0, pivot);
      return pivot;
    });

    const sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blob(), transparent: true, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.015; sh.renderOrder = 3;
    g.add(sh);

    g.traverse((o) => { if (o.isMesh && !o.material.transparent) o.castShadow = true; });
    g.position.set(0, 0, 27);
    this.heading = Math.PI;
    g.rotation.y = this.heading;
    this.dir = new THREE.Vector2(0, -1);
    this.speed = 0; this.phase = 0; this.t = 0; this.blinkT = 2;
  }

  // Swap the placeholder for a VRM avatar (three-vrm, already rotated to face +Z).
  useVRM(vrm) {
    if (this.vrm) { this.mixer?.stopAllAction(); this.group.remove(this.vrm.scene); }
    this.mixer = null; this.walkSpeed = this.runSpeed = undefined;
    this.vrm = vrm;
    this.body.visible = false;
    this.group.add(vrm.scene);
    vrm.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    const h = vrm.humanoid;
    const b = (n) => h.getNormalizedBoneNode(n);
    this.bones = {
      hips: b('hips'), spine: b('spine'), chest: b('chest'), neck: b('neck'), head: b('head'),
      lUA: b('leftUpperArm'), lLA: b('leftLowerArm'), rUA: b('rightUpperArm'), rLA: b('rightLowerArm'), lH: b('leftHand'), rH: b('rightHand'),
      lUL: b('leftUpperLeg'), lLL: b('leftLowerLeg'), lF: b('leftFoot'), rUL: b('rightUpperLeg'), rLL: b('rightLowerLeg'), rF: b('rightFoot'),
    };
    this.hipsY = this.bones.hips.position.y;
    vrm.scene.updateMatrixWorld(true);
    this.height = Math.max(1.2, vrm.humanoid.getNormalizedBoneNode('head').getWorldPosition(new THREE.Vector3()).y - this.group.position.y + 0.12);
    vrm.springBoneManager?.reset();
    this.pop = 0.4; this.cheer = 1.6;
    // hand props for the gestures: a phone in the left hand (texting), a mic in the right (karaoke)
    if (!this.props) this.props = makeProps();
    h.getRawBoneNode('leftHand')?.add(this.props.phone);
    h.getRawBoneNode('rightHand')?.add(this.props.mic);
    h.getRawBoneNode('leftHand')?.add(this.props.can);
  }

  // Mixamo clips retargeted onto the VRM: { idle, walk, run, look? }
  useAnimations(clips) {
    this.mixer = new THREE.AnimationMixer(this.vrm.scene);
    this.actions = {};
    for (const [k, clip] of Object.entries(clips)) {
      if (!clip) continue;
      const a = this.mixer.clipAction(clip);
      a.setEffectiveWeight(0); a.play();
      this.actions[k] = a;
    }
    if (this.actions.look) { this.actions.look.setLoop(THREE.LoopOnce, 1); this.actions.look.clampWhenFinished = false; this.actions.look.stop(); }
    // optional one-shot transitions: start walking from standing, stop walking to standing
    for (const k of ['start', 'stop', 'turn']) if (this.actions[k]) { this.actions[k].setLoop(THREE.LoopOnce, 1); this.actions[k].clampWhenFinished = true; this.actions[k].stop(); }
    // gestures (pressing a button, picking something up, talking, texting, singing) wait until asked for
    for (const k of GESTURES) this.actions[k]?.stop();
    this.gest = null;
    // one-off full-body clips with their own travel (getting into / out of a car): where the hips go, and the turn
    this.special = null; this.specialInfo = {};
    const hipsName = this.bones.hips.name;
    for (const k of ['carIn', 'carOut', 'sitDown', 'standUp', 'sitIdle', 'drive', 'lie']) {
      const a = this.actions[k]; if (!a) continue;
      if (LOOPED.includes(k)) a.stop(); else { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.stop(); }
      const clip = a.getClip(), p = clip.tracks.find((t) => t.name === `${hipsName}.position`), q = clip.tracks.find((t) => t.name === `${hipsName}.quaternion`);
      if (!p || !q) continue;
      // the clip is in the VRM's normalized space, which faces the other way: flip x and z into the character's frame
      const at = (i) => ({ x: -p.values[i * 3], y: p.values[i * 3 + 1], z: -p.values[i * 3 + 2] });
      const yaw = (i) => 2 * Math.atan2(q.values[i * 4 + 1], q.values[i * 4 + 3]);
      const n = p.values.length / 3, nq = q.values.length / 4;
      this.specialInfo[k] = { start: at(0), end: at(n - 1), yaw0: yaw(0), yaw1: yaw(nq - 1), duration: clip.duration, track: p, at, n };
    }
    this.loco = { state: 'idle', t: 0 }; this.transW = 0; this.transAction = null;
    // how fast each locomotion clip actually travels, so playback can match movement without foot sliding
    this.clipSpeed = { walk: this.measureSpeed(clips.walk) || CLIP_WALK, run: this.measureSpeed(clips.run) || CLIP_RUN };
    // each character moves at a pace that suits its own clips (slightly brisker than recorded, within sane limits)
    this.walkSpeed = THREE.MathUtils.clamp(this.clipSpeed.walk * 1.4, 1.35, 2.1);
    this.runSpeed = THREE.MathUtils.clamp(this.clipSpeed.run * 1.2, 3.4, 5.2);
    console.info('[ameyoru] clip speeds', this.clipSpeed.walk.toFixed(2), this.clipSpeed.run.toFixed(2), '→ move', this.walkSpeed.toFixed(2), this.runSpeed.toFixed(2));
    this.idleT = 0; this.lookW = 0; this.stepFrac = 0;
  }

  // Optional transition clips drive the speed (and, for the turn, the heading) instead of the usual easing.
  // Returns false (normal movement), true (speed driven by a clip) or 'turn' (heading driven by the turn clip).
  locomotion(dt, moving, run, dh) {
    const A = this.actions, st = this.loco;
    if (!A || !st || !(A.start || A.stop || A.turn)) return false;
    const W = this.walkSpeed;
    const begin = (k) => { st.state = k; st.t = 0; A[k].reset().play(); A[k].timeScale = RATE[k]; this.transAction = A[k]; };
    if (A.start && st.state === 'idle' && moving && !run && this.speed < 0.2) begin('start');
    else if (A.stop && st.state === 'walk' && !moving && this.speed > W * 0.6 && this.speed < W * 1.3) begin('stop');
    else if (A.turn && st.state === 'walk' && moving && !run && Math.abs(dh) > 2.3 && this.speed > W * 0.5) { begin('turn'); st.h0 = this.heading; }
    if (st.state === 'turn') {
      if (run) st.state = 'walk';
      else {
        st.t += dt * RATE.turn;
        const clip = A.turn.getClip(), p = Math.min(1, st.t / clip.duration), y = clip.userData.yaw;
        this.heading = st.h0 + (y ? sampleCurve(y, st.t) : Math.PI * p);
        this.speed = W * (1 - 0.7 * Math.sin(p * Math.PI)); // slow through the pivot
        if (p >= 1) { st.state = 'walk'; A.walk.time = 0; }
        return 'turn';
      }
    }
    if (st.state === 'start') {
      if (!moving || run) st.state = 'walk';
      else {
        st.t += dt * RATE.start;
        const p = Math.min(1, st.t / A.start.getClip().duration);
        this.speed = W * p * p * (3 - 2 * p);
        if (p >= 1) { st.state = 'walk'; A.walk.time = 0; }
        return true;
      }
    }
    if (st.state === 'stop') {
      if (moving) st.state = 'walk';
      else {
        st.t += dt * RATE.stop;
        const p = Math.min(1, st.t / A.stop.getClip().duration);
        this.speed = W * (1 - p) * (1 - p);
        if (p >= 1) { st.state = 'idle'; this.speed = 0; }
        return true;
      }
    }
    if (st.state === 'walk' && !moving && this.speed < 0.15) st.state = 'idle';
    if (st.state === 'idle' && moving) st.state = 'walk';
    return false;
  }

  // In-place clips: while a foot is planted it slides backwards at exactly the speed the body would move.
  measureSpeed(clip) {
    if (!clip) return 0;
    const mixer = new THREE.AnimationMixer(this.vrm.scene);
    mixer.clipAction(clip).play();
    const feet = [this.bones.lF, this.bones.rF], root = this.vrm.scene, N = 90, dt = clip.duration / N;
    const samples = feet.map(() => []), v = new THREE.Vector3();
    for (let i = 0; i <= N; i++) {
      mixer.setTime(i * dt);
      root.updateMatrixWorld(true);
      feet.forEach((f, k) => { root.worldToLocal(f.getWorldPosition(v)); samples[k].push(v.clone()); });
    }
    mixer.stopAllAction(); mixer.uncacheRoot(root);
    const speeds = [];
    for (const s of samples) {
      const minY = Math.min(...s.map((p) => p.y));
      for (let i = 1; i < s.length; i++) {
        if (s[i].y < minY + 0.03 && s[i - 1].y < minY + 0.03) speeds.push(Math.hypot(s[i].x - s[i - 1].x, s[i].z - s[i - 1].z) / dt);
      }
    }
    if (speeds.length < 4) return 0;
    speeds.sort((a, b) => a - b);
    const m = speeds[Math.floor(speeds.length / 2)];
    return m > 0.3 && m < 8 ? m : 0;
  }

  // sit on a seat: { x, z, y (seat top), yaw (facing), out: { x, z } where you stand back up }
  // With the Mixamo sitting clips: turn, back up and sit down, sit (looping), and stand up again; the root is
  // placed so the clips' hips land on the seat. Without them (or in a car) the legs fold procedurally.
  sit(seat) {
    const h0 = this.heading, p = this.group.position, I = this.specialInfo || {};
    this.seat = seat; this.speed = 0; this.heading = seat.yaw;
    if (!seat.snap && !seat.pose && I.sitDown && I.sitIdle && I.standUp) {
      this.playSpecial('sitDown', { keepSeat: true, at: SIT.down0 });
      this.chair = { phase: 'down', t: SIT.down0, x: p.x, y: p.y, z: p.z, h0 };
      this.heading = h0;
    }
  }
  stand() {
    const s = this.seat; if (!s) return;
    if (this.chair?.phase === 'lie') return this.wake();
    if (this.chair) {
      if (this.chair.phase === 'up') return;
      this.playSpecial('standUp', { keepSeat: true, fade: 0.3, at: SIT.up0 });
      this.chair.phase = 'up'; this.chair.t = SIT.up0;
      return;
    }
    this.seat = null; this.group.position.set(s.out.x, s.out.y ?? this.group.position.y, s.out.z);
  }
  // straight up and out of bed (behind a fade)
  wake() {
    const s = this.seat; if (!s) return;
    this.stopSpecial(); this.chair = null; this.seat = null; this.sitW = 0;
    this.group.position.set(s.out.x, s.out.y ?? this.group.position.y, s.out.z);
    this.heading = s.wakeYaw ?? s.yaw;
  }
  get seated() { return !!this.seat && this.chair?.phase !== 'up'; }
  // on the way down to, or up from, a chair
  get sitting() { return !!this.chair && this.chair.phase !== 'seated'; }

  // where the root goes so clip k's hips (H, character frame) sit at x, y, z with the body facing h
  rootFor(x, y, z, h, H, out = {}) {
    out.x = x - (H.x * Math.cos(h) + H.z * Math.sin(h)); out.z = z - (-H.x * Math.sin(h) + H.z * Math.cos(h)); out.y = y - H.y;
    return out;
  }

  updateChair(dt, groundY) {
    const c = this.chair, s = this.seat, I = this.specialInfo, p = this.group.position;
    if (!s) { this.chair = null; this.stopSpecial(); return; }   // the seat was taken away (teleport, car)
    const h = s.yaw;
    c.t += dt;
    const ay = s.y + 0.1, R = (k, H) => this.rootFor(s.x, ay, s.z, h, I[k][H], {});
    const lerp = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k });
    const span = (t, a, b) => smooth(Math.min(1, Math.max(0, (t - a) / (b - a))));
    if (c.phase === 'down') {
      // turn your back to the seat and step in front of it, then the clip backs you down onto it
      const end = R('sitDown', 'end'), k = span(c.t, SIT.down0, SIT.down0 + 0.7), ky = span(c.t, 1.6, 2.7);
      const dh = THREE.MathUtils.euclideanModulo(h - c.h0 + Math.PI, Math.PI * 2) - Math.PI;
      this.heading = c.h0 + dh * span(c.t, SIT.down0, SIT.down0 + 0.5);
      p.set(c.x + (end.x - c.x) * k, c.y + (end.y - c.y) * ky, c.z + (end.z - c.z) * k);
      if (c.t >= SIT.downEnd) {
        // a bed: lie back on it; anything else: sit there
        if (s.lie && I.lie) { this.playSpecial('lie', { keepSeat: true, fade: 0.4 }); c.phase = 'lie'; c.t = 0; }
        else { this.playSpecial('sitIdle', { keepSeat: true, fade: 0.4 }); c.phase = 'seated'; }
      }
    } else if (c.phase === 'lie') {
      // lie back and scoot up the bed towards the pillow (s.lie metres)
      this.heading = h;
      const k = span(c.t, 1.2, 4.5) * s.lie, base = lerp(R('sitDown', 'end'), R('lie', 'start'), this.prevSpecial ? this.fadeK : 1);
      p.set(base.x - Math.sin(h) * k, base.y, base.z - Math.cos(h) * k);
      if (c.t >= I.lie.duration - 0.3 && !c.slept) { c.slept = true; s.onLie?.(); }
    } else if (c.phase === 'seated') {
      this.heading = h;
      p.copy(this.prevSpecial ? lerp(R('sitDown', 'end'), R('sitIdle', 'start'), this.fadeK) : R('sitIdle', 'start'));
    } else {
      // stand up and step out to where the seat says you should end up
      this.heading = h;
      const seatR = lerp(R('sitIdle', 'start'), R('standUp', 'start'), this.prevSpecial ? this.fadeK : 1);
      const E = I.standUp.end, oy = s.out.y ?? groundY?.(s.out.x, s.out.z, s.y) ?? 0;
      const outR = this.rootFor(s.out.x, oy + E.y, s.out.z, h, E, {});
      const k = span(c.t, 1.0, SIT.upEnd), ky = span(c.t, 0.9, 2.4);
      p.set(seatR.x + (outR.x - seatR.x) * k, seatR.y + (outR.y - seatR.y) * ky, seatR.z + (outR.z - seatR.z) * k);
      if (c.t >= SIT.upEnd) {
        // hand back to walking where the clip left the hips
        p.set(s.out.x, oy, s.out.z);
        this.stopSpecial(); this.chair = null; this.seat = null; this.sitW = 0;
      }
    }
  }

  // play a one-off (or looping) clip that owns the whole body; the caller (or updateChair) places and turns the
  // character while it runs. fade: crossfade from the clip playing now; at: start part-way in
  playSpecial(k, { fade = 0, at = 0, keepSeat = false } = {}) {
    const a = this.actions?.[k]; if (!a) return 0;
    const prev = this.special && this.special !== k ? this.special : null;
    if (this.prevSpecial && this.prevSpecial !== prev) this.actions[this.prevSpecial]?.stop();
    if (prev && !fade) this.actions[prev].stop();
    this.prevSpecial = prev && fade ? prev : null; this.fadeT = 0; this.fadeDur = fade || 1; this.fadeK = this.prevSpecial ? 0 : 1;
    if (!keepSeat) { this.seat = null; this.chair = null; }
    this.sitW = 0; this.lastPose = null;
    this.special = k; a.reset(); a.time = at; a.setEffectiveWeight(this.prevSpecial ? 0 : 1); a.play();
    return a.getClip().duration;
  }
  stopSpecial() {
    for (const k of [this.special, this.prevSpecial]) if (k) this.actions[k]?.stop();
    this.special = null; this.prevSpecial = null; this.fadeK = 1;
  }

  // a gesture while standing: k = push | pick | talk | open | text | sing. face: turn towards this heading first.
  // loop: keep going until stopGesture(). Walking off cancels it. Returns how long it runs (s).
  gesture(k, { loop = false, face = null, rate = 1, at = 0, then = null } = {}) {
    const a = this.actions?.[k]; if (!a || this.special || this.seat) return 0;
    if (this.gest && this.gest.k !== k) this.actions[this.gest.k].stop();
    a.reset(); a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = true;
    a.timeScale = rate; a.time = at; a.setEffectiveWeight(0); a.play();
    this.gest = { k, w: this.gest?.k === k ? this.gest.w : 0, loop, end: false, face, then };
    return (a.getClip().duration - at) / rate;
  }
  // soft: let the current loop play out instead of fading now
  stopGesture(k, soft = false) {
    if (!this.gest || (k && this.gest.k !== k)) return;
    if (soft) { this.gest.loop = false; this.actions[this.gest.k].setLoop(THREE.LoopOnce, 1); } else this.gest.end = true;
  }
  get gesturing() { return this.gest && !this.gest.end ? this.gest.k : null; }

  update(dt, move, run, { colliders, groundY, bounds, onStep } = {}) {
    this.t += dt;
    if (this.special) {
      // a one-off clip owns the whole body (crossfading from the previous one); everything else waits
      const A = this.actions;
      if (this.prevSpecial) { this.fadeT += dt; this.fadeK = Math.min(1, this.fadeT / this.fadeDur); }
      if (this.chair) this.updateChair(dt, groundY);
      if (this.special) {
        for (const [k, a] of Object.entries(A)) if (k !== this.special && k !== this.prevSpecial) a.setEffectiveWeight(0);
        A[this.special].setEffectiveWeight(this.prevSpecial ? this.fadeK : 1);
        if (this.prevSpecial) { A[this.prevSpecial].setEffectiveWeight(1 - this.fadeK); if (this.fadeK >= 1) { A[this.prevSpecial].stop(); this.prevSpecial = null; } }
        this.group.rotation.y = this.heading; this.speed = 0;
        this.mixer.update(dt); this.blink(dt); this.vrm.update(dt);
        return;
      }
    }
    this.sitW = (this.sitW || 0) + ((this.seat ? 1 : 0) - (this.sitW || 0)) * Math.min(1, dt * 7);
    if (this.seat) {
      // glide onto the seat; the legs fold in animateClips
      const s = this.seat, q = this.group.position, rootY = s.y + 0.1 - (this.hipsY ?? 0.9);
      // a seat in a moving car is followed exactly; otherwise glide onto it
      const k = s.snap ? 1 : Math.min(1, dt * 8);
      q.x += (s.x - q.x) * k; q.z += (s.z - q.z) * k; q.y += (rootY - q.y) * k;
      if (s.snap) this.sitW = 1;
      this.heading = s.yaw; this.group.rotation.y = s.yaw; this.speed = 0;
      if (this.mixer) this.animateClips(dt, 0, null, false);
      return;
    }
    const moving = move.lengthSq() > 0.001;
    // on stairs you slow down to a climbing pace (a bit quicker going down, and when hurrying)
    const stK = this.stairsK || 0, stairPace = run ? STAIRS.run : this.climb > 0 ? STAIRS.up : STAIRS.down;
    let target = moving ? (run ? this.runSpeed ?? RUN : this.walkSpeed ?? WALK) : 0;
    if (moving && stK > 0) target += (Math.min(target, stairPace) - target) * stK;
    const dh = moving ? THREE.MathUtils.euclideanModulo(Math.atan2(move.x, move.y) - this.heading + Math.PI, Math.PI * 2) - Math.PI : 0;
    const drive = this.locomotion(dt, moving, run, dh);
    if (!drive) this.speed += (target - this.speed) * Math.min(1, dt * 8);
    if (drive === 'turn') this.dir.set(Math.sin(this.heading), Math.cos(this.heading));
    else if (moving) {
      this.dir.copy(move).normalize();
      this.heading += dh * Math.min(1, dt * 10);
    }
    if (!moving && this.gest?.face != null) {
      // turn to whatever you're using
      const d = THREE.MathUtils.euclideanModulo(this.gest.face - this.heading + Math.PI, Math.PI * 2) - Math.PI;
      this.heading += d * Math.min(1, dt * 9);
    }
    const p = this.group.position, ox = p.x, oz = p.z;
    p.x += this.dir.x * this.speed * dt;
    p.z += this.dir.y * this.speed * dt;

    for (const c of colliders) {
      if (c.active && !c.active()) continue;
      if ((c.minY !== undefined && p.y < c.minY) || (c.maxY !== undefined && p.y > c.maxY)) continue;
      const cx = Math.max(c.minX, Math.min(p.x, c.maxX)), cz = Math.max(c.minZ, Math.min(p.z, c.maxZ));
      const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= RADIUS * RADIUS) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        p.x += (dx / d) * (RADIUS - d); p.z += (dz / d) * (RADIUS - d);
      } else {
        const l = p.x - c.minX, r = c.maxX - p.x, b = p.z - c.minZ, f = c.maxZ - p.z, m = Math.min(l, r, b, f);
        if (m === l) p.x = c.minX - RADIUS; else if (m === r) p.x = c.maxX + RADIUS;
        else if (m === b) p.z = c.minZ - RADIUS; else p.z = c.maxZ + RADIUS;
      }
    }
    if (Array.isArray(bounds)) {
      // walkable areas are a union of rectangles: slide along whichever edge you hit
      const y = p.y, inside = (x, z) => bounds.some((b) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ && y >= (b.minY ?? -1e9) && y <= (b.maxY ?? 1e9));
      if (!inside(p.x, p.z)) { if (inside(ox, p.z)) p.x = ox; else if (inside(p.x, oz)) p.z = oz; else { p.x = ox; p.z = oz; } }
    } else {
      p.x = Math.max(bounds.minX, Math.min(bounds.maxX, p.x));
      p.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, p.z));
    }
    p.y += (groundY(p.x, p.z, p.y) - p.y) * Math.min(1, dt * 15);
    this.group.rotation.y = this.heading;
    // stairs: how steeply the ground rises along the way you're walking (a kerb is too short to count)
    if (this.actions?.stairsUp && this.actions?.stairsDown) {
      let climb = 0;
      if (this.speed > 0.2) {
        const a = groundY(p.x + this.dir.x * 0.6, p.z + this.dir.y * 0.6, p.y), b = groundY(p.x - this.dir.x * 0.6, p.z - this.dir.y * 0.6, p.y);
        climb = (a - b) / 1.2;
      }
      this.climb = (this.climb || 0) + (climb - (this.climb || 0)) * Math.min(1, dt * 8);
      const want = THREE.MathUtils.smoothstep(Math.abs(this.climb), 0.25, 0.4);
      this.stairsK = (this.stairsK || 0) + (want - (this.stairsK || 0)) * Math.min(1, dt * 6);
    }

    const k = Math.min(1, this.speed / 1.0), amp = Math.min(1, this.speed / RUN);
    const prev = Math.sin(this.phase);
    this.phase += dt * (0.55 + this.speed * 0.18) * Math.PI * 2;
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    if (this.mixer) this.animateClips(dt, k, onStep, run);
    else if (this.vrm) this.animateVRM(dt, s, c, k, amp);
    else {
      const swing = (0.3 + 0.55 * amp) * k;
      this.legs[0].rotation.x = s * swing;
      this.legs[1].rotation.x = -s * swing;
      this.arms[1].rotation.x = s * swing * 0.9;
      this.arms[0].rotation.x = -s * swing * 0.9;
      this.body.position.y = (1 - Math.abs(c)) * 0.05 * k;
      this.body.rotation.x = 0.14 * amp;
      this.head.rotation.x = Math.sin(this.t * 1.6) * 0.02 * (1 - k);
    }
    if (!this.mixer && k > 0.4 && Math.sign(prev) !== Math.sign(s)) onStep?.(run);

  }

  animateClips(dt, k, onStep, run) {
    const A = this.actions;
    const runT = THREE.MathUtils.smoothstep(this.speed, this.walkSpeed + 0.2, this.runSpeed - 0.4);
    const moveW = THREE.MathUtils.smoothstep(this.speed, 0.05, 0.9);
    // a "look around" now and then after standing still for a while
    this.idleT = moveW < 0.05 ? this.idleT + dt : 0;
    if (A.look && this.idleT > 7 && !A.look.isRunning() && !this.gest) {
      // standing around: look about, or now and then get the phone out
      if (A.text && Math.random() < 0.45) { this.gesture('text', { rate: 1 }); this.idleT = -24; }
      else { A.look.reset().play(); this.idleT = -6; }
    }
    const lookTarget = A.look?.isRunning() && moveW < 0.05 ? 1 : 0;
    this.lookW += (lookTarget - this.lookW) * Math.min(1, dt * 3);
    // a start/stop transition, when playing, takes over the whole body
    const inTrans = this.loco && ['start', 'stop', 'turn'].includes(this.loco.state);
    this.transW = (this.transW || 0) + ((inTrans ? 1 : 0) - (this.transW || 0)) * Math.min(1, dt * (inTrans ? 10 : 6));
    // a gesture fades in over whatever you're doing, and out when it ends or you walk off
    const G = this.gest;
    if (G) {
      const a = A[G.k], left = a.getClip().duration - a.time;
      const out = G.end || moveW > 0.35 || (!G.loop && left < 0.4 * a.timeScale);
      // one gesture can lead into the next (buy a drink → drink it) if you're still standing there
      if (out && G.then && !G.end && moveW <= 0.35) {
        // crossfade: the old clip fades out on its own while the new one fades in
        const nx = G.then, from = a, w0 = G.w; this.gest = null; this.gesture(nx, { face: G.face });
        this.gestOut = { a: from, w: w0 };
      } else {
        G.w += ((out ? 0 : 1) - G.w) * Math.min(1, dt * (out ? 5 : 7));
        if (out && G.w < 0.02) { a.stop(); this.gest = null; } else a.setEffectiveWeight(G.w);
      }
    }
    let gw = this.gest?.w || 0;
    if (this.gestOut) {
      const o = this.gestOut; o.w = Math.max(0, o.w - dt * 4); o.a.setEffectiveWeight(Math.min(o.w, 1 - gw));
      gw = Math.min(1, gw + o.a.getEffectiveWeight());
      if (o.w <= 0.01) { o.a.stop(); this.gestOut = null; }
    }
    const rest = (1 - this.transW) * (1 - gw);
    if (this.props) {
      const gk = this.gest && this.gest.w > 0.6 ? this.gest.k : null;
      this.props.phone.visible = gk === 'text'; this.props.mic.visible = gk === 'sing'; this.props.can.visible = gk === 'drink';
    }
    for (const k of ['start', 'stop', 'turn']) if (A[k]) A[k].setEffectiveWeight(A[k] === this.transAction ? this.transW : 0);
    A.idle.setEffectiveWeight((1 - moveW) * (1 - this.lookW) * rest);
    if (A.look) A.look.setEffectiveWeight((1 - moveW) * this.lookW * rest);
    // on stairs the climbing clips take over from the walk and run
    const stK = A.stairsUp ? this.stairsK || 0 : 0, up = (this.climb || 0) > 0, flat = 1 - stK;
    A.walk.setEffectiveWeight(moveW * (1 - runT) * rest * flat);
    A.run.setEffectiveWeight(moveW * runT * rest * flat);
    if (A.stairsUp) {
      A.stairsUp.setEffectiveWeight(moveW * rest * stK * (up ? 1 : 0));
      A.stairsDown.setEffectiveWeight(moveW * rest * stK * (up ? 0 : 1));
      // play them as fast as you're actually rising or dropping
      const vy = this.speed * Math.abs(this.climb || 0);
      A.stairsUp.timeScale = THREE.MathUtils.clamp(vy / STAIRS.clipUp, 0.7, 2.6);
      A.stairsDown.timeScale = THREE.MathUtils.clamp(vy / STAIRS.clipDown, 0.7, 2.4);
    }
    // cap the cadence so a brisk walk still looks like walking (a little foot slip beats a hurried shuffle)
    A.walk.timeScale = THREE.MathUtils.clamp(this.speed / this.clipSpeed.walk, 0.6, 1.3);
    A.run.timeScale = THREE.MathUtils.clamp(this.speed / this.clipSpeed.run, 0.7, 1.6);
    this.mixer.update(dt);
    // lean the torso forward while moving (VRM0 normalized bones face −Z, so forward is a negative X rotation)
    const lean = moveW * (LEAN.walk + (LEAN.run - LEAN.walk) * runT);
    if (lean > 0.001) {
      const B = this.bones;
      B.spine?.quaternion.multiply(_lean.setFromAxisAngle(_axisX, -lean * (B.chest ? 0.6 : 1)));
      B.chest?.quaternion.multiply(_lean.setFromAxisAngle(_axisX, -lean * 0.4));
      B.neck?.quaternion.multiply(_lean.setFromAxisAngle(_axisX, lean * 0.5));
    }
    // footsteps at the two contact points of whichever cycle dominates
    const lead = stK > 0.5 ? (up ? A.stairsUp : A.stairsDown) : runT > 0.5 ? A.run : A.walk;
    const f = (lead.time / lead.getClip().duration) % 1;
    if (moveW > 0.4 && Math.floor(f * 2) !== Math.floor(this.stepFrac * 2)) onStep?.(run);
    this.stepFrac = f;
    // seated: thighs forward, knees bent, a slight lean (VRM0 normalized: forward is negative X)
    if (this.sitW > 0.001) {
      // a chair: knees at a right angle; a car seat: legs stretched to the pedals, leaning back, hands on the wheel
      const B = this.bones, w = this.sitW, car = this.seat?.pose === 'car' || this.lastPose === 'car';
      if (this.seat) this.lastPose = this.seat.pose;
      const P = car ? { ul: -1.25, ll: 0.55, spine: 0.18, ua: -0.95, la: -0.55 } : { ul: -1.5, ll: 1.45, spine: -0.08, ua: -0.45, la: -0.5 };
      for (const ul of [B.lUL, B.rUL]) ul?.quaternion.multiply(_lean.setFromAxisAngle(_axisX, P.ul * w));
      for (const ll of [B.lLL, B.rLL]) ll?.quaternion.multiply(_lean.setFromAxisAngle(_axisX, P.ll * w));
      B.spine?.quaternion.multiply(_lean.setFromAxisAngle(_axisX, P.spine * w));
      for (const [ua, la] of [[B.lUA, B.lLA], [B.rUA, B.rLA]]) {
        ua?.quaternion.multiply(_lean.setFromAxisAngle(_axisX, P.ua * w));
        la?.quaternion.multiply(_lean.setFromAxisAngle(_axisX, P.la * w));
      }
    }
    this.blink(dt);
    this.vrm.update(dt);
  }

  blink(dt) {
    this.blinkT -= dt;
    // a quick "pop" and smile right after switching characters
    if (this.pop > 0) { this.pop = Math.max(0, this.pop - dt); const e = 1 - this.pop / 0.4; this.vrm.scene.scale.setScalar(0.82 + 0.18 * (1 - (1 - e) ** 3)); }
    const em = this.vrm.expressionManager;
    if (!em) return;
    if (this.cheer > 0) { this.cheer -= dt; em.setValue('happy', Math.min(1, Math.max(0, this.cheer))); }
    const bl = this.blinkT < 0 ? Math.max(0, 1 - Math.abs(this.blinkT + 0.08) / 0.08) : 0;
    em.setValue('blink', bl);
    if (this.blinkT < -0.16) this.blinkT = 2 + Math.random() * 3;
  }

  // Normalized VRM bones: T-pose rest, +Z forward. Negative X swings a limb forward.
  animateVRM(dt, s, c, k, amp) {
    const B = this.bones, t = this.t;
    // poses below are written for a +Z-forward rig (negative X swings a limb forward); VRM 0.x normalized
    // bones face −Z, which is the same pose turned 180° about Y: negate X and Z, keep Y
    const R = (bone, x, y, z) => bone.rotation.set(-x, y, -z);
    const stride = (0.35 + 0.45 * amp) * k;
    const knee = (0.25 + 0.9 * amp) * k;
    // legs: swing, bend the knee while the leg travels forward, keep the foot roughly flat
    R(B.lUL, -s * stride, 0, 0);
    R(B.rUL, s * stride, 0, 0);
    R(B.lLL, Math.max(0, c) * knee + 0.04, 0, 0);
    R(B.rLL, Math.max(0, -c) * knee + 0.04, 0, 0);
    R(B.lF, s * stride * 0.4 - Math.max(0, c) * knee * 0.3, 0, 0);
    R(B.rF, -s * stride * 0.4 - Math.max(0, -c) * knee * 0.3, 0, 0);
    // hips bob and sway, upper body counter-rotates
    B.hips.position.y = this.hipsY - 0.02 * k + (1 - Math.abs(c)) * (0.025 + 0.03 * amp) * k;
    R(B.hips, 0, s * 0.1 * k, c * 0.03 * k);
    R(B.spine, 0.05 + 0.18 * amp, -s * 0.08 * k, 0);
    const breathe = Math.sin(t * 1.7) * 0.025 * (1 - k);
    R(B.chest, breathe, -s * 0.05 * k, 0);
    R(B.neck, -0.06 * amp, 0, 0);
    R(B.head, -0.05 * amp + Math.sin(t * 0.5) * 0.03 * (1 - k), Math.sin(t * 0.37) * 0.2 * (1 - k), 0);
    // arms hang and swing opposite to the legs
    R(B.lUA, s * stride * 0.9, 0, -1.22 + 0.05 * amp);
    R(B.lLA, 0, -0.25 - 0.6 * amp * k, 0);
    R(B.rUA, -s * stride * 0.9, 0, 1.22 - 0.05 * amp);
    R(B.rLA, 0, 0.25 + 0.6 * amp * k, 0);
    // blink now and then
    this.blinkT -= dt;
    const em = this.vrm.expressionManager;
    if (em) {
      const bl = this.blinkT < 0 ? Math.max(0, 1 - Math.abs(this.blinkT + 0.08) / 0.08) : 0;
      em.setValue('blink', bl);
      if (this.blinkT < -0.16) this.blinkT = 2 + Math.random() * 3;
    }
    this.vrm.update(dt);
  }
}

// linear interpolation in a { times, values } curve
function sampleCurve({ times, values }, t) {
  if (t <= times[0]) return values[0];
  for (let i = 1; i < times.length; i++) {
    if (t <= times[i]) { const k = (t - times[i - 1]) / (times[i] - times[i - 1]); return values[i - 1] + (values[i] - values[i - 1]) * k; }
  }
  return values[values.length - 1];
}
