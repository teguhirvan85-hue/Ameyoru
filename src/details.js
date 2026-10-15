// Street-life details: signals, signs, cars, lanterns, steam, light shafts, clutter.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as TX from './textures.js';
import { buildCar } from './cars.js';
import { buildTruck, buildVan } from './trucks.js';
import { spawnCar } from './assets.js';
import { mergeVehicle } from './vehmerge.js';
import { dressVehicle } from './realveh.js';

const CROSSWALK_Z = 10, CROSS_Z = -66;

// ---------- volumetric light shaft under a lamp ----------
const coneMat = (color, strength) => new THREE.ShaderMaterial({
  uniforms: { color: { value: new THREE.Color(color) }, strength: { value: strength }, fogDensity: { value: 0.03 } },
  vertexShader: `
    varying float vT; varying vec3 vN; varying vec3 vView; varying float vFog;
    uniform float fogDensity;
    void main() {
      vT = uv.y;
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vN = normalize(mat3(modelMatrix) * normal);
      vView = normalize(cameraPosition - wp.xyz);
      vec4 mv = viewMatrix * wp;
      float d = -mv.z; vFog = exp(-fogDensity * fogDensity * d * d);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform vec3 color; uniform float strength;
    varying float vT; varying vec3 vN; varying vec3 vView; varying float vFog;
    void main() {
      float edge = pow(abs(dot(normalize(vN), vView)), 2.0);
      float fall = pow(vT, 1.6);
      gl_FragColor = vec4(color * strength * edge * fall * vFog, 1.0);
    }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
});

export function lightCone(ctx, x, y, z, { color = 0xffc98a, h = 5.9, r = 2.6, strength = 0.09 } = {}) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 24, 1, true), coneMat(color, strength));
  m.position.set(x, y - h / 2, z);
  m.renderOrder = 5;
  ctx.scene.add(m);
  return m;
}

// ---------- chouchin lanterns ----------
export function lanterns(ctx, side, z, text) {
  const { scene, std, glowPool, updaters } = ctx;
  const mat = new THREE.MeshBasicMaterial({ map: TX.lantern(text), color: new THREE.Color(1.6, 1.6, 1.6) });
  const cap = std(0x111111);
  const list = [];
  for (const dz of [-1.1, 1.1]) {
    const g = new THREE.Group(); g.position.set(side * (7 - 1.05), 2.85, z + dz); scene.add(g);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), mat); body.scale.set(1, 1.45, 1); body.position.y = -0.38; g.add(body);
    for (const y of [-0.08, -0.68]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 12), cap); c.position.y = y; g.add(c); }
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 4), cap); cord.position.y = -0.02; g.add(cord);
    list.push(g);
    glowPool(side * (7 - 1.05), 0.156, z + dz, 1.8, 1.8, 0xff4a2a, 0.35);
  }
  updaters.push((t) => list.forEach((g, i) => { g.rotation.z = Math.sin(t * 1.3 + i * 2 + z) * 0.05; g.rotation.x = Math.sin(t * 0.9 + i) * 0.04; }));
}

// ---------- steam from a kitchen vent ----------
export function steam(ctx, x, y, z) {
  const { scene, updaters } = ctx;
  const tex = TX.glow();
  const parts = Array.from({ length: 18 }, (_, i) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xb9a48c, transparent: true, depthWrite: false, opacity: 0 }));
    s.userData.age = i / 18; scene.add(s); return s;
  });
  const vent = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), ctx.std(0x8a8d92, { metalness: 0.6, roughness: 0.4 }));
  vent.position.set(x, y, z); scene.add(vent);
  updaters.push((t, dt) => {
    for (const s of parts) {
      s.userData.age += dt * 0.28;
      if (s.userData.age > 1) { s.userData.age -= 1; s.userData.dx = (Math.random() - 0.5) * 0.4; }
      const a = s.userData.age;
      s.position.set(x + (s.userData.dx || 0) * a + Math.sin(t + a * 6) * 0.08, y + 0.2 + a * 2.6, z + a * 0.4);
      s.scale.setScalar(0.3 + a * 1.6);
      s.material.opacity = Math.sin(a * Math.PI) * 0.16;
    }
  });
}

// ---------- traffic + pedestrian signals at the crosswalk ----------
export function signals(ctx) {
  const { scene, std, collide, updaters, glowPool } = ctx;
  const pole = std(0x8b8f96, { metalness: 0.5, roughness: 0.4 });
  const housing = std(0x5b6067, { metalness: 0.4, roughness: 0.5 });
  const off = std(0x15171a, { roughness: 0.3 });
  const lit = {
    g: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 2.6, 1.6) }),
    y: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.9, 0.2) }),
    r: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.6, 0.3, 0.2) }),
  };
  const ped = { walk: new THREE.MeshBasicMaterial({ map: TX.pedSignal('walk'), color: new THREE.Color(1.8, 1.8, 1.8) }), stop: new THREE.MeshBasicMaterial({ map: TX.pedSignal('stop'), color: new THREE.Color(1.8, 1.8, 1.8) }), off: new THREE.MeshBasicMaterial({ map: TX.pedSignal('off') }) };
  const crossSign = new THREE.MeshStandardMaterial({ map: TX.signCrossing(), roughness: 0.4 });

  const carLamps = [], pedFaces = [], pools = [];
  // [pole x, pole z, which way the car signal faces (+1 → +z)]
  for (const [px, pz, face] of [[-4.45, CROSSWALK_Z - 2.3, 1], [4.45, CROSSWALK_Z + 2.3, -1]]) {
    const s = Math.sign(px);
    const pm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 5.6, 10), pole); pm.position.set(px, 2.95, pz); scene.add(pm);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.0, 8), pole); arm.rotation.z = Math.PI / 2; arm.position.set(px - s * 1.5, 5.5, pz); scene.add(arm);
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.42, 0.28), housing); box.position.set(px - s * 2.7, 5.45, pz); scene.add(box);
    const set = {};
    ['g', 'y', 'r'].forEach((k, i) => {
      const l = new THREE.Mesh(new THREE.CircleGeometry(0.15, 20), off);
      // Japanese horizontal signal: green, yellow, red from the driver's left
      const lx = px - s * 2.7 + (i - 1) * 0.4 * (face > 0 ? -1 : 1);
      l.position.set(lx, 5.45, pz + face * 0.145); l.rotation.y = face > 0 ? 0 : Math.PI; scene.add(l);
      const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.18, 16, 1, true, 0, Math.PI), housing);
      visor.rotation.x = Math.PI / 2; visor.rotation.y = Math.PI; visor.position.set(lx, 5.47, pz + face * 0.23); scene.add(visor);
      set[k] = l;
    });
    for (const m of Object.values(set)) if (m?.isObject3D) m.userData.dynamic = true; // its material changes with the light phase
    carLamps.push(set);
    { const gp = glowPool(px - s * 2.7, 0.03, pz + face * 3, 3, 6, 0xffffff, 0); gp.material.userData.mutable = true; pools.push(gp); }
    // pedestrian head across the road (faces the other kerb)
    const pb = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.62, 0.36), housing); pb.position.set(px, 2.75, pz); scene.add(pb);
    const faces = [];
    for (const k of [0, 1]) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), ped.off);
      f.position.set(px - s * 0.16, 2.9 - k * 0.3, pz); f.rotation.y = -s * Math.PI / 2; scene.add(f); faces.push(f);
    }
    for (const m of faces) if (m?.isObject3D) m.userData.dynamic = true;
    pedFaces.push(faces);
    const cs = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), crossSign); cs.position.set(px, 4.0, pz + face * 0.13); cs.rotation.y = face > 0 ? 0 : Math.PI; scene.add(cs);
    collide(px - 0.15, px + 0.15, pz - 0.15, pz + 0.15); ctx.camPole?.(px, pz, 0.14, 5.8);
  }

  const state = { carRed: false, phase: 'g' };
  updaters.push((t) => {
    const c = t % 30;
    const phase = c < 14 ? 'g' : c < 17 ? 'y' : 'r';
    state.phase = phase; state.carRed = phase !== 'g';
    state.walkT = c >= 18 && c < 29 ? 29 - c : 0; // seconds of green man left at the crosswalk
    for (const set of carLamps) for (const k of ['g', 'y', 'r']) set[k].material = k === phase ? lit[k] : off;
    const pc = phase === 'g' ? 0x22ffaa : phase === 'y' ? 0xffaa22 : 0xff3322;
    for (const p of pools) p.material.color.set(pc).multiplyScalar(0.12);
    const walk = c >= 18 && c < 29 && !(c > 26.5 && Math.floor(c * 4) % 2);
    for (const [top, bottom] of pedFaces) {
      top.material = c >= 18 && c < 29 ? ped.off : ped.stop;
      bottom.material = walk ? ped.walk : ped.off;
    }
  });
  return state;
}

// ---------- road signs, manholes, drains, curve mirrors ----------
export function streetFurniture(ctx) {
  const { scene, std, collide, rnd } = ctx;
  const pole = std(0x8b8f96, { metalness: 0.5, roughness: 0.4 });
  const signPost = (x, z, y, tex, size, faceZ) => {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, y + size / 2, 8), pole); p.position.set(x, 0.15 + (y + size / 2) / 2, z); scene.add(p);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.5, roughness: 0.35, side: THREE.DoubleSide }));
    m.position.set(x, 0.15 + y, z + faceZ * 0.03); m.rotation.y = faceZ > 0 ? 0 : Math.PI; scene.add(m);
    collide(x - 0.08, x + 0.08, z - 0.08, z + 0.08); ctx.camPole?.(x, z, 0.07, 0.15 + y + size / 2);
  };
  signPost(-4.4, 13.8, 2.2, TX.signStop(), 0.8, 1);
  signPost(-4.4, 30, 2.4, TX.signRound('30'), 0.6, 1);
  signPost(4.4, -22, 2.4, TX.signRound('30'), 0.6, -1);

  const gr = new THREE.MeshStandardMaterial({ map: TX.grate(), roughness: 0.4, metalness: 0.6 });
  for (let z = 40; z > -135; z -= 9) {
    if (Math.abs(z - CROSS_Z) < 4 || Math.abs(z - CROSSWALK_Z) < 3) continue;
    for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.6), gr); m.rotation.x = -Math.PI / 2; m.position.set(s * 3.82, 0.013, z); scene.add(m); }
  }

  // curve mirrors (orange pole, convex mirror)
  const orange = std(0xe8681c, { roughness: 0.45 });
  const mirror = new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 1, roughness: 0.12 });
  for (const [x, z, ry] of [[-4.5, 34.5, 0.6], [4.5, -60.5, Math.PI + 0.5]]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.9, 8), orange); p.position.set(x, 1.6, z); scene.add(p);
    const g = new THREE.Group(); g.position.set(x, 3.05, z); g.rotation.y = ry; scene.add(g);
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.9, 24, 12, 0, Math.PI * 2, 0, 0.5), mirror); d.rotation.x = Math.PI / 2; d.position.z = -0.75; g.add(d);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.04, 8, 28), orange); rim.position.z = 0.03; g.add(rim);
    collide(x - 0.1, x + 0.1, z - 0.1, z + 0.1); ctx.camPole?.(x, z, 0.08, 3.6);
  }
}

// ---------- cars ----------

export function parkedCars(ctx) {
  const { collide, updaters, scene } = ctx;
  const park = (type, color, x, z, ry) => {
    const c = buildCar(type, color, scene); c.position.set(x, 0, z); c.rotation.y = ry;
    const { L, W } = c.userData;
    collide(x - W / 2 - 0.05, x + W / 2 + 0.05, z - L / 2 - 0.05, z + L / 2 + 0.05);
    return c;
  };
  const R = ctx.cars || {};
  // parked: real models where we have them, procedural stand-ins otherwise
  const parkReal = (key, x, z, ry) => {
    const c = spawnCar(R[key], scene); c.position.set(x, 0, z); c.rotation.y = ry; c.userData.static = true;
    { const r = c.userData.rig; mergeVehicle(c, r ? [r.door, ...r.wheels.flatMap((w) => [w.steer, w.spin])] : []); }
    const { L, W } = c.userData;
    // its collider and roof are kept on the car so they can follow it when someone drives off
    c.userData.col = { minX: x - W / 2 - 0.05, maxX: x + W / 2 + 0.05, minZ: z - L / 2 - 0.05, maxZ: z + L / 2 + 0.05 };
    ctx.colliders.push(c.userData.col);
    c.userData.rs = { x0: x - W * 0.32, x1: x + W * 0.32, z0: z - L * 0.3, z1: z + L * 0.3, y: c.userData.size.y * 0.96, splash: true };
    ctx.rainSurfaces?.push(c.userData.rs);
    ctx.drivable?.push(c);
    return c;
  };
  if (R.crown_comfort) parkReal('crown_comfort', -3.15, -33, Math.PI); else park('kei', 0xeef0f2, -3.15, -33, Math.PI);
  if (R.prius_2012) parkReal('prius_2012', 3.2, -96, 0); else park('hatch', 0x9b1c22, 3.2, -96, 0);
  if (R.corolla_mk7) parkReal('corolla_mk7', -3.15, -104, Math.PI); else park('sedan', 0x2a2d33, -3.15, -104, Math.PI);
  const real = ctx.cars?.porsche_911;
  if (real) {
    parkReal('porsche_911', 3.15, -16, 0);
  } else {
    const taxi = park('taxi', 0x1c2340, 3.15, -16, 0);
    const on = new THREE.Color(3, 1.5, 0.1), offC = new THREE.Color(0.35, 0.18, 0.02);
    updaters.push((t) => { const b = Math.floor(t * 1.6) % 2 === 0; taxi.userData.amber.color.copy(b ? on : offC); });
  }
}

// One car at a time drives the street, turning at the T-junction at the north end.
// ---------- signals at the two T-junctions where the main street meets the cross streets ----------
// Two phases each: the main street's mouth, then the cross street. Every approach has an overhead car signal by
// its stop line; every zebra a pedestrian signal at both ends. Returns go(id) for the traffic and the zebras
// (with walk()) for the people on the pavements.
export const JUNCTIONS = {
  // z: the cross street's centre line; mouth: the main-street zebra's z; side: which way the main street leaves (+1 north)
  // zx: the cross-street zebras' x (±), near/far: their kerbs, stop: the cross-street stop lines' x (±)
  S: { z: -200, mouth: -194, side: 1, offset: 0, zx: 7, near: -196, far: -204, stop: 9.6 },
  N: { z: 40, mouth: 33.5, side: -1, offset: 11, zx: 8.6, near: 38, far: 42, stop: 11.6 },
};
export function junctions(ctx) {
  const { scene, std, collide, updaters, glowPool } = ctx;
  const pole = std(0x8b8f96, { metalness: 0.5, roughness: 0.4 });
  const housing = std(0x5b6067, { metalness: 0.4, roughness: 0.5 });
  const off = std(0x15171a, { roughness: 0.3 });
  const lit = {
    g: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 2.6, 1.6) }),
    y: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.9, 0.2) }),
    r: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.6, 0.3, 0.2) }),
  };
  const ped = { walk: new THREE.MeshBasicMaterial({ map: TX.pedSignal('walk'), color: new THREE.Color(1.8, 1.8, 1.8) }), stop: new THREE.MeshBasicMaterial({ map: TX.pedSignal('stop'), color: new THREE.Color(1.8, 1.8, 1.8) }), off: new THREE.MeshBasicMaterial({ map: TX.pedSignal('off') }) };
  const crossSign = new THREE.MeshStandardMaterial({ map: TX.signCrossing(), roughness: 0.4 });
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const rodTo = (a, b, r) => {
    const d = b.clone().sub(a), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 8), pole);
    m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); scene.add(m);
  };
  const heads = [], peds = [];

  // a car signal: pole at (px, pz) on the kerb, arm out to the head at (hx, hz) over the lane, facing yaw (toward the driver)
  function carHead(id, px, pz, hx, hz, yaw) {
    rodTo(V(px, 0.15, pz), V(px, 5.75, pz), 0.11);
    rodTo(V(px, 5.5, pz), V(hx, 5.5, hz), 0.06);
    const g = new THREE.Group(); g.position.set(hx, 5.45, hz); g.rotation.y = yaw; g.userData.dynamic = true; scene.add(g);
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.42, 0.28), housing); g.add(box);
    const set = {};
    ['g', 'y', 'r'].forEach((k, i) => {
      // Japanese horizontal signal: green, yellow, red from the driver's left
      const l = new THREE.Mesh(new THREE.CircleGeometry(0.15, 20), off); l.position.set((i - 1) * 0.4, 0, 0.145); g.add(l);
      const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.18, 16, 1, true, 0, Math.PI), housing);
      visor.rotation.x = Math.PI / 2; visor.rotation.y = Math.PI; visor.position.set((i - 1) * 0.4, 0.02, 0.23); g.add(visor);
      set[k] = l;
    });
    const cs = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), crossSign); cs.position.set(px + Math.sin(yaw) * 0.13, 4.0, pz + Math.cos(yaw) * 0.13); cs.rotation.y = yaw; scene.add(cs);
    const gp = glowPool(hx + Math.sin(yaw) * 3, 0.03, hz + Math.cos(yaw) * 3, 3, 3, 0xffffff, 0); gp.material.userData.mutable = true; gp.userData.dynamic = true;
    collide(px - 0.15, px + 0.15, pz - 0.15, pz + 0.15); ctx.camPole?.(px, pz, 0.14, 5.9);
    heads.push({ id, set, gp });
  }
  // a pedestrian signal at (x, z) facing yaw (across the zebra)
  function pedHead(zid, x, z, yaw) {
    rodTo(V(x, 0.15, z), V(x, 3.2, z), 0.07);
    const g = new THREE.Group(); g.position.set(x, 2.75, z); g.rotation.y = yaw; g.userData.dynamic = true; scene.add(g);
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.62, 0.3), housing));
    const faces = [0, 1].map((k) => { const f = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), ped.off); f.position.set(0, 0.15 - k * 0.3, 0.16); g.add(f); return f; });
    collide(x - 0.12, x + 0.12, z - 0.12, z + 0.12); ctx.camPole?.(x, z, 0.1, 3.3);
    peds.push({ zid, faces });
  }

  const zebras = [];
  for (const [key, J] of Object.entries(JUNCTIONS)) {
    const s = J.side, cz = J.z;
    // main street's mouth: southbound (S) or northbound (N) drivers stop before the zebra
    if (key === 'S') {
      carHead('Sm', -4.45, J.mouth + 3.4, -1.75, J.mouth + 3.4, 0);
      carHead('Sw', 9.9, cz + 4.45, 9.9, cz + 1.75, Math.PI / 2);
      carHead('Se', -9.9, cz - 4.45, -9.9, cz - 1.75, -Math.PI / 2);
    } else {
      carHead('Nm', 4.45, J.mouth - 3.4, 1.75, J.mouth - 3.4, Math.PI);
      carHead('Ne', -12, cz - 2.5, -12, cz - 1.1, -Math.PI / 2);
      carHead('Nw', 12, cz + 2.5, 12, cz + 1.1, Math.PI / 2);
    }
    // zebras: across the main street's mouth (walked along x), and across the cross street either side (along z)
    zebras.push({ id: key + 'm', a: { x: -5.4, z: J.mouth }, b: { x: 5.4, z: J.mouth }, phase: 'cross', J: key });
    for (const xs of [-J.zx, J.zx]) zebras.push({ id: key + (xs < 0 ? 'W' : 'E'), a: { x: xs, z: J.near + s * 0.6 }, b: { x: xs, z: J.far - s * 0.6 }, phase: 'main', J: key });
  }
  for (const zb of zebras) {
    // a signal at each end, looking across to the other end (and slightly off the walking line)
    const dx = zb.b.x - zb.a.x, dz = zb.b.z - zb.a.z, yaw = Math.atan2(-dx, -dz);
    const ox = dz !== 0 ? 1.9 : 0, oz = dx !== 0 ? 1.9 : 0;
    pedHead(zb.id, zb.b.x + ox * Math.sign(zb.b.x || 1), zb.b.z + oz * Math.sign(zb.b.z - (JUNCTIONS[zb.J].z) || 1), yaw);
    pedHead(zb.id, zb.a.x + ox * Math.sign(zb.a.x || 1), zb.a.z + oz * Math.sign(zb.a.z - (JUNCTIONS[zb.J].z) || 1), yaw + Math.PI);
  }

  // 36 s: main green 14, yellow 3, all red 1, cross green 14, yellow 3, all red 1
  const phaseOf = (J, t) => {
    const c = (t + J.offset) % 36;
    return { c, main: c < 14 ? 'g' : c < 17 ? 'y' : 'r', cross: c >= 18 && c < 32 ? 'g' : c >= 32 && c < 35 ? 'y' : 'r' };
  };
  const state = { t: 0 };
  // can a car on approach id go?  ('Sm' = south junction, main street approach, …)
  state.go = (id) => { const P = phaseOf(JUNCTIONS[id[0]], state.t); return (id[1] === 'm' ? P.main : P.cross) === 'g'; };
  // may people start across this zebra? (they don't start in the last seconds)
  const walkOf = (zb, t) => { const P = phaseOf(JUNCTIONS[zb.J], t), c = zb.phase === 'main' ? P.c : P.c - 18; return c >= 0.5 && c < 13; };
  for (const zb of zebras) zb.walk = () => walkOf(zb, state.t), zb.left = () => { const P = phaseOf(JUNCTIONS[zb.J], state.t), c = zb.phase === 'main' ? P.c : P.c - 18; return c >= 0 && c < 14 ? 14 - c : 0; };
  state.zebras = zebras;
  updaters.push((t) => {
    state.t = t;
    for (const h of heads) {
      const P = phaseOf(JUNCTIONS[h.id[0]], t), ph = h.id[1] === 'm' ? P.main : P.cross;
      for (const k of ['g', 'y', 'r']) h.set[k].material = k === ph ? lit[k] : off;
      h.gp.material.color.set(ph === 'g' ? 0x22ffaa : ph === 'y' ? 0xffaa22 : 0xff3322).multiplyScalar(0.12);
    }
    for (const p of peds) {
      const zb = zebras.find((z) => z.id === p.zid), P = phaseOf(JUNCTIONS[zb.J], t), c = zb.phase === 'main' ? P.c : P.c - 18;
      const on = c >= 0 && c < 14, blink = on && c > 11 && Math.floor(c * 4) % 2;
      p.faces[0].material = on ? ped.off : ped.stop;
      p.faces[1].material = on && !blink ? ped.walk : ped.off;
    }
  });
  return state;
}

export function traffic(ctx, signal, crossing, jx = null) {
  const { scene, updaters, sound } = ctx;
  const V = (x, z) => new THREE.Vector3(x, 0, z);
  // Left-hand traffic round the ring (world.js RING): every lane, as x of a street or z of a cross street
  const N_E = 38.6, N_W = 41.4;           // north cross street: eastbound / westbound
  const S_W = -198.2, S_E = -201.8;       // south cross street: westbound / eastbound
  const E_S = 49.4, E_N = 52.6;           // east back street: southbound / northbound
  const W_N = -49.4, W_S = -52.6;         // west back street: northbound / southbound
  const M_N = 1.6, M_S = -1.6;            // main street
  const B_E = 109.1, B_W = 120.9;         // the boulevard's outer lanes: eastbound / westbound
  // a closed loop through these corners, rounded off (r metres each side of a corner)
  const loop = (pts, r = 5.5) => {
    const path = new THREE.CurvePath(), n = pts.length;
    const P = pts.map(([x, z]) => V(x, z));
    const cut = (a, b, d) => a.clone().add(b.clone().sub(a).setLength(d));
    let start = null, last = null;
    for (let i = 0; i < n; i++) {
      const prev = P[(i - 1 + n) % n], c = P[i], next = P[(i + 1) % n];
      const a = cut(c, prev, r), b = cut(c, next, r);
      if (last) path.add(new THREE.LineCurve3(last, a)); else start = a;
      path.add(new THREE.QuadraticBezierCurve3(a, c, b));
      last = b;
    }
    path.add(new THREE.LineCurve3(last, start));
    return path;
  };
  // stops: { x, z, dir } — a stop line across a lane that runs along z (dir = which way along z the lane goes)
  const railZ = -66, rail = (x, dir) => ({ x, z: dir > 0 ? railZ - 3.6 : railZ + 3.6, dir, kind: 'rail' });
  const routes = [
    // the whole ring, all left turns
    { curve: loop([[E_S, N_E], [E_S, S_W], [W_N, S_W], [W_N, N_E]]), stops: [rail(E_S, -1), rail(W_N, 1)] },
    // the whole ring the other way, all right turns (wider)
    { curve: loop([[W_S, N_W], [W_S, S_E], [E_N, S_E], [E_N, N_W]], 7), stops: [rail(W_S, -1), rail(E_N, 1)] },
    // east half: up the main street, round by the east back street
    { curve: loop([[M_N, S_W], [M_N, N_E], [E_S, N_E], [E_S, S_W]]), stops: [rail(M_N, 1), rail(E_S, -1), { x: M_N, z: 6.7, dir: 1, kind: 'signal' }] },
    // west half: down the main street, round by the west back street
    { curve: loop([[M_S, N_E], [M_S, S_W], [W_N, S_W], [W_N, N_E]]), stops: [rail(M_S, -1), rail(W_N, 1), { x: M_S, z: 13.4, dir: -1, kind: 'signal' }] },
    // the north (north.js): up the west back street, east along the boulevard, down the east one, all left turns
    { curve: loop([[W_N, N_W], [W_N, B_E], [E_S, B_E], [E_S, N_W]]), stops: [] },
    // and the other way round, in the boulevard's westbound lanes
    { curve: loop([[E_N, N_E], [E_N, B_W], [W_S, B_W], [W_S, N_E]], 7), stops: [] },
  ];
  // the junction signals' stop lines (each only matters to a car in that lane going that way)
  const S = JUNCTIONS.S, N = JUNCTIONS.N;
  const JX = [
    { id: 'Sm', ax: 'z', at: S.mouth + 3.2, lane: M_S, dir: -1 },
    { id: 'Sw', ax: 'x', at: S.stop, lane: S_W, dir: -1 },
    { id: 'Se', ax: 'x', at: -S.stop, lane: S_E, dir: 1 },
    { id: 'Nm', ax: 'z', at: N.mouth - 3.1, lane: M_N, dir: 1 },
    { id: 'Ne', ax: 'x', at: -N.stop, lane: N_E, dir: 1 },
    { id: 'Nw', ax: 'x', at: N.stop, lane: N_W, dir: -1 },
  ].map((j) => ({ ...j, kind: 'jx' }));
  for (const r of routes) {
    r.len = r.curve.getLength();
    // the older stops run along z: give them the same shape
    r.stops = r.stops.map((s) => ({ ax: 'z', at: s.z, lane: s.x, dir: s.dir, kind: s.kind })).concat(jx ? JX : []);
  }

  // the cars: real models when they loaded, else the procedural ones
  const realKeys = ['crown_comfort', 'prius_2012', 'corolla_mk7'].filter((k) => ctx.cars?.[k]);
  let mk = 0;
  // each vehicle folded to one mesh per material (wheels, steering and the door stay free to move)
  const make = (kind) => {
    const v = make0(kind), r = v.userData.rig;
    return mergeVehicle(v, r ? [r.door, ...r.wheels.flatMap((w) => [w.steer, w.spin])] : v.userData.wheels);
  };
  // the real models for each kind (assets.js), taken in turn so the street mixes them
  const MODELS = { truck: ['isuzu_elf'], van: ['hiace_2013', 'carry_minivan'], taxi: ['jpn_taxi'], kei: ['daihatsu_cast', 'wagonr'], pickup: ['carry_pickup'] };
  const turn = {};
  const real = (kind) => {
    const keys = (MODELS[kind] || []).filter((k) => ctx.cars?.[k]);
    if (!keys.length) return null;
    const key = keys[(turn[kind] = (turn[kind] ?? -1) + 1) % keys.length];
    const c = dressVehicle(spawnCar(ctx.cars[key], scene), key, { livery: mk++ % 4 });
    c.userData.setLights(1.4);
    return c;
  };
  const make0 = (kind) => {
    const r = real(kind); if (r) return r;
    if (kind === 'pickup') kind = 'kei';
    if (kind === 'truck') { const k = buildTruck(scene, { color: [0xf2f2ee, 0xdfe6ee, 0x2a5fa8][mk++ % 3] }); k.userData.head.color.setRGB(3, 3, 2.7); return k; }
    if (kind === 'van') { const k = buildVan(scene, { color: [0xeef0f2, 0x9aa6b2, 0xd8d2c4][mk++ % 3] }); k.userData.head.color.setRGB(3, 3, 2.7); return k; }
    if (kind === 'real' && realKeys.length) { const c = spawnCar(ctx.cars[realKeys[mk++ % realKeys.length]], scene); c.userData.setLights(1.4); return c; }
    const [t, col] = kind === 'taxi' ? ['taxi', 0x1c2340] : [['sedan', 0x8a9099], ['hatch', 0x2e5fa8], ['kei', 0xe8d9c4]][mk++ % 3];
    const k = buildCar(t, col, scene); k.userData.head.color.setRGB(3, 3, 2.7); return k;
  };
  // which loop each vehicle drives, where on it it starts and what it is; the first six drive at night too, the
  // rest join by day (busier: trucks and vans making deliveries)
  const PLAN = [[2, 0.1, 'real'], [3, 0.55, 'real'], [0, 0.3, 'truck'], [1, 0.8, 'real'], [2, 0.6, 'taxi'], [0, 0.8, 'van'],
    [4, 0.25, 'real'], [5, 0.7, 'taxi'],
    [0, 0.55, 'kei'], [2, 0.85, 'van'], [3, 0.2, 'truck'], [1, 0.4, 'pickup'], [3, 0.8, 'real'], [0, 0.05, 'taxi'],
    [4, 0.75, 'van'], [5, 0.2, 'kei']];
  const NIGHT = 8;   // how many drive at night (the first ones in PLAN)
  const gTex = TX.glow();
  const flatGlow = (g, w, l, color) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), new THREE.MeshBasicMaterial({ map: gTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.03; m.renderOrder = 2; g.add(m); return m;
  };
  const cars = PLAN.map(([ri, u0, kind], i) => {
    const car = make(kind); car.visible = false;
    // light the car throws on the wet road: a long warm streak ahead, a red smear behind
    const streak = new THREE.Group(); streak.visible = false; streak.userData.dynamic = true; scene.add(streak);
    const head = flatGlow(streak, 2.6, 10, new THREE.Color(0.55, 0.5, 0.4)), tail = flatGlow(streak, 2.0, 3, new THREE.Color(0.6, 0.05, 0.03));
    head.position.z = car.userData.L / 2 + 5; tail.position.z = -car.userData.L / 2 - 1.2;
    const a = { car, streak, tail, route: routes[ri], u: u0, v: 8, on: i < NIGHT, braking: false, spray: 0, pos: new THREE.Vector3(), tan: new THREE.Vector3(), prevYaw: undefined };
    a.col = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, maxY: 2, active: () => a.on };
    ctx.colliders.push(a.col);
    a.route.curve.getPointAt(a.u, a.pos); a.route.curve.getTangentAt(a.u, a.tan);
    return a;
  });
  if (ctx.fx) ctx.fx.traffic = cars; // for the console
  // one headlight beam, lent to the car nearest you (a light per car would cost every material in town)
  const beam = new THREE.SpotLight(0xfff1d6, 0, 34, 0.42, 0.55, 1.4);
  scene.add(beam, beam.target);
  const ahead = new THREE.Vector3();

  updaters.push((t, dt, p) => {
    const day = (ctx.fx?.daylight ?? 0) > 0.5, want = day ? cars.length : NIGHT;
    let near = null, nearD = 1e9;
    cars.forEach((a, i) => {
      const { car, pos, tan, route: r } = a;
      // cars join or leave only out of sight (far off)
      const far = Math.hypot(p.x - pos.x, p.z - pos.z) > 45;
      if (!a.on && i < want && far) a.on = true;
      if (a.on && i >= want && far) { a.on = false; car.visible = false; a.streak.visible = false; }
      if (!a.on) return;

      let target = Math.abs(tan.x) > 0.25 && Math.abs(tan.z) > 0.25 ? 5 : 11; // slow through the corners
      // stop lines
      for (const s of r.stops) {
        const onX = s.ax === 'x';
        if (Math.abs((onX ? pos.z : pos.x) - s.lane) > 2.5 || (onX ? tan.x : tan.z) * s.dir < 0.6) continue;
        const dist = (s.at - (onX ? pos.x : pos.z)) * s.dir;
        const mustStop = s.kind === 'signal' ? signal.carRed : s.kind === 'jx' ? !jx.go(s.id) : crossing.warn;
        if (mustStop && dist > 0 && dist < 22) target = Math.min(target, Math.max(0, (dist - 2.4) * 0.9));
      }
      // keep clear of whatever is ahead in the lane: you, other cars, a car someone left in the road
      const keep = (x, z, gap, lane = 1.7) => {
        const dx = x - pos.x, dz = z - pos.z, along = dx * tan.x + dz * tan.z, side = Math.abs(dx * tan.z - dz * tan.x);
        if (along > 0 && along < gap + 8 && side < lane) target = Math.min(target, Math.max(0, (along - gap) * 1.2));
      };
      keep(p.x, p.z, 3.4);
      for (const w of ctx.walkers || []) if (w.onRoad) keep(w.pos.x, w.pos.z, 3.2);
      for (const b of cars) if (b !== a && b.on) keep(b.pos.x, b.pos.z, (car.userData.L + b.car.userData.L) / 2 + 2.2);
      for (const c of ctx.drivable || []) keep(c.position.x, c.position.z, (car.userData.L + (c.userData.L ?? 4.5)) / 2 + 1.5, 1.2); // parked at the kerb doesn't count
      a.braking = target < a.v - 0.3;
      a.v += (target - a.v) * Math.min(1, dt * (a.braking ? 2.6 : 0.9));
      a.u = (a.u + (a.v * dt) / r.len) % 1;
      r.curve.getPointAt(a.u, pos); r.curve.getTangentAt(a.u, tan);

      const d = Math.hypot(p.x - pos.x, p.z - pos.z);
      if (d < nearD) { nearD = d; near = a; }
      // past the fog nobody sees it: skip drawing and the details
      const seen = d < 90;
      car.visible = seen; a.streak.visible = seen;
      const half = car.userData.L / 2 + 0.1, sideW = car.userData.W / 2 + 0.1;
      const hl = Math.abs(tan.z) > 0.7 ? half : sideW, hw = Math.abs(tan.z) > 0.7 ? sideW : half;
      a.col.minX = pos.x - hw; a.col.maxX = pos.x + hw; a.col.minZ = pos.z - hl; a.col.maxZ = pos.z + hl;
      const yaw = Math.atan2(tan.x, tan.z), dYaw = a.prevYaw !== undefined ? Math.atan2(Math.sin(yaw - a.prevYaw), Math.cos(yaw - a.prevYaw)) : 0;
      a.prevYaw = yaw;
      car.position.copy(pos); car.rotation.y = yaw;
      if (!seen) return;
      const rig = car.userData.rig;
      if (rig) {
        rig.spin += (a.v * dt) / (car.userData.rigInfo?.r ?? 0.32);
        const steer = THREE.MathUtils.clamp(a.v > 0.3 ? (dYaw / (a.v * dt)) * 2.6 : 0, -0.5, 0.5);
        for (const w of rig.wheels) { w.spin.rotation.x = rig.spin; if (w.front) w.steer.rotation.y += (steer - w.steer.rotation.y) * Math.min(1, dt * 6); }
      }
      a.streak.position.copy(pos); a.streak.rotation.y = yaw;
      const brake = a.braking || a.v < 0.5;
      a.tail.material.color.setRGB(brake ? 1.1 : 0.5, 0.05, 0.03);
      // tyres throw spray off the wet road (only close by)
      if (a.v > 2.5 && d < 40 && ctx.fx?.splash) {
        a.spray += dt * a.v * 2.5;
        while (a.spray > 1) {
          a.spray -= 1;
          const al = (Math.random() < 0.5 ? 0.33 : -0.33) * car.userData.L, sd = (Math.random() < 0.5 ? -0.5 : 0.5) * car.userData.W;
          ctx.fx.splash(pos.x + tan.x * al + tan.z * sd, 0.03, pos.z + tan.z * al - tan.x * sd, 4 + Math.floor(a.v * 0.6));
        }
      }
      if (car.userData.real) car.userData.setLights(brake ? 2.4 : 1.4);
      else {
        car.userData.tail.color.setRGB(brake ? 3.2 : 0.9, 0.08, 0.04);
        for (const w of car.userData.wheels) w.rotation.x += (a.v * dt) / car.userData.R;
      }
    });
    if (near && nearD < 60) {
      const { pos, tan, car } = near;
      ahead.copy(pos).addScaledVector(tan, car.userData.L / 2);
      beam.position.set(ahead.x, 0.8, ahead.z);
      beam.target.position.set(pos.x + tan.x * 16, 0, pos.z + tan.z * 16);
      beam.intensity = 60;
      sound.carDist = nearD; sound.carPos = near.pos; sound.carSpeed = near.v;
    } else { beam.intensity = 0; sound.carDist = 999; }
  });
}

// ---------- arcade & karaoke pieces ----------
// a chain of marquee bulbs whose brightness chases along the chain
export function bulbChain(ctx, points, colors = [0xfff2c4], speed = 6) {
  const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), points.length);
  const m4 = new THREE.Matrix4(), c = new THREE.Color();
  points.forEach((p, i) => { m4.makeTranslation(p.x, p.y, p.z); im.setMatrixAt(i, m4); im.setColorAt(i, c.set(colors[i % colors.length])); });
  ctx.scene.add(im);
  const base = colors.map((h) => new THREE.Color(h));
  ctx.updaters.push((t) => {
    const k = Math.floor(t * speed);
    for (let i = 0; i < points.length; i++) {
      const on = (i + k) % 3 === 0 ? 3.2 : 0.35;
      im.setColorAt(i, c.copy(base[i % base.length]).multiplyScalar(on));
    }
    im.instanceColor.needsUpdate = true;
  });
  return im;
}

// UFO-catcher: lit cabinet, glass case with a claw on a gantry and a heap of plushies
// UFO catcher: lit cabinet, glass case with a printed backdrop, prize chute, gantry and a three-prong claw
// that wanders, drops and comes back up empty. Static parts are merged into the world batches.
const CLAW = {};
function clawShared() {
  if (CLAW.ready) return CLAW;
  CLAW.chrome = new THREE.MeshStandardMaterial({ color: 0xe6eaee, metalness: 0.95, roughness: 0.16 });
  CLAW.dark = new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.45 });
  CLAW.glass = new THREE.MeshStandardMaterial({ color: 0xeaf4ff, transparent: true, opacity: 0.12, roughness: 0.02, metalness: 0.6, depthWrite: false, side: THREE.DoubleSide });
  CLAW.acrylic = new THREE.MeshStandardMaterial({ color: 0xdff0ff, transparent: true, opacity: 0.3, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide });
  CLAW.white = new THREE.MeshStandardMaterial({ color: 0xf6f6f6, roughness: 0.4, emissive: 0x404040 });
  CLAW.black = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.2 });
  CLAW.marquee = TX.canvasTex(512, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#e6ecff'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.font = `900 64px ${TX.LATIN_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 10; g.strokeStyle = '#1a237e'; g.strokeText('UFO CATCHER', w / 2, h / 2 + 4);
    g.fillStyle = '#ffd400'; g.fillText('UFO CATCHER', w / 2, h / 2 + 4);
    g.fillStyle = '#e8203a'; for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(20 + i * 59, 12, 5, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(20 + i * 59, h - 12, 5, 0, Math.PI * 2); g.fill(); }
  });
  CLAW.panel = TX.canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#1b1d22'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#000'; g.fillRect(150, 18, 86, 40); g.fillStyle = '#ff3b2f'; g.font = `700 30px ${TX.LATIN_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('00', 193, 39);
    g.fillStyle = '#fff'; g.font = `900 22px ${TX.JP_FONT}`; g.fillText('1PLAY 100円', 70, 30); g.fillText('500円 6PLAY', 70, 62);
    g.fillStyle = '#c9ced6'; g.fillRect(170, 76, 46, 36); g.fillStyle = '#111'; g.fillRect(190, 82, 6, 24);
  });
  CLAW.backdrop = (hue) => TX.canvasTex(256, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, `hsl(${hue * 360},80%,82%)`); gr.addColorStop(1, `hsl(${(hue * 360 + 40) % 360},80%,70%)`);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 22; i++) { const x = (i * 73) % w, y = (i * 47) % h, r = 6 + (i % 3) * 4; g.beginPath(); for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2, rr = k % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.fill(); }
    g.font = `900 34px ${TX.JP_FONT}`; g.textAlign = 'center'; g.fillStyle = '#fff'; g.fillText('GET!', w / 2, h * 0.3);
  });
  CLAW.ready = true;
  return CLAW;
}

const FUR = new Map();
function plushie(add, c, px, py, pz, ry, s) {
  if (!FUR.has(c)) FUR.set(c, [
    new THREE.MeshStandardMaterial({ color: c, roughness: 1, emissive: new THREE.Color(c).multiplyScalar(0.18) }),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(c).lerp(new THREE.Color(0xffffff), 0.6), roughness: 1, emissive: 0x303030 }),
  ]);
  const [fur, snout] = FUR.get(c);
  const g = new THREE.Group(); g.position.set(px, py, pz); g.rotation.y = ry; g.scale.setScalar(s);
  const part = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
  part(new THREE.SphereGeometry(0.1, 14, 10), fur, 0, 0.09, 0).scale.set(1, 0.95, 0.9);
  part(new THREE.SphereGeometry(0.085, 14, 10), fur, 0, 0.23, 0.01);
  for (const sx of [-1, 1]) {
    part(new THREE.SphereGeometry(0.032, 10, 8), fur, sx * 0.06, 0.3, 0);
    part(new THREE.SphereGeometry(0.018, 8, 6), snout, sx * 0.06, 0.3, 0.018);
    part(new THREE.SphereGeometry(0.035, 10, 8), fur, sx * 0.1, 0.1, 0.03).scale.set(0.8, 1.2, 0.8);
    part(new THREE.SphereGeometry(0.038, 10, 8), fur, sx * 0.055, 0.02, 0.06).scale.set(1, 0.8, 1.3);
    part(new THREE.SphereGeometry(0.011, 8, 6), CLAW.black, sx * 0.03, 0.25, 0.075);
  }
  part(new THREE.SphereGeometry(0.035, 10, 8), snout, 0, 0.21, 0.07).scale.set(1.2, 0.85, 0.8);
  part(new THREE.SphereGeometry(0.009, 6, 5), CLAW.black, 0, 0.225, 0.1);
  add(g);
}

export function clawMachine(ctx, x, z, ry, hue) {
  const M = clawShared();
  const g = new THREE.Group(); g.position.set(x, 0.15, z); g.rotation.y = ry;
  const tone = new THREE.Color().setHSL(hue, 0.75, 0.52);
  const body = new THREE.MeshStandardMaterial({ color: tone, roughness: 0.3, metalness: 0.25, emissive: tone.clone().multiplyScalar(0.12) });
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(hue, 0.9, 0.62).multiplyScalar(2.4) });
  const white = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.4, 2.5) });
  const add = (geo, mat, px, py, pz, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); parent.add(m); return m; };

  // cabinet with glowing corner strips
  add(new RoundedBoxGeometry(1.0, 0.8, 0.96, 3, 0.05), body, 0, 0.4, 0);
  add(new THREE.BoxGeometry(0.82, 0.5, 0.02), M.dark, 0, 0.35, 0.475);
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.03, 0.74, 0.03), glow, sx * 0.495, 0.4, 0.475);
  // prize outlet: chrome frame, dark mouth, clear flap
  add(new THREE.BoxGeometry(0.32, 0.26, 0.02), M.chrome, -0.2, 0.26, 0.488);
  add(new THREE.BoxGeometry(0.27, 0.21, 0.03), M.black, -0.2, 0.26, 0.49);
  add(new THREE.PlaneGeometry(0.26, 0.2), M.acrylic, -0.2, 0.26, 0.508).rotation.x = -0.15;
  // coin unit with a lit price panel
  add(new THREE.BoxGeometry(0.3, 0.16, 0.04), new THREE.MeshBasicMaterial({ map: M.panel, color: new THREE.Color(1.2, 1.2, 1.2) }), 0.22, 0.5, 0.49);
  add(new THREE.BoxGeometry(0.12, 0.08, 0.03), M.chrome, 0.22, 0.32, 0.49);
  // sloped control deck: joystick with a ball top and two big buttons
  const deck = add(new RoundedBoxGeometry(0.96, 0.08, 0.26, 2, 0.03), M.dark, 0, 0.84, 0.52); deck.rotation.x = 0.22;
  add(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 16), M.chrome, -0.2, 0.89, 0.53);
  add(new THREE.CylinderGeometry(0.011, 0.011, 0.12, 8), M.chrome, -0.2, 0.95, 0.53);
  add(new THREE.SphereGeometry(0.035, 14, 10), new THREE.MeshStandardMaterial({ color: 0xe8203a, roughness: 0.25 }), -0.2, 1.02, 0.53);
  for (const [bx, c] of [[0.08, 0x2ea8ff], [0.24, 0xffd400]]) {
    add(new THREE.CylinderGeometry(0.055, 0.055, 0.02, 20), M.chrome, bx, 0.885, 0.53);
    add(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.8) }), bx, 0.9, 0.53);
  }
  // glass case: corner posts, mid rails, four panes, printed backdrop, lit floor
  const CH = 1.12, cy = 0.8 + CH / 2;
  for (const [px, pz] of [[-0.48, -0.46], [0.48, -0.46], [-0.48, 0.46], [0.48, 0.46]]) add(new RoundedBoxGeometry(0.05, CH, 0.05, 2, 0.015), M.chrome, px, cy, pz);
  add(new THREE.PlaneGeometry(0.92, CH), M.glass, 0, cy, 0.47);
  for (const sx of [-1, 1]) add(new THREE.PlaneGeometry(0.9, CH), M.glass, sx * 0.48, cy, 0).rotation.y = Math.PI / 2;
  add(new THREE.PlaneGeometry(0.92, CH), new THREE.MeshBasicMaterial({ map: M.backdrop(hue), color: new THREE.Color(1.1, 1.1, 1.1) }), 0, cy, -0.455);
  add(new THREE.BoxGeometry(0.94, 0.04, 0.9), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(hue, 0.6, 0.85).multiplyScalar(1.2) }), 0, 0.82, 0);
  // prize chute: clear acrylic walls round a hole in the front-left corner
  const hx = -0.24, hz = 0.24;
  add(new THREE.BoxGeometry(0.3, 0.02, 0.3), M.black, hx, 0.845, hz);
  for (const [ox, oz, rw] of [[0, -0.15, 0], [0.15, 0, Math.PI / 2]]) add(new THREE.PlaneGeometry(0.3, 0.2), M.acrylic, hx + ox, 0.94, hz + oz).rotation.y = rw;
  add(new THREE.BoxGeometry(0.31, 0.015, 0.015), M.chrome, hx, 1.04, hz - 0.15);
  add(new THREE.BoxGeometry(0.015, 0.015, 0.31), M.chrome, hx + 0.15, 1.04, hz);
  // plushies piled on the floor away from the chute
  const pal = [0xffb3c7, 0xc8e6ff, 0xfff1a8, 0xd9c2ff, 0xbff0d0, 0xf5d3b0];
  const spots = [[0.2, 0.2], [0.05, -0.05], [0.28, -0.2], [-0.15, -0.22], [0.3, 0.02], [-0.3, -0.12], [0.12, 0.3], [-0.05, 0.1]];
  // (the chute is at hx, hz; plush spots are what the claw game aims for)
  spots.forEach(([px, pz], i) => plushie((o) => g.add(o), pal[(i + Math.floor(hue * 10)) % pal.length], px, 0.84 + (i === 7 ? 0.12 : 0), pz, (i * 1.7) % 6.28 - 0.3, 0.85 + (i % 3) * 0.12));
  // crown: housing, lit marquee on front, light panel under it
  add(new RoundedBoxGeometry(1.06, 0.36, 1.0, 3, 0.05), body, 0, 0.8 + CH + 0.18, 0);
  add(new THREE.PlaneGeometry(0.98, 0.26), new THREE.MeshBasicMaterial({ map: M.marquee, color: new THREE.Color(1.0, 1.0, 1.0) }), 0, 0.8 + CH + 0.18, 0.505);
  add(new THREE.BoxGeometry(0.9, 0.02, 0.86), white, 0, 0.8 + CH - 0.01, 0);
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.02, 0.02, 0.86), M.chrome, sx * 0.4, 0.8 + CH - 0.08, 0);

  // static parts go into the world's merged batches
  ctx.scene.add(g); g.updateMatrixWorld(true);
  const moving = new THREE.Group(); moving.position.copy(g.position); moving.rotation.copy(g.rotation); ctx.scene.add(moving);
  moving.userData.dynamic = true; // the claw only moves while someone plays
  if (ctx.batchRaw) {
    const done = [];
    g.traverse((o) => { if (o.isMesh) done.push(o); });
    for (const o of done) { ctx.batchRaw(o.geometry.clone().applyMatrix4(o.matrixWorld), o.material); }
    ctx.scene.remove(g);
  }

  // gantry bar, carriage, cable and claw
  const top = 0.8 + CH - 0.1;
  const bar = add(new THREE.BoxGeometry(0.03, 0.03, 0.86), M.chrome, 0, top, 0, moving);
  const car = new THREE.Group(); moving.add(car);
  add(new THREE.BoxGeometry(0.1, 0.06, 0.1), M.chrome, 0, 0, 0, car);
  const cable = add(new THREE.CylinderGeometry(0.004, 0.004, 1, 5), M.dark, 0, -0.5, 0, car);
  const head = new THREE.Group(); car.add(head);
  add(new THREE.CylinderGeometry(0.05, 0.06, 0.09, 16), M.chrome, 0, 0, 0, head);
  add(new THREE.SphereGeometry(0.05, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), body, 0, 0.04, 0, head);
  const prongs = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2, arm = new THREE.Group();
    arm.position.set(Math.cos(a) * 0.035, -0.04, Math.sin(a) * 0.035); arm.rotation.y = -a; head.add(arm);
    add(new THREE.BoxGeometry(0.012, 0.12, 0.018), M.chrome, 0.0, -0.06, 0, arm).rotation.z = 0;
    const tip = add(new THREE.BoxGeometry(0.012, 0.06, 0.018), M.chrome, -0.02, -0.14, 0, arm); tip.rotation.z = -0.6;
    prongs.push(arm);
  }
  // wander, drop, close, lift, return to the chute, open — unless someone is playing (ctrl.manual)
  const seed = hue * 13, cyc = 11;
  const ctrl = { manual: false, px: hx, pz: hz, drop: 0, open: 0.55, hx, hz, spots, group: g };
  ctx.updaters.push((t) => {
    const k = ((t + seed) % cyc) / cyc;
    const tx = Math.sin(seed) * 0.25, tz = Math.cos(seed * 1.3) * 0.2;
    let px, pz, drop = 0, open = 0.25;
    if (ctrl.manual) { px = ctrl.px; pz = ctrl.pz; drop = ctrl.drop; open = ctrl.open; }
    else if (k < 0.35) { const u = k / 0.35; px = hx + (tx - hx) * u; pz = hz + (tz - hz) * u; }
    else if (k < 0.7) { px = tx; pz = tz; const u = (k - 0.35) / 0.35; drop = Math.sin(u * Math.PI); open = u < 0.45 ? 0.55 : 0.08; }
    else if (k < 0.92) { const u = (k - 0.7) / 0.22; px = tx + (hx - tx) * u; pz = tz + (hz - tz) * u; open = 0.12; }
    else { px = hx; pz = hz; open = 0.55; }
    bar.position.x = px; car.position.set(px, top - 0.02, pz);
    const len = 0.12 + drop * 0.62;
    cable.scale.y = len; cable.position.y = -len / 2; head.position.y = -len - 0.03;
    for (const a of prongs) a.rotation.z = open;
  });
  return ctrl;
}

// the claw game: sweep left–right (E to stop), front–back (E), the claw drops, grabs, carries to the chute
export function clawGame(ctrl, onEnd) {
  let phase = 'x', t = 0, startX = 0, result = false;
  const tips = { x: 'Press E to stop ⟷', z: 'Press E to stop ↕', drop: 'The claw drops…', home: '…' };
  return {
    begin(api) { ctrl.manual = true; ctrl.px = -0.38; ctrl.pz = 0.3; ctrl.open = 0.55; ctrl.drop = 0; api.sound.beep(); },
    update(dt, e, api) {
      t += dt;
      api.ui.showPrompt(tips[phase] ?? '');
      if (phase === 'x') { ctrl.px = -0.38 + (1 - Math.cos(t * 1.5)) * 0.38; if (e) { phase = 'z'; t = 0; api.sound.beep(); } }
      else if (phase === 'z') { ctrl.pz = 0.3 - (1 - Math.cos(t * 1.5)) * 0.32; if (e) { phase = 'drop'; t = 0; api.sound.beep(); } }
      else if (phase === 'drop') {
        // down for 1.2 s, grab, up for 1.2 s
        ctrl.drop = t < 1.2 ? t / 1.2 : t < 1.6 ? 1 : Math.max(0, 1 - (t - 1.6) / 1.2);
        ctrl.open = t < 1.2 ? 0.55 : 0.06;
        if (t > 1.25 && !startX) {
          startX = 1;
          const best = Math.min(...ctrl.spots.map(([sx, sz]) => Math.hypot(sx - ctrl.px, sz - ctrl.pz)));
          result = best < 0.09 && Math.random() < 0.7;
        }
        if (t > 2.9) { phase = 'home'; t = 0; startX = { x: ctrl.px, z: ctrl.pz }; }
      } else if (phase === 'home') {
        const u = Math.min(1, t / 1.6);
        ctrl.px = startX.x + (ctrl.hx - startX.x) * u; ctrl.pz = startX.z + (ctrl.hz - startX.z) * u;
        if (!result && t < 0.6) ctrl.open = 0.06 + t * 0.6; // it slips out of the claw on the way, as always
        if (t > 1.8) { ctrl.open = 0.55; ctrl.manual = false; onEnd?.(api, result); return false; }
      }
      return true;
    },
  };
}
