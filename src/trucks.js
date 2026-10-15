// Working vehicles of a Japanese street: a 2-ton cab-over box truck (flat-faced cab, dual rear wheels, ribbed
// aluminium box with a company livery and rear doors) and a boxy kei van (sliding door, roof rack). Built like
// cars.js (faces +z, wheels on the ground at y = 0) and with the same userData the traffic and the parking use:
// { L, W, R, wheels, head, tail, amber } — amber blinks as hazards when parked.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { wheel, plateTexture } from './cars.js';
import { armourMaps } from './metaltex.js';
import { JP_FONT, LATIN_FONT, phoneSize } from './textures.js';

export const LIVERY = [
  { name: 'ほし急便', sub: 'HOSHI EXPRESS', c1: '#1a5fbf', c2: '#ffffff', stripe: '#f2c400' },
  { name: '雨夜運輸', sub: 'AMEYORU LOGISTICS', c1: '#1f7a4a', c2: '#ffffff', stripe: '#ffffff' },
  { name: 'つきの冷凍', sub: 'TSUKINO COLD CHAIN', c1: '#ffffff', c2: '#c8102e', stripe: '#c8102e' },
  { name: 'ほしマート', sub: 'HOSHI MART 24H', c1: '#ffffff', c2: '#2a8f4e', stripe: '#e8541e' },
];
export const liveryTex = (L) => {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 384; const g = c.getContext('2d');
  g.fillStyle = L.c1; g.fillRect(0, 0, 1024, 384);
  // the box's ribs show as soft vertical bands
  for (let x = 0; x < 1024; x += 64) { g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(x, 0, 6, 384); g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x + 6, 0, 3, 384); }
  g.fillStyle = L.stripe; g.fillRect(0, 300, 1024, 26);
  g.fillStyle = L.c2; g.font = `900 120px ${JP_FONT}`; g.textBaseline = 'middle'; g.fillText(L.name, 60, 150);
  g.font = `700 40px ${LATIN_FONT}`; g.fillText(L.sub, 64, 245);
  // a little grime along the bottom
  const gr = g.createLinearGradient(0, 320, 0, 384); gr.addColorStop(0, 'rgba(60,55,45,0)'); gr.addColorStop(1, 'rgba(60,55,45,0.35)'); g.fillStyle = gr; g.fillRect(0, 320, 1024, 64);
  const t = new THREE.CanvasTexture(phoneSize(c)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
};

function common(color) {
  const A = armourMaps(41);
  return {
    paint: new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, metalness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.12 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0b1018, metalness: 0.85, roughness: 0.1 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x18191c, roughness: 0.6 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xcfd3d8, metalness: 1, roughness: 0.15 }),
    alu: new THREE.MeshStandardMaterial({ color: 0xc9cdd3, map: A.map, normalMap: A.normalMap, roughnessMap: A.roughnessMap, metalness: 0.8, roughness: 0.6 }),
    frame: new THREE.MeshStandardMaterial({ color: 0x1b1c20, roughness: 0.7, metalness: 0.4 }),
    head: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.55, 0.52) }),
    tail: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.04, 0.03) }),
    amber: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.18, 0.02) }),
  };
}

export function buildTruck(scene, { color = 0xf2f2ee, livery = Math.floor(Math.random() * LIVERY.length) } = {}) {
  const M = common(color), g = new THREE.Group();
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  const rb = (w, h, d, r = 0.05) => new RoundedBoxGeometry(w, h, d, 3, r);
  const L = 6.1, W = 1.86, R = 0.38, fz = L / 2;
  // chassis rails, fuel tank, mudflaps
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.1, 0.2, L - 0.6), M.frame, s * 0.42, 0.55, -0.2);
  add(new THREE.CylinderGeometry(0.22, 0.22, 0.7, 20), M.chrome, -0.62, 0.55, 0.2, 0, 0, Math.PI / 2);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.4, 0.4, 0.02), M.trim, s * 0.75, 0.32, -fz + 0.25);
  // the cab: flat face, tall windscreen, a grille, bumper, steps, mirrors on stalks
  const cabZ = fz - 0.85;
  add(rb(W, 1.55, 1.6, 0.14), M.paint, 0, 1.38, cabZ);
  add(rb(W - 0.06, 0.78, 0.08, 0.04), M.glass, 0, 1.78, fz - 0.06, -0.12);
  for (const s of [-1, 1]) add(rb(0.04, 0.55, 0.9, 0.02), M.glass, s * (W / 2 + 0.005), 1.78, cabZ + 0.15);
  add(rb(W - 0.2, 0.3, 0.06, 0.02), M.trim, 0, 0.98, fz - 0.02);
  for (let k = 0; k < 4; k++) add(new THREE.BoxGeometry(W - 0.5, 0.025, 0.02), M.chrome, 0, 0.88 + k * 0.06, fz + 0.015);
  add(rb(W + 0.04, 0.22, 0.2, 0.05), M.trim, 0, 0.55, fz - 0.02);
  for (const s of [-1, 1]) {
    add(rb(0.34, 0.16, 0.06, 0.03), M.head, s * 0.66, 0.8, fz + 0.005);
    add(rb(0.12, 0.08, 0.05, 0.02), M.amber, s * 0.86, 0.66, fz + 0.005);
    add(new THREE.BoxGeometry(0.4, 0.05, 0.25), M.chrome, s * (W / 2 - 0.05), 0.45, cabZ + 0.4);
    add(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 8), M.chrome, s * (W / 2 + 0.2), 1.85, fz - 0.15, 0, 0, s * 0.6);
    add(rb(0.07, 0.36, 0.16, 0.02), M.trim, s * (W / 2 + 0.38), 1.72, fz - 0.15);
    add(new THREE.BoxGeometry(0.02, 0.95, 0.02), M.trim, s * (W / 2 + 0.002), 1.45, cabZ - 0.35);   // door seam
    add(new THREE.BoxGeometry(0.03, 0.03, 0.14), M.chrome, s * (W / 2 + 0.01), 1.35, cabZ - 0.2);  // handle
  }
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.5, 0.012, 0.02), M.trim, s * 0.36, 1.45, fz + 0.005, 0, 0, s * 0.35); // wipers
  // the box: aluminium, ribbed, with the livery on both sides and doors at the back
  const boxL = L - 1.85, boxZ = -fz + boxL / 2 + 0.05, boxH = 2.15;
  add(rb(W + 0.1, boxH, boxL, 0.05), M.alu, 0, 0.82 + boxH / 2, boxZ);
  const lv = new THREE.MeshStandardMaterial({ map: liveryTex(LIVERY[livery % LIVERY.length]), roughness: 0.45, metalness: 0.3 });
  for (const s of [-1, 1]) { const p = add(new THREE.PlaneGeometry(boxL - 0.2, boxH - 0.25), lv, s * (W / 2 + 0.056), 0.82 + boxH / 2, boxZ, 0, s * Math.PI / 2); p.castShadow = false; }
  for (let k = 0; k < 9; k++) for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.02, boxH, 0.04), M.alu, s * (W / 2 + 0.06), 0.82 + boxH / 2, -fz + 0.25 + k * (boxL - 0.3) / 8);
  add(new THREE.BoxGeometry(0.02, boxH - 0.1, 0.02), M.trim, 0, 0.82 + boxH / 2, -fz + 0.04);
  for (const s of [-1, 1]) for (const y of [1.3, 2.3]) add(new THREE.BoxGeometry(0.04, 0.03, 0.04), M.chrome, s * 0.12, y, -fz + 0.03);
  for (const s of [-1, 1]) { add(rb(0.12, 0.3, 0.05, 0.02), M.tail, s * 0.78, 0.62, -fz - 0.02).userData.tail = true; add(rb(0.1, 0.1, 0.05, 0.02), M.amber, s * 0.78, 0.42, -fz - 0.02); }
  for (let k = 0; k < 4; k++) for (const s of [-1, 1]) add(rb(0.05, 0.03, 0.08, 0.01), M.amber, s * (W / 2 + 0.06), 0.9, -fz + 0.6 + k * 1.1);
  const plate = new THREE.MeshStandardMaterial({ map: plateTexture('green'), roughness: 0.4 });
  add(new THREE.PlaneGeometry(0.33, 0.165), plate, 0, 0.45, fz + 0.09); add(new THREE.PlaneGeometry(0.33, 0.165), plate, 0, 0.6, -fz - 0.03, 0, Math.PI);
  // wheels: single at the front, doubled at the back
  const wheels = [];
  for (const [z, dual] of [[fz - 1.15, false], [-fz + 1.35, true]]) for (const s of [-1, 1]) {
    const w = wheel(R, 0.24); w.position.set(s * (W / 2 - 0.18), R, z); g.add(w); wheels.push(w);
    if (dual) { const w2 = wheel(R, 0.24); w2.position.set(s * (W / 2 - 0.44), R, z); g.add(w2); wheels.push(w2); }
  }
  g.userData = { dynamic: true, head: M.head, tail: M.tail, amber: M.amber, wheels, L, W, R, kind: 'truck' };
  scene.add(g);
  return g;
}

export function buildVan(scene, { color = 0xeef0f2, rack = Math.random() < 0.5 } = {}) {
  const M = common(color), g = new THREE.Group();
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  const rb = (w, h, d, r = 0.08) => new RoundedBoxGeometry(w, h, d, 3, r);
  const L = 3.4, W = 1.48, R = 0.3, fz = L / 2;
  // a tall box with a short nose
  add(rb(W, 1.42, L - 0.45, 0.12), M.paint, 0, 1.1, -0.2);
  add(rb(W, 0.7, 0.6, 0.1), M.paint, 0, 0.72, fz - 0.3);
  add(rb(W - 0.08, 0.62, 0.06, 0.04), M.glass, 0, 1.4, fz - 0.42, -0.35);
  for (const s of [-1, 1]) {
    add(rb(0.04, 0.5, 0.75, 0.03), M.glass, s * (W / 2 + 0.004), 1.45, fz - 0.95);
    add(rb(0.04, 0.48, 1.0, 0.03), M.glass, s * (W / 2 + 0.004), 1.45, -0.55);
    add(new THREE.BoxGeometry(0.02, 1.0, 0.02), M.trim, s * (W / 2 + 0.006), 1.0, fz - 1.4);      // sliding door seam
    add(new THREE.BoxGeometry(0.012, 0.02, 1.1), M.trim, s * (W / 2 + 0.008), 1.75, -0.5);        // its rail
    add(rb(0.3, 0.14, 0.05, 0.03), M.head, s * 0.5, 0.82, fz + 0.002);
    add(rb(0.09, 0.07, 0.05, 0.02), M.amber, s * 0.68, 0.7, fz + 0.002);
    add(rb(0.12, 0.38, 0.05, 0.02), M.tail, s * (W / 2 - 0.1), 0.95, -fz + 0.2).userData.tail = true;
    add(rb(0.06, 0.12, 0.14, 0.02), M.trim, s * (W / 2 + 0.07), 1.25, fz - 0.65);
  }
  add(rb(W - 0.3, 0.12, 0.05, 0.02), M.trim, 0, 0.62, fz + 0.005);
  add(rb(W + 0.02, 0.16, 0.12, 0.04), M.trim, 0, 0.42, fz - 0.03);
  add(rb(W + 0.02, 0.16, 0.12, 0.04), M.trim, 0, 0.42, -fz + 0.22);
  add(rb(W - 0.2, 0.6, 0.03, 0.03), M.glass, 0, 1.45, -fz + 0.24);
  if (rack) { for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.04, 0.04, L - 0.9), M.chrome, s * 0.6, 1.88, -0.2); for (let k = 0; k < 5; k++) add(new THREE.BoxGeometry(1.24, 0.03, 0.04), M.chrome, 0, 1.9, -1.2 + k * 0.45); }
  const plate = new THREE.MeshStandardMaterial({ map: plateTexture('kei'), roughness: 0.4 });
  add(new THREE.PlaneGeometry(0.33, 0.165), plate, 0, 0.55, fz + 0.03); add(new THREE.PlaneGeometry(0.33, 0.165), plate, 0, 0.6, -fz + 0.21, 0, Math.PI);
  const wheels = [];
  for (const z of [fz - 0.6, -fz + 0.65]) for (const s of [-1, 1]) { const w = wheel(R, 0.18); w.position.set(s * (W / 2 - 0.14), R, z); g.add(w); wheels.push(w); }
  g.userData = { dynamic: true, head: M.head, tail: M.tail, amber: M.amber, wheels, L, W, R, kind: 'van' };
  scene.add(g);
  return g;
}
