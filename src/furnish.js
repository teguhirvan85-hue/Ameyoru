// Real furniture and the small things that make a room look lived in.
// Models are Poly Haven glTFs (CC0) in assets/<name>/<name>_1k.gltf, loaded on first use and cloned.
// Every room also gets a generic "dressing": skirting boards, sprinkler heads, an air conditioner, a clock, an
// extinguisher, an alarm bell, a fire-exit sign, outlets, and a camera in shops — kept high or in corners so they
// don't fight the furniture each interior builds.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { withKTX2 } from './ktx2.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasTex, JP_FONT } from './textures.js';

const loader = withKTX2(new GLTFLoader());
const cache = new Map();
// per model: extra yaw so its front faces +z, and scale
const FIX = {};
// everything placed: only what's near you is drawn (cullPlaced, called a few times a second)
export const PLACED = [];
const _wp = new THREE.Vector3();
// small or very detailed things are only worth drawing up close
const RANGE = { potted_plant_02: 13, korean_fire_extinguisher_01: 14, wall_clock: 14, fire_alarm: 11, security_camera_02: 14, tea_set_01: 12, wooden_bowl_01: 10, binder_notebook: 10, office_notepads: 10, ceramic_pot: 14, cardboard_box_01: 18, plastic_crate_01: 16, WetFloorSign_01: 16 };
// and too small to cast a shadow anyone would notice
const NO_SHADOW = new Set(['wall_clock', 'fire_alarm', 'security_camera_02', 'tea_set_01', 'wooden_bowl_01', 'binder_notebook', 'office_notepads', 'wine_bottles_01', 'korean_fire_extinguisher_01', 'potted_plant_02']);
export function cullPlaced(p, range = 28) {
  for (const g of PLACED) {
    if (!g.userData.at) { g.updateWorldMatrix(true, false); g.userData.at = g.getWorldPosition(_wp).clone(); }
    const R = RANGE[g.userData.model] ?? range;
    const a = g.userData.at, near = Math.abs(a.x - p.x) < R && Math.abs(a.z - p.z) < R && Math.abs(a.y - p.y) < 12;
    if (g.visible !== near) g.visible = near;
  }
}

export function model(name) {
  if (!cache.has(name)) {
    cache.set(name, loader.loadAsync(`assets/${name}/${name}_1k.gltf`).then((g) => {
      g.scene.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true; o.receiveShadow = true;
        // glass that refracts (transmission) makes three.js draw the whole scene a second time every frame:
        // plain see-through glass looks nearly the same here and costs nothing extra
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (m.transmission > 0) { m.transmission = 0; m.transparent = true; m.opacity = Math.min(m.opacity, 0.25); m.depthWrite = false; m.needsUpdate = true; }
        }
      });
      return g.scene;
    }));
  }
  return cache.get(name);
}

// place a model: the returned group sits at x, y, z turned by ry (radians, 0 = front towards +z)
// h: scale it to this height; s: uniform scale
export function place(parent, name, x, y, z, ry = 0, { h, s = 1, moving = false } = {}) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; parent.add(g); PLACED.push(g); g.userData.model = name; g.userData.dynamic = true;
  model(name).then((src) => {
    const c = src.clone(true), f = FIX[name] || {};
    let k = s * (f.s ?? 1);
    if (h) { const b = new THREE.Box3().setFromObject(src); k = h / Math.max(0.01, b.max.y - b.min.y); }
    c.scale.setScalar(k); c.rotation.y = f.yaw ?? 0;
    if (NO_SHADOW.has(name)) c.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    g.add(c);
    // furniture doesn't move: work its matrices out once and skip it in the per-frame update
    if (!moving) { g.updateMatrixWorld(true); g.traverse((o) => { o.matrixAutoUpdate = false; }); g.matrixWorldAutoUpdate = false; }
  }).catch((e) => console.warn('[ameyoru] model failed', name, e));
  g.updateMatrixWorld(true);
  for (const o of g.children) if (!o.userData.model) { o.matrixAutoUpdate = false; o.matrixWorldAutoUpdate = false; }
  return g;
}

// ---------- materials for the dressing ----------
let M = null;
function mats() {
  if (M) return M;
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o });
  M = {
    skirtDark: std(0x2a2724, { roughness: 0.5 }), skirtWood: std(0x5a3f2a, { roughness: 0.55 }), skirtGrey: std(0x8a8c90, { roughness: 0.45 }),
    white: std(0xeef0f0, { roughness: 0.35 }), plastic: std(0xdfe2e4, { roughness: 0.4 }), chrome: std(0xc8ccd0, { metalness: 0.9, roughness: 0.25 }),
    vent: std(0x3a3d42, { roughness: 0.6 }), red: std(0xc8241e, { roughness: 0.4 }),
    exit: new THREE.MeshBasicMaterial({ map: canvasTex(256, 96, (g, w, h) => {
      g.fillStyle = '#16a34a'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#f4fff6'; g.fillRect(6, 6, 84, h - 12);
      // the running figure and the door (our own simple drawing)
      g.fillStyle = '#16a34a'; g.beginPath(); g.arc(46, 26, 8, 0, Math.PI * 2); g.fill();
      g.lineWidth = 7; g.strokeStyle = '#16a34a'; g.lineCap = 'round';
      g.beginPath(); g.moveTo(44, 36); g.lineTo(38, 58); g.lineTo(26, 74); g.moveTo(38, 58); g.lineTo(54, 72); g.moveTo(42, 42); g.lineTo(58, 46); g.moveTo(42, 42); g.lineTo(26, 48); g.stroke();
      g.fillStyle = '#f4fff6'; g.font = `900 40px ${JP_FONT}`; g.textBaseline = 'middle'; g.fillText('非常口', 104, h / 2 + 2);
    }), color: new THREE.Color(1.5, 1.5, 1.5) }),
    outlet: new THREE.MeshStandardMaterial({ map: canvasTex(64, 96, (g, w, h) => {
      g.fillStyle = '#f2f2ee'; g.fillRect(0, 0, w, h); g.strokeStyle = '#c8c8c2'; g.lineWidth = 3; g.strokeRect(2, 2, w - 4, h - 4);
      g.fillStyle = '#2a2a2a'; for (const y of [30, 66]) { g.fillRect(22, y - 8, 5, 14); g.fillRect(37, y - 8, 5, 14); }
    }), roughness: 0.4 }),
    acFace: new THREE.MeshStandardMaterial({ map: canvasTex(256, 64, (g, w, h) => {
      g.fillStyle = '#f4f5f2'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#d9dbd6'; g.fillRect(0, h - 18, w, 18);
      g.strokeStyle = '#b8bab4'; g.lineWidth = 2; for (let x = 8; x < w - 8; x += 6) { g.beginPath(); g.moveTo(x, h - 16); g.lineTo(x, h - 2); g.stroke(); }
      g.fillStyle = '#7ad07a'; g.fillRect(w - 40, 12, 6, 3); g.fillStyle = '#999'; g.font = '700 10px sans-serif'; g.fillText('AIR', 12, 18);
    }), roughness: 0.35 }),
  };
  M.geo = {
    sprinkler: new THREE.CylinderGeometry(0.03, 0.035, 0.03, 10), sprinkHead: new THREE.CylinderGeometry(0.012, 0.012, 0.03, 6),
    smoke: new THREE.CylinderGeometry(0.06, 0.065, 0.035, 18), outlet: new THREE.BoxGeometry(0.07, 0.11, 0.012),
    ac: new RoundedBoxGeometry(0.85, 0.28, 0.22, 3, 0.05), exit: new THREE.BoxGeometry(0.42, 0.16, 0.05),
    vent: new THREE.BoxGeometry(0.5, 0.01, 0.5),
  };
  return M;
}

// which wall of a room is the shop front (glass): the one facing the street it stands on
function frontOf(r) {
  const cx = (r.minX + r.maxX) / 2;
  if (cx < -500) return null;                 // rooms far off the map (apartment, karaoke booth, train)
  const streetX = cx > 600 ? 1200 : 0;        // Hoshimi street at x = 0, Tsukino's arcade at x = 1200
  return cx > streetX ? 'minX' : 'maxX';
}

// a room's generic dressing; skip: names of pieces to leave out for this room
export function dressRoom(parent, r, { skip = [], skirt = 'dark' } = {}) {
  const m = mats(), G = m.geo, front = r.front ?? frontOf(r);
  const g = new THREE.Group(); parent.add(g);
  const add = (geo, mat, x, y, z, ry = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.y = ry; o.receiveShadow = true; g.add(o); return o; };
  const y0 = r.y, top = r.ceil, w = r.maxX - r.minX, d = r.maxZ - r.minZ, cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2;
  const has = (k) => !skip.includes(k);
  // the walls (inner faces, a little past the walkable bounds), each with an inward normal
  const walls = [
    { k: 'minX', x: r.minX - 0.04, z: cz, len: d, ry: Math.PI / 2, n: [1, 0] },
    { k: 'maxX', x: r.maxX + 0.04, z: cz, len: d, ry: -Math.PI / 2, n: [-1, 0] },
    { k: 'minZ', x: cx, z: r.minZ - 0.04, len: w, ry: 0, n: [0, 1] },
    { k: 'maxZ', x: cx, z: r.maxZ + 0.04, len: w, ry: Math.PI, n: [0, -1] },
  ];
  const solid = walls.filter((W) => W.k !== front);
  const back = front ? walls.find((W) => W.k === (front === 'minX' ? 'maxX' : 'minX')) : walls[1];
  const sides = walls.filter((W) => W.k === 'minZ' || W.k === 'maxZ');
  const at = (W, along, up, out = 0.01) => {
    // a point on wall W: along = metres from its centre, up = height above the floor, out = off the wall
    const tx = W.n[1] !== 0 ? 1 : 0, tz = W.n[0] !== 0 ? 1 : 0;
    return [W.x + tx * along + W.n[0] * out, y0 + up, W.z + tz * along + W.n[1] * out];
  };
  // skirting boards
  if (has('skirt')) {
    const sm = skirt === 'wood' ? m.skirtWood : skirt === 'grey' ? m.skirtGrey : m.skirtDark;
    for (const W of solid) { const [x, y, z] = at(W, 0, 0.045, 0.012); add(new THREE.BoxGeometry(W.len, 0.09, 0.02), sm, x, y, z, W.ry); }
  }
  // ceiling: sprinkler heads on a grid, a smoke detector, a square air vent
  if (has('ceiling')) {
    for (let i = 0; i < Math.max(1, Math.round(w / 2.2)); i++) for (let j = 0; j < Math.max(1, Math.round(d / 2.2)); j++) {
      const x = r.minX + (i + 0.3) * w / Math.max(1, Math.round(w / 2.2)), z = r.minZ + (j + 0.7) * d / Math.max(1, Math.round(d / 2.2));
      add(G.sprinkler, m.chrome, x, top - 0.015, z); add(G.sprinkHead, m.chrome, x, top - 0.045, z);
    }
    add(G.smoke, m.white, cx + w * 0.18, top - 0.018, cz - d * 0.2);
    if (w * d > 8) add(G.vent, m.vent, cx - w * 0.22, top - 0.006, cz + d * 0.22);
  }
  // an air conditioner high on a side wall, near the back
  if (has('ac') && sides.length) {
    const W = sides[0], along = back ? (back.k === 'maxX' ? 1 : -1) * Math.min(w / 2 - 0.7, 1.2) : 0;
    const [x, y, z] = at(W, along, Math.min(top - y0 - 0.3, 2.45), 0.12);
    const ac = add(G.ac, m.white, x, y, z, W.ry); ac.castShadow = true;
    const face = add(new THREE.PlaneGeometry(0.84, 0.21), m.acFace, x + W.n[0] * 0.111, y - 0.02, z + W.n[1] * 0.111, W.ry);
  }
  // a clock high on the back wall
  if (has('clock') && back) { const [x, y, z] = at(back, d * 0.22, Math.min(top - y0 - 0.45, 2.3), 0.03); place(g, 'wall_clock', x, y, z, back.ry, { s: 0.9 }); }
  // the fire-exit sign over the way out, hanging just inside the front
  if (has('exit') && front) {
    const F = walls.find((W) => W.k === front), [x, y, z] = at(F, 0, top - y0 - 0.22, 0.35);
    add(G.exit, m.exit, x, y, z, F.ry + Math.PI);
    add(G.exit, m.exit, x, y, z, F.ry).scale.set(1, 1, 0.98);
  }
  // an extinguisher in a front corner, an alarm bell on a side wall
  if (has('extinguisher') && front && sides.length) {
    const F = walls.find((W) => W.k === front), S2 = sides[sides.length - 1];
    const fx = F.x + F.n[0] * 0.45, fz = S2.z + S2.n[1] * 0.22;
    place(g, 'korean_fire_extinguisher_01', fx, y0, fz, S2.ry, { s: 0.85 });
  }
  if (has('alarm') && sides.length) {
    const S2 = sides[sides.length - 1], along = front ? (front === 'minX' ? -1 : 1) * (w / 2 - 0.7) : 0;
    const [x, y, z] = at(S2, along, 1.55, 0.02); place(g, 'fire_alarm', x, y, z, S2.ry, { s: 1.2 });
  }
  // outlets low on the side walls
  if (has('outlets')) for (const W of sides) for (const a of [-0.3, 0.25]) { const [x, y, z] = at(W, a * W.len, 0.3, 0.008); add(G.outlet, m.outlet, x, y, z, W.ry); }
  // a camera watching from a back corner (shops)
  if (has('camera') && ['konbini', 'arcade', 'pachinko', 'laundry', 'gacha', 'station'].includes(r.amb) && back && sides.length) {
    const S2 = sides[0], tx = back.x + back.n[0] * 0.25, tz = S2.z + S2.n[1] * 0.25;
    place(g, 'security_camera_02', tx, top - 0.08, tz, Math.atan2(back.n[0], back.n[1]), { s: 1 });
  }
  return g;
}
