// Loads the Poly Haven (CC0) props in /assets and places them as instanced meshes.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { wheel, plateTexture } from './cars.js';
import { rigCar, findRig } from './carrig.js';

const FILES = ['exterior_aircon_unit', 'utility_box_01', 'rollershutter_door', 'modular_metal_gutter', 'security_light', 'metal_trash_can', 'water_manhole_cover',
  // street life (streetlife.js): pots and plants by the doors, rubbish out for collection, crates, transformer cabinets
  'planter_pot_clay', 'potted_plant_02', 'potted_plant_04', 'trashbag', 'utility_box_02', 'plastic_crate_01', 'plastic_crate_02'];
// Sketchfab packs (CC BY) whose parts are placed like the Poly Haven ones: roadworks cones, posts and barricades;
// Japanese street bins and the blue can bins that stand by vending machines, a roadworks sign
const PACKS = { cones: 'props/cones/scene.gltf', jp_street: 'props/jp_street/scene.gltf',
  // Poly Pizza (CC BY 3.0): a single low-poly rose and a bunch of a dozen, re-coloured pink in code (the florist)
  rose: 'props/rose/rose.glb', roses: 'props/roses/roses.glb' };

// Real car models (Sketchfab, CC BY / BY-SA). Each is scaled uniformly to its real bumper-to-bumper
// length, so width and height keep the model's own (real) proportions and cars match each other.
export const CARS_CFG = {
  // rig: wheel radius, front-door length, top of the door (share of height), seat height, driver's distance in from the side
  porsche_911: { file: 'cars/porsche_911.glb', length: 4.49, rig: { r: 0.345, door: 1.25, belt: 0.86, seat: 0.36, driverIn: 0.48 } },     // 991 Carrera 4S
  crown_comfort: { file: 'cars/crown_comfort.glb', length: 4.695, rig: { r: 0.31, door: 1.05, belt: 0.9, seat: 0.45 } }, // S10 Crown Comfort
  prius_2012: { file: 'cars/prius_2012.glb', length: 4.48, flip: true, rig: { r: 0.31, door: 1.0, belt: 0.9, seat: 0.48 } }, // XW30 Prius (modelled facing −Z)
  // E100 Corolla (US DX): the model ships without wheels, so we add real-size ones and lift the body
  corolla_mk7: { file: 'cars/corolla_mk7.glb', length: 4.37, lift: 0.17, wheels: { wb: 2.465, axle: 0.02, track: 1.43, r: 0.29 }, rig: { r: 0.29, door: 1.0, belt: 0.9, seat: 0.45 } },
  // street traffic (kind other than 'car': not parked in the lots, not drivable — no door hinge is cut)
  daihatsu_cast: { file: 'cars/daihatsu_cast/scene.gltf', length: 3.395, kind: 'kei', rig: { r: 0.28, door: 0 } },        // LA250S Cast Sport
  wagonr: { file: 'cars/wagonr/scene.gltf', length: 3.395, kind: 'kei', flip: true, rig: { r: 0.28, door: 0 } },               // MH34S Wagon R
  // JPN Taxi (JPN10): the file carries one wheel at the origin, meant to be copied to each corner
  jpn_taxi: { file: 'cars/jpn_taxi/scene.gltf', length: 4.4, kind: 'taxi', ownWheel: { y: 0.31, z: [1.38, -1.38], x: 0.72 }, rig: { r: 0.31, door: 0 } },
  hiace_2013: { file: 'cars/hiace_2013/scene.gltf', length: 4.695, kind: 'van', rig: { r: 0.33, door: 0 } },             // H200 standard body
  carry_minivan: { file: 'cars/carry_minivan/scene.gltf', length: 3.295, kind: 'van', yaw: -0.789, drop: /Zemin/, rig: { r: 0.27, door: 0 } },       // Carry / Every van
  carry_pickup: { file: 'cars/carry_pickup/scene.gltf', length: 3.395, kind: 'pickup', rig: { r: 0.27, door: 0 } },      // Carry kei truck
  isuzu_elf: { file: 'cars/isuzu_elf/scene.gltf', length: 6.0, kind: 'truck', rig: { r: 0.37, half: 0.3, door: 0 } },   // Elf 2 t box
};

// Street props from Sketchfab (CC BY, see CREDITS.md). Each is turned to face +z, scaled to its real height, centred
// on x/z and stood on y = 0. yaw: the turn that brings the model's front to +z.
export const PROPS_CFG = {
  vending_a: { file: 'props/vending_machine/scene.gltf', height: 1.83, yaw: 0 },
  vending_b: { file: 'props/vending_red/scene.gltf', height: 1.83, yaw: -Math.PI / 2 },
  // a Somali cat, rigged, with Idle / WalkClean / SitDown / SittingIdle / StandUp (its file has a floor plate)
  cat: { file: 'props/cat/scene.gltf', height: 0.46, drop: /^material_0$/, anim: true },
};

export function prepareProp(scene, { height, yaw = 0, drop = null, anim = false }) {
  if (drop) { const out = []; scene.traverse((o) => { if (o.isMesh && drop.test(o.material.name)) out.push(o); }); out.forEach((o) => o.removeFromParent()); }
  const inner = new THREE.Group(); inner.add(scene); inner.rotation.y = yaw; inner.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(inner, true);
  inner.scale.setScalar(height / box.getSize(new THREE.Vector3()).y); inner.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(inner, true);
  const c = box.getCenter(new THREE.Vector3());
  inner.position.set(-c.x, -box.min.y, -c.z);
  const root = new THREE.Group(); root.add(inner);
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    // glass that refracts (transmission: the vending machine's bottles) makes three.js draw the whole town a
    // second time every frame one is on screen: plain see-through glass instead
    for (const m of [].concat(o.material)) if (m?.transmission > 0) { m.transmission = 0; m.transparent = true; m.opacity = Math.min(m.opacity, 0.45); m.depthWrite = false; m.needsUpdate = true; }
  });
  root.updateMatrixWorld(true);
  root.userData.size = new THREE.Box3().setFromObject(root, true).getSize(new THREE.Vector3());
  // still props can be folded into the frozen town (freeze.js); animated ones stay live
  if (anim) root.userData.dynamic = true; else root.userData.static = true;
  return root;
}

// Number plates reading DESY on every car, front and back, laid over the model's own plate (or where one goes).
// y: height of the plate's centre; w × h: its size (wider where the model has a European plate to cover);
// kind: plate colours (kei cars yellow, trucks green)
const PLATES = {
  daihatsu_cast: { f: 0.38, b: 0.86, w: 0.36, h: 0.18, kind: 'kei' },
  wagonr: { f: 0.54, b: 0.84, w: 0.5, h: 0.13, kind: 'kei' },
  crown_comfort: { f: 0.46, b: 0.83, w: 0.37, h: 0.185 },
  porsche_911: { f: 0.35, b: 0.44, w: 0.52, h: 0.12 },
  isuzu_elf: { f: 0.44, b: 0.42, w: 0.42, h: 0.21, kind: 'green' },
  corolla_mk7: { f: 0.42, b: 0.62 }, hiace_2013: { f: 0.45, b: 0.6, kind: 'green' }, jpn_taxi: { f: 0.52, b: 0.62, kind: 'green' },
  carry_pickup: { f: 0.45, b: 0.5, kind: 'kei' }, carry_minivan: { f: 0.45, b: 0.6, kind: 'kei' }, prius_2012: { f: 0.42, b: 0.6 },
};
function addPlates(car, key) {
  const P = PLATES[key]; if (!P) return;
  const w = P.w ?? 0.34, h = P.h ?? 0.17;
  const mat = new THREE.MeshStandardMaterial({ map: plateTexture(P.kind ?? 'white', w / h), roughness: 0.35, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2 });
  car.updateMatrixWorld(true);
  const meshes = []; car.traverse((o) => { if (o.isMesh && !o.material?.transparent) meshes.push(o); });
  const ray = new THREE.Raycaster(), L = car.userData.size.z;
  for (const [y, dir] of [[P.f, 1], [P.b, -1]]) {
    // find the body's surface straight in from the plate's spot (and a little either side, take the nearest)
    let z = null;
    for (const dx of [0, -w * 0.4, w * 0.4]) {
      ray.set(new THREE.Vector3(dx, y, dir * (L / 2 + 2)), new THREE.Vector3(0, 0, -dir));
      const hit = ray.intersectObjects(meshes, false)[0];
      if (hit && (z === null || hit.point.z * dir > z * dir)) z = hit.point.z;
    }
    if (z === null) continue;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(0, y, z + dir * 0.015); m.rotation.y = dir > 0 ? 0 : Math.PI;
    m.name = 'plate_desy'; car.add(m);
  }
}

export async function loadAssets(onProgress) {
  const loader = new GLTFLoader();
  const roots = {};
  const cars = {};
  let done = 0;
  const props = {}, clips = {};
  const total = FILES.length + Object.keys(PACKS).length + Object.keys(CARS_CFG).length + Object.keys(PROPS_CFG).length;
  await Promise.all(Object.entries(PROPS_CFG).map(async ([k, c]) => {
    try { const g = await loader.loadAsync(`assets/${c.file}`); props[k] = prepareProp(g.scene, c); if (c.anim) clips[k] = g.animations; }
    catch (e) { console.warn('[ameyoru] prop failed', k, e); }
    onProgress?.(++done / total);
  }));
  await Promise.all(Object.entries(CARS_CFG).map(async ([k, c]) => {
    try { cars[k] = prepareCar((await loader.loadAsync(`assets/${c.file}`)).scene, c); addPlates(cars[k], k); }
    catch (e) { console.warn('[ameyoru] car failed', k, e); }
    onProgress?.(++done / total);
  }));
  await Promise.all(FILES.map(async (f) => {
    try {
      roots[f] = (await loader.loadAsync(`assets/${f}/${f}_1k.gltf`)).scene;
    } catch (e) {
      console.warn('[ameyoru] asset failed', f, e);
    }
    onProgress?.(++done / total);
  }));
  await Promise.all(Object.entries(PACKS).map(async ([k, f]) => {
    try { roots[k] = (await loader.loadAsync(`assets/${f}`)).scene; } catch (e) { console.warn('[ameyoru] pack failed', k, e); }
    onProgress?.(++done / total);
  }));
  const a = new Assets(roots);
  a.cars = cars;
  a.props = props;
  // a placed copy of a prop (geometry and materials shared); null when it didn't load
  a.prop = (k) => {
    const src = props[k]; if (!src) return null;
    if (!clips[k]) return src.clone(true);
    const c = skeletonClone(src); c.clips = clips[k]; return c;   // own skeleton per copy, and its animations
  };
  return a;
}

// Wraps a car scene so its length runs along Z, it sits on y = 0, is centred, and is real size.
// Glass loses its (expensive) transmission and becomes a tinted, reflective transparent surface.
export function prepareCar(scene, { length, flip = false, lift = 0, wheels = null, ownWheel = null, rig = {}, kind = 'car', yaw = 0, drop = null }) {
  // some files sit at an angle or carry a ground plate of their own
  // the precise box for the new models: their files nest rotated nodes, and the quick box swells to one side
  const precise = !!yaw || kind !== 'car';
  if (drop) { const out = []; scene.traverse((o) => { if (o.isMesh && drop.test(o.material.name)) out.push(o); }); out.forEach((o) => o.removeFromParent()); }
  if (yaw) { const g = new THREE.Group(); g.rotation.y = yaw; g.add(scene); scene = g; }
  scene.updateMatrixWorld(true);
  // one wheel at the origin (tyre, rim, trim): lift it out and copy it to the four corners (left ones turned round)
  const madeOwn = [];
  if (ownWheel) {
    const parts = [];
    scene.traverse((o) => { if (o.isMesh) { const b = new THREE.Box3().setFromObject(o), c = b.getCenter(new THREE.Vector3()); if (c.length() < 0.05 && b.getSize(new THREE.Vector3()).length() < 1.2) parts.push(o); } });
    const tpl = new THREE.Group(); parts.forEach((o) => tpl.attach(o));
    for (const z of ownWheel.z) for (const sx of [-1, 1]) {
      const w = tpl.clone(); w.position.set(sx * ownWheel.x, ownWheel.y, z); if (sx < 0) w.rotation.y = Math.PI;
      w.userData.rigWheel = true; scene.add(w); madeOwn.push(w);
    }
    scene.updateMatrixWorld(true);
  }
  // drop ground/shadow catcher planes first — they are wider and longer than the car and would skew its size
  const all = new THREE.Box3().setFromObject(scene, precise), allSize = all.getSize(new THREE.Vector3());
  const span = Math.max(allSize.x, allSize.z), junk = [];
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const b = new THREE.Box3().setFromObject(o), sz = b.getSize(new THREE.Vector3());
    const flat = sz.y < span * 0.003 && sz.x > span * 0.3 && sz.z > span * 0.3;
    if (flat || /shadow/i.test(o.material.name)) junk.push(o);
  });
  junk.forEach((o) => o.removeFromParent());
  scene.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(scene, precise);
  let size = box.getSize(new THREE.Vector3());
  const inner = new THREE.Group();
  inner.add(scene);
  if (size.x > size.z) inner.rotation.y = Math.PI / 2;
  if (flip) inner.rotation.y += Math.PI;
  inner.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(inner, precise);
  size = box.getSize(new THREE.Vector3());
  const k = length / size.z;
  inner.scale.setScalar(k);
  inner.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(inner, precise);
  const c = box.getCenter(new THREE.Vector3());
  inner.position.set(-c.x, -box.min.y + lift, -c.z);
  const root = new THREE.Group(); root.userData.dynamic = true; // cars drive, their wheels and doors move
  root.add(inner);
  root.userData.kind = kind;
  if (madeOwn.length) { root.updateMatrixWorld(true); madeOwn.forEach((w) => root.attach(w)); }
  if (wheels) {
    for (const az of [wheels.wb / 2 + wheels.axle, -wheels.wb / 2 + wheels.axle]) for (const sx of [-1, 1]) {
      const w = wheel(wheels.r, 0.18);
      w.position.set(sx * wheels.track / 2, wheels.r, az);
      w.userData.rigWheel = true;
      root.add(w);
    }
  }
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    const m = o.material;
    if (m.transmission > 0 || /glass|window/i.test(m.name)) {
      o.material = m.clone();
      Object.assign(o.material, { transmission: 0, transparent: true, opacity: 0.35, roughness: 0.04, metalness: 0.6, depthWrite: false });
      o.renderOrder = 6;
    } else if (/light|lamp|brake|blinker|reverse|beam|signal|indicator|chmsl/i.test(m.name)) {
      // lamps glow with their own texture colours (white heads, red tails) when switched on
      o.material = m.clone();
      o.material.emissive = new THREE.Color(1, 1, 1);
      o.material.emissiveMap = m.map || null;
      o.material.emissiveIntensity = 0;
      o.userData.lamp = true;
    }
  });
  const fb = new THREE.Box3().setFromObject(root, precise);
  root.userData.size = fb.getSize(new THREE.Vector3());
  // separate wheels (steer + spin) and a driver's door on a hinge
  const centres = wheels ? [-1, 1].flatMap((sz) => [-1, 1].map((sx) => ({ x: sx * wheels.track / 2, z: sz * wheels.wb / 2 + wheels.axle })))
    : madeOwn.length ? madeOwn.map((w) => ({ x: w.position.x, z: w.position.z })) : null;
  try { rigCar(root, { ...rig, centres }); } catch (e) { console.warn('[ameyoru] car rig failed', e); }
  return root;
}

// A placed copy of a prepared car with its own lamp materials, so each car can switch lights.
// a soft dark patch under each car so it sits on the wet road instead of floating over its reflection
let shadowTex = null;
function contactShadow() {
  if (!shadowTex) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 4, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    shadowTex = new THREE.CanvasTexture(c);
  }
  return new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, color: 0x000000, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
}
export function spawnCar(template, scene) {
  const car = template.clone(true);
  const size0 = template.userData.size;
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(size0.x * 1.15, size0.z * 1.05), contactShadow());
  sh.rotation.x = -Math.PI / 2; sh.position.y = 0.012; sh.renderOrder = 1; car.add(sh);
  const lamps = [];
  car.traverse((o) => { if (o.isMesh && o.userData.lamp) { o.material = o.material.clone(); lamps.push(o.material); } });
  const size = template.userData.size;
  car.userData = { dynamic: true, real: true, kind: template.userData.kind, size, L: size.z, W: size.x, setLights: (k) => lamps.forEach((m) => { m.emissiveIntensity = k; }), rig: findRig(car), rigInfo: template.userData.rigInfo };
  scene.add(car);
  return car;
}

class Assets {
  constructor(roots) { this.roots = roots; this.cache = new Map(); }

  // Bakes the named nodes into geometry, re-centred so the bounding box sits on the origin (bottom-centre).
  part(file, nodes) {
    const key = file + ':' + nodes.join(',');
    if (this.cache.has(key)) return this.cache.get(key);
    const root = this.roots[file];
    if (!root) return null;
    root.updateMatrixWorld(true);
    const pieces = [];
    const box = new THREE.Box3();
    // ['*']: every mesh in the file
    for (const name of nodes) {
      const node = name === '*' ? root : root.getObjectByName(name);
      if (!node) continue;
      node.traverse((o) => {
        if (!o.isMesh) return;
        const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
        g.computeBoundingBox(); box.union(g.boundingBox);
        pieces.push({ geometry: g, material: o.material });
      });
    }
    const c = box.getCenter(new THREE.Vector3());
    for (const p of pieces) p.geometry.translate(-c.x, -box.min.y, -c.z);
    const res = { pieces, size: box.getSize(new THREE.Vector3()) };
    this.cache.set(key, res);
    return res;
  }

  // transforms: [{ x, y, z, ry = 0, rx = 0, s = 1, sy }]
  place(scene, file, nodes, transforms, { shadow = true } = {}) {
    const part = this.part(file, nodes);
    if (!part || !transforms.length) return [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
    // one instanced mesh per 32 m cell: the camera, the shadow lights and the distance culling (world.js) then
    // skip whole cells that are out of view or far off, instead of drawing every copy in town every pass
    const cells = new Map();
    for (const t of transforms) {
      const key = `${Math.floor(t.x / 32)},${Math.floor(t.z / 32)}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(t);
    }
    const out = [];
    for (const list of cells.values()) {
      for (const { geometry, material } of part.pieces) {
        const im = new THREE.InstancedMesh(geometry, material, list.length);
        list.forEach((t, i) => {
          e.set(t.rx || 0, t.ry || 0, t.rz || 0);
          q.setFromEuler(e);
          const k = t.s ?? 1;
          m4.compose(p.set(t.x, t.y, t.z), q, s.set(k, t.sy ?? k, k));
          im.setMatrixAt(i, m4);
        });
        im.computeBoundingSphere();
        im.castShadow = shadow; im.receiveShadow = true;
        scene.add(im);
        out.push(im);
      }
    }
    return out;
  }
}
