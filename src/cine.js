// The camera when you're not holding it: the title screen's drone, drifting through a few slow shots of the
// town and cutting between them through black, and the opening shot after Start, which comes down out of the
// sky, runs up the street and lands exactly where the play camera is (it blends into it, so there's no jump).
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);      // in-out cubic
const smooth = (a, b, t) => { const k = Math.min(1, Math.max(0, (t - a) / (b - a))); return k * k * (3 - 2 * k); };

// each shot: the camera from → to and what it looks at from → to, over dur seconds; name for the corner caption
const SHOTS = [
  { name: '星見通り · Hoshimi Street', from: V(-2.5, 9.5, 36), to: V(-1.2, 6.5, 18), lookFrom: V(1, 3, -30), lookTo: V(0, 2.4, -40), dur: 11 },
  { name: 'ほしマート · outside the konbini', from: V(4.3, 1.25, 14), to: V(4.1, 1.15, -4), lookFrom: V(1.5, 1.4, -30), lookTo: V(0.5, 1.6, -34), dur: 10 },
  { name: '踏切 · railway crossing', from: V(-5.2, 3.4, -57.4), to: V(-2.2, 3.0, -58.6), lookFrom: V(30, 2.2, -66), lookTo: V(30, 2.0, -69), dur: 10 },
  { name: '星見の空 · Hoshimi sky', from: V(-3.4, 19, -94), to: V(-2.2, 16.5, -80), lookFrom: V(0, 2, 0), lookTo: V(0, 2.5, 10), dur: 12 },
  { name: '裏通り · back street', from: V(49.4, 3.1, -26), to: V(49.2, 2.7, -44), lookFrom: V(51, 2, -120), lookTo: V(51.2, 2, -128), dur: 10 },
  { name: '星見銀座 · Hoshimi Ginza', from: V(2.2, 2.9, 47), to: V(1.2, 2.5, 66), lookFrom: V(-0.5, 4.2, 96), lookTo: V(0, 4, 104), dur: 10 },
  { name: '新星見 · Shin-Hoshimi', from: V(-26, 2.2, 105), to: V(-10, 3.2, 109), lookFrom: V(14, 26, 160), lookTo: V(4, 30, 168), dur: 11 },
  { name: '星見運河 · the canal', from: V(92.5, 2.3, 50), to: V(93.4, 2.8, 66), lookFrom: V(104, 3, 118), lookTo: V(106, 6, 126), dur: 10 },
];
const CUT = 0.9; // seconds of fade at each end of a shot

export function makeCine(camera) {
  const look = new THREE.Vector3(), tmp = new THREE.Vector3();
  let si = 0, st = 0;

  // ---- title: shot after shot; returns how dark the veil should be and the shot's caption ----
  function title(dt) {
    st += dt;
    let s = SHOTS[si];
    if (st > s.dur) { st -= s.dur; si = (si + 1) % SHOTS.length; s = SHOTS[si]; }
    const k = ease(st / s.dur) * 0.85 + (st / s.dur) * 0.15;   // mostly eased, never quite still
    camera.position.lerpVectors(s.from, s.to, k);
    look.lerpVectors(s.lookFrom, s.lookTo, k);
    camera.lookAt(look);
    if (camera.fov !== 50) { camera.fov = 50; camera.updateProjectionMatrix(); }
    return { dim: Math.max(1 - smooth(0, CUT, st), smooth(s.dur - CUT, s.dur, st)), name: s.name };
  }

  // ---- the opening shot ----
  // out of black, high over the street to the south, looking up it at you; down along the street, past your
  // side, round to your shoulder
  let path = null, lookPath = null, it = 0;
  const DUR = 8.5;
  function beginIntro(target) {
    const t = target;   // where you stand (you face south, down the street)
    path = new THREE.CatmullRomCurve3([
      V(t.x + 0.8, 30, t.z - 72),      // over the middle of the street: the buildings frame it on both sides
      V(t.x + 0.6, 17, t.z - 44),
      V(t.x + 0.2, 7.5, t.z - 20),
      V(t.x - 1.4, 3.3, t.z - 7.5),    // ahead of you, a little to the side
      V(t.x - 3.3, 2.4, t.z - 1.2),    // past your side
      V(t.x - 1.7, 2.3, t.z + 3.2),    // behind your shoulder
    ], false, 'catmullrom', 0.4);
    lookPath = new THREE.CatmullRomCurve3([V(t.x, 6, t.z + 20), V(t.x, 3, t.z + 8), V(t.x, 1.7, t.z), V(t.x, 1.5, t.z)], false, 'catmullrom', 0.5);
    it = 0;
  }
  // gamePos / gameLook: where the play camera wants to be right now; the last stretch blends into it
  const pq = new THREE.Quaternion(), gq = new THREE.Quaternion(), m = new THREE.Matrix4(), up = V(0, 1, 0);
  function intro(dt, gamePos, gameQuat) {
    it = Math.min(DUR, it + dt);
    const k = ease(it / DUR);
    path.getPointAt(k, camera.position);
    lookPath.getPointAt(Math.min(1, k * 1.05), look);
    m.lookAt(camera.position, look, up); pq.setFromRotationMatrix(m);
    // hand over to the play camera over the last ~1.6 s
    const b = smooth(DUR - 1.6, DUR, it);
    camera.position.lerp(gamePos, b);
    gq.copy(gameQuat);
    camera.quaternion.slerpQuaternions(pq, gq, b);
    return { done: it >= DUR, k: it / DUR };
  }
  return { title, beginIntro, intro, get shot() { return SHOTS[si]; } };
}
