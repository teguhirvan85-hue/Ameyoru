// People walking the pavements. A network of pavement lanes (main street, back streets, the cross streets, the
// zebras) carries a crowd of "walkers": each one picks a way at every corner, keeps to the left, waits for the green
// man and for trains, steps round lamp posts and bins, and makes way for you. Only the walkers near you have a body
// (a pool of VRoid characters); the others are just points moving about town, so the crowd costs almost nothing.
// When it rains most of them carry an umbrella.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { withKTX2 } from './ktx2.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { loadMixamoClip } from './mixamo.js';
import { NPC_MODELS } from './npcs.js';
import { groundY, RING } from './world.js';
import { JUNCTIONS } from './details.js';
import { mergeVRM } from './vrmmerge.js';
import { NORTH } from './north.js';
import { tameHighlights } from './vrmtone.js';
import { shareModelTextures } from './vrmshare.js';
import { MOBILE } from './device.js';

const BODIES = MOBILE ? 8 : 18;   // characters that can be on screen at once (fewer on a phone)
const SEE = 45;             // walkers closer than this get a body (+6 m to keep one)
const R = 0.3;              // how much room a walker takes
const FEMALE = new Set(['npc_fumiriya', 'npc_shino']);
const CLIP_SPEED = { walk: 1.45, walk_female: 1.35 };

const loader = withKTX2(new GLTFLoader());
loader.register((parser) => new VRMLoaderPlugin(parser));

// ---------- the pavement network ----------
function buildNet(peds) {
  const nodes = [];
  const key = (x, z) => `${x.toFixed(1)},${z.toFixed(1)}`;
  const byKey = new Map();
  const node = (x, z) => {
    const k = key(x, z);
    if (!byKey.has(k)) { const n = { x, z, edges: [] }; byKey.set(k, n); nodes.push(n); }
    return byKey.get(k);
  };
  // gate: may you start along this edge now?  road: you're out on the road while on it (cars wait for you)
  const link = (a, b, { gate = null, road = false } = {}) => {
    const A = node(...a), B = node(...b);
    A.edges.push({ to: B, gate, road }); B.edges.push({ to: A, gate, road });
  };
  // a lane through several points
  const lane = (pts, o) => { for (let i = 0; i < pts.length - 1; i++) link(pts[i], pts[i + 1], o); };

  const S = JUNCTIONS.S, N = JUNCTIONS.N, z = (id) => peds.junctions.zebras.find((q) => q.id === id);
  const zebra = (id) => ({ gate: () => z(id).walk(), road: true });
  const trainClear = () => !peds.crossing.warn;
  const RZ = -66, RA = RZ + 3.4, RB = RZ - 3.4;     // either side of the tracks
  const BX = RING.bx, XI = BX - RING.half - 1.25, XO = BX + RING.half + 1.25;   // back streets' pavement lanes (46.25, 55.75)
  const SN = S.near + 1.2, SS = S.far - 1.2;        // south cross street's pavements (−194.8, −205.2)

  for (const s of [-1, 1]) {
    const mx = s * 5.6;
    // main street pavement, top to bottom: the north junction's zebra, the crosswalk, the tracks, the south junction
    lane([[mx, 35], [mx, N.mouth], [mx, 10], [mx, RA]]);
    link([mx, RA], [mx, RB], { gate: trainClear });
    lane([[mx, RB], [mx, -150], [mx, S.mouth]]);
    // round the corner onto the south cross street's north pavement, past its zebra to the back street
    lane([[mx, S.mouth], [s * S.zx, SN], [s * 26, SN], [s * XI, SN]]);
    link([s * S.zx, SN], [s * S.zx, SS], zebra(s < 0 ? 'SW' : 'SE'));
    // the south pavement runs the whole width
    lane([[s * S.zx, SS], [s * 30, SS], [s * XO, SS]]);
    // back street, town side: up to the north cross street
    lane([[s * XI, SN], [s * XI, -100], [s * XI, RB]]);
    link([s * XI, RB], [s * XI, RA], { gate: trainClear });
    lane([[s * XI, RA], [s * XI, 0], [s * XI, 35.4]]);
    // back street, outer side
    lane([[s * XO, SS], [s * XO, -100], [s * XO, RB]]);
    link([s * XO, RB], [s * XO, RA], { gate: trainClear });
    lane([[s * XO, RA], [s * XO, 0], [s * XO, 35.4]]);
    // across the back street's mouth at the north end (no zebra: people just cross, cars wait)
    link([s * XI, 35.4], [s * XO, 35.4], { road: true });
    // the north cross street: its south pavement from the main street to the back street, and on past it
    lane([[mx, 35], [s * N.zx, N.near - 1], [s * 26, N.near - 1], [s * (XI - 1.8), N.near - 1], [s * XI, 35.4]]);
    lane([[s * XO, 35.4], [s * (XO + 2.2), N.near - 1], [s * 68, N.near - 1]]);
    // its zebra to the north pavement, which runs from end to end
    link([s * N.zx, N.near - 1], [s * N.zx, N.far + 1], zebra(s < 0 ? 'NW' : 'NE'));
    lane([[s * N.zx, N.far + 1], [s * 40, N.far + 1], [s * 68, N.far + 1]]);
  }
  // across the main street: both junction mouths and the signalled crosswalk
  link([-5.6, S.mouth], [5.6, S.mouth], zebra('Sm'));
  link([-5.6, N.mouth], [5.6, N.mouth], zebra('Nm'));
  link([-5.6, 10], [5.6, 10], { gate: () => peds.signal.walkT > 3, road: true });
  link([-N.zx, N.far + 1], [N.zx, N.far + 1]);

  // ---------- the north (north.js): the arcade, the back streets on to the boulevard, its pavements, the plaza,
  // the canal promenade, the footbridge and the harbour side ----------
  const NB = NORTH.blvd, BS = NB.s + 2, BN = NB.n - 2, CN = NORTH.canal, HB = NORTH.harbour;
  for (const s of [-1, 1]) {
    // the arcade: up both sides past the shops, out onto the boulevard
    link([s * N.zx, N.far + 1], [s * 4.5, 46]);
    lane([[s * 4.5, 46], [s * 4.5, 70], [s * 4.5, 92], [s * 4.5, BS]]);
    // the back streets' pavements on north
    lane([[s * XI, N.far + 1], [s * XI, 75], [s * XI, BS]]);
    lane([[s * XO, N.far + 1], [s * XO, 75], [s * XO, BS]]);
    link([s * 40, N.far + 1], [s * XI, N.far + 1]); link([s * XO, N.far + 1], [s * 68, N.far + 1]);
    link([s * XI, BS], [s * XO, BS], { road: true });
  }
  link([-4.5, 70], [4.5, 70]);
  // the boulevard's two pavements, crossing at the arcade (and the harbour road's mouth)
  lane([[NB.x0 + 3, BS], [-90, BS], [-XO, BS]]); lane([[-XI, BS], [-4.5, BS]]); link([-4.5, BS], [4.5, BS]);
  lane([[4.5, BS], [XI, BS]]); lane([[XO, BS], [88, BS], [CN.x1 + 1, BS]]);
  link([CN.x1 + 1, BS], [HB.road1 + 1, BS], { road: true }); lane([[HB.road1 + 1, BS], [NB.x1 - 3, BS]]);
  lane([[NB.x0 + 3, BN], [-60, BN], [0, BN], [60, BN], [CN.x1 + 1, BN]]);
  link([CN.x1 + 1, BN], [HB.road1 + 1, BN], { road: true }); lane([[HB.road1 + 1, BN], [NB.x1 - 3, BN]]);
  link([0, BS], [0, BN], { road: true });
  link([-4.5, BS], [0, BS]);
  // the plaza: round the fountain to the Sky Tower
  lane([[0, BN], [-8.5, 134], [-9, 150], [0, 158], [9, 150], [8.5, 134], [0, BN]]);
  // the canal promenade, the footbridge and the harbour side's pavement
  lane([[88, N.far + 1.5], [90, 72], [90, BS]]); link([68, N.far + 1], [88, N.far + 1.5]);
  link([90, BS], [88, BS]);
  lane([[90, 72], [CN.x0 - 0.5, 72], [CN.x1 + 0.5, 72], [CN.x1 + 1, 72]]);
  lane([[CN.x1 + 1, CN.z0 + 2], [CN.x1 + 1, 72], [CN.x1 + 1, BS]]);
  lane([[CN.x1 + 1, BN], [CN.x1 + 1, 180], [CN.x1 + 1, CN.z1 - 2]]);
  lane([[95.3, BN], [95.3, 180], [95.3, CN.z1 - 2]]);
  // edges get their length and a lookup back
  for (const n of nodes) for (const e of n.edges) { e.from = n; e.len = Math.hypot(e.to.x - n.x, e.to.z - n.z); }
  return nodes;
}

// ---------- the walkers' bodies ----------
export function makeWalkers(scene, world) {
  const peds = world.peds;
  const nodes = buildNet(peds);
  const edges = nodes.flatMap((n) => n.edges.filter((e) => !e.road && !e.gate));
  // the main street is the busy one
  for (const e of edges) e.w = e.len * (Math.abs(e.from.x) < 8 && Math.abs(e.to.x) < 8 ? 2.5 : 1);
  const totalLen = edges.reduce((s, e) => s + e.w, 0);
  // static obstacles near the pavements, in a grid of 4 m cells (lamp posts, signal poles, vending machines, bins…)
  const grid = new Map(), G = 4;
  for (const c of world.colliders) {
    if (c.active || (c.minY !== undefined && c.minY > 1.2)) continue;
    if (c.maxX - c.minX > 30 || c.maxZ - c.minZ > 30) continue;
    for (let gx = Math.floor((c.minX - R) / G); gx <= Math.floor((c.maxX + R) / G); gx++)
      for (let gz = Math.floor((c.minZ - R) / G); gz <= Math.floor((c.maxZ + R) / G); gz++) {
        const k = gx * 10007 + gz; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(c);
      }
  }
  const blocked = (x, z) => {
    const l = grid.get(Math.floor(x / G) * 10007 + Math.floor(z / G));
    if (l) for (const c of l) if (x > c.minX - R && x < c.maxX + R && z > c.minZ - R && z < c.maxZ + R) return true;
    return false;
  };

  const agents = [], list = peds.list; // list: the walkers out on the road right now (traffic waits for them)
  const pool = [];
  let ready = false, loaded = 0, assignT = 0;

  // a walker somewhere on a pavement edge (picked by length, so busy long lanes get more people)
  function place(a, avoid) {
    for (let tries = 0; tries < 30; tries++) {
      let r = Math.random() * totalLen, e = edges[0];
      for (const q of edges) { r -= q.w; if (r <= 0) { e = q; break; } }
      const u = Math.random(), x = e.from.x + (e.to.x - e.from.x) * u, z = e.from.z + (e.to.z - e.from.z) * u;
      if (avoid && Math.hypot(x - avoid.x, z - avoid.z) < SEE + 8) continue;
      Object.assign(a, { e, x, z, wait: 0, stuck: 0, waitGate: false, onRoad: false });
      a.pos.set(x, groundY(x, z, 1), z);
      a.yaw = Math.atan2(e.to.x - e.from.x, e.to.z - e.from.z);
      return true;
    }
    return false;
  }
  const MAX = 100;   // the town reaches the boulevard and the harbour now: more people to fill it
  for (let i = 0; i < MAX; i++) {
    const a = { id: i, pos: new THREE.Vector3(), yaw: 0, speed: 1.05 + Math.random() * 0.45, side: 0.35 + Math.random() * 0.3, model: i % NPC_MODELS.length,
      h: 1.52 + Math.random() * 0.24, umbrella: Math.random() < 0.8, umbrellaKind: Math.random() < 0.55 ? 0 : 1 + Math.floor(Math.random() * 3),
      on: false, onRoad: false, body: null, moving: true };
    place(a, null);
    agents.push(a);
  }

  // ---------- umbrellas ----------
  const vinyl = new THREE.MeshStandardMaterial({ color: 0xf2f6fa, transparent: true, opacity: 0.32, roughness: 0.12, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false });
  const canopyMats = [vinyl, ...[0x1c2230, 0x5a1f2b, 0x24384f].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, side: THREE.DoubleSide }))];
  const shaftMat = new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 0.8, roughness: 0.3 });
  const ribMat = new THREE.LineBasicMaterial({ color: 0x9aa1aa });
  const handleMat = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.5 });
  // eight panels on a domed profile, ribs along the seams, and the rim between their tips
  const PROFILE = [[0.0, 0], [0.1, -0.018], [0.2, -0.05], [0.29, -0.09], [0.38, -0.14], [0.47, -0.2]];
  const canopyGeo = new THREE.LatheGeometry(PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), 8);
  const seam = (i) => (i / 8) * Math.PI * 2;
  const ribGeo = (() => {
    const pts = [];
    for (let i = 0; i < 8; i++) for (let k = 0; k < PROFILE.length - 1; k++) {
      const [r0, y0] = PROFILE[k], [r1, y1] = PROFILE[k + 1], a = seam(i);
      pts.push(new THREE.Vector3(Math.sin(a) * r0, y0, Math.cos(a) * r0), new THREE.Vector3(Math.sin(a) * r1, y1, Math.cos(a) * r1));
    }
    const [rr, ry] = PROFILE[PROFILE.length - 1];
    for (let i = 0; i < 8; i++) pts.push(new THREE.Vector3(Math.sin(seam(i)) * rr, ry, Math.cos(seam(i)) * rr), new THREE.Vector3(Math.sin(seam(i + 1)) * rr, ry, Math.cos(seam(i + 1)) * rr));
    return new THREE.BufferGeometry().setFromPoints(pts);
  })();
  function umbrella() {
    const g = new THREE.Group();
    const canopy = new THREE.Mesh(canopyGeo, vinyl); canopy.position.y = 0.74; g.add(canopy);
    const ribs = new THREE.LineSegments(ribGeo, ribMat); ribs.position.y = 0.74; g.add(ribs);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.8, 6), shaftMat); shaft.position.y = 0.38; g.add(shaft);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.01, 0.08, 6), shaftMat); tip.position.y = 0.8; g.add(tip);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.14, 8), handleMat); handle.position.y = -0.02; g.add(handle);
    g.userData.canopy = canopy;
    for (const m of [canopy, shaft, tip, handle]) { m.castShadow = false; m.frustumCulled = false; }
    return g;
  }

  // ---------- the bodies ----------
  async function load() {
    const buffers = {};
    // two copies of the first models, one of the rest
    const names = []; for (let i = 0; i < BODIES; i++) names.push(NPC_MODELS[i % NPC_MODELS.length]);
    for (const name of new Set(names)) {
      try { buffers[name] = await (await fetch(`assets/npc/${name}.vrm`)).arrayBuffer(); } catch (e) { console.warn('[ameyoru] walker model missing', name, e); }
    }
    for (const name of names) {
      if (!buffers[name]) { loaded++; continue; }
      try {
        const gltf = await loader.parseAsync(buffers[name].slice(0), '');
        const vrm = gltf.userData.vrm;
        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.combineSkeletons(gltf.scene);
        VRMUtils.rotateVRM0(vrm);
        shareModelTextures(name, vrm.scene);   // one set of textures per model, shared with every other copy
        mergeVRM(gltf.scene); // ~80 meshes → ~30
        tameHighlights(gltf.scene);
        vrm.scene.traverse((o) => {
          if (!o.isMesh) return;
          o.frustumCulled = false; o.castShadow = false; o.receiveShadow = true;
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m.isOutline) m.visible = false;
        });
        const root = new THREE.Group(); root.add(vrm.scene); root.visible = false; root.matrixWorldAutoUpdate = false; root.userData.dynamic = true; scene.add(root);
        const b = { name, vrm, root, mixer: new THREE.AnimationMixer(vrm.scene), actions: {}, agent: null, cur: null };
        const walkClip = FEMALE.has(name) ? 'walk_female' : 'walk';
        b.clipSpeed = CLIP_SPEED[walkClip];
        for (const [k, file] of [['walk', walkClip], ['idle', 'idle']]) {
          try { b.actions[k] = b.mixer.clipAction(await loadMixamoClip(`assets/anims/${file}.json`, vrm, k, { inPlace: true })); } catch (e) { /* missing clip: unused */ }
        }
        // the arm that holds the umbrella: its rest directions, so the hand can be put on the shaft
        armRig(b);
        b.umb = umbrella(); root.add(b.umb); b.umb.visible = false;
        pool.push(b);
      } catch (e) { console.warn('[ameyoru] walker failed', name, e); }
      loaded++;
    }
    ready = true;
    console.info('[ameyoru] walkers ready', pool.length);
  }

  // Holding an umbrella: the right upper arm hangs a little forward, the forearm comes up in front of the chest.
  // Directions are in the walker's own frame (+z forward, +y up; its right hand side is −x).
  const DU = new THREE.Vector3(-0.12, -0.95, 0.28).normalize(), DL = new THREE.Vector3(0.38, 0.36, 0.85).normalize();
  function armRig(b) {
    const h = b.vrm.humanoid, nb = (n) => h.getNormalizedBoneNode(n);
    const up = nb('rightUpperArm'), lo = nb('rightLowerArm'), hand = nb('rightHand');
    if (!up || !lo || !hand) return;
    b.root.updateMatrixWorld(true);
    const inv = b.root.matrixWorld.clone().invert();
    const P = (o) => o.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
    const s = P(up), e = P(lo), w = P(hand);
    const rootQ = b.root.getWorldQuaternion(new THREE.Quaternion());
    const Rn = rootQ.invert().multiply(up.parent.getWorldQuaternion(new THREE.Quaternion())); // the rig's frame in the walker's
    const a0 = e.clone().sub(s).normalize(), Lu = e.distanceTo(s), Ll = w.distanceTo(e);
    const Qu = new THREE.Quaternion().setFromUnitVectors(a0, DU), Ql = new THREE.Quaternion().setFromUnitVectors(a0, DL);
    const RnI = Rn.clone().invert();
    // local = Rn⁻¹ · Q · Rn (upper); Rn⁻¹ · Qu⁻¹ · Ql · Rn (lower, relative to the upper arm)
    b.arm = {
      up, lo, hand, raw: h.getRawBoneNode('rightHand'),
      qUp: RnI.clone().multiply(Qu).multiply(Rn),
      qLo: RnI.clone().multiply(Qu.clone().invert()).multiply(Ql).multiply(Rn),
      handAt: s.clone().addScaledVector(DU, Lu).addScaledVector(DL, Ll),
    };
  }

  function play(b, k, fade = 0.3) {
    const a = b.actions[k] || b.actions.walk; if (!a || b.cur === a) return;
    a.reset(); a.time = Math.random() * a.getClip().duration; a.play();
    if (b.cur) b.cur.crossFadeTo(a, fade, false); b.cur = a;
  }
  function give(b, a) {
    b.agent = a; a.body = b;
    b.root.scale.setScalar(a.h / 1.62);
    b.root.visible = true; b.root.matrixWorldAutoUpdate = true;
    b.cur?.stop(); b.cur = null; play(b, a.moving ? 'walk' : 'idle', 0);
    const m = canopyMats[a.umbrellaKind];
    b.umb.userData.canopy.material = m;
  }
  function take(b) {
    if (!b.agent) return;
    b.agent.body = null; b.agent = null;
    b.root.visible = false; b.root.matrixWorldAutoUpdate = false;
  }

  // ---------- moving about ----------
  const tmp = new THREE.Vector3();
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), sph = new THREE.Sphere(new THREE.Vector3(), 1.6);
  function nextEdge(a, at, from) {
    const opts = at.edges.filter((e) => e.to !== from);
    const pick = opts.length ? opts : at.edges;
    // crossing the road is less likely than walking on
    const w = pick.map((e) => (e.road ? 0.45 : 1));
    let r = Math.random() * w.reduce((s, x) => s + x, 0);
    for (let i = 0; i < pick.length; i++) { r -= w[i]; if (r <= 0) return pick[i]; }
    return pick[0];
  }
  // somebody or something in the way of the point (x, z)?
  // 0: free; 1: a post, a wall or you; 2: another walker
  function busy(a, x, z, p) {
    if (blocked(x, z)) return 1;
    if (Math.hypot(x - p.x, z - p.z) < R + 0.4) return 1;
    for (const b of agents) if (b !== a && b.on && Math.abs(b.x - x) < 0.6 && Math.abs(b.z - z) < 0.6) return 2;
    return 0;
  }

  function walk(a, dt, p, want) {
    const e = a.e;
    // standing about in front of a shop for a while (window shopping, waiting for someone)
    if (a.loiter > 0) {
      a.loiter -= dt; a.moving = false;
      a.yaw += angle(a.loiterYaw - a.yaw) * Math.min(1, dt * 3);
      return;
    }
    // at the start of a gated edge (zebra, level crossing): wait for it
    if (a.waitGate) {
      if (e.gate()) a.waitGate = false;
      else { a.moving = false; const ty = Math.atan2(e.to.x - e.from.x, e.to.z - e.from.z); a.yaw += angle(ty - a.yaw) * Math.min(1, dt * 3); return; }
    }
    // the lane, kept left: aim a little ahead along the edge, shifted to the left of the way you go
    const dx = e.to.x - e.from.x, dz = e.to.z - e.from.z, L = e.len || 1, fx = dx / L, fz = dz / L;
    const along = (a.x - e.from.x) * fx + (a.z - e.from.z) * fz;
    const side = e.road ? 0 : a.side;
    const tA = Math.min(L, along + 1.2);
    let tx = e.from.x + fx * tA + fz * side, tz = e.from.z + fz * tA - fx * side;
    if (L - along < 0.5) {
      // reached the node: on to the next edge
      const at = e.to, next = nextEdge(a, at, e.from);
      // now and then stop at the corner of a block, turned to the shops (away from the road)
      if (!e.road && !next.gate && Math.random() < 0.14) {
        a.loiter = 5 + Math.random() * 14;
        const alongZ = Math.abs(e.to.x - e.from.x) < Math.abs(e.to.z - e.from.z);
        if (alongZ) { const rx = [0, RING.bx, -RING.bx].reduce((b, r) => (Math.abs(a.x - r) < Math.abs(a.x - b) ? r : b), 0); a.loiterYaw = a.x > rx ? Math.PI / 2 : -Math.PI / 2; }
        else { const rz = Math.abs(a.z - 40) < Math.abs(a.z + 200) ? 40 : -200; a.loiterYaw = a.z > rz ? 0 : Math.PI; }
      }
      a.e = next; a.waitGate = !!next.gate && !next.gate();
      a.onRoad = next.road;
      return;
    }
    let vx = tx - a.x, vz = tz - a.z; const vl = Math.hypot(vx, vz) || 1; vx /= vl; vz /= vl;
    // step round whatever is in the way: try straight on, then a little either side
    let sp = a.speed, ok = false, byPeople = false;
    for (const ang of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2]) {
      const c = Math.cos(ang), s = Math.sin(ang), ux = vx * c - vz * s, uz = vx * s + vz * c;
      const why = busy(a, a.x + ux * 0.55, a.z + uz * 0.55, p);
      if (!why) { vx = ux; vz = uz; ok = true; if (ang) sp *= 0.8; break; }
      if (why === 2) byPeople = true;
    }
    if (!ok) {
      // queueing behind people (at a zebra, say) is patient; boxed in by something else: turn back after a while
      a.moving = false; a.stuck += byPeople ? dt * 0.2 : dt;
      if (a.stuck > 3) { a.e = a.e.to.edges.find((q) => q.to === a.e.from) || a.e; a.stuck = 0; a.waitGate = false; }
      return;
    }
    a.stuck = 0; a.moving = true;
    a.x += vx * sp * dt; a.z += vz * sp * dt;
    a.yaw += angle(Math.atan2(vx, vz) - a.yaw) * Math.min(1, dt * 5);
  }
  const angle = (d) => Math.atan2(Math.sin(d), Math.cos(d));

  load();
  return {
    get ready() { return ready; },
    get progress() { return ready ? 1 : loaded / BODIES; },
    roots: () => pool.map((b) => b.root),
    agents,
    // p: where you are; day: daylight 0..1; rain: how hard it rains 0..1; inside: you're in a room (fewer bodies)
    update(dt, p, day = 0, rain = 1, inside = false, camera = null) {
      if (camera) { camera.updateMatrixWorld(); frustum.setFromProjectionMatrix(pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)); }
      // fewer people out late at night, more by day
      const want = Math.round(56 + day * 38);   // the north added a lot of pavement
      list.length = 0;
      for (const a of agents) {
        if (!a.on) {
          if (a.id < want) { if (place(a, p)) a.on = true; } // join somewhere out of sight
          continue;
        }
        if (a.id >= want && !a.body && Math.hypot(a.x - p.x, a.z - p.z) > SEE + 8) { a.on = false; continue; }
        walk(a, dt, p, want);
        a.pos.set(a.x, groundY(a.x, a.z, a.pos.y + 0.3), a.z);
        if (a.onRoad && a.moving) list.push(a);
      }
      if (!ready) return;
      // bodies go to the nearest walkers (inside a room: none — you can't see the street)
      if ((assignT -= dt) <= 0) {
        assignT = 0.25;
        const near = [];
        if (!inside) for (const a of agents) {
          if (!a.on) continue;
          const d = Math.hypot(a.x - p.x, a.z - p.z);
          if (d < SEE + (a.body ? 6 : 0)) near.push([a, d - (a.body ? 6 : 0)]);
        }
        near.sort((x, y) => x[1] - y[1]);
        const keep = new Set(near.slice(0, pool.length).map((n) => n[0]));
        for (const b of pool) if (b.agent && !keep.has(b.agent)) take(b);
        for (const a of keep) {
          if (a.body) continue;
          const free = pool.filter((b) => !b.agent);
          const b = free.find((q) => q.name === NPC_MODELS[a.model]) || free[0];
          if (b) give(b, a);
        }
      }
      for (const b of pool) {
        const a = b.agent; if (!a) continue;
        b.root.position.copy(a.pos); b.root.rotation.y = a.yaw;
        play(b, a.moving ? 'walk' : 'idle');
        if (b.actions.walk) b.actions.walk.timeScale = a.speed / b.clipSpeed;
        // out of view (behind the camera or round a corner): not drawn and not posed; its clock keeps running so
        // it steps back into view mid-stride, exactly where it would have been
        sph.center.set(a.pos.x, a.pos.y + 1, a.pos.z);
        const seen = !camera || frustum.intersectsSphere(sph);
        b.root.visible = seen;
        if (!seen) { b.lag = (b.lag || 0) + dt; continue; }
        b.mixer.update(dt + (b.lag || 0)); b.lag = 0;
        // umbrella up when it rains: the right arm holds it
        const umb = a.umbrella && rain > 0.15 && b.arm;
        b.umb.visible = !!umb;
        if (umb) { b.arm.up.quaternion.copy(b.arm.qUp); b.arm.lo.quaternion.copy(b.arm.qLo); b.arm.hand.quaternion.identity(); }
        if (Math.hypot(a.x - p.x, a.z - p.z) < 10) b.vrm.update(dt); else b.vrm.humanoid.update();
        if (umb) {
          // the umbrella sits in the hand as it is drawn (the torso sways), upright, leaning a touch into the walk
          b.root.updateMatrixWorld(); b.arm.raw.updateWorldMatrix(true, false);
          b.umb.position.copy(b.root.worldToLocal(b.arm.raw.getWorldPosition(tmp)));
          b.umb.rotation.x = a.moving ? 0.1 : 0.03;
        }
      }
    },
  };
}
