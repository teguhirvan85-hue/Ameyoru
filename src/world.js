// The street of Hoshimi: road, pavements, shop rows, lamps and wires, the railway crossing and the night train,
// plus the details that make it feel lived in. buildWorld() builds it all and returns the handles main.js uses.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';
import * as D from './details.js';
import { makeDeck, buildShop, DEEP_SHOPS, SHOP_H, SHOP_DEPTH } from './shops.js';
import { instLit } from './interiors.js';
import { ROOMS, Doors, roomAt } from './rooms.js';
import { buildPockets } from './pockets.js';
import { buildTsukino } from './tsukino.js';
import { buildDistrict, WALK, RAISED, FLOORS, SLOPES, DRIVE, bridgeY, YOKO, PARK, VIADUCT, SOUTH_FRONTS } from './district.js';
import { spawnCar } from './assets.js';
import { buildTrain, buildCatenary } from './train.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { dressRoom, place, cullPlaced, PLACED } from './furnish.js';
import { makeFreezer } from './freeze.js';
import { buildNeon } from './neon.js';
import { buildTruck, buildVan } from './trucks.js';
import { mergeVehicle, freeAfterUpload } from './vehmerge.js';
import { dressVehicle } from './realveh.js';
import { buildCar } from './cars.js';
import { buildNorth } from './north.js';
import { makeFacades } from './facades.js';
import { buildStreetLife } from './streetlife.js';
import { DESY } from './desy.js';

export const JP_TEXT = '星見通り居酒屋ラーメン薬局喫茶床屋カラオケ焼鳥書店古着質屋ほしマートゲームセンタールミナリズム祭止まれあったか〜い雨夜｜酒空車';

const ROAD = 4, LINE = 7, ZMAX = 44, ZMIN = -140, ZFAR = -240; // shops run to ZMIN; the road goes on under the viaduct to ZFAR
const LEN = ZMAX - ZFAR, ZC = (ZMAX + ZFAR) / 2;
const CROSS_Z = -66;
// the ring: two back streets parallel to the main one, joined by the north cross street and a south cross street,
// so you can drive all the way round the town. Back streets sit between the viaduct's pillars (x = 44 and 58).
export const RING = { bx: 51, half: 3.5, walk: 2.5, south: -200, sHalf: 4 };
const SW_END = 36; // the cross street (T-junction) runs from here to ZMAX
const SW_SOUTH = RING.south + RING.sHalf + RING.walk; // the main street's pavements end at the south cross street
const SWL = SW_END - SW_SOUTH, SWC = (SW_END + SW_SOUTH) / 2;

// where you can walk: the street plus the plazas, the alley and the park (see district.js)
export const BOUNDS = WALK;
// ground height at x, z: the highest surface at or just below y (the walker's current height), so you can be
// on the bridge, the platform or a rooftop, or underneath them. Rain asks without y and gets the top surface.
export function groundY(x, z = 0, y = Infinity) {
  let g = z < SW_END && z > SW_SOUTH && Math.abs(x) > 4.05 && Math.abs(x) < 7.05 ? 0.15 : 0;
  for (const r of RAISED) if (x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ) { g = r.y ?? 0.15; break; }
  const lim = y + 0.6;
  let best = g <= lim ? g : -Infinity;
  const b = bridgeY(x, z);
  if (b !== null && b <= lim && b > best) best = b;
  for (const f of FLOORS) if (f.y <= lim && f.y > best && x > f.minX && x < f.maxX && z > f.minZ && z < f.maxZ) best = f.y;
  for (const r of SLOPES) if (x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ) { const sy = r.y(x, z); if (sy <= lim && sy > best) best = sy; }
  return best === -Infinity ? g : best;
}

const SHOPS = [
  ['居酒屋', '#7a1f1f', '#ffe9c9'], ['ラーメン', '#d9381e', '#fff4dc'], ['薬局', '#1d6fd1', '#ffffff'],
  ['喫茶', '#3b2a1e', '#ffd7a1'], ['床屋', '#f2f2f2', '#c4182b'], ['カラオケ', '#6a1fb3', '#ffe76b'],
  ['焼鳥', '#1f1a14', '#ffb45a'], ['書店', '#0f5b3a', '#f4ffe9'], ['古着', '#232323', '#9df0ff'], ['質屋', '#0e2b5c', '#ffe17a'],
];
const WALLS = ['#5d6470', '#6b6e75', '#8a7f72', '#4c5058', '#7d756b', '#596068', '#9a9488', '#3f444c'];

// Pieces of static detail (box, lathe, tube, rounded box…: { g: geometry, m: where it goes, or null when the
// geometry is already in place) written into one indexed position/normal/uv geometry. Its arrays are let go once
// it's on the GPU.
function packMerge(items) {
  let nv = 0, ni = 0;
  for (const { g } of items) { const n = g.attributes.position.count; nv += n; ni += g.index ? g.index.count : n; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  const v = new THREE.Vector3(), nm = new THREE.Matrix3();
  let base = 0, io = 0;
  for (const { g, m } of items) {
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, n = P.count;
    if (m) nm.getNormalMatrix(m);
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(P, i); if (m) v.applyMatrix4(m); pos[(base + i) * 3] = v.x; pos[(base + i) * 3 + 1] = v.y; pos[(base + i) * 3 + 2] = v.z;
      if (N) { v.fromBufferAttribute(N, i); if (m) v.applyMatrix3(nm).normalize(); nor[(base + i) * 3] = v.x; nor[(base + i) * 3 + 1] = v.y; nor[(base + i) * 3 + 2] = v.z; }
      if (U) { uv[(base + i) * 2] = U.getX(i); uv[(base + i) * 2 + 1] = U.getY(i); }
    }
    const flip = m && m.determinant() < 0;
    if (g.index) {
      const I = g.index;
      for (let k = 0; k < I.count; k += 3) {
        const a = I.getX(k), b = I.getX(k + 1), c = I.getX(k + 2);
        idx[io++] = base + a; idx[io++] = base + (flip ? c : b); idx[io++] = base + (flip ? b : c);
      }
    } else {
      for (let k = 0; k + 2 < n; k += 3) { idx[io++] = base + k; idx[io++] = base + (flip ? k + 2 : k + 1); idx[io++] = base + (flip ? k + 1 : k + 2); }
    }
    base += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(io === idx.length ? idx : idx.subarray(0, io), 1));
  out.computeBoundingSphere(); out.computeBoundingBox();
  freeAfterUpload(out);
  return out;
}

export function buildWorld(scene, renderer, assets) {
  const rnd = TX.mulberry32(20261012);
  const colliders = [], blockers = [], interactables = [], updaters = [], flicker = [];
  // rain: surfaces drops land on, and edges water drips from (consumed by rain.js)
  const rainSurfaces = [], rainEdges = [];
  // Poly Haven props are collected here and placed as instanced meshes at the end
  const props = { ac: [], pipe: [], funnel: [], shutter: [], shutterG: [], secLight: [], util: [], trash: [], manhole: [] };
  const sound = { bell: false, bellPos: new THREE.Vector3(0, 2, CROSS_Z), trainDist: 999 };

  // ---------- helpers ----------
  const mesh = (geo, mat, x = 0, y = 0, z = 0, parent = scene) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m;
  };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const collide = (x0, x1, z0, z1, active) =>
    colliders.push({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1), active });
  // things the camera mustn't pass through that aren't solid meshes of their own (poles, pillars: merged batches)
  const camObs = [];
  const camPole = (x, z, r, h, y0 = 0) => camObs.push({ minX: x - r, maxX: x + r, minY: y0, maxY: h, minZ: z - r, maxZ: z + r });
  const basic = (map, k = 1.4) => new THREE.MeshBasicMaterial({ map, color: new THREE.Color(k, k, k) });
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });
  const flat = (w, d, x, z, mat, y = 0.012) => {
    const m = mesh(new THREE.PlaneGeometry(w, d), mat, x, y, z); m.rotation.x = -Math.PI / 2; return m;
  };
  const rod = (a, b, r, mat, parent = scene) => {
    const d = new THREE.Vector3().subVectors(b, a), len = d.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), mat);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    parent.add(m); return m;
  };
  const glowTex = TX.glow();
  const glowPool = (x, y, z, w, d, color, k) => {
    const m = flat(w, d, x, z, new THREE.MeshBasicMaterial({
      map: glowTex, color: new THREE.Color(color).multiplyScalar(k),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }), y);
    m.renderOrder = 2; return m;
  };
  const dark = std(0x16181c, { roughness: 0.6 });

  // static detail geometry is merged per material to keep draw calls low. Each piece is only noted down (its
  // geometry and where it goes); packMerge() writes them all straight into one buffer per material and cell at the
  // end — no copy of every little box in between (that used to cost the build ~750 MB of memory at its peak).
  const batches = new Map();
  const batch = (geo, mat, x, y, z, ry = 0) => {
    if (!batches.has(mat)) batches.set(mat, []);
    batches.get(mat).push({ g: geo, m: new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z) });
  };
  // a piece already in place (world coordinates)
  const batchRaw = (geo, mat) => { if (!batches.has(mat)) batches.set(mat, []); batches.get(mat).push({ g: geo, m: null }); };

  // photo-scanned PBR surfaces when available (assets.surfaces), plain materials otherwise
  const SF = assets?.surfaces;
  const surf = (name, u, v, o = {}) => (SF ? SF.mat(name, u, v, o) : std(o.color ?? 0x888888, { roughness: 0.8 }));
  const fx = {}; // hooks main.js fills in (e.g. fx.splash from the rain)
  const hooks = fx; // the same, for code where a local `fx` (a facade's x) hides it
  // daylight 0 (night) → 1 (early morning): the sky, ambient light, and street lamps switching off
  let lampsOn = 1;
  // places where a person stands or sits (npcs.js puts real characters there)
  const npcSlots = [];
  const reflectSkipLater = []; // filled before the reflector exists (see reflectSkip)
  // room light: colour and strength of its ceiling fixtures
  const ROOM_LIGHT = { konbini: [0xf2f6ff, 5], laundry: [0xeef4ff, 4], station: [0xf0f4ff, 7], izakaya: [0xffc07a, 7], ramen: [0xffe6c4, 5], kissa: [0xffb26a, 6], karaoke: [0xd9b8ff, 6], arcade: [0xe8d8ff, 7], gacha: [0xfff0f6, 5], pachinko: [0xfff4e0, 7], quiet: [0xfff0dc, 4] };
  let inRoom = null;
  const lampHeads = [];
  // the sun: a directional light that follows you so its shadow box stays small; it takes over shadows by day
  const sun = new THREE.DirectionalLight(0xfff4e4, 0);
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, near: 1, far: 140 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  let shadowsAllowed = true, dayK = 0;
  const facadeMats = [], lampFx = [], DAY_GREY = new THREE.Color(0xb8bcc4);
  const updateShadows = () => {
    // inside a room its own ceiling light casts the shadows, day or night
    const sunOn = shadowsAllowed && dayK > 0.45 && !inRoom, lampOn = shadowsAllowed && (!sunOn || !!inRoom);
    if (sun.castShadow !== sunOn) sun.castShadow = sunOn;
    if (shadowLampRef && shadowLampRef.castShadow !== lampOn) shadowLampRef.castShadow = lampOn;
  };
  let shadowLampRef = null;
  updaters.push((t, dt, p) => { sun.target.position.set(p.x, 0, p.z); });
  const sunDir = new THREE.Vector3(0.3, 0.6, 0.4).normalize();
  updaters.push((t, dt, p) => { sun.position.set(p.x + sunDir.x * 90, Math.max(8, sunDir.y * 90), p.z + sunDir.z * 90); });
  function setDaylight(k, warm = 0, clear = 0, sd = null) {
    dayK = k;
    if (sd) { sunDir.copy(sd); skyMat.uniforms.sunDir.value.copy(sd); }
    skyMat.uniforms.dawn.value = k; skyMat.uniforms.warm.value = warm; skyMat.uniforms.clear.value = clear;
    hemi.intensity = 0.32 + k * 1.5; hemi.color.setRGB(0.17 + k * 0.5, 0.24 + k * 0.5, 0.43 + k * 0.42);
    hemi.groundColor.setRGB(0.04 + k * 0.2, 0.04 + k * 0.18, 0.07 + k * 0.16);
    moon.intensity = 0.25 * (1 - k);
    sun.intensity = k * 2.3; sun.color.setRGB(1, 0.95 - warm * 0.25, 0.88 - warm * 0.4);
    scene.environmentIntensity = (SF?.env ? 0.4 : 0.55) + k * 0.8;
    lampsOn = 1 - THREE.MathUtils.smoothstep(k, 0.55, 0.85);
    for (const [m, c] of lampHeads) m.color.setRGB(c[0] * (0.1 + 0.9 * lampsOn), c[1] * (0.1 + 0.9 * lampsOn), c[2] * (0.1 + 0.9 * lampsOn));
    for (const o of [farLine, nearLine]) o.material.color.setScalar(0.7 + k * 0.6);
    // lit windows matter less in daylight; distant towers fade into the haze
    if (winMat) winMat.emissiveIntensity = 0.95 - 0.6 * k;
    for (const L of lampFx) {
      L.gp.visible = L.cone.visible = lampsOn > 0.05;
      if (!L.broken) { L.gp.material.color.copy(L.gpBase).multiplyScalar(lampsOn); L.cone.material.uniforms.strength.value = L.coneBase * lampsOn; }
    }
    for (const [m, e0, c0] of facadeMats) { m.emissiveIntensity = e0 * (1 - 0.8 * k); m.color.copy(c0).lerp(DAY_GREY, 0.45 * k); }
    for (const o of [farLine, nearLine]) { o.material.opacity = 1 - 0.55 * k; }
    updateShadows();
  }
  function setShadows(on) { shadowsAllowed = on; updateShadows(); }
  const doors = new Doors({ scene, colliders, interactables });
  // a room you can walk into: registers where you can stand, the floor height and what the HUD/sound should say.
  // conn: extra walkable rectangles (doorways) joining it to the street
  function addRoom({ name, jp, minX, maxX, minZ, maxZ, y = 0.15, ceil = 2.94, amb = 'quiet', conn = [], camDist = 2.2, floor = true }) {
    const r = { name, jp, minX, maxX, minZ, maxZ, y, ceil, amb, camDist };
    ROOMS.push(r);
    // ceiling fixtures: real lights that take over while you're inside (colour and strength by the kind of room)
    if (amb !== 'shotengai') {
      const [c, k] = ROOM_LIGHT[amb] || ROOM_LIGHT.quiet, w = maxX - minX, d = maxZ - minZ;
      const nx = Math.min(3, Math.max(1, Math.round(w / 2.8))), nz = Math.min(3, Math.max(1, Math.round(d / 2.8)));
      r.fixtures = [];
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) r.fixtures.push(spot(minX + (i + 0.5) * w / nx, ceil - 0.15, minZ + (j + 0.5) * d / nz, { c, k, d: 8 }));
    }
    const yr = { minY: y - 1, maxY: y + 2 };
    WALK.push({ minX: minX + 0.05, maxX: maxX - 0.05, minZ: minZ + 0.05, maxZ: maxZ - 0.05, ...yr });
    for (const c of conn) WALK.push({ ...c, ...yr });
    if (floor) (y < 0.5 ? RAISED : FLOORS).push({ minX, maxX, minZ, maxZ, y });
    return r;
  }
  const drivable = []; // parked cars you can get into
  const ctx = { scene, rnd, std, basic, collide, camPole, batchRaw, fx, drivable, colliders, glowPool, interactables, updaters, sound, cars: assets?.cars, rainSurfaces, rainEdges };

  // ---------- light & sky ----------
  const hemi = new THREE.HemisphereLight(0x2c3c6e, 0x0a0a12, 0.32); scene.add(hemi);
  scene.environment = SF?.env || nightEnvironment(renderer);
  scene.environmentIntensity = SF?.env ? 0.4 : 0.55;
  const moon = new THREE.DirectionalLight(0x8fa8ff, 0.25); moon.position.set(-20, 40, 10); scene.add(moon);

  // night sky: low rain clouds drifting, lit orange from below by the city
  const skyMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, dawn: { value: 0 }, warm: { value: 0 }, clear: { value: 0 }, sunDir: { value: new THREE.Vector3(0.3, 0.5, 0.4).normalize() } },
    // vDir: from the dome's centre (the clouds); vView: from the camera itself (Desy's star stays put when you climb)
    vertexShader: 'varying vec3 vDir; varying vec3 vView; void main() { vDir = position; vView = (modelMatrix * vec4(position, 1.0)).xyz - cameraPosition; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform float time; uniform float dawn; uniform float warm; uniform float clear; uniform vec3 sunDir; varying vec3 vDir; varying vec3 vView;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
      float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
      void main() {
        vec3 d = normalize(vDir); float h = d.y;
        vec3 col = mix(vec3(0.11, 0.08, 0.075), vec3(0.006, 0.008, 0.017), smoothstep(0.0, 0.5, h));
        if (h > -0.05) {
          vec2 uv = d.xz / (max(h, 0.02) + 0.25) * 0.8 + vec2(time * 0.012, time * 0.005);
          float c = smoothstep(0.42, 0.8, fbm(uv));
          vec3 cloud = mix(vec3(0.17, 0.115, 0.1), vec3(0.03, 0.035, 0.05), smoothstep(0.0, 0.35, h));
          col = mix(col, cloud, c * 0.9 * smoothstep(-0.05, 0.08, h));
          // a clear night: stars between the clouds
          vec2 sc = floor(d.xz / (h + 0.3) * 260.0);
          float st = step(0.9965, hash(sc)) * smoothstep(0.08, 0.35, h) * (1.0 - c);
          col += vec3(0.85, 0.9, 1.0) * st * (0.5 + 0.5 * sin(time * 2.0 + hash(sc + 3.1) * 30.0)) * clear * (1.0 - dawn);
        }
        if (h < 0.0) col = mix(col, vec3(0.03, 0.03, 0.04), smoothstep(0.0, -0.2, h));
        // daylight: a washed blue-grey sky after the rain with pale clouds; sunrise/sunset warms the horizon
        vec3 day = mix(vec3(0.74, 0.77, 0.82), vec3(0.42, 0.55, 0.74), smoothstep(-0.02, 0.5, h));
        day = mix(day, mix(vec3(1.0, 0.62, 0.42), vec3(0.55, 0.45, 0.62), smoothstep(0.0, 0.35, h)), warm * (1.0 - smoothstep(0.1, 0.7, h)));
        if (h > -0.05) {
          float cl = smoothstep(0.42, 0.8, fbm(d.xz / (max(h, 0.02) + 0.25) * 0.8 + vec2(time * 0.012, time * 0.005)));
          day = mix(day, mix(vec3(0.86, 0.87, 0.9), vec3(1.0, 0.78, 0.62), warm * 0.7), cl * 0.75);
        }
        col = mix(col, day, dawn);
        // the sun by day (a disc and its glow, dimmed by cloud), the moon by night
        float sd = max(dot(d, sunDir), 0.0);
        col += mix(vec3(1.0, 0.95, 0.85), vec3(1.0, 0.62, 0.35), warm) * (smoothstep(0.9992, 0.9996, sd) * 4.0 + pow(sd, 10.0) * 0.3) * dawn * (0.3 + 0.7 * clear);
        float md = max(dot(d, normalize(vec3(-0.45, 0.5, -0.74))), 0.0);
        col += vec3(0.85, 0.88, 0.95) * (smoothstep(0.99955, 0.9998, md) * 1.6 + pow(md, 80.0) * 0.12) * (1.0 - dawn) * (0.15 + 0.85 * clear);
        // Desy's star, out over the bay to the east: the one that still shows through the rain clouds (Desy mode)
        ${DESY ? `float ds = max(dot(normalize(vView), normalize(vec3(0.8, 0.55, 0.27))), 0.0);
        float tw = 0.82 + 0.18 * sin(time * 2.7) * sin(time * 1.3 + 1.0);
        col += (vec3(1.0, 0.86, 0.93) * smoothstep(0.99994, 0.99999, ds) * 2.2 + vec3(1.0, 0.5, 0.75) * (pow(ds, 3000.0) * 0.9 + pow(ds, 220.0) * 0.08)) * tw * (1.0 - dawn) * (0.45 + 0.55 * clear);` : ''}
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const sky = mesh(new THREE.SphereGeometry(320, 32, 16), skyMat);
  sky.userData.dynamic = true; // it follows you
  sky.renderOrder = -10;
  // distant skyline in two layers, plus a band of city-glow haze along the horizon
  const skylineTex = (seed, tall, tower) => TX.canvasTex(1024, 256, (g, w, h) => {
    const r = TX.mulberry32(seed);
    g.clearRect(0, 0, w, h);
    for (let x = 0; x < w;) {
      const bw = 12 + r() * 40, bh = 40 + Math.pow(r(), 1.5) * tall;
      g.fillStyle = `rgb(${16 + r() * 10},${18 + r() * 10},${27 + r() * 12})`; g.fillRect(x, h - bh, bw, bh);
      for (let wy = h - bh + 5; wy < h - 4; wy += 6) for (let wx = x + 2; wx < x + bw - 2; wx += 5) {
        if (r() < 0.3) { g.fillStyle = r() < 0.7 ? 'rgba(255,205,140,0.95)' : 'rgba(190,215,255,0.9)'; g.fillRect(wx, wy, 3, 3); }
      }
      if (bh > tall * 0.7 && r() < 0.6) { g.fillStyle = '#ff3a2a'; g.fillRect(x + bw / 2 - 1.5, h - bh - 4, 3, 3); }
      x += bw + r() * 6;
    }
    if (tower) {
      const tx = w * 0.62, base = h, top = h - 245;
      g.strokeStyle = 'rgba(255,150,70,0.95)'; g.lineWidth = 2;
      for (let k = 0; k <= 10; k++) { const y = base - (base - top) * (k / 10), half = 34 * (1 - k / 10) + 2; g.beginPath(); g.moveTo(tx - half, y); g.lineTo(tx + half, y); g.stroke(); }
      g.beginPath(); g.moveTo(tx - 36, base); g.lineTo(tx, top); g.lineTo(tx + 36, base); g.stroke();
      g.beginPath(); g.moveTo(tx - 36, base); g.lineTo(tx + 20, base - 80); g.moveTo(tx + 36, base); g.lineTo(tx - 20, base - 80); g.stroke();
      g.fillStyle = 'rgba(255,240,220,1)'; g.fillRect(tx - 10, base - 120, 20, 6); g.fillRect(tx - 6, base - 180, 12, 5);
    }
  }, { repeat: true });
  const band = (r, hgt, seed, tall, tower, tint, order) => {
    const t = skylineTex(seed, tall, tower); t.repeat.set(4, 1);
    const m = mesh(new THREE.CylinderGeometry(r, r, hgt, 64, 1, true), new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.BackSide, fog: false, depthWrite: false, color: tint }), 0, hgt / 2 - 8, 0);
    m.renderOrder = order; return m;
  };
  const farLine = band(290, 150, 11, 210, false, new THREE.Color(0.7, 0.7, 0.8), -9);
  farLine.userData.dynamic = true;
  const nearLine = band(230, 120, 23, 190, true, new THREE.Color(1, 0.97, 1), -8);
  nearLine.userData.dynamic = true;
  const hazeTex = TX.canvasTex(4, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,170,110,0)'); gr.addColorStop(0.75, 'rgba(255,170,110,0.35)'); gr.addColorStop(1, 'rgba(255,170,110,0.05)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const haze = mesh(new THREE.CylinderGeometry(200, 200, 40, 48, 1, true), new THREE.MeshBasicMaterial({ map: hazeTex, transparent: true, side: THREE.BackSide, fog: false, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(0.5, 0.36, 0.3) }), 0, 12, 0);
  haze.userData.dynamic = true; // it follows you
  haze.renderOrder = -7;
  updaters.push((t, dt, p) => {
    skyMat.uniforms.time.value = t;
    for (const o of [sky, farLine, nearLine, haze]) { o.position.x = p.x; o.position.z = p.z; }
  });

  flat(376, 342, -12, -127, std(0x0b0d12), -0.02);   // east edge at the harbour quay (x 176): the sea beyond   // to z 44: north of there is north.js's ground (with the canal cut out)

  // ---------- the wet street: one mirror image of the town, read by every road and pavement ----------
  // The Reflector renders the town mirrored in the ground plane into a texture each frame; it draws nothing
  // itself (no colour, no depth) and follows you, so it works on every street. The road and pavement materials
  // (markWet) read that image: a thin film of water everywhere — streaked down the screen like the long smears
  // under neon — and a sharp mirror in the puddles; stronger at a glancing angle (Fresnel), rippled by the rain,
  // fading as the streets dry (setWet).
  const reflector = new Reflector(new THREE.PlaneGeometry(260, 260), {
    textureWidth: Math.round(innerWidth * 0.6) || 512, textureHeight: Math.round(innerHeight * 0.6) || 512,
    color: 0x767c8c, clipBias: 0.003,
  });
  reflector.rotation.x = -Math.PI / 2; reflector.position.set(0, 0, ZC);
  reflector.material.colorWrite = false; reflector.material.depthWrite = false; reflector.material.depthTest = false;
  reflector.renderOrder = -10; reflector.userData.dynamic = true;
  scene.add(reflector);
  updaters.push((t, dt, p) => { reflector.position.x = p.x; reflector.position.z = p.z; });
  // seamless puddle blobs in world space (one tile = 13 m)
  const puddleWorld = TX.canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = 'rgb(245,245,245)'; g.fillRect(0, 0, w, h);
    const pr = TX.mulberry32(707);
    for (let i = 0; i < 26; i++) {
      const x = pr() * w, y = pr() * h, rx = 14 + pr() * 60, ry = 14 + pr() * 70, a = pr() * Math.PI;
      for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
        gr.addColorStop(0, 'rgba(15,15,15,1)'); gr.addColorStop(0.65, 'rgba(40,40,40,0.9)'); gr.addColorStop(1, 'rgba(245,245,245,0)');
        g.save(); g.translate(x + ox, y + oy); g.rotate(a); g.scale(rx, ry); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, Math.PI * 2); g.fill(); g.restore();
      }
    }
  }, { srgb: false, repeat: true });
  const dryT = { value: -0.1 };
  const WET = {
    tRefl: { value: reflector.getRenderTarget().texture }, uReflMat: { value: reflector.material.uniforms.textureMatrix.value },
    // the mirror's matrix works on its own local positions: world → mirror-local first
    uReflInv: { value: new THREE.Matrix4() },
    uDryT: dryT, uWetK: { value: 1 }, uPud: { value: puddleWorld }, uTime: { value: 0 }, uOn: { value: 1 },
  };
  const blankTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); blankTex.needsUpdate = true;
  updaters.push((t) => { WET.uTime.value = t; });
  const wetMeshes = new Set();
  // strength: how much the surface shines when soaked (road 1, pavement tiles less)
  function markWet(mat, strength = 1) {
    if (!mat || mat.userData.wetPatched) return mat;
    mat.userData.wetPatched = true; mat.userData.mutable = true;
    const uS = { value: strength };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, WET, { uStrength: uS });
      sh.vertexShader = 'uniform mat4 uReflMat, uReflInv;\nvarying vec4 vReflUv;\nvarying vec3 vWetW;\n' + sh.vertexShader.replace('#include <project_vertex>',
        '#include <project_vertex>\n\tvec4 wetWP = modelMatrix * vec4( transformed, 1.0 );\n\tvWetW = wetWP.xyz;\n\tvReflUv = uReflMat * ( uReflInv * wetWP );');
      sh.fragmentShader = 'uniform sampler2D tRefl, uPud;\nuniform float uDryT, uWetK, uTime, uOn, uStrength;\nvarying vec4 vReflUv;\nvarying vec3 vWetW;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', `
        {
          float film = clamp(uWetK, 0.0, 1.0) * uOn;
          if (film > 0.001) {
            float pdep = 1.0 - texture2D(uPud, vWetW.xz / 13.0).g;
            // deep spots hold water as a mirror; the rest of the surface only has a film (puddles shrink as it dries)
            float puddle = smoothstep(uDryT + 0.28, uDryT + 0.5, pdep) * step(0.3, uStrength);
            float NdV = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
            float fres = 0.04 + 0.96 * pow(1.0 - NdV, 5.0);
            vec2 ruv = vReflUv.xy / vReflUv.w;
            // only the bumps of the surface shake the image (not the surface's own tilt)
            ruv += (normal - geometryNormal).xy * mix(0.05, 0.012, puddle);
            ruv += vec2(sin(vWetW.x * 3.1 + uTime * 2.3), cos(vWetW.z * 2.7 + uTime * 1.9)) * 0.0016;
            float spread = mix(0.0042, 0.0006, puddle);
            vec3 refl = vec3(0.0); float ws = 0.0;
            for (int i = -6; i <= 6; i++) {
              float fi = float(i); float w = exp(-fi * fi / 14.0);
              vec3 c = texture2D(tRefl, clamp(ruv + vec2(fi * spread * 0.1, fi * spread), 0.001, 0.999)).rgb;
              // the mirror image can hold NaN/inf pixels (half-float target): never let one through
              if (any(isnan(c)) || any(isinf(c))) { c = vec3(0.0); w *= 0.0; }
              refl += min(c, vec3(40.0)) * w; ws += w;
            }
            refl /= max(ws, 1e-4);
            float k = clamp((fres * 0.8 * uStrength + puddle * 0.72) * film, 0.0, 0.85);
            outgoingLight *= 1.0 - 0.28 * film * uStrength;
            outgoingLight = outgoingLight * (1.0 - k * 0.6) + refl * k;
          }
        }
        #include <opaque_fragment>`);
    };
    mat.needsUpdate = true;
    return mat;
  }

  const asphalt = TX.asphalt(); asphalt.repeat.set(2, LEN / 4);
  const puddles = TX.puddleAlpha(rnd); puddles.repeat.set(1, LEN / 14);
  const aNorm = TX.asphaltNormal(); aNorm.repeat.set(2, LEN / 4);
  let roadMat;
  if (SF?.has('asphalt_02')) {
    roadMat = SF.mat('asphalt_02', 2, LEN / 4, { wet: 0.5, color: 0x9a9ca2 }).clone();
  } else {
    roadMat = new THREE.MeshStandardMaterial({ map: asphalt, normalMap: aNorm, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.32, metalness: 0.15 });
  }
  void puddles;
  roadMat.userData.wetBase = 0.5;
  markWet(roadMat, 1);
  const road = flat(ROAD * 2, LEN, 0, ZC, roadMat, 0.004);
  road.receiveShadow = true;
  // patches, cracks and oil stains on top of the asphalt
  const wear = TX.roadWear(rnd); wear.repeat.set(1, LEN / 16);
  const wearPlane = flat(ROAD * 2, LEN, 0, ZC, new THREE.MeshStandardMaterial({ map: wear, transparent: true, depthWrite: false, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -1 }), 0.005);
  wearPlane.renderOrder = 1;
  // cross street at the north end
  const xAsph = TX.asphalt(); xAsph.repeat.set(30, 2);
  flat(140, 8, 0, 40, markWet(SF?.has('asphalt_02') ? SF.mat('asphalt_02', 35, 2, { wet: 0.5, color: 0x9a9ca2 }) : new THREE.MeshStandardMaterial({ map: xAsph, roughness: 0.3, metalness: 0.15 }), 1), 0.002).receiveShadow = true;

  // sidewalks, curbs, tactile strips
  const tiles = TX.sidewalk(); tiles.repeat.set(1, SWL / 3);
  const tNorm = TX.sidewalkNormal(); tNorm.repeat.set(1, SWL / 3);
  const tRough = TX.wetRoughness(rnd, 120); tRough.repeat.set(1, SWL / 9);
  const swMat = markWet(SF?.has('large_grey_tiles') ? SF.mat('large_grey_tiles', 1.5, SWL / 2, { wet: 0.7 })
    : new THREE.MeshStandardMaterial({ map: tiles, normalMap: tNorm, normalScale: new THREE.Vector2(0.5, 0.5), roughnessMap: tRough, roughness: 1, metalness: 0.08 }), 0.5);
  const curbMat = SF?.has('concrete_floor_02') ? SF.mat('concrete_floor_02', 0.25, SWL / 2, { wet: 0.7, color: 0xb0b2b6 }) : std(0x8d9097, { roughness: 0.5 });
  const tac = TX.tactile(); tac.repeat.set(1, SWL / 0.3);
  const tacMat = new THREE.MeshStandardMaterial({ map: tac, roughness: 0.5 });
  // water running along both gutters
  const flowTex = TX.canvasTex(64, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    // soft, wide streaks: thin 1-px lines alias into flicker once the texture is repeated along the street
    g.filter = 'blur(2px)';
    for (let i = 0; i < 26; i++) { const x = Math.random() * w, len = 40 + Math.random() * 90, y = Math.random() * h; g.fillStyle = `rgba(200,215,240,${0.12 + Math.random() * 0.25})`; g.fillRect(x, y, 4 + Math.random() * 6, len); }
    g.filter = 'none';
  }, { repeat: true });
  flowTex.repeat.set(1, SWL / 3);
  const flowMat = new THREE.MeshStandardMaterial({ map: flowTex, transparent: true, opacity: 0.55, depthWrite: false, roughness: 0.05, metalness: 0.4, color: 0x9db0c8 });
  for (const s2 of [-1, 1]) { const f = flat(0.2, SWL, s2 * 3.88, SWC, flowMat, 0.0075); f.renderOrder = 1; }
  updaters.push((t, dt) => { flowTex.offset.y -= dt * 0.45; });
  for (const s of [-1, 1]) {
    mesh(box(3, 0.15, SWL), swMat, s * 5.5, 0.075, SWC);
    // the curb sits 1 cm proud of the pavement block so their faces never share a plane (that z-fights and flickers)
    mesh(box(0.17, 0.165, SWL), curbMat, s * 4.075, 0.0825, SWC);
    flat(0.3, SWL, s * 4.75, SWC, tacMat, 0.152);
    // cross-street pavements
    const xa = RING.bx - RING.half - RING.walk, xb = RING.bx + RING.half + RING.walk;
    mesh(box(xa - 7, 0.15, 2), markWet(surf('large_grey_tiles', (xa - 7) / 2, 1, { wet: 0.7 }), 0.5), s * (7 + xa) / 2, 0.075, 37);
    mesh(box(70 - xb, 0.15, 2), markWet(surf('large_grey_tiles', (70 - xb) / 2, 1, { wet: 0.7 }), 0.5), s * (xb + 70) / 2, 0.075, 37);
  }
  // north pavement: broken where the back streets carry on north (north.js)
  for (const [a, b] of [[-70, -RING.bx - RING.half], [-RING.bx + RING.half, RING.bx - RING.half], [RING.bx + RING.half, 70]]) {
    mesh(box(b - a, 0.15, 2), markWet(surf('large_grey_tiles', (b - a) / 2, 1, { wet: 0.7 }), 0.5), (a + b) / 2, 0.075, 43);
  }

  // road markings
  const worn = TX.wornPaint();
  const paint = std(0xd8dce3, { roughness: 0.5, map: worn });
  const edgeWorn = worn.clone(); edgeWorn.repeat.set(1, SWL / 6); edgeWorn.needsUpdate = true;
  const edgePaint = std(0xd8dce3, { roughness: 0.5, map: edgeWorn });
  flat(0.15, SWL, -3.75, SWC, edgePaint); flat(0.15, SWL, 3.75, SWC, edgePaint);
  for (let z = SW_END - 3; z > SW_SOUTH + 2; z -= 6) {
    if ((z < 15 && z > 5) || Math.abs(z - CROSS_Z) < 6 || z > 28) continue;
    flat(0.12, 3, 0, z, paint);
  }
  for (let x = -3.15; x <= 3.2; x += 0.9) flat(0.45, 3.2, x, 10, paint);
  flat(3.6, 0.35, -1.95, 13.2, paint);
  flat(2.4, 5.2, -1.9, 18, new THREE.MeshStandardMaterial({ map: TX.roadText('止まれ'), transparent: true, roughness: 0.55 }));

  // ---------- buildings ----------
  const roofMat = std(0x24272d, { roughness: 0.9 });
  const tankMat = std(0x8f949b, { roughness: 0.6, metalness: 0.3 });
  const edgeMat = std(0x1a1a1a);

  function vSign(side, z, y, text, bg, fg, scale = 1) {
    const face = basic(TX.signV(text, bg, fg), 1.7);
    mesh(box(0.85 * scale, 2.6 * scale, 0.2), [edgeMat, edgeMat, edgeMat, edgeMat, face, face], side * (LINE - 0.5 * scale), y, z);
    mesh(box(0.6, 0.06, 0.06), edgeMat, side * (LINE - 0.3), y + 1.2 * scale, z);
    return face;
  }

  const pillarMat = std(0x3a3d42, { roughness: 0.6 });
  const shopGlass = new THREE.MeshStandardMaterial({ color: 0xcfe0f0, transparent: true, opacity: 0.16, roughness: 0.04, metalness: 0.9, depthWrite: false });
  const fasciaEdge = std(0x202226, { roughness: 0.5 });
  function awning(side, z0, z1, hex) {
    const w = z1 - z0, cz = (z0 + z1) / 2;
    const ag = new THREE.CylinderGeometry(1, 1, w - 0.8, 18, 1, true, 0, Math.PI / 2);
    ag.rotateX(-Math.PI / 2); ag.scale(1.05, 0.6, 1);
    if (side > 0) ag.rotateY(Math.PI);
    const t = TX.stripes(hex, '#e9e4d8', 6); t.repeat.set(1, w * 0.6); t.rotation = Math.PI / 4;
    const a = mesh(ag, new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, side: THREE.DoubleSide }), side * LINE, 2.92 - 0.6, cz);
    a.castShadow = true;
    rainEdges.push({ x: side * (LINE - 1.04), y: 2.31, z0: z0 + 0.45, z1: z1 - 0.45, rate: 4 });
    rainSurfaces.push({ x0: Math.min(side * LINE, side * (LINE - 1.05)), x1: Math.max(side * LINE, side * (LINE - 1.05)), z0: z0 + 0.4, z1: z1 - 0.4, y: 2.6, splash: true });
  }

  // every ground floor gets a shop type from a shuffled deck (see shops.js)
  const deal = makeDeck(rnd);
  let shopCtx = null;
  function storefront(side, z0, z1, type) {
    if (!shopCtx) {
      const tile = (c1, c2, n) => TX.canvasTex(128, 128, (g, w, h) => { g.fillStyle = c2; g.fillRect(0, 0, w, h); g.fillStyle = c1; const s2 = w / n; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) g.fillRect(x * s2 + 1, y * s2 + 1, s2 - 2, s2 - 2); }, { repeat: true });
      shopCtx = {
        scene, rnd, mesh, box, batch, basic, std, glowPool, collide, LINE, props, interactables, updaters, flicker, dark, vSign, awning, surf,
        frameMat, shopGlass, fasciaEdge, slab: slabMat, steel: steelMat,
        woodMat: std(0x5a3a22, { roughness: 0.6 }),
        strawMat: std(0xb89a5e, { roughness: 0.95 }),
        wireMat: new THREE.MeshStandardMaterial({ color: 0xc0c4ca, metalness: 0.8, roughness: 0.3, wireframe: true }),
        colorMats: [0xd33b2c, 0x2a7de1, 0xf2c400, 0x3aa65a, 0xffffff, 0xe67e22].map((c) => std(c, { roughness: 0.5 })),
        tileDark: new THREE.MeshStandardMaterial({ map: tile('#2a2530', '#16131a', 10), roughness: 0.5 }),
        cladding: SF ? [
          pillarMat,
          surf('tiled_floor_001', 0.25, 2, { color: 0xd8cfc4 }),
          surf('concrete_wall_003', 0.25, 1.2, { color: 0xb8b2a8 }),
          surf('metal_plate', 0.2, 1.2, { color: 0x9aa0a6 }),
          std(0x6b4a30, { roughness: 0.6 }),
        ] : [
          pillarMat,
          new THREE.MeshStandardMaterial({ map: tile('#8c8478', '#5e584f', 6), roughness: 0.55 }),
          new THREE.MeshStandardMaterial({ map: tile('#3c4a5a', '#232b35', 8), roughness: 0.4 }),
          std(0x6b4a30, { roughness: 0.6 }),
          std(0x9a9ea3, { roughness: 0.4, metalness: 0.5 }),
        ],
        lanterns: (side, cz, t) => D.lanterns(ctx, side, cz, t),
        steam: (x, y, z) => D.steam(ctx, x, y, z),
        bike: (x, z, c) => bike(x, z, c),
        light: (x, y, z, c, k, d) => lampSpots.push(spot(x, y, z, { c, k, d })),
        bulbs: (pts, cols, sp) => D.bulbChain(ctx, pts, cols, sp),
        person: (x, z, ry, c, y0, h, act) => person(x, z, ry, c, y0, h, act), npcSlots,
        canvasTex: TX.canvasTex,
        doors, addRoom, assets,
      };
    }
    shopCtx.roof = curRoof;
    buildShop(shopCtx, type, side, z0, z1);
    fronts.push({ alongZ: true, fixed: side * LINE, face: -side, a0: z0, a1: z1, kind: 'main', type });
  }

  const roofs = []; // apartment blocks whose roofs you can go up to
  const spans = []; // every detailed facade (neon.js hangs signs where two meet)
  let curRoof = null;
  // wall finishes: [surface, metres per texture repeat, tints]
  const FINISHES = [
    ['tiled_floor_001', 1.6, [0xffffff, 0xd8cfc4, 0xbfc4c8]],
    ['concrete_wall_003', 3, [0xffffff, 0xcfc8bd, 0xa9aeb4]],
    ['beige_wall_001', 2.5, [0xffffff, 0xe6dccb]],
    ['white_plaster_02', 2.5, [0xe8e6e0, 0xd2d6db, 0xe0d4c2]],
    ['painted_plaster_wall', 2.5, [0xffffff, 0xb9c4cf, 0xd9c7b0]],
  ];
  function building(side, z0, z1, h, opt = {}) {
    const w = z1 - z0, d = opt.depth ?? 8 + rnd() * 5, line = opt.line ?? LINE;
    const cx = side * (line + d / 2), cz = (z0 + z1) / 2;
    const wall = opt.wall ?? WALLS[Math.floor(rnd() * WALLS.length)];
    const cols = Math.max(2, Math.round(w / 2.4)), floors = Math.max(2, Math.floor(h / 3));
    const style = opt.style ?? (rnd() < 0.5 ? 'apt' : 'office');
    let mats, matsFor = null;
    if (SF) {
      const [name, tile, tints] = FINISHES[Math.floor(rnd() * FINISHES.length)];
      const tint = opt.wall ? new THREE.Color(opt.wall).getHex() : tints[Math.floor(rnd() * tints.length)];
      const roof = surf('concrete_floor_02', d / 3, w / 3, { color: 0x8a8d92, wet: 0.7 });
      matsFor = (dd, hh) => {
        const along = surf(name, w / tile, hh / tile, { color: tint, wet: 0.85 }), across = surf(name, dd / tile, hh / tile, { color: tint, wet: 0.85 });
        return [along, along, roof, roof, across, across];
      };
      mats = matsFor(d, h);
    } else {
      const tex = TX.windows(cols, floors, wall, rnd, style);
      const front = new THREE.MeshStandardMaterial({ map: tex.map, emissive: 0xffffff, emissiveMap: tex.emissiveMap, emissiveIntensity: 0.9, roughness: 0.8 });
      const plain = std(wall, { roughness: 0.9 });
      mats = [plain, plain, roofMat, roofMat, plain, plain];
      mats[side > 0 ? 1 : 0] = front;
    }
    // shops with a real room behind the glass: the block starts above the shop, and the ground floor is
    // only the space behind the room, so you can look several metres inside
    const type = opt.noFront ? null : (opt.type ?? deal(side, cz));
    const open = DEEP_SHOPS.has(type) ? SHOP_DEPTH : opt.open || 0;
    let m;
    if (open) {
      const up = matsFor ? matsFor(d, h - SHOP_H) : mats, rear = matsFor ? matsFor(d - open, SHOP_H) : mats;
      m = mesh(box(d, h - SHOP_H, w), up, cx, SHOP_H + (h - SHOP_H) / 2, cz);
      // the block behind starts 10 cm past the room's back wall: sharing that plane made the two surfaces fight (blocky flicker)
      blockers.push(mesh(box(d - open - 0.1, SHOP_H, w), rear, side * (line + open + 0.1 + (d - open - 0.1) / 2), SHOP_H / 2, cz));
      // the ground-floor room is open: block only the part behind it and its two side walls (the front comes with the door)
      collide(side * (line + open), side * (line + d), z0, z1);
      collide(side * line, side * (line + open), z0, z0 + 0.12);
      collide(side * line, side * (line + open), z1 - 0.12, z1);
    } else {
      m = mesh(box(d, h, w), mats, cx, h / 2, cz);
      collide(cx - d / 2, cx + d / 2, z0, z1);
    }
    blockers.push(m);
    curRoof = type === 'apartment' ? { side, line, d, h, z0, z1, cz } : null;
    if (curRoof) roofs.push(curRoof);
    if (!opt.noFront) storefront(side, z0, z1, type);
    facade(side, line, z0, z1, h, floors, cols, style, d, wall);
    if (opt.noFront) facades.extras(true, side * line, -side, z0, z1, h, { style, busy: 0.85 });
    // condensers, rails, adverts with their lamps, sign towers, masts and red lights on the roof (apartments with a
    // walkable roof have their own; the main street's own rooftop adverts stay the only ones there)
    if (!curRoof) facades.roofExtra(true, side * line, -side, z0, z1, h, d, { busy: opt.noFront ? 1 : 0.7, sign: !opt.noFront });
    spans.push({ side, line, z0, z1, h, d, front: !opt.noFront, style, cols });
    if (!opt.noFront) upperSigns(side, z0, z1, h, floors);
    return m;
  }

  // signs on the upper floors and the odd rooftop billboard — Japanese streets are layered with them
  const UPPER = [['2F 麻雀', '#14532d', '#f4ffe9'], ['歯科', '#ffffff', '#1d4fb8'], ['整骨院', '#f6f1e2', '#b3201a'], ['3F BAR', '#140c1c', '#ffcf4f'],
    ['英会話', '#1f63c6', '#ffffff'], ['ネイル', '#f7d6e4', '#9a1b56'], ['学習塾', '#ffe14a', '#1b1b1b'], ['占い', '#2a0b3a', '#ffd38a'], ['マッサージ', '#ffffff', '#2f8f5b'], ['焼肉', '#1a1a1a', '#ff5a36']];
  const ADS = [['星見銀行', '#0e2b5c', '#ffffff'], ['HOSHI BEER', '#b3201a', '#fff2c0'], ['ほしみ不動産', '#1d6b3a', '#ffffff'], ['雨夜ラジオ 88.5', '#111111', '#5cc8ff']];
  function upperSigns(side, z0, z1, h, floors) {
    const out = -side, fx = side * LINE, ry = side > 0 ? -Math.PI / 2 : Math.PI / 2, fh = h / floors;
    if (h >= 9 && rnd() < 0.55) {
      const [t, b, f] = UPPER[Math.floor(rnd() * UPPER.length)];
      const sm = basic(TX.signV(t.replace(/\s/g, ''), b, f), 1.5);
      const y = 4.6 + rnd() * Math.max(0, h - 8);
      mesh(box(0.75, 2.3, 0.18), [edgeMat, edgeMat, edgeMat, edgeMat, sm, sm], side * (LINE - 0.45), y, side > 0 ? z1 - 0.5 : z0 + 0.5);
      if (rnd() < 0.3) sm.userData.mutable = true; flicker.push({ mat: sm, base: 1.5, t: 0 });
    }
    if (floors >= 3 && rnd() < 0.4) {
      const [t, b, f] = UPPER[Math.floor(rnd() * UPPER.length)];
      const p = mesh(new THREE.PlaneGeometry(Math.min(z1 - z0 - 1, 2.6), 0.6), basic(TX.signH(t, b, f), 1.15), fx + out * 0.1, fh + 1.05, (z0 + z1) / 2 + (rnd() - 0.5));
      p.rotation.y = ry;
    }
    if (h >= 15 && rnd() < 0.35) {
      // one of the town's lit adverts (facades.js atlas), on a frame with a catwalk and uplights along its foot
      const ai = [7, 0, 5, 3][Math.floor(rnd() * ADS.length)];
      const bw = Math.min(z1 - z0 - 1, 7), bh = bw * 192 / 512, bx = side * (LINE + 1.4), bz = (z0 + z1) / 2, y0 = h + 1.3;
      batch(box(0.25, bh + 0.16, bw + 0.16), steelMat, bx + side * 0.02, y0 + bh / 2, bz);
      batch(facades.adCell(bw, bh, ai), facades.adMat, bx - side * 0.13, y0 + bh / 2, bz, side > 0 ? -Math.PI / 2 : Math.PI / 2);
      for (const dz of [-bw / 2 + 0.5, 0, bw / 2 - 0.5]) batch(box(0.12, y0 + bh - h, 0.12), steelMat, bx + side * 0.2, (h + y0 + bh) / 2, bz + dz);
      batch(box(0.7, 0.06, bw), steelMat, bx - side * 0.3, y0 - 0.12, bz);
      for (let dz = -bw / 2 + 0.8; dz < bw / 2 - 0.4; dz += 1.7) {
        batch(box(0.5, 0.04, 0.04), steelMat, bx - side * 0.75, y0 + 0.2, bz + dz);
        batch(box(0.22, 0.14, 0.26), facades.lampHead, bx - side * 0.98, y0 + 0.28, bz + dz);
        batch(box(0.02, 0.1, 0.2), facades.lampLit, bx - side * 0.86, y0 + 0.36, bz + dz);
      }
    }
  }

  // real geometry on the street face: window frames, balconies, AC units, pipes, rooftop
  const balcMat = new THREE.MeshStandardMaterial({ map: TX.balconyPanel(), roughness: 0.7 });
  const slabMat = std(0x8e9297, { roughness: 0.8 });
  const frameMat = std(0x9ea3a9, { roughness: 0.35, metalness: 0.7 });
  const sillMat = std(0x6f7378, { roughness: 0.6 });
  const railMat = std(0x7d8288, { roughness: 0.35, metalness: 0.6 });
  const partMat = std(0xa7aaae, { roughness: 0.8 });
  const meterMat = std(0xb7bbc0, { roughness: 0.5 });
  const pipeMat = std(0x9a9ea4, { roughness: 0.45, metalness: 0.5 });
  const capMat = std(0x55595f, { roughness: 0.8 });
  const steelMat = std(0x6a6e74, { roughness: 0.5, metalness: 0.6 });
  const plantMat = std(0x2f5a33, { roughness: 0.75 });
  const towelMats = [0xd9d4c8, 0x6b8cb8, 0xc76f6f, 0xe6e1d3].map((c) => std(c, { roughness: 0.9 }));
  const atlas = TX.windowAtlas();
  const winMat = new THREE.MeshStandardMaterial({ userData: { mutable: true }, map: atlas.map, emissive: 0xffffff, emissiveMap: atlas.emissiveMap, emissiveIntensity: 0.95, roughness: 0.1, metalness: 0.35 });
  const streakMat = new THREE.MeshStandardMaterial({ map: TX.rainStreaks(), transparent: true, depthWrite: false, roughness: 0.8 });
  const windowGeo = (w, h, cell) => {
    const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
    const cu = (cell % 4) / 4, cv = 1 - (Math.floor(cell / 4) + 1) / 4;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, cu + uv.getX(i) / 4, cv + uv.getY(i) / 4);
    return g;
  };
  // lives behind the windows: rooms switching on and off, people passing, washing in the wind.
  // A separate RNG so adding these never reshuffles the street layout.
  const life = TX.mulberry32(4242), living = [], swaying = [];
  const silTex = TX.canvasTex(64, 128, (g, w, h) => {
    g.fillStyle = 'rgba(20,16,14,1)';
    g.beginPath(); g.arc(32, 30, 14, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(8, 128); g.quadraticCurveTo(8, 52, 32, 50); g.quadraticCurveTo(56, 52, 56, 128); g.fill();
  });
  const silMat = new THREE.MeshBasicMaterial({ map: silTex, transparent: true, opacity: 0.7, depthWrite: false, color: 0x000000 });
  updaters.push((t, dt) => {
    for (const L of living) if (t > L.next) { L.mesh.visible = !L.mesh.visible; L.next = t + 8 + life() * 40; }
    for (const S2 of living.sil || []) S2.mesh.position.z = S2.z0 + Math.sin(t * S2.sp + S2.ph) * S2.amp;
    for (const w of swaying) w.rotation.z = Math.sin(t * w.userData.sp + w.userData.ph) * 0.12 + Math.sin(t * 2.7 + w.userData.ph) * 0.04;
  });
  living.sil = [];
  // detailed faces for every other block in town (facades.js), and the queue of block faces that get one once the
  // streets are all laid out (only those you can actually see from a pavement or a road)
  const facades = makeFacades({ batch, box, std, surf, SF, FINISHES, winMat, windowGeo, props, roofMat, seed: 4711,
    mats: { frame: frameMat, sill: sillMat, slab: slabMat, rail: railMat, balc: balcMat, part: partMat, cap: capMat, tank: tankMat, steel: steelMat, meter: meterMat, streak: streakMat, towel0: towelMats[0], towel1: towelMats[1], towel2: towelMats[2] } });
  const lateFaces = [];
  // every ground floor and vending machine, for the street life pass (streetlife.js) at the end
  const fronts = [], vends = [];
  updaters.push((t) => facades.tick(t));
  const streakGeo = (w, h) => {
    const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv, o = rnd();
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (w / 1.2) + o);
    return g;
  };
  function facade(side, line, z0, z1, h, floors, cols, style, d) {
    const w = z1 - z0, cz = (z0 + z1) / 2, out = -side, fx = side * line, fh = h / floors, cw = w / cols;
    const ry = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    // window frames matching the painted windows (48×64 px cells, glass 30×34 px)
    const ww = cw * 30 / 48, wh = fh * 34 / 64;
    for (let f = 0; f < floors - 1; f++) {
      const yc = h - f * fh - fh * 29 / 64;
      for (let c = 0; c < cols; c++) {
        const zc = z0 + (c + 0.5) * cw;
        if (SF) {
          // glass with a room behind it (one cell of the window atlas), and grime running down from the sill
          const lit = rnd() < 0.36;
          batch(windowGeo(ww, wh, lit ? Math.floor(rnd() * TX.WINDOW_LIT) : TX.WINDOW_LIT + Math.floor(rnd() * (TX.WINDOW_CELLS - TX.WINDOW_LIT))), winMat, fx + out * 0.012, yc, zc, ry);
          if (life() < 0.07) {
            // this room's light switches now and then: an overlay of the opposite state, toggled
            const cell = lit ? TX.WINDOW_LIT + Math.floor(life() * (TX.WINDOW_CELLS - TX.WINDOW_LIT)) : Math.floor(life() * TX.WINDOW_LIT);
            const o = mesh(windowGeo(ww, wh, cell), winMat, fx + out * 0.014, yc, zc); o.rotation.y = ry; o.visible = life() < 0.5; o.userData.dynamic = true;
            living.push({ mesh: o, next: life() * 30 });
          } else if (lit && life() < 0.12) {
            const o = mesh(new THREE.PlaneGeometry(wh * 0.42, wh * 0.84), silMat, fx + out * 0.016, yc - wh * 0.08, zc); o.rotation.y = ry;
            living.sil.push({ mesh: o, z0: zc, amp: ww * 0.3, sp: 0.15 + life() * 0.25, ph: life() * 6 });
          }
          if (rnd() < 0.7) batch(streakGeo(ww + 0.12, 0.6 + rnd() * 0.6), streakMat, fx + out * 0.009, yc - wh / 2 - 0.4, zc, ry);
        }
        batch(box(0.08, 0.05, ww + 0.1), frameMat, fx + out * 0.04, yc + wh / 2 + 0.025, zc);
        batch(box(0.18, 0.06, ww + 0.18), sillMat, fx + out * 0.09, yc - wh / 2 - 0.03, zc);
        batch(box(0.08, wh, 0.05), frameMat, fx + out * 0.04, yc, zc - ww / 2 - 0.025);
        batch(box(0.08, wh, 0.05), frameMat, fx + out * 0.04, yc, zc + ww / 2 + 0.025);
        batch(box(0.05, wh, 0.035), frameMat, fx + out * 0.03, yc, zc);
      }
    }
    if (style === 'apt') {
      const rail = rnd() < 0.5;
      for (let k = 2; k < floors; k++) {
        const y = k * fh;
        batch(box(0.95, 0.14, w - 0.3), slabMat, fx + out * 0.47, y, cz);
        if (k === 2) rainEdges.push({ x: fx + out * 0.95, y: y - 0.07, z0: z0 + 0.2, z1: z1 - 0.2, rate: 1.2 });
        if (rail) {
          batch(box(0.06, 0.05, w - 0.3), railMat, fx + out * 0.92, y + 1.07, cz);
          batch(box(0.04, 0.04, w - 0.3), railMat, fx + out * 0.92, y + 0.14, cz);
          for (let zz = z0 + 0.22; zz < z1 - 0.16; zz += 0.12) batch(box(0.022, 0.92, 0.022), railMat, fx + out * 0.92, y + 0.6, zz);
        } else {
          batch(box(0.06, 1.0, w - 0.3), balcMat, fx + out * 0.92, y + 0.55, cz);
          batch(box(0.08, 0.05, w - 0.3), railMat, fx + out * 0.93, y + 1.08, cz);
        }
        for (let c = 0; c <= cols; c += 2) {
          const zz = Math.min(z1 - 0.15, Math.max(z0 + 0.15, z0 + c * cw));
          batch(box(0.92, fh - 0.16, 0.05), partMat, fx + out * 0.47, y + fh / 2, zz);
        }
        for (let c = 0; c < cols; c++) {
          const zc = z0 + (c + 0.5) * cw;
          if (rnd() < 0.45) props.ac.push({ x: fx + out * 0.6, y: y + 0.07, z: zc + cw * 0.22, ry, s: 0.72 });
          if (rnd() < 0.22) {
            batch(new THREE.CylinderGeometry(0.014, 0.014, cw * 0.9, 6).rotateX(Math.PI / 2), railMat, fx + out * 0.72, y + fh - 0.4, zc);
            for (let i = 0; i < 3; i++) if (rnd() < 0.75) {
              const th = 0.42 + rnd() * 0.2, tm = towelMats[Math.floor(rnd() * 4)], tz = zc - cw * 0.28 + i * cw * 0.28;
              if (life() < 0.6) {
                // hung from the pole so it swings in the wind
                const tw = mesh(box(0.012, th, 0.32).translate(0, -th / 2, 0), tm, fx + out * 0.72, y + fh - 0.42, tz);
                tw.userData = { sp: 0.8 + life() * 0.8, ph: life() * 6 }; swaying.push(tw);
              } else batch(box(0.012, th, 0.32), tm, fx + out * 0.72, y + fh - 0.66, tz);
            }
          }
        }
      }
    } else {
      for (let k = 2; k < floors; k++) batch(box(0.3, 0.16, w), slabMat, fx + out * 0.15, k * fh - 0.1, cz);
      for (let c = 1; c < cols; c++) batch(box(0.22, h - fh * 2 + 0.3, 0.14), slabMat, fx + out * 0.11, fh * 2 + (h - fh * 2) / 2 - 0.15, z0 + c * cw);
      for (let k = 2; k < floors; k++) for (let c = 0; c < cols; c++) {
        if (rnd() > 0.14) continue;
        const zc = z0 + (c + 0.5) * cw + cw * 0.3, y = k * fh - 0.95;
        props.ac.push({ x: fx + out * 0.17, y, z: zc, ry, s: 0.68 });
        batch(box(0.4, 0.04, 0.04), steelMat, fx + out * 0.2, y - 0.02, zc - 0.22);
        batch(box(0.4, 0.04, 0.04), steelMat, fx + out * 0.2, y - 0.02, zc + 0.22);
      }
    }
    // parapet with coping
    batch(box(0.25, 0.75, w), capMat, fx, h + 0.37, cz);
    batch(box(d, 0.75, 0.2), capMat, side * (line + d / 2), h + 0.37, z0 + 0.1);
    batch(box(d, 0.75, 0.2), capMat, side * (line + d / 2), h + 0.37, z1 - 0.1);
    batch(box(0.34, 0.06, w + 0.1), sillMat, fx, h + 0.77, cz);
    // downpipe built from real gutter sections, plus meters
    const pz = side > 0 ? z0 + 0.3 : z1 - 0.3;
    for (let y = 0; y < h - 1.2; y += 1) props.pipe.push({ x: fx + out * 0.14, y, z: pz });
    props.funnel.push({ x: fx + out * 0.14, y: h - 1.2, z: pz });
    if (rnd() < 0.7) { batch(box(0.18, 0.42, 0.3), meterMat, fx + out * 0.09, 1.55, pz + side * 0.55); batch(box(0.16, 0.3, 0.26), meterMat, fx + out * 0.08, 1.05, pz + side * 0.55); }
    // rooftop: water tank on legs, aerial, stair house
    const rx = side * (line + d / 2);
    if (rnd() < 0.55) {
      const tx = rx + side * (rnd() - 0.5) * 2, tz = cz + (rnd() - 0.5) * w * 0.4;
      batch(new THREE.CylinderGeometry(0.72, 0.72, 1.3, 18), tankMat, tx, h + 1.6, tz);
      batch(new THREE.CylinderGeometry(0.74, 0.74, 0.06, 18), steelMat, tx, h + 2.27, tz);
      for (const [lx, lz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) batch(box(0.07, 0.95, 0.07), steelMat, tx + lx, h + 0.47, tz + lz);
      batch(box(1.15, 0.06, 1.15), steelMat, tx, h + 0.95, tz);
    }
    if (rnd() < 0.5) {
      const ax = rx - side * 1.2, az = z0 + 1 + rnd() * (w - 2);
      batch(new THREE.CylinderGeometry(0.02, 0.025, 2.4, 6), steelMat, ax, h + 1.2, az);
      for (let i = 0; i < 4; i++) batch(box(0.02, 0.02, 0.9 - i * 0.12), steelMat, ax, h + 1.7 + i * 0.18, az);
      batch(box(0.9, 0.02, 0.02), steelMat, ax, h + 2.25, az);
    }
    if (h >= 15) batch(box(3.0, 2.6, 3.4), partMat, rx + side * 1.5, h + 1.3, z0 + 2.2);
  }

  // fills one side of the street between zHi and zLo (zHi > zLo), ending exactly on zLo.
  // Now and then a coin-parking lot or a narrow alley breaks up the row of buildings.
  let lots = 0;
  function fill(side, zHi, zLo) {
    let z = zHi;
    while (z > zLo + 0.5) {
      if (lots < 3 && z - zLo > 16 && rnd() < 0.16) { parking(side, z - 9, z); z -= 9; lots++; continue; }
      let w = 6 + rnd() * 6;
      if (z - w < zLo + 5) w = z - zLo;
      const h = 6 + Math.floor(rnd() * 4) * 3 + (rnd() < 0.15 ? 9 : 0);
      building(side, z - w, z, h);
      z -= w;
      if (z - zLo > 8 && rnd() < 0.3) { const g = 1.2 + rnd() * 1.2; alley(side, z - g, z); z -= g; }
    }
  }

  // ---------- coin parking ----------
  const lineMat = std(0xe8e8e8, { roughness: 0.5 });
  function parking(side, z0, z1) {
    const w = z1 - z0, cz = (z0 + z1) / 2, depth = 9.5, cx = side * (LINE + depth / 2);
    const lotTex = TX.asphalt(); lotTex.repeat.set(2, 2);
    flat(depth, w, cx, cz, new THREE.MeshStandardMaterial({ map: lotTex, roughness: 0.3, metalness: 0.15, color: 0x8a8e96 }), 0.01).receiveShadow = true;
    const stalls = Math.floor(w / 2.5), sw = w / stalls;
    for (let i = 0; i <= stalls; i++) flat(5.2, 0.1, side * (LINE + depth - 2.8), z0 + i * sw, lineMat, 0.016);
    for (let i = 0; i < stalls; i++) {
      batch(box(0.5, 0.06, 0.9), steelMat, side * (LINE + depth - 4.6), 0.04, z0 + (i + 0.5) * sw);
      batch(box(1.6, 0.12, 0.15), slabMat, side * (LINE + depth - 0.6), 0.06, z0 + (i + 0.5) * sw);
    }
    // you can drive in and out of the lot
    DRIVE.push({ minX: Math.min(side * LINE, side * (LINE + depth)), maxX: Math.max(side * LINE, side * (LINE + depth)), minZ: z0 + 0.2, maxZ: z1 - 0.2 });
    // a building behind the lot, so the gap shows a wall instead of the void
    building(side, z0, z1, 9 + Math.floor(rnd() * 3) * 3, { line: LINE + depth, noFront: true });
    // yellow "P" sign + ticket machine at the entrance
    const px = side * (LINE + 0.4), pz = side > 0 ? z0 + 0.4 : z1 - 0.4;
    batch(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 8), steelMat, px, 1.75, pz);
    const ps = basic(TX.canvasTex(256, 256, (g, cw, ch) => {
      g.fillStyle = '#f2c400'; g.fillRect(0, 0, cw, ch); g.fillStyle = '#1b3f8f'; g.font = `900 150px ${TX.LATIN_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('P', cw / 2, 100);
      g.font = `700 30px ${TX.JP_FONT}`; g.fillText('24時間', cw / 2, 190); g.font = `700 24px ${TX.JP_FONT}`; g.fillText('20分 ¥200', cw / 2, 228);
    }), 1.4);
    const sb = mesh(box(0.7, 0.7, 0.12), [fasciaEdge, fasciaEdge, fasciaEdge, fasciaEdge, ps, ps], px, 3.3, pz);
    sb.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    mesh(new RoundedBoxGeometry(0.45, 1.3, 0.4, 2, 0.04), std(0x3a6ea8, { roughness: 0.4, metalness: 0.4 }), side * (LINE + 0.9), 0.8, side > 0 ? z0 + 1.2 : z1 - 1.2);
    collide(px - 0.1, px + 0.1, pz - 0.1, pz + 0.1); camPole(px, pz, 0.1, 3.7);
    // a lamp over the lot and one or two real cars nose-in
    const lx = side * (LINE + depth - 1), lz = cz;
    batch(new THREE.CylinderGeometry(0.06, 0.08, 5, 8), steelMat, lx, 2.5, lz);
    const head = mesh(new THREE.PlaneGeometry(0.5, 0.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.6, 2.4), side: THREE.DoubleSide }), lx - side * 0.3, 4.95, lz); head.rotation.x = Math.PI / 2;
    glowPool(cx, 0.02, cz, 7, w, 0xf0f4ff, 0.22);
    lampSpots.push(new THREE.Vector3(lx - side * 0.3, 4.8, lz));
    const keys = Object.keys(assets?.cars || {}).filter((k) => k !== 'porsche_911' && assets.cars[k].userData.kind === 'car');
    const n = Math.min(stalls, 1 + Math.floor(rnd() * 2));
    for (let i = 0; i < n && keys.length; i++) {
      const c = spawnCar(assets.cars[keys[Math.floor(rnd() * keys.length)]], scene); c.userData.static = true;
      { const r = c.userData.rig; mergeVehicle(c, r ? [r.door, ...r.wheels.flatMap((w) => [w.steer, w.spin])] : []); }
      c.position.set(side * (LINE + depth - 3.0), 0, z0 + (i * 2 + (stalls > 2 ? 1 : 0) + 0.5) * sw);
      c.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      const { L: cl, W: cw2 } = c.userData;
      c.userData.rs = { x0: c.position.x - cl * 0.3, x1: c.position.x + cl * 0.3, z0: c.position.z - cw2 * 0.32, z1: c.position.z + cw2 * 0.32, y: c.userData.size.y * 0.96, splash: true };
      rainSurfaces.push(c.userData.rs);
      c.userData.col = { minX: c.position.x - cl / 2, maxX: c.position.x + cl / 2, minZ: c.position.z - cw2 / 2, maxZ: c.position.z + cw2 / 2 };
      colliders.push(c.userData.col);
      drivable.push(c);
    }
    interactables.push({ pos: new THREE.Vector3(side * (LINE - 0.6), 0, cz), r: 2.2, label: 'Look at the car park',
      lines: [{ text: 'Coin parking, 24 hours. ¥200 per 20 minutes, ¥1.200 max until morning.' }, { text: 'A lock plate rises under each car on its own. No pay, no way out.' }] });
  }

  // ---------- narrow alleys between buildings ----------
  const crateMats = [0x2f6fd6, 0xf2c400, 0xc0392b, 0x3aa65a].map((c) => std(c, { roughness: 0.6 }));
  const cardboard = std(0x9a7650, { roughness: 0.9 });
  const BAR_SIGNS = [['BAR 路地', '#140c1c', '#ffcf4f'], ['焼鳥 裏', '#1a1a1a', '#ff8a3a'], ['スナック 灯', '#1a0820', '#ff6fd8'], ['立呑み', '#0e2b5c', '#ffe17a']];
  function alley(side, z0, z1) {
    const cz = (z0 + z1) / 2, gw = z1 - z0, L = 14, ax = (k) => side * (LINE + k);
    // wet concrete floor with a drain channel, and a wall closing the far end
    flat(L, gw, ax(L / 2), cz, surf('concrete_floor_02', L / 3, gw / 3, { color: 0x8c8e92, wet: 0.35 }), 0.014);
    flat(L, 0.18, ax(L / 2), cz, std(0x1a1b1e, { roughness: 0.3, metalness: 0.5 }), 0.018);
    mesh(box(0.3, 10, gw + 0.4), surf('concrete_wall_003', gw / 2, 4, { color: 0x77736c }), ax(L + 0.5), 5, cz);
    // pipes, meters and AC units on both walls
    for (const [wz, face] of [[z0 + 0.06, 1], [z1 - 0.06, -1]]) {
      for (let k = 0; k < 2 + Math.floor(rnd() * 2); k++) {
        const px = ax(1.5 + rnd() * (L - 3));
        batch(new THREE.CylinderGeometry(0.045, 0.045, 7.5, 8), pipeMat, px, 3.75, wz + face * 0.05);
      }
      batch(new THREE.CylinderGeometry(0.035, 0.035, L - 1, 8).rotateZ(Math.PI / 2), pipeMat, ax(L / 2), 2.9 + rnd() * 1.5, wz + face * 0.06);
      if (rnd() < 0.7) { batch(box(0.32, 0.4, 0.12), meterMat, ax(1.2 + rnd() * 3), 1.5, wz + face * 0.07); batch(box(0.28, 0.32, 0.1), meterMat, ax(2.2 + rnd() * 3), 1.0, wz + face * 0.06); }
      for (let k = 0; k < 2; k++) if (rnd() < 0.6 && gw > 1.4) props.ac.push({ x: ax(3 + rnd() * (L - 5)), y: 2.2 + rnd() * 4, z: wz + face * 0.2, ry: face > 0 ? 0 : Math.PI, s: 0.62 });
    }
    // cables strung across
    for (let k = 0; k < 3; k++) {
      const cx2 = ax(2 + rnd() * (L - 4)), y = 4 + rnd() * 3;
      sag(new THREE.Vector3(cx2, y, z0 + 0.05), new THREE.Vector3(cx2 + side * (rnd() - 0.5) * 2, y - 0.3, z1 - 0.05), 0.25, 6);
    }
    // a back door with its own lamp
    const dw = rnd() < 0.5 ? [z0 + 0.04, 1] : [z1 - 0.04, -1], dxp = ax(4 + rnd() * 5);
    const dm = mesh(new THREE.PlaneGeometry(0.9, 2.0), surf('metal_plate', 0.5, 1, { color: 0x6c7a86 }), dxp, 1.0, dw[0] + dw[1] * 0.01);
    dm.rotation.y = dw[1] > 0 ? 0 : Math.PI;
    props.secLight.push({ x: dxp, y: 2.45, z: dw[0] + dw[1] * 0.02, ry: dw[1] > 0 ? 0 : Math.PI });
    glowPool(dxp, 0.03, cz, Math.min(2.5, gw + 0.6), 2.4, 0xfff0d8, 0.4);
    // a small lit sign at the mouth of the alley
    if (rnd() < 0.6) {
      const [t, bg, fg] = BAR_SIGNS[Math.floor(rnd() * BAR_SIGNS.length)];
      const sm = basic(TX.signV(t.replace(' ', ''), bg, fg), 1.6);
      mesh(box(0.12, 1.4, 0.45), [sm, sm, edgeMat, edgeMat, edgeMat, edgeMat], ax(0.6), 3.0, z0 + 0.3);
      sm.userData.mutable = true; flicker.push({ mat: sm, base: 1.6, t: 0 });
    }
    // bulb hanging near the entrance
    const bx = ax(1.4 + rnd() * 2);
    mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.3, 1.4) }), bx, 3.0, cz);
    sag(new THREE.Vector3(bx, 3.6, z0 + 0.05), new THREE.Vector3(bx, 3.6, z1 - 0.05), 0.15, 4);
    glowPool(bx, 0.03, cz, 2.4, gw + 0.4, 0xffc98a, 0.4);
    lampSpots.push(new THREE.Vector3(bx, 2.9, cz));
    // clutter: beer crates, bins, cardboard, sometimes a bicycle
    for (let i = 0; i < 3 + Math.floor(rnd() * 4); i++) {
      const cx2 = ax(1.0 + rnd() * (L - 3)), cz2 = cz + (rnd() - 0.5) * Math.max(0, gw - 0.6);
      const stack = 1 + Math.floor(rnd() * 3), m = crateMats[Math.floor(rnd() * crateMats.length)];
      for (let k = 0; k < stack; k++) { batch(box(0.42, 0.3, 0.32), m, cx2, 0.15 + k * 0.31, cz2); batch(box(0.36, 0.02, 0.26), dark, cx2, 0.31 + k * 0.31, cz2); }
    }
    for (let i = 0; i < 2; i++) if (rnd() < 0.7) batch(box(0.45 + rnd() * 0.3, 0.3 + rnd() * 0.3, 0.4), cardboard, ax(2 + rnd() * 8), 0.2, cz + (rnd() - 0.5) * Math.max(0, gw - 0.7));
    if (rnd() < 0.6) props.trash.push({ x: ax(5 + rnd() * 6), y: 0, z: cz + (rnd() - 0.5) * Math.max(0, gw - 0.8), ry: rnd() * 6, s: 0.85 });
    if (gw > 1.6 && rnd() < 0.4) bikeAt(ax(7 + rnd() * 3), cz, Math.PI / 2, [0x2b6cb0, 0xd9d9d9, 0xb23a3a][Math.floor(rnd() * 3)]);
    if (rnd() < 0.3) D.steam(ctx, ax(6 + rnd() * 5), 2.4, gw > 1.4 ? z0 + 0.25 : cz);
  }

  // ---------- a small Inari shrine tucked between buildings ----------
  // curved kasagi (top beam of a torii): a profile with upswept ends, extruded through the beam's depth
  function kasagiGeo(len, thick, lift, depth) {
    const sh = new THREE.Shape(), N = 16;
    const yb = (t) => lift * Math.pow(Math.abs(t), 3.2);
    for (let i = 0; i <= N; i++) { const t = -1 + (2 * i) / N; sh[i ? 'lineTo' : 'moveTo'](t * len / 2, yb(t)); }
    for (let i = N; i >= 0; i--) { const t = -1 + (2 * i) / N; sh.lineTo(t * len / 2 * 1.02, yb(t) * 1.15 + thick); }
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false });
    g.translate(0, 0, -depth / 2); g.rotateY(Math.PI / 2);
    return g;
  }
  function torii(x, z, hgt, span, red, blk, big = false) {
    const r = big ? 0.14 : 0.07;
    for (const dz of [-span / 2, span / 2]) {
      batch(new THREE.CylinderGeometry(r * 0.9, r, hgt, 14), red, x, hgt / 2, z + dz);
      batch(new THREE.CylinderGeometry(r * 1.35, r * 1.45, 0.25 * (big ? 1 : 0.6), 14), blk, x, 0.12 * (big ? 1 : 0.6), z + dz);
    }
    batch(kasagiGeo(span + (big ? 1.1 : 0.6), big ? 0.18 : 0.1, big ? 0.22 : 0.1, big ? 0.36 : 0.2), blk, x, hgt + (big ? 0.18 : 0.08), z);
    batch(box(big ? 0.28 : 0.16, big ? 0.16 : 0.09, span + (big ? 0.8 : 0.4)), red, x, hgt + 0.02, z);
    batch(box(big ? 0.17 : 0.1, big ? 0.15 : 0.08, span + (big ? 0.6 : 0.3)), red, x, hgt - (big ? 0.6 : 0.35), z);
    if (big) batch(box(0.12, 0.42, 0.12), red, x, hgt - 0.3, z);
  }
  function fox(x, z, ry, stone, bib) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
    mesh(box(0.55, 0.7, 0.55), stone, 0, 0.35, 0, g);
    mesh(box(0.65, 0.08, 0.65), stone, 0, 0.74, 0, g);
    const body = mesh(new THREE.SphereGeometry(0.18, 14, 10), stone, 0, 0.98, 0, g); body.scale.set(0.8, 1.35, 1.05);
    mesh(new THREE.SphereGeometry(0.1, 12, 10), stone, 0, 1.32, 0.04, g);
    mesh(new THREE.ConeGeometry(0.05, 0.14, 8).rotateX(Math.PI / 2), stone, 0, 1.3, 0.15, g);
    for (const s2 of [-1, 1]) { const e = mesh(new THREE.ConeGeometry(0.035, 0.12, 6), stone, s2 * 0.05, 1.44, 0.02, g); e.rotation.z = -s2 * 0.25; }
    const tail = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.85, -0.15), new THREE.Vector3(0, 1.05, -0.28), new THREE.Vector3(0, 1.32, -0.2)]), 10, 0.05, 6), stone, 0, 0, 0, g);
    const b = mesh(new THREE.ConeGeometry(0.15, 0.16, 12, 1, true), bib, 0, 1.15, 0.04, g); b.rotation.x = Math.PI;
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }
  function shrine(side, z0, z1) {
    const w = z1 - z0, cz = (z0 + z1) / 2, depth = 10;
    const red = std(0xd1381c, { roughness: 0.45 }), blk = std(0x161616, { roughness: 0.6 });
    const stone = surf('concrete_wall_003', 0.5, 0.5, { color: 0xa9a59c, wet: 0.7 }), wood = std(0x6b4a2e, { roughness: 0.7 });
    const copper = std(0x5f8f7a, { roughness: 0.5, metalness: 0.4 }), bibMat = std(0xc8201a, { roughness: 0.8 });
    const gt = TX.gravel(rnd); gt.repeat.set(4, 3);
    flat(depth, w, side * (LINE + depth / 2), cz, new THREE.MeshStandardMaterial({ map: gt, roughness: 0.9, color: 0x9a948c }), 0.012);
    for (let i = 0; i < 7; i++) flat(0.85, 0.6, side * (LINE + 0.9 + i * 1.0), cz, surf('concrete_floor_02', 0.4, 0.3, { color: 0x9a968e, wet: 0.5 }), 0.022);
    building(side, z0, z1, 12, { line: LINE + depth, noFront: true });

    // big torii at the street, then a tunnel of small vermilion torii (senbon torii)
    torii(side * (LINE + 0.8), cz, 3.2, 2.5, red, blk, true);
    const plq = mesh(new THREE.PlaneGeometry(0.26, 0.5), basic(TX.plaque('稲荷'), 1.2), side * (LINE + 0.8) - side * 0.07, 2.88, cz);
    plq.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    for (let i = 0; i < 7; i++) torii(side * (LINE + 2.0 + i * 0.62), cz, 2.25, 1.3, red, blk);
    // fox guardians with red bibs
    fox(side * (LINE + 1.5), cz - 1.25, side > 0 ? -Math.PI / 2 : Math.PI / 2, stone, bibMat);
    fox(side * (LINE + 1.5), cz + 1.25, side > 0 ? -Math.PI / 2 : Math.PI / 2, stone, bibMat);

    // stone lanterns (tōrō)
    for (const dz of [-1.9, 1.9]) {
      const lx = side * (LINE + 6.7), lz = cz + dz;
      batch(new THREE.CylinderGeometry(0.3, 0.34, 0.18, 8), stone, lx, 0.09, lz);
      batch(new THREE.CylinderGeometry(0.09, 0.11, 0.85, 10), stone, lx, 0.6, lz);
      batch(new THREE.CylinderGeometry(0.3, 0.22, 0.1, 6), stone, lx, 1.08, lz);
      mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.3, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.5, 0.8) }), lx, 1.28, lz);
      batch(new THREE.ConeGeometry(0.42, 0.28, 6), stone, lx, 1.58, lz);
      batch(new THREE.SphereGeometry(0.07, 10, 8), stone, lx, 1.76, lz);
      glowPool(lx, 0.03, lz, 1.8, 1.8, 0xffb060, 0.4);
    }

    // the shrine itself: stone base, wooden hall, copper roof, rope, bell, offering box
    const hx = side * (LINE + 8.3);
    batch(box(2.2, 0.35, 2.4), stone, hx, 0.17, cz);
    batch(box(1.9, 0.3, 2.1), stone, hx, 0.5, cz);
    batch(box(1.4, 1.2, 1.5), wood, hx, 1.25, cz);
    for (const ez of [-0.75, 0.75]) batch(box(0.1, 1.3, 0.1), red, hx - side * 0.72, 1.3, cz + ez);
    const doors = mesh(new THREE.PlaneGeometry(1.3, 1.0), new THREE.MeshStandardMaterial({ map: TX.stripes('#5a3a22', '#2a1a10', 10), roughness: 0.7 }), hx - side * 0.71, 1.25, cz);
    doors.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    for (const s2 of [-1, 1]) { const r2 = box(2.3, 0.07, 1.25); r2.rotateX(s2 * 0.62); batch(r2, copper, hx, 2.18, cz + s2 * 0.5); }
    batch(box(2.3, 0.12, 0.12), copper, hx, 2.55, cz);
    batch(box(0.6, 0.45, 1.0), wood, hx - side * 1.35, 0.55, cz);
    for (let k = 0; k < 6; k++) batch(box(0.62, 0.03, 0.05), blk, hx - side * 1.35, 0.79, cz - 0.4 + k * 0.16);
    const rope = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(hx - side * 0.8, 1.95, cz - 0.85), new THREE.Vector3(hx - side * 0.82, 1.8, cz), new THREE.Vector3(hx - side * 0.8, 1.95, cz + 0.85)]), 20, 0.05, 8);
    batch(rope, std(0xd9c48a, { roughness: 0.9 }), 0, 0, 0);
    const paper = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 1.1, 1.05), side: THREE.DoubleSide });
    for (const pz of [-0.45, 0, 0.45]) { const sp = mesh(new THREE.PlaneGeometry(0.12, 0.3), paper, hx - side * 0.84, 1.68, cz + pz); sp.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; }
    batch(new THREE.SphereGeometry(0.09, 12, 10), std(0xc9a23a, { metalness: 0.9, roughness: 0.3 }), hx - side * 0.95, 1.75, cz);
    batch(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 6), std(0xc8201a), hx - side * 0.95, 1.15, cz);
    // paper lanterns either side of the hall
    for (const ez of [-0.95, 0.95]) {
      const pl = mesh(new THREE.SphereGeometry(0.16, 14, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 1.8, 1.4) }), hx - side * 0.95, 1.9, cz + ez);
      pl.scale.set(1, 1.35, 1);
      glowPool(hx - side * 1.4, 0.03, cz + ez, 1.6, 1.6, 0xffd9a0, 0.35);
    }
    // ema rack
    const emaMat = new THREE.MeshStandardMaterial({ map: TX.ema(rnd), transparent: true, alphaTest: 0.4, roughness: 0.8, side: THREE.DoubleSide });
    const ex = side * (LINE + 5.2), ezz = side > 0 ? z0 + 0.45 : z1 - 0.45;
    batch(box(0.08, 1.4, 0.08), wood, ex - 0.7, 0.7, ezz); batch(box(0.08, 1.4, 0.08), wood, ex + 0.7, 0.7, ezz);
    batch(box(1.5, 0.06, 0.06), wood, ex, 1.25, ezz); batch(box(1.5, 0.06, 0.06), wood, ex, 0.85, ezz);
    for (const ey of [1.08, 0.68]) { const em = mesh(new THREE.PlaneGeometry(1.4, 0.35), emaMat, ex, ey, ezz + (side > 0 ? 0.05 : -0.05)); }
    // sacred trees with a rope round the trunk, low fence along the sides
    for (const dz of [-w / 2 + 0.8, w / 2 - 0.8]) {
      batch(new THREE.CylinderGeometry(0.16, 0.22, 2.4, 10), wood, side * (LINE + 9.4), 1.2, cz + dz);
      batch(new THREE.TorusGeometry(0.21, 0.035, 6, 16).rotateX(Math.PI / 2), std(0xd9c48a, { roughness: 0.9 }), side * (LINE + 9.4), 1.3, cz + dz);
      for (let k = 0; k < 6; k++) batch(new THREE.SphereGeometry(0.8 + rnd() * 0.4, 9, 7), plantMat, side * (LINE + 9.4) + (rnd() - 0.5) * 0.9, 2.7 + rnd() * 1.3, cz + dz + (rnd() - 0.5) * 0.9);
    }
    for (const ez of [z0 + 0.06, z1 - 0.06]) {
      batch(box(depth - 0.5, 0.06, 0.05), wood, side * (LINE + depth / 2 + 0.2), 0.75, ez);
      batch(box(depth - 0.5, 0.06, 0.05), wood, side * (LINE + depth / 2 + 0.2), 0.35, ez);
      for (let k = 0; k < 10; k++) batch(box(0.08, 0.85, 0.08), red, side * (LINE + 0.6 + k * 1.0), 0.42, ez);
    }
    lampSpots.push(new THREE.Vector3(side * (LINE + 4), 2.6, cz));
    interactables.push({ pos: new THREE.Vector3(side * (LINE - 0.5), 0, cz), r: 2.0, label: 'Look at the shrine',
      lines: [{ who: 'Hoshimi Inari Shrine', text: 'A big red torii, then a tunnel of small ones leading to a tiny shrine at the end of the alley.' },
        { text: 'A pair of stone foxes in red bibs guard the way in. Before the shrine sits a warm can of coffee, left as an offering.' },
        { text: 'Prayer plaques hang on the ema rack: "Let me pass my exams", "Let my score break through at Rhythm Night".' }] });
  }


  // ---------- Hoshi Mart (konbini) ----------
  // a simple figure for interiors (seen through glass, so silhouette and colour are enough)
  // a standing figure: shoes, trousers, a tapered torso, shoulders, hands, a face and a fringe.
  // Built once per call and merged into the static batches, so a room full of people stays cheap.
  const PM = new Map();
  const pmat = (hex, o = {}) => { const k = `${hex}|${o.r ?? 0.8}`; if (!PM.has(k)) PM.set(k, std(hex, { roughness: o.r ?? 0.8, emissive: new THREE.Color(hex).multiplyScalar(0.06) })); return PM.get(k); };
  const torsoGeo = new THREE.LatheGeometry([[0.0, 0], [0.15, 0], [0.155, 0.12], [0.175, 0.3], [0.19, 0.44], [0.17, 0.52], [0.07, 0.56], [0.0, 0.57]].map(([r, y]) => new THREE.Vector2(r, y)), 18);
  torsoGeo.scale(1, 1, 0.62);
  const SKIN = [0xe8c4a4, 0xe0b898, 0xd4a888, 0xc89878], HAIR = [0x1a1614, 0x2a1e16, 0x3a2a1e, 0x6a6460, 0x141418];
  // act: what a real character in this place would be doing (npcs.js): 'idle' | 'talk' | 'text' | 'push'
  function person(x, z, ry, color = 0x2a2d35, y0 = 0.15, h = 1.65, act = null) {
    const g = new THREE.Group(); g.position.set(x, y0, z); g.rotation.y = ry; g.scale.setScalar(h / 1.65);
    const hsh = Math.abs(Math.sin(x * 12.9898 + z * 78.233)) * 43758.5453 % 1;
    const cloth = pmat(color), skin = pmat(SKIN[Math.floor(hsh * 4)], { r: 0.6 }), hair = pmat(HAIR[Math.floor(hsh * 37) % 5], { r: 0.5 });
    const pants = pmat(hsh < 0.5 ? 0x1e2027 : 0x2a3040), shoe = pmat(0x111114, { r: 0.4 }), dark = pmat(0x0a0a0a, { r: 0.3 });
    const add = (geo, m, px, py, pz, rx = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(px, py, pz); o.rotation.set(rx, 0, rz); g.add(o); };
    for (const s2 of [-1, 1]) {
      add(new RoundedBoxGeometry(0.1, 0.07, 0.25, 2, 0.03), shoe, s2 * 0.09, 0.035, 0.03);
      add(new THREE.CapsuleGeometry(0.055, 0.34, 4, 10), pants, s2 * 0.09, 0.28, 0);
      add(new THREE.CapsuleGeometry(0.07, 0.32, 4, 10), pants, s2 * 0.09, 0.66, 0);
      add(new THREE.SphereGeometry(0.07, 12, 10), cloth, s2 * 0.185, 1.34, 0);
      add(new THREE.CapsuleGeometry(0.05, 0.25, 4, 10), cloth, s2 * 0.21, 1.17, 0, 0, s2 * 0.08);
      add(new THREE.CapsuleGeometry(0.044, 0.22, 4, 10), cloth, s2 * 0.225, 0.92, 0.02, -0.12, s2 * 0.04);
      add(new THREE.SphereGeometry(0.045, 10, 8), skin, s2 * 0.23, 0.77, 0.035);
      add(new THREE.SphereGeometry(0.022, 8, 6), skin, s2 * 0.1, 1.585, -0.005);
      add(new THREE.SphereGeometry(0.011, 8, 6), dark, s2 * 0.034, 1.598, 0.092);
      add(new THREE.BoxGeometry(0.035, 0.008, 0.01), hair, s2 * 0.035, 1.625, 0.094);
    }
    add(new RoundedBoxGeometry(0.31, 0.17, 0.2, 2, 0.05), pants, 0, 0.86, 0);
    const torso = new THREE.Mesh(torsoGeo, cloth); torso.position.y = 0.86; g.add(torso);
    add(new THREE.CylinderGeometry(0.045, 0.05, 0.09, 12), skin, 0, 1.46, 0);
    add(new THREE.TorusGeometry(0.06, 0.018, 6, 16).rotateX(Math.PI / 2), cloth, 0, 1.425, 0);
    const head = new THREE.SphereGeometry(0.105, 18, 14); head.scale(0.92, 1.08, 1.0);
    add(head, skin, 0, 1.58, 0);
    add(new THREE.ConeGeometry(0.014, 0.03, 6).rotateX(Math.PI / 2), skin, 0, 1.57, 0.1);
    const cap = new THREE.SphereGeometry(0.113, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55); cap.scale(0.95, 1.05, 1.03);
    add(cap, hair, 0, 1.6, -0.006);
    add(new THREE.SphereGeometry(0.1, 14, 10, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.4), hair, 0, 1.585, -0.025);
    add(new RoundedBoxGeometry(0.17, 0.045, 0.04, 2, 0.02), hair, 0, 1.655, 0.085, -0.4);
    // the stand-in, merged into a few meshes (one per material) that hide when a real character takes the spot
    g.updateMatrixWorld(true);
    const byMat = new Map();
    g.traverse((o) => { if (o.isMesh) { const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); (byMat.get(o.material) || byMat.set(o.material, []).get(o.material)).push(geo.applyMatrix4(o.matrixWorld)); } });
    const pins = [...byMat].map(([m, geos]) => { const mm = new THREE.Mesh(mergeGeometries(geos), m); mm.userData.dynamic = true; mm.matrixAutoUpdate = false; mm.matrixWorldAutoUpdate = false; mm.updateMatrixWorld(true); scene.add(mm); reflectSkipLater.push(mm); return mm; });
    const staff = color === 0xf4f4f2 || color === 0xf2f2f2;
    npcSlots.push({ x, y: y0, z, yaw: ry, h, pins, act: act ?? (staff ? 'idle' : hsh < 0.3 ? 'text' : 'idle'), pick: Math.floor(hsh * 997) });
    return g;
  }

  function konbini(z0, z1) {
    const x0 = LINE, x1 = LINE + 9, w = z1 - z0, cz = (z0 + z1) / 2, H = 4.4, depth = x1 - x0;
    const wallM = surf('white_plaster_02', 3, 1.5, { color: 0xeeeeea, wet: 0.8 });
    blockers.push(
      mesh(box(0.2, H, w), wallM, x1, H / 2, cz),
      mesh(box(depth, H, 0.2), wallM, x0 + depth / 2, H / 2, z0),
      mesh(box(depth, H, 0.2), wallM, x0 + depth / 2, H / 2, z1),
    );
    mesh(box(depth + 0.4, 0.3, w + 0.4), roofMat, x0 + depth / 2, H + 0.15, cz);
    rainSurfaces.push({ x0: x0 - 0.2, x1: x1 + 0.2, z0: z0 - 0.2, z1: z1 + 0.2, y: H + 0.3, splash: false });
    rainEdges.push({ x: x0 - 0.2, y: H, z0: z0 + 0.1, z1: z1 - 0.1, rate: 3 });
    batch(box(depth + 0.4, 0.5, 0.2), capMat, x0 + depth / 2, H + 0.55, z0 - 0.1);
    batch(box(depth + 0.4, 0.5, 0.2), capMat, x0 + depth / 2, H + 0.55, z1 + 0.1);
    for (let i = 0; i < 3; i++) props.ac.push({ x: x0 + 3 + i * 2.2, y: H + 0.3, z: z0 + 1.2, ry: Math.PI, s: 0.75 });

    // ---- interior ----
    // clean white wall panels inside (the shell outside stays weathered plaster)
    const panelW = new THREE.MeshStandardMaterial({ color: 0xf4f5f6, emissive: 0x6a6c70, roughness: 0.5 });
    for (const [zz, ry] of [[z0 + 0.14, 0], [z1 - 0.14, Math.PI]]) { const pw = mesh(new THREE.PlaneGeometry(depth - 0.2, H - 0.2), panelW, x0 + depth / 2, H / 2, zz); pw.rotation.y = ry; }
    // white floor tiles and an acoustic-tile ceiling
    flat(depth, w, x0 + depth / 2, cz, surf('floor_tiles_06', depth / 1.2, w / 1.2, { color: 0xeef0f2, wet: 0.5, metal: false }), 0.16);
    const kCeil = surf('ceiling_interior', depth / 1.2, w / 1.2, { color: 0xd8dce0, metal: false }).clone();
    kCeil.emissive = new THREE.Color(0x9aa0a6); kCeil.emissiveMap = kCeil.map; kCeil.emissiveIntensity = 0.5;
    mesh(box(depth, 0.05, w), kCeil, x0 + depth / 2, H - 0.05, cz);
    const panel = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.3, 2.4, 2.5) });
    for (let ix = 0; ix < 4; ix++) for (let iz = 0; iz < 5; iz++) batch(box(1.1, 0.04, 0.5), panel, x0 + 1.3 + ix * 2, H - 0.1, z0 + 1.4 + iz * 2.3);
    // gondola shelving stocked with real (instanced) products, POP cards on top
    const prodBox = [], prodBottle = [];
    const shelfSide = std(0xd8dbe0), pop = std(0xffe14a, { roughness: 0.6 });
    const shelfM = std(0xeef0f2, { roughness: 0.35, metalness: 0.2 }), railM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.6, 1.5) });
    const gl = w - 5;
    for (let i = 0; i < 3; i++) {
      const sx = x0 + 3.6 + i * 1.6, gz = cz - 0.4;
      batch(box(0.9, 0.14, gl), dark, sx, 0.23, gz);
      batch(box(0.05, 1.5, gl), shelfM, sx, 0.9, gz);
      for (let k = 0; k < 4; k++) batch(box(0.02, 0.18, 0.32), pop, sx, 1.78, gz - gl / 2 + 0.6 + k * ((gl - 1.2) / 3));
      for (const f of [-1, 1]) for (let r = 0; r < 4; r++) {
        const y = 0.32 + r * 0.36;
        batch(box(0.4, 0.025, gl), shelfM, sx + f * 0.22, y, gz);
        batch(box(0.012, 0.035, gl), railM, sx + f * 0.42, y - 0.005, gz);
        for (let z = gz - gl / 2 + 0.05; z < gz + gl / 2 - 0.05;) {
          const bottle = r === 3 && i === 2, iw = bottle ? 0.07 : 0.06 + rnd() * 0.08, ih = bottle ? 0.22 : 0.08 + rnd() * (r === 0 ? 0.24 : 0.16);
          const hue = rnd(), n = 1 + Math.floor(rnd() * 3);
          for (let k = 0; k < n && z < gz + gl / 2 - 0.05; k++, z += iw + 0.008) (bottle ? prodBottle : prodBox).push({ x: sx + f * 0.25, y: y + 0.013 + ih / 2, z: z + iw / 2, sx: iw, sy: ih, sz: bottle ? iw : 0.22, h: hue });
        }
      }
      mesh(box(0.9, 1.2, 0.5), [shelfSide, shelfSide, shelfSide, shelfSide, basic(TX.productShelf(rnd), 0.85), shelfSide], sx, 0.75, gz + gl / 2 + 0.25);
    }
    // wall of drink fridges: lit shelves of bottles behind glass doors
    const fd = 0.62, fx0 = x1 - 0.1 - fd, fwid = w - 1.2;
    batch(box(0.05, 2.1, fwid), std(0x2a2d33, { roughness: 0.5 }), x1 - 0.12, 1.25, cz);
    for (let r = 0; r < 5; r++) {
      const y = 0.35 + r * 0.4;
      batch(box(fd, 0.02, fwid), shelfM, x1 - 0.1 - fd / 2, y, cz);
      batch(box(0.01, 0.02, fwid), railM, fx0 + 0.02, y + 0.33, cz);
      for (let z = z0 + 0.65; z < z1 - 0.65;) {
        const kind = rnd(), n = 3 + Math.floor(rnd() * 4), bw = kind < 0.3 ? 0.075 : 0.065, bh = kind < 0.3 ? 0.27 : kind < 0.7 ? 0.21 : 0.13;
        const hue = kind < 0.25 ? 0.33 : kind < 0.4 ? 0.58 : kind < 0.55 ? 0.0 : kind < 0.7 ? 0.08 : rnd();
        for (let k = 0; k < n && z < z1 - 0.65; k++, z += bw + 0.006) for (let dd = 0; dd < 2; dd++) prodBottle.push({ x: fx0 + 0.1 + dd * 0.16, y: y + 0.01 + bh / 2, z: z + bw / 2, sx: bw, sy: bh, sz: bw, h: hue, fridge: true });
        z += 0.02;
      }
    }
    const fglass = new THREE.MeshStandardMaterial({ color: 0xdfeaf5, transparent: true, opacity: 0.12, roughness: 0.03, metalness: 0.7, depthWrite: false });
    const fdw = fwid / 8, fdz = z0 + 0.6 + fdw * 4.5;   // the fifth door actually opens
    for (const [a, b] of [[z0 + 0.6, fdz - fdw / 2], [fdz + fdw / 2, z1 - 0.6]]) { const fg = mesh(new THREE.PlaneGeometry(b - a, 2.1), fglass, fx0 - 0.02, 1.25, (a + b) / 2); fg.rotation.y = -Math.PI / 2; }
    const fridgeDoor = doors.add({ kind: 'swing', x: fx0 - 0.05, z: fdz, y: 0.2, w: fdw - 0.02, h: 2.1, along: 'z', face: -1, interact: false, solid: false, mat: fglass, frame: steelMat, sound: 'swing' });
    for (let k = 0; k <= 8; k++) {
      const zz = z0 + 0.6 + k * (fwid / 8);
      batch(box(0.06, 2.2, 0.06), frameMat, fx0 - 0.03, 1.25, zz);
      if (k < 8) batch(box(0.04, 0.5, 0.025), steelMat, fx0 - 0.07, 1.3, zz + 0.1);
    }
    batch(box(0.08, 0.08, fwid), frameMat, fx0 - 0.03, 2.32, cz);
    batch(box(0.08, 0.3, fwid), basic(TX.konbiniPosters(), 0.9), fx0 - 0.03, 2.5, cz);
    // products: one instanced mesh for boxes, one for bottles (with caps)
    const inst = (geo, list, mat) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, mat, list.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color();
      list.forEach((p, i) => { im.setMatrixAt(i, m4.compose(v.set(p.x, p.y, p.z), q, sc.set(p.sx, p.sy, p.sz))); const r2 = (p.h * 13.7) % 1; im.setColorAt(i, r2 < 0.18 ? c.setHSL(0.1, 0.15, 0.85) : c.setHSL(p.h, p.fridge ? 0.6 : 0.3 + r2 * 0.45, p.fridge ? 0.48 : 0.35 + ((p.h * 7) % 1) * 0.3)); });
      scene.add(im); return im;
    };
    inst(new THREE.BoxGeometry(1, 1, 1), prodBox, instLit(0.35, { roughness: 0.5 }));
    inst(new THREE.CylinderGeometry(0.5, 0.5, 1, 10), prodBottle, instLit(0.45, { roughness: 0.2 }));
    inst(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 8).translate(0, 0.56, 0), prodBottle, std(0xf2f2f2, { roughness: 0.4, emissive: 0x666666 }));
    // magazine rack along the window (kept low so you can see in), and a reader
    const mags = basic(TX.magazines(rnd), 0.9);
    const mr = mesh(new THREE.PlaneGeometry(4.5, 0.42), mags, x0 + 0.62, 0.88, cz - 0.6);
    mr.rotation.y = -Math.PI / 2; mr.rotateX(-0.35);
    mesh(box(0.5, 0.55, 4.6), std(0x7d8590, { roughness: 0.4, metalness: 0.3 }), x0 + 0.85, 0.43, cz - 0.6);
    person(x0 + 1.4, cz - 1.0, -Math.PI / 2, 0x3b4a6b);
    // register counter, hot-snack case, coffee machine, clerk
    const cxr = x0 + 2.2, czr = z1 - 2.4;
    // real registers on the counter, facing the customers

    place(scene, 'cardboard_box_01', x1 - 0.9, 0.16, z0 + 0.5, 0.4); place(scene, 'cardboard_box_01', x1 - 0.85, 0.5, z0 + 0.55, 1.1, { s: 0.9 });
    mesh(box(0.8, 1.0, 3.2), surf('metal_plate', 0.6, 1, { color: 0xd8dbe0 }), cxr, 0.65, czr);
    mesh(box(0.85, 0.05, 3.3), std(0x5a5e66, { roughness: 0.3 }), cxr, 1.17, czr);
    for (const dz of [-0.8, 0.6]) {
      place(scene, 'CashRegister_01', cxr + 0.05, 1.195, czr + dz, -Math.PI / 2, { s: 0.6 });
    }
    const sc = mesh(box(0.55, 0.5, 0.9), [dark, basic(TX.snackCase(), 1.3), dark, dark, dark, dark], cxr - 0.05, 1.44, czr - 1.8);
    mesh(box(0.4, 0.65, 0.45), std(0x1c1d21, { roughness: 0.3, metalness: 0.4 }), cxr + 0.1, 1.52, czr + 1.25);
    person(cxr + 0.9, czr - 0.2, -Math.PI / 2, 0x2f8f5b);
    // ATM and copier by the far wall
    mesh(box(0.7, 1.6, 0.8), std(0x9aa0a8, { roughness: 0.4, metalness: 0.4 }), x0 + 1.0, 0.95, z0 + 0.8);
    mesh(new THREE.PlaneGeometry(0.4, 0.3), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 0.8, 1.4) }), x0 + 0.64, 1.25, z0 + 0.8).rotation.y = -Math.PI / 2;
    mesh(box(0.8, 1.1, 1.0), std(0xe8e9ec, { roughness: 0.5 }), x0 + 2.2, 0.7, z0 + 0.8);

    // ---- glass front: frames, transom posters, automatic door ----
    const glass = new THREE.MeshStandardMaterial({ color: 0xcfe3ff, transparent: true, opacity: 0.1, roughness: 0.03, metalness: 0.9, depthWrite: false });
    const dz0 = z1 - 2.6;
    for (const [a, b] of [[z0, dz0 - 0.9], [dz0 + 0.9, z1]]) { const gp = mesh(new THREE.PlaneGeometry(b - a, 2.6), glass, x0 + 0.02, 1.45, (a + b) / 2); gp.rotation.y = -Math.PI / 2; }
    for (let z = z0; z <= z1 + 0.01; z += 1.5) batch(box(0.1, 2.75, 0.08), frameMat, x0, 1.5, z);
    batch(box(0.12, 0.1, w), frameMat, x0, 0.2, cz); batch(box(0.12, 0.1, w), frameMat, x0, 2.78, cz);
    const posters = basic(TX.konbiniPosters(), 1.0);
    const pp = mesh(new THREE.PlaneGeometry(w - 0.2, 0.5), posters, x0 - 0.005, 3.08, cz);
    pp.rotation.y = -Math.PI / 2;
    const dz = z1 - 2.6;
    for (const e of [-0.95, 0.95]) batch(box(0.16, 2.6, 0.1), steelMat, x0 - 0.02, 1.45, dz + e);
    batch(box(0.16, 0.25, 2.0), steelMat, x0 - 0.02, 2.8, dz);
    const autoLbl = new THREE.MeshBasicMaterial({ map: TX.binLabel('自動ドア', '#14a39a'), color: new THREE.Color(1.2, 1.2, 1.2) });
    mesh(new THREE.PlaneGeometry(0.4, 0.2), autoLbl, x0 - 0.04, 2.45, dz).rotation.y = -Math.PI / 2;
    doors.add({ kind: 'auto', x: x0, z: dz, w: 1.8, h: 2.3, along: 'z', face: -1, sound: 'konbini' });
    flat(1.4, 2.2, x0 - 0.75, dz, std(0x2b2e34, { roughness: 0.95 }), 0.156);

    const band = basic(TX.konbiniBand(), 1.1);
    mesh(box(0.3, 1.2, w + 0.2), [wallM, band, wallM, wallM, wallM, wallM], x0 - 0.05, 3.75, cz);
    // projecting star light-box at the corner
    const star = basic(TX.signH('★', '#ffffff', '#ff8a1f'), 1.4);
    mesh(box(0.7, 0.7, 0.16), [edgeMat, edgeMat, edgeMat, edgeMat, star, star], x0 - 0.4, 3.75, z0 + 0.2);

    // ---- outside: recycling station, umbrella stand, ashtray ----
    const bins = [['燃えるゴミ', '#c0392b'], ['カン・ビン', '#1d4fb8'], ['ペットボトル', '#2f8f5b'], ['プラ', '#e67e22']];
    bins.forEach(([t, c], i) => {
      const bz = z0 + 0.7 + i * 0.55;
      mesh(new RoundedBoxGeometry(0.45, 0.85, 0.5, 2, 0.04), std(0xcfd3d8, { roughness: 0.4, metalness: 0.2 }), x0 - 0.3, 0.58, bz);
      mesh(new THREE.PlaneGeometry(0.4, 0.2), basic(TX.binLabel(t, c), 0.9), x0 - 0.53, 0.82, bz).rotation.y = -Math.PI / 2;
      mesh(new THREE.CircleGeometry(0.08, 16), dark, x0 - 0.53, 0.62, bz).rotation.y = -Math.PI / 2;
    });
    collide(x0 - 0.6, x0, z0 + 0.4, z0 + 2.9);
    const ux = x0 - 0.35, uz = dz + 1.5;
    mesh(box(0.35, 0.55, 0.6), std(0x8a9099, { metalness: 0.6, roughness: 0.4 }), ux, 0.43, uz);
    const clear = new THREE.MeshStandardMaterial({ color: 0xeef4ff, transparent: true, opacity: 0.45, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false });
    for (let i = 0; i < 6; i++) {
      const um = mesh(new THREE.ConeGeometry(0.06, 0.85, 8, 1, true), clear, ux + (rnd() - 0.5) * 0.15, 0.95, uz - 0.22 + i * 0.09);
      um.rotation.z = (rnd() - 0.5) * 0.25; um.rotation.x = (rnd() - 0.5) * 0.2;
      batch(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 5), steelMat, ux + (rnd() - 0.5) * 0.1, 1.45, uz - 0.22 + i * 0.09);
    }
    collide(ux - 0.2, ux + 0.2, uz - 0.32, uz + 0.32);
    mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.9, 16), std(0x6e737a, { metalness: 0.7, roughness: 0.35 }), x0 - 1.1, 0.6, z1 - 0.5);

    const li = new THREE.PointLight(0xf2f8ff, 12, 12, 1.5); li.position.set(x0 + 4, 3.6, cz); scene.add(li);
    const lo = new THREE.PointLight(0xdff0ff, 12, 11, 1.5); lo.position.set(x0 - 1.4, 2.6, cz); scene.add(lo);
    glowPool(x0 - 1.6, 0.156, cz, 3.4, w, 0xe6f3ff, 0.3);
    glowPool(1.5, 0.02, cz, 6, w, 0xe6f3ff, 0.18);
    // walls and shop fittings are solid; the front is open only at the automatic door
    collide(x1 - 0.05, x1 + 0.2, z0 - 0.1, z1 + 0.1); collide(x0, x1, z0 - 0.1, z0 + 0.1); collide(x0, x1, z1 - 0.1, z1 + 0.1);
    collide(x0 - 0.1, x0 + 0.08, z0, dz - 0.9); collide(x0 - 0.1, x0 + 0.08, dz + 0.9, z1);
    for (let i = 0; i < 3; i++) { const sx = x0 + 3.6 + i * 1.6; collide(sx - 0.46, sx + 0.46, cz - 0.4 - gl / 2, cz - 0.4 + gl / 2 + 0.5); }
    collide(fx0 - 0.05, x1, z0, z1);
    collide(cxr - 0.42, cxr + 0.42, czr - 1.65, czr + 1.65);
    collide(x0 + 0.6, x0 + 1.12, cz - 2.9, cz + 1.7);
    collide(x0 + 0.62, x0 + 1.38, z0, z0 + 1.25); collide(x0 + 1.78, x0 + 2.62, z0, z0 + 1.32);
    collide(x0 + 1.25, x0 + 1.55, cz - 1.15, cz - 0.85);
    addRoom({ name: 'Hoshi Mart', jp: 'ほしマート', amb: 'konbini', minX: x0 + 0.05, maxX: x1 - 0.12, minZ: z0 + 0.12, maxZ: z1 - 0.12, ceil: H - 0.12, camDist: 2.8,
      conn: [{ minX: x0 - 0.9, maxX: x0 + 0.4, minZ: dz - 0.75, maxZ: dz + 0.75 }] });
    // the register: pick something, pay, the clerk bows
    const MENU = [['Salmon onigiri', 150], ['Hot coffee', 120], ['Nikuman', 180], ['Karaage-kun', 238], ['Clear umbrella', 550]];
    interactables.push({ pos: new THREE.Vector3(cxr - 0.85, 0, czr - 0.3), r: 1.0, label: 'Pay at the register', action: (api) => {
      api.choose('Hoshi Mart · register', [...MENU.map(([n, y]) => `${n} ¥${y}`), 'Never mind'], (k) => {
        if (k >= MENU.length) return;
        api.sound.beep(); api.addItem(MENU[k][0]);
        api.say([{ who: 'Cashier', text: ['Want it warmed up? …All right. Thank you very much!', 'You fill the cup yourself at the machine. Thank you!', 'Nikuman, still hot. Thank you!', 'Karaage-kun, fresh from the fryer. Thank you!', 'Umbrella, ¥550. The rain is settling in tonight.'][k] }]);
      });
      return null;
    } });
    // the drinks fridge: the door swings open while you choose
    interactables.push({ pos: new THREE.Vector3(fx0 - 0.7, 0, fdz), r: 0.9, label: 'Take a drink', faceYaw: Math.PI / 2, action: (api) => {
      fridgeDoor.want = 1; fridgeDoor.idle = 0; api.sound.door('swing', 1);
      api.choose('Drinks fridge', ['Green tea ¥140', 'Mineral water ¥110', 'Melon soda ¥160', 'Never mind'], (k) => {
        if (k < 3) { api.addItem(['Green tea', 'Mineral water', 'Melon soda'][k]); api.toast('Ice cold.'); }
        setTimeout(() => { fridgeDoor.want = 0; api.sound.door('swing', 0); }, 700);
      });
      return null;
    } });
    // the toilet is busy
    const wc = doors.add({ kind: 'swing', x: x0 + 4.6, z: z0 + 0.12, w: 0.8, along: 'x', face: 1, label: 'toilet door', frame: steelMat, mat: std(0xe8e8e4, { roughness: 0.5 }), sound: 'swing', lock: () => false });
    wc.lockedLines = [{ text: 'Locked. A voice from inside: "Just a minute!"' }];
    mesh(new THREE.PlaneGeometry(0.4, 0.2), basic(TX.binLabel('トイレ', '#1d4fb8'), 1.1), x0 + 4.6, 2.45, z0 + 0.13);

    // backdrop block behind so the sky doesn't show through
    building(1, z0, z1, 12, { line: x1 + 0.3, depth: 10, noFront: true });

    interactables.push({
      pos: new THREE.Vector3(x0 - 0.8, 0, dz), r: 1.7, label: 'Look inside the shop',
      lines: [
        { who: 'Hoshi Mart', text: 'Open 24 hours. So bright compared with the street outside.' },
        { text: 'A student reads manga at the magazine rack. The cashier is arranging fried chicken in the warmer case.' },
        { text: 'Six clear umbrellas still stand in the umbrella stand. Whose, nobody knows.' },
      ],
    });
  }

  // ---------- Game Center Lumina ----------
  // ---------- inside Game Center Lumina ----------
  function arcadeInterior(z0, z1, xf, xb) {
    const cz = (z0 + z1) / 2, H = SHOP_H - 0.06;
    // carpet with neon confetti, a dark ceiling with light strips, walls with posters
    const carpet = TX.canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#1a1030'; g.fillRect(0, 0, w, h);
      const cols = ['#ff4fd8', '#38e8ff', '#ffe14a', '#7cff6a'];
      for (let i = 0; i < 90; i++) { g.strokeStyle = cols[i % 4]; g.lineWidth = 3; const x = Math.random() * w, y = Math.random() * h, a = Math.random() * 6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 12, y + Math.sin(a) * 12); g.stroke(); }
      for (let i = 0; i < 40; i++) { g.fillStyle = cols[i % 4]; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 4, 0, Math.PI * 2); g.fill(); }
    }, { repeat: true });
    carpet.repeat.set(4, 6);
    flat(Math.abs(xb - xf), z1 - z0, (xf + xb) / 2, cz, new THREE.MeshStandardMaterial({ map: carpet, emissive: 0xffffff, emissiveMap: carpet, emissiveIntensity: 0.12, roughness: 0.9 }), 0.155);
    const wallM = new THREE.MeshStandardMaterial({ color: 0x241a38, emissive: 0x0c0818, roughness: 0.7 });
    mesh(box(0.1, H, z1 - z0), wallM, xb - 0.05, H / 2, cz);
    for (const z of [z0 + 0.05, z1 - 0.05]) mesh(box(Math.abs(xb - xf), H, 0.1), wallM, (xf + xb) / 2, H / 2, z);
    const ceil = flat(Math.abs(xb - xf), z1 - z0, (xf + xb) / 2, cz, std(0x0c0a12, { roughness: 0.9 }), H); ceil.rotation.x = Math.PI / 2;
    const strip = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 2.0, 2.2) }), pinkN = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.5, 2.4) }), cyanN = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 2.6, 3) });
    for (let x = xf - 1.2; x > xb + 0.8; x -= 2.4) batch(box(0.25, 0.03, z1 - z0 - 1.5), strip, x, H - 0.02, cz);
    for (const z of [z0 + 0.12, z1 - 0.12]) { batch(box(Math.abs(xb - xf) - 0.4, 0.03, 0.02), pinkN, (xf + xb) / 2, 2.6, z); batch(box(Math.abs(xb - xf) - 0.4, 0.03, 0.02), cyanN, (xf + xb) / 2, 0.5, z); }
    batch(box(0.02, 0.03, z1 - z0 - 0.4), pinkN, xb + 0.11, 2.6, cz);
    // zone signs on the back wall
    const zone = (t, c, z) => { const m = mesh(new THREE.PlaneGeometry(2.2, 0.5), basic(TX.neonText(t, c), 1.6), xb + 0.12, 2.3, z); m.rotation.y = Math.PI / 2; };
    zone('UFO CATCHER', '#ff6fd8', z0 + 3.5); zone('MUSIC GAME', '#38e8ff', cz + 1.5); zone('PRIZE', '#ffe14a', z1 - 2.0);
    lampSpots.push(spot(xf - 2.5, 2.6, z0 + 3.5, { c: 0xff70e0, k: 18, d: 10 }), spot(xf - 4.5, 2.6, z1 - 3.5, { c: 0x60e0ff, k: 18, d: 10 }), spot(xf - 6.5, 2.6, cz, { c: 0xf0e8ff, k: 14, d: 10 }));

    // two rows of claw machines, back to back; the middle one of the front row is yours to play
    const claws = [];
    [0.15, 0.55, 0.85].forEach((h2, i) => { const z = z0 + 1.6 + i * 1.3; claws.push(D.clawMachine(ctx, xf - 2.2, z, Math.PI / 2, h2)); D.clawMachine(ctx, xf - 3.3, z, -Math.PI / 2, (h2 + 0.3) % 1); });
    collide(xf - 3.85, xf - 1.65, z0 + 0.9, z0 + 4.8);
    const won = ['Pink teddy bear', 'Blue teddy bear', 'Yellow teddy bear'];
    claws.forEach((c, i) => interactables.push({ pos: new THREE.Vector3(xf - 1.15, 0, z0 + 1.6 + i * 1.3), r: 0.65, label: 'Play UFO Catcher ¥100', action: (api) => {
      api.start(D.clawGame(c, (a2, ok) => {
        if (ok) { a2.sound.win(); a2.addItem(won[i]); a2.say([{ who: 'UFO Catcher', text: 'The claw holds on all the way to the chute… and drops it! You got it!' }]); }
        else { a2.sound.lose(); a2.say([{ who: 'UFO Catcher', text: ['The plush lifts a little, then slips free. As usual.', 'The claw only pats the plush on the head.', 'So close! One more go?'][Math.floor(Math.random() * 3)] }]); }
      }));
      return null;
    } }));

    // music game cabinets: a big drum, a screen with scrolling notes; play along to the beat
    const notesTex = TX.canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#1a0a2a'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffe14a'; g.fillRect(0, 30, w, 4); for (let i = 0; i < 8; i++) { g.fillStyle = i % 3 ? '#ff3b2f' : '#38a8ff'; g.beginPath(); g.arc(16 + i * 32, 32, 11, 0, Math.PI * 2); g.fill(); } g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.arc(30, 32, 15, 0, Math.PI * 2); g.stroke(); }, { repeat: true });
    notesTex.repeat.set(2, 1);
    updaters.push((t, dt) => { notesTex.offset.x = (notesTex.offset.x + dt * 0.25) % 1; });
    for (const z of [cz + 1.9, cz + 3.5]) {
      const cx2 = xf - 2.0;
      mesh(new RoundedBoxGeometry(0.8, 2.1, 1.3, 2, 0.06), std(0xff8a1c, { roughness: 0.4, emissive: 0x401800 }), cx2 - 0.3, 1.2, z);
      const sc = mesh(new THREE.PlaneGeometry(1.1, 0.5), new THREE.MeshBasicMaterial({ map: notesTex, color: new THREE.Color(1.4, 1.4, 1.4) }), cx2 + 0.11, 1.75, z); sc.rotation.y = Math.PI / 2;
      const dr = mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.36, 24).rotateZ(Math.PI / 2), std(0xd33b2c, { roughness: 0.5 }), cx2 + 0.35, 0.95, z); dr.rotation.y = 0;
      mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.37, 24).rotateZ(Math.PI / 2), std(0xf2ead8, { roughness: 0.6 }), cx2 + 0.35, 0.95, z);
      mesh(new THREE.BoxGeometry(0.3, 0.5, 0.5), std(0x2a1a10), cx2 + 0.35, 0.45, z);
      collide(cx2 - 0.75, cx2 + 0.55, z - 0.65, z + 0.65);
      interactables.push({ pos: new THREE.Vector3(cx2 + 1.0, 0, z), r: 0.7, label: 'Play taiko ¥100', action: (api) => { api.start(drumGame()); return null; } });
    }
    // racing cabinets with seats along the back wall
    for (const z of [z1 - 4.4, z1 - 3.0]) {
      const bx2 = xb + 0.6;
      mesh(new RoundedBoxGeometry(0.9, 1.9, 1.2, 2, 0.06), std(0x1d4fb8, { roughness: 0.4, emissive: 0x081840 }), bx2, 1.1, z);
      const sc = mesh(new THREE.PlaneGeometry(1.0, 0.6), basic(TX.canvasTex(128, 80, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2a4a8a'); gr.addColorStop(0.5, '#ff9a5a'); gr.addColorStop(0.5, '#333'); gr.addColorStop(1, '#555'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(62, 44, 4, 36); g.fillStyle = '#d11'; g.fillRect(50, 58, 28, 14); g.font = `700 12px ${TX.LATIN_FONT}`; g.fillText('LAP 2/3', 6, 14); }), 1.3), bx2 + 0.46, 1.4, z); sc.rotation.y = Math.PI / 2;
      mesh(new THREE.TorusGeometry(0.16, 0.025, 8, 20).rotateY(Math.PI / 2), std(0x111111), bx2 + 0.75, 1.0, z);
      mesh(new RoundedBoxGeometry(0.5, 0.5, 0.55, 2, 0.08), std(0x222222, { roughness: 0.5 }), bx2 + 1.5, 0.45, z);
      mesh(new RoundedBoxGeometry(0.12, 0.7, 0.55, 2, 0.05), std(0x222222, { roughness: 0.5 }), bx2 + 1.78, 0.9, z);
      collide(bx2 - 0.45, bx2 + 0.8, z - 0.6, z + 0.6);
      interactables.push({ pos: new THREE.Vector3(bx2 + 2.1, 0, z), r: 0.7, label: 'Sit at the racing machine', sit: { x: bx2 + 1.5, z, y: 0.65, yaw: -Math.PI / 2, out: { x: bx2 + 2.2, z, y: 0.15 } },
        onSit: (api) => api.say([{ who: 'HOSHIMI DRIFT', text: 'INSERT COIN. The cabinet hums softly; the start lights blink red, red, green!' }]) });
    }
    // purikura booths in the back corner
    const wrap = new THREE.MeshStandardMaterial({ map: TX.purikuraWrap(), roughness: 0.5, emissive: 0xffffff, emissiveMap: TX.purikuraWrap(), emissiveIntensity: 0.25 });
    for (const z of [z0 + 6.2, z0 + 8.0]) {
      mesh(box(1.6, 2.3, 1.6), [wrap, wrap, std(0xf2e8f5), std(0x222222), wrap, wrap], xb + 1.0, 1.3, z);
      for (let k = 0; k < 5; k++) batch(box(0.02, 1.4, 0.18), std(0xff7ac0, { roughness: 0.9 }), xb + 1.82, 1.1, z - 0.36 + k * 0.18);
      collide(xb + 0.2, xb + 1.82, z - 0.8, z + 0.8);
    }
    interactables.push({ pos: new THREE.Vector3(xb + 2.4, 0, z0 + 7.1), r: 1.2, label: 'Photo purikura ¥500', action: (api) => {
      api.ui.fade(() => api.sound.beep(), 0.05);
      setTimeout(() => api.addItem('Purikura stickers'), 900);
      return [{ who: 'Purikura', text: '"3, 2, 1… CHEESE!" Your eyes come out twice as big and your cheeks start to glow.' }];
    } });
    // prize counter with shelves of plushies, a change machine by the door, stairs to 2F (closed)
    const shelfM = std(0xf2f2f2, { roughness: 0.4, emissive: 0x303030 });
    mesh(box(0.6, 1.0, 2.4), std(0x2a1a3a, { roughness: 0.4, emissive: 0x100818 }), xb + 2.4, 0.65, z1 - 1.4);
    batch(box(0.3, 2.0, 2.6), shelfM, xb + 0.35, 1.15, z1 - 1.4);
    for (let r = 0; r < 4; r++) for (let k = 0; k < 7; k++) batch(new THREE.SphereGeometry(0.12, 10, 8), std([0xffb3c7, 0xc8e6ff, 0xfff1a8, 0xd9c2ff, 0xbff0d0][(r + k) % 5], { roughness: 1, emissive: 0x202020 }), xb + 0.38, 0.45 + r * 0.45, z1 - 2.5 + k * 0.36);
    person(xb + 1.5, z1 - 1.4, -Math.PI / 2, 0xd33b2c, 0.15, 1.65, 'push');
    collide(xb, xb + 2.75, z1 - 2.7, z1 - 0.1);
    interactables.push({ pos: new THREE.Vector3(xb + 3.3, 0, z1 - 1.4), r: 1.0, label: 'Prize counter', lines: [{ who: 'Staff', text: 'Trading in tickets? You have… zero. Go play first!' }] });
    mesh(new RoundedBoxGeometry(0.5, 1.5, 0.45, 2, 0.04), std(0xd8dce2, { roughness: 0.35, metalness: 0.5 }), xf - 0.45, 0.9, cz + 1.6);
    mesh(new THREE.PlaneGeometry(0.3, 0.12), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 2.2, 1.0) }), xf - 0.69, 1.3, cz + 1.6).rotation.y = Math.PI / 2;
    collide(xf - 0.7, xf - 0.2, cz + 1.35, cz + 1.85);
    interactables.push({ pos: new THREE.Vector3(xf - 1.1, 0, cz + 1.6), r: 0.8, label: 'Trade ¥1000 for coins', action: (api) => { api.sound.clunk(); return [{ text: 'Ten ¥100 coins clatter down. Enough for a few rounds.' }]; } });
    const stepM = std(0x3a3044, { roughness: 0.6 });
    // stairs up to 2F along the wall, roped off for now
    for (let i = 0; i < 10; i++) batch(box(0.32, 0.18, 1.2), stepM, xf - 3.1 - i * 0.32, 0.24 + i * 0.18, z1 - 0.8);
    batch(box(0.03, 0.03, 1.2), std(0xf2c400), xf - 2.85, 1.0, z1 - 0.8);
    const s2f = mesh(new THREE.PlaneGeometry(1.1, 0.36), basic(TX.signH('2F 準備中', '#140c1c', '#ffcf4f'), 1.2), xf - 2.83, 1.35, z1 - 0.8); s2f.rotation.y = Math.PI / 2;
    collide(xf - 6.4, xf - 2.85, z1 - 1.45, z1 - 0.1);
    addRoom({ name: 'Game Center Lumina', jp: 'ゲームセンター', amb: 'arcade', minX: xb + 0.1, maxX: xf - 0.04, minZ: z0 + 0.12, maxZ: z1 - 0.12, ceil: H, camDist: 2.6,
      conn: [{ minX: xf - 0.4, maxX: xf + 0.9, minZ: cz - 0.9, maxZ: cz + 0.9 }] });
  }

  // ---------- an apartment rooftop: fence, stair house, washing, a bench and the view ----------
  function rooftop(r) {
    const { side, line, d, h, z0, z1 } = r, xa = side * (line + 0.3), xb = side * (line + d - 0.3), x0 = Math.min(xa, xb), x1 = Math.max(xa, xb);
    const fenceT = TX.canvasTex(64, 64, (g, w, hh) => { g.clearRect(0, 0, w, hh); g.strokeStyle = 'rgba(150,160,170,0.9)'; g.lineWidth = 2; for (let i = -64; i < 128; i += 10) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, hh); g.stroke(); g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, hh); g.stroke(); } }, { repeat: true });
    const fm = (len) => { const t = fenceT.clone(); t.needsUpdate = true; t.repeat.set(len / 0.6, 2.5); return new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.4 }); };
    const post = std(0x8a9096, { metalness: 0.6, roughness: 0.4 });
    const edge = (ax, az, bx2, bz) => {
      const len = Math.hypot(bx2 - ax, bz - az), m = mesh(new THREE.PlaneGeometry(len, 1.5), fm(len), (ax + bx2) / 2, h + 0.75, (az + bz) / 2);
      m.rotation.y = Math.atan2(bx2 - ax, bz - az) - Math.PI / 2;
      for (let k = 0; k <= Math.round(len / 2); k++) { const u = k / Math.max(1, Math.round(len / 2)); batch(box(0.05, 1.55, 0.05), post, ax + (bx2 - ax) * u, h + 0.78, az + (bz - az) * u); }
    };
    edge(x0, z0 + 0.3, x1, z0 + 0.3); edge(x0, z1 - 0.3, x1, z1 - 0.3); edge(x0, z0 + 0.3, x0, z1 - 0.3); edge(x1, z0 + 0.3, x1, z1 - 0.3);
    // stair house at the back with a lit steel door
    const sx = side * (line + d - 1.5), sz = z0 + 1.7;
    blockers.push(mesh(box(2.2, 2.6, 2.4), std(0xb8b2a8, { roughness: 0.85 }), sx, h + 1.3, sz));
    mesh(box(2.4, 0.12, 2.6), std(0x5a5e66), sx, h + 2.66, sz);
    const dx = sx - side * 1.11;
    const door = mesh(new THREE.PlaneGeometry(0.9, 2.0), std(0x6a7078, { metalness: 0.6, roughness: 0.4 }), dx, h + 1.0, sz); door.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    mesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.2, 1.8) }), dx - side * 0.12, h + 2.35, sz);
    lampSpots.push(spot(dx - side * 0.5, h + 2.2, sz, { c: 0xffe8c8, k: 10, d: 9 }));
    collide(Math.min(sx - 1.1, sx + 1.1), Math.max(sx - 1.1, sx + 1.1), sz - 1.2, sz + 1.2);
    // washing lines with sheets in the wind, a bench, potted plants, AC units, puddles
    const lz = (z0 + z1) / 2 + 1.0, lx = side * (line + d * 0.45);
    batch(new THREE.CylinderGeometry(0.02, 0.02, Math.min(4, z1 - z0 - 2), 6).rotateX(Math.PI / 2), post, lx, h + 1.7, lz);
    for (const e of [-1, 1]) batch(box(0.05, 1.7, 0.05), post, lx, h + 0.85, lz + e * Math.min(2, (z1 - z0 - 2) / 2));
    for (let k = 0; k < 3; k++) {
      const sheet = mesh(new THREE.PlaneGeometry(0.9, 1.1).translate(0, -0.55, 0), std([0xf2f2ee, 0xa8c8e8, 0xe8c8c8][k], { roughness: 0.95, side: THREE.DoubleSide }), lx, h + 1.68, lz - 1.1 + k * 1.1);
      sheet.rotation.y = Math.PI / 2; sheet.userData = { sp: 1.1 + k * 0.3, ph: k * 2 }; swaying.push(sheet);
    }
    const bxz = side * (line + 1.2), bz = z1 - 1.4;
    mesh(box(0.45, 0.06, 1.4), std(0x8a5a32, { roughness: 0.6 }), bxz, h + 0.45, bz); mesh(box(0.08, 0.45, 1.4), std(0x8a5a32), bxz - side * 0.2, h + 0.7, bz);
    collide(Math.min(bxz - 0.3, bxz + 0.3), Math.max(bxz - 0.3, bxz + 0.3), bz - 0.75, bz + 0.75);
    for (const pz of [z0 + 0.8, z1 - 0.8]) { mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.4, 12), std(0x8a4a2a), side * (line + 0.8), h + 0.2, pz); mesh(new THREE.IcosahedronGeometry(0.35, 1), std(0x2f6b3a, { roughness: 0.8 }), side * (line + 0.8), h + 0.6, pz); }
    for (let k = 0; k < 2; k++) props.ac.push({ x: side * (line + d - 0.8), y: h, z: z1 - 1.2 - k * 1.1, ry: side > 0 ? -Math.PI / 2 : Math.PI / 2, s: 0.75 });
    const pud = mesh(new THREE.CircleGeometry(0.9, 24), new THREE.MeshStandardMaterial({ color: 0x3a4250, roughness: 0.04, metalness: 0.6, transparent: true, opacity: 0.55, depthWrite: false }), side * (line + d * 0.35), h + 0.025, z0 + 2.2);
    pud.rotation.x = -Math.PI / 2; pud.scale.set(1.4, 0.8, 1);
    // on the stair-house roof: a water tank on legs, a solar water heater, an aerial with a dish
    const shTop = h + 2.72, steelR = std(0x8a9096, { metalness: 0.6, roughness: 0.4 });
    for (const [ox, oz] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) batch(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 6), steelR, sx + side * 0.35 + ox, shTop + 0.4, sz - 0.4 + oz);
    batch(new THREE.CylinderGeometry(0.62, 0.62, 1.1, 18), std(0xd8d4cc, { roughness: 0.6 }), sx + side * 0.35, shTop + 1.35, sz - 0.4);
    batch(new THREE.CylinderGeometry(0.64, 0.64, 0.05, 18), steelR, sx + side * 0.35, shTop + 1.92, sz - 0.4);
    const solar = mesh(new THREE.BoxGeometry(1.0, 0.06, 1.6), std(0x1a2a4a, { roughness: 0.2, metalness: 0.6 }), sx - side * 0.45, shTop + 0.5, sz + 0.4); solar.rotation.x = 0.5;
    batch(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 12).rotateX(Math.PI / 2), steelR, sx - side * 0.45, shTop + 0.95, sz + 0.0);
    batch(new THREE.CylinderGeometry(0.025, 0.03, 3.0, 6), steelR, sx - side * 0.9, shTop + 1.5, sz + 1.0);
    for (const [y, l] of [[2.4, 1.2], [2.1, 0.9], [1.8, 0.6]]) batch(box(0.02, 0.02, l), steelR, sx - side * 0.9, shTop + y, sz + 1.0);
    const dish = mesh(new THREE.SphereGeometry(0.3, 16, 8, 0, Math.PI * 2, 0, 0.6), std(0xe8e8e4, { roughness: 0.5, side: THREE.DoubleSide }), sx - side * 0.9, shTop + 1.0, sz + 1.0);
    dish.rotation.x = -1.1; dish.rotation.z = side * 0.4;
    // a little garden along the parapet: planter boxes with leaves and a few tomatoes
    const plx = side * (line + 0.62), leafR = std(0x3a7a3a, { roughness: 0.8 }), tom = std(0xd33b2c, { roughness: 0.4 });
    for (let k = 0; k < 2; k++) {
      const pz = z0 + 1.7 + k * 1.1;
      if (pz > z1 - 2.5) break;
      batch(box(0.45, 0.35, 1.0), std(0x8a5a32, { roughness: 0.7 }), plx, h + 0.18, pz);
      for (let f = 0; f < 5; f++) batch(new THREE.IcosahedronGeometry(0.13, 1), leafR, plx + ((f % 2) - 0.5) * 0.15, h + 0.45 + (f % 3) * 0.06, pz - 0.38 + f * 0.19);
      for (let f = 0; f < 3; f++) batch(new THREE.SphereGeometry(0.035, 8, 6), tom, plx + 0.06, h + 0.5, pz - 0.3 + f * 0.3);
      for (let f = 0; f < 3; f++) batch(new THREE.CylinderGeometry(0.008, 0.008, 0.7, 4), std(0x8a7a5a), plx - 0.1, h + 0.6, pz - 0.35 + f * 0.35);
      collide(Math.min(plx - 0.25, plx + 0.25), Math.max(plx - 0.25, plx + 0.25), pz - 0.52, pz + 0.52);
    }
    // a small table and a folding chair by the bench: two beer cans, an ashtray
    const tx = side * (line + 2.15), tz = z1 - 1.45;
    batch(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 16), std(0xe8e8e4, { roughness: 0.5 }), tx, h + 0.68, tz);
    batch(new THREE.CylinderGeometry(0.03, 0.04, 0.66, 8), steelR, tx, h + 0.34, tz);
    for (const [ox, c] of [[0.1, 0xd8c040], [-0.08, 0xc0c4ca]]) batch(new THREE.CylinderGeometry(0.033, 0.033, 0.12, 10), std(c, { metalness: 0.7, roughness: 0.3 }), tx + ox, h + 0.76, tz + 0.05);
    batch(new THREE.CylinderGeometry(0.06, 0.05, 0.03, 12), std(0x444444), tx - 0.1, h + 0.71, tz - 0.12);
    batch(box(0.42, 0.04, 0.42), std(0x2a7de1, { roughness: 0.5 }), tx + side * 0.6, h + 0.45, tz);
    batch(box(0.04, 0.45, 0.42), std(0x2a7de1, { roughness: 0.5 }), tx + side * 0.8, h + 0.7, tz);
    collide(Math.min(tx - 0.35, tx + side * 0.85), Math.max(tx - 0.35, tx + side * 0.85), tz - 0.35, tz + 0.35);
    // a futon airing over the street-side fence, vent pipes
    const fut = TX.canvasTex(128, 256, (g, w, hh) => { g.fillStyle = '#e8d8e8'; g.fillRect(0, 0, w, hh); for (let i = 0; i < 26; i++) { g.fillStyle = ['#c86a8a', '#6a8ac8', '#e8a040'][i % 3]; g.beginPath(); g.arc(Math.random() * w, Math.random() * hh, 6 + Math.random() * 8, 0, Math.PI * 2); g.fill(); } });
    const fz = (z0 + z1) / 2 - 1.6, ffx = side * (line + 0.3);
    for (const sgn of [-1, 1]) { const f = mesh(new THREE.BoxGeometry(0.06, 0.9, 1.6), std(0xffffff, { map: fut, roughness: 0.95 }), ffx + sgn * side * 0.22, h + 1.15, fz); f.rotation.z = sgn * side * 0.35; }
    for (const vz of [z1 - 0.6, z1 - 0.9]) { batch(new THREE.CylinderGeometry(0.08, 0.08, 0.7, 10), steelR, side * (line + d * 0.6), h + 0.35, vz); batch(new THREE.ConeGeometry(0.14, 0.12, 10), steelR, side * (line + d * 0.6), h + 0.76, vz); }
    // you can walk here; the lift brings you to the stair-house door and takes you back down
    WALK.push({ minX: x0 + 0.35, maxX: x1 - 0.35, minZ: z0 + 0.6, maxZ: z1 - 0.6, minY: h - 1, maxY: h + 2.5 });
    FLOORS.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, y: h });
    const yawFront = Math.atan2(-side, 0);
    r.go = (api) => api.teleport(dx - side * 1.6, h, sz, yawFront);
    interactables.push({ pos: new THREE.Vector3(dx - side * 0.6, h, sz), r: 1.0, label: 'Go down to the lobby', action: (api) => { api.sound.door('swing', 1); const b = r.lobby; api.teleport(b.x, 0.15, b.z, b.yaw); return null; } });
    interactables.push({ pos: new THREE.Vector3(side * (line + 0.9), h, (z0 + z1) / 2), r: 1.6, label: 'Look down at the street', lines: [{ text: 'From the roof, Hoshimi Street looks like a river of lights. Small umbrellas drift along the pavement.' }, { text: 'The wind carries the smell of rain and yakitori smoke from the next alley.' }] });
  }

  // tap along with the drum: a note reaches the line every 0.6 s, E when it does
  function drumGame() {
    let t = 0, hits = 0, n = 0, lastBeat = -1, judged = false, msg = '';
    return {
      begin(api) { api.sound.beep(); },
      update(dt, e, api) {
        t += dt;
        const beat = Math.floor((t - 1.2) / 0.6), phase = ((t - 1.2) % 0.6 + 0.6) % 0.6;
        if (t < 1.2) { api.ui.showPrompt('Ready… press E when ◉ enters the ring'); return true; }
        if (beat !== lastBeat) { if (lastBeat >= 0 && !judged) msg = 'Miss'; lastBeat = beat; judged = false; n++; api.sound.tone(beat % 4 ? 660 : 880, 0, 0.06, 0.04); }
        const near = Math.min(phase, 0.6 - phase) < 0.11;
        if (e && !judged) { judged = true; if (near) { hits++; msg = phase < 0.3 ? 'Good!' : 'Perfect!'; api.sound.burst({ freq: 180, q: 1, dur: 0.15, gain: 0.5 }); } else msg = 'Miss'; }
        const ring = ['◉ ○ ○ ○', '○ ◉ ○ ○', '○ ○ ◉ ○', '○ ○ ○ ◉'][Math.min(3, Math.floor(phase / 0.15))];
        api.ui.showPrompt(`${ring}   ${msg}   ${hits}/${Math.max(0, n - 1)}`);
        if (n > 16) {
          const k = hits / 16;
          (k > 0.6 ? api.sound.win : api.sound.lose).call(api.sound);
          if (k > 0.8) api.addItem('Prize ticket');
          api.say([{ who: 'TAIKO', text: k > 0.8 ? `Almost a full combo! ${hits}/16. The crowd (there is none) cheers.` : k > 0.5 ? `Not bad: ${hits}/16. Your arms are starting to ache.` : `${hits}/16… the rhythm ran off somewhere.` }]);
          return false;
        }
        return true;
      },
    };
  }

  function arcade(z0, z1) {
    const OPEN = 9;
    building(-1, z0, z1, 12, { noFront: true, wall: '#2a2733', depth: 12, open: OPEN });
    const w = z1 - z0, cz = (z0 + z1) / 2, fx = -(LINE - 0.02), ry = Math.PI / 2;
    const face = (geo, mat, x, y, z) => { const m = mesh(geo, mat, x, y, z); m.rotation.y = ry; return m; };
    // glass front with aluminium frames and an automatic door in the middle
    const aGlass = new THREE.MeshStandardMaterial({ color: 0xd8e6ff, transparent: true, opacity: 0.12, roughness: 0.03, metalness: 0.9, depthWrite: false });
    for (let i = 0; i <= 6; i++) { const z = z0 + 0.4 + i * ((w - 0.8) / 6); if (Math.abs(z - cz) > 1.05) batch(box(0.06, 2.8, 0.07), frameMat, fx + 0.04, 1.55, z); }
    for (const [a, b] of [[z0 + 0.4, cz - 1.0], [cz + 1.0, z1 - 0.4]]) face(new THREE.PlaneGeometry(b - a, 2.8), aGlass, fx + 0.03, 1.55, (a + b) / 2);
    for (const z of [cz - 1.0, cz + 1.0]) batch(box(0.08, 2.8, 0.08), frameMat, fx + 0.04, 1.55, z);
    batch(box(0.08, 0.08, 2.0), frameMat, fx + 0.04, 2.4, cz);
    face(new THREE.PlaneGeometry(2.0, 0.5), aGlass, fx + 0.03, 2.68, cz);
    doors.add({ kind: 'auto', x: fx, z: cz, w: 2.0, h: 2.25, along: 'z', face: 1 });
    collide(fx - 0.06, fx + 0.1, z0, cz - 1.0); collide(fx - 0.06, fx + 0.1, cz + 1.0, z1);
    arcadeInterior(z0, z1, -LINE, -(LINE + OPEN));
    // entrance canopy with chasing marquee bulbs
    const cw = 6, cTop = 3.05;
    mesh(box(1.3, 0.16, cw), std(0x1a1622, { roughness: 0.4, metalness: 0.4 }), fx + 0.65, cTop, cz);
    mesh(box(1.25, 0.02, cw - 0.1), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.0, 2.4) }), fx + 0.65, cTop - 0.09, cz);
    const bulbs = [];
    for (let i = 0; i <= 40; i++) bulbs.push(new THREE.Vector3(fx + 1.32, cTop, cz - cw / 2 + (i * cw) / 40));
    for (let i = 1; i < 8; i++) { bulbs.push(new THREE.Vector3(fx + 1.32 - (i * 1.3) / 8, cTop, cz - cw / 2)); bulbs.push(new THREE.Vector3(fx + 1.32 - (i * 1.3) / 8, cTop, cz + cw / 2)); }
    D.bulbChain(ctx, bulbs, [0xfff2c4, 0xffd27a], 7);
    rainSurfaces.push({ x0: fx, x1: fx + 1.3, z0: cz - cw / 2, z1: cz + cw / 2, y: cTop + 0.08, splash: true });
    rainEdges.push({ x: fx + 1.3, y: cTop - 0.08, z0: cz - cw / 2, z1: cz + cw / 2, rate: 4 });
    // neon sign over the canopy and a scrolling LED message board above it
    const neon = basic(TX.neonText('GAME CENTER LUMINA', '#38e8ff'), 1.9);
    face(new THREE.PlaneGeometry(w - 1.5, 1.0), neon, fx + 0.04, 3.75, cz);
    neon.userData.mutable = true; flicker.push({ mat: neon, base: 1.9, t: 0 });
    const led = TX.ledMarquee('★ リズム祭 今週土曜 22:00 ★ 新景品入荷 ★ UFOキャッチャー 1PLAY ¥100 ★ プリクラ NEW ★ 24時間営業 ★ ');
    led.repeat.set(0.45, 1);
    face(new THREE.PlaneGeometry(w - 2, 0.42), new THREE.MeshBasicMaterial({ map: led, color: new THREE.Color(2.2, 2.2, 2.2) }), fx + 0.05, 4.55, cz);
    batch(box(0.12, 0.55, w - 1.8), std(0x111114, { roughness: 0.5 }), fx + 0.01, 4.55, cz);
    updaters.push((t, dt) => { led.offset.x = (led.offset.x + dt * 0.04) % 1; });
    // neon tubes framing the facade, pink and cyan, cycling brightness
    const pink = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.6, 2.4) }), cyan = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 2.6, 3) });
    for (const [zz, m] of [[z0 + 0.25, pink], [z1 - 0.25, cyan]]) mesh(new THREE.CylinderGeometry(0.03, 0.03, 5.0, 8), m, fx + 0.08, 2.75, zz);
    mesh(new THREE.CylinderGeometry(0.03, 0.03, w - 0.5, 8).rotateX(Math.PI / 2), pink, fx + 0.08, 5.25, cz);
    mesh(new THREE.CylinderGeometry(0.03, 0.03, w - 0.5, 8).rotateX(Math.PI / 2), cyan, fx + 0.08, 5.35, cz);
    updaters.push((t) => { const k = 0.6 + 0.4 * Math.sin(t * 2.2); pink.color.setRGB(3 * k, 0.6 * k, 2.4 * k); cyan.color.setRGB(0.4 * (1.6 - k), 2.6 * (1.6 - k), 3 * (1.6 - k)); });
    vSign(-1, z1 - 1.0, 7.4, 'ゲーム', '#16081c', '#ff4fd8', 1.3);
    // UFO catchers out front, under the canopy's edge
    [0.05, 0.6, 0.15].forEach((h, i) => {
      const mz = z0 + 1.8 + i * 1.25;
      D.clawMachine(ctx, -6.3, mz, ry, h);
      collide(-6.85, -5.75, mz - 0.55, mz + 0.55);
      rainSurfaces.push({ x0: -6.8, x1: -5.8, z0: mz - 0.5, z1: mz + 0.5, y: 2.38, splash: true });
    });
    // purikura photo booth with a curtain
    const bz = z1 - 2.7, bx = -6.05;
    const wrap = new THREE.MeshStandardMaterial({ map: TX.purikuraWrap(), roughness: 0.5 });
    mesh(box(1.6, 2.3, 2.0), [wrap, wrap, std(0xf2e8f5), std(0x222222), wrap, wrap], bx, 0.15 + 1.15, bz);
    const curtain = std(0xff7ac0, { roughness: 0.9 });
    for (let k = 0; k < 6; k++) batch(box(0.02, 1.5, 0.16), curtain, bx + 0.81, 1.15, bz - 0.45 + k * 0.18);
    mesh(new THREE.PlaneGeometry(1.5, 0.3), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.6, 2.4) }), bx + 0.81, 2.25, bz).rotation.y = ry;
    collide(bx - 0.8, bx + 0.85, bz - 1.0, bz + 1.0);
    rainSurfaces.push({ x0: bx - 0.8, x1: bx + 0.8, z0: bz - 1.0, z1: bz + 1.0, y: 2.45, splash: true });
    lampSpots.push(spot(-5.2, 2.8, cz, { c: 0xff4fd8, k: 16, d: 11 }), spot(-5.4, 2.0, bz, { c: 0xffb0e0, k: 8, d: 6 }));
    glowPool(-5.4, 0.156, cz, 3, w, 0xff7ae6, 0.45);
    glowPool(-1.5, 0.02, cz, 5, w, 0xb05cff, 0.15);

    const post = mesh(new THREE.PlaneGeometry(0.9, 1.26), basic(TX.poster(), 1.15), fx + 0.03, 1.55, z1 - 0.85);
    post.rotation.y = ry;

    interactables.push({
      pos: new THREE.Vector3(-6.0, 0, z1 - 1.15), r: 1.2, label: 'Read the poster',
      lines: [
        { who: 'Poster', text: 'リズム祭 — RHYTHM NIGHT. Tonight until morning at Game Center Lumina.' },
        { text: 'Small print in the bottom corner: "High score wins a giant cat plush."' },
      ],
    });
    interactables.push({
      pos: new THREE.Vector3(-5.4, 0, z0 + 3.0), r: 1.6, label: 'Try the claw machine',
      lines: [
        { who: 'UFO Catcher', text: '1 PLAY ¥100. The claw drops, grips a pink cat... then lets go right above the chute.' },
        { text: 'As usual.' },
      ],
    });
    interactables.push({
      pos: new THREE.Vector3(-5.0, 0, bz), r: 1.4, label: 'Look at the purikura booth',
      lines: [{ who: 'Purikura', text: 'A photo sticker booth. ¥500 for 4 shots, with bigger eyes and smoother skin built in.' }],
    });
  }

  // ---------- vending machines, cat, bikes, bollards ----------
  let cans = 0;
  // drink vending machine: a real display case of cans and bottles with hot/cold tags and lit buttons
  const VM = {
    back: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 1.04, 1.08) }),
    shelf: std(0xd8dce2, { roughness: 0.3, metalness: 0.4 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xeef6ff, transparent: true, opacity: 0.1, roughness: 0.02, metalness: 0.4, depthWrite: false }),
    hot: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.35, 0.3) }), cold: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.8, 2.2) }),
    btn: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.0, 1.2) }),
    dark: std(0x15171a, { roughness: 0.3 }), coin: std(0x2b2e34, { roughness: 0.35, metalness: 0.6 }),
    drinks: ['#c8102e', '#1b5fbf', '#f2a900', '#2e8b57', '#f4f4f4', '#6b3fa0', '#e05a00', '#3a2414', '#9ad04a', '#111111'].map((c) => std(c, { roughness: 0.25, metalness: 0.5, emissive: new THREE.Color(c).multiplyScalar(0.25) })),
    cap: std(0xf2f2f2, { roughness: 0.4, emissive: 0x555555 }),
    digits: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.4, 0.3) }),
    logo: new Map(),
  };
  const vmRnd = TX.mulberry32(99);
  function vending(x, z, face, body) {
    vends.push({ x, z, face });
    // the real machine (two models, by colour); the hand-built one if they didn't load
    const real = assets?.prop?.(body === '#c8102e' || body === '#2f8f4e' ? 'vending_b' : 'vending_a');
    if (real) {
      const d = real.userData.size.z;   // its depth: the back stays against the wall
      real.position.set(x + face * (d / 2 - 0.39), 0.15, z); real.rotation.y = face > 0 ? Math.PI / 2 : -Math.PI / 2;
      scene.add(real);
    } else {
      const shell = std(body, { roughness: 0.35, metalness: 0.35 });
      mesh(new RoundedBoxGeometry(0.78, 1.83, 1.02, 3, 0.05), shell, x, 0.15 + 0.915, z);
      const ry = face < 0 ? -Math.PI / 2 : Math.PI / 2, X = (o) => x + face * o;
      const plane = (w, h, mat, o, y, dz) => { const m = mesh(new THREE.PlaneGeometry(w, h), mat, X(o), y, z + dz); m.rotation.y = ry; return m; };
      // display case: lit backing, three shelves of drinks, a tag and a button under each
      plane(0.86, 0.98, VM.back, 0.3, 1.43, 0);
      for (let r = 0; r < 3; r++) {
        const y = 1.0 + r * 0.31;
        batch(box(0.16, 0.014, 0.86), VM.shelf, X(0.36), y, z);
        for (let c = 0; c < 6; c++) {
          const dz = -0.36 + c * 0.144, pet = vmRnd() < 0.4, h = pet ? 0.2 : 0.12, m = VM.drinks[Math.floor(vmRnd() * VM.drinks.length)];
          batch(new THREE.CylinderGeometry(pet ? 0.032 : 0.03, pet ? 0.034 : 0.03, h, 12), m, X(0.36), y + 0.008 + h / 2, z + dz);
          if (pet) batch(new THREE.CylinderGeometry(0.016, 0.016, 0.025, 8), VM.cap, X(0.36), y + 0.02 + h, z + dz);
          batch(box(0.006, 0.026, 0.11), r === 0 && c < 3 ? VM.hot : VM.cold, X(0.43), y - 0.025, z + dz);
          batch(new THREE.CylinderGeometry(0.013, 0.013, 0.012, 10).rotateZ(Math.PI / 2), VM.btn, X(0.425), y - 0.06, z + dz + 0.03);
        }
      }
      plane(0.88, 1.0, VM.glass, 0.43, 1.43, 0);
      // lower front: brand panel, coin unit with a display, the take-out bin with its flap
      if (!VM.logo.has(body)) VM.logo.set(body, basic(TX.canvasTex(256, 128, (g, w, h) => {
        g.fillStyle = body; g.fillRect(0, 0, w, h);
        g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.moveTo(0, 90); g.bezierCurveTo(80, 60, 160, 120, 256, 80); g.lineTo(256, 100); g.bezierCurveTo(160, 140, 80, 80, 0, 110); g.fill();
        g.fillStyle = body === '#e9edf2' ? '#1b5fbf' : '#ffffff'; g.font = `900 40px ${TX.LATIN_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('HOSHI', w / 2, 40); g.font = `700 16px ${TX.JP_FONT}`; g.fillText('おいしい水と、お茶', w / 2, 70);
      }), 1.0));
      plane(0.55, 0.28, VM.logo.get(body), 0.395, 0.76, -0.14);
      mesh(new RoundedBoxGeometry(0.06, 0.34, 0.2, 2, 0.02), VM.coin, X(0.41), 0.92, z + 0.33);
      plane(0.12, 0.05, VM.digits, 0.442, 1.02, 0.33);
      batch(box(0.02, 0.006, 0.05), VM.dark, X(0.442), 0.94, z + 0.33);
      batch(box(0.02, 0.03, 0.12), VM.dark, X(0.442), 0.84, z + 0.33);
      mesh(box(0.06, 0.2, 0.64), VM.dark, X(0.41), 0.38, z - 0.08);
      plane(0.6, 0.16, VM.glass, 0.445, 0.38, -0.08);
      mesh(box(0.7, 0.08, 0.95), std(0x1f2125, { roughness: 0.6 }), x, 0.19, z);
    }
    collide(x - 0.42, x + 0.42, z - 0.53, z + 0.53);
    rainSurfaces.push({ x0: x - 0.39, x1: x + 0.39, z0: z - 0.5, z1: z + 0.5, y: 1.98, splash: true });
    lampSpots.push(spot(x + face * 0.7, 1.2, z, { c: 0xdfeeff, k: 5, d: 5 }));
    glowPool(x + face * 0.9, 0.156, z, 1.8, 1.6, 0xdfeeff, 0.35);
    props.trash.push({ x: x + face * 0.15, y: 0.15, z: z + 0.95, ry: 0, s: 0.75 });
    // economy.js: coins that rolled under the machine, and the recycling box for empty cans
    const key = `${x.toFixed(1)},${z.toFixed(1)}`;
    // one spot per machine: with empty cans on you it's the recycling box, otherwise a look underneath
    interactables.push({ pos: new THREE.Vector3(x + face * 0.62, 0, z - 0.2), r: 0.6, get label() { return fx.recycleLabel?.() || 'Look under the machine'; },
      faceYaw: face > 0 ? -Math.PI / 2 : Math.PI / 2, anim: 'pick', hidden: () => !fx.vendCoin,
      action: (api) => (fx.recycleLabel?.() ? fx.recycle(api) : fx.vendCoin(key, api)) });
  }
  const vendingTalk = (x, z) => interactables.push({
    pos: new THREE.Vector3(x, 0, z), r: 1.4, label: 'Buy a drink',
    lines: (api) => {
      if (cans >= 3) return [{ text: `That's ${cans} cans tonight. Maybe that's enough for now.` }];
      if (api?.pay && !api.pay(130, 'Canned coffee')) return [{ text: 'Canned coffee, ¥130. Your wallet comes up short.' }];
      api?.gotCan?.();
      return cans === 0
        ? [{ text: 'The drink machine hums quietly. Hot green tea, canned coffee, melon soda.' }, { text: 'You pick a hot canned coffee. ¥130. You keep the can to recycle.' }]
        : [{ text: 'One more can. Your hands are still warm from the last.' }];
    },
    onDone: (snd) => { if (cans < 3) { snd.clunk(); cans++; } },
  });

  // the rigged cat: sits and idles; its head turns to follow you when you come close
  function catModel(g, x, z, color) {
    g.position.set(x, 0.15, z); g.rotation.y = -Math.PI / 2; scene.add(g);
    // the fur is lit by the street, not glowing (the file has it self-lit); a dark cat gets its texture darkened
    const dark = new THREE.Color(color).getHSL({ h: 0, s: 0, l: 0 }).l < 0.25;
    g.traverse((o) => {
      if (!o.isMesh || !/Somali/i.test(o.material.name)) return;
      o.material = o.material.clone(); o.material.emissive.setRGB(0, 0, 0); o.material.emissiveMap = null;
      if (dark) { o.material.map = null; o.material.color.setRGB(0.018, 0.017, 0.019); o.material.roughness = 0.75; }  // black fur is one colour
    });
    g.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; } });
    const mixer = new THREE.AnimationMixer(g);
    const clip = (n) => g.clips.find((c) => c.name === n);
    const sit = clip('SittingIdle') || clip('Idle');
    if (sit) mixer.clipAction(sit).play();
    mixer.update(Math.random() * 2);
    const head = g.getObjectByName('Head_22');
    const up = new THREE.Vector3(0, 1, 0), qy = new THREE.Quaternion(), qp = new THREE.Quaternion();
    let look = 0;
    updaters.push((t, dt, p) => {
      const dx = p.x - x, dz = p.z - z, d2 = dx * dx + dz * dz;
      if (d2 > 1600) return;   // out of sight: not animated
      mixer.update(dt);
      let target = 0;
      if (d2 < 16) {
        const a = THREE.MathUtils.euclideanModulo(Math.atan2(dx, dz) - g.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
        target = THREE.MathUtils.clamp(a, -1.1, 1.1);
      }
      look += (target - look) * Math.min(1, dt * 3);
      if (head && Math.abs(look) > 0.001) {
        g.updateMatrixWorld(true);
        head.parent.getWorldQuaternion(qp);
        qy.setFromAxisAngle(up, look);
        head.quaternion.premultiply(qp.clone().invert().multiply(qy).multiply(qp));
      }
    });
  }

  function cat(x, z, color = 0x1b1b20, talk = true) {
    // the real cat (rigged, animated); the hand-built one if it didn't load
    const real = assets?.prop?.('cat');
    if (real) catModel(real, x, z, color);
    else {
      const g = new THREE.Group(); g.position.set(x, 0.15, z); g.rotation.y = -Math.PI / 2; scene.add(g);
      const fur = std(color, { roughness: 0.9 });
      const body = mesh(new THREE.SphereGeometry(0.16, 12, 10), fur, 0, 0.16, 0, g); body.scale.set(0.9, 1.15, 1.25);
      const head = new THREE.Group(); head.position.set(0, 0.36, 0.1); g.add(head);
      mesh(new THREE.SphereGeometry(0.1, 12, 10), fur, 0, 0, 0, head);
      for (const s of [-1, 1]) {
        mesh(new THREE.ConeGeometry(0.035, 0.08, 4), fur, s * 0.05, 0.09, 0, head);
        mesh(new THREE.SphereGeometry(0.017, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.7, 0.4) }), s * 0.037, 0.012, 0.086, head);
      }
      const tail = [];
      let parent = new THREE.Group(); parent.position.set(0, 0.06, -0.17); g.add(parent);
      for (let i = 0; i < 5; i++) {
        const seg = new THREE.Group(); seg.position.y = i === 0 ? 0 : 0.08; parent.add(seg);
        mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.09, 6), fur, 0, 0.04, 0, seg);
        seg.rotation.x = -0.35; tail.push(seg); parent = seg;
      }
      updaters.push((t, dt, p) => {
        tail.forEach((s, i) => { s.rotation.z = Math.sin(t * 1.8 + i * 0.6) * 0.25; });
        const dx = p.x - x, dz = p.z - z;
        let target = 0;
        if (dx * dx + dz * dz < 16) {
          const a = THREE.MathUtils.euclideanModulo(Math.atan2(dx, dz) - g.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
          target = THREE.MathUtils.clamp(a, -1.1, 1.1);
        }
        head.rotation.y += (target - head.rotation.y) * Math.min(1, dt * 3);
      });
    }
    collide(x - 0.25, x + 0.25, z - 0.3, z + 0.3);
    const MEOW = [
      'The black cat looks at you for a long time, then yawns.',
      'Its tail sways slowly. It seems to be waiting for someone.',
      'It blinks slowly at you. They say that means trust.',
      'Its fur is dry. It knows the best shelter on this street.',
    ];
    let mi = 0;
    if (talk) interactables.push({
      pos: new THREE.Vector3(x - 0.6, 0, z), r: 1.3, label: 'Greet the cat',
      lines: () => [{ who: 'Cat', text: 'Mew.' }, { text: MEOW[mi++ % MEOW.length] }],
      onStart: (snd) => snd.meow(),
    });
  }

  // mamachari: step-through frame, basket, fenders, spoked wheels
  function bikeAt(x, z, ry, color) { const g = bike(x, z, color, true); g.position.y = 0.02; g.rotation.y = ry; return g; }
  function bike(x, z, color, free = false) {
    const g = new THREE.Group(); g.position.set(x, 0.15, z); scene.add(g); g.userData.static = true; // parked: freeze.js may merge it
    const frame = std(color, { roughness: 0.3, metalness: 0.5 });
    const black = std(0x111111, { roughness: 0.6 }), steel = std(0xc0c4ca, { roughness: 0.25, metalness: 0.9 });
    const V = (y, zz, xx = 0) => new THREE.Vector3(xx, y, zz);
    const tube = (pts, r, mat) => g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, r, 8), mat));
    const R = 0.33;
    const spokes = [];
    for (const wz of [-0.54, 0.54]) {
      const hold = new THREE.Group(); hold.position.set(0, R, wz); hold.rotation.y = Math.PI / 2; g.add(hold);
      hold.add(new THREE.Mesh(new THREE.TorusGeometry(R, 0.022, 8, 36), black));
      hold.add(new THREE.Mesh(new THREE.TorusGeometry(R - 0.03, 0.009, 6, 36), steel));
      for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; spokes.push(0, R, wz, 0, R + Math.sin(a) * (R - 0.03), wz + Math.cos(a) * (R - 0.03)); }
      const fender = new THREE.Mesh(new THREE.TorusGeometry(R + 0.05, 0.016, 4, 20, Math.PI * 0.62), frame);
      fender.rotation.z = Math.PI * 0.19; hold.add(fender);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 8), steel); hub.rotation.x = Math.PI / 2; hold.add(hub);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(spokes, 3));
    g.add(new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0x9ea3a9 })));
    tube([V(0.74, 0.42), V(0.5, 0.3), V(0.32, 0.05), V(0.31, -0.06)], 0.022, frame);
    tube([V(0.31, -0.06), V(0.62, -0.17), V(0.86, -0.25)], 0.02, frame);
    tube([V(0.31, -0.06), V(R, -0.54)], 0.014, frame);
    tube([V(0.74, -0.2), V(R, -0.54)], 0.012, frame);
    tube([V(0.72, 0.42), V(0.98, 0.47)], 0.024, frame);
    for (const s of [-1, 1]) tube([V(0.72, 0.43, s * 0.04), V(0.5, 0.5, s * 0.05), V(R, 0.54, s * 0.05)], 0.011, frame);
    tube([[-0.33, 1.0, 0.36], [-0.2, 1.03, 0.44], [0, 1.03, 0.47], [0.2, 1.03, 0.44], [0.33, 1.0, 0.36]].map(([px, py, pz]) => new THREE.Vector3(px, py, pz)), 0.013, steel);
    for (const s of [-1, 1]) { const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.1, 8), black); grip.rotation.z = Math.PI / 2; grip.position.set(s * 0.33, 1.0, 0.36); g.add(grip); }
    const seat = new THREE.Mesh(new RoundedBoxGeometry(0.15, 0.06, 0.26, 2, 0.025), black); seat.position.set(0, 0.92, -0.27); g.add(seat);
    tube([V(0.86, -0.25), V(0.9, -0.27)], 0.014, steel);
    const basket = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.24, 0.3, 5, 3, 4), new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.8, roughness: 0.3, wireframe: true }));
    basket.position.set(0, 0.86, 0.66); g.add(basket);
    const carrier = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.36), steel); carrier.position.set(0, 0.74, -0.58); g.add(carrier);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.1, 0.5), frame); guard.position.set(0.07, 0.33, -0.3); g.add(guard);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.32, 5), steel); stand.position.set(0.08, 0.14, -0.4); stand.rotation.z = 0.35; g.add(stand);
    g.rotation.z = 0.07;
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    if (!free) collide(x - 0.3, x + 0.3, z - 0.88, z + 0.88);
    return g;
  }

  function bollard(x, z) {
    const m = std(0xd9dde3, { roughness: 0.5 });
    const y0 = 0.15;
    rod(new THREE.Vector3(x, y0, z - 0.3), new THREE.Vector3(x, y0 + 0.8, z - 0.3), 0.03, m);
    rod(new THREE.Vector3(x, y0, z + 0.3), new THREE.Vector3(x, y0 + 0.8, z + 0.3), 0.03, m);
    rod(new THREE.Vector3(x, y0 + 0.8, z - 0.3), new THREE.Vector3(x, y0 + 0.8, z + 0.3), 0.03, m);
    collide(x - 0.1, x + 0.1, z - 0.35, z + 0.35);
  }

  // ---------- utility poles, street lamps, wires ----------
  const poleMat = std(0x6d6a66);
  const sleeveMat = new THREE.MeshStandardMaterial({ map: TX.stripes('#e8c21a', '#151515'), roughness: 0.6 });
  const lampHead = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.4, 1.6), side: THREE.DoubleSide });
  const lampSodium = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.1, 1.1), side: THREE.DoubleSide });
  const lampLed = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.8, 3.2), side: THREE.DoubleSide });
  lampHeads.push([lampSodium, [3, 2.1, 1.1]], [lampLed, [2.6, 2.8, 3.2]]);
  lampSodium.userData.mutable = lampLed.userData.mutable = true; // they dim by day (freeze.js keeps them apart)
  const insMat = std(0xe8e6e0, { roughness: 0.3 });
  const plateMat = std(0xf0f0ea, { roughness: 0.5 });
  const stepGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.24, 5).rotateZ(Math.PI / 2);
  const wireSegs = [];
  const sag = (a, b, s, n = 14) => {
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const p0 = a.clone().lerp(b, t0); p0.y -= s * 4 * t0 * (1 - t0);
      const p1 = a.clone().lerp(b, t1); p1.y -= s * 4 * t1 * (1 - t1);
      wireSegs.push(p0, p1);
    }
  };
  const poles = { '-1': [], '1': [] };
  const lampSpots = [];
  // a light source the nearest-light pool can borrow: colour, intensity, range, flicker factor f
  function spot(x, y, z, { c = 0xffc98a, k = 30, d = 17, street = false } = {}) {
    const v = new THREE.Vector3(x, y, z); v.c = c; v.k = k; v.d = d; v.street = street; v.f = 1; return v;
  }
  const rainLights = Array.from({ length: 8 }, () => new THREE.Vector3(0, -100, 0));
  for (let i = 0; i < 12; i++) {
    for (const side of [1, -1]) {
      const z = 36 - i * 16 - (side < 0 ? 8 : 0);
      if (Math.abs(z - CROSS_Z) < 7 || z < -130) continue;
      const x = side * 4.5;
      batch(new THREE.CylinderGeometry(0.11, 0.15, 9.2, 14), poleMat, x, 4.75, z);
      batch(new THREE.CylinderGeometry(0.165, 0.165, 1.8, 14), sleeveMat, x, 1.05, z);
      batch(box(1.5, 0.1, 0.1), steelMat, x, 8.3, z);
      batch(box(0.9, 0.08, 0.08), steelMat, x, 7.7, z);
      for (const ix of [-0.6, -0.2, 0.2, 0.6]) batch(new THREE.CylinderGeometry(0.035, 0.05, 0.16, 8), insMat, x + ix, 8.43, z);
      // climbing steps spiralling up the pole
      for (let k = 0, y = 2.3; y < 7.4; k++, y += 0.42) {
        const a = k * 2.2 + side;
        batch(stepGeo, steelMat, x + Math.cos(a) * 0.2, y, z - Math.sin(a) * 0.2, a);
      }
      batch(box(0.012, 0.28, 0.13), plateMat, x - side * 0.14, 2.6, z);
      if (rnd() < 0.5) {
        // pole-mounted transformers: finned drums on a bracket, with bushings and drop leads
        for (const tz of [-0.26, 0.26]) {
          const tx = x + side * 0.42;
          batch(new THREE.CylinderGeometry(0.21, 0.21, 0.72, 16), tankMat, tx, 7.1, z + tz);
          for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; batch(box(0.05, 0.6, 0.012), tankMat, tx + Math.cos(a) * 0.22, 7.08, z + tz + Math.sin(a) * 0.22, a); }
          batch(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 16), steelMat, tx, 7.48, z + tz);
          for (const bz of [-0.08, 0.08]) batch(new THREE.CylinderGeometry(0.025, 0.035, 0.16, 8), insMat, tx, 7.6, z + tz + bz);
          wireSegs.push(new THREE.Vector3(tx, 7.68, z + tz), new THREE.Vector3(x, 8.3, z + tz * 0.4));
        }
        batch(box(0.42, 0.07, 0.9), steelMat, x + side * 0.24, 6.7, z);
      }
      // a grey junction box and a coil of spare cable
      if (rnd() < 0.5) batch(box(0.2, 0.42, 0.3), meterMat, x - side * 0.2, 5.0, z);
      if (rnd() < 0.4) batch(new THREE.TorusGeometry(0.22, 0.035, 6, 18).rotateY(Math.PI / 2), dark, x + side * 0.16, 4.4, z);
      // advertising plate strapped to the pole, facing the pavement
      if (rnd() < 0.6) {
        const ad = mesh(new THREE.PlaneGeometry(0.34, 1.8), new THREE.MeshStandardMaterial({ map: TX.poleAd(rnd), roughness: 0.6 }), x + side * 0.17, 3.0, z);
        ad.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
        for (const by of [2.2, 3.8]) batch(new THREE.CylinderGeometry(0.175, 0.175, 0.03, 12), steelMat, x, by, z);
      }
      // guy wire anchoring the pole, with its yellow guard sleeve
      if (rnd() < 0.35) {
        const gx = side * 5.9, gz = z + (rnd() < 0.5 ? -1.6 : 1.6);
        wireSegs.push(new THREE.Vector3(x, 7.6, z), new THREE.Vector3(gx, 0.15, gz));
        const d = new THREE.Vector3(gx - x, 0.15 - 7.6, gz - z), len = 2.0, u = d.clone().normalize();
        const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, len, 8), sleeveMat);
        sl.position.set(gx - u.x * len / 2, 0.15 - u.y * len / 2, gz - u.z * len / 2);
        sl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), u); scene.add(sl);
      }
      collide(x - 0.2, x + 0.2, z - 0.2, z + 0.2); camPole(x, z, 0.17, 9.4);
      // LED street light on a curved arm reaching over the road
      const hx = side * (4.5 - 1.45);
      batch(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(x, 5.5, z), new THREE.Vector3(x, 6.45, z), new THREE.Vector3(hx + side * 0.25, 6.3, z)), 16, 0.035, 6), steelMat, 0, 0, 0);
      batch(new RoundedBoxGeometry(0.62, 0.09, 0.26, 2, 0.04), steelMat, hx, 6.28, z);
      // sodium, LED, or an old lamp that keeps failing
      const kind = rnd() < 0.12 ? 'broken' : rnd() < 0.6 ? 'sodium' : 'led';
      const lc = kind === 'led' ? 0xdfe9ff : 0xffb062;
      const headMat = kind === 'broken' ? lampSodium.clone() : kind === 'led' ? lampLed : lampSodium;
      const lens = mesh(new THREE.PlaneGeometry(0.5, 0.18), headMat, hx, 6.23, z); lens.rotation.x = Math.PI / 2;
      const gp = glowPool(hx, 0.02, z, 7, 7, lc, 0.32);
      const cone = D.lightCone(ctx, hx, 6.2, z, { color: lc });
      gp.userData.dynamic = cone.userData.dynamic = true; // they switch off by day
      lampFx.push({ gp, cone, gpBase: gp.material.color.clone(), coneBase: cone.material.uniforms.strength.value, broken: kind === 'broken' });
      const sp = spot(hx, 6.0, z, { c: lc, k: kind === 'led' ? 26 : 32, street: true });
      if (kind === 'broken') {
        let on = 1, hold = 0;
        const gpBase = gp.material.color.clone(), coneBase = cone.material.uniforms.strength.value;
        updaters.push((t, dt) => {
          if ((hold -= dt) <= 0) { on = Math.random() < 0.7 ? 1 : Math.random() * 0.3; hold = on === 1 ? 0.3 + Math.random() * 3 : 0.03 + Math.random() * 0.15; }
          sp.f = on;
          headMat.color.setRGB(3 * on + 0.05, 2.1 * on + 0.04, 1.1 * on + 0.03);
          gp.material.color.copy(gpBase).multiplyScalar(on);
          cone.material.uniforms.strength.value = coneBase * on;
        });
      }
      if (rnd() < 0.3) props.util.push({ x: side * 4.75, y: 0.15, z: z + 1.0, ry: side > 0 ? -Math.PI / 2 : Math.PI / 2 });
      lampSpots.push(sp);
      poles[side].push({ x, z });
      // service drops to the buildings
      const top = new THREE.Vector3(x, 8.0, z);
      for (let k = 0; k < 2; k++) sag(top, new THREE.Vector3(side * 7, 5 + rnd() * 2.5, z + (rnd() - 0.5) * 8), 0.3, 8);
    }
  }
  for (const side of [-1, 1]) {
    const list = poles[side];
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i], b = list[i + 1];
      for (const [dx, y, sg] of [[-0.6, 8.3, 0.55], [0.6, 8.3, 0.55], [0, 8.95, 0.45], [-0.4, 7.7, 0.7], [0.4, 7.7, 0.75], [0.2, 7.2, 0.9]]) {
        sag(new THREE.Vector3(a.x + dx, y, a.z), new THREE.Vector3(b.x + dx, y, b.z), sg);
      }
    }
  }
  for (let i = 0; i < Math.min(poles[1].length, poles[-1].length); i += 2) {
    const a = poles[1][i], b = poles[-1][i];
    sag(new THREE.Vector3(a.x, 7.9, a.z), new THREE.Vector3(b.x, 7.9, b.z), 0.4);
  }
  // a small pool of real lights hops to the lamps nearest the player
  for (const [x, z] of [[-3.5, CROSS_Z + 3], [3.5, CROSS_Z - 3]]) {
    const sx = Math.sign(x) * 6.2;
    mesh(new THREE.CylinderGeometry(0.1, 0.12, 6, 8), poleMat, sx, 3.15, z);
    mesh(box(Math.abs(sx - x), 0.06, 0.06), poleMat, (sx + x) / 2, 5.75, z);
    mesh(box(0.5, 0.12, 0.26), lampHead, x, 5.7, z);
    glowPool(x, 0.02, z, 7, 7, 0xffc98a, 0.32);
    D.lightCone(ctx, x, 5.63, z, { h: 5.5 });
    collide(sx - 0.15, sx + 0.15, z - 0.15, z + 0.15); camPole(sx, z, 0.13, 6.2);
    lampSpots.push(new THREE.Vector3(x, 5.45, z));
  }
  // the nearest lamp is a shadow-casting spot, the rest are point lights
  const shadowLamp = new THREE.SpotLight(0xffc98a, 34, 19, 1.15, 0.65, 1.5);
  shadowLamp.castShadow = true;
  shadowLamp.shadow.mapSize.set(1024, 1024);
  shadowLamp.shadow.camera.near = 0.5; shadowLamp.shadow.camera.far = 19;
  shadowLamp.shadow.bias = -0.0004; shadowLamp.shadow.normalBias = 0.03;
  shadowLamp.shadow.camera.up.set(0, 0, 1); // it points straight down, so the default up (0,1,0) is degenerate
  scene.add(shadowLamp, shadowLamp.target);
  shadowLampRef = shadowLamp;
  const pool = [shadowLamp, ...Array.from({ length: 7 }, () => { const L = new THREE.PointLight(0xffc98a, 30, 17, 1.5); scene.add(L); return L; })];
  let poolT = 0;
  // the shadow lamp on its lamp: pointing down; a ceiling light spreads wide and close, a street lamp throws a
  // narrower, longer cone
  const aimShadow = (v, fade, indoor) => {
    assign(shadowLamp, v, fade);
    shadowLamp.target.position.set(v.x, v.y - 3, v.z);
    shadowLamp.angle = indoor ? 1.45 : 1.15; shadowLamp.penumbra = indoor ? 0.9 : 0.65;
  };
  // Lights stay on their lamp while it's among the nearest; only a lamp that newly comes into range gets a light,
  // which fades in there (so walking or running past lamps never makes the lighting pulse)
  const assign = (L, v, fade) => { if (L.userData.spot !== v && fade) L.userData.fade = 0; L.position.copy(v); L.color.setHex(v.c ?? 0xffc98a); L.distance = v.d ?? 17; L.userData.spot = v; L.userData.k = v.k ?? 30; };
  const lastP = new THREE.Vector3(); let vS = 0;
  updaters.push((t, dt, p) => {
    // how fast you're going (on foot or at the wheel), smoothed; a jump (teleport, a door) doesn't count
    const step = Math.hypot(p.x - lastP.x, p.z - lastP.z); lastP.copy(p);
    if (dt > 0 && step < 5) vS += (step / dt - vS) * Math.min(1, dt * 3);
    if ((poolT -= dt) <= 0) {
      poolT = 0.2;
      const room = roomAt(p);
      if (room !== inRoom) { inRoom = room; updateShadows(); }
      // a lamp on another level counts as further away: one below you (the street, seen from the expressway) or far
      // above (the expressway's, seen from the street under it). On the deck its own lamps light you, not the street's
      const lvl = (v) => (Math.max(0, p.y - (v.y ?? 5) - 2) ** 2 + Math.max(0, (v.y ?? 5) - p.y - 12) ** 2) * 12;
      const byDist = (list) => list.map((v) => [v, (v.x - p.x) ** 2 + (v.z - p.z) ** 2 + lvl(v)]).sort((a, b) => a[1] - b[1]).map((n) => n[0]);
      const inside = (v) => room && v.x > room.minX - 0.3 && v.x < room.maxX + 0.3 && v.z > room.minZ - 0.3 && v.z < room.maxZ + 0.3 && v.y > room.y && v.y < room.ceil + 0.6;
      const own = room?.fixtures ? byDist([...room.fixtures, ...lampSpots.filter(inside)]) : [];
      const near = [...own, ...byDist(lampSpots).filter((v) => !own.includes(v))];
      let street = own[0] || near.find((v) => v.street) || near[0];
      // the shadow lamp keeps its lamp until another is clearly nearer (no flipping between two), and when it does
      // move it fades out, hops and fades back in like the others — driving past lamps used to make it jump
      const cur = shadowLamp.userData.next || shadowLamp.userData.spot, d2 = (v) => (v.x - p.x) ** 2 + (v.z - p.z) ** 2 + lvl(v);
      if (cur && cur !== street && !own.length && cur.street && near.includes(cur) && Math.sqrt(d2(cur)) < Math.sqrt(d2(street)) * 1.3 + 2) street = cur;
      const indoorNow = own.length > 0;
      shadowLamp.userData.indoor = indoorNow;
      // driving: lamps go by every half second, too quick for the one shadow lamp to follow without pulsing; it rests
      // (fades out) and the point lights light the street until you slow down
      const fast = vS > 6 && !indoorNow;
      if (fast) { if (shadowLamp.userData.spot) { shadowLamp.userData.next = null; shadowLamp.userData.leaving = true; } }
      else if (!shadowLamp.userData.spot) aimShadow(street, true, indoorNow);
      else if (shadowLamp.userData.spot !== street) { shadowLamp.userData.next = street; shadowLamp.userData.nextIndoor = indoorNow; }
      else { shadowLamp.userData.next = null; shadowLamp.userData.leaving = false; }   // changed its mind: fade back in
      // the other lights go to the lamps that light you most (strength over distance squared), and a lamp that
      // already has a light keeps it unless another is clearly brighter here — so running past lamps doesn't
      // make lights jump about. A light that must move first fades out where it is, then fades in at the new lamp.
      const others = pool.slice(1);
      const lit = new Set(others.map((L) => L.userData.spot).filter(Boolean));
      const score = (v) => (v.k ?? 30) * (v.street ? lampsOn : 1) / ((v.x - p.x) ** 2 + (v.z - p.z) ** 2 + 9) * (lit.has(v) ? 1.6 : 1) * (own.includes(v) ? 4 : 1);
      const want = near.filter((v) => fast || v !== street).slice(0, 24).sort((a, b) => score(b) - score(a)).slice(0, others.length);
      const taken = new Set();
      for (const L of others) if (L.userData.spot && want.includes(L.userData.spot) && !taken.has(L.userData.spot)) { taken.add(L.userData.spot); L.userData.next = null; L.userData.leaving = false; }
      const todo = want.filter((v) => !taken.has(v));
      for (const L of others) {
        if (L.userData.spot && taken.has(L.userData.spot) && !L.userData.next) continue;
        const v = todo.shift();
        if (!L.userData.spot) { if (v) assign(L, v, true); }
        else if (v) L.userData.next = v;   // fade out first; it moves when dark (below). No new lamp: it stays put
      }
      rainLights.forEach((v, i) => v.copy(near[i] || street));
    }
    for (const L of pool) {
      const U = L.userData;
      // leaving: fade out, then hop to the next lamp (if any) and fade in there
      if (U.next !== undefined && U.next !== null || U.leaving) {
        U.leaving = true;
        U.fade = Math.max(0, (U.fade ?? 1) - dt * 4);
        if (U.fade <= 0) { U.leaving = false; if (U.next) (L === shadowLamp ? aimShadow(U.next, true, U.nextIndoor) : assign(L, U.next, true)); else { U.spot = null; U.k = 0; } U.next = null; }
      } else U.fade = Math.min(1, (U.fade ?? 1) + dt * 3);
      L.intensity = (U.k ?? 30) * (U.spot?.f ?? 1) * (U.spot?.street ? lampsOn : 1) * U.fade;
    }
  });

  const wireGeo = new THREE.BufferGeometry().setFromPoints(wireSegs);
  // (thin lines alias into dashes in the street's mirror image: they stay out of it)
  { const w = new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x07080b })); scene.add(w); reflectSkipLater.push(w); }

  // ---------- railway crossing + night train ----------
  function crossing() {
    const z = CROSS_Z;
    const gtex = TX.gravel(rnd); gtex.repeat.set(60, 1.2);
    flat(240, 4.4, 0, z, new THREE.MeshStandardMaterial({ map: gtex, roughness: 0.95 }), 0.01);
    flat(8, 4.4, 0, z, std(0x2a2b2f, { roughness: 0.7 }), 0.014);
    const railMat = std(0x8d939c, { metalness: 0.85, roughness: 0.3 });
    for (const dz of [-0.55, 0.55]) mesh(box(240, 0.2, 0.08), railMat, 0, 0.1, z + dz);
    const xs = [];
    for (let x = -120; x <= 120; x += 0.7) if (Math.abs(x) > 7.3 && Math.abs(Math.abs(x) - RING.bx) > RING.half + 0.8) xs.push(x);
    const sleepers = new THREE.InstancedMesh(box(0.24, 0.1, 2.3), std(0x4a4038, { roughness: 0.9 }), xs.length);
    const m4 = new THREE.Matrix4();
    xs.forEach((x, i) => { m4.makeTranslation(x, 0.06, z); sleepers.setMatrixAt(i, m4); });
    scene.add(sleepers);

    const buck = new THREE.MeshStandardMaterial({ map: TX.stripes('#f2c400', '#141414', 3), roughness: 0.5 });
    const armTex = TX.stripes('#f2c400', '#141414', 2); armTex.repeat.set(6, 0.3);
    const armMat = new THREE.MeshStandardMaterial({ map: armTex, roughness: 0.5 });
    const lampOff = std(0x3a0a08, { roughness: 0.4 });
    const lampOn = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.35, 0.2) });
    const white = std(0xe8e8e8, { roughness: 0.5 });
    const lamps = [[], []], arms = [];
    const gate = { warn: false, armK: 1 };
    const RB = RING.bx, RO = RING.half + 0.9;
    for (const [sx, sz, cxr] of [[-5.0, z + 2.9, 0], [5.0, z - 2.9, 0], [RB - RO, z + 2.9, RB], [RB + RO, z - 2.9, RB], [-RB - RO, z + 2.9, -RB], [-RB + RO, z - 2.9, -RB]]) {
      const g = new THREE.Group(); g.position.set(sx, 0.15, sz); scene.add(g); g.userData.dynamic = true; // the barrier arms lift
      mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.8, 10), white, 0, 1.9, 0, g);
      for (const r of [Math.PI / 4, -Math.PI / 4]) { const cb = mesh(box(1.3, 0.16, 0.04), buck, 0, 3.35, 0, g); cb.rotation.z = r; }
      mesh(box(0.95, 0.06, 0.06), dark, 0, 2.75, 0, g);
      for (let i = 0; i < 2; i++) {
        for (const f of [1, -1]) {
          const l = mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.06, 16), lampOff, i ? 0.33 : -0.33, 2.75, f * 0.08, g);
          l.rotation.x = Math.PI / 2; l.userData.dynamic = true; lamps[i].push(l);
        }
      }
      const pivot = new THREE.Group(); pivot.position.set(0, 1.0, 0); g.add(pivot);
      const dir = sx < cxr ? 1 : -1;
      mesh(box(cxr ? 3.6 : 4.2, 0.09, 0.09), armMat, dir * (cxr ? 1.8 : 2.1), 0, 0, pivot);
      mesh(box(0.4, 0.25, 0.15), dark, -dir * 0.3, 0, 0, pivot);
      pivot.userData.up = dir * Math.PI / 2 * 0.96;
      pivot.rotation.z = pivot.userData.up;
      arms.push(pivot);
      collide(sx - 0.15, sx + 0.15, sz - 0.15, sz + 0.15); camPole(sx, sz, 0.13, 4.4);
      // the lowered arm itself stops you (only once it's down, along its own line: whoever is already on the
      // crossing drives off through the other lane, as with real half barriers)
      const len = cxr ? 3.6 : 4.2;
      collide(sx, sx + dir * len, sz - 0.15, sz + 0.15, () => gate.warn && gate.armK < 0.35);
    }

    const train = buildTrain(scene, std, 4);
    const TRAIN_LEN = train.userData.length;
    // overhead wires along the line, kept clear of the road and pavements
    const catSkip = (x) => Math.abs(x) < 9 || Math.abs(Math.abs(x) - RING.bx) < 7;
    buildCatenary(scene, std, z, -120, 120, catSkip);
    for (let x = -120; x <= 120; x += 25) if (!catSkip(x)) for (const s of [-1, 1]) camPole(x, z + s * 2.6, 0.13, 6.5);
    train.position.set(-400, 0, z);

    const red = new THREE.PointLight(0xff2a14, 0, 14, 1.6); red.position.set(0, 3, z); scene.add(red);
    const state = gate;

    updaters.push((t, dt, p) => {
      const c = (t + 25) % 60;
      state.warn = c > 44;
      const head = c < 46 ? -400 : -260 + (c - 46) * 32;
      if (head > -300) for (const w of train.userData.wheels) w.rotation.y += dt * 32 / 0.43;
      train.position.x = head;
      train.userData.beam.intensity = head > -300 && head < 200 ? 80 : 0;
      state.armK += ((state.warn ? 0 : 1) - state.armK) * Math.min(1, dt * 1.5);
      for (const a of arms) a.rotation.z = a.userData.up * state.armK;
      const on = Math.floor(t * 2.4) % 2 === 0;
      for (const l of lamps[0]) l.material = state.warn && on ? lampOn : lampOff;
      for (const l of lamps[1]) l.material = state.warn && !on ? lampOn : lampOff;
      red.intensity = state.warn ? 7 : 0;
      sound.bell = state.warn;
      const nx = THREE.MathUtils.clamp(p.x, head - TRAIN_LEN, head);
      sound.trainDist = head < -300 ? 999 : Math.hypot(p.x - nx, p.z - z);
      sound.trainPos = head < -300 ? null : { x: nx, y: 6, z };
    });

    const crossingLines = () => state.warn
      ? [{ text: 'Kan, kan, kan… The barrier comes down. A night train is coming.' }]
      : [{ text: 'A railway crossing. The rails are wet and gleam under the lights.' }, { text: 'A night train passes about once a minute.' }];
    for (const dz of [3.6, -3.6]) {
      interactables.push({ pos: new THREE.Vector3(0, 0, z + dz), r: 2.6, label: 'Look at the crossing', lines: crossingLines });
    }
    return state;
  }

  // ---------- layout ----------
  fill(-1, SW_END, -9);
  arcade(-24, -9);
  fill(-1, -24, -41);
  shrine(-1, -47, -41);
  fill(-1, -47, -61);
  fill(-1, -71, YOKO.z1 + 3.5);
  fill(-1, YOKO.z0 - 3.5, ZMIN);

  fill(1, SW_END, 6);
  konbini(-6, 6);
  fill(1, -6, -61);
  fill(1, -71, PARK.z1);
  fill(1, PARK.z0, ZMIN);

  // closing blocks at both ends of the street
  for (const [zFace, dir] of [[ZMAX, 1], [ZFAR, -1]]) {
    // a 10-window tile repeated across the 140 m face keeps the windows at a real ~2.6 m pitch
    const t = TX.windows(10, 5, '#4f545c', rnd, 'apt');
    for (const m of [t.map, t.emissiveMap]) { m.wrapS = THREE.RepeatWrapping; m.repeat.x = (dir > 0 ? 140 : 60) / 26; m.needsUpdate = true; }
    // the north one is gone since the town grew north (north.js): the shōtengai and the boulevard are there now
    if (dir > 0) continue;
    const front = new THREE.MeshStandardMaterial({ map: t.map, emissive: 0xffffff, emissiveMap: t.emissiveMap, emissiveIntensity: 0.9, roughness: 0.8 });
    const plain = std(0x4f545c);
    const mats = [plain, plain, roofMat, roofMat, plain, plain];
    mats[dir > 0 ? 5 : 4] = front;
    const cb = mesh(box(dir > 0 ? 140 : 60, 15, 10), mats, 0, 7.5, zFace + dir * 5); blockers.push(cb);
    lateFaces.push({ mesh: cb, idx: 4, alongZ: false, fixed: zFace, face: 1, a0: -30, a1: 30, h: 15, d: 10, ground: true });
  }
  // buildings lining the south side of the cross street, facing north
  for (const s of [-1, 1]) {
    for (let x = 21; x < 70; x += 12) {
      const h = 9 + Math.floor(rnd() * 3) * 3, t = TX.windows(5, Math.floor(h / 3), WALLS[Math.floor(rnd() * WALLS.length)], rnd, 'apt');
      const front = new THREE.MeshStandardMaterial({ map: t.map, emissive: 0xffffff, emissiveMap: t.emissiveMap, emissiveIntensity: 0.9, roughness: 0.8 });
      const plain = std(0x4f545c);
      if (Math.abs(x + 6 - RING.bx) < 7) continue;   // the back street comes in here
      const ms = [plain, plain, roofMat, roofMat, front, plain];
      // the corner blocks look onto the back street with their side: windows there too
      if (Math.abs(x + 6 - RING.bx) < 15) ms[Math.sign(RING.bx - (x + 6)) * s > 0 ? 0 : 1] = front;
      const bm = mesh(box(11.6, h, 10), ms, s * (x + 6), h / 2, 31);
      lateFaces.push({ mesh: bm, idx: 4, alongZ: false, fixed: 36, face: 1, a0: s * (x + 6) - 5.8, a1: s * (x + 6) + 5.8, h, d: 10, ground: true });
    }
  }

  // distant skyline
  const skyAd = TX.mulberry32(5150);
  for (let i = 0; i < 40; i++) {
    const side = i % 2 ? 1 : -1;
    const w = 10 + rnd() * 14, h = 18 + rnd() * 30, x = side * (80 + rnd() * 40);   // beyond the back streets
    let z = ZMIN + 20 + rnd() * (LEN - 30);
    // keep the railway corridors clear (the crossing line and the viaduct): slide a tower that would stand on a
    // track out to the nearer side (no extra rnd() calls, so nothing else in the city moves)
    for (const [a, b] of [[CROSS_Z - 4, CROSS_Z + 4], [VIADUCT.z0 - 3, VIADUCT.z1 + 3]]) {
      if (z + w / 2 > a && z - w / 2 < b) z = z < (a + b) / 2 ? a - w / 2 - 0.5 : b + w / 2 + 0.5;
    }
    const t = TX.windows(Math.round(w / 2.4), Math.floor(h / 3), '#2e333b', rnd, 'office');
    if (z + w / 2 > 30) continue;   // north of here is the new town (north.js)
    const front = new THREE.MeshStandardMaterial({ map: t.map, emissive: 0xffffff, emissiveMap: t.emissiveMap, emissiveIntensity: 0.8, roughness: 0.9 });
    const plain = std(0x2e333b);
    const mats = [plain, plain, roofMat, roofMat, plain, plain];
    mats[side > 0 ? 1 : 0] = front;
    mesh(box(10, h, w), mats, x, h / 2, z);
    // now and then a lit advert on its roof, turned to the town, and a red light on the corner
    if (skyAd() < 0.3 && w > 12) {
      const bw = Math.min(w - 3, 12), bh = bw * 192 / 512, fx = x - side * 3;
      batch(facades.adCell(bw, bh, Math.floor(skyAd() * facades.adCount)), facades.adMat, fx - side * 0.1, h + 1.5 + bh / 2, z, side > 0 ? -Math.PI / 2 : Math.PI / 2);
      batch(box(0.2, bh + 0.2, bw + 0.2), steelMat, fx, h + 1.5 + bh / 2, z);
      for (const dz of [-bw / 2 + 0.6, bw / 2 - 0.6]) batch(box(0.15, 1.6, 0.15), steelMat, fx, h + 0.8, z + dz);
    }
  }

  const DW = {
    scene, mesh, batch, std, basic, surf, collide, camPole, colliders, lampSpots, spot, glowPool, interactables, updaters, rainSurfaces, rainEdges, props, sound,
    person: (x, z, ry, c, y0, h, act) => person(x, z, ry, c, y0, h, act), npcSlots,
    bike: (x, z, c) => bike(x, z, c), steam: (x, y, z) => D.steam(ctx, x, y, z), cat: (x, z) => cat(x, z), doors, addRoom,
    bulbs: (pts, cols, sp) => D.bulbChain(ctx, pts, cols, sp), sag: (a, b, d, n) => sag(a, b, d, n),
    facades, lateFace: (f) => lateFaces.push(f),
  };
  buildDistrict(DW);

  // a lit lattice tower on the skyline (past the fog, so it ignores it) and red aviation lights on the tall towers
  {
    const orange = new THREE.LineBasicMaterial({ color: new THREE.Color(2.2, 0.9, 0.3), fog: false });
    const lit = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), fog: false });
    const T = new THREE.Group(); T.position.set(48, 0, 235); scene.add(T);
    const half = (y) => 22 * Math.pow(1 - y / 160, 1.6) + 2.2;
    const pts = [];
    for (let y = 0; y < 150; y += 6) {
      const a = half(y), b = half(y + 6);
      for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) pts.push(new THREE.Vector3(sx * a, y, sz * a), new THREE.Vector3(sx * b, y + 6, sz * b));
      for (const [s1, s2] of [[[1, 1], [-1, 1]], [[-1, 1], [-1, -1]], [[-1, -1], [1, -1]], [[1, -1], [1, 1]]]) {
        pts.push(new THREE.Vector3(s1[0] * a, y, s1[1] * a), new THREE.Vector3(s2[0] * a, y, s2[1] * a));
        pts.push(new THREE.Vector3(s1[0] * a, y, s1[1] * a), new THREE.Vector3(s2[0] * b, y + 6, s2[1] * b));
        pts.push(new THREE.Vector3(s2[0] * a, y, s2[1] * a), new THREE.Vector3(s1[0] * b, y + 6, s1[1] * b));
      }
    }
    T.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), orange));
    for (const [y, w, h] of [[58, half(58) * 2 + 3, 5], [112, half(112) * 2 + 2, 3]]) {
      const deck = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), lit(1.6, 1.5, 1.3)); deck.position.y = y; T.add(deck);
    }
    for (let k = 0; k < 8; k++) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.9 - k * 0.08, 1 - k * 0.08, 5, 8), k % 2 ? lit(2, 2, 2) : lit(2.2, 0.3, 0.2)); seg.position.y = 152 + k * 5; T.add(seg); }
    const beacon = lit(3, 0.2, 0.1), beacons = [];
    const addBeacon = (x, y, z, r = 0.7) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), beacon); m.position.set(x, y, z); scene.add(m); beacons.push(m); };
    addBeacon(48, 193, 235, 1.2);
    for (const o of scene.children) if (o.isMesh && o.geometry.type === 'BoxGeometry' && o.geometry.parameters.height > 30 && Math.abs(o.position.x) > 25) addBeacon(o.position.x, o.geometry.parameters.height + 0.6, o.position.z, 0.45);
    updaters.push((t) => { const on = Math.sin(t * 2.2) > 0.2; beacon.color.setRGB(on ? 3 : 0.15, on ? 0.2 : 0.01, on ? 0.1 : 0.01); });
    fx.far = [T, ...beacons]; // hidden in thick mist (they ignore fog)
  }

  // rooms reached by a fade (karaoke booth, apartment 305, the train), and the apartment rooftops
  const pockets = buildPockets({ scene, mesh, batch, std, basic, collide, interactables, updaters, lampSpots, spot, addRoom, sound, doors, WALK, FLOORS, surf, npcSlots });
  if (shopCtx) shopCtx.pockets = pockets;
  DW.pockets = pockets;
  DW.tsukino = buildTsukino(DW);
  for (const r of roofs) rooftop(r);

  const crossState = crossing();
  const signal = D.signals(ctx);
  D.streetFurniture(ctx);
  D.parkedCars(ctx);
  const jx = D.junctions(ctx);
  ctx.walkers = []; // the people on the pavements (walkers.js) — traffic yields to them
  D.traffic(ctx, signal, crossState, jx);

  vending(6.6, 7.0, -1, '#e9edf2');
  vending(6.6, 8.05, -1, '#c8102e');
  vendingTalk(5.75, 7.5);
  vending(-6.6, 20.5, 1, '#1b5fbf');
  vendingTalk(-5.75, 20.5);

  cat(6.35, -7.4);

  bike(6.5, 13.6, 0x2b6cb0);
  bike(6.5, 15.4, 0xd9d9d9);
  bike(6.5, 17.2, 0xb23a3a);

  for (const s of [-1, 1]) { bollard(s * 4.35, 8.0); bollard(s * 4.35, 12.0); }

  // red post box by the konbini
  mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.1, 16), std(0xc81e1e, { roughness: 0.4 }), 4.75, 0.7, -4.6);
  mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.08, 16), std(0xc81e1e, { roughness: 0.4 }), 4.75, 1.29, -4.6);
  collide(4.5, 5.0, -4.85, -4.35);

  updaters.push((t, dt) => {
    for (const f of flicker) {
      if (f.t > 0) {
        f.t -= dt;
        const k = Math.random() < 0.5 ? f.base * 0.25 : f.base;
        f.mat.color.setScalar(f.t > 0 ? k : f.base);
      } else if (Math.random() < 0.0025) f.t = 0.25 + Math.random() * 0.35;
    }
  });

  // =====================================================================================
  // THE RING: two back streets (x = ±RING.bx) joined by the north and the south cross streets, so a car can go
  // all the way round the town. Its own random numbers: nothing built before it moves.
  // =====================================================================================
  let mirrorNeed = false, setMirrorNeed = () => {};
  const ringK = (function ringRoad() {
    const rr = TX.mulberry32(5150);
    const BX = RING.bx, H = RING.half, WK = RING.walk;
    const zN = SW_END, zS = RING.south + RING.sHalf;          // back streets run between the cross streets
    const SS0 = RING.south - RING.sHalf, SS1 = zS;              // south cross street: its road
    const BL = zN - zS, BC = (zN + zS) / 2;
    const XI = BX - H - WK, XO = BX + H + WK;                   // facade lines (45 and 57)
    // no buildings, poles or wires across the railway: the level crossing and the viaduct
    const GAPS = [[CROSS_Z - 4.5, CROSS_Z + 4.5], [VIADUCT.z0 - 3, VIADUCT.z1 + 3]];
    const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
    const segs = [];
    const rsag = (a, b, sg, n = 14) => {
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        const p0 = a.clone().lerp(b, t0); p0.y -= sg * 4 * t0 * (1 - t0);
        const p1 = a.clone().lerp(b, t1); p1.y -= sg * 4 * t1 * (1 - t1);
        segs.push(p0, p1);
      }
    };
    const asph = (u, v) => markWet(SF?.has('asphalt_02') ? SF.mat('asphalt_02', u, v, { wet: 0.5, color: 0x9a9ca2 }) : new THREE.MeshStandardMaterial({ map: xAsph, roughness: 0.3, metalness: 0.15 }), 1);
    const wearT = TX.roadWear(rr);
    const wearMat = (u, v) => {
      const t = wearT.clone(); t.repeat.set(u, v); t.needsUpdate = true;
      return new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -1 });
    };
    const pave = (x0, x1, z0, z1) => {
      const w = Math.abs(x1 - x0), l = Math.abs(z1 - z0);
      mesh(box(w, 0.15, l), markWet(surf('large_grey_tiles', w / 2, l / 2, { wet: 0.7 }), 0.5), (x0 + x1) / 2, 0.075, (z0 + z1) / 2);
      RAISED.push({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1) });
    };
    // curbs: a hair taller than the pavement (their tops must never share a plane), along z or along x
    const curbZ = (x, z0, z1, hh = 0.165) => mesh(box(0.17, hh, Math.abs(z1 - z0)), curbMat, x, hh / 2, (z0 + z1) / 2);
    const curbX = (z, x0, x1, hh = 0.163) => mesh(box(Math.abs(x1 - x0), hh, 0.17), curbMat, (x0 + x1) / 2, hh / 2, z);
    const deck = std(0x2a2b2f, { roughness: 0.7 });
    const tubeLamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.45, 2.5) });

    // ---------- the back streets ----------
    for (const s of [-1, 1]) {
      const x = s * BX;
      flat(H * 2, BL, x, BC, asph(1.75, BL / 4), 0.003).receiveShadow = true;
      flat(H * 2, BL, x, BC, wearMat(1, BL / 16), 0.0045).renderOrder = 1;
      // inner pavement (town side) to the south cross street; outer one round the corner
      pave(s * XI, s * (BX - H), zS, zN);
      pave(s * (BX + H), s * XO, SS0, zN);
      curbZ(s * (BX - H - 0.075), zS, zN);
      curbZ(s * (BX + H + 0.075), SS0, zN);
      for (const k of [-1, 1]) { const f = flat(0.2, BL, x + k * (H - 0.12), BC, flowMat, 0.0075); f.renderOrder = 1; }
      flat(0.15, BL, x - (H - 0.25), BC, edgePaint); flat(0.15, BL, x + (H - 0.25), BC, edgePaint);
      for (let z = zN - 4; z > zS + 2; z -= 6) {
        if (Math.abs(z - CROSS_Z) < 6 || (z > VIADUCT.z0 - 1 && z < VIADUCT.z1 + 1)) continue;
        flat(0.12, 3, x, z, paint);
      }
      // stop line before the level crossing, both ways
      flat(H - 0.3, 0.35, x - s * (H / 2), CROSS_Z + 5.2, paint); flat(H - 0.3, 0.35, x + s * (H / 2), CROSS_Z - 5.2, paint);
      // the level crossing: a deck between the rails
      flat(H * 2 + 0.4, 4.4, x, CROSS_Z, deck, 0.014);
      // under the viaduct: strip lights in the soffit and their glow on the wet road
      const vz = (VIADUCT.z0 + VIADUCT.z1) / 2;
      for (const dz of [-2.2, 2.2]) mesh(box(H * 2 - 1, 0.05, 0.14), tubeLamp, x, VIADUCT.y0 - 0.04, vz + dz);
      glowPool(x, 0.02, vz, 9, 10, 0xe8f0ff, 0.3);
      lampSpots.push(spot(x, VIADUCT.y0 - 0.4, vz, { c: 0xe8f0ff, k: 16, d: 12 }));
    }
    // the north cross street: the corners where the back streets come in, walkable now
    WALK.push({ minX: -XO + 0.25, maxX: XO - 0.25, minZ: zN + 0.25, maxZ: 43.7 });

    // ---------- the south cross street ----------
    for (const s of [-1, 1]) {
      const xa = 4, xb = BX + H, L = xb - xa;
      flat(L, SS1 - SS0, s * (xa + xb) / 2, RING.south, asph(L / 4, 2), 0.003).receiveShadow = true;
      flat(L, SS1 - SS0, s * (xa + xb) / 2, RING.south, wearMat(L / 16, 1), 0.0045).renderOrder = 1;
      // north pavement from the main street to the back street (stops 10 cm short of the block fronts)
      pave(s * 4, s * XI, SS1, SS1 + WK - 0.1);
      curbX(SS1 + 0.075, s * 4, s * (XI + 2.4));
      curbZ(s * 4.075, SW_SOUTH, SS1);
      flat(L - 1, 0.15, s * (xa + xb) / 2, SS1 - 0.25, edgePaint);
      for (let xx = 9; xx < xb - 4; xx += 6) if (xx < XI - 4 || xx > XO) flat(3, 0.12, s * xx, RING.south, paint);
      // stop line where the south street meets the back street and the main street
      flat(0.35, H - 0.3, s * (BX - H - 0.9), RING.south - H / 2 - 0.15, paint);
    }
    // south pavement runs the whole way, past the end of the main street
    pave(-XO, XO, SS0 - WK + 0.1, SS0);
    curbX(SS0 - 0.075, -XO, XO);
    flat(2 * (BX + H) - 1, 0.15, 0, SS0 + 0.25, edgePaint);
    // the two signalled T-junctions (details.js junctions): zebras across the main street's mouth and across
    // the cross street either side of it, and stop lines before them
    for (const J of Object.values(D.JUNCTIONS)) {
      const s = J.side;
      for (let x = -3.15; x <= 3.2; x += 0.9) flat(0.45, 3.2, x, J.mouth, paint);
      flat(3.6, 0.35, -s * 1.95, J.mouth + s * 3.2, paint);
      const z0 = Math.min(J.near, J.far), z1 = Math.max(J.near, J.far);
      for (const xs of [-J.zx, J.zx]) for (let z = z0 + 0.45; z < z1 - 0.3; z += 0.9) flat(3.2, 0.45, xs, z, paint);
      // stop lines across the lane heading toward the junction: south of the centre line goes east (+x), north goes west
      flat(0.35, (z1 - z0) / 2 - 0.2, -J.stop, (z0 + J.z) / 2, paint);
      flat(0.35, (z1 - z0) / 2 - 0.2, J.stop, (z1 + J.z) / 2, paint);
    }

    // walking and driving
    for (const s of [-1, 1]) {
      WALK.push({ minX: s > 0 ? XI + 0.25 : -XO + 0.25, maxX: s > 0 ? XO - 0.25 : -XI - 0.25, minZ: SS0 - WK + 0.3, maxZ: zN + 0.5 });
      DRIVE.push({ minX: s > 0 ? XI + 0.3 : -XO + 0.3, maxX: s > 0 ? XO - 0.3 : -XI - 0.3, minZ: SS0 - WK + 0.3, maxZ: 44 });
    }
    WALK.push({ minX: -XO + 0.25, maxX: XO - 0.25, minZ: SS0 - WK + 0.3, maxZ: SS1 + WK - 0.35 });
    DRIVE.push({ minX: -XO + 0.3, maxX: XO - 0.3, minZ: SS0 - WK + 0.3, maxZ: SS1 + WK - 0.4 });

    // ---------- utility poles with LED street lights ----------
    // alongZ: the street runs along z; reach: which way (±1, across the street) the lamp arm reaches
    function utilityPole(px, pz, alongZ, reach) {
      const P = (a, b) => (alongZ ? [px + a * reach, pz + b] : [px + b, pz + a * reach]);
      const ry = alongZ ? 0 : Math.PI / 2;
      batch(new THREE.CylinderGeometry(0.11, 0.15, 9.2, 14), poleMat, px, 4.75, pz);
      batch(new THREE.CylinderGeometry(0.165, 0.165, 1.8, 14), sleeveMat, px, 1.05, pz);
      batch(box(1.5, 0.1, 0.1), steelMat, px, 8.3, pz, ry);
      batch(box(0.9, 0.08, 0.08), steelMat, px, 7.7, pz, ry);
      for (const o of [-0.6, -0.2, 0.2, 0.6]) { const [ix, iz] = P(o, 0); batch(new THREE.CylinderGeometry(0.035, 0.05, 0.16, 8), insMat, ix, 8.43, iz); }
      for (let k = 0, y = 2.3; y < 7.4; k++, y += 0.42) {
        const a = k * 2.2 + reach;
        batch(stepGeo, steelMat, px + Math.cos(a) * 0.2, y, pz - Math.sin(a) * 0.2, a);
      }
      { const [qx, qz] = P(-0.14, 0); batch(box(0.012, 0.28, 0.13), plateMat, qx, 2.6, qz, ry); }
      if (rr() < 0.4) {
        // pole-mounted transformers on the side away from the road
        for (const t of [-0.26, 0.26]) {
          const [tx, tz] = P(-0.42, t);
          batch(new THREE.CylinderGeometry(0.21, 0.21, 0.72, 16), tankMat, tx, 7.1, tz);
          for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; batch(box(0.05, 0.6, 0.012), tankMat, tx + Math.cos(a) * 0.22, 7.08, tz + Math.sin(a) * 0.22, a); }
          batch(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 16), steelMat, tx, 7.48, tz);
          for (const bz of [-0.08, 0.08]) { const [ux, uz] = P(-0.42, t + bz); batch(new THREE.CylinderGeometry(0.025, 0.035, 0.16, 8), insMat, ux, 7.6, uz); }
          const [wx, wz] = P(0, t * 0.4);
          segs.push(V3(tx, 7.68, tz), V3(wx, 8.3, wz));
        }
        const [bx2, bz2] = P(-0.24, 0);
        batch(alongZ ? box(0.42, 0.07, 0.9) : box(0.9, 0.07, 0.42), steelMat, bx2, 6.7, bz2);
      }
      if (rr() < 0.5) { const [mx, mz] = P(-0.2, 0); batch(box(0.2, 0.42, 0.3), meterMat, mx, 5.0, mz, ry); }
      if (rr() < 0.4) { const [cx2, cz2] = P(0.16, 0); batch(new THREE.TorusGeometry(0.22, 0.035, 6, 18).rotateY(alongZ ? Math.PI / 2 : 0), dark, cx2, 4.4, cz2); }
      collide(px - 0.2, px + 0.2, pz - 0.2, pz + 0.2); camPole(px, pz, 0.17, 9.4);
      // the LED head on its curved arm, out over the road
      const [ax, az] = P(1.2, 0), [hx, hz] = P(1.45, 0);
      batch(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(V3(px, 5.5, pz), V3(px, 6.45, pz), V3(ax, 6.3, az)), 16, 0.035, 6), steelMat, 0, 0, 0);
      batch(new RoundedBoxGeometry(0.62, 0.09, 0.26, 2, 0.04), steelMat, hx, 6.28, hz, ry);
      const kind = rr() < 0.08 ? 'broken' : rr() < 0.35 ? 'sodium' : 'led';
      const lc = kind === 'led' ? 0xdfe9ff : 0xffb062;
      const headMat = kind === 'broken' ? lampSodium.clone() : kind === 'led' ? lampLed : lampSodium;
      mesh(new THREE.PlaneGeometry(0.5, 0.18).rotateX(Math.PI / 2).rotateY(ry), headMat, hx, 6.23, hz);
      const gp = glowPool(hx, 0.02, hz, 7, 7, lc, 0.32);
      const cone = D.lightCone(ctx, hx, 6.2, hz, { color: lc });
      gp.userData.dynamic = cone.userData.dynamic = true;
      lampFx.push({ gp, cone, gpBase: gp.material.color.clone(), coneBase: cone.material.uniforms.strength.value, broken: kind === 'broken' });
      const sp = spot(hx, 6.0, hz, { c: lc, k: kind === 'led' ? 26 : 32, street: true });
      if (kind === 'broken') {
        headMat.userData.mutable = true;
        let on = 1, hold = 0;
        const gpBase = gp.material.color.clone(), coneBase = cone.material.uniforms.strength.value;
        updaters.push((t, dt) => {
          if ((hold -= dt) <= 0) { on = Math.random() < 0.7 ? 1 : Math.random() * 0.3; hold = on === 1 ? 0.3 + Math.random() * 3 : 0.03 + Math.random() * 0.15; }
          sp.f = on;
          headMat.color.setRGB(3 * on + 0.05, 2.1 * on + 0.04, 1.1 * on + 0.03);
          gp.material.color.copy(gpBase).multiplyScalar(on);
          cone.material.uniforms.strength.value = coneBase * on;
        });
      }
      lampSpots.push(sp);
      if (rr() < 0.3) { const [ux, uz] = P(-0.75, 1.1); props.util.push({ x: ux, y: 0.15, z: uz, ry: alongZ ? (reach > 0 ? Math.PI / 2 : -Math.PI / 2) : (reach > 0 ? 0 : Math.PI) }); }
      // service drops to the buildings behind
      const top = V3(px, 8.0, pz);
      for (let k = 0; k < 2; k++) { const [dx, dz] = P(-2.15, (rr() - 0.5) * 8); rsag(top, V3(dx, 5 + rr() * 2.5, dz), 0.3, 8); }
      return P;
    }
    // poles in a row, wired together; null breaks the wires (railway)
    const wire = (row) => {
      for (let i = 0; i < row.length - 1; i++) {
        const a = row[i], b = row[i + 1];
        if (!a || !b) continue;
        for (const [d, y, sg] of [[-0.6, 8.3, 0.55], [0.6, 8.3, 0.55], [0, 8.95, 0.45], [-0.4, 7.7, 0.7], [0.4, 7.7, 0.75], [0.2, 7.2, 0.9]]) {
          const [ax, az] = a(d, 0), [bx2, bz2] = b(d, 0);
          rsag(V3(ax, y, az), V3(bx2, y, bz2), sg);
        }
      }
    };
    for (const s of [-1, 1]) {
      const row = [];
      for (let z = zN - 6; z > zS + 2; z -= 20) {
        if (GAPS.some(([g0, g1]) => z > g0 - 2 && z < g1 + 2)) { if (row[row.length - 1]) row.push(null); continue; }
        row.push(utilityPole(s * (BX + H + 0.3), z, true, -s));
      }
      wire(row);
    }
    {
      const row = [];
      for (const x of [-40, -26, -12, 12, 26, 40]) row.push(utilityPole(x, SS0 - 0.3, false, 1));
      wire(row);
    }
    // the main street past the viaduct had no lamps: two poles light the way to the T
    wire([utilityPole(4.5, -172, true, -1), utilityPole(4.5, -190, true, -1)]);
    utilityPole(-4.5, -181, true, 1);
    // the wires strung so far become one mesh (called again for later poles)
    const flushWires = () => {
      if (!segs.length) return;
      const w = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(segs), new THREE.LineBasicMaterial({ color: 0x07080b })); scene.add(w); reflectSkipLater.push(w);
      segs.length = 0;
    };
    flushWires();

    // ---------- ground floors: shutters, lit entrances, little shops, vending machines ----------
    // fixed: the facade's x (alongZ) or z; face: which way it looks (±1); a0..a1: its extent along the street
    const lobbyMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.95, 0.84) });
    function groundFloor(alongZ, fixed, face, a0, a1) {
      const w = a1 - a0, ca = (a0 + a1) / 2;
      if (w < 3) return;
      const Q = (o, t) => (alongZ ? [fixed + face * o, t] : [t, fixed + face * o]);
      const ry = alongZ ? (face > 0 ? Math.PI / 2 : -Math.PI / 2) : (face > 0 ? 0 : Math.PI);
      const B = (across, hh, along) => (alongZ ? box(across, hh, along) : box(along, hh, across));
      const plane = (pw, ph, mat, o, y, t) => { const [x, z] = Q(o, t); const m = mesh(new THREE.PlaneGeometry(pw, ph), mat, x, y, z); m.rotation.y = ry; return m; };
      plane(w - 0.6, 2.7, dark, 0.02, 1.5, ca);
      { const [x, z] = Q(0.15, ca); batch(B(0.3, 0.32, w - 0.2), fasciaEdge, x, 3.0, z); }
      const r = rr();
      const front = { alongZ, fixed, face, a0, a1, kind: r < 0.45 ? 'shutter' : r < 0.78 ? 'lobby' : 'shop' }; fronts.push(front);
      if (r < 0.45) {
        // closed for the night: rolling shutters, sometimes a security light above
        const span = w - 0.8, n = Math.max(1, Math.floor(span / 1.08)), start = a0 + 0.4 + (span - n * 1.08) / 2, graffiti = rr() < 0.3;
        for (let i = 0; i < n; i++) { const [x, z] = Q(0.16, start + (i + 0.5) * 1.08); (graffiti && i % 2 ? props.shutterG : props.shutter).push({ x, y: 0.15, z, ry }); }
        if (rr() < 0.5) { const [x, z] = Q(0, ca + (rr() - 0.5) * (w - 2)); props.secLight.push({ x, y: 3.3, z, ry }); }
      } else if (r < 0.78) {
        // an apartment lobby: lit glass doors under a small canopy, bikes parked outside
        const t = ca + (rr() - 0.5) * Math.max(0, w - 4); front.t = t;
        plane(1.7, 2.3, lobbyMat, 0.03, 1.3, t);
        for (const dt of [-0.88, 0, 0.88]) { const [x, z] = Q(0.05, t + dt); batch(B(0.1, 2.35, 0.07), frameMat, x, 1.32, z); }
        { const [x, z] = Q(0.05, t); batch(B(0.1, 0.08, 1.85), frameMat, x, 2.5, z); }
        { const [x, z] = Q(0.6, t); batch(B(1.2, 0.12, 2.6), slabMat, x, 2.85, z); }
        { const [x, z] = Q(1.1, t); glowPool(x, 0.16, z, alongZ ? 3 : 3.6, alongZ ? 3.6 : 3, 0xfff0d8, 0.38); }
        if (alongZ && rr() < 0.7) {
          const cols = [0x2b6cb0, 0xd9d9d9, 0xb23a3a, 0x3a8a4a, 0x222222];
          const dir = t - a0 > a1 - t ? -1 : 1;
          for (let i = 0; i < 1 + Math.floor(rr() * 3); i++) { const [x, z] = Q(0.5, t + dir * (1.9 + i * 0.85)); if (Math.abs(z - ca) < w / 2 - 0.6) bike(x, z, cols[Math.floor(rr() * cols.length)]); }
        }
      } else {
        // a small shop still open: warm window and a sign over it
        const sw = Math.min(w - 1.2, 4.5), t = ca + (rr() - 0.5) * (w - 1.2 - sw); front.t = t; front.sw = sw;
        // the shop's window: lit rooms from the window atlas (they dim by day like the others)
        for (let k = 0, n = Math.max(1, Math.round(sw / 1.5)); k < n; k++) {
          const [x, z] = Q(0.03, t - sw / 2 + (k + 0.5) * (sw / n));
          const m = mesh(windowGeo(sw / n - 0.08, 1.7, Math.floor(rr() * TX.WINDOW_LIT)), winMat, x, 1.45, z); m.rotation.y = ry;
        }
        { const [x, z] = Q(0.05, t); batch(B(0.1, 0.08, sw + 0.1), frameMat, x, 2.33, z); batch(B(0.1, 0.08, sw + 0.1), frameMat, x, 0.58, z); }
        const [name, bg, fg] = SHOPS[Math.floor(rr() * SHOPS.length)];
        plane(Math.min(sw, 3.2), 0.6, basic(TX.signH(name, bg, fg), 1.25), 0.2, 3.45, t);
        { const [x, z] = Q(1.4, t); glowPool(x, 0.16, z, alongZ ? 3.4 : sw + 1, alongZ ? sw + 1 : 3.4, 0xffd7a0, 0.32); }
        if (alongZ && rr() < 0.6 && w > sw + 2.2) {
          const vt = t + (t > ca ? -1 : 1) * (sw / 2 + 0.75);
          const [x, z] = Q(0.42, vt);
          vending(x, z, face, ['#e9edf2', '#c8102e', '#1b5fbf', '#2f8f4e'][Math.floor(rr() * 4)]);
        }
      }
    }

    // ---------- buildings along the back streets ----------
    // how deep a town-side building can go before it runs into something already there (park, yokochō, station)
    const roomInside = (s, z0, z1) => {
      let lim = 13;
      for (const c of colliders) {
        if (c.maxZ <= z0 || c.minZ >= z1) continue;
        const a = s > 0 ? c.minX : -c.maxX, b = s > 0 ? c.maxX : -c.minX;
        if (b > XI - 14 && a < XI - 0.05) lim = Math.min(lim, XI - b - 0.3);
      }
      return lim;
    };
    for (const s of [-1, 1]) {
      for (const inner of [true, false]) {
        const fxAbs = inner ? XI : XO, face = inner ? s : -s, side = -face, line = s * fxAbs * side;
        const zEnd = inner ? zS + WK : SS0 - WK;
        let z = zN - 10.4;
        while (z > zEnd + 4) {
          let z0 = Math.max(zEnd, z - (8 + rr() * 8));
          const g = GAPS.find(([g0, g1]) => z0 < g1 && z > g0);
          if (g) { if (z > g[1] + 4) z0 = g[1]; else { z = g[0]; continue; } }
          const h = 9 + Math.floor(rr() * 5) * 3;
          let d = 8 + rr() * 5;
          if (inner) d = Math.min(d, roomInside(s, z0, z));
          if (d >= 4) {
            building(side, z0, z, h, { line, noFront: true, depth: d, style: rr() < 0.6 ? 'apt' : 'office' });
            groundFloor(true, s * fxAbs, face, z0, z);
          }
          z = z0 - 0.3;
        }
      }
    }
    // ground floors of the blocks along the south cross street
    for (const f of SOUTH_FRONTS) {
      const a0 = Math.max(f.x0, -XO), a1 = Math.min(f.x1, XO);
      if (a1 - a0 > 3) groundFloor(false, f.z, f.face, a0, a1);
    }
    return { utilityPole, wire, flushWires, groundFloor, pave, curbX, curbZ, asph, wearMat, rsag, roomInside, rr };
  })();

  // ---------- parked vehicles: along the main street's kerbs, delivery trucks and vans half up on the back
  // streets' pavements (as they do in Japan — the lanes stay free), a few on the south street; hazards blinking ----------
  {
    const hazards = [];
    // real models where they loaded (vans alternate between the two), the procedural ones otherwise
    const PARK_MODELS = { truck: ['isuzu_elf'], van: ['hiace_2013', 'carry_minivan'], sedan: ['crown_comfort'], kei: ['daihatsu_cast'], hatch: ['wagonr'] };
    const parkTurn = {};
    const parkReal = (kind, opt) => {
      const keys = (PARK_MODELS[kind] || []).filter((k) => assets?.cars?.[k]);
      if (!keys.length) return null;
      const key = keys[(parkTurn[kind] = (parkTurn[kind] ?? -1) + 1) % keys.length];
      const v = dressVehicle(spawnCar(assets.cars[key], scene), key, { livery: opt.livery ?? 0 });
      v.userData.setLights(0);
      mergeVehicle(v); // parked for good: wheels and all fold into the body
      return v;
    };
    const park = (kind, x, z, yaw, roll = 0, opt = {}) => {
      const holder = new THREE.Group(); holder.position.set(x, roll ? 0.075 : 0, z); holder.rotation.set(0, 0, 0); scene.add(holder);
      const v = parkReal(kind, opt) ?? (kind === 'truck' ? buildTruck(scene, opt) : kind === 'van' ? buildVan(scene, opt) : buildCar(kind, opt.color ?? 0x8a9099, scene));
      scene.remove(v); holder.add(v); v.rotation.y = yaw; v.userData.dynamic = false;
      // tilted across, one side up on the kerb (a roll about the street's direction)
      if (roll) { if (Math.abs(Math.sin(yaw)) > 0.5) holder.rotation.x = roll; else holder.rotation.z = roll; }
      holder.userData.static = true;
      const { L, W } = v.userData, along = Math.abs(Math.sin(yaw)) > 0.5;
      const hx = (along ? L : W) / 2 + 0.05, hz = (along ? W : L) / 2 + 0.05;
      collide(x - hx, x + hx, z - hz, z + hz);
      rainSurfaces.push({ x0: x - hx * 0.8, x1: x + hx * 0.8, z0: z - hz * 0.8, z1: z + hz * 0.8, y: v.userData.size?.y ?? (kind === 'truck' ? 3.0 : kind === 'van' ? 1.9 : 1.4), splash: true });
      if (kind === 'truck' || kind === 'van') { v.userData.amber.userData.mutable = true; hazards.push(v.userData.amber); }
      return v;
    };
    // main street, by the kerb (clear of crossings, the tracks, the viaduct and the junctions)
    park('van', -3.2, 2.5, Math.PI, 0, { color: 0xeef0f2 });
    park('truck', 3.3, -47, 0, 0, { livery: 0 });
    park('sedan', -3.15, -55, Math.PI, 0, { color: 0x2a2d33 });
    park('kei', 3.2, -121, 0, 0, { color: 0xe8d9c4 });
    park('truck', -3.3, -131, Math.PI, 0, { livery: 3 });
    park('van', 3.2, -176, 0, 0, { color: 0x9aa6b2 });
    park('hatch', -3.15, -186, Math.PI, 0, { color: 0x9b1c22 });
    // back streets: half on the town-side pavement
    const PX = RING.bx - RING.half - 0.1;
    for (const [s, list] of [[1, [[12, 'truck', 1], [-40, 'van', 0], [-112, 'truck', 2]]], [-1, [[8, 'van', 0], [-45, 'truck', 0], [-125, 'van', 0]]]]) {
      for (const [z, kind, lv] of list) park(kind, s * PX, z, s > 0 ? Math.PI : 0, s > 0 ? -0.08 : 0.08, { livery: lv, color: [0xeef0f2, 0xdfe6ee, 0x9aa6b2][lv % 3] });
    }
    // south street: on its north pavement's edge
    for (const [x, kind, lv] of [[22, 'van', 0], [36, 'truck', 1], [-24, 'truck', 2], [-38, 'van', 0]]) park(kind, x, RING.south + RING.sHalf + 0.25, x > 0 ? -Math.PI / 2 : Math.PI / 2, -0.08, { livery: lv });
    // hazards: all blink together, the way they do
    const on = new THREE.Color(3.2, 1.6, 0.15), off = new THREE.Color(0.35, 0.18, 0.02);
    updaters.push((t) => { const b = (t % 0.9) < 0.45; for (const m of hazards) m.color.copy(b ? on : off); });
  }

  // ---------- the town north of the cross street (north.js): the arcade, the boulevard and beyond ----------
  const north = buildNorth({
    scene, mesh, box, batch, std, basic, surf, SF, collide, camPole, building, rooftop, roofs, addRoom, FINISHES, RING,
    ...ringK, WALK, DRIVE, RAISED, FLOORS, colliders, blockers, rainEdges, rainSurfaces, lampSpots, spot, glowPool, lampFx, props, updaters,
    lightCone: (x, y, z, o) => D.lightCone(ctx, x, y, z, o), bulbs: (pts, cols, sp) => D.bulbChain(ctx, pts, cols, sp),
    winMat, windowGeo, frameMat, sillMat, slabMat, railMat, balcMat, partMat, capMat, tankMat, steelMat, meterMat, streakMat, roofMat, curbMat,
    facades, lateFace: (f) => lateFaces.push(f), paint, edgePaint, flowMat, markWet, WET, reflectSkip: reflectSkipLater, mirrorNeed: (v) => setMirrorNeed(v), interactables, person: (x, z, ry, c, y0, h, act) => person(x, z, ry, c, y0, h, act), npcSlots, vending, bike, doors, fx: hooks, ctx,
  });
  void north;
  {
    const open = (x, z) => [...WALK, ...DRIVE].some((r) => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ && (r.minY ?? -1) < 0.5 && (r.maxY ?? 9) > 0.1);
    let n = 0;
    for (const f of lateFaces) {
      const ca = (f.a0 + f.a1) / 2, len = f.a1 - f.a0;
      // seen from somewhere you can walk or drive, 2–6 m in front of it (or flagged as seen from the expressway)
      const seen = f.force || [2.5, 6].some((o) => [-0.3, 0, 0.3].some((k) => { const t = ca + k * len; return f.alongZ ? open(f.fixed + f.face * o, t) : open(t, f.fixed + f.face * o); }));
      if (!seen) continue;
      if (f.mesh) { const ms = f.mesh.material.slice(); ms[f.idx] = facades.wallMat(len, f.h); f.mesh.material = ms; }
      facades.face(f.alongZ, f.fixed, f.face, f.a0, f.a1, f.h, { d: f.d ?? 10, top: f.top ?? true, busy: f.busy ?? 1, acFloors: 3 });
      if (f.ground) ringK.groundFloor(f.alongZ, f.fixed, f.face, f.a0, f.a1);
      n++;
    }
    console.info('[ameyoru] detailed', n, 'of', lateFaces.length, 'plain block faces');
  }

  // ---------- neon: signs where facades meet, LED billboards, hologram koi and rings, glow halos (neon.js) ----------
  const neon = buildNeon({ scene, spans, updaters, lampSpots, mergeGeometries, rnd: TX.mulberry32(9090) });

  // ---------- small jobs around town (economy.js runs them through fx.job) ----------
  // people who need a hand, the things they're after, and where those things go
  {
    const giver = (id, x, z, ry, color, label) => {
      person(x, z, ry, color, 0.15, 1.62, 'idle');
      collide(x - 0.25, x + 0.25, z - 0.25, z + 0.25);
      interactables.push({ pos: new THREE.Vector3(x + Math.sin(ry) * 0.9, 0, z + Math.cos(ry) * 0.9), r: 1.0, label, anim: 'talk',
        hidden: () => !fx.job, action: (api) => fx.job(id, 'talk', api) });
    };
    giver('taxi', 13, -194.3, Math.PI, 0x2d3f2a, 'Talk to the taxi driver');
    giver('umbrella', -45.4, -24, Math.PI / 2, 0x6b4a5e, 'Talk to Mrs. Sato');
    giver('letter', -24, 43.4, Math.PI, 0x4a4438, 'Talk to Grandpa Mori');
    giver('cat', 56.6, -112, -Math.PI / 2, 0x3a5f8a, 'Talk to Yui');
    // Ibu Sato's blue umbrella, left at the bus shelter on the station plaza
    const umb = new THREE.Group(); umb.position.set(-8.75, 0.15, -146.9); umb.rotation.z = 0.32; umb.userData.dynamic = true; scene.add(umb);
    const blue = std(0x2456b8, { roughness: 0.5 });
    { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.11, 0.8, 8), blue); c.position.y = 0.55; umb.add(c); }
    { const h = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 12, Math.PI), std(0x2a2420)); h.position.y = 0.1; h.rotation.z = Math.PI; umb.add(h); }
    { const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.0, 6), std(0xc9ced6, { metalness: 0.8, roughness: 0.3 })); sh.position.y = 0.5; umb.add(sh); }
    umb.visible = false;
    interactables.push({ pos: new THREE.Vector3(-9.3, 0, -146.6), r: 0.9, label: 'Take the blue umbrella', anim: 'pick',
      hidden: () => !fx.jobStep || fx.jobStep('umbrella') !== 'find', action: (api) => { umb.visible = false; return fx.job('umbrella', 'found', api); } });
    updaters.push(() => { const show = fx.jobStep?.('umbrella') === 'find'; if (umb.visible !== show) umb.visible = show; });
    // the red post box by the konbini takes Kakek Mori's letter
    interactables.push({ pos: new THREE.Vector3(5.4, 0, -4.6), r: 0.9, label: 'Post the letter', anim: 'push',
      hidden: () => !fx.jobStep || fx.jobStep('letter') !== 'post', action: (api) => fx.job('letter', 'posted', api) });
    // Mochi, Yui's ginger cat, hiding on the west back street by the south corner
    cat(-46.2, -178, 0xd99a5a, false);
    interactables.push({ pos: new THREE.Vector3(-45.6, 0, -178), r: 1.2, label: 'Call Mochi', anim: 'pick',
      hidden: () => !fx.jobStep || fx.jobStep('cat') !== 'find', action: (api) => fx.job('cat', 'found', api) });
  }

  // ---------- street life: pots, menu boards, rubbish out for collection, can bins, roadworks (streetlife.js) ----------
  try { buildStreetLife({ scene, assets, colliders, WALK, interactables, doors, fronts, vends, collide, batch, box, std, updaters }); }
  catch (e) { console.warn('[ameyoru] street life failed', e); }

  // konbini-side bins, alley security lights, manholes
  props.trash.push({ x: 6.55, y: 0.15, z: -6.6, ry: 0.3 }, { x: -6.55, y: 0.15, z: -25, ry: -0.4 }, { x: 6.5, y: 0.15, z: -62.2, ry: 0 });
  props.secLight.push({ x: 7.0, y: 3.2, z: -6.2, ry: -Math.PI / 2 }, { x: -7.0, y: 3.4, z: -24.4, ry: Math.PI / 2 });
  for (const [x, z] of [[1.3, 25], [-1.8, -3], [1.5, -38], [-1.1, -92], [0.4, -112]]) props.manhole.push({ x, y: -0.015, z, ry: x });
  if (assets) {
    assets.place(scene, 'exterior_aircon_unit', ['exterior_aircon_unit'], props.ac);
    assets.place(scene, 'modular_metal_gutter', ['modular_metal_gutter_section'], props.pipe);
    assets.place(scene, 'modular_metal_gutter', ['modular_metal_gutter_funnel'], props.funnel);
    assets.place(scene, 'rollershutter_door', ['rollershutter_door'], props.shutter);
    assets.place(scene, 'rollershutter_door', ['rollershutter_door_graffiti'], props.shutterG);
    const lit = assets.place(scene, 'security_light', ['security_light', 'security_light_glass'], props.secLight);
    let litGlass = null; // one glowing copy of the glass, shared by every cell's lights
    lit.forEach((m) => { if (/glass/i.test(m.material.name)) { if (!litGlass) { litGlass = m.material.clone(); litGlass.emissive = new THREE.Color(1, 0.92, 0.8); litGlass.emissiveIntensity = 2.5; } m.material = litGlass; } });
    assets.place(scene, 'utility_box_01', ['utility_box_01_box'], props.util);
    assets.place(scene, 'metal_trash_can', ['metal_trash_can', 'metal_trash_can_handle_left', 'metal_trash_can_handle_right'], props.trash);
    assets.place(scene, 'water_manhole_cover', ['water_manhole_cover_frame', 'water_manhole_cover'], props.manhole, { shadow: false });
    for (const u of props.util) collide(u.x - 0.3, u.x + 0.3, u.z - 0.3, u.z + 0.3);
    // a few manholes breathe steam into the rain
    props.manhole.filter((_, i) => i % 3 === 1).slice(0, 4).forEach((m) => D.steam(ctx, m.x, 0.05, m.z));
    for (const t of props.trash) collide(t.x - 0.3, t.x + 0.3, t.z - 0.3, t.z + 0.3);
  }

  // merge the static detail per material *and* per 40 m cell, so whole cells can be frustum- and distance-culled
  const CELL = 40, cv = new THREE.Vector3();
  for (const [mat, list] of batches) {
    const cells = new Map();
    for (const it of list) {
      if (!it.g.boundingSphere) it.g.computeBoundingSphere();
      cv.copy(it.g.boundingSphere.center); if (it.m) cv.applyMatrix4(it.m);
      const key = `${Math.floor(cv.x / CELL)},${Math.floor(cv.z / CELL)}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(it);
    }
    for (const part of cells.values()) scene.add(new THREE.Mesh(packMerge(part), mat));
  }
  batches.clear();
  // a guard: refracting glass (transmission) anywhere in town would make three.js draw everything twice a frame
  scene.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) if (m?.transmission > 0) { m.transmission = 0; m.transparent = true; m.opacity = Math.min(m.opacity, 0.45); m.depthWrite = false; m.needsUpdate = true; } });
  scene.traverse((o) => {
    if (!o.isMesh || o === reflector || o.isInstancedMesh && o.count > 500) return;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    if (mat.transparent || mat.isMeshBasicMaterial || mat.isShaderMaterial || mat.isSpriteMaterial) return;
    o.castShadow = true; o.receiveShadow = true;
  });

  // window-grid facades (painted lit windows): dimmed by day, see setDaylight
  const seenM = new Set();
  scene.traverse((o) => {
    const ms = o.material ? [].concat(o.material) : [];
    for (const m of ms) if (m.isMeshStandardMaterial && m.emissiveMap && m.emissiveIntensity >= 0.8 && m.map && !seenM.has(m) && m !== winMat) { seenM.add(m); m.userData.mutable = true; facadeMats.push([m, m.emissiveIntensity, m.color.clone()]); }
  });

  // distance culling: static things past the fog drop out of the render, the reflection and the shadow pass
  // (they move to layer 1, which no camera draws). Only direct children of the scene count: groups that move
  // (cars, trains, doors, claws) keep their own frustum culling.
  const cullList = [];
  const tmpS = new THREE.Sphere();
  for (const o of scene.children) {
    if (o.isGroup && o.userData.static) {
      // parked cars and other still groups: cull every mesh inside together
      const b = new THREE.Box3().setFromObject(o), sp = b.getBoundingSphere(new THREE.Sphere()), meshes = [];
      o.traverse((m) => { if (m.isMesh) meshes.push(m); });
      cullList.push({ o, meshes, x: sp.center.x, z: sp.center.z, r: sp.radius });
      continue;
    }
    if (!(o.isMesh || o.isLineSegments) || o === reflector || o.frustumCulled === false) continue;
    const m0 = Array.isArray(o.material) ? o.material[0] : o.material;
    if (m0?.fog === false) continue;
    if (o.isInstancedMesh) o.computeBoundingSphere();
    const bs = o.isInstancedMesh ? o.boundingSphere : (o.geometry.boundingSphere || (o.geometry.computeBoundingSphere(), o.geometry.boundingSphere));
    if (!bs || !Number.isFinite(bs.radius)) continue;
    o.updateWorldMatrix(true, false);
    tmpS.copy(bs).applyMatrix4(o.matrixWorld);
    if (tmpS.radius > 120) continue; // ground, road and other big pieces stay
    cullList.push({ o, x: tmpS.center.x, z: tmpS.center.z, r: tmpS.radius });
  }
  let cullDist = 70, cullT = 0;
  const REF = { far: 34, small: 11, every: 1 };
  const setLayer = (c, l) => { if (c.meshes) for (const m of c.meshes) m.layers.set(l); else c.o.layers.set(l); };
  // the road mirror only needs what's close: further or small things are left out of the reflection pass
  const refHide = [];
  updaters.push((t, dt, p) => {
    if ((cullT -= dt) > 0) return;
    cullT = 0.25; refHide.length = 0;
    for (const c of cullList) {
      // seeing far (the Sky Deck): only big things far out; the small detail stays within 80 m
      const d = Math.hypot(c.x - p.x, c.z - p.z) - c.r, on = d < cullDist && (cullDist <= 150 || c.r > 5 || d < 80);
      setLayer(c, on ? 0 : 1);
      // puddles only show what's close: big things within ~22 m, small ones within ~9 m
      if (on && (d > REF.far || (c.r < 1.2 && d > REF.small))) refHide.push(c);
    }
  });
  const reflectRender = reflector.onBeforeRender;
  // ...and it is redrawn every other frame (the puddles hold the last image in between)
  let refFrame = 0;
  // things indoors (furniture, people, stand-ins) never show in the street's puddles: skip them in that pass
  const reflectSkip = reflectSkipLater;
  reflector.onBeforeRender = function (...args) {
    // redrawn every frame (REF.every) with only what's near, so every frame costs about the same (no judder)
    if ((refFrame++ % REF.every) !== 0) return;
    for (const c of refHide) setLayer(c, 1);
    const was = reflectSkip.map((o) => o.visible);
    for (const o of reflectSkip) o.visible = false;
    for (const o of PLACED) o.visible && (o.userData.refWas = true, o.visible = false);
    WET.tRefl.value = blankTex;
    reflectRender.apply(this, args);
    WET.tRefl.value = reflector.getRenderTarget().texture;
    WET.uReflInv.value.copy(reflector.matrixWorld).invert();
    for (const o of PLACED) if (o.userData.refWas) { o.visible = true; o.userData.refWas = false; }
    reflectSkip.forEach((o, i) => { o.visible = was[i]; });
    for (const c of refHide) setLayer(c, 0);
  };

  // ---------- room dressing: skirting, ceiling fittings, AC, clock, extinguisher, signs (furnish.js) ----------
  // each room's extras live in a group that's only shown when you're close
  const DRESS = { izakaya: { skirt: 'wood', skip: ['clock', 'camera'] }, kissa: { skirt: 'wood' }, ramen: { skip: ['clock'] }, quiet: { skirt: 'wood' }, karaoke: {}, arcade: { skip: ['clock'] }, pachinko: { skip: ['clock'] } };
  const dressed = [];
  for (const r of ROOMS) {
    const cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2;
    if (r.amb === 'shotengai' || r.amb === 'station' || r.amb === 'skydeck' || cx < -500) continue;
    const grp = dressRoom(scene, r, DRESS[r.amb] || {});
    reflectSkip.push(grp);
    grp.visible = false; grp.userData.dynamic = true;
    dressed.push({ grp, cx, cz });
  }
  let cullPT = 0;
  updaters.push((t, dt, p) => {
    for (const d of dressed) d.grp.visible = Math.abs(p.x - d.cx) < 30 && Math.abs(p.z - d.cz) < 30;
    if ((cullPT -= dt) <= 0) { cullPT = 0.25; cullPlaced(p); }
  });

  // merging what turns out to be static (freeze.js); merged meshes join the distance culling
  // ---------- wet ↔ dry ----------
  // every outdoor surface that was made rain-soaked (low roughness) dries back towards matt, the puddles shrink,
  // the gutters stop running. Indoor floors keep their shine: a material counts as outdoor only if no mesh using
  // it stands inside a room.
  const wetMats = new Set(), indoorMats = new Set(), cw = new THREE.Vector3();
  scene.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    for (const m of [].concat(o.material)) {
      if (!m || m.userData.wetBase === undefined || m.userData.wetBase >= 1 || m === roadMat) continue;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      o.updateWorldMatrix(true, false);
      cw.copy(o.geometry.boundingSphere.center).applyMatrix4(o.matrixWorld);
      if (roomAt({ x: cw.x, y: cw.y, z: cw.z }) || roomAt({ x: cw.x, y: 0.4, z: cw.z })) indoorMats.add(m); else wetMats.add(m);
    }
  });
  for (const m of indoorMats) wetMats.delete(m);
  let wetNow = 1, reflOn = true;
  // open water nearby (the canal, the harbour) needs the mirror even when the streets are dry
  setMirrorNeed = (v) => { if (v === mirrorNeed) return; mirrorNeed = v; reflector.visible = reflOn && (wetNow > 0.06 || mirrorNeed); };
  function setWet(w) {
    w = THREE.MathUtils.clamp(w, 0, 1);
    if (Math.abs(w - wetNow) < 0.002) return;
    wetNow = w;
    dryT.value = (1 - w) * 1.05 - 0.1;
    WET.uWetK.value = w;
    roadMat.roughness = 1 + (0.5 - 1) * w;
    for (const m of wetMats) m.roughness = 1 + (m.userData.wetBase - 1) * w;
    flowMat.opacity = 0.55 * Math.min(1, w * 1.5); flowMat.visible = w > 0.05;
    // with the puddles gone the road mirror shows nowhere: stop drawing it
    reflector.visible = reflOn && (w > 0.06 || mirrorNeed);
  }

  const freezer = makeFreezer(scene, { cullAdd: (m) => {
    const sp = m.geometry.boundingSphere;
    if (sp && sp.radius <= 120) cullList.push({ o: m, x: sp.center.x, z: sp.center.z, r: sp.radius });
  } });
  // the meshes that were folded into the merged ones leave the scene: let go of them here too, or their
  // geometry (hundreds of MB) stays in memory for nothing
  const finishFreeze = freezer.finish;
  freezer.finish = () => {
    const r = finishFreeze();
    for (let i = cullList.length - 1; i >= 0; i--) if (!cullList[i].meshes && !cullList[i].o.parent) cullList.splice(i, 1);
    return r;
  };

  return {
    npcSlots, reflectSkip, freezer, REF, camObs,
    setCull(d) { cullDist = d; cullT = 0; },
    // take a group out of distance culling (a parked car that's being driven)
    uncull(o) { const i = cullList.findIndex((c) => c.o === o); if (i >= 0) { setLayer(cullList[i], 0); cullList.splice(i, 1); } },
    drivable,
    // what the people on the pavements need to know: the crosswalk signal, the level crossing, the junctions
    peds: { signal, crossing: crossState, junctions: jx, list: ctx.walkers },
    setWet, get wet() { return wetNow; }, neon,
    // numbers for the loading screen
    get stats() { return { lamps: lampSpots.length, rooms: ROOMS.length, spots: interactables.length, solids: colliders.length }; },
    setReflections(on) { reflOn = on; WET.uOn.value = on ? 1 : 0; reflector.visible = on && (wetNow > 0.06 || mirrorNeed); },
    colliders, blockers, interactables, sound, reflector, rainLights, rainSurfaces, rainEdges, fx, doors, setDaylight, setShadows,
    update(t, dt, p) { for (const u of updaters) u(t, dt, p); },
  };
}
