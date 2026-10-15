// The wider district: Hoshimi station on a viaduct across the south end of the street, the plazas in front
// of it, a lantern-lit drinking alley (yokochō), a children's park and a pedestrian bridge over the road.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as TX from './textures.js';
import { buildTrain, buildCatenary } from './train.js';

// ---------- shared layout (also used by world.js for walking and ground height) ----------
export const VIADUCT = { z0: -158, z1: -150, y0: 6.2, y1: 7.2, track: -152 };
export const YOKO = { z0: -99.5, z1: -96.5, x1: -40 };      // the alley lane (x from -7 to x1)
export const PARK = { z0: -118, z1: -100, x1: 34, gate0: -106.2, gate1: -102.8 };
export const BRIDGE = { z: -112, y: 5.0, half: 1.1, run: 8.3, inner: 5.5, outer: 6.9 };
export const ROADWORKS_Z = -164;
export const SOUTH_Z = -200;   // the south cross street (world.js RING.south)
// block faces that look onto the south cross street: { x0, x1, z, face } (world.js gives them ground floors)
export const SOUTH_FRONTS = [];

// places at pavement height (0.15) besides the pavements themselves
export const RAISED = [
  { minX: -30, maxX: -7, minZ: -158, maxZ: -140 },   // station plaza + concourse
  { minX: 7, maxX: 30, minZ: -150, maxZ: -140 },     // plaza under the east end of the viaduct
  { minX: YOKO.x1, maxX: -7, minZ: YOKO.z0, maxZ: YOKO.z1 },
  { minX: 7, maxX: PARK.x1, minZ: PARK.z0, maxZ: PARK.z1 },
];
// walkable rectangles; minY/maxY keep upper floors (platform, rooftops) from leaking into the street below
export const WALK = [
  { minX: -6.65, maxX: 6.65, minZ: SOUTH_Z - 6, maxZ: 42.5, maxY: 6.5 },
  { minX: -29.5, maxX: -6, minZ: -156.9, maxZ: -140.4, maxY: 3 },
  { minX: 6, maxX: 29.5, minZ: -149.6, maxZ: -140.4 },
  { minX: YOKO.x1 + 0.6, maxX: -6.6, minZ: YOKO.z0 + 0.35, maxZ: YOKO.z1 - 0.35 },
  { minX: 6.6, maxX: PARK.x1 - 0.6, minZ: PARK.z0 + 0.4, maxZ: PARK.z1 - 0.4 },
];

// where a car can go: the road (to the roadworks), the pavements, the cross street; coin-parking lots add theirs
export const DRIVE = [
  { minX: -6.9, maxX: 6.9, minZ: SOUTH_Z - 6, maxZ: 36.5 },
  { minX: -70, maxX: 70, minZ: 35.5, maxZ: 44 },
];

// extra floors at other heights: { minX, maxX, minZ, maxZ, y } (platform, rooftops, rooms far off the map)
export const FLOORS = [];
// sloped surfaces: { minX, maxX, minZ, maxZ, y: (x, z) => height } (the expressway ramp)
export const SLOPES = [];

// height of the pedestrian bridge (deck or stairs) at x, z — null where there is none
export function bridgeY(x, z) {
  const B = BRIDGE, ax = Math.abs(x);
  if (ax <= B.outer && z >= B.z - B.half && z <= B.z + B.half) return B.y;
  if (ax >= B.inner && ax <= B.outer) {
    // west stairs climb southwards towards the deck, east stairs climb northwards
    if (x < 0 && z > B.z + B.half && z < B.z + B.half + B.run) return 0.15 + (B.y - 0.15) * (1 - (z - (B.z + B.half)) / B.run);
    if (x > 0 && z < B.z - B.half && z > B.z - B.half - B.run) return 0.15 + (B.y - 0.15) * (1 - ((B.z - B.half) - z) / B.run);
  }
  return null;
}

export function buildDistrict(W) {
  const { scene, mesh, batch, std, basic, surf, collide, camPole = () => {}, colliders, lampSpots, spot, glowPool, interactables, updaters, rainSurfaces, rainEdges, props } = W;
  W.trainHome = () => ({ x: -20, y: VIADUCT.y1 + 1.1, z: VIADUCT.z0 + 1.9, yaw: 0 });
  const rnd = TX.mulberry32(1504);
  // a box given by its extents
  const bx = (x0, x1, y0, y1, z0, z1, mat, single = false) => {
    const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
    if (single) return mesh(g, mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    batch(g, mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  };
  const plane = (w, h, mat, x, y, z, ry = 0) => { const m = mesh(new THREE.PlaneGeometry(w, h), mat, x, y, z); m.rotation.y = ry; return m; };
  const glow = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) });
  const concrete = surf('concrete_wall_003', 6, 1, { color: 0x9a9890, wet: 0.8 });
  const concreteDark = surf('concrete_wall_003', 2, 2, { color: 0x6e6c66, wet: 0.8 });
  const paving = surf('large_grey_tiles', 6, 3, { wet: 0.6 });
  const steel = std(0x6a6e74, { roughness: 0.45, metalness: 0.7 }), white = std(0xe8e8e4, { roughness: 0.5 });
  const darkM = std(0x15171a, { roughness: 0.6 });
  const tubeLight = glow(2.4, 2.45, 2.5), warm = glow(2.6, 1.6, 0.8);
  // red paper lantern (akachochin) hanging from a short cord, swaying
  const capM = std(0x111111), lanterns = [];
  const lantern = (x, y, z, text) => {
    const g = new THREE.Group(); g.position.set(x, y, z); scene.add(g);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshBasicMaterial({ map: TX.lantern(text), color: new THREE.Color(1.6, 1.6, 1.6) }));
    body.scale.set(1, 1.45, 1); body.position.y = -0.38; g.add(body);
    for (const yy of [-0.08, -0.68]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 12), capM); c.position.y = yy; g.add(c); }
    lanterns.push(g);
  };
  updaters.push((t) => lanterns.forEach((g, i) => { g.rotation.z = Math.sin(t * 1.3 + i * 2) * 0.05; g.rotation.x = Math.sin(t * 0.9 + i) * 0.04; }));
  // gap: [za, zb] — leave out that stretch along z (a street goes through), without changing the random draws
  const cheapBlock = (x0, x1, z0, z1, h, faceDir, gap = null, r = rnd) => {
    // a plain block with a painted window grid on the face that can be seen
    const w = faceDir === 'x' ? Math.abs(z1 - z0) : Math.abs(x1 - x0);
    const t = TX.windows(Math.max(2, Math.round(w / 2.6)), Math.max(2, Math.floor(h / 3)), ['#4f545c', '#5d6470', '#6b6e75', '#7d756b'][Math.floor(r() * 4)], r, r() < 0.5 ? 'apt' : 'office');
    const front = new THREE.MeshStandardMaterial({ map: t.map, emissive: 0xffffff, emissiveMap: t.emissiveMap, emissiveIntensity: 0.85, roughness: 0.8 });
    const plain = std(0x4a4e55, { roughness: 0.9 });
    const mats = [front, front, std(0x24272d), std(0x24272d), front, front];
    if (faceDir === 'x') { mats[4] = mats[5] = plain; } else { mats[0] = mats[1] = plain; }
    const za = Math.min(z0, z1), zb = Math.max(z0, z1);
    const parts = gap && zb > gap[0] && za < gap[1] ? [[za, Math.min(zb, gap[0])], [Math.max(za, gap[1]), zb]].filter(([a, b]) => b - a > 2) : [[za, zb]];
    for (const [a, b] of parts) {
      // an end cut by the gap faces a street now: windows there too
      const pm = mats.slice();
      if (parts.length > 1 || (gap && (a === gap[1] || b === gap[0]))) {
        if (a === gap[1]) { pm[5] = front; SOUTH_FRONTS.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z: a, face: -1 }); }
        if (b === gap[0]) { pm[4] = front; SOUTH_FRONTS.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z: b, face: 1 }); }
      }
      const bm = mesh(new THREE.BoxGeometry(Math.abs(x1 - x0), h, b - a), pm, (x0 + x1) / 2, h / 2, (a + b) / 2);
      collide(Math.min(x0, x1), Math.max(x0, x1), a, b);
      // its faces that turn out to be seen from a street get real windows, signs and a ground floor (world.js does it
      // once every street is laid out); the south street's fronts already get their ground floors there
      if (W.lateFace) {
        const xa = Math.min(x0, x1), xb = Math.max(x0, x1), dx = xb - xa;
        if (faceDir === 'x') {
          W.lateFace({ mesh: bm, idx: 0, alongZ: true, fixed: xb, face: 1, a0: a, a1: b, h, d: dx, ground: true });
          W.lateFace({ mesh: bm, idx: 1, alongZ: true, fixed: xa, face: -1, a0: a, a1: b, h, d: dx, ground: true });
        } else {
          W.lateFace({ mesh: bm, idx: 4, alongZ: false, fixed: b, face: 1, a0: xa, a1: xb, h, d: b - a, ground: false });
          W.lateFace({ mesh: bm, idx: 5, alongZ: false, fixed: a, face: -1, a0: xa, a1: xb, h, d: b - a, ground: false });
        }
      }
    }
    if (faceDir === 'z' && r !== rnd) SOUTH_FRONTS.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z: z0 > SOUTH_Z ? Math.min(z0, z1) : Math.max(z0, z1), face: z0 > SOUTH_Z ? -1 : 1 });
  };

  // =====================================================================================
  // VIADUCT across the street, with the station platform on top
  // =====================================================================================
  const V = VIADUCT;
  bx(-170, 170, V.y0, V.y1, V.z0, V.z1, concrete);
  bx(-170, 170, V.y1, V.y1 + 0.25, V.z1 - 0.15, V.z1, concreteDark);          // edge beam
  for (let x = -166; x <= 166; x += 14) {
    if (Math.abs(x) < 32) continue;                                           // the station and shops take the middle
    if (Math.abs(Math.abs(x) - 51) < 6.5) continue;                          // the back streets pass under here
    for (const z of [V.z0 + 1.2, V.z1 - 1.2]) { bx(x - 0.6, x + 0.6, 0, V.y0, z - 0.6, z + 0.6, concreteDark); camPole(x, z, 0.6, V.y0); }
    bx(x - 0.7, x + 0.7, V.y0 - 0.6, V.y0, V.z0 + 0.4, V.z1 - 0.4, concreteDark);
  }
  // underpass: tiled walls each side of the road, strip lights in the soffit
  const tileWall = new THREE.MeshStandardMaterial({ map: TX.canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#c9cbc6'; g.fillRect(0, 0, w, h); g.fillStyle = '#a9aba6'; for (let i = 0; i <= 8; i++) { g.fillRect(i * 16 - 1, 0, 2, h); g.fillRect(0, i * 16 - 1, w, 2); } }, { repeat: true }), roughness: 0.3 });
  tileWall.map.repeat.set(4, 3);
  for (const s of [-1, 1]) {
    bx(s * 7.0, s * 7.5, 0, V.y0, V.z0, V.z1, tileWall);
    // posters in frames on the underpass walls
    for (let k = 0; k < 2; k++) {
      const pz = V.z1 - 2.2 - k * 3.4;
      plane(0.9, 1.3, basic(TX.poster ? TX.poster() : TX.signH('星見', '#fff', '#222'), 1.0), s * 6.98, 1.6, pz, s > 0 ? -Math.PI / 2 : Math.PI / 2);
    }
  }
  for (let z = V.z0 + 1; z < V.z1; z += 2) bx(-3.5, 3.5, V.y0 - 0.05, V.y0 - 0.02, z - 0.08, z + 0.08, tubeLight);
  lampSpots.push(spot(0, V.y0 - 0.4, (V.z0 + V.z1) / 2, { c: 0xe8f0ff, k: 18, d: 12 }));
  rainSurfaces.push({ x0: -170, x1: 170, z0: V.z0, z1: V.z1, y: V.y1 + 0.1, splash: false });
  rainEdges.push({ x0: -7, x1: 7, z: V.z1 + 0.02, y: V.y0, rate: 3, alongX: true });

  // the big station name on the face of the viaduct, seen from the whole street
  const nameTex = TX.canvasTex(1024, 160, (g, w, h) => {
    g.fillStyle = '#f6f6f2'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2f9a4f'; g.fillRect(0, h - 26, w, 26);
    g.fillStyle = '#1a1a1a'; g.font = `900 92px ${TX.JP_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('星見駅', w * 0.33, h / 2 - 12);
    g.font = `700 52px ${TX.LATIN_FONT}`; g.fillText('HOSHIMI STA.', w * 0.72, h / 2 - 12);
    g.fillStyle = '#2f9a4f'; g.beginPath(); g.arc(70, h / 2 - 12, 40, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.font = `900 46px ${TX.JP_FONT}`; g.fillText('星', 70, h / 2 - 10);
  });
  plane(9, 1.4, basic(nameTex, 1.25), 0, V.y0 + 0.5, V.z1 + 0.03);
  bx(-4.6, 4.6, V.y0 - 0.05, V.y0 + 1.25, V.z1 - 0.02, V.z1 + 0.02, darkM);

  // track, noise barrier, platform, canopy
  const ballast = std(0x3a3632, { roughness: 0.95 });
  bx(-170, 170, V.y1, V.y1 + 0.12, V.track - 1.5, V.track + 1.5, ballast);
  for (const s of [-1, 1]) bx(-170, 170, V.y1 + 0.12, V.y1 + 0.2, V.track + s * 0.53 - 0.035, V.track + s * 0.53 + 0.035, std(0x9a9ea4, { metalness: 0.9, roughness: 0.3 }));
  bx(-170, 170, V.y1, V.y1 + 1.15, V.z1 - 0.12, V.z1, concreteDark);
  const PY = V.y1 + 1.1, P0 = V.z0 + 0.3, P1 = V.track - 1.55;
  bx(-48, 48, V.y1, PY, P0, P1, concrete);
  bx(-48, 48, PY, PY + 0.01, P1 - 0.45, P1 - 0.15, std(0xf2c400, { roughness: 0.6 }));
  bx(-48, 48, PY, PY + 0.008, P1 - 0.12, P1, white);
  for (let x = -45; x <= 45; x += 7.5) bx(x - 0.1, x + 0.1, PY, PY + 3.1, P0 + 0.9, P0 + 1.1, steel);
  bx(-48, 48, PY + 3.1, PY + 3.3, P0 - 0.2, P1 + 0.6, std(0x8a9098, { roughness: 0.5, metalness: 0.4 }));
  for (let x = -44; x <= 44; x += 4) bx(x - 1.2, x + 1.2, PY + 3.07, PY + 3.09, P0 + 1.6, P0 + 1.75, tubeLight);
  rainSurfaces.push({ x0: -48, x1: 48, z0: P0 - 0.2, z1: P1 + 0.6, y: PY + 3.35, splash: true });
  // station-name boards hanging along the platform, benches, people waiting
  const board = TX.canvasTex(512, 160, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = '#2f9a4f'; g.fillRect(0, 100, w, 22);
    g.fillStyle = '#1a1a1a'; g.font = `900 64px ${TX.JP_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ほしみ', w / 2, 48);
    g.font = `700 24px ${TX.LATIN_FONT}`; g.fillText('Hoshimi', w / 2, 142);
    g.font = `700 18px ${TX.JP_FONT}`; g.textAlign = 'left'; g.fillText('← あまみや', 12, 142); g.textAlign = 'right'; g.fillText('つきの →', w - 12, 142);
  });
  const boardM = basic(board, 1.2);
  for (const x of [-30, 0, 30]) {
    bx(x - 1.3, x + 1.3, PY + 2.1, PY + 2.9, P1 - 0.06, P1 - 0.02, darkM);
    plane(2.5, 0.78, boardM, x, PY + 2.5, P1);
    for (const s of [-1, 1]) bx(x + s * 1.2 - 0.02, x + s * 1.2 + 0.02, PY + 2.9, PY + 3.1, P1 - 0.05, P1 - 0.03, steel);
  }
  for (const x of [-20, -8, 14, 26]) {
    bx(x - 0.9, x + 0.9, PY + 0.4, PY + 0.46, P0 + 1.5, P0 + 1.9, std(0x2a7de1, { roughness: 0.4 }));
    bx(x - 0.9, x + 0.9, PY + 0.46, PY + 0.9, P0 + 1.42, P0 + 1.5, std(0x2a7de1, { roughness: 0.4 }));
  }
  for (const [x, c] of [[-24, 0x2a3a5a], [-6, 0x5a4a3a], [5, 0x3a3a3a], [18, 0x6a2a2a], [33, 0x2f4a33]]) W.person(x, P1 - 0.9 - rnd() * 0.6, 0, c, PY);
  lampSpots.push(spot(0, PY + 2.8, P0 + 1.7, { c: 0xeef4ff, k: 20, d: 16 }), spot(-30, PY + 2.8, P0 + 1.7, { c: 0xeef4ff, k: 14, d: 12 }), spot(30, PY + 2.8, P0 + 1.7, { c: 0xeef4ff, k: 14, d: 12 }));
  // overhead wires along the viaduct
  const cat = buildCatenary(scene, std, V.track, -160, 160, () => true);
  cat.position.y = V.y1;
  for (let x = -160; x <= 160; x += 25) {
    bx(x - 0.11, x + 0.11, V.y1, V.y1 + 6.4, V.z1 - 0.32, V.z1 - 0.1, steel);
    bx(x - 0.04, x + 0.04, V.y1 + 5.95, V.y1 + 6.03, V.track - 0.1, V.z1 - 0.1, steel);
  }

  // the stopping train: rolls in, waits with its doors lit, pulls away; about every 75 s
  const train = buildTrain(scene, std, 4);
  const TL = train.userData.length, stopHead = TL / 2;
  train.position.set(-1000, V.y1, V.track);
  let lastHead = -1000;
  const trainState = { stopped: false };
  updaters.push((t, dt) => {
    const c = (t + 40) % 75;
    let head;
    trainState.stopped = c > 21 && c < 35;
    W.sound.trainStopped = trainState.stopped;
    if (c < 20) head = stopHead - 320 * ((20 - c) / 20) ** 2;
    else if (c < 36) head = stopHead;
    else if (c < 58) head = stopHead + 420 * ((c - 36) / 22) ** 2;
    else head = -1000;
    const v = (head - lastHead) / Math.max(dt, 1e-3); lastHead = head;
    train.position.x = head;
    if (head > -900 && Math.abs(v) < 60) for (const w of train.userData.wheels) w.rotation.y += dt * v / 0.43;
    train.userData.beam.intensity = head > -900 ? 60 : 0;
  });

  // =====================================================================================
  // STATION CONCOURSE under the west half of the viaduct, entered from the plaza
  // =====================================================================================
  const SX0 = -30, SX1 = -7.5;
  const hallFloor = surf('large_grey_tiles', 6, 3, { color: 0xd8d6d0, wet: 0.3 });
  bx(SX0, SX1, 0, 0.15, V.z0, V.z1, hallFloor);
  bx(SX0, SX0 + 0.3, 0, V.y0, V.z0, V.z1, concrete); bx(SX0, SX1, 0, V.y0, V.z0, V.z0 + 0.3, tileWall);
  bx(SX0, SX1, V.y0 - 0.7, V.y0, V.z1 - 0.3, V.z1, concrete);
  collide(SX0, SX0 + 0.3, V.z0, V.z1);
  // ceiling lights
  for (let x = SX0 + 2; x < SX1 - 1; x += 3) bx(x - 1.0, x + 1.0, V.y0 - 0.75, V.y0 - 0.72, V.z0 + 2, V.z0 + 2.15, tubeLight), bx(x - 1.0, x + 1.0, V.y0 - 0.75, V.y0 - 0.72, V.z0 + 5, V.z0 + 5.15, tubeLight);
  // glass front with an open entrance in the middle
  const glassM = new THREE.MeshStandardMaterial({ color: 0xdfeaf5, transparent: true, opacity: 0.16, roughness: 0.03, metalness: 0.6, depthWrite: false });
  const door0 = -22, door1 = -15;
  for (const [a, b] of [[SX0 + 0.3, door0], [door1, SX1]]) {
    plane(b - a, 3.2, glassM, (a + b) / 2, 1.75, V.z1 - 0.02);
    for (let x = a; x <= b + 0.01; x += (b - a) / Math.max(1, Math.round((b - a) / 1.6))) bx(x - 0.04, x + 0.04, 0.15, 3.35, V.z1 - 0.06, V.z1 + 0.02, steel);
    collide(a, b, V.z1 - 0.1, V.z1 + 0.1);
  }
  bx(SX0, SX1, 3.35, V.y0 - 0.7, V.z1 - 0.1, V.z1, concreteDark);
  // entrance sign band over the doors
  const entr = TX.canvasTex(512, 96, (g, w, h) => { g.fillStyle = '#123a24'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = `900 46px ${TX.JP_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('星見駅  中央口', w / 2 - 40, h / 2); g.font = `700 22px ${TX.LATIN_FONT}`; g.fillText('Central Exit', w - 90, h / 2 + 2); });
  plane(7, 1.0, basic(entr, 1.3), (door0 + door1) / 2, 3.95, V.z1 + 0.03);
  // ticket gates across the concourse
  const gateZ = V.z1 - 5.0, gateBody = std(0xd8dce2, { roughness: 0.35, metalness: 0.4 }), gateTop = std(0x2a2d33, { roughness: 0.3 });
  const blue = glow(0.4, 1.4, 2.6), green = glow(0.4, 2.4, 0.8);
  for (let k = 0; k <= 6; k++) {
    const x = -26 + k * 2.1;
    bx(x - 0.15, x + 0.15, 0.15, 1.15, gateZ - 0.9, gateZ + 0.9, gateBody);
    bx(x - 0.16, x + 0.16, 1.15, 1.2, gateZ - 0.9, gateZ + 0.9, gateTop);
    bx(x - 0.1, x + 0.1, 1.2, 1.21, gateZ + 0.3, gateZ + 0.55, k % 2 ? green : blue);
    plane(0.25, 0.12, k % 2 ? green : blue, x, 1.0, gateZ + 0.905);
  }
  for (let k = 0; k <= 6; k++) { const x = -26 + k * 2.1; collide(x - 0.16, x + 0.16, gateZ - 0.9, gateZ + 0.9); }
  const flap = new THREE.MeshStandardMaterial({ color: 0xff8a3c, transparent: true, opacity: 0.75, roughness: 0.3 });
  for (let k = 0; k < 6; k++) W.doors.add({ kind: 'auto', x: -26 + k * 2.1 + 1.05, z: gateZ, y: 0.45, w: 1.7, h: 0.55, along: 'x', mat: flap, sound: 'gate' });
  W.addRoom({ name: 'Hoshimi Station', jp: '星見駅', minX: SX0 + 0.3, maxX: SX1, minZ: V.z0 + 0.3, maxZ: V.z1, y: 0.15, ceil: V.y0 - 0.8, amb: 'station', camDist: 3, floor: false });
  // up the stairs to the platform, and back down
  const stairTop = { x: -20, z: P0 + 1.6 };
  interactables.push({ pos: new THREE.Vector3(-20, 0, gateZ - 1.1), r: 1.4, label: 'Up to the platform', action: (api) => { api.sound.step(false); api.teleport(stairTop.x, PY, stairTop.z, 0); return null; } });
  interactables.push({ pos: new THREE.Vector3(stairTop.x, PY, P0 + 0.9), r: 1.2, label: 'Down to the ticket gates', action: (api) => { api.teleport(-20, 0.15, gateZ - 1.3, Math.PI); return null; } });
  WALK.push({ minX: -46, maxX: 46, minZ: P0 + 0.45, maxZ: P1 - 0.2, minY: PY - 1, maxY: PY + 2 });
  FLOORS.push({ minX: -48, maxX: 48, minZ: P0, maxZ: P1, y: PY });
  // benches and pillars up on the platform: they block only up there (not the street under the viaduct — the
  // pillar at x = 0 used to stand invisibly in the middle of the road)
  const onPlatform = () => Object.assign(colliders[colliders.length - 1], { minY: PY - 0.6, maxY: PY + 3 });
  for (const x of [-20, -8, 14, 26]) { collide(x - 0.9, x + 0.9, P0 + 1.42, P0 + 1.9); onPlatform(); }
  for (let x = -45; x <= 45; x += 7.5) { collide(x - 0.12, x + 0.12, P0 + 0.88, P0 + 1.12); onPlatform(); }
  // board when the train is standing at the platform: the ride ends at Tsukino
  for (const x of [-26, -6, 14, 34]) interactables.push({
    pos: new THREE.Vector3(x, PY, P1 - 0.5), r: 1.6, label: 'Board the train to Tsukino', hidden: () => !trainState.stopped,
    action: (api) => { api.sound.door('auto', 1); W.pockets.train.ride(api, W.tsukino.arrive, 'Tsukino'); return null; },
  });
  interactables.push({ pos: new THREE.Vector3(0, PY, P1 - 0.6), r: 3, label: 'Wait for the train', hidden: () => trainState.stopped, lines: [{ text: 'The board says the next train is due soon. The rails in front of you shine under the platform lights.' }] });
  // stairs up to the platform behind the gates
  const stepM = std(0xb8b8b2, { roughness: 0.6 });
  for (let i = 0; i < 12; i++) bx(-24, -16, 0.15 + i * 0.25, 0.4 + i * 0.25, gateZ - 1.4 - i * 0.12, gateZ - 1.52 - i * 0.12 + 0.12 - 0.12, stepM);
  // ticket machines along the east wall, a fare map above, a departure board over the gates
  const tm = TX.canvasTex(128, 192, (g, w, h) => { g.fillStyle = '#e8eaee'; g.fillRect(0, 0, w, h); g.fillStyle = '#1d4fb8'; g.fillRect(0, 0, w, 22); g.fillStyle = '#fff'; g.font = `700 14px ${TX.JP_FONT}`; g.textAlign = 'center'; g.fillText('きっぷ', w / 2, 16); g.fillStyle = '#3a8fe0'; g.fillRect(14, 34, 100, 70); g.fillStyle = '#ddeeff'; for (let i = 0; i < 6; i++) g.fillRect(20 + (i % 3) * 32, 40 + Math.floor(i / 3) * 30, 26, 24); g.fillStyle = '#333'; g.fillRect(30, 120, 30, 6); g.fillRect(74, 120, 24, 30); g.fillRect(24, 160, 80, 12); });
  const tmM = basic(tm, 1.1);
  for (let k = 0; k < 4; k++) {
    const z = V.z1 - 1.3 - k * 0.85;
    bx(SX1 - 0.75, SX1, 0.15, 1.75, z - 0.38, z + 0.38, std(0xd8dce2, { roughness: 0.4, metalness: 0.4 }));
    plane(0.72, 1.3, tmM, SX1 - 0.76, 1.05, z, -Math.PI / 2);
  }
  const fare = TX.canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#f6f6f2'; g.fillRect(0, 0, w, h); g.strokeStyle = '#2f9a4f'; g.lineWidth = 8; g.beginPath(); g.moveTo(20, 140); g.lineTo(w - 20, 120); g.stroke();
    g.strokeStyle = '#e67e22'; g.beginPath(); g.moveTo(120, 20); g.lineTo(200, h - 20); g.stroke(); g.strokeStyle = '#1d4fb8'; g.beginPath(); g.moveTo(340, 20); g.lineTo(300, h - 20); g.stroke();
    const names = ['あまみや', 'ほしみ', 'つきの', 'しぐれ', 'かすみ', 'みなと'];
    names.forEach((n, i) => { const x = 40 + i * 85, y = 140 - i * 4; g.fillStyle = i === 1 ? '#d11' : '#fff'; g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#333'; g.lineWidth = 2; g.stroke(); g.fillStyle = '#222'; g.font = `700 16px ${TX.JP_FONT}`; g.textAlign = 'center'; g.fillText(n, x, y - 18); g.fillStyle = '#d11'; g.fillText(i === 1 ? '現在地' : `${140 + Math.abs(i - 1) * 30}`, x, y + 28); });
  });
  plane(3.0, 1.5, basic(fare, 1.05), SX1 - 0.02, 2.75, V.z1 - 2.6, -Math.PI / 2);
  const dep = TX.canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = '#050505'; g.fillRect(0, 0, w, h); g.font = `700 22px ${TX.JP_FONT}`; g.textBaseline = 'middle';
    [['各停', 'つきの', '23:58', '#3cff6a'], ['快速', 'あまみや', '0:04', '#ff9a3c'], ['各停', 'つきの', '0:12', '#3cff6a']].forEach(([k, d, tm2, c], i) => { const y = 24 + i * 40; g.fillStyle = c; g.fillText(k, 12, y); g.fillStyle = '#ffd23c'; g.fillText(d, 90, y); g.fillText(tm2, 260, y); g.fillStyle = '#ff5a3c'; g.fillText('2番線', 380, y); });
  });
  bx(-22.6, -14.4, 2.6, 3.65, gateZ + 0.95, gateZ + 1.05, darkM);
  plane(8, 1.0, basic(dep, 1.4), -18.5, 3.12, gateZ + 1.06);
  bx(-21, -20.9, 3.65, V.y0 - 0.7, gateZ + 1.0, gateZ + 1.05, steel); bx(-16.1, -16, 3.65, V.y0 - 0.7, gateZ + 1.0, gateZ + 1.05, steel);
  // station office window with a member of staff
  bx(SX0 + 0.3, SX0 + 2.6, 0.15, 1.0, V.z1 - 4.6, V.z1 - 0.6, std(0xd8dce2, { roughness: 0.4 }));
  W.person(SX0 + 1.2, V.z1 - 2.6, Math.PI / 2, 0x1d2a44, 0.15);
  collide(SX0 + 0.3, SX0 + 2.6, V.z1 - 4.6, V.z1 - 0.6);
  lampSpots.push(spot(-18.5, 4.6, V.z1 - 2.5, { c: 0xf2f6ff, k: 24, d: 14 }));
  // a bright concourse: lit back wall with ad panels, glow on the floor
  bx(SX0 + 0.3, SX1, 0.15, V.y0 - 0.75, V.z0 + 0.3, V.z0 + 0.32, new THREE.MeshStandardMaterial({ color: 0xe8ece8, emissive: 0x9aa0a0, roughness: 0.4 }));
  for (let x = SX0 + 2; x < SX1 - 2; x += 3.2) plane(2.4, 1.4, basic(TX.poster ? TX.poster() : TX.signH('星見', '#fff', '#222'), 1.1), x, 3.4, V.z0 + 0.34);
  glowPool(-18.5, 0.16, (V.z0 + V.z1) / 2, 21, 7.5, 0xe8f0ff, 0.45);
  glowPool(-18.5, 0.16, V.z1 + 2.4, 9, 5, 0xe8f0ff, 0.35);
  interactables.push({ pos: new THREE.Vector3(-18.5, 0, gateZ + 1.6), r: 2.4, label: 'Look at the departure board', lines: [
    { who: 'Hoshimi Station', text: 'Last train to Tsukino at 0:12. The LED board flickers softly.' },
    { text: 'The attendant in the office window yawns, then pretends to be busy writing.' },
  ] });

  // =====================================================================================
  // PLAZAS north of the viaduct
  // =====================================================================================
  bx(-30, -7, 0, 0.15, -150, -140, paving);
  bx(7, 30, 0, 0.15, -150, -140, paving);
  // blocks beside the station, south of the viaduct (they used to stand across it, so trains came out of their walls)
  cheapBlock(-44, -30, V.z1 + 0.4, -140, 14, 'x');
  cheapBlock(30, 44, V.z1 + 0.4, -140, 12, 'x');
  // clock pole, bus shelter, phone box, planters, lamps
  const pole = std(0x3a3e44, { roughness: 0.5, metalness: 0.6 });
  bx(-10.08, -9.92, 0.15, 4.0, -143.08, -142.92, pole);
  const clockT = TX.canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill(); g.lineWidth = 6; g.strokeStyle = '#222'; g.stroke(); for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.fillStyle = '#222'; g.fillRect(64 + Math.cos(a) * 48 - 3, 64 + Math.sin(a) * 48 - 3, 6, 6); } g.lineWidth = 6; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(-Math.PI / 2 + 0.4) * 40, 64 + Math.sin(-Math.PI / 2 + 0.4) * 40); g.moveTo(64, 64); g.lineTo(64 + Math.cos(-Math.PI / 2 - 0.1) * 30, 64 + Math.sin(-Math.PI / 2 - 0.1) * 30); g.stroke(); });
  const clockM = basic(clockT, 1.3);
  mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.14, 24).rotateX(Math.PI / 2), pole, -10, 4.3, -143);
  plane(0.76, 0.76, clockM, -10, 4.3, -142.92); plane(0.76, 0.76, clockM, -10, 4.3, -143.08, Math.PI);
  collide(-10.2, -9.8, -143.2, -142.8); camPole(-10, -143, 0.1, 4.8);
  // bus shelter facing the road
  const shelterX = -8.2;
  bx(shelterX - 0.05, shelterX + 0.05, 0.15, 2.5, -147.5, -147.4, steel); bx(shelterX - 0.05, shelterX + 0.05, 0.15, 2.5, -143.6, -143.5, steel);
  bx(shelterX - 1.2, shelterX + 0.2, 2.5, 2.6, -147.6, -143.4, std(0xc8ccd2, { roughness: 0.4, metalness: 0.5 }));
  plane(3.9, 2.2, glassM, shelterX - 1.1, 1.35, -145.5, Math.PI / 2);
  bx(shelterX - 1.0, shelterX - 0.6, 0.55, 0.6, -147, -144, std(0x8a5a32, { roughness: 0.5 }));
  const busT = TX.canvasTex(128, 192, (g, w, h) => { g.fillStyle = '#1d4fb8'; g.fillRect(0, 0, w, 60); g.fillStyle = '#fff'; g.font = `900 30px ${TX.JP_FONT}`; g.textAlign = 'center'; g.fillText('バス', w / 2, 40); g.fillStyle = '#f6f6f2'; g.fillRect(0, 60, w, h - 60); g.fillStyle = '#222'; g.font = `700 14px ${TX.JP_FONT}`; for (let i = 0; i < 6; i++) g.fillText(`${22 + Math.floor(i / 2)}:${['05', '35'][i % 2]}  星見団地`, w / 2, 86 + i * 18); });
  bx(shelterX + 0.25, shelterX + 0.31, 0.15, 2.6, -148.2, -148.14, pole);
  plane(0.5, 0.75, basic(busT, 1.1), shelterX + 0.28, 2.1, -148.1);
  collide(shelterX - 1.25, shelterX + 0.1, -147.6, -143.4);
  // green phone box with a lit interior
  bx(-28.6, -27.6, 0.15, 2.3, -142.5, -141.5, new THREE.MeshStandardMaterial({ color: 0x2f9a4f, transparent: true, opacity: 0.55, roughness: 0.2, depthWrite: false }));
  bx(-28.65, -27.55, 2.3, 2.45, -142.55, -141.45, std(0x2f9a4f, { roughness: 0.4 }));
  bx(-28.4, -27.8, 1.2, 1.5, -142.45, -142.3, std(0x6fbf73, { roughness: 0.4, emissive: 0x204020 }));
  bx(-28.4, -27.8, 2.2, 2.25, -142.4, -141.6, glow(2.2, 2.4, 2.2));
  collide(-28.7, -27.5, -142.6, -141.4);
  // planters with small trees
  const leaf = std(0x2c5a34, { roughness: 0.8 }), bark = std(0x4a3626, { roughness: 0.9 });
  const tree = (x, z, s = 1, y0 = 0.15) => {
    batch(new THREE.CylinderGeometry(0.09 * s, 0.14 * s, 2.4 * s, 8), bark, x, y0 + 1.2 * s, z);
    for (let k = 0; k < 6; k++) { const a = k * 1.1, r = (0.5 + (k % 3) * 0.2) * s; const g = new THREE.IcosahedronGeometry(0.7 * s, 1); batch(g, leaf, x + Math.cos(a) * r * 0.6, y0 + (2.4 + (k % 2) * 0.5) * s, z + Math.sin(a) * r * 0.6); }
    collide(x - 0.25, x + 0.25, z - 0.25, z + 0.25);
  };
  for (const [x, z] of [[-14, -142], [-24, -142]]) { bx(x - 0.9, x + 0.9, 0.15, 0.6, z - 0.9, z + 0.9, concreteDark); tree(x, z, 1.1, 0.6); collide(x - 0.9, x + 0.9, z - 0.9, z + 0.9); }
  // bike parking on the east plaza, a yakitori stall under the viaduct
  for (let k = 0; k < 9; k++) { const b = W.bike(10 + k * 0.62, -141.2, [0x2b6cb0, 0xd9d9d9, 0x3a8a4a, 0x8a2a2a, 0x222222][k % 5]); b.rotation.y = Math.PI / 2; }
  collide(9.5, 15.5, -142, -140.4);
  const stallX0 = 15, stallX1 = 24, sz = V.z1;
  bx(stallX0, stallX1, 0.15, V.y0, V.z0, sz - 1.4, std(0x3a2a1e, { roughness: 0.8 }));
  bx(stallX0, stallX1, 0.15, 1.05, sz - 1.4, sz - 0.9, std(0x6a4426, { roughness: 0.6 }));
  bx(stallX0 - 0.05, stallX1 + 0.05, 1.05, 1.12, sz - 1.5, sz - 0.75, std(0x8a5a32, { roughness: 0.4 }));
  bx(stallX0, stallX1, 2.5, 2.8, sz - 1.4, sz - 0.6, std(0x2a1a10, { roughness: 0.7 }));
  plane(stallX1 - stallX0, 3.2, glow(1.6, 0.9, 0.45), (stallX0 + stallX1) / 2, 1.8, sz - 1.41);
  const noren = basic(TX.canvasTex(512, 96, (g, w, h) => { g.fillStyle = '#1d2547'; g.fillRect(0, 0, w, h); g.fillStyle = '#0c1024'; for (let i = 1; i < 6; i++) g.fillRect(i * 85, 26, 3, h); g.fillStyle = '#f2ecdf'; g.font = `900 52px ${TX.JP_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('焼 鳥  ガード下', w / 2, 52); }), 0.95);
  plane(stallX1 - stallX0 - 0.4, 0.6, noren, (stallX0 + stallX1) / 2, 2.2, sz - 0.62);
  for (let k = 0; k < 6; k++) { const x = stallX0 + 1 + k * 1.4; batch(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 14), std(0xb3201a, { roughness: 0.5 }), x, 0.62, sz - 0.35); batch(new THREE.CylinderGeometry(0.03, 0.03, 0.45, 8), steel, x, 0.38, sz - 0.35); }
  for (const [x, c] of [[17.4, 0x2a3a5a], [20.2, 0x5a4a3a]]) W.person(x, sz - 0.3, Math.PI, c, 0.15, 1.6);
  W.person(19, sz - 2.0, 0, 0xf4f4f2, 0.15);
  W.steam(21, 2.9, sz - 1.6);
  for (let k = 0; k < 4; k++) lantern(stallX0 + 1 + k * 2.3, 2.55, sz - 0.5, '焼鳥');
  collide(stallX0, stallX1, V.z0, sz - 0.1);
  lampSpots.push(spot(19.5, 2.4, sz + 0.5, { c: 0xffa060, k: 16, d: 10 }));
  glowPool(19.5, 0.16, sz + 1.5, 9, 3.5, 0xffa060, 0.4);
  interactables.push({ pos: new THREE.Vector3(19.5, 0, sz + 0.6), r: 2.2, label: 'Look at the yakitori stall', lines: [
    { who: 'Yakitori Gādoshita', text: 'A skewer stall under the tracks. Every time a train passes, the glasses on the counter tremble.' },
    { text: '"Two negima, one kawa!" The smoke smells of sweet soy.' },
  ] });
  // the rest under the east half: shutters
  for (let x = 25; x < 29.5; x += 1.08) props.shutter.push({ x, y: 0.15, z: sz - 0.05, ry: 0 });
  bx(24.4, 30, 0.15, V.y0, V.z0, sz - 0.2, concreteDark);
  collide(24.4, 30, V.z0, sz);
  // same block under the west wall of the road beyond the concourse is solid
  collide(-7.5, -7.0, V.z0, V.z1); collide(7.0, 7.5, V.z0, V.z1);

  // =====================================================================================
  // BEYOND the viaduct: the street goes on into the haze, closed by night roadworks
  // =====================================================================================
  for (const s of [-1, 1]) {
    let z = V.z0;
    const g0 = SOUTH_Z - 6.5, g1 = SOUTH_Z + 6.5;   // the south cross street and its pavements
    while (z > -240) { const w = 8 + rnd() * 8, h = 9 + Math.floor(rnd() * 5) * 3; cheapBlock(s * 7.2, s * (7.2 + 10), z - w, z, h, 'x', [g0, g1]); z -= w + 0.4; }
  }
  // the main street ends at the south cross street (a T): a block closes it, and blocks line the cross street.
  // Its own random numbers, so nothing else in the district moves.
  {
    const rs = TX.mulberry32(2026);
    const S0 = SOUTH_Z - 6.9, N0 = SOUTH_Z + 6.9;
    cheapBlock(-7.0, 7.0, S0 - 22, S0, 15, 'z', null, rs);
    for (const s of [-1, 1]) {
      // south side, from the main street's blocks out past the back street's corner
      for (let x = 17.6; x < 69; ) {
        const x1 = Math.min(x + 9 + rs() * 7, 70), h = 9 + Math.floor(rs() * 5) * 3;
        cheapBlock(s * x, s * x1, S0 - 10 - rs() * 4, S0, h, 'z', null, rs);
        x = x1 + 0.4;
      }
      // north side, between the main street's blocks and the back street's
      cheapBlock(s * 17.6, s * 27, N0 + 12, N0, 12 + Math.floor(rs() * 3) * 3, 'z', null, rs);
      cheapBlock(s * 27.4, s * 37, N0 + 12, N0, 9 + Math.floor(rs() * 4) * 3, 'z', null, rs);
    }
  }

  // =====================================================================================
  // YOKOCHŌ: a lane of tiny bars west of the street
  // =====================================================================================
  const Y = YOKO;
  bx(Y.x1, -7, 0, 0.15, Y.z0, Y.z1, surf('concrete_floor_02', 10, 1, { color: 0x6a6660, wet: 0.25 }));
  bx(Y.x1, -7, 0.15, 0.16, (Y.z0 + Y.z1) / 2 - 0.08, (Y.z0 + Y.z1) / 2 + 0.08, std(0x1a1b1e, { roughness: 0.2, metalness: 0.5 }));
  bx(Y.x1 - 0.4, Y.x1, 0, 6, Y.z0 - 3.6, Y.z1 + 3.6, concreteDark);
  collide(Y.x1 - 0.4, Y.x1, Y.z0, Y.z1);
  const facades = ['#6a4a30', '#4a3a2e', '#7a6a58', '#3a3530', '#5a4636'].map((c) => std(c, { roughness: 0.85 }));
  const iron = surf('corrugated_iron', 2, 2, { color: 0x8a8a84, wet: 0.6 });
  const BAR = [['とり吉', '#b3201a'], ['のんべえ', '#1d2547'], ['酒処 雨', '#2a1a10'], ['もつ焼', '#7a1f1f'], ['BAR 灯', '#140c1c'], ['おでん', '#1f4a2a'], ['立呑み', '#0e2b5c'], ['ホルモン', '#5a1a10'], ['串カツ', '#7a4a10'], ['小料理 月', '#2a1a3a'], ['煮込み', '#3a2010'], ['スナック 紫', '#3a1050']];
  // frosted sliding doors: warm light with blurred drinkers behind the glass
  const doorTex = () => basic(TX.canvasTex(256, 192, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#f2c27a'); gr.addColorStop(1, '#b8743a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.filter = 'blur(6px)';
    const n = Math.floor(rnd() * 3) + (rnd() < 0.8 ? 1 : 0);
    for (let i = 0; i < n; i++) { const x = 30 + rnd() * (w - 60), y = 70 + rnd() * 20; g.fillStyle = 'rgba(40,24,14,0.75)'; g.beginPath(); g.arc(x, y, 16, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(x, y + 60, 34, 46, 0, 0, Math.PI * 2); g.fill(); }
    g.filter = 'none';
    g.fillStyle = 'rgba(255,255,255,0.12)'; for (let y = 6; y < h; y += 12) g.fillRect(0, y, w, 2);
  }), 0.95);
  let bi = 0;
  for (const [zf, dir, zb] of [[Y.z1, 1, Y.z1 + 3.5], [Y.z0, -1, Y.z0 - 3.5]]) {
    // dir: +1 = north row (front faces −z), −1 = south row (front faces +z)
    for (let x = -7.3; x > Y.x1 + 0.5;) {
      const w = 2.6 + rnd() * 0.8, x0 = Math.max(Y.x1, x - w), cx = (x + x0) / 2, h = 4.6 + rnd() * 1.6;
      const fm = rnd() < 0.3 ? iron : facades[Math.floor(rnd() * facades.length)];
      bx(x0, x, 0, h, Math.min(zf, zb), Math.max(zf, zb), fm);
      collide(x0, x, Math.min(zf, zb), Math.max(zf, zb));
      const ry = dir > 0 ? Math.PI : 0, fz = zf - dir * 0.01, out = -dir;
      const [name, col] = BAR[bi++ % BAR.length];
      // lit doorway with a sliding glass door, a noren over it, a lantern and a small sign
      plane(w - 0.6, 2.0, doorTex(), cx, 1.15, fz, ry);
      for (let k = 0; k <= 3; k++) bx(x0 + 0.3 + k * ((w - 0.6) / 3) - 0.025, x0 + 0.3 + k * ((w - 0.6) / 3) + 0.025, 0.15, 2.15, fz + out * 0.01 - 0.02, fz + out * 0.01 + 0.02, std(0x3a2414));
      const nr = basic(TX.canvasTex(256, 96, (g, cw, ch) => { g.fillStyle = col; g.fillRect(0, 0, cw, ch); g.fillStyle = 'rgba(0,0,0,0.35)'; for (let i = 1; i < 3; i++) g.fillRect(i * 85, 30, 3, ch); g.fillStyle = '#f2ecdf'; g.font = `900 ${name.length > 4 ? 34 : 44}px ${TX.JP_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, cw / 2, 50); }), 0.9);
      plane(Math.min(1.6, w - 0.8), 0.6, nr, cx, 1.85, fz + out * 0.06, ry);
      lantern(x0 + 0.35, 2.45, zf + out * 0.25, name.slice(0, 2));
      // a little projecting light-box sign up high
      const sg = basic(TX.signV(name.replace(/\s/g, '').slice(0, 4), '#16100c', ['#ffcf4f', '#ff8a3a', '#ff6fd8', '#9df0ff'][bi % 4]), 1.5);
      mesh(new THREE.BoxGeometry(0.16, 1.3, 0.5), [sg, sg, darkM, darkM, darkM, darkM], x - 0.25, 3.4, zf + out * 0.3).rotation.y = Math.PI / 2;
      // upstairs window, AC unit, beer crates and a stool by some doors
      plane(0.9, 0.7, glow(rnd() < 0.5 ? 1.3 : 0.15, rnd() < 0.5 ? 1.0 : 0.12, 0.5), cx, 3.6, fz, ry);
      if (rnd() < 0.5) props.ac.push({ x: x0 + 0.5, y: 2.75, z: zf + out * 0.25, ry: dir > 0 ? Math.PI : 0, s: 0.6 });
      if (rnd() < 0.6) {
        const cz2 = zf + out * 0.3, cxx = x - 0.4;
        for (let k = 0; k < 2; k++) batch(new THREE.BoxGeometry(0.45, 0.3, 0.35), std([0xf2c400, 0x2f6fd6, 0xc0392b][Math.floor(rnd() * 3)], { roughness: 0.6 }), cxx, 0.3 + k * 0.3, cz2);
        collide(cxx - 0.25, cxx + 0.25, cz2 - 0.2, cz2 + 0.2);
      }
      rainEdges.push({ x0, x1: x, z: zf + out * 0.3, y: 2.6, rate: 1.5, alongX: true });
      x = x0 - 0.05;
    }
  }
  // strings of lanterns and wires zig-zagging over the lane, a warm glow on the wet floor
  const bulbs = [];
  for (let x = -8; x > Y.x1 + 1; x -= 0.45) bulbs.push(new THREE.Vector3(x, 3.2 + Math.sin(x * 0.7) * 0.15, (Y.z0 + Y.z1) / 2 + Math.sin(x * 1.3) * 0.9));
  W.bulbs(bulbs, [0xffd27a, 0xff9a5a], 3);
  for (let x = -9; x > Y.x1; x -= 4.5) W.sag(new THREE.Vector3(x, 4.3, Y.z0 - 0.1), new THREE.Vector3(x - 1.5, 4.0, Y.z1 + 0.1), 0.3, 6);
  for (let x = -10; x > Y.x1; x -= 8) { lampSpots.push(spot(x, 2.6, (Y.z0 + Y.z1) / 2, { c: 0xff9a50, k: 10, d: 8 })); }
  glowPool((Y.x1 - 7) / 2, 0.16, (Y.z0 + Y.z1) / 2, Math.abs(Y.x1 + 7), 2.8, 0xff9a50, 0.35);
  W.steam(-20, 2.5, Y.z1 - 0.3); W.steam(-31, 2.5, Y.z0 + 0.3);
  // gateway arch at the street end
  const gate = std(0x2a1a10, { roughness: 0.6 });
  for (const z of [Y.z0 + 0.05, Y.z1 - 0.05]) bx(-7.45, -7.25, 0.15, 3.9, z - 0.1, z + 0.1, gate);
  const yk = basic(TX.canvasTex(512, 96, (g, w, h) => { g.fillStyle = '#2a0a06'; g.fillRect(0, 0, w, h); g.strokeStyle = '#ffb45a'; g.lineWidth = 4; g.strokeRect(5, 5, w - 10, h - 10); g.fillStyle = '#ffd27a'; g.shadowColor = '#ff8a3a'; g.shadowBlur = 14; g.font = `900 56px ${TX.JP_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ほしみ横丁', w / 2, h / 2 + 2); }), 1.6);
  mesh(new THREE.BoxGeometry(0.2, 0.62, Y.z1 - Y.z0 + 0.3), [yk, yk, gate, gate, gate, gate], -7.35, 3.6, (Y.z0 + Y.z1) / 2);
  interactables.push({ pos: new THREE.Vector3(-8.5, 0, (Y.z0 + Y.z1) / 2), r: 2.2, label: 'Look down the alley', lines: [
    { who: 'Hoshimi Yokochō', text: 'A narrow alley of tiny bars. Each one seats six, and every one is full.' },
    { text: 'Grilled skewers, cigarette smoke, loud laughter behind plastic curtains.' },
  ] });
  interactables.push({ pos: new THREE.Vector3(Y.x1 + 1.5, 0, (Y.z0 + Y.z1) / 2), r: 1.8, label: 'End of the alley', lines: [{ text: 'A dead end. A tabby cat sleeps on a beer crate, indifferent to the rain.' }] });
  W.cat?.(Y.x1 + 0.9, Y.z1 - 0.4);

  // =====================================================================================
  // PARK on the east side
  // =====================================================================================
  const P = PARK, px0 = 7.2;
  const dirtT = TX.canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#34302c'; g.fillRect(0, 0, w, h); for (let i = 0; i < 2500; i++) { const v = 40 + Math.random() * 40; g.fillStyle = `rgba(${v + 8},${v + 4},${v},0.5)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } }, { repeat: true });
  dirtT.repeat.set(8, 5);
  bx(px0, P.x1, 0, 0.15, P.z0, P.z1, new THREE.MeshStandardMaterial({ map: dirtT, roughness: 0.42, metalness: 0.1, color: 0xb8b4b0 }));
  // puddles that catch the lamps
  const puddle = new THREE.MeshStandardMaterial({ color: 0x3a4250, roughness: 0.04, metalness: 0.6, transparent: true, opacity: 0.6, depthWrite: false });
  for (const [x, z, sx, sz2] of [[15, -107, 3.2, 1.6], [24, -113, 2.2, 1.3], [11, -114, 1.6, 1.0]]) { const m = mesh(new THREE.CircleGeometry(1, 28), puddle, x, 0.165, z); m.rotation.x = -Math.PI / 2; m.scale.set(sx, sz2, 1); }
  // fence round the park, gap for the gate
  const fenceT = TX.canvasTex(64, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(70,120,80,0.95)'; g.lineWidth = 2; for (let i = -64; i < 128; i += 10) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, h); g.stroke(); g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, h); g.stroke(); } }, { repeat: true });
  const fenceM = (len) => { const t = fenceT.clone(); t.needsUpdate = true; t.repeat.set(len / 0.6, 2); return new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.6 }); };
  const fpost = std(0x3a6a44, { roughness: 0.5, metalness: 0.5 });
  const fence = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2;
    plane(len, 1.1, fenceM(len), (x0 + x1) / 2, 0.75, (z0 + z1) / 2, ang);
    for (let k = 0; k <= Math.round(len / 2); k++) { const u = k / Math.max(1, Math.round(len / 2)); bx(x0 + (x1 - x0) * u - 0.03, x0 + (x1 - x0) * u + 0.03, 0.15, 1.35, z0 + (z1 - z0) * u - 0.03, z0 + (z1 - z0) * u + 0.03, fpost); }
    bx(Math.min(x0, x1) - 0.03, Math.max(x0, x1) + 0.03, 1.3, 1.34, Math.min(z0, z1) - 0.03, Math.max(z0, z1) + 0.03, fpost);
    collide(Math.min(x0, x1) - 0.08, Math.max(x0, x1) + 0.08, Math.min(z0, z1) - 0.08, Math.max(z0, z1) + 0.08);
  };
  fence(px0, P.z1, px0, P.gate1); fence(px0, P.gate0, px0, P.z0);
  fence(px0, P.z0, P.x1, P.z0); fence(px0, P.z1, P.x1, P.z1); fence(P.x1, P.z0, P.x1, P.z1);
  // gate posts with the park's name plate, a U-shaped barrier
  const plate = basic(TX.canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#e8e2d2'; g.fillRect(0, 0, w, h); g.fillStyle = '#1a1a1a'; g.font = `900 34px ${TX.JP_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('星見児童公園', w / 2, h / 2); }), 0.9);
  for (const z of [P.gate0, P.gate1]) bx(px0 - 0.2, px0 + 0.2, 0.15, 1.2, z - 0.2, z + 0.2, concreteDark);
  plane(1.4, 0.35, plate, px0 - 0.21, 0.9, P.gate1, -Math.PI / 2).rotation.y = -Math.PI / 2;
  mesh(new THREE.TorusGeometry(0.45, 0.03, 8, 20, Math.PI), std(0xd9d9d9, { metalness: 0.6, roughness: 0.3 }), px0 + 0.9, 0.15, (P.gate0 + P.gate1) / 2).rotation.y = Math.PI / 2;
  // swings: A-frame, two seats on chains, one of them still swinging
  const play = std(0x2a7de1, { roughness: 0.4, metalness: 0.5 }), red = std(0xd33b2c, { roughness: 0.4, metalness: 0.3 }), yel = std(0xf2c400, { roughness: 0.4, metalness: 0.3 });
  const sx = 25, sz3 = -104;
  for (const dx of [-1.6, 1.6]) for (const dz of [-0.9, 0.9]) { const m = mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.7, 8), play, sx + dx, 1.45, sz3 + dz * 0.5); m.rotation.x = dz * 0.35; }
  mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.4, 10).rotateZ(Math.PI / 2), play, sx, 2.75, sz3);
  for (const [dx, swing] of [[-0.7, true], [0.7, false]]) {
    const piv = new THREE.Group(); piv.position.set(sx + dx, 2.72, sz3); scene.add(piv);
    for (const e of [-0.2, 0.2]) mesh(new THREE.CylinderGeometry(0.008, 0.008, 2.1, 4), steel, e, -1.05, 0, piv);
    mesh(new THREE.BoxGeometry(0.45, 0.04, 0.2), std(0x1a1a1a, { roughness: 0.6 }), 0, -2.1, 0, piv);
    if (swing) updaters.push((t) => { piv.rotation.x = Math.sin(t * 1.6) * 0.32 * (0.6 + 0.4 * Math.sin(t * 0.13)); });
    else piv.rotation.x = 0.02;
  }
  collide(sx - 1.8, sx + 1.8, sz3 - 0.6, sz3 + 0.6);
  // slide: ladder, platform, chute
  const slx = 16, slz = -116;
  bx(slx - 0.4, slx + 0.4, 1.6, 1.68, slz - 0.4, slz + 0.4, yel);
  for (const [a, b] of [[-0.38, -0.38], [0.38, -0.38], [-0.38, 0.38], [0.38, 0.38]]) bx(slx + a - 0.03, slx + a + 0.03, 0.15, 2.4, slz + b - 0.03, slz + b + 0.03, red);
  for (let k = 0; k < 6; k++) bx(slx - 0.38, slx + 0.38, 0.4 + k * 0.25, 0.43 + k * 0.25, slz + 0.38, slz + 0.42, steel);
  const chute = mesh(new THREE.BoxGeometry(0.6, 0.06, 2.8), std(0xd9dde2, { metalness: 0.9, roughness: 0.15 }), slx, 0.95, slz - 1.6);
  chute.rotation.x = -0.52;
  for (const e of [-0.31, 0.31]) { const s = mesh(new THREE.BoxGeometry(0.04, 0.2, 2.8), red, slx + e, 1.05, slz - 1.6); s.rotation.x = -0.52; }
  collide(slx - 0.45, slx + 0.45, slz - 2.9, slz + 0.45);
  // jungle gym: a lattice cube of pipes
  const jx = 25, jz = -114, jg = std(0x3aa65a, { roughness: 0.4, metalness: 0.5 });
  for (let i = 0; i <= 3; i++) for (let j = 0; j <= 3; j++) {
    batch(new THREE.CylinderGeometry(0.025, 0.025, 1.8, 6), jg, jx - 0.9 + i * 0.6, 1.05, jz - 0.9 + j * 0.6);
    for (let k = 1; k <= 3; k++) {
      batch(new THREE.CylinderGeometry(0.022, 0.022, 1.8, 6).rotateZ(Math.PI / 2), jg, jx, 0.15 + k * 0.6, jz - 0.9 + j * 0.6);
      batch(new THREE.CylinderGeometry(0.022, 0.022, 1.8, 6).rotateX(Math.PI / 2), jg, jx - 0.9 + i * 0.6, 0.15 + k * 0.6, jz);
    }
  }
  collide(jx - 1, jx + 1, jz - 1, jz + 1);
  // sandbox, spring rider, benches, toilet block, drinking fountain
  bx(10.5, 13.5, 0.15, 0.4, -110.5, -110.3, std(0x8a6a48)); bx(10.5, 13.5, 0.15, 0.4, -108.2, -108, std(0x8a6a48));
  bx(10.5, 10.7, 0.15, 0.4, -110.5, -108, std(0x8a6a48)); bx(13.3, 13.5, 0.15, 0.4, -110.5, -108, std(0x8a6a48));
  bx(10.7, 13.3, 0.15, 0.28, -110.3, -108.2, std(0xb8a07a, { roughness: 1 }));
  const spring = new THREE.Group(); spring.position.set(19, 0.15, -104); scene.add(spring);
  mesh(new THREE.TorusGeometry(0.12, 0.02, 6, 16).rotateX(Math.PI / 2), steel, 0, 0.15, 0, spring);
  mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.35, 10), steel, 0, 0.2, 0, spring);
  const pandaW = std(0xf2f2f2, { roughness: 0.6 }), pandaB = std(0x1a1a1a, { roughness: 0.6 });
  const body = mesh(new THREE.SphereGeometry(0.3, 16, 12), pandaW, 0, 0.62, 0, spring); body.scale.set(1.3, 0.85, 0.9);
  mesh(new THREE.SphereGeometry(0.2, 14, 10), pandaW, 0.38, 0.88, 0, spring);
  for (const e of [-0.12, 0.12]) { mesh(new THREE.SphereGeometry(0.07, 10, 8), pandaB, 0.32, 1.05, e, spring); mesh(new THREE.SphereGeometry(0.045, 8, 6), pandaB, 0.52, 0.92, e * 0.7, spring); }
  updaters.push((t) => { spring.rotation.z = Math.sin(t * 2.2) * 0.04; });
  collide(18.6, 19.6, -104.5, -103.5);
  const bench = (x, z, ry) => {
    const g = new THREE.Group(); g.position.set(x, 0.15, z); g.rotation.y = ry; scene.add(g);
    const wood = std(0x8a5a32, { roughness: 0.6 });
    for (let k = 0; k < 3; k++) mesh(new THREE.BoxGeometry(1.6, 0.04, 0.1), wood, 0, 0.45, -0.12 + k * 0.12, g);
    for (let k = 0; k < 2; k++) mesh(new THREE.BoxGeometry(1.6, 0.1, 0.03), wood, 0, 0.62 + k * 0.14, -0.2, g);
    for (const e of [-0.7, 0.7]) mesh(new THREE.BoxGeometry(0.05, 0.45, 0.4), steel, e, 0.22, -0.05, g);
    collide(x - 0.85, x + 0.85, z - 0.35, z + 0.35);
  };
  bench(31.5, -108, -Math.PI / 2); bench(31.5, -112, -Math.PI / 2); bench(12, -101.2, Math.PI);
  bx(28, 33.2, 0.15, 3.0, -117.6, -115.2, std(0xe8e6e0, { roughness: 0.4 }));
  bx(27.9, 33.3, 3.0, 3.2, -117.7, -115.1, std(0x5a5e66, { roughness: 0.6 }));
  plane(0.9, 0.9, basic(TX.canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#1d4fb8'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = `900 34px ${TX.JP_FONT}`; g.textAlign = 'center'; g.fillText('トイレ', w / 2, 60); g.font = `700 22px ${TX.LATIN_FONT}`; g.fillText('WC', w / 2, 100); }), 1.1), 30.6, 2.3, -115.18);
  bx(29.2, 30.1, 0.15, 2.1, -115.21, -115.18, glow(1.6, 1.6, 1.4));
  collide(28, 33.2, -117.6, -115.2);
  bx(14.8, 15.2, 0.15, 0.95, -101.6, -101.2, concreteDark); mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.12, 14), steel, 15, 1.0, -101.4);
  // trees and lamps
  for (const [x, z] of [[9, -102], [9, -117], [21, -101.5], [33, -101.5], [21, -117], [33, -104]]) tree(x, z, 1.3);
  const globe = glow(2.6, 2.4, 2.0);
  for (const [x, z] of [[12.5, -105], [22, -110.5], [30, -113]]) {
    bx(x - 0.06, x + 0.06, 0.15, 3.6, z - 0.06, z + 0.06, std(0x2a2d33, { metalness: 0.6, roughness: 0.4 }));
    mesh(new THREE.SphereGeometry(0.22, 16, 12), globe, x, 3.8, z);
    lampSpots.push(spot(x, 3.7, z, { c: 0xfff0d8, k: 14, d: 11 }));
    glowPool(x, 0.16, z, 5, 5, 0xfff0d8, 0.3);
    collide(x - 0.12, x + 0.12, z - 0.12, z + 0.12); camPole(x, z, 0.1, 4.0);
  }
  // blocks round the park so it doesn't face the void
  cheapBlock(20.5, P.x1, P.z1 + 0.5, P.z1 + 12, 15, 'z');
  cheapBlock(20.5, P.x1, P.z0 - 12, P.z0 - 0.5, 12, 'z');
  cheapBlock(P.x1 + 0.5, 44.8, P.z0 - 12, P.z1 + 12, 18, 'x');   // its east face lines the back street
  interactables.push({ pos: new THREE.Vector3(24, 0, -105.4), r: 2.2, label: 'Look at the swings', lines: [
    { text: 'One swing is still moving on its own. The wind, maybe. Maybe not.' },
    { text: 'The chains are cold and wet. The seat creaks quietly.' },
  ] });
  interactables.push({ pos: new THREE.Vector3(8.6, 0, (P.gate0 + P.gate1) / 2), r: 1.8, label: 'Look at the park', lines: [{ who: 'Hoshimi Children\'s Park', text: 'A small park between buildings. Full of children by day; tonight, only puddles and the sound of rain.' }] });

  // =====================================================================================
  // PEDESTRIAN BRIDGE over the road
  // =====================================================================================
  const B = BRIDGE, girder = std(0x5a7a6a, { roughness: 0.5, metalness: 0.5 }), deckTop = std(0x7a6a5a, { roughness: 0.8 });
  bx(-B.outer, B.outer, B.y - 0.55, B.y - 0.05, B.z - B.half, B.z + B.half, girder);
  bx(-B.outer, B.outer, B.y - 0.05, B.y, B.z - B.half, B.z + B.half, deckTop);
  const rail = (x0, x1, z0, z1) => {
    bx(x0, x1, B.y + 1.05, B.y + 1.1, z0, z1, girder);
    const len = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0)), n = Math.round(len / 0.15);
    for (let k = 0; k <= n; k++) { const u = k / n; const x = x0 + (x1 - x0) * u, z = z0 + (z1 - z0) * u; batch(new THREE.BoxGeometry(0.025, 1.05, 0.025), girder, x, B.y + 0.52, z); }
  };
  rail(-B.inner, B.outer, B.z + B.half, B.z + B.half);
  rail(-B.outer, B.inner, B.z - B.half, B.z - B.half);
  colliders.push({ minX: -B.inner + 0.05, maxX: B.outer, minZ: B.z + B.half - 0.05, maxZ: B.z + B.half + 0.05, minY: 3 });
  colliders.push({ minX: -B.outer, maxX: B.inner - 0.05, minZ: B.z - B.half - 0.05, maxZ: B.z - B.half + 0.05, minY: 3 });
  // a blue direction sign hung on the bridge, facing both ways
  const dir = basic(TX.canvasTex(512, 192, (g, w, h) => {
    g.fillStyle = '#1d4fb8'; g.fillRect(0, 0, w, h); g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#fff'; g.font = `900 46px ${TX.JP_FONT}`; g.textBaseline = 'middle';
    g.fillText('↑ 星見駅', 30, 60); g.font = `700 24px ${TX.LATIN_FONT}`; g.fillText('Hoshimi Sta.', 66, 100);
    g.font = `900 40px ${TX.JP_FONT}`; g.fillText('← ほしみ横丁', 260, 60); g.fillText('公園 →', 300, 136);
  }), 1.15);
  dir.side = THREE.DoubleSide;
  plane(4.0, 1.5, dir, -1.8, B.y - 1.4, B.z, 0);
  bx(-3.6, -3.55, B.y - 2.15, B.y - 0.55, B.z - 0.03, B.z + 0.03, steel); bx(-0.05, 0, B.y - 2.15, B.y - 0.55, B.z - 0.03, B.z + 0.03, steel);
  // name plate on the girder and lights under the deck
  const bname = basic(TX.canvasTex(256, 48, (g, w, h) => { g.fillStyle = '#f2f2ee'; g.fillRect(0, 0, w, h); g.fillStyle = '#1a1a1a'; g.font = `900 28px ${TX.JP_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('星見歩道橋', w / 2, h / 2); }), 0.9);
  plane(1.8, 0.34, bname, 3.5, B.y - 0.3, B.z + B.half + 0.01); plane(1.8, 0.34, bname, 3.5, B.y - 0.3, B.z - B.half - 0.01, Math.PI);
  for (const x of [-4, 0, 4]) bx(x - 0.6, x + 0.6, B.y - 0.58, B.y - 0.55, B.z - 0.1, B.z + 0.1, tubeLight);
  lampSpots.push(spot(0, B.y + 2.2, B.z, { c: 0xe8f0ff, k: 10, d: 10 }));
  rainSurfaces.push({ x0: -B.outer, x1: B.outer, z0: B.z - B.half, z1: B.z + B.half, y: B.y, splash: true });
  // stairs on both pavements, with stringers, handrails and a side wall underneath so you can't walk into them
  for (const s of [-1, 1]) {
    const xa = s * B.inner, xb = s * B.outer, x0 = Math.min(xa, xb), x1 = Math.max(xa, xb);
    const zTop = s < 0 ? B.z + B.half : B.z - B.half, dirZ = s < 0 ? 1 : -1, steps = Math.round((B.y - 0.15) / 0.17);
    for (let k = 0; k < steps; k++) {
      const yTop = B.y - (k + 1) * ((B.y - 0.15) / steps), zz = zTop + dirZ * (k + 0.5) * (B.run / steps);
      bx(x0, x1, yTop - 0.12, yTop + 0.03, zz - B.run / steps / 2, zz + B.run / steps / 2, deckTop);
    }
    // stringers as sloped beams on both sides
    const zMid = zTop + dirZ * B.run / 2, ang = Math.atan2(B.y - 0.15, B.run) * dirZ;
    for (const xx of [x0 + 0.04, x1 - 0.04]) {
      const st = mesh(new THREE.BoxGeometry(0.08, 0.35, Math.hypot(B.run, B.y)), girder, xx, (B.y + 0.15) / 2 - 0.15, zMid); st.rotation.x = ang;
      const hr = mesh(new THREE.CylinderGeometry(0.025, 0.025, Math.hypot(B.run, B.y), 8).rotateX(Math.PI / 2), girder, xx, (B.y + 0.15) / 2 + 0.9, zMid); hr.rotation.x = ang;
    }
    // inner side wall (the walkway side) from where the stairs are knee-high up to the deck
    const zKnee = zTop + dirZ * B.run * 0.88;
    colliders.push({ minX: xa - (s < 0 ? 0.08 : 0), maxX: xa + (s < 0 ? 0 : 0.08), minZ: Math.min(zTop, zKnee), maxZ: Math.max(zTop, zKnee) });
    // under the stairs: where they're above head height a ground-level walker is stopped, a climber isn't
    const zHead = zTop + dirZ * B.run * 0.64;
    colliders.push({ minX: x0, maxX: x1, minZ: zHead - 0.05, maxZ: zHead + 0.05, maxY: 1.2 });
    // a column under the landing
    bx(x0 + 0.5, x1 - 0.5, 0.15, B.y - 0.55, B.z - 0.3, B.z + 0.3, girder);
    colliders.push({ minX: x0 + 0.5, maxX: x1 - 0.5, minZ: B.z - 0.3, maxZ: B.z + 0.3, maxY: 4 });
  }
  interactables.push({ pos: new THREE.Vector3(0, B.y, B.z), r: 2.4, label: 'Look down from the bridge', lines: [
    { text: 'From the bridge, Hoshimi Street looks like a river of light. Headlights glance off the wet asphalt.' },
    { text: 'At the far end, the Hoshimi Station sign glows green. The last train hasn\'t gone yet.' },
  ] });
}
