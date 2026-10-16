// The town north of the cross street (Fase 5). The main street carries on north as Hoshimi Ginza, a covered
// shopping arcade; the two back streets carry on too, and all three come out on Hoshimi-dōri, a four-lane
// boulevard with a planted median. (The expressway over it, the business district beyond and the canal and the
// harbour to the east are built further down this file.)
// Everything here uses its own random numbers, so nothing in the old town moves.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SLOPES } from './district.js';
import { spawnCar } from './assets.js';
import { dressVehicle } from './realveh.js';
import { flipWinding } from './vehmerge.js';
import { DESY } from './desy.js';

export const NORTH = {
  z0: 44,                                                                   // the cross street's north pavement edge
  sho: { x: 7, z0: 44.3, shops1: 92, roof1: 96, spring: 8.2, rise: 2.6 },  // the arcade
  // the boulevard: frontages at s/n, road between roadS/roadN, a median either side of z; runs x0..x1
  blvd: { s: 103.5, n: 126.5, roadS: 107.5, roadN: 122.5, z: 115, med: 1, x0: -130, x1: 160 },
  canal: { x0: 97, x1: 115, z0: 44, z1: 236, y: -1.7 },            // water between quay walls
  expressway: { x: 106, half: 8, y: 15, z0: -262, z1: 300,        // deck top height, over the canal
    tunnelS: -232, tunnelN: 278, merge0: -82, merge1: -52 },          // the tunnels at its ends; where the ramp joins
  // the ramp up from the harbour road (rising southwards from z1 to z0, beside the canal)
  ramp: { x0: 117, x1: 124, z0: -52, z1: 60 },
  harbour: { road0: 117, road1: 124, x0: 126.5, quay: 176, z0: 44, z1: 236 },
};

// the ramp's height at z (a smooth rise, flat at both ends)
export function rampY(z) {
  const R = NORTH.ramp, t = Math.min(1, Math.max(0, (R.z1 - z) / (R.z1 - R.z0)));
  return NORTH.expressway.y * t * t * (3 - 2 * t);
}

export function buildNorth(K) {
  const { scene, mesh, box, batch, std, basic, surf, collide, camPole, building, groundFloor, utilityPole, wire, pave, curbX, curbZ, asph, wearMat } = K;
  const { WALK, DRIVE, RAISED, rainEdges, rainSurfaces, lampSpots, spot, glowPool, props, winMat, windowGeo, RING, FINISHES, SF } = K;
  const rn = TX.mulberry32(7700);
  const S = NORTH.sho, B = NORTH.blvd;
  const BX = RING.bx, H = RING.half, WK = RING.walk, XI = BX - H - WK, XO = BX + H + WK;   // 45 / 57
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const tmpM = new THREE.Matrix4();
  // a flat strip on the ground, merged with the rest of its material
  const strip = (w, d, x, z, mat, y = 0.012) => batch(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), mat, x, y, z);
  const flatM = (w, d, x, z, mat, y = 0.012) => { const m = mesh(new THREE.PlaneGeometry(w, d), mat, x, y, z); m.rotation.x = -Math.PI / 2; return m; };

  // =====================================================================================
  // blocks whose faces look along z or along x: the massing, real window frames and glass, balconies, AC units,
  // parapets and rooftop clutter (the same pieces as the old town's facades), and a ground floor
  // =====================================================================================
  // (the detailed faces themselves: facades.js, shared with the rest of the town)
  const FA = K.facades;
  const capMat = K.capMat, tankMat = K.tankMat, steelMat = K.steelMat, meterMat = K.meterMat, partMat = K.partMat;
  void capMat; void tankMat; void meterMat; void partMat;
  // a whole block: massing (collider, camera blocker), the detailed face, optionally a second face, and a ground floor
  function frontage(alongZ, fixed, face, a0, a1, h, { depth = 10, style = rn() < 0.55 ? 'apt' : 'office', ground = true, also = null } = {}) {
    const w = a1 - a0, ca = (a0 + a1) / 2;
    const mats = FA.blockMats(alongZ, w, depth, h);
    const cx = alongZ ? fixed - face * depth / 2 : ca, cz = alongZ ? ca : fixed - face * depth / 2;
    const m = mesh(alongZ ? box(depth, h, w) : box(w, h, depth), mats, cx, h / 2, cz);
    K.blockers.push(m);
    collide(cx - (alongZ ? depth : w) / 2, cx + (alongZ ? depth : w) / 2, cz - (alongZ ? w : depth) / 2, cz + (alongZ ? w : depth) / 2);
    FA.face(alongZ, fixed, face, a0, a1, h, { style, d: depth });
    if (ground) groundFloor(alongZ, fixed, face, a0, a1);
    // a second face round the corner (looking onto a street that runs the other way)
    if (also) FA.face(!alongZ, also.fixed, also.face, also.a0, also.a1, h, { style, d: w, top: false });
    return m;
  }
  // massing behind the streets: painted lit windows all round, and any face that can be seen from a pavement or a
  // road (or, force, from the expressway) gets the real thing — frames, balconies, signs — and a ground floor
  function filler(x0, x1, z0, z1, h, force = []) {
    const w = x1 - x0, d = z1 - z0;
    const t = TX.windows(Math.max(2, Math.round(w / 2.6)), Math.max(2, Math.floor(h / 3)), ['#4f545c', '#5d6470', '#6b6e75', '#3f444c'][Math.floor(rn() * 4)], rn, rn() < 0.5 ? 'apt' : 'office');
    const tz = TX.windows(Math.max(2, Math.round(d / 2.6)), Math.max(2, Math.floor(h / 3)), '#4c5058', rn, 'apt');
    const fA = new THREE.MeshStandardMaterial({ map: t.map, emissive: 0xffffff, emissiveMap: t.emissiveMap, emissiveIntensity: 0.9, roughness: 0.8 });
    const fB = new THREE.MeshStandardMaterial({ map: tz.map, emissive: 0xffffff, emissiveMap: tz.emissiveMap, emissiveIntensity: 0.9, roughness: 0.8 });
    const m = mesh(box(w, h, d), [fB, fB, K.roofMat, K.roofMat, fA, fA], (x0 + x1) / 2, h / 2, (z0 + z1) / 2);
    K.blockers.push(m);
    const faces = [
      { idx: 0, alongZ: true, fixed: x1, face: 1, a0: z0, a1: z1, d: w }, { idx: 1, alongZ: true, fixed: x0, face: -1, a0: z0, a1: z1, d: w },
      { idx: 4, alongZ: false, fixed: z1, face: 1, a0: x0, a1: x1, d }, { idx: 5, alongZ: false, fixed: z0, face: -1, a0: x0, a1: x1, d },
    ];
    faces.forEach((f, i) => K.lateFace({ mesh: m, h, ground: true, top: i === 0, force: force.includes(f.idx), ...f }));
    FA.roof((o, tt) => [(x0 + x1) / 2 + o, tt], 0, (z0 + z1) / 2, d, w, h, { alongZ: true, fc: 1 });
    return m;
  }


  // =====================================================================================
  // HOSHIMI GINZA 星見銀座: the main street carries on north under an arched glass roof. Real shop fronts on
  // both sides (the same shops as the street: you can walk into the open ones), lantern strings, tanabata
  // streamers swaying under the roof, lit gates at both ends.
  // =====================================================================================
  const edges0 = rainEdges.length, roofs0 = K.roofs.length;
  // Desy Ika · Flowers & Café: a 9 m front on the east side, the first slot past the arcade's middle
  // (its own width and type; the shops after it on that side shift along a little)
  const CAFE = { side: 1, z: null };
  for (const side of [-1, 1]) {
    let z = S.z0;
    while (z < S.shops1 - 0.5) {
      let w = 6 + rn() * 6;
      if (z + w > S.shops1 - 5) w = S.shops1 - z;
      const h = 6 + Math.floor(rn() * 4) * 3 + (rn() < 0.15 ? 9 : 0);
      if (side === CAFE.side && CAFE.z === null && z > 64 && z + 9 < S.shops1 - 6) {
        CAFE.z = z; building(side, z, z + 9, Math.max(h, 9), { type: 'florist' }); z += 9; continue;
      }
      building(side, z, z + w, h);
      z += w;
    }
  }
  NORTH.desy = CAFE.z === null ? null : { x: CAFE.side * (S.x - 0.02), z: CAFE.z + 4.5 };
  // the roof keeps the rain off: nothing drips from the awnings in here
  for (let i = rainEdges.length - 1; i >= edges0; i--) { const e = rainEdges[i]; if (Math.abs(e.x) < 7.6 && e.z1 > S.z0 && e.z0 < S.roof1) rainEdges.splice(i, 1); }
  for (const r of K.roofs.slice(roofs0)) K.rooftop(r);
  K.addRoom({ name: 'Hoshimi Ginza', jp: '星見銀座', minX: -S.x, maxX: S.x, minZ: S.z0 - 0.3, maxZ: S.roof1, y: 0.15, ceil: S.spring + S.rise, amb: 'shotengai', camDist: 4, floor: false });
  rainSurfaces.push({ x0: -S.x, x1: S.x, z0: S.z0, z1: S.roof1, y: S.spring + S.rise });
  {
    // floor: warm tiles with a darker band down the middle, all the way out to the boulevard
    const L = B.s - S.z0 + 0.3, zc = (S.z0 - 0.3 + B.s) / 2;
    mesh(box(S.x * 2, 0.15, L), surf('tiled_floor_001', S.x * 1.6, L / 1.25, { color: 0xb9ab98 }), 0, 0.075, zc).receiveShadow = true;
    strip(2.6, L, 0, zc, surf('large_grey_tiles', 1.3, L / 2, { color: 0x6f6a64 }), 0.152);
    for (const x of [-1.38, 1.38]) strip(0.16, L, x, zc, std(0x9a8f80, { roughness: 0.5 }), 0.153);
    RAISED.push({ minX: -S.x, maxX: S.x, minZ: S.z0 - 0.3, maxZ: B.s });
    WALK.push({ minX: -S.x + 0.05, maxX: S.x - 0.05, minZ: S.roof1 - 1, maxZ: B.s + 0.5 });
    WALK.push({ minX: -S.x + 0.05, maxX: S.x - 0.05, minZ: 43.5, maxZ: S.z0 + 1 });
    // bollards keep the cars out
    const bol = std(0x3a3d42, { roughness: 0.4, metalness: 0.5 });
    for (const zz of [S.z0 + 0.3, B.s - 0.5]) for (const x of [-4.5, -1.5, 1.5, 4.5]) {
      batch(new THREE.CylinderGeometry(0.11, 0.13, 0.9, 12), bol, x, 0.6, zz);
      batch(new THREE.CylinderGeometry(0.135, 0.135, 0.06, 12), std(0xe8c21a, { roughness: 0.5 }), x, 0.92, zz);
      collide(x - 0.15, x + 0.15, zz - 0.15, zz + 0.15);
    }
  }
  {
    const R = S.x + 0.25, L = S.roof1 - S.z0 + 0.4, zc = (S.z0 + S.roof1) / 2, ky = S.rise / R;
    // translucent polycarbonate vault on steel arches
    const vault = new THREE.CylinderGeometry(R, R, L, 32, 1, true, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2).scale(1, ky, 1);
    const roofM = new THREE.MeshStandardMaterial({ color: 0xb8c4cc, emissive: 0x262c33, transparent: true, opacity: 0.62, roughness: 0.3, metalness: 0.2, side: THREE.DoubleSide, depthWrite: false });
    const vm = mesh(vault, roofM, 0, S.spring, zc); vm.renderOrder = 3;
    const arch = std(0x50565e, { roughness: 0.45, metalness: 0.6 });
    for (let z = S.z0 + 0.2; z <= S.roof1 + 0.01; z += 4) {
      batch(new THREE.TorusGeometry(R - 0.05, 0.08, 6, 32, Math.PI).scale(1, ky, 1), arch, 0, S.spring, z);
      // a tie rod across, and hangers
      batch(box(R * 2, 0.05, 0.05), arch, 0, S.spring, z);
      for (const x of [-R * 0.5, 0, R * 0.5]) batch(box(0.03, Math.sqrt(Math.max(0, 1 - (x / R) ** 2)) * S.rise, 0.03), arch, x, S.spring + Math.sqrt(Math.max(0, 1 - (x / R) ** 2)) * S.rise / 2, z);
    }
    for (const a of [0.3, 0.75, 1.2, Math.PI / 2, Math.PI - 1.2, Math.PI - 0.75, Math.PI - 0.3]) batch(box(0.07, 0.07, L), arch, Math.cos(a) * R, S.spring + Math.sin(a) * S.rise, zc);
    for (const s of [-1, 1]) batch(box(0.3, 0.4, L), arch, s * (R - 0.1), S.spring - 0.15, zc);
    // a lit strip down the crown and pendant lamps under it, with pools of light on the floor
    batch(box(0.5, 0.06, L - 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.7, 1.5) }), 0, S.spring + S.rise - 0.12, zc);
    const shade = std(0x2a2c30, { roughness: 0.4, metalness: 0.6 }), bulb = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.5, 1.8) });
    for (let z = S.z0 + 4; z < S.roof1 - 1; z += 8) {
      batch(new THREE.CylinderGeometry(0.01, 0.01, 2.2, 4), shade, 0, S.spring + S.rise - 1.25, z);
      batch(new THREE.ConeGeometry(0.42, 0.32, 18, 1, true), shade, 0, S.spring + S.rise - 2.45, z);
      batch(new THREE.CircleGeometry(0.36, 18).rotateX(Math.PI / 2), bulb, 0, S.spring + S.rise - 2.6, z);
      glowPool(0, 0.16, z, 7, 7, 0xffe2b8, 0.3);
      if (Math.round((z - S.z0 - 4) / 8) % 2 === 0) lampSpots.push(spot(0, S.spring + S.rise - 2.7, z, { c: 0xffe2b8, k: 22, d: 16 }));
    }
    // festoons of paper lanterns zig-zagging under the arches
    const pts = [];
    for (let z = S.z0 + 2, k = 0; z < S.shops1; z += 6, k++) pts.push(V3(k % 2 ? 6.1 : -6.1, 6.3, z));
    K.bulbs(pts, [0xff5a3c, 0xfff0c8, 0xffb04a], 4);
    // tanabata streamers: a paper ball and a skirt of coloured strips, hanging from the crown, swaying
    const cols = [[0.95, 0.28, 0.32], [0.98, 0.78, 0.2], [0.3, 0.62, 0.95], [0.4, 0.82, 0.45], [0.95, 0.5, 0.8], [1, 1, 1]];
    const tMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.6, emissive: 0x1a1410 });
    const decos = [];
    for (let z = S.z0 + 8, i = 0; z < S.shops1 - 2; z += 12, i++) {
      const parts = [];
      const paint = (g, c) => { g = g.index ? g.toNonIndexed() : g; const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let j = 0; j < n; j++) a.set(c, j * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
      parts.push(paint(new THREE.IcosahedronGeometry(0.42, 1).translate(0, -0.4, 0), cols[i % 5]));
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2, len = 2.2 + ((k * 7) % 5) * 0.12;
        const g = new THREE.PlaneGeometry(0.13, len).translate(0, -0.75 - len / 2, 0).rotateY(-a).translate(Math.cos(a) * 0.36, 0, Math.sin(a) * 0.36);
        parts.push(paint(g, cols[(k + i) % cols.length]));
      }
      for (const p of parts) { for (const k of Object.keys(p.attributes)) if (!['position', 'normal', 'color'].includes(k)) p.deleteAttribute(k); }
      const dm = new THREE.Mesh(mergeGeometries(parts, false), tMat);
      dm.position.set(i % 2 ? -2.6 : 2.6, S.spring + S.rise * 0.82, z); dm.userData.dynamic = true;
      scene.add(dm); decos.push(dm);
      batch(new THREE.CylinderGeometry(0.008, 0.008, S.rise * 0.18 + 0.4, 4), shade, dm.position.x, S.spring + S.rise * 0.92, z);
    }
    K.updaters.push((t) => { for (let i = 0; i < decos.length; i++) { decos[i].rotation.z = Math.sin(t * 0.9 + i) * 0.05; decos[i].rotation.x = Math.sin(t * 0.7 + i * 2) * 0.04; } });
    // the gates: a lit name board across each end
    const board = basic(TX.signH('星見銀座商店街', '#1c1410', '#ffd27a'), 1.6);
    const boardEdge = std(0x1a1a1c, { roughness: 0.5 });
    for (const z of [S.z0 - 0.1, S.roof1 + 0.1]) {
      mesh(box(9.5, 1.5, 0.4), [boardEdge, boardEdge, boardEdge, boardEdge, board, board], 0, S.spring + 0.95, z);
      for (const x of [-5.4, 5.4]) batch(box(0.14, 0.9, 0.14), boardEdge, x, S.spring + 0.2, z);
      lampSpots.push(spot(0, S.spring - 0.6, z + (z < 60 ? -1.5 : 1.5), { c: 0xffd8a0, k: 16, d: 10 }));
    }
  }

  // =====================================================================================
  // the BACK STREETS carry on north to the boulevard
  // =====================================================================================
  const zN0 = NORTH.z0, zN1 = B.roadS, BL = zN1 - zN0, BC = (zN0 + zN1) / 2;
  const paint = K.paint, edgePaint = K.edgePaint, flowMat = K.flowMat;
  for (const s of [-1, 1]) {
    const x = s * BX;
    flatM(H * 2, BL + 4, x, BC - 2, asph(1.75, BL / 4), 0.003).receiveShadow = true;
    flatM(H * 2, BL, x, BC, wearMat(1, BL / 16), 0.0045).renderOrder = 1;
    pave(s * XI, s * (BX - H), zN0, B.s);
    pave(s * (BX + H), s * XO, zN0, B.s);
    curbZ(s * (BX - H - 0.075), zN0, B.s);
    curbZ(s * (BX + H + 0.075), zN0, B.s);
    for (const k of [-1, 1]) { const f = flatM(0.2, B.s - zN0, x + k * (H - 0.12), (zN0 + B.s) / 2, flowMat, 0.0075); f.renderOrder = 1; }
    strip(0.15, B.s - zN0, x - (H - 0.25), (zN0 + B.s) / 2, edgePaint); strip(0.15, B.s - zN0, x + (H - 0.25), (zN0 + B.s) / 2, edgePaint);
    for (let z = zN0 + 4; z < B.s - 4; z += 6) strip(0.12, 3, x, z, paint);
    // stop line at the boulevard, zebra across the mouth
    strip(H - 0.3, 0.35, x + H / 2, B.s - 2.2, paint);   // northbound keeps left: the +x half
    for (let xx = x - H + 0.45; xx < x + H - 0.3; xx += 0.9) strip(0.45, 3.2, xx, B.s + 2, paint);
    WALK.push({ minX: s > 0 ? XI + 0.25 : -XO + 0.25, maxX: s > 0 ? XO - 0.25 : -XI - 0.25, minZ: 43.5, maxZ: B.s + 1 });
    DRIVE.push({ minX: s > 0 ? XI + 0.3 : -XO + 0.3, maxX: s > 0 ? XO - 0.3 : -XI - 0.3, minZ: 43.5, maxZ: B.s + 1 });
  }

  // buildings along them: town side (from behind the cross-street frontage) and outer side, up to the boulevard's corner blocks
  const ZB = 92;   // where the boulevard's corner blocks begin
  for (const s of [-1, 1]) {
    for (const inner of [true, false]) {
      const fxAbs = inner ? XI : XO, face = inner ? s : -s, side = -face, line = s * fxAbs * side;
      let z = inner ? 56.4 : S.z0;
      while (z < ZB - 3) {
        let z1 = Math.min(ZB, z + 8 + rn() * 8);
        if (ZB - z1 < 5) z1 = ZB;
        const h = 9 + Math.floor(rn() * 5) * 3, d = inner ? Math.min(12, 8 + rn() * 4) : 8 + rn() * 5;
        building(side, z, z1, h, { line, noFront: true, depth: d, style: rn() < 0.6 ? 'apt' : 'office' });
        groundFloor(true, s * fxAbs, face, z, z1);
        z = z1 + 0.3;
      }
    }
  }
  // utility poles on the outer pavements, wired, carrying on from the old town's
  for (const s of [-1, 1]) {
    const row = [];
    for (let z = 52; z < B.s - 4; z += 20) row.push(utilityPole(s * (BX + H + 0.3), z, true, -s));
    wire(row);
  }

  // =====================================================================================
  // the cross street's north side: blocks between the arcade and the back streets, and at the far corners
  // =====================================================================================
  for (const s of [-1, 1]) {
    // looking south onto the cross street; their east/west ends look into the back street
    let x = 20.5;
    while (x < XI - 1) {
      const x1 = Math.min(XI - 0.3, x + 7 + rn() * 6), h = 12 + Math.floor(rn() * 4) * 3;
      const a0 = s > 0 ? x : -x1, a1 = s > 0 ? x1 : -x;
      frontage(false, S.z0, -1, a0, a1, h, { depth: 11.5, also: x1 >= XI - 0.4 ? { fixed: s * x1, face: s, a0: S.z0, a1: S.z0 + 11.5 } : null });
      x = x1 + 0.3;
    }
  }
  // the gap between the arcade's shops and the back streets' blocks: inner massing
  for (const s of [-1, 1]) {
    for (let z = 56.4; z < ZB - 1; z += 12) filler(s > 0 ? 20.4 : -32.8, s > 0 ? 32.8 : -20.4, z, Math.min(ZB - 0.4, z + 11.6), 12 + Math.floor(rn() * 4) * 3);
  }
  // past the back streets: the cross street ends at x ±70 against a block; behind the outer blocks, more town
  for (const s of [-1, 1]) {
    frontage(true, s * 70, -s, 36.2, 44.2, 15, { depth: 10, ground: true });
    for (let z = S.z0; z < ZB - 1; z += 12) filler(s > 0 ? 70.5 : -94.5, s > 0 ? 84.5 : -70.5, z, Math.min(ZB - 0.4, z + 11.6), 15 + Math.floor(rn() * 5) * 3);
  }

  // =====================================================================================
  // HOSHIMI-DŌRI 星見通り大通り: four lanes, a planted median with tall double lamps, zebras at the arcade
  // and the back streets, trees in grates along the pavements
  // =====================================================================================
  const RL = B.x1 - B.x0, RC = (B.x0 + B.x1) / 2, RW = B.roadN - B.roadS;
  flatM(RL, RW, RC, B.z, asph(RL / 4, RW / 4), 0.003).receiveShadow = true;
  flatM(RL, RW, RC, B.z, wearMat(RL / 16, 1), 0.0045).renderOrder = 1;
  // pavements: the south one is cut by the back streets' mouths
  const HB = NORTH.harbour;
  const cutsS = [[-BX - H, -BX + H], [BX - H, BX + H], [HB.road0, HB.road1]], cutsN = [[HB.road0, HB.road1]];
  for (const [cuts, z0, z1, kz] of [[cutsS, B.s, B.roadS, B.roadS - 0.075], [cutsN, B.roadN, B.n, B.roadN + 0.075]]) {
    let a = B.x0;
    for (const [c0, c1] of [...cuts, [B.x1, B.x1]]) {
      if (c0 > a) { pave(a, c0, z0, z1); curbX(kz, a, c0); }
      a = c1;
    }
  }
  // lines: edges, lane dashes, the median's edges
  strip(RL, 0.15, RC, B.roadS + 0.25, edgePaint); strip(RL, 0.15, RC, B.roadN - 0.25, edgePaint);
  const mS = B.z - B.med, mN = B.z + B.med;
  const gaps = [[-BX - 6, -BX + 6], [-6, 6], [BX - 6, BX + 6], [HB.road0 - 3, HB.road1 + 3]];
  const inGap = (x, pad = 0) => gaps.some(([g0, g1]) => x > g0 - pad && x < g1 + pad);
  for (const zl of [(B.roadS + mS) / 2, (mN + B.roadN) / 2]) for (let x = B.x0 + 3; x < B.x1 - 3; x += 6) if (!inGap(x, 2)) strip(3, 0.12, x, zl, paint);
  // zebras across the boulevard at the arcade, stop lines before them
  for (const [z0, z1] of [[B.roadS, mS], [mN, B.roadN]]) for (let z = z0 + 0.45; z < z1 - 0.3; z += 0.9) strip(3.2, 0.45, 0, z, paint);
  strip(0.35, mS - B.roadS - 0.3, -3.6, (B.roadS + mS) / 2, paint);
  strip(0.35, B.roadN - mN - 0.3, 3.6, (mN + B.roadN) / 2, paint);
  // ---------- foliage: lumpy leaf clusters (displaced, smooth-shaded), forked trunks ----------
  const leafTex = TX.canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#5a6e4e'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) { const v = 60 + rn() * 120; g.fillStyle = `rgba(${v * 0.55 | 0},${v | 0},${v * 0.45 | 0},${0.35 + rn() * 0.5})`; g.beginPath(); g.ellipse(rn() * w, rn() * h, 1.5 + rn() * 3, 1 + rn() * 1.6, rn() * 3, 0, Math.PI * 2); g.fill(); }
  }, { repeat: true });
  const leafA = new THREE.MeshStandardMaterial({ map: leafTex, color: 0x6f8c62, roughness: 0.85 }), leafB = new THREE.MeshStandardMaterial({ map: leafTex, color: 0x587a4e, roughness: 0.85 });
  const bark = std(0x3d342c, { roughness: 0.92 });
  const blobs = [];
  for (let k = 0; k < 6; k++) {
    let g = new THREE.IcosahedronGeometry(1, 3);
    g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g);
    const p = g.attributes.position, ph = k * 1.7;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = Math.sin(x * 4.1 + ph) * Math.sin(y * 3.7 + ph * 2) * Math.sin(z * 4.3 + ph * 3) + 0.5 * Math.sin(x * 9 + z * 7 + ph);
      const kk = 1 + 0.16 * n; p.setXYZ(i, x * kk, y * kk * 0.86, z * kk);
    }
    g.computeVertexNormals();
    // spherical uvs so the leaf speckle wraps
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { uv[i * 2] = Math.atan2(p.getZ(i), p.getX(i)) / Math.PI + 1; uv[i * 2 + 1] = p.getY(i) * 0.8 + 0.5; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    blobs.push(g);
  }
  const blob = (r, sx = 1, sy = 1, sz = 1) => blobs[Math.floor(rn() * blobs.length)].clone().scale(r * sx, r * sy, r * sz).rotateY(rn() * 6.28);
  // the median: a kerbed planter with low hedges, broken at the crossings
  const medTop = std(0x3b3f36, { roughness: 0.95 });
  const medCurb = K.curbMat;
  {
    let a = B.x0;
    for (const [g0, g1] of [...gaps, [B.x1, B.x1]]) {
      if (g0 > a + 1) {
        const L = g0 - a, c = (a + g0) / 2;
        batch(box(L, 0.22, mN - mS), medCurb, c, 0.11, B.z);
        batch(box(L - 0.3, 0.05, mN - mS - 0.3), medTop, c, 0.245, B.z);
        for (let x = a + 0.8; x < g0 - 0.6; x += 0.9 + rn() * 0.4) batch(blob(0.62, 1.3, 0.62, 0.95), rn() < 0.5 ? leafA : leafB, x, 0.62 + rn() * 0.08, B.z + (rn() - 0.5) * 0.25);
        collide(a, g0, mS, mN);
      }
      a = g1;
    }
  }
  // tall twin-arm lamps along the median
  const lampHead = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.8, 3.2), side: THREE.DoubleSide });
  const lampPole = std(0x5d6168, { roughness: 0.4, metalness: 0.6 });
  for (let x = B.x0 + 8; x < B.x1 - 4; x += 26) {
    if (inGap(x, 2)) continue;
    batch(new THREE.CylinderGeometry(0.12, 0.2, 10.5, 14), lampPole, x, 5.25 + 0.25, B.z);
    for (const s of [-1, 1]) {
      batch(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(V3(x, 9.2, B.z), V3(x, 10.3, B.z + s * 0.6), V3(x, 10.1, B.z + s * 2.6)), 16, 0.06, 8), lampPole, 0, 0, 0);
      batch(new THREE.BoxGeometry(0.42, 0.14, 1.0), lampPole, x, 10.08, B.z + s * 2.9);
      batch(new THREE.PlaneGeometry(0.34, 0.8).rotateX(Math.PI / 2), lampHead, x, 10.0, B.z + s * 2.9);
      const lz = B.z + s * 3.6;
      const gp = glowPool(x, 0.02, lz, 10, 9, 0xdfe9ff, 0.28);
      gp.userData.dynamic = true;
      K.lampFx.push({ gp, cone: K.lightCone(x, 9.9, B.z + s * 2.9, { color: 0xdfe9ff, h: 9.6, r: 3.4 }), gpBase: gp.material.color.clone(), coneBase: 0, broken: false });
      const L = K.lampFx[K.lampFx.length - 1]; L.cone.userData.dynamic = true; L.coneBase = L.cone.material.uniforms.strength.value;
      lampSpots.push(spot(x, 9.8, B.z + s * 2.9, { c: 0xdfe9ff, k: 34, d: 20, street: true }));
    }
    collide(x - 0.25, x + 0.25, B.z - 0.25, B.z + 0.25); camPole(x, B.z, 0.2, 10.6);
  }
  // street trees in grates: a zelkova-ish crown of leaf clusters on a forked trunk
  const grate = std(0x2a2b2e, { roughness: 0.5, metalness: 0.6 });
  const tree = (x, z, y0 = 0.15, grated = true) => {
    const sc = 0.9 + rn() * 0.3, top = y0 + 2.6 * sc;
    batch(new THREE.CylinderGeometry(0.09 * sc, 0.14 * sc, 2.7 * sc, 10), bark, x, y0 + 1.35 * sc, z);
    const tips = [];
    for (let k = 0; k < 5; k++) {
      const a = k * 1.3 + rn() * 0.8, r = (0.9 + rn() * 0.7) * sc, ty = top + (1.4 + rn() * 1.4) * sc;
      const tip = V3(x + Math.cos(a) * r, ty, z + Math.sin(a) * r); tips.push(tip);
      batch(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(V3(x, top - 0.3, z), V3(x + Math.cos(a) * r * 0.3, top + 0.6 * sc, z + Math.sin(a) * r * 0.3), tip), 6, 0.055 * sc, 6), bark, 0, 0, 0);
    }
    for (let k = 0; k < 14; k++) {
      const t = tips[k % tips.length], a = rn() * 6.28, r = rn() * 0.9 * sc;
      batch(blob((0.75 + rn() * 0.45) * sc), rn() < 0.55 ? leafA : leafB, t.x + Math.cos(a) * r, t.y + (rn() - 0.3) * 0.9 * sc, t.z + Math.sin(a) * r);
    }
    batch(blob(1.25 * sc, 1, 0.7, 1), leafB, x, top + 2.3 * sc, z);
    if (grated) batch(box(1.3, 0.03, 1.3), grate, x, y0 + 0.005, z);
    collide(x - 0.3, x + 0.3, z - 0.3, z + 0.3); camPole(x, z, 0.16, top);
  };
  for (let x = B.x0 + 5; x < B.x1 - 3; x += 13) {
    if (!cutsS.some(([c0, c1]) => x > c0 - 3 && x < c1 + 3) && Math.abs(x) > 9 && !(x > 95 && x < 117)) tree(x, B.s + 1.6);
    if (Math.abs(x) > 9 && !cutsN.some(([c0, c1]) => x + 6.5 > c0 - 3 && x + 6.5 < c1 + 3) && !(x + 6.5 > 95 && x + 6.5 < 117)) tree(x + 6.5, B.n - 1.6);
  }
  // the boulevard's ends: closed for works, barriers and flashing lamps
  const barrierT = TX.stripes('#e8e8e8', '#d0141e', 8);
  const barrier = new THREE.MeshStandardMaterial({ map: barrierT, roughness: 0.6 });
  const flash = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.2, 0.2) }); flash.userData.mutable = true;
  for (const x of [B.x0 + 1.2, B.x1 - 1.2]) {
    for (let z = B.s + 0.5; z < B.n - 0.5; z += 1.6) {
      batch(box(0.12, 0.35, 1.4), barrier, x, 0.85, z);
      batch(box(0.08, 0.9, 0.08), steelMat, x, 0.45, z - 0.6);
      batch(new THREE.SphereGeometry(0.08, 8, 6), flash, x, 1.15, z);
    }
    collide(x - 0.3, x + 0.3, B.s, B.n);
  }
  K.updaters.push((t) => { const on = (t % 1) < 0.5; flash.color.setRGB(on ? 3 : 0.3, on ? 1.2 : 0.1, on ? 0.2 : 0.02); });
  WALK.push({ minX: B.x0 + 0.5, maxX: B.x1 - 0.5, minZ: B.s + 0.2, maxZ: B.n - 0.2 });
  DRIVE.push({ minX: B.x0 + 0.5, maxX: B.x1 - 0.5, minZ: B.s + 0.2, maxZ: B.n - 0.2 });

  // the south side of the boulevard: corner blocks by the arcade and on to the ends
  // alsoX: the end that looks onto the arcade's mouth (x, and which way it looks) gets a face too
  const south = (a0, a1, hMin, hMax, alsoX = null) => {
    let x = a0;
    while (x < a1 - 3) {
      let x1 = Math.min(a1, x + 10 + rn() * 10);
      if (a1 - x1 < 6) x1 = a1;
      const h = hMin + Math.floor(rn() * ((hMax - hMin) / 3 + 1)) * 3;
      const end = alsoX && (Math.abs(alsoX.x - x) < 0.01 || Math.abs(alsoX.x - x1) < 0.01) ? { fixed: alsoX.x, face: alsoX.face, a0: ZB + 0.4, a1: B.s } : null;
      frontage(false, B.s, 1, x, x1, h, { depth: B.s - ZB - 0.4, style: rn() < 0.4 ? 'apt' : 'office', also: end });
      x = x1 + 0.3;
    }
  };
  south(7.6, XI - 0.3, 18, 33, { x: 7.6, face: -1 }); south(-(XI - 0.3), -7.6, 18, 33, { x: -7.6, face: 1 });
  south(XO + 0.3, 84.5, 15, 30); south(B.x0 + 2, -(XO + 0.3), 15, 30);

  // =====================================================================================
  // SHIN-HOSHIMI 新星見: the business district north of the boulevard. Glass towers with offices lit floor by
  // floor, lobbies under canopies, LED screens, red lights on the roofs, and a plaza with a fountain opposite
  // the arcade, closed by the Hoshimi Sky Tower.
  // =====================================================================================
  // dark ground under the new town (the old town has its own)
  const groundM = std(0x15171b, { roughness: 0.95 });
  { const g = flatM(252, 198, -29, 143, groundM, -0.02); g.receiveShadow = true; }
  // curtain wall: glass panes between mullions, spandrels at each slab; offices lit floor by floor
  const curtain = (cols, floors, { lit = 0.5, tint = [22, 30, 42] } = {}) => {
    const cw = Math.max(8, Math.min(24, Math.floor(1024 / cols))), fh = Math.max(12, Math.min(32, Math.floor(2048 / floors)));
    const W = cols * cw, Hh = floors * fh, sp = Math.round(fh * 0.24);
    const fl = [];
    for (let f = 0; f < floors; f++) { const r = rn(); fl.push(r < lit * 0.3 ? 0.92 : r < lit ? 0.4 : r < lit + 0.25 ? 0.08 : 0); }
    const cell = [];
    for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) cell.push(rn() < fl[f] ? (rn() < 0.12 ? 2 : 1) : 0);
    const map = TX.canvasTex(W, Hh, (g) => {
      const gr = g.createLinearGradient(0, 0, 0, Hh);
      gr.addColorStop(0, `rgb(${tint[0] + 46},${tint[1] + 54},${tint[2] + 66})`); gr.addColorStop(0.5, `rgb(${tint[0] + 14},${tint[1] + 18},${tint[2] + 26})`); gr.addColorStop(1, `rgb(${tint[0]},${tint[1]},${tint[2]})`);
      g.fillStyle = gr; g.fillRect(0, 0, W, Hh);
      for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
        const k = cell[f * cols + c];
        g.fillStyle = k ? `rgba(200,205,190,${0.12 + rn() * 0.08})` : `rgba(255,255,255,${rn() * 0.05})`;
        g.fillRect(c * cw, f * fh, cw, fh - sp);
      }
      g.fillStyle = 'rgba(34,38,44,0.95)'; for (let f = 0; f < floors; f++) g.fillRect(0, f * fh + fh - sp, W, sp);
      g.fillStyle = 'rgba(150,160,172,0.85)';
      for (let c = 0; c <= cols; c++) g.fillRect(c * cw - 1, 0, 2, Hh);
      for (let f = 0; f < floors; f++) g.fillRect(0, f * fh + fh - sp, W, 1.5);
    });
    const emissiveMap = TX.canvasTex(W, Hh, (g) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, W, Hh);
      for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
        const k = cell[f * cols + c]; if (!k) continue;
        const x = c * cw + 1, y = f * fh, w = cw - 2, h = fh - sp;
        const gr = g.createLinearGradient(0, y, 0, y + h);
        const [r, gg, b] = k === 2 ? [255, 214, 150] : [205, 222, 255];
        gr.addColorStop(0, `rgba(${r},${gg},${b},0.95)`); gr.addColorStop(0.25, `rgba(${r},${gg},${b},0.55)`); gr.addColorStop(1, `rgba(${r},${gg},${b},0.35)`);
        g.fillStyle = gr; g.fillRect(x, y, w, h);
        if (rn() < 0.2) { g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(x, y + h * 0.35, w, h * 0.65); }   // someone's blinds
      }
    });
    return new THREE.MeshStandardMaterial({ map, emissive: 0xffffff, emissiveMap, emissiveIntensity: 1.0, metalness: 0.55, roughness: 0.16 });
  };
  // lobby glass: double-height, lit, a reception desk and people's shapes
  const lobbyTex = TX.canvasTex(512, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#fff6e6'); gr.addColorStop(0.2, '#d9cbb4'); gr.addColorStop(1, '#8a7a66');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let x = 16; x < w; x += 48) { g.fillStyle = 'rgba(255,255,240,0.9)'; g.fillRect(x, 6, 30, 4); }
    g.fillStyle = 'rgba(40,32,26,0.85)'; g.fillRect(150, 82, 120, 30); g.fillRect(360, 70, 8, 40);
    for (let i = 0; i < 7; i++) { const x = 30 + rn() * 450; g.fillStyle = 'rgba(30,26,24,0.7)'; g.beginPath(); g.arc(x, 74, 5, 0, 7); g.fill(); g.fillRect(x - 6, 79, 12, 34); }
    g.fillStyle = 'rgba(60,64,70,0.9)'; for (let x = 0; x < w; x += 64) g.fillRect(x, 0, 3, h);
  }, { repeat: true });
  const finMat = std(0x8d939a, { roughness: 0.3, metalness: 0.8 }), crownMats = [0x9fe8ff, 0xffffff, 0xffc36b, 0xd6a2ff].map((c) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.6) }));
  const beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.2, 0.1) }); beaconMat.userData.mutable = true;
  const canopyMat = std(0x2a2d32, { roughness: 0.35, metalness: 0.7 }), canopyLit = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.1, 1.9) });
  const NAMES = [['HOSHIMI FINANCIAL', '#0e2b5c', '#ffffff'], ['NOVA SYSTEMS', '#111316', '#5cf0ff'], ['雨夜ホールディングス', '#1a1a1a', '#ffd27a'], ['月野銀行 TSUKINO BANK', '#0d3b2a', '#e9fff2'],
    ['ORBIT MEDIA', '#16091f', '#ff7ad9'], ['星見生命', '#ffffff', '#b3201a'], ['KAGAYA TRADING', '#202020', '#e8e8e8'], ['HOSHIMI SKY TOWER 星見スカイタワー', '#05070c', '#9fe8ff']];
  let nameI = 0;
  const towers = [];
  // face: which way its street side looks along z (-1 = south, onto the boulevard)
  // glass: a real glass front (the lobby behind it is built separately); open: no solid footprint (you can go in)
  function tower(x0, x1, z0, z1, h, { face = -1, podium = 7, tiers = h > 70 ? 2 : 1, name = null, crown = Math.floor(rn() * 4), lit = 0.5, glass = false, open = false } = {}) {
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, fz = face < 0 ? z0 : z1;
    // podium: the lobby set back behind columns, a canopy over the doors with the company's name
    const lt = lobbyTex.clone(); lt.repeat.set(w / 12, 1); lt.needsUpdate = true;
    const lobM = new THREE.MeshBasicMaterial({ map: lt, color: new THREE.Color(1.05, 1.0, 0.95) });
    const lt2 = lobbyTex.clone(); lt2.repeat.set(d / 12, 1); lt2.needsUpdate = true;
    const lobS = new THREE.MeshBasicMaterial({ map: lt2, color: new THREE.Color(0.9, 0.86, 0.8) });
    const podM = [lobS, lobS, K.roofMat, K.roofMat, lobM, lobM];
    if (glass) podM[face < 0 ? 5 : 4] = new THREE.MeshStandardMaterial({ color: 0x1a2632, transparent: true, opacity: 0.2, roughness: 0.04, metalness: 0.7, depthWrite: false });
    mesh(box(w - 1.6, podium, d - 1.6), podM, cx, podium / 2, cz);
    for (let x = x0 + 0.4; x <= x1 - 0.3; x += (w - 0.8) / Math.max(2, Math.round(w / 6))) for (const zz of [z0 + 0.4, z1 - 0.4]) batch(box(0.7, podium, 0.7), finMat, x, podium / 2, zz);
    batch(box(w, 0.6, d), capMat, cx, podium + 0.3, cz);
    const cw = Math.min(16, w * 0.5);
    batch(box(cw, 0.35, 3.6), canopyMat, cx, podium - 1.4, fz + face * 1.8);
    batch(box(cw - 0.4, 0.04, 3.2), canopyLit, cx, podium - 1.6, fz + face * 1.8);
    glowPool(cx, 0.17, fz + face * 2.6, cw + 2, 6, 0xfff0d8, 0.42);
    const [nt, nb, nf] = name ?? NAMES[nameI++ % NAMES.length];
    const sign = mesh(new THREE.PlaneGeometry(Math.min(cw - 1, nt.length * 0.42), 0.7), basic(TX.signH(nt, nb, nf), 1.3), cx, podium - 0.85, fz + face * 3.62);
    sign.rotation.y = face < 0 ? Math.PI : 0;
    lampSpots.push(spot(cx, podium - 1.8, fz + face * 2.4, { c: 0xfff0d8, k: 18, d: 12 }));
    // the shaft in one or two tiers, curtain walls, fins on the street face, a lit crown
    let y = podium + 0.6, iw = w, id = d;
    for (let t = 0; t < tiers; t++) {
      const th = t === tiers - 1 ? h - y : (h - y) * 0.6;
      const fl = Math.max(2, Math.round(th / 3.8));
      const front = curtain(Math.max(4, Math.round(iw / 1.6)), fl, { lit }), side = curtain(Math.max(4, Math.round(id / 1.6)), fl, { lit });
      const m = mesh(box(iw, th, id), [side, side, K.roofMat, K.roofMat, front, front], cx, y + th / 2, cz);
      K.blockers.push(m); towers.push(m);
      const zf = cz + face * id / 2;
      for (let x = cx - iw / 2 + 1.6; x < cx + iw / 2 - 0.5; x += 3.2) batch(box(0.16, th, 0.55), finMat, x, y + th / 2, zf + face * 0.27);
      y += th;
      if (t < tiers - 1) { batch(box(iw + 0.4, 0.5, id + 0.4), capMat, cx, y + 0.25, cz); iw -= 5; id -= 5; y += 0.5; }
    }
    // crown: a band of light, plant on the roof, red lights at the corners
    mesh(box(iw + 0.3, 0.7, id + 0.3), crownMats[crown], cx, h - 2.4, cz);
    batch(box(iw + 0.5, 1.6, id + 0.5), capMat, cx, h + 0.8, cz);
    batch(box(iw * 0.45, 3.2, id * 0.4), partMat, cx - iw * 0.15, h + 1.6, cz + id * 0.1);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const b = mesh(new THREE.SphereGeometry(0.35, 8, 6), beaconMat, cx + sx * (iw / 2 - 0.4), h + 1.9, cz + sz * (id / 2 - 0.4)); b.userData.dynamic = true; }
    if (!open) collide(x0, x1, z0, z1);
    return { cx, cz, w, d, h, fz, iw, id };
  }
  K.updaters.push((t) => { const on = (t % 2.2) < 0.25; beaconMat.color.setRGB(on ? 3 : 0.12, on ? 0.2 : 0.01, on ? 0.1 : 0.01); });

  const ZT = B.n + 2;   // tower podiums start 2 m behind the pavement: a forecourt
  pave(B.x0, -18, B.n, ZT); pave(18, 93.5, B.n, ZT);
  WALK.push({ minX: B.x0 + 0.5, maxX: 93.5, minZ: B.n - 0.3, maxZ: ZT - 0.3 });
  tower(-128, -98, ZT, ZT + 27, 58);
  tower(-94, -64, ZT, ZT + 24, 74);
  tower(-60, -22, ZT, ZT + 30, 88, { tiers: 2 });
  tower(22, 56, ZT, ZT + 32, 96, { tiers: 2, lit: 0.6 });
  tower(60, 93, ZT, ZT + 26, 66);
  // the second row, mostly seen over the first
  tower(-128, -96, 164, 194, 82, { face: -1 });
  tower(-90, -28, 166, 198, 64, { face: -1, lit: 0.4 });
  tower(28, 60, 168, 200, 108, { face: -1, tiers: 2 });
  tower(64, 93, 160, 196, 72, { face: -1 });
  // HOSHIMI SKY TOWER closes the plaza
  const sky = tower(-20, 20, 162, 194, 124, { tiers: 2, name: NAMES[7], crown: 0, lit: 0.62, glass: true, open: true });
  batch(new THREE.CylinderGeometry(0.25, 0.6, 22, 10), steelMat, sky.cx, sky.h + 11, sky.cz);
  { const b = mesh(new THREE.SphereGeometry(0.6, 10, 8), beaconMat, sky.cx, sky.h + 22.4, sky.cz); b.userData.dynamic = true; }

  // ---------- inside the Sky Tower: a lobby behind the glass, the lifts, and the Sky Deck near the top ----------
  const DECK_Y = sky.h - 8;
  NORTH.sky = { deckY: DECK_Y, lobby: { x: 0, z: 186.5 }, deck: { x: 0, z: 176 } };
  {
    const L0 = -19.1, L1 = 19.1, Z0 = 162.9, Z1 = 193.1, CH = 6.6, zc = (Z0 + Z1) / 2;
    const stone = std(0xcfc6b8, { roughness: 0.55 }), dark2 = std(0x2a2c30, { roughness: 0.4, metalness: 0.6 }), woodL = std(0x6b4a30, { roughness: 0.5 });
    const inward = (w, h, x, y, z, ry, m) => { const o = mesh(new THREE.PlaneGeometry(w, h), m, x, y, z); o.rotation.y = ry; return o; };
    mesh(box(L1 - L0, 0.15, Z1 - Z0), surf('long_white_tiles', 10, 8, { color: 0xe8e4dc }), 0, 0.075, zc).receiveShadow = true;
    inward(L1 - L0, CH, 0, CH / 2, Z1 - 0.02, Math.PI, stone);
    inward(Z1 - Z0, CH, L0 + 0.02, CH / 2, zc, Math.PI / 2, stone);
    inward(Z1 - Z0, CH, L1 - 0.02, CH / 2, zc, -Math.PI / 2, stone);
    { const c = mesh(new THREE.PlaneGeometry(L1 - L0, Z1 - Z0), std(0xe6e2da, { roughness: 0.8 }), 0, CH - 0.02, zc); c.rotation.x = Math.PI / 2; }
    const panel = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 1.95, 1.85) });
    for (let x = -14; x <= 14; x += 7) batch(box(4.4, 0.04, 0.5), panel, x, CH - 0.05, zc - 6), batch(box(4.4, 0.04, 0.5), panel, x, CH - 0.05, zc + 6);
    // the name on the back wall, three lifts under it with their floor lights
    { const sg = inward(12, 1.5, 0, 4.7, Z1 - 0.05, Math.PI, basic(TX.signH('HOSHIMI SKY TOWER 星見スカイタワー', '#e8e4dc', '#1b2a3a'), 1.0)); void sg; }
    const liftM = std(0xb8bcc2, { roughness: 0.2, metalness: 0.9 }), liftLit = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.8, 0.9) });
    for (const x of [-6, 0, 6]) {
      batch(box(2.2, 2.9, 0.12), dark2, x, 1.55, Z1 - 0.08);
      for (const dx of [-0.42, 0.42]) inward(0.82, 2.5, x + dx, 1.4, Z1 - 0.16, Math.PI, liftM);
      batch(box(0.6, 0.18, 0.04), liftLit, x, 3.2, Z1 - 0.15);
    }
    // reception, sofas, planters
    batch(box(7, 1.1, 1.3), woodL, 0, 0.7, 170.5); batch(box(7.2, 0.08, 1.5), stone, 0, 1.29, 170.5);
    collide(-3.6, 3.6, 169.8, 171.2);
    K.person(0, 171.6, Math.PI, 0x24324a, 0.15, 1.62, 'idle');
    const sofa = std(0x3a3f4a, { roughness: 0.8 });
    for (const [x, z] of [[-12, 168], [12, 168], [-12, 178], [12, 178]]) { batch(box(3.2, 0.5, 1.0), sofa, x, 0.4, z); batch(box(3.2, 0.6, 0.25), sofa, x, 0.85, z + 0.45); collide(x - 1.6, x + 1.6, z - 0.5, z + 0.6); }
    for (const [x, z] of [[-17, 165], [17, 165], [-17, 190], [17, 190]]) { batch(new THREE.CylinderGeometry(0.5, 0.4, 0.8, 16), dark2, x, 0.55, z); batch(blob(0.9, 1, 1.3, 1), leafA, x, 1.9, z); collide(x - 0.5, x + 0.5, z - 0.5, z + 0.5); }
    // walls and the glass front with its door
    collide(L0 - 0.5, L0, Z0, Z1); collide(L1, L1 + 0.5, Z0, Z1); collide(L0, L1, Z1, Z1 + 0.5);
    collide(L0, -2, Z0 - 0.4, Z0); collide(2, L1, Z0 - 0.4, Z0);
    for (const x of [-2.05, 2.05]) batch(box(0.12, 2.8, 0.14), dark2, x, 1.55, Z0 - 0.15);
    batch(box(4.2, 0.14, 0.14), dark2, 0, 2.95, Z0 - 0.15);
    K.addRoom({ name: 'Hoshimi Sky Tower', jp: '星見スカイタワー', minX: L0, maxX: L1, minZ: Z0, maxZ: Z1, y: 0.15, ceil: CH, amb: 'quiet', camDist: 3.5, floor: false, conn: [{ minX: -1.9, maxX: 1.9, minZ: 160.8, maxZ: Z0 + 0.6 }] });
    RAISED.push({ minX: L0, maxX: L1, minZ: Z0, maxZ: Z1 });
    K.interactables.push({ pos: V3(0, 0, Z1 - 1.6), r: 2.4, label: 'Take the lift to the Sky Deck ¥1,000', anim: 'push',
      action: (api) => { api.teleport(NORTH.sky.deck.x, DECK_Y + 0.02, NORTH.sky.deck.z, Math.PI, () => api.toast('Sky Deck · 展望台 · 116 m')); return null; } });
  }
  {
    // the Sky Deck: a floor high in the top tier, its curtain wall seen from inside as clear glass all round
    const hx = sky.iw / 2 - 0.3, hz = sky.id / 2 - 0.3, cz = sky.cz, Y = DECK_Y;
    mesh(box(hx * 2, 0.3, hz * 2), surf('wood_floor', 8, 6, { color: 0x6a5a4a }), 0, Y - 0.15, cz).receiveShadow = true;
    { const c = mesh(box(hx * 2, 0.3, hz * 2), std(0x1c1e22, { roughness: 0.6 }), 0, Y + 4.65, cz); void c; }
    const mul = std(0x2a2d32, { roughness: 0.3, metalness: 0.8 }), rail = std(0xc8ccd2, { roughness: 0.2, metalness: 0.9 });
    for (let x = -hx; x <= hx + 0.01; x += 2.5) for (const z of [cz - hz, cz + hz]) batch(box(0.08, 4.5, 0.08), mul, x, Y + 2.25, z);
    for (let z = cz - hz; z <= cz + hz + 0.01; z += 2.5) for (const x of [-hx, hx]) batch(box(0.08, 4.5, 0.08), mul, x, Y + 2.25, z);
    for (const z of [cz - hz + 0.6, cz + hz - 0.6]) batch(box(hx * 2 - 1.2, 0.05, 0.05), rail, 0, Y + 1.05, z);
    for (const x of [-hx + 0.6, hx - 0.6]) batch(box(0.05, 0.05, hz * 2 - 1.2), rail, x, Y + 1.05, cz);
    const strip = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 1.0, 0.75) });
    for (const z of [cz - hz + 1, cz + hz - 1]) batch(box(hx * 2 - 2, 0.03, 0.12), strip, 0, Y + 4.48, z);
    // the lift core in the middle, with the way down and the name
    batch(box(6, 4.5, 5), std(0x30333a, { roughness: 0.5, metalness: 0.3 }), 0, Y + 2.25, cz + 2);
    K.colliders.push({ minX: -3.1, maxX: 3.1, minZ: cz - 0.6, maxZ: cz + 4.6, minY: Y - 1, maxY: Y + 5 });
    for (const dx of [-0.6, 0.6]) { const d = mesh(new THREE.PlaneGeometry(1.1, 2.4), std(0xb8bcc2, { roughness: 0.2, metalness: 0.9 }), dx, Y + 1.25, cz - 0.52); d.rotation.y = Math.PI; }
    { const sg = mesh(new THREE.PlaneGeometry(5, 0.9), basic(TX.signH('SKY DECK 展望台 116 m', '#1a1c22', '#ffd27a'), 1.3), 0, Y + 3.4, cz - 0.52); sg.rotation.y = Math.PI; }
    // benches facing out, coin binoculars at the corners of the view
    const benchW = std(0x6b4a30, { roughness: 0.6 });
    for (const [x, z, ry] of [[-9, cz - hz + 2.6, 0], [9, cz - hz + 2.6, 0], [-hx + 2.6, cz + 4, Math.PI / 2], [hx - 2.6, cz + 4, Math.PI / 2]]) {
      batch(box(3, 0.08, 0.6).rotateY(ry), benchW, x, Y + 0.45, z);
      const a = ry ? 0.35 : 1.6, b = ry ? 1.6 : 0.35;
      K.colliders.push({ minX: x - a, maxX: x + a, minZ: z - b, maxZ: z + b, minY: Y - 1, maxY: Y + 2 });
    }
    const bino = std(0x2c6fb0, { roughness: 0.4, metalness: 0.5 });
    for (const [x, z] of [[-hx + 1.2, cz - hz + 1.2], [hx - 1.2, cz - hz + 1.2], [-hx + 1.2, cz + hz - 1.2], [hx - 1.2, cz + hz - 1.2]]) {
      batch(new THREE.CylinderGeometry(0.06, 0.1, 1.1, 10), mul, x, Y + 0.55, z);
      batch(box(0.42, 0.22, 0.3), bino, x, Y + 1.2, z);
      K.colliders.push({ minX: x - 0.25, maxX: x + 0.25, minZ: z - 0.25, maxZ: z + 0.25, minY: Y - 1, maxY: Y + 2 });
    }
    // the binoculars on the east corner look out at Desy's star (world.js sky: the bright one over the bay)
    K.interactables.push({ pos: V3(hx - 1.2, Y, cz + hz - 1.9), r: 1.0, label: 'Look through the binoculars ¥100', anim: 'push',
      action: (api) => {
        api.teleport(hx - 1.2, Y + 0.02, cz + hz - 1.9, Math.atan2(0.8, 0.27) + 0.09, null, -0.25);
        if (!DESY) return [{ text: 'The lens clicks open. Past the cranes and the dark water, the bay lies black and quiet; a few stars show between the clouds.' }];
        return [{ text: 'The lens clicks open. Past the cranes and the dark water, one star burns brighter than all the rest, pink as a rose petal.' },
          { who: 'A small brass plate under the eyepiece', text: '"The star over Hoshimi Bay is named Desy Ika. On rainy nights, it is the one that still shines."' }];
      } });
    K.addRoom({ name: 'Sky Deck', jp: '展望台', minX: -hx, maxX: hx, minZ: cz - hz, maxZ: cz + hz, y: Y, ceil: Y + 4.5, amb: 'skydeck', camDist: 3.2 });
    K.interactables.push({ pos: V3(0, Y, cz - 1.4), r: 2.2, label: 'Take the lift down', anim: 'push',
      action: (api) => { api.teleport(NORTH.sky.lobby.x, 0.17, NORTH.sky.lobby.z, Math.PI); return null; } });
  }

  // ---------- LED screens: drawn on canvases a few times a second while you're near enough to see them ----------
  const screens = [];
  function ledScreen(x, y, z, w, h, ry, slides) {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = Math.round(512 * h / w);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const m = mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.5, 1.5, 1.5), toneMapped: true }), x, y, z);
    m.rotation.y = ry; m.userData.dynamic = true;
    const fr = mesh(new THREE.BoxGeometry(w + 0.6, h + 0.6, 0.4), std(0x111214, { roughness: 0.4, metalness: 0.6 }), x - Math.sin(ry) * 0.25, y, z - Math.cos(ry) * 0.25); fr.rotation.y = ry;
    lampSpots.push(spot(x + Math.sin(ry) * 6, Math.max(4, y - h / 2 - 2), z + Math.cos(ry) * 6, { c: 0x9ad8ff, k: 12, d: 18 }));
    screens.push({ cv, g: cv.getContext('2d'), tex, slides, x, z, t: rn() * 40 });
  }
  const SLIDES = {
    rhythm(g, w, h, t) {
      const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#12051f'); gr.addColorStop(1, '#2a0b3a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 24; i++) { const v = (Math.sin(t * 6 + i * 0.7) * 0.5 + 0.5) * (Math.sin(t * 2.3 + i * 1.9) * 0.3 + 0.7); g.fillStyle = `hsl(${280 + i * 4},90%,${50 + v * 20}%)`; const bh = v * h * 0.55; g.fillRect(16 + i * (w - 32) / 24, h - 16 - bh, (w - 32) / 24 - 4, bh); }
      g.fillStyle = '#fff'; g.font = `bold ${h * 0.2}px "Chakra Petch",sans-serif`; g.textAlign = 'center'; g.fillText('RHYTHM NIGHT', w / 2, h * 0.3); g.font = `${h * 0.12}px "Noto Sans JP",sans-serif`; g.fillText('リズム祭 · GAME CENTER LUMINA', w / 2, h * 0.46);
    },
    beer(g, w, h, t) {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffb12b'); gr.addColorStop(1, '#b3201a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 30; i++) { const x = (i * 97) % w, y = h - ((t * 60 + i * 41) % h); g.fillStyle = 'rgba(255,255,230,0.5)'; g.beginPath(); g.arc(x, y, 3 + (i % 4), 0, 7); g.fill(); }
      g.fillStyle = '#fff6dc'; g.font = `bold ${h * 0.24}px "Chakra Petch",sans-serif`; g.textAlign = 'center'; g.fillText('HOSHI BEER', w / 2, h * 0.52); g.font = `${h * 0.11}px "Noto Sans JP",sans-serif`; g.fillText('ほしビール · 雨の夜に、一杯。', w / 2, h * 0.7);
    },
    news(g, w, h, t) {
      g.fillStyle = '#04101e'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#0d5fd6'; g.fillRect(0, 0, w, h * 0.22); g.fillStyle = '#fff'; g.font = `bold ${h * 0.13}px "Noto Sans JP",sans-serif`; g.textAlign = 'left'; g.fillText('星見ニュース  HOSHIMI NEWS', 14, h * 0.15);
      g.fillStyle = '#9fd0ff'; g.font = `${h * 0.12}px "Chakra Petch",sans-serif`; g.fillText('TONIGHT  rain  12°C', 14, h * 0.45);
      for (let i = 0; i < 12; i++) { g.strokeStyle = 'rgba(160,200,255,0.8)'; g.beginPath(); const x = w * 0.72 + (i * 23) % 120, y = h * 0.3 + ((t * 80 + i * 37) % (h * 0.35)); g.moveTo(x, y); g.lineTo(x - 4, y + 12); g.stroke(); }
      g.fillStyle = '#ffd34a'; g.fillRect(0, h * 0.78, w, h * 0.22); g.fillStyle = '#111'; g.font = `bold ${h * 0.11}px "Chakra Petch",sans-serif`;
      g.fillText('HOSHIMI LINE RUNNING NORMALLY  ·  HEAVY RAIN UNTIL DAWN  ·  RHYTHM NIGHT AT LUMINA  ·  TSUKINO GINZA OPEN LATE  ·', w - ((t * 90) % (w * 3.2)), h * 0.93);
    },
    // for Desy Ika (her flower café is in the arcade): petals drifting down a pink screen, her name in the middle
    desy(g, w, h, t) {
      const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#3a0f26'); gr.addColorStop(0.55, '#a8325f'); gr.addColorStop(1, '#f39ab8');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 26; i++) {
        const x = ((i * 89 + Math.sin(t * 0.7 + i) * 30) % w + w) % w, y = (t * (14 + (i % 5) * 5) + i * 53) % (h + 20) - 10, a = t * 1.5 + i;
        g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = i % 3 ? 'rgba(255,214,228,0.85)' : 'rgba(255,255,255,0.8)';
        g.beginPath(); g.ellipse(0, 0, 6, 3.5, 0, 0, Math.PI * 2); g.fill(); g.restore();
      }
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = 'rgba(255,120,180,0.9)'; g.shadowBlur = 18; g.fillStyle = '#fff6fa';
      g.font = `italic 600 ${h * 0.3}px "Bodoni 72", Didot, Georgia, serif`; g.fillText('Desy Ika', w / 2, h * 0.44);
      g.shadowBlur = 8; g.font = `${h * 0.075}px "Chakra Petch",sans-serif`; g.fillText('♡  FLOWERS & CAFÉ  ·  HOSHIMI GINZA  ♡', w / 2, h * 0.68);
      g.shadowBlur = 0;
    },
    nova(g, w, h, t) {
      g.fillStyle = '#020407'; g.fillRect(0, 0, w, h);
      for (let k = 0; k < 5; k++) { g.strokeStyle = `hsla(${185 + k * 12},90%,60%,0.8)`; g.lineWidth = 3; g.beginPath(); for (let x = 0; x <= w; x += 8) g.lineTo(x, h * 0.5 + Math.sin(x * 0.012 + t * (1 + k * 0.3) + k) * h * (0.12 + k * 0.04)); g.stroke(); }
      g.fillStyle = '#e8fbff'; g.font = `bold ${h * 0.18}px "Chakra Petch",sans-serif`; g.textAlign = 'center'; g.fillText('NOVA SYSTEMS', w / 2, h * 0.86);
    },
  };
  // (her slide only in Desy mode, desy.js)
  const ds = (list) => (DESY ? list : list.filter((n) => n !== 'desy'));
  ledScreen(0, 26, sky.fz - 0.5, 26, 14.6, Math.PI, ds(['desy', 'rhythm', 'news', 'desy', 'beer', 'nova']));
  ledScreen(-41, 22, ZT - 0.35, 16, 9, Math.PI, ds(['beer', 'desy', 'nova', 'news']));
  ledScreen(39, 30, ZT - 0.35, 12, 18, Math.PI, ds(['nova', 'desy', 'rhythm']));
  for (const sc of screens) { SLIDES[sc.slides[0]](sc.g, sc.cv.width, sc.cv.height, 0); sc.tex.needsUpdate = true; }   // never a blank screen
  NORTH.led = { screens, SLIDES };   // for checking from the console
  let ledT = 0;
  K.updaters.push((t, dt, p) => {
    if ((ledT -= dt) > 0) return; ledT = 0.1;
    for (const sc of screens) {
      if (Math.hypot(p.x - sc.x, p.z - sc.z) > 120) continue;   // past the fog nobody sees them
      sc.t += 0.1;
      const name = sc.slides[Math.floor(sc.t / 9) % sc.slides.length];
      SLIDES[name](sc.g, sc.cv.width, sc.cv.height, sc.t);
      sc.tex.needsUpdate = true;
    }
  });

  // ---------- the plaza: a fountain, the star sculpture, benches, planters, light bollards ----------
  {
    const P0 = -18, P1 = 18, Z0 = B.n, Z1 = sky.fz - 0.2, cz = (Z0 + Z1) / 2;
    mesh(box(P1 - P0, 0.15, Z1 - Z0), K.markWet(surf('large_grey_tiles', (P1 - P0) / 2, (Z1 - Z0) / 2, { color: 0xc8c6c2, wet: 0.7 }), 0.6), 0, 0.075, cz).receiveShadow = true;
    RAISED.push({ minX: P0, maxX: P1, minZ: Z0, maxZ: Z1 });
    WALK.push({ minX: P0 + 0.2, maxX: P1 - 0.2, minZ: Z0 - 0.3, maxZ: Z1 - 0.2 });
    WALK.push({ minX: -1.9, maxX: 1.9, minZ: Z1 - 0.5, maxZ: Z1 + 1.6 }); RAISED.push({ minX: -2.2, maxX: 2.2, minZ: Z1 - 0.1, maxZ: Z1 + 1.2 });
    for (let z = Z0 + 3; z < Z1; z += 6) strip(P1 - P0 - 1, 0.12, 0, z, std(0x8d8c8a, { roughness: 0.6 }), 0.152);
    // fountain
    const fz = 143, stone = std(0x9a958e, { roughness: 0.7 }), water = K.markWet(new THREE.MeshStandardMaterial({ color: 0x0b1a26, roughness: 0.05, metalness: 0.3 }), 1);
    water.userData.wetBase = 1;
    batch(new THREE.CylinderGeometry(6, 6.2, 0.55, 48, 1, true), stone, 0, 0.42, fz);
    batch(new THREE.CylinderGeometry(6.35, 6.35, 0.08, 48), stone, 0, 0.72, fz);
    batch(new THREE.CylinderGeometry(5.8, 5.8, 0.6, 48, 1, true).scale(1, 1, 1), stone, 0, 0.42, fz);
    { const wm = mesh(new THREE.CircleGeometry(5.8, 48), water, 0, 0.5, fz); wm.rotation.x = -Math.PI / 2; }
    glowPool(0, 0.52, fz, 11, 11, 0x7fd8ff, 0.5);
    const jetMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.7, 0.95, 1.2), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    const jets = [];
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2, j = mesh(new THREE.CylinderGeometry(0.03, 0.09, 1, 8).translate(0, 0.5, 0), jetMat, Math.cos(a) * 3.8, 0.5, fz + Math.sin(a) * 3.8);
      j.userData.dynamic = true; jets.push(j);
    }
    const mid = mesh(new THREE.CylinderGeometry(0.05, 0.16, 1, 10).translate(0, 0.5, 0), jetMat, 0, 0.5, fz); mid.userData.dynamic = true;
    K.updaters.push((t) => { for (let k = 0; k < jets.length; k++) jets[k].scale.y = 1.6 + Math.sin(t * 1.3 + k * 0.63) * 0.9; mid.scale.y = 3.4 + Math.sin(t * 0.8) * 0.8; });
    lampSpots.push(spot(0, 5, fz, { c: 0x9fe0ff, k: 14, d: 14 }));
    collide(-6.3, 6.3, fz - 6.3, fz + 6.3);
    // the star sculpture: a steel ring with a five-pointed star, lit from below
    const st = std(0xd8dde2, { roughness: 0.15, metalness: 1.0 });
    const sz = 154;
    batch(box(3.2, 0.9, 3.2), stone, 0, 0.6, sz);
    batch(new THREE.TorusGeometry(2.4, 0.16, 12, 64), st, 0, 3.6, sz);
    const sh = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.75 : 1.9; sh[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
    batch(new THREE.ExtrudeGeometry(sh, { depth: 0.22, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05 }).translate(0, 0, -0.11), st, 0, 3.6, sz);
    glowPool(0, 0.17, sz, 6, 6, 0xbfe6ff, 0.35);
    lampSpots.push(spot(0, 0.9, sz - 2.2, { c: 0xcfe8ff, k: 10, d: 8 }));
    collide(-1.6, 1.6, sz - 1.6, sz + 1.6);
    // benches round the fountain, planters with trees at the corners, light bollards along the edges
    const wood = std(0x6b4a30, { roughness: 0.6 });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.26, r = 8.4, x = Math.cos(a) * r, z = fz + Math.sin(a) * r;
      batch(box(2.2, 0.08, 0.5).rotateY(-a + Math.PI / 2), wood, x, 0.6, z);
      for (const o of [-0.85, 0.85]) batch(box(0.08, 0.45, 0.42).rotateY(-a + Math.PI / 2), steelMat, x + Math.cos(a + Math.PI / 2) * o, 0.38, z + Math.sin(a + Math.PI / 2) * o);
    }
    for (const [x, z] of [[-13, 133], [13, 133], [-13, 152], [13, 152]]) {
      batch(box(3, 0.6, 3), stone, x, 0.45, z); tree(x, z, 0.75, false); collide(x - 1.5, x + 1.5, z - 1.5, z + 1.5);
    }
    const bolMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.3, 2.0) });
    for (let z = Z0 + 2; z < Z1 - 1; z += 5) for (const x of [P0 + 0.6, P1 - 0.6]) {
      batch(new THREE.CylinderGeometry(0.1, 0.12, 0.8, 10), finMat, x, 0.55, z);
      batch(new THREE.CylinderGeometry(0.105, 0.105, 0.12, 10), bolMat, x, 0.9, z);
      glowPool(x, 0.17, z, 2.2, 2.2, 0xfff0d8, 0.3);
    }
  }


  // =====================================================================================
  // HOSHIMI CANAL 星見運河: dark water between stone quays, a promenade on the town side, moored yakatabune
  // with their lanterns lit, a footbridge, and the boulevard crossing on a bridge
  // =====================================================================================
  const CN = NORTH.canal, EX = NORTH.expressway;
  // more ground: east of the canal, and the strip beside the old town the expressway runs over
  { const g = flatM(NORTH.harbour.quay - CN.x1, 216, (NORTH.harbour.quay + CN.x1) / 2, 152, groundM, -0.02); g.receiveShadow = true; }
  { const g = flatM(18, 8, (CN.x0 + CN.x1) / 2, CN.z1 + 4, groundM, -0.02); }
  // water: the street mirror's image, rippled, with a Fresnel falloff (it shows even when the streets are dry)
  const W = K.WET;
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x06111a, roughness: 0.08, metalness: 0.15 });
  waterMat.userData.mutable = true;
  waterMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { tRefl: W.tRefl, uReflMat: W.uReflMat, uReflInv: W.uReflInv, uTime: W.uTime, uOn: W.uOn });
    sh.vertexShader = 'uniform mat4 uReflMat, uReflInv;\nvarying vec4 vReflUv;\nvarying vec3 vWetW;\n' + sh.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\n\tvec4 wetWP = modelMatrix * vec4( transformed, 1.0 );\n\tvWetW = wetWP.xyz;\n\tvReflUv = uReflMat * ( uReflInv * wetWP );');
    sh.fragmentShader = 'uniform sampler2D tRefl;\nuniform float uTime, uOn;\nvarying vec4 vReflUv;\nvarying vec3 vWetW;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', `
      {
        vec2 p = vWetW.xz;
        vec2 rip = vec2(sin(p.x * 1.3 + uTime * 1.1) + sin(p.y * 2.1 - uTime * 1.7 + p.x * 0.7), cos(p.y * 1.1 + uTime * 0.9) + sin(p.x * 2.7 + p.y * 1.3 + uTime * 2.3)) * 0.5;
        rip += vec2(sin(p.x * 7.0 + uTime * 3.1), cos(p.y * 6.3 - uTime * 2.7)) * 0.3;
        vec2 ruv = vReflUv.xy / vReflUv.w + rip * 0.0065;
        vec3 refl = vec3(0.0); float ws = 0.0;
        for (int i = -4; i <= 4; i++) {
          float fi = float(i); float w = exp(-fi * fi / 8.0);
          vec3 c = texture2D(tRefl, clamp(ruv + vec2(fi * 0.0006, fi * 0.0045), 0.001, 0.999)).rgb;
          if (any(isnan(c)) || any(isinf(c))) { c = vec3(0.0); w = 0.0; }
          refl += min(c, vec3(40.0)) * w; ws += w;
        }
        refl /= max(ws, 1e-4);
        float NdV = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
        float fres = 0.1 + 0.9 * pow(1.0 - NdV, 4.0);
        outgoingLight = outgoingLight * 0.75 + refl * (0.3 + 0.6 * fres) * uOn;
      }
      #include <opaque_fragment>`);
  };
  { const m = flatM(CN.x1 - CN.x0, CN.z1 - CN.z0, (CN.x0 + CN.x1) / 2, (CN.z0 + CN.z1) / 2, waterMat, CN.y); m.receiveShadow = true; }
  K.updaters.push((t, dt, p) => { K.mirrorNeed(p.x > 70 && p.x < 260 && p.z > 20 && p.z < 270); });
  // dawn mist: soft sheets drifting low over the canal and the harbour (main.js sets how thick, by the clock)
  {
    const mistT = TX.canvasTex(256, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) { const x = rn() * w, y = rn() * h, r = 20 + rn() * 60, gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, `rgba(255,255,255,${0.12 + rn() * 0.18})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
        for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) { g.save(); g.translate(ox, oy); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.restore(); } }
    }, { repeat: true, srgb: false });
    const sheets = [];
    for (const [x0, x1, z0, z1] of [[CN.x0, CN.x1, CN.z0, CN.z1], [NORTH.harbour.quay, NORTH.harbour.quay + 90, 30, 250]]) {
      for (let k = 0; k < 3; k++) {
        const t = mistT.clone(); t.needsUpdate = true; t.repeat.set((x1 - x0) / 40, (z1 - z0) / 40);
        const m = new THREE.MeshBasicMaterial({ map: t, alphaMap: t, color: 0xc4ccd6, transparent: true, opacity: 0, depthWrite: false });
        const o = flatM(x1 - x0, z1 - z0, (x0 + x1) / 2, (z0 + z1) / 2, m, CN.y + 0.4 + k * 0.9); o.renderOrder = 6; o.visible = false; o.userData.dynamic = true;
        sheets.push({ o, t, sp: 0.004 + k * 0.003, k });
      }
    }
    let mk = 0;
    NORTH.setMist = (k) => { mk = k; };
    K.updaters.push((t, dt) => {
      for (const s of sheets) {
        const on = mk > 0.02; if (s.o.visible !== on) s.o.visible = on;
        if (!on) continue;
        s.o.material.opacity = mk * (0.3 - s.k * 0.07); s.t.offset.x += dt * s.sp; s.t.offset.y += dt * s.sp * 0.6;
      }
    });
  }
  // quay walls with granite coping, iron ladders, outfalls; the canal's two ends
  const quayM = surf('concrete_wall_003', 1, 1, { color: 0x8a8580, wet: 0.6 }), coping = surf('concrete_floor_02', 0.5, 40, { color: 0xb5b0a8, wet: 0.7 });
  const CL = CN.z1 - CN.z0, CC = (CN.z0 + CN.z1) / 2;
  for (const [x, s] of [[CN.x0, -1], [CN.x1, 1]]) {
    const wm = surf('concrete_wall_003', CL / 3, 1, { color: 0x7d7872, wet: 0.6 });
    mesh(box(0.8, 2.6, CL), wm, x + s * 0.4, CN.y - 0.9 + 1.3 - 0.05, CC);
    mesh(box(1.0, 0.22, CL), coping, x + s * 0.5, 0.06, CC);
    for (let z = CN.z0 + 9; z < CN.z1 - 4; z += 23) {
      if (z > B.s - 2 && z < B.n + 2) continue;
      for (let y = CN.y + 0.2; y < 0; y += 0.32) batch(box(0.05, 0.03, 0.5), steelMat, x - s * 0.06, y, z);
      for (const dz of [-0.25, 0.25]) batch(box(0.05, -CN.y + 0.2, 0.04), steelMat, x - s * 0.06, CN.y / 2, z + dz);
      batch(new THREE.CylinderGeometry(0.28, 0.28, 0.1, 16).rotateZ(Math.PI / 2), std(0x0c0d0f), x - s * 0.01, CN.y + 0.9, z + 9);
    }
  }
  for (const z of [CN.z0, CN.z1]) mesh(box(CN.x1 - CN.x0 + 2, 2.6, 0.8), quayM, (CN.x0 + CN.x1) / 2, CN.y - 0.9 + 1.25, z + (z === CN.z0 ? -0.4 : 0.4));
  // railings along the promenade and the quay edge
  const railM = std(0x2f3337, { roughness: 0.4, metalness: 0.7 });
  const railing = (x, z0, z1) => {
    const L = z1 - z0, c = (z0 + z1) / 2;
    batch(box(0.07, 0.07, L), railM, x, 1.1, c); batch(box(0.05, 0.05, L), railM, x, 0.62, c);
    for (let z = z0; z <= z1; z += 2) batch(box(0.07, 0.95, 0.07), railM, x, 0.62, z);
    collide(x - 0.12, x + 0.12, z0, z1);
  };
  for (const [z0, z1] of [[CN.z0, B.s - 0.2], [B.n + 0.2, CN.z1]]) { railing(CN.x0 - 0.3, z0, z1); railing(CN.x1 + 0.3, z0, z1); }
  // the promenade: wood deck by the water, pavers, lamps, benches, trees (south of the boulevard it's a strip of park)
  const deckM = surf('wood_floor', 2, 20, { color: 0x8a6a4c, wet: 0.6 });
  const lantern = std(0x22262a, { roughness: 0.4, metalness: 0.6 }), lanternGlass = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.7, 1.3, 0.8) });
  const lamp = (x, z) => {
    batch(new THREE.CylinderGeometry(0.07, 0.11, 3.8, 10), lantern, x, 2.05, z);
    batch(new THREE.CylinderGeometry(0.22, 0.16, 0.5, 8), lanternGlass, x, 4.2, z);
    batch(new THREE.ConeGeometry(0.3, 0.25, 8), lantern, x, 4.55, z);
    const gp = glowPool(x, 0.17, z, 6, 6, 0xffd29a, 0.32); gp.userData.dynamic = true;
    K.lampFx.push({ gp, cone: K.lightCone(x, 4.1, z, { color: 0xffd29a, h: 4, r: 1.8 }), gpBase: gp.material.color.clone(), coneBase: 0, broken: false });
    const L = K.lampFx[K.lampFx.length - 1]; L.cone.userData.dynamic = true; L.coneBase = L.cone.material.uniforms.strength.value;
    lampSpots.push(spot(x, 4.1, z, { c: 0xffd29a, k: 16, d: 13, street: true }));
    collide(x - 0.15, x + 0.15, z - 0.15, z + 0.15); camPole(x, z, 0.12, 4.6);
  };
  {
    const x0 = 84.8, x1 = CN.x0, z0 = NORTH.z0, z1 = B.s;
    pave(x0, x1 - 3, z0, z1);
    mesh(box(3, 0.15, z1 - z0), deckM, x1 - 1.5, 0.075, (z0 + z1) / 2);
    RAISED.push({ minX: x1 - 3, maxX: x1, minZ: z0, maxZ: z1 });
    WALK.push({ minX: x0 + 0.2, maxX: x1 - 0.2, minZ: z0, maxZ: z1 + 0.5 });
    for (let z = z0 + 6; z < z1 - 3; z += 14) { lamp(x1 - 3.4, z); }
    for (let z = z0 + 13; z < z1 - 6; z += 14) { tree(x0 + 2.4, z); }
    const wood = std(0x6b4a30, { roughness: 0.6 });
    for (let z = z0 + 10; z < z1 - 6; z += 14) {
      batch(box(0.5, 0.08, 2.0), wood, x1 - 4.4, 0.6, z); batch(box(0.08, 0.45, 2.0), wood, x1 - 4.62, 0.85, z);
      for (const o of [-0.8, 0.8]) batch(box(0.42, 0.45, 0.08), steelMat, x1 - 4.4, 0.38, z + o);
    }
    // north of the boulevard: a narrow walk under the towers
    pave(93.5, x1, B.n, CN.z1);
    WALK.push({ minX: 93.7, maxX: x1 - 0.2, minZ: B.n - 0.5, maxZ: CN.z1 - 0.3 });
    for (let z = B.n + 8; z < CN.z1 - 3; z += 16) lamp(95.2, z);
  }
  // the boulevard's bridge: steel fascia, cast lamps at the corners
  const fasciaM = std(0x3a4a5a, { roughness: 0.4, metalness: 0.6 });
  for (const z of [B.s, B.n]) {
    batch(box(CN.x1 - CN.x0 + 1.6, 1.7, 0.4), fasciaM, (CN.x0 + CN.x1) / 2, -0.7, z);
    for (let x = CN.x0 + 1; x < CN.x1; x += 2) batch(box(0.1, 0.9, 0.1), railM, x, 0.6, z + (z === B.s ? 0.3 : -0.3));
    batch(box(CN.x1 - CN.x0, 0.08, 0.1), railM, (CN.x0 + CN.x1) / 2, 1.08, z + (z === B.s ? 0.3 : -0.3));
    for (const x of [CN.x0 - 0.6, CN.x1 + 0.6]) lamp(x, z + (z === B.s ? 0.9 : -0.9));
  }
  for (const z of [B.s, B.n]) collide(CN.x0, CN.x1, z - 0.05 + (z === B.s ? 0.1 : -0.4), z + 0.05 + (z === B.s ? 0.4 : -0.1));
  // a footbridge from the promenade to the harbour side
  {
    const fz = 72, fw = 3;
    mesh(box(CN.x1 - CN.x0 + 1, 0.25, fw), surf('wood_floor', 6, 1, { color: 0x7a5e44, wet: 0.6 }), (CN.x0 + CN.x1) / 2, 0.025, fz).receiveShadow = true;
    RAISED.push({ minX: CN.x0 - 0.5, maxX: CN.x1 + 0.5, minZ: fz - fw / 2, maxZ: fz + fw / 2 });
    WALK.push({ minX: CN.x0 - 1, maxX: CN.x1 + 1, minZ: fz - fw / 2 + 0.25, maxZ: fz + fw / 2 - 0.25 });
    const archM = std(0xd8dade, { roughness: 0.35, metalness: 0.7 });
    for (const dz of [-fw / 2, fw / 2]) {
      const pts = []; for (let i = 0; i <= 24; i++) { const u = i / 24; pts.push(V3(CN.x0 - 0.5 + (CN.x1 - CN.x0 + 1) * u, 0.15 + Math.sin(u * Math.PI) * 3.2, fz + dz)); }
      batch(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.12, 8), archM, 0, 0, 0);
      for (let i = 2; i < 23; i += 2) { const p = pts[i]; batch(box(0.04, p.y - 1.1, 0.04), archM, p.x, (p.y + 1.1) / 2, p.z); }
      batch(box(CN.x1 - CN.x0 + 1, 0.06, 0.06), archM, (CN.x0 + CN.x1) / 2, 1.1, fz + dz);
      collide(CN.x0 - 0.6, CN.x1 + 0.6, fz + dz - 0.08, fz + dz + 0.08);
    }
    for (const x of [CN.x0, CN.x1]) for (const dz of [-fw / 2, fw / 2]) batch(new THREE.SphereGeometry(0.12, 10, 8), lanternGlass, x, 1.25, fz + dz);
    lampSpots.push(spot((CN.x0 + CN.x1) / 2, 3.5, fz, { c: 0xfff0d8, k: 5, d: 9 }));
  }
  // yakatabune: roofed party boats with paper lanterns along the eaves, moored by the promenade, bobbing
  const boats = [];
  const shojiT = TX.canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#ffd9a0'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(70,40,20,0.85)'; g.lineWidth = 2; for (let x = 0; x < w; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y < h; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(60,30,20,0.35)'; g.fillRect(20 + i * 50, 22, 12, 42); } }, { repeat: true });
  function yakatabune(x, z, len = 16) {
    const g = new THREE.Group(); g.position.set(x, CN.y, z); g.userData.dynamic = true; scene.add(g);
    const hull = std(0x3a2a20, { roughness: 0.55 }), white = std(0xe8e2d8, { roughness: 0.6 });
    const add = (geo, m, px, py, pz) => { const o = new THREE.Mesh(geo, m); o.position.set(px, py, pz); g.add(o); return o; };
    add(new RoundedBoxGeometry(3.2, 1.0, len, 2, 0.35), hull, 0, 0.2, 0);
    add(new THREE.ConeGeometry(1.6, 3, 4, 1).rotateX(Math.PI / 2).rotateZ(Math.PI / 4).scale(1, 0.45, 1), hull, 0, 0.3, len / 2 + 1.2);
    add(box(3.25, 0.12, len), white, 0, 0.72, 0);
    const sh = shojiT.clone(); sh.repeat.set(len / 4, 1); sh.needsUpdate = true;
    const shoji = new THREE.MeshBasicMaterial({ map: sh, color: new THREE.Color(1.3, 1.15, 0.95) });
    add(box(2.8, 1.25, len - 3), [shoji, shoji, white, white, shoji, shoji], 0, 1.4, -0.5);
    add(new THREE.CylinderGeometry(1.9, 1.9, len - 2.4, 18, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(-Math.PI / 2).scale(0.85, 0.28, 1), std(0x1e1a18, { roughness: 0.5 }), 0, 2.05, -0.5);
    const red = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.5, 0.25) });
    for (const sx of [-1.65, 1.65]) for (let zz = -len / 2 + 2; zz < len / 2 - 1.5; zz += 1.4) add(new THREE.SphereGeometry(0.17, 10, 8).scale(1, 1.3, 1), red, sx, 1.75, zz - 0.5);
    lampSpots.push(spot(x, CN.y + 3, z, { c: 0xffb070, k: 12, d: 14 }));
    boats.push({ g, ph: rn() * 6 });
  }
  yakatabune(CN.x0 + 2.6, 58); yakatabune(CN.x0 + 2.6, 152, 18); yakatabune(CN.x1 - 2.6, 196, 14);
  K.updaters.push((t) => { for (const b of boats) { b.g.position.y = CN.y + Math.sin(t * 0.9 + b.ph) * 0.05; b.g.rotation.z = Math.sin(t * 0.7 + b.ph) * 0.015; } });
  // a cruise on the big one: a loop of the canal's north reach (round the far end and back by the east channel),
  // you sitting out on the bow; E gets you off (back at the landing)
  {
    const boat = boats[1], g = boat.g, home = { x: g.position.x, z: g.position.z };
    const path = new THREE.CatmullRomCurve3([[home.x, home.z], [103, 166], [103, 196], [104.2, 213], [108.4, 215], [109.5, 198], [109.5, 166], [108.6, 146], [104.5, 141.5], [home.x + 0.4, 145]].map(([x, z]) => V3(x, 0, z)), true, 'centripetal');
    const P = V3(0, 0, 0), T = V3(0, 0, 0), seatP = V3(0, 0, 0);
    const seat = { x: 0, y: 0, z: 0, yaw: 0, out: { x: 95.3, y: 0.17, z: 152 }, snap: true, pose: 'car' };
    const place = (u) => {
      path.getPointAt(u, P); path.getTangentAt(u, T);
      g.position.x = P.x; g.position.z = P.z; g.rotation.y = Math.atan2(T.x, T.z);
      seatP.set(0, 0.86, 7.3).applyAxisAngle(V3(0, 1, 0), g.rotation.y).add(g.position);
      Object.assign(seat, { x: seatP.x, y: g.position.y + 0.86, z: seatP.z, yaw: g.rotation.y });
    };
    const ride = {
      begin(api) { this.u = 0.002; this.t = 0; api.toast('Yakatabune cruise · 屋形船 — E to get off'); api.ui.showPrompt('E · Get off the boat'); place(this.u); api.player.sit(seat); },
      update(dt, eHit, api) {
        this.t += dt;
        if (eHit || this.u >= 0.995) return false;
        // ease off the landing and in again at the end
        const sp = 2.3 * Math.min(1, this.t / 4) * Math.min(1, (1 - this.u) * 40);
        this.u = Math.min(0.996, this.u + sp * dt / path.getLength());
        place(this.u); api.player.sit(seat);
        return true;
      },
      end(api) {
        api.teleport(95.3, 0.17, 152, -Math.PI / 2, () => { g.position.x = home.x; g.position.z = home.z; g.rotation.y = 0; });
      },
    };
    K.interactables.push({ pos: V3(95.4, 0, 152), r: 2.2, label: 'Board the yakatabune ¥1,500', anim: null, action: (api) => { api.start(ride); return null; } });
  }
  // out at sea: a tug doing its rounds, navigation lights on
  {
    const tug = new THREE.Group(); tug.userData.dynamic = true; scene.add(tug);
    const red = std(0x8a2a22, { roughness: 0.6 }), wh = std(0xe8e6e0, { roughness: 0.6 }), blk = std(0x1a1c20, { roughness: 0.6 });
    const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); tug.add(o); return o; };
    add(new RoundedBoxGeometry(5.5, 2.2, 15, 2, 0.6), red, 0, 0.4, 0); add(box(5.6, 0.4, 15), blk, 0, 1.55, 0);
    add(box(4, 2.4, 5), wh, 0, 2.9, -1); add(box(3.6, 1.4, 3.2), wh, 0, 4.8, -1.2); add(new THREE.CylinderGeometry(0.5, 0.6, 2.2, 12), blk, 0, 5.2, -3.6);
    const lit = (c) => new THREE.MeshBasicMaterial({ color: new THREE.Color(...c) });
    add(new THREE.SphereGeometry(0.22, 8, 6), lit([3, 0.2, 0.15]), -2, 4.0, 0.6); add(new THREE.SphereGeometry(0.22, 8, 6), lit([0.2, 3, 0.6]), 2, 4.0, 0.6);
    add(new THREE.SphereGeometry(0.25, 8, 6), lit([3, 3, 2.8]), 0, 7, -1.2);
    const winT = TX.windows(4, 2, '#e8e6e0', rn, 'office'); add(box(3.62, 1.0, 3.22), new THREE.MeshStandardMaterial({ map: winT.map, emissive: 0xffffff, emissiveMap: winT.emissiveMap, emissiveIntensity: 1 }), 0, 4.9, -1.2);
    // (placed out at sea from the start; it only moves while you're near enough to see it)
    const sail = (t) => {
      const a = t * 0.045, x = 222 + Math.cos(a) * 24, z = 125 + Math.sin(a) * 70;
      tug.position.set(x, CN.y - 0.2 + Math.sin(t * 0.8) * 0.08, z); tug.rotation.y = Math.atan2(-Math.sin(a) * 24, Math.cos(a) * 70); tug.rotation.z = Math.sin(t * 0.6) * 0.02;
    };
    sail(0);
    K.updaters.push((t, dt, p) => { if (p.x > 100) sail(t); });
  }

  // =====================================================================================
  // 首都高 星見線: the elevated expressway on piers above the canal, and on south past the old town. Sound
  // barriers, sodium lamps, green signs, and a steady stream of headlights and tail lights.
  // =====================================================================================
  {
    const xc = EX.x, hw = EX.half, yt = EX.y, EL = EX.z1 - EX.z0, EC = (EX.z0 + EX.z1) / 2;
    const conc = surf('concrete_wall_003', 1, 5, { color: 0xa3a3a0, wet: 0.6 }), concCap = surf('concrete_wall_003', 5, 0.6, { color: 0xa3a3a0, wet: 0.6 }), concB = std(0x6e6b66, { roughness: 0.85 });
    const avoid = (z) => Math.abs(z + 66) < 9 || (z > -163 && z < -145) || (z > B.s - 3 && z < B.n + 3);
    for (let z = EX.z0 + 10; z < EX.z1 - 5; z += 30) {
      if (avoid(z)) continue;
      const base = z > CN.z0 && z < CN.z1 ? CN.y - 0.5 : 0, top = yt - 1.4 - 1.7;
      batch(new RoundedBoxGeometry(2.4, top - base, 2.4, 2, 0.35), conc, xc, (top + base) / 2, z);
      batch(box(hw * 2 - 1, 1.7, 2.8), concCap, xc, top + 0.85, z);
      batch(box(1.2, 0.6, 1.2), concB, xc - hw + 1.5, top + 1.9, z); batch(box(1.2, 0.6, 1.2), concB, xc + hw - 1.5, top + 1.9, z);
      collide(xc - 1.3, xc + 1.3, z - 1.3, z + 1.3); camPole(xc, z, 1.25, top);
    }
    // the deck in 30 m pieces (so far ones drop out with the fog)
    const asphD = SF ? surf('asphalt_02', 4, 8, { wet: 0.5, color: 0x8a8c92 }) : std(0x2a2b2f, { roughness: 0.7 }), barrierM = std(0xb8b4ac, { roughness: 0.8 }), panelM = new THREE.MeshStandardMaterial({ color: 0x9fb8c8, transparent: true, opacity: 0.32, roughness: 0.2, metalness: 0.2, depthWrite: false });
    for (let z = EX.z0; z < EX.z1; z += 30) {
      const L = Math.min(30, EX.z1 - z), c = z + L / 2, merge = z === EX.merge0;
      batch(box(hw * 2, 1.4, L), concB, xc, yt - 0.7, c);
      batch(box(hw * 2 - 0.2, 0.02, L), asphD, xc, yt + 0.01, c);
      for (const s of [-1, 1]) {
        if (merge && s > 0) { for (let zz = z + 3; zz < z + L; zz += 6) batch(box(0.12, 0.02, 3), K.paint, xc + s * 3.6, yt + 0.025, zz); continue; }
        batch(box(0.45, 1.1, L), barrierM, xc + s * (hw - 0.22), yt + 0.55, c);
        batch(box(0.06, 2.2, L), panelM, xc + s * (hw - 0.1), yt + 2.2, c);
        batch(box(0.1, 0.1, L), steelMat, xc + s * (hw - 0.1), yt + 3.3, c);
        for (let zz = z; zz < z + L; zz += 2.5) batch(box(0.1, 2.3, 0.1), steelMat, xc + s * (hw - 0.1), yt + 2.2, zz);
        for (let zz = z + 3; zz < z + L; zz += 6) batch(box(0.12, 0.02, 3), K.paint, xc + s * 3.6, yt + 0.025, zz);
      }
      if (!merge) {
        batch(box(0.5, 0.9, L), barrierM, xc, yt + 0.45, c);
        K.colliders.push({ minX: xc - 0.3, maxX: xc + 0.3, minZ: z, maxZ: z + L, minY: yt - 0.6, maxY: yt + 2.5 });
      }
    }
    // sodium lamps on the median, their light on the deck
    const sod = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.1, 1.1) });
    for (let z = EX.z0 + 12; z < EX.z1; z += 25) {
      batch(new THREE.CylinderGeometry(0.08, 0.12, 6, 8), steelMat, xc, yt + 3.9, z);
      for (const s of [-1, 1]) {
        batch(box(2.2, 0.08, 0.08), steelMat, xc + s * 1.1, yt + 6.8, z);
        batch(box(0.7, 0.14, 0.32), steelMat, xc + s * 2.2, yt + 6.75, z);
        batch(new THREE.PlaneGeometry(0.6, 0.26).rotateX(Math.PI / 2), sod, xc + s * 2.2, yt + 6.67, z);
        glowPool(xc + s * 3.4, yt + 0.04, z, 7, 9, 0xffb062, 0.3);
        lampSpots.push(spot(xc + s * 2.2, yt + 6.5, z, { c: 0xffb062, k: 30, d: 16, street: true }));
      }
    }
    // green signs over the lanes
    const gsign = (txt, sub) => basic(TX.canvasTex(512, 160, (g, w, h) => {
      g.fillStyle = '#0d6b3a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
      g.fillStyle = '#fff'; g.font = `bold 58px ${TX.JP_FONT}`; g.textAlign = 'center'; g.fillText(txt, w / 2, 76); g.font = `bold 34px ${TX.LATIN_FONT}`; g.fillText(sub, w / 2, 128);
    }), 1.2);
    for (const [z, a, b2, c, d] of [[70, '新星見 出口', 'SHIN-HOSHIMI EXIT 1 km', '月野 方面', 'TSUKINO'], [-30, '星見 港', 'HOSHIMI HARBOUR', '都心 方面', 'CITY CENTRE']]) {
      for (const s of [-1, 1]) batch(box(0.3, 6.2, 0.3), steelMat, xc + s * (hw - 0.6), yt + 3.1, z);
      batch(box(hw * 2 - 1, 0.3, 0.3), steelMat, xc, yt + 6.1, z);
      const m1 = mesh(new THREE.PlaneGeometry(6, 1.9), gsign(a, b2), xc - 3.6, yt + 5.0, z + 0.2); void m1;
      const m2 = mesh(new THREE.PlaneGeometry(6, 1.9), gsign(c, d), xc + 3.6, yt + 5.0, z - 0.2); m2.rotation.y = Math.PI;
    }
    // traffic: the same real cars as the streets (Crown taxi, Prius, Corolla, kei cars, JPN Taxi, vans, trucks), each
    // model baked once into a few meshes per material and drawn for all its cars at once (instanced), two lanes each way
    const N = 56;
    const bakeCar = (key, livery) => {
      const tmp = new THREE.Scene();
      const v = dressVehicle(spawnCar(K.ctx.cars[key], tmp), key, { livery });
      v.userData.setLights?.(1.4);
      v.position.set(0, 0, 0); v.rotation.set(0, 0, 0); v.updateMatrixWorld(true);
      const inv = v.matrixWorld.clone().invert(), m = new THREE.Matrix4(), byMat = new Map();
      v.traverse((o) => {
        if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || Array.isArray(o.material) || !o.material) return;
        for (let q2 = o; q2; q2 = q2.parent) if (!q2.visible) return;
        let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
        if (!g.attributes.normal) g.computeVertexNormals();
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        g.morphAttributes = {};
        m.multiplyMatrices(inv, o.matrixWorld); g.applyMatrix4(m);
        if (m.determinant() < 0) flipWinding(g);   // mirrored parts would turn inside out
        if (!byMat.has(o.material)) byMat.set(o.material, []);
        byMat.get(o.material).push(g);
      });
      const parts = [...byMat].map(([mat, geos]) => ({ geo: mergeGeometries(geos, false), mat }));
      return { key, parts, L: v.userData.L ?? 4.5, W: v.userData.W ?? 1.75 };
    };
    // what's on the road: mostly cars, some taxis, vans and the odd truck
    const MIX = [['crown_comfort', 3, 0], ['prius_2012', 3, 0], ['corolla_mk7', 2, 0], ['wagonr', 2, 0], ['daihatsu_cast', 2, 0], ['jpn_taxi', 2, 0], ['hiace_2013', 1, 0], ['carry_minivan', 1, 0], ['isuzu_elf', 1, 1]]
      .filter(([k]) => K.ctx.cars?.[k]);
    const kinds = MIX.map(([k, , lv]) => bakeCar(k, lv));
    const bag = MIX.flatMap(([, w], i) => Array(w).fill(i));
    const cars = [];
    for (let i = 0; i < N; i++) {
      const dir = i % 2 ? 1 : -1, lane = (i >> 1) % 2, kind = kinds.length ? bag[Math.floor(rn() * bag.length)] : -1;
      // keep left: northbound (+z) on the +x side; trucks keep to the slower inside lane
      const k = kinds[kind], slow = k && /elf|hiace|carry/.test(k.key);
      cars.push({ x: xc + dir * (lane && !slow ? 5.6 : 2.0), z: EX.z0 + rn() * EL, v: (lane && !slow ? 24 : 18) + rn() * 6, dir, kind, L: k?.L ?? 4.5, W: k?.W ?? 1.75 });
    }
    // one instanced mesh per model and material, sized for that model's cars
    for (const [ki, k] of kinds.entries()) {
      const mine = cars.filter((c) => c.kind === ki);
      k.meshes = k.parts.map(({ geo, mat }) => {
        const im = new THREE.InstancedMesh(geo, mat, Math.max(1, mine.length)); im.count = mine.length;
        im.frustumCulled = false; im.userData.dynamic = true; im.castShadow = false; im.receiveShadow = true; scene.add(im); K.reflectSkip.push(im);
        return im;
      });
      mine.forEach((c, j) => { c.slot = j; });
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = V3(0, 1, 0), pos = V3(0, 0, 0), sc = V3(1, 1, 1);
    const drive = (dt) => {
      for (let i = 0; i < N; i++) {
        const c = cars[i];
        c.z += (c.cur ?? c.v) * c.dir * Math.min(dt, 0.1);
        if (c.z > EX.z1) c.z = EX.z0; else if (c.z < EX.z0) c.z = EX.z1;
        const k = kinds[c.kind]; if (!k) continue;
        q.setFromAxisAngle(up, c.dir > 0 ? 0 : Math.PI); pos.set(c.x, yt, c.z);
        m4.compose(pos, q, sc);
        for (const im of k.meshes) im.setMatrixAt(c.slot, m4);
      }
      for (const k of kinds) for (const im of k.meshes) im.instanceMatrix.needsUpdate = true;
    };
    drive(0);   // on the deck from the start (an instance never placed would sit at the town's origin)
    K.updaters.push((t, dt, p) => { if (Math.abs(p.x - xc) < 260) drive(dt); });
    // ---------- the ramp up from the harbour road, joining the northbound side; a tunnel at each end ----------
    const RP = NORTH.ramp, rw = RP.x1 - RP.x0, rx = (RP.x0 + RP.x1) / 2;
    const rampLamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.8, 3.2) });
    const asphR = SF ? surf('asphalt_02', 1.8, 1, { wet: 0.5, color: 0x8a8c92 }) : asphD;
    for (let z = RP.z1, k = 0; z > RP.z0 + 0.01; z -= 4, k++) {
      const za = z, zb = z - 4, ya = rampY(za), yb = rampY(zb), mid = (ya + yb) / 2, zc = (za + zb) / 2;
      const ang = Math.atan2(yb - ya, 4), len = Math.hypot(4, yb - ya);
      const slab = (w, h, x, yOff, m) => batch(box(w, h, len + 0.02).rotateX(ang), m, x, mid + yOff, zc);
      slab(rw, 0.8, rx, -0.4, concB);
      slab(rw - 0.3, 0.02, rx, 0.012, asphR);
      for (const s of [-1, 1]) slab(0.42, 1.0, rx + s * (rw / 2 - 0.21), 0.5, barrierM);
      if (k % 2 === 0) slab(0.12, 0.022, rx, 0.03, K.paint);
      // low down it sits on an embankment; higher up on piers
      if (Math.min(ya, yb) > 0.8 && mid < 4) batch(box(rw, Math.min(ya, yb) - 0.8, 4), quayM, rx, (Math.min(ya, yb) - 0.8) / 2, zc);
      if (mid >= 4 && k % 3 === 0 && Math.abs(zc + 66) > 8) {
        for (const s of [-1, 1]) batch(new RoundedBoxGeometry(1.2, mid - 0.8, 1.2, 2, 0.2), conc, rx + s * 2, (mid - 0.8) / 2, zc);
        collide(rx - 2.7, rx - 1.3, zc - 0.7, zc + 0.7); collide(rx + 1.3, rx + 2.7, zc - 0.7, zc + 0.7);
      }
      if (k % 3 === 1) {
        // a lamp on the parapet, leaning over the lanes
        batch(new THREE.CylinderGeometry(0.07, 0.1, 6, 8), steelMat, RP.x1 - 0.2, mid + 3.5, zc);
        batch(box(1.6, 0.08, 0.08), steelMat, RP.x1 - 1, mid + 6.4, zc);
        batch(new THREE.PlaneGeometry(0.6, 0.24).rotateX(Math.PI / 2), rampLamp, RP.x1 - 1.7, mid + 6.32, zc);
        lampSpots.push(spot(RP.x1 - 1.7, mid + 6.1, zc, { c: 0xdfe9ff, k: 26, d: 16, street: true }));
      }
    }
    SLOPES.push({ minX: RP.x0, maxX: RP.x1, minZ: RP.z0 - 0.5, maxZ: RP.z1, y: (x, z) => rampY(z) });
    // where it joins: the deck widens to take it
    {
      const z0 = EX.merge0, z1 = EX.merge1, x0 = xc + hw, x1 = RP.x1, L = z1 - z0, c = (z0 + z1) / 2, w = x1 - x0;
      batch(box(w, 1.4, L), concB, (x0 + x1) / 2, yt - 0.7, c);
      batch(box(w, 0.02, L), asphD, (x0 + x1) / 2, yt + 0.01, c);
      batch(box(0.45, 1.1, L), barrierM, x1 - 0.22, yt + 0.55, c);
      batch(box(w, 1.1, 0.45), barrierM, (x0 + x1) / 2, yt + 0.55, z0 + 0.22);
      batch(box(RP.x0 - x0, 1.1, 0.45), barrierM, (x0 + RP.x0) / 2, yt + 0.55, z1 - 0.22);
      for (const z of [z0 + 4, z1 - 4]) { batch(new RoundedBoxGeometry(2.2, yt - 1.4, 2.2, 2, 0.3), conc, (x0 + x1) / 2, (yt - 1.4) / 2, z); collide((x0 + x1) / 2 - 1.2, (x0 + x1) / 2 + 1.2, z - 1.2, z + 1.2); }
      K.FLOORS.push({ minX: x0 - 0.1, maxX: x1, minZ: z0, maxZ: z1 + 0.5, y: yt });
      // a green sign at the foot of the ramp
      for (const s of [-1, 1]) batch(box(0.3, 6.2, 0.3), steelMat, rx + s * (rw / 2 - 0.3), 3.1, 48);
      batch(box(rw, 0.3, 0.3), steelMat, rx, 6.1, 48);
      const g1 = mesh(new THREE.PlaneGeometry(5.8, 1.9), gsign('首都高 入口', 'EXPRESSWAY · HOSHIMI RTE'), rx, 5.0, 48.2); g1.rotation.y = Math.PI;
    }
    K.FLOORS.push({ minX: xc - hw, maxX: xc + hw, minZ: EX.z0, maxZ: EX.z1, y: yt });
    // drivable: the deck between the tunnels (only up there), the join, the ramp (from the street up)
    DRIVE.push({ minX: xc - hw + 0.5, maxX: xc + hw - 0.5, minZ: EX.tunnelS - 6, maxZ: EX.tunnelN + 6, minY: yt - 3, maxY: yt + 3 });
    DRIVE.push({ minX: xc + hw - 1, maxX: RP.x1 - 0.4, minZ: EX.merge0 + 0.4, maxZ: EX.merge1 + 0.2, minY: yt - 3, maxY: yt + 3 });
    DRIVE.push({ minX: RP.x0 + 0.4, maxX: RP.x1 - 0.4, minZ: RP.z0 - 0.5, maxZ: RP.z1 + 0.5, minY: -1, maxY: yt + 3 });
    // the tunnels: a portal with its name, a dark tube with a row of lamps going in (cars vanish into it)
    const tube = std(0x0d0e10, { roughness: 0.9 }), tubeLamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.8, 1.9, 0.9) });
    for (const [zp, d] of [[EX.tunnelS, -1], [EX.tunnelN, 1]]) {
      const len = d < 0 ? zp - EX.z0 : EX.z1 - zp, zc = zp + d * len / 2;
      batch(box(hw * 2 + 4, 3.0, 1.6), concCap, xc, yt + 7.4, zp);
      for (const s of [-1, 1]) batch(box(2.0, 9, 1.6), conc, xc + s * (hw + 1), yt + 3.2, zp);
      for (const s of [-1, 1]) batch(box(0.3, 6.4, len), tube, xc + s * (hw + 0.1), yt + 3.2, zc);
      batch(box(hw * 2 + 0.6, 0.3, len), tube, xc, yt + 6.4, zc);
      for (let z = zp + d * 2; Math.abs(z - zp) < len; z += d * 4) for (const s of [-1, 1]) batch(box(0.18, 0.14, 1.4), tubeLamp, xc + s * (hw - 0.4), yt + 5.9, z);
      const plate = mesh(new THREE.PlaneGeometry(9, 1.3), basic(TX.signH('星見トンネル HOSHIMI TUNNEL', '#1c2026', '#e8ecf2'), 1.2), xc, yt + 7.4, zp - d * 0.82);
      if (d > 0) plate.rotation.y = Math.PI;
    }
    // the cars up there make room for you, and you can't drive through them
    const near = Array.from({ length: 4 }, () => { const c = { minX: 0, maxX: 0, minZ: -9999, maxZ: -9999, minY: yt - 0.5, maxY: yt + 2.5 }; K.colliders.push(c); return c; });
    for (const c of cars) c.cur = c.v;
    K.updaters.push(() => {
      const pc = K.fx.playerCar?.(), on = pc && pc.position.y > yt - 3;
      for (const c of cars) {
        let want = c.v;
        if (on && Math.abs(c.x - pc.position.x) < 2.3) { const ahead = (pc.position.z - c.z) * c.dir; if (ahead > 0 && ahead < 40) want = Math.min(want, Math.max(0, (ahead - 7.5) * 0.9)); }
        c.cur += (want - c.cur) * 0.08;
      }
      if (!on) { for (const n of near) n.minZ = n.maxZ = -9999; return; }
      const list = cars.map((c) => [c, Math.abs(c.z - pc.position.z) + Math.abs(c.x - pc.position.x)]).sort((a, b) => a[1] - b[1]).slice(0, 4);
      list.forEach(([c], i) => { const hl = c.L / 2 + 0.1, hw2 = c.W / 2 + 0.05; Object.assign(near[i], { minX: c.x - hw2, maxX: c.x + hw2, minZ: c.z - hl, maxZ: c.z + hl }); });
    });
  }

  // =====================================================================================
  // HOSHIMI HARBOUR 星見港: the quay road, warehouses with their numbers painted big, a container yard with
  // gantry cranes, the ship-to-shore cranes at the water and a ship alongside
  // =====================================================================================
  {
    const R0 = HB.road0, R1 = HB.road1, RZ0 = HB.z0, RZ1 = HB.z1;
    // the quay road, cut by the boulevard
    const RF = NORTH.ramp.z1;   // the ramp starts here (going south, up to the expressway)
    pave(CN.x1, R0, RZ0, RF); curbZ(R0 - 0.075, RZ0, RF); pave(R1, HB.x0, RZ0, RF); curbZ(R1 + 0.075, RZ0, RF);
    for (const [z0, z1] of [[RF, B.s], [B.n, RZ1]]) {
      const L = z1 - z0, c = (z0 + z1) / 2;
      flatM(R1 - R0, L + (z0 === RZ0 ? 0 : 0), (R0 + R1) / 2, c, asph((R1 - R0) / 4, L / 4), 0.003).receiveShadow = true;
      flatM(R1 - R0, L, (R0 + R1) / 2, c, wearMat(1, L / 16), 0.0045).renderOrder = 1;
      for (let z = z0 + 3; z < z1 - 3; z += 6) strip(0.12, 3, (R0 + R1) / 2, z, paint);
      strip(0.15, L, R0 + 0.25, c, edgePaint); strip(0.15, L, R1 - 0.25, c, edgePaint);
      pave(CN.x1, R0, z0, z1); curbZ(R0 - 0.075, z0, z1);
      pave(R1, HB.x0, z0, z1); curbZ(R1 + 0.075, z0, z1);
    }
    WALK.push({ minX: CN.x1 + 0.5, maxX: HB.x0 - 0.2, minZ: RF, maxZ: RZ1 - 0.3 });
    WALK.push({ minX: CN.x1 + 0.5, maxX: R0 - 0.1, minZ: RZ0 + 0.3, maxZ: RF + 0.5 }); WALK.push({ minX: R1 + 0.1, maxX: HB.x0 - 0.2, minZ: RZ0 + 0.3, maxZ: RF + 0.5 });
    DRIVE.push({ minX: R0 - 0.2, maxX: HB.x0 - 0.3, minZ: RF, maxZ: RZ1 - 0.3 });
    // its north end: barriers
    for (const z of [RZ1 - 0.6]) {
      for (let x = R0 + 0.4; x < HB.x0; x += 1.6) { batch(box(1.4, 0.35, 0.12), barrier, x + 0.7, 0.85, z); batch(new THREE.SphereGeometry(0.08, 8, 6), flash, x + 0.7, 1.15, z); }
      collide(CN.x1, HB.x0, z - 0.3, z + 0.3);
    }
    // lamps along the quay road (tall, sodium)
    for (let z = RZ0 + 10; z < RZ1 - 4; z += 24) { if (z > B.s - 4 && z < B.n + 4) continue; utilityPole(R1 + 1.2, z, true, -1); }

    // warehouses: corrugated walls, low gable roofs, big numbers, roller doors under sodium lamps
    const corr = (u, v, c) => surf('corrugated_iron', u, v, { color: c, wet: 0.7 });
    const num = (n, col) => basic(TX.canvasTex(256, 256, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = col; g.font = `bold 200px ${TX.LATIN_FONT}`; g.textAlign = 'center'; g.fillText(String(n), w / 2, 190); g.font = `bold 40px ${TX.JP_FONT}`; g.fillText('号倉庫', w / 2, 245); }), 1.0);
    const doorT = TX.canvasTex(64, 128, (g, w, h) => { g.fillStyle = '#7c8086'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 4) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y, w, 1); } }, { repeat: true });
    const sodHead = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.1, 1.1) });
    let wn = 1;
    function warehouse(z0, z1, depth, h, col) {
      const x0 = HB.x0, x1 = x0 + depth, L = z1 - z0, zc = (z0 + z1) / 2, xc = (x0 + x1) / 2;
      const wallA = corr(L / 2.5, h / 2.5, col), wallB = corr(depth / 2.5, h / 2.5, col);
      const m = mesh(box(depth, h, L), [wallA, wallA, K.roofMat, K.roofMat, wallB, wallB], xc, h / 2, zc);
      K.blockers.push(m); collide(x0, x1, z0, z1);
      // gable roof along x, eaves overhanging the road side
      const rise = 2.2, roofM = corr(L / 2.5, 6, 0x6c7075);
      for (const s of [-1, 1]) {
        const g = new THREE.PlaneGeometry(depth + 1.2, Math.hypot(L / 2, rise) + 0.5).rotateX(-Math.PI / 2);
        const r = mesh(g, roofM, xc, h + rise / 2, zc + s * L / 4); r.rotation.x = -s * Math.atan2(rise, L / 2); r.material = roofM;
      }
      const gab = new THREE.Shape(); gab.moveTo(z0 - zc, 0); gab.lineTo(z1 - zc, 0); gab.lineTo(0, rise); gab.closePath();
      for (const x of [x0 + 0.01, x1 - 0.01]) { const gm = mesh(new THREE.ShapeGeometry(gab), wallB, x, h, zc); gm.rotation.y = -Math.PI / 2; gm.material = std(col, { roughness: 0.7, side: THREE.DoubleSide }); }
      // the number on the road face, the company name
      const nm = mesh(new THREE.PlaneGeometry(5, 5), num(wn++, '#f2efe6'), x0 - 0.04, h - 3.2, zc + L * 0.25); nm.rotation.y = -Math.PI / 2;
      const nn = mesh(new THREE.PlaneGeometry(Math.min(L * 0.45, 14), 1.4), basic(TX.signH('星見ロジスティクス HOSHIMI LOGISTICS', '#1b2a3a', '#ffffff'), 1.1), x0 - 0.04, h - 3.0, zc - L * 0.18); nn.rotation.y = -Math.PI / 2;
      // roller doors
      for (let z = z0 + 5; z < z1 - 3; z += 9) {
        const dt = doorT.clone(); dt.repeat.set(1, 2); dt.needsUpdate = true;
        const dm = mesh(new THREE.PlaneGeometry(4.2, 4.6), new THREE.MeshStandardMaterial({ map: dt, roughness: 0.5, metalness: 0.5 }), x0 - 0.03, 2.3, z); dm.rotation.y = -Math.PI / 2;
        batch(box(0.3, 0.3, 4.6), std(0x3a3d42, { roughness: 0.5, metalness: 0.6 }), x0 - 0.15, 4.75, z);
        batch(box(0.5, 0.12, 0.3), steelMat, x0 - 0.25, 5.6, z); batch(new THREE.PlaneGeometry(0.4, 0.22).rotateX(Math.PI / 2), sodHead, x0 - 0.45, 5.53, z);
        glowPool(x0 - 2.2, 0.17, z, 5, 6, 0xffb062, 0.32);
        if (rn() < 0.5) lampSpots.push(spot(x0 - 0.6, 5.4, z, { c: 0xffb062, k: 12, d: 10 }));
      }
    }
    warehouse(46, 74, 28, 12, 0x8a8f96); warehouse(78, 101, 26, 11, 0xa59a86);
    // ---------- south of the canal: more of the port along the ramp, offices and flats on the town side ----------
    // (the railway at z −66 and the viaduct at z −154 keep their corridors)
    for (const [z0, z1, d, h, c] of [[2, 38, 30, 13, 0x7f8a94], [-44, -6, 26, 12, 0x9a8f7c], [-128, -84, 30, 14, 0x6f7f8c], [-140, -132, 22, 10, 0xa0968a], [-232, -172, 32, 13, 0x8a8f96]]) warehouse(z0, z1, d, h, c);
    // container stacks between them, on aprons, under the yard lamps
    {
      const ribT = TX.canvasTex(128, 64, (g, w, h) => { g.fillStyle = '#bdbdbd'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 6) { g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x, 0, 2, h); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x + 3, 0, 1, h); } }, { repeat: true });
      const cm = new THREE.MeshStandardMaterial({ map: ribT, roughness: 0.6, metalness: 0.3 });
      const CC = [0xb3261e, 0x1f4f8a, 0x2e7d4f, 0xd9822b, 0x8a8f96, 0x5c3a7a, 0xc9b13a, 0x1d6f7a];
      const slots = [];
      for (const [z0, z1] of [[-160 + 0, -146 + 0], [-166, -160], [-60, -48], [-80, -72], [-250, -238]]) {
        if (z1 - z0 < 3) continue;
        for (let z = z0 + 1.6; z < z1 - 1; z += 2.8) for (let x = 131; x < 168; x += 12.8) { const n = 1 + Math.floor(rn() * 3); for (let k = 0; k < n; k++) slots.push([x + 6.1, 1.3 + k * 2.6, z]); }
      }
      const okSlot = slots.filter(([, , z]) => !(z > -164 && z < -144) && !(z > -72 && z < -60));
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(12.2, 2.59, 2.44), cm, okSlot.length);
      okSlot.forEach(([x, y, z], i) => { tmpM.makeTranslation(x, y, z); im.setMatrixAt(i, tmpM); im.setColorAt(i, new THREE.Color(CC[Math.floor(rn() * CC.length)])); });
      im.castShadow = im.receiveShadow = true; scene.add(im);
    }
    // a service road along the ramp's east side, poles with sodium lamps all the way down
    {
      const z0 = -250, z1 = NORTH.harbour.z0, L = z1 - z0;
      flatM(2.6, L, 125.3, (z0 + z1) / 2, asph(0.7, L / 4), 0.004).receiveShadow = true;
      for (let z = z1 - 12; z > z0 + 4; z -= 22) { if (Math.abs(z + 66) < 8 || (z > -162 && z < -146)) continue; utilityPole(125.5, z, true, -1); }
    }
    // the town side, between the old town's east blocks and the canal line: offices and flats, windows lit
    for (let z = 30; z > -238; z -= 15) {
      if (z < -56 && z > -78) continue;          // the railway
      if (z < -140 && z > -168) continue;        // the viaduct
      const h = 15 + Math.floor(rn() * 6) * 3;
      filler(73, 94, z - 13, z, h, [0]);
    }
    warehouse(129, 157, 28, 13, 0x6f8094); warehouse(205, 233, 27, 12, 0x8f8a7c);

    // the container yard between: stacks of 20 ft and 40 ft boxes in a dozen liveries
    const ribT = TX.canvasTex(128, 64, (g, w, h) => { g.fillStyle = '#bdbdbd'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 6) { g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x, 0, 2, h); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x + 3, 0, 1, h); } g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3); }, { repeat: true });
    const contM = new THREE.MeshStandardMaterial({ map: ribT, roughness: 0.6, metalness: 0.3 });
    const CC = [0xb3261e, 0x1f4f8a, 0x2e7d4f, 0xd9822b, 0x8a8f96, 0x5c3a7a, 0xc9b13a, 0x1d6f7a, 0x7a2a2a, 0xe0e0e0];
    const slots = [];
    const yard = { x0: HB.x0 + 2, x1: HB.quay - 8, z0: 161, z1: 201 };
    for (let z = yard.z0; z < yard.z1; z += 3.2) {
      if (Math.abs(z - 181) < 2) continue;                       // the lane the gantries run down
      for (let x = yard.x0; x < yard.x1 - 6; x += 13) {
        const n = 1 + Math.floor(rn() * 4);
        for (let k = 0; k < n; k++) slots.push({ x: x + 6.1, y: 1.3 + k * 2.6, z, long: rn() < 0.55 });
      }
    }
    for (const long of [false, true]) {
      const list = slots.filter((s) => s.long === long);
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(long ? 12.2 : 6.06, 2.59, 2.44), contM, list.length);
      list.forEach((s, i) => { tmpM.makeTranslation(s.x + (long ? 0 : (rn() < 0.5 ? -3.05 : 3.05)), s.y, s.z); im.setMatrixAt(i, tmpM); im.setColorAt(i, new THREE.Color(CC[Math.floor(rn() * CC.length)])); });
      im.castShadow = im.receiveShadow = true; scene.add(im);
    }
    collide(yard.x0, yard.x1, yard.z0 - 1.5, 179.5); collide(yard.x0, yard.x1, 182.5, yard.z1 + 1.5);
    pave(HB.x0, HB.quay, 158, 204);
    WALK.push({ minX: HB.x0, maxX: HB.quay - 0.5, minZ: 179.6, maxZ: 182.4 });
    DRIVE.push({ minX: HB.x0, maxX: HB.quay - 0.5, minZ: 179.6, maxZ: 182.4 });
    // rubber-tyred gantries straddling the stacks, yellow, lamps underneath
    const yel = std(0xe0a81c, { roughness: 0.5, metalness: 0.5 });
    for (const x of [140, 160]) {
      const z0 = yard.z0 - 2.5, z1 = yard.z1 + 2.5, hh = 19;
      for (const z of [z0, z1]) {
        for (const dx of [-3.5, 3.5]) batch(box(0.9, hh, 0.9), yel, x + dx, hh / 2, z);
        batch(box(8, 1.2, 1.2), yel, x, hh, z); batch(box(8, 0.8, 1.6), yel, x, 0.6, z);
      }
      for (const dx of [-3.5, 3.5]) batch(box(1.0, 1.4, z1 - z0), yel, x + dx, hh + 0.4, (z0 + z1) / 2);
      batch(box(4, 2.4, 3), std(0x3a3d42), x, hh - 1.6, 181);
      lampSpots.push(spot(x, hh - 2, 181, { c: 0xfff0d8, k: 30, d: 26 }));
      glowPool(x, 0.17, 181, 10, 30, 0xfff0d8, 0.25);
      { const b = mesh(new THREE.SphereGeometry(0.4, 8, 6), beaconMat, x, hh + 1.6, (z0 + z1) / 2); b.userData.dynamic = true; }
    }

    // the sea: past the quay wall, open water to the haze; ship-to-shore cranes along the edge, a ship alongside
    { const m = flatM(260, 700, HB.quay + 130, 60, waterMat, CN.y - 0.2); m.receiveShadow = false; }
    mesh(box(1.2, 2.8, 560), quayM, HB.quay + 0.6, CN.y - 0.2 + 0.0, -10);
    mesh(box(1.5, 0.25, 560), coping, HB.quay + 0.75, 0.05, -10);
    // the quay apron in front of the cranes (the yard has its own paving)
    pave(156, HB.quay, 46, B.s - 0.2); pave(156, HB.quay, B.n + 0.2, 158); pave(156, HB.quay, 204, 236);
    pave(B.x1, HB.quay, B.s - 0.2, B.n + 0.2);
    WALK.push({ minX: 156.2, maxX: HB.quay - 0.4, minZ: 46, maxZ: 236 });
    collide(HB.quay - 0.3, HB.quay + 0.3, -290, 270);
    for (let z = 60; z < 236; z += 18) { batch(new THREE.CylinderGeometry(0.22, 0.28, 0.55, 12), std(0x1b1d20, { roughness: 0.5, metalness: 0.6 }), HB.quay - 0.8, 0.42, z); }
    const red = std(0xb8321e, { roughness: 0.5, metalness: 0.4 }), wht = std(0xdedcd6, { roughness: 0.5, metalness: 0.4 });
    const craneLights = [];
    // the story's crane operator can dim the floodlights for the meteor shower (k: 1 on … 0 off)
    NORTH.dimCranes = (k) => { for (const c of craneLights) { c.sp.f = k; c.gp.material.color.copy(c.base).multiplyScalar(k); } };
    for (const z of [96, 140]) {
      const x = HB.quay - 10, H1 = 42;
      for (const [dx, dz] of [[-8, -9], [8, -9], [-8, 9], [8, 9]]) batch(box(1.3, H1, 1.3), (dz > 0 ? red : wht), x + dx, H1 / 2, z + dz);
      for (const dz of [-9, 9]) batch(box(17, 1.6, 1.6), red, x, H1, z + dz);
      batch(box(1.8, 2, 20), red, x - 8, H1 + 0.6, z); batch(box(1.8, 2, 20), red, x + 8, H1 + 0.6, z);
      // the boom out over the water and the backreach, the A-frame on top
      batch(box(70, 2.2, 3), wht, x + 20, H1 + 3.5, z);
      batch(box(1, 18, 1), red, x + 2, H1 + 12, z - 1.6); batch(box(1, 18, 1), red, x + 2, H1 + 12, z + 1.6);
      for (const s of [-1, 1]) batch(new THREE.CylinderGeometry(0.08, 0.08, Math.hypot(38, 16), 6).rotateZ(-s * Math.atan2(38, 16) + (s > 0 ? Math.PI : 0)), steelMat, x + 2 + s * 19, H1 + 12.5, z);
      batch(box(5, 3, 4), wht, x + 6, H1 + 1, z);
      for (const [bx, by] of [[x + 2, H1 + 21.2], [x + 56, H1 + 4.8], [x - 12, H1 + 4.8]]) { const b = mesh(new THREE.SphereGeometry(0.5, 8, 6), beaconMat, bx, by, z); b.userData.dynamic = true; }
      const csp = spot(x, H1 - 2, z, { c: 0xfff0d8, k: 34, d: 44 }); lampSpots.push(csp);
      const cgp = glowPool(x, 0.17, z, 18, 22, 0xfff0d8, 0.22); cgp.userData.dynamic = true;
      craneLights.push({ sp: csp, gp: cgp, base: cgp.material.color.clone() });
      collide(x - 8.7, x - 7.3, z - 9.7, z - 8.3); collide(x + 7.3, x + 8.7, z - 9.7, z - 8.3); collide(x - 8.7, x - 7.3, z + 8.3, z + 9.7); collide(x + 7.3, x + 8.7, z + 8.3, z + 9.7);
    }
    // a container ship alongside: hull, accommodation block with lit windows, a funnel, boxes on deck
    {
      const sx = HB.quay + 14, sz = 118, L = 130, Wd = 22;
      const hullM = std(0x1d2a3a, { roughness: 0.6, metalness: 0.3 }), redB = std(0x7a1f1a, { roughness: 0.7 });
      const g = new THREE.Group(); g.position.set(sx, CN.y - 0.2, sz); g.userData.static = true; scene.add(g);
      const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
      add(box(Wd, 3, L), redB, 0, -1.5, 0); add(box(Wd, 9, L - 10), hullM, 0, 4.5, -5);
      add(new THREE.ConeGeometry(Wd / 2, 18, 4, 1).rotateX(Math.PI / 2).rotateZ(Math.PI / 4).scale(1, 0.5, 1), hullM, 0, 4.5, L / 2 + 4);
      const accT = TX.windows(8, 6, '#e8e6e0', rn, 'office');
      const acc = new THREE.MeshStandardMaterial({ map: accT.map, emissive: 0xffffff, emissiveMap: accT.emissiveMap, emissiveIntensity: 0.9, roughness: 0.6 });
      add(box(Wd - 2, 16, 12), acc, 0, 17, -L / 2 + 12);
      add(box(4, 9, 5), std(0x2a2a2a), 0, 29, -L / 2 + 8);
      add(box(4.2, 1.6, 5.2), redB, 0, 32, -L / 2 + 8);
      const cm = new THREE.InstancedMesh(new THREE.BoxGeometry(2.44, 2.59, 12.2), contM, 160);
      let i = 0;
      for (let z = -L / 2 + 22; z < L / 2 - 10 && i < 160; z += 12.8) for (let x = -Wd / 2 + 1.6; x < Wd / 2 - 1.2 && i < 160; x += 2.6) {
        const n = 1 + Math.floor(rn() * 4);
        for (let k = 0; k < n && i < 160; k++, i++) { tmpM.makeTranslation(x, 10.3 + k * 2.6, z); cm.setMatrixAt(i, tmpM); cm.setColorAt(i, new THREE.Color(CC[Math.floor(rn() * CC.length)])); }
      }
      cm.count = i; g.add(cm);
      for (const z of [-L / 2 + 2, L / 2 + 10]) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 2.6) })); b.position.set(0, 14, z); g.add(b); }
      lampSpots.push(spot(sx, 20, sz - L / 2 + 14, { c: 0xfff0d8, k: 20, d: 30 }));
    }
  }

  // ---------- people the story and the new jobs need (quests.js talks to them) ----------
  {
    const who = (id, x, y, z, ry, color, act = 'idle') => {
      K.person(x, z, ry, color, y, 1.62, act);
      K.colliders.push({ minX: x - 0.25, maxX: x + 0.25, minZ: z - 0.25, maxZ: z + 0.25, ...(y > 1 ? { minY: y - 1, maxY: y + 2 } : {}), active: () => !NORTH.npcs[id]?.slot?.off });
      NORTH.npcs[id] = { x, y, z, ry, slot: K.npcSlots[K.npcSlots.length - 1], talk: { x: x + Math.sin(ry) * 0.9, y, z: z + Math.cos(ry) * 0.9 } };
    };
    NORTH.npcs = {};
    who('hoshino', 5.6, 0.15, 149.5, -Math.PI / 2, 0x5a4a6a);                       // the astronomer, by the star
    who('hoshinoDeck', -6, NORTH.sky.deckY, 165.6, 0, 0x5a4a6a);                    // and later up on the Sky Deck
    who('crane', 157.2, 0.15, 126.5, -Math.PI / 2, 0x2f5a8a);                        // the crane operator
    who('dispatcher', HB.x0 - 0.9, 0.15, 52, -Math.PI / 2, 0x6a5a2a, 'talk');       // Hoshimi Logistics' night desk
    who('passenger', -10, 0.15, 125.2, Math.PI, 0x2a2d35, 'text');                  // waiting for a cab on the boulevard
  }

  K.flushWires();

  return { NORTH };
}
