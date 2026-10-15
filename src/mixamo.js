// Retargets Mixamo animations (downloaded "without skin", baked to assets/anims/*.json) onto a VRM's normalized humanoid bones.
// Adapted from the three-vrm humanoidAnimation example (MIT, pixiv).
import * as THREE from 'three';

const assets = new Map(); // clip files are shared by every character, so load each only once
const f32 = (b64) => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return new Float32Array(u.buffer); };

// The clips are Mixamo animations baked into the game's own format (assets/anims/*.json, made from the FBX
// downloads): per humanoid bone, rotations already corrected for the Mixamo rest pose, plus the hips' travel
// and the hips' rest height. What's left here depends on the character: its size, and VRM 0.x's mirrored axes.
// inPlace: keep the hips' vertical bob but drop any forward/sideways travel baked into the clip.
// detrend: remove a steady climb/descent of the hips (stairs clips), keeping the step-by-step bob.
// extractYaw: pull the hips' turn (rotation about Y) out of the clip and return it as a curve in
// clip.userData.yaw, so the game can rotate the character itself (used for turn-around clips).
export async function loadMixamoClip(url, vrm, name, { inPlace = true, extractYaw = false, detrend = false } = {}) {
  if (!assets.has(url)) assets.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); }));
  const clip = await assets.get(url);
  vrm.scene.updateMatrixWorld(true);
  const tracks = [];
  const q = new THREE.Quaternion(), v = new THREE.Vector3();
  const vrmHips = vrm.humanoid.getNormalizedBoneNode('hips').getWorldPosition(v).y - vrm.scene.getWorldPosition(new THREE.Vector3()).y;
  const scale = Math.abs(vrmHips) / clip.hipsY;
  const vrm0 = vrm.meta?.metaVersion === '0';

  for (const t of clip.tracks) {
    const node = vrm.humanoid.getNormalizedBoneNode(t.bone);
    if (!node) continue;
    const times = f32(t.times), src = f32(t.values);
    if (t.prop === 'quaternion') {
      tracks.push(new THREE.QuaternionKeyframeTrack(`${node.name}.quaternion`, times, Array.from(src, (x, i) => (vrm0 && i % 2 === 0 ? -x : x))));
    } else if (t.prop === 'position') {
      const values = Array.from(src, (x, i) => (vrm0 && i % 3 !== 1 ? -x : x) * scale);
      if (inPlace) for (let i = 0; i < values.length; i += 3) { values[i] = values[0]; values[i + 2] = values[2]; }
      // stairs clips climb as they play; take the climb out (the game raises the character) and keep the bob
      if (detrend) { const n = values.length / 3, rise = values[(n - 1) * 3 + 1] - values[1]; for (let i = 0; i < n; i++) values[i * 3 + 1] -= rise * (times[i] / clip.duration); }
      tracks.push(new THREE.VectorKeyframeTrack(`${node.name}.position`, times, values));
    }
  }
  const out = new THREE.AnimationClip(name, clip.duration, tracks);
  if (extractYaw) {
    const hipsName = vrm.humanoid.getNormalizedBoneNode('hips').name;
    const tr = out.tracks.find((t) => t.name === `${hipsName}.quaternion`);
    if (tr) {
      const yaw = [], twistInv = new THREE.Quaternion(), base = new THREE.Quaternion();
      let prev = null, unwrap = 0;
      for (let i = 0; i < tr.values.length; i += 4) {
        q.fromArray(tr.values, i);
        let a = 2 * Math.atan2(q.y, q.w);
        if (prev !== null) { while (a + unwrap - prev > Math.PI) unwrap -= Math.PI * 2; while (a + unwrap - prev < -Math.PI) unwrap += Math.PI * 2; }
        a += unwrap; prev = a; yaw.push(a);
        // keep only the swing: remove the twist about Y, then restore the first frame's facing
        twistInv.set(0, Math.sin(-a / 2), 0, Math.cos(-a / 2));
        if (i === 0) base.set(0, Math.sin(a / 2), 0, Math.cos(a / 2));
        q.premultiply(twistInv).premultiply(base).toArray(tr.values, i);
      }
      out.userData = { yaw: { times: Array.from(tr.times), values: yaw.map((a) => a - yaw[0]) } };
    }
  }
  return out;
}
