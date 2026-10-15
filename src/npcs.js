// People: VRM characters (VRoid CC0 samples in assets/npc) who take the places marked by "slots" — wherever the
// world used to put a simple figure (standing staff, a customer on a stool, someone waiting on the platform).
// A small pool of characters moves to the slots nearest you (your own room first); slots further off keep their
// simple stand-in figure. Each character plays a Mixamo clip that suits its slot: idle, talking, sitting,
// texting, pressing buttons.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { withKTX2 } from './ktx2.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { loadMixamoClip } from './mixamo.js';
import { roomAt } from './rooms.js';
import { mergeVRM } from './vrmmerge.js';
import { tameHighlights } from './vrmtone.js';
import { shareModelTextures } from './vrmshare.js';
import { MOBILE } from './device.js';

export const NPC_MODELS = ['npc_d', 'npc_e', 'npc_f', 'npc_g', 'npc_fumiriya', 'npc_shino'];
const PER_MODEL = MOBILE ? 1 : 2;   // instances of each model (12 in all; 6 on a phone)
const RANGE = 22;             // slots further than this keep their stand-in
const ACTIVE = MOBILE ? 5 : 8;   // at most this many characters at once (each VRoid model is ~80 meshes)
const NEAR = 10;              // hair and skirts only swing (spring bones) on characters this close
// the clips a character may need, by what the slot is for
const CLIPS = { idle: 'idle', look: 'idle_look', talk: 'talking', sit: 'sit_idle', text: 'texting', push: 'button_push', drink: 'drinking' };

const loader = withKTX2(new GLTFLoader());
loader.register((parser) => new VRMLoaderPlugin(parser));

// slots: { x, y, z, yaw (facing, 0 = +z), act ('idle' | 'talk' | 'sit' | 'text' | 'push'), seat (sitting: seat-top height),
//          h (height in metres), pins (stand-in meshes to hide), room (optional, for priority), pick (preferred model) }
export function makeNPCs(scene, slots) {
  const pool = [];
  let ready = false, assignT = 0;
  const buffers = {};

  async function load() {
    for (const name of NPC_MODELS) {
      try { buffers[name] = await (await fetch(`assets/npc/${name}.vrm`)).arrayBuffer(); } catch (e) { console.warn('[ameyoru] npc missing', name, e); }
    }
    for (const name of NPC_MODELS) {
      if (!buffers[name]) continue;
      const copies = [];
      for (let i = 0; i < PER_MODEL; i++) {
        try {
          const gltf = await loader.parseAsync(buffers[name].slice(0), '');
          const vrm = gltf.userData.vrm;
          VRMUtils.removeUnnecessaryVertices(gltf.scene);
          VRMUtils.combineSkeletons(gltf.scene);
          VRMUtils.rotateVRM0(vrm);
          // every copy of a model (here and among the walkers) uses the first one's textures: the GPU holds them once
          shareModelTextures(name, vrm.scene);
          vrm.scene.traverse((o) => {
            if (!o.isMesh) return;
            o.frustumCulled = false; o.castShadow = false; o.receiveShadow = true;
            // no anime outline pass: it draws every part a second time
            for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m.isOutline) m.visible = false;
          });
          const root = new THREE.Group(); root.add(vrm.scene); root.visible = false; root.matrixWorldAutoUpdate = false; root.userData.dynamic = true; scene.add(root);
          const npc = { name, vrm, root, mixer: new THREE.AnimationMixer(vrm.scene), actions: {}, slot: null, cur: null, t: Math.random() * 10 };
          await clipsFor(npc);
          pool.push(npc); copies.push(npc);
        } catch (e) { console.warn('[ameyoru] npc failed', name, e); }
      }
      // now that the copies share their textures, merge each one's meshes (~80 → ~30 draw calls)
      for (const c of copies) { mergeVRM(c.vrm.scene); tameHighlights(c.vrm.scene); }
    }
    ready = true;
    console.info('[ameyoru] npcs ready', pool.length);
  }

  async function clipsFor(npc) {
    for (const [k, file] of Object.entries(CLIPS)) {
      try {
        const clip = await loadMixamoClip(`assets/anims/${file}.json`, npc.vrm, k, { inPlace: k !== 'sit' });
        const a = npc.mixer.clipAction(clip); a.setEffectiveWeight(1);
        npc.actions[k] = a;
      } catch (e) { /* a missing clip just isn't used */ }
    }
    // where the seated clip puts the hips (character frame), to line them up with a seat
    const sit = npc.actions.sit?.getClip(), hips = npc.vrm.humanoid.getNormalizedBoneNode('hips').name;
    const tr = sit?.tracks.find((t) => t.name === `${hips}.position`);
    npc.sitHip = tr ? { x: -tr.values[0], y: tr.values[1], z: -tr.values[2] } : { x: 0, y: 0.55, z: 0 };
  }

  // put a character into a slot: place it, turn it, start the slot's clip at a random point
  function seat(npc, s) {
    npc.slot = s; s.npc = npc;
    const k = (s.h ?? 1.62) / 1.62;
    npc.root.scale.setScalar(k);
    npc.root.rotation.y = s.yaw;
    if (s.act === 'sit') {
      const H = npc.sitHip, c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
      npc.root.position.set(s.x - (H.x * c + H.z * sn) * k, s.seat + 0.1 - H.y * k, s.z - (-H.x * sn + H.z * c) * k);
    } else npc.root.position.set(s.x, s.y, s.z);
    play(npc, s.act === 'sit' ? 'sit' : s.act);
    npc.root.visible = true; npc.root.matrixWorldAutoUpdate = true;
    for (const m of s.pins || []) m.visible = false;
  }
  function free(npc) {
    const s = npc.slot; if (!s) return;
    s.npc = null; npc.slot = null; npc.root.visible = false; npc.root.matrixWorldAutoUpdate = false; // hidden: skip its bones
    for (const m of s.pins || []) m.visible = true;
  }
  function play(npc, k) {
    const a = npc.actions[k] || npc.actions.idle; if (!a || npc.cur === a) return;
    npc.cur?.stop();
    a.reset(); a.time = Math.random() * a.getClip().duration; a.play();
    npc.cur = a;
  }

  // which slots get a character: the room you're in first, then the nearest
  function assign(p, room) {
    const near = [];
    for (const s of slots) {
      // a slot switched off (someone who's left — the taxi fare got in your car): nobody there
      if (s.off) { if (s.npc) free(s.npc); for (const m of s.pins || []) if (m.visible) m.visible = false; continue; }
      if (s.room === undefined) s.room = roomAt({ x: s.x, y: s.y + 0.3, z: s.z });
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      // stand-ins far off aren't worth drawing
      const show = !s.npc && d < 45;
      for (const m of s.pins || []) if (m.visible !== show) m.visible = show;
      if (d > RANGE + (s.npc ? 6 : 0) || Math.abs(s.y - p.y) > 6) continue;
      // your room first; a slot that already has someone keeps them a little longer (no popping back and forth)
      near.push([s, d - (room && s.room === room ? 100 : 0) - (s.npc ? 6 : 0)]);
    }
    near.sort((a, b) => a[1] - b[1]);
    // fewer out on the street (they're further off and the street is the heaviest view), more inside a room
    const want = new Set(near.slice(0, Math.min(room ? ACTIVE : 5, pool.length)).map((n) => n[0]));
    for (const npc of pool) if (npc.slot && !want.has(npc.slot)) free(npc);
    for (const s of want) {
      if (s.npc) continue;
      // prefer the slot's own model (so a place keeps the same face), else any free one
      const freeOnes = pool.filter((n) => !n.slot);
      const npc = freeOnes.find((n) => n.name === NPC_MODELS[s.pick % NPC_MODELS.length]) || freeOnes[0];
      if (npc) seat(npc, s);
    }
  }

  load();
  return {
    get ready() { return ready; },
    // how far loading has got (0..1), for the loading screen
    get progress() { return ready ? 1 : pool.length / (NPC_MODELS.length * PER_MODEL); },
    pool,
    roots: () => pool.map((n) => n.root),
    update(dt, p, room) {
      if (!ready) return;
      if ((assignT -= dt) <= 0) { assignT = 0.5; assign(p, room); }
      for (const npc of pool) {
        if (!npc.slot) continue;
        // standing staff now and then look about or say something
        npc.t += dt;
        if (npc.slot.act === 'idle' && npc.t > 9) { npc.t = Math.random() * 3; play(npc, Math.random() < 0.5 ? 'look' : 'idle'); }
        npc.mixer.update(dt);
        // close by: everything (spring bones too); further: just pose the body
        if (Math.hypot(npc.root.position.x - p.x, npc.root.position.z - p.z) < NEAR) npc.vrm.update(dt);
        else npc.vrm.humanoid.update();
      }
    },
  };
}

