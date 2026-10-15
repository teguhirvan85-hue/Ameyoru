// Bakes Mixamo FBX clips (kept locally, not in the repo) into Ameyoru's own clip format, assets/anims/*.json:
// the rest-pose correction is applied here, so the game never loads the FBX files.
// Usage: npm i three@0.170.0 somewhere, then node tools/bake-anims.mjs <that>/node_modules/three assets/anims
import fs from 'node:fs';
import path from 'node:path';
const [threeDir, animDir] = process.argv.slice(2);
const THREE = await import(path.join(threeDir, 'build/three.module.js'));
const { FBXLoader } = await import(path.join(threeDir, 'examples/jsm/loaders/FBXLoader.js'));
// Mixamo bone → VRM humanoid bone
const RIG = {
  mixamorigHips: 'hips', mixamorigSpine: 'spine', mixamorigSpine1: 'chest', mixamorigSpine2: 'upperChest',
  mixamorigNeck: 'neck', mixamorigHead: 'head',
  mixamorigLeftShoulder: 'leftShoulder', mixamorigLeftArm: 'leftUpperArm', mixamorigLeftForeArm: 'leftLowerArm', mixamorigLeftHand: 'leftHand',
  mixamorigLeftHandThumb1: 'leftThumbMetacarpal', mixamorigLeftHandThumb2: 'leftThumbProximal', mixamorigLeftHandThumb3: 'leftThumbDistal',
  mixamorigLeftHandIndex1: 'leftIndexProximal', mixamorigLeftHandIndex2: 'leftIndexIntermediate', mixamorigLeftHandIndex3: 'leftIndexDistal',
  mixamorigLeftHandMiddle1: 'leftMiddleProximal', mixamorigLeftHandMiddle2: 'leftMiddleIntermediate', mixamorigLeftHandMiddle3: 'leftMiddleDistal',
  mixamorigLeftHandRing1: 'leftRingProximal', mixamorigLeftHandRing2: 'leftRingIntermediate', mixamorigLeftHandRing3: 'leftRingDistal',
  mixamorigLeftHandPinky1: 'leftLittleProximal', mixamorigLeftHandPinky2: 'leftLittleIntermediate', mixamorigLeftHandPinky3: 'leftLittleDistal',
  mixamorigRightShoulder: 'rightShoulder', mixamorigRightArm: 'rightUpperArm', mixamorigRightForeArm: 'rightLowerArm', mixamorigRightHand: 'rightHand',
  mixamorigRightHandPinky1: 'rightLittleProximal', mixamorigRightHandPinky2: 'rightLittleIntermediate', mixamorigRightHandPinky3: 'rightLittleDistal',
  mixamorigRightHandRing1: 'rightRingProximal', mixamorigRightHandRing2: 'rightRingIntermediate', mixamorigRightHandRing3: 'rightRingDistal',
  mixamorigRightHandMiddle1: 'rightMiddleProximal', mixamorigRightHandMiddle2: 'rightMiddleIntermediate', mixamorigRightHandMiddle3: 'rightMiddleDistal',
  mixamorigRightHandIndex1: 'rightIndexProximal', mixamorigRightHandIndex2: 'rightIndexIntermediate', mixamorigRightHandIndex3: 'rightIndexDistal',
  mixamorigRightHandThumb1: 'rightThumbMetacarpal', mixamorigRightHandThumb2: 'rightThumbProximal', mixamorigRightHandThumb3: 'rightThumbDistal',
  mixamorigLeftUpLeg: 'leftUpperLeg', mixamorigLeftLeg: 'leftLowerLeg', mixamorigLeftFoot: 'leftFoot', mixamorigLeftToeBase: 'leftToes',
  mixamorigRightUpLeg: 'rightUpperLeg', mixamorigRightLeg: 'rightLowerLeg', mixamorigRightFoot: 'rightFoot', mixamorigRightToeBase: 'rightToes',
};

const loader = new FBXLoader();
const b64 = (arr) => Buffer.from(new Float32Array(arr).buffer).toString('base64');
for (const f of fs.readdirSync(animDir).filter((x) => x.endsWith('.fbx'))) {
  const buf = fs.readFileSync(path.join(animDir, f));
  const asset = loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  asset.updateMatrixWorld(true);
  const clip = THREE.AnimationClip.findByName(asset.animations, 'mixamo.com') || asset.animations[0];
  const restInv = new THREE.Quaternion(), parentRest = new THREE.Quaternion(), q = new THREE.Quaternion();
  const out = { v: 1, duration: clip.duration, hipsY: asset.getObjectByName('mixamorigHips').position.y, tracks: [] };
  for (const track of clip.tracks) {
    const [rigName, prop] = track.name.split('.');
    const bone = RIG[rigName], src = asset.getObjectByName(rigName);
    if (!bone || !src) continue;
    if (track instanceof THREE.QuaternionKeyframeTrack) {
      src.getWorldQuaternion(restInv).invert(); src.parent.getWorldQuaternion(parentRest);
      const values = Array.from(track.values);
      for (let i = 0; i < values.length; i += 4) { q.fromArray(values, i).premultiply(parentRest).multiply(restInv); q.toArray(values, i); }
      out.tracks.push({ bone, prop: 'quaternion', times: b64(track.times), values: b64(values) });
    } else if (track instanceof THREE.VectorKeyframeTrack && prop === 'position') {
      out.tracks.push({ bone, prop: 'position', times: b64(track.times), values: b64(track.values) });
    }
  }
  const name = f.replace(/\.fbx$/, '.json');
  fs.writeFileSync(path.join(animDir, name), JSON.stringify(out));
  console.log(name, out.tracks.length, 'tracks', (fs.statSync(path.join(animDir, name)).size / 1024).toFixed(0), 'KB');
}
