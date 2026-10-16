// Cars lofted from real-world proportions: a side silhouette, a plan-view width curve and a
// cross-section that narrows above the beltline. Front is +Z, rear is −Z, ground is y = 0.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { JP_FONT } from './textures.js';
import { DESY } from './desy.js';

// u runs 0 (rear bumper) → 1 (front bumper). Heights in metres.
export const CAR_SPECS = {
  // compact sedan, Corolla-sized
  sedan: {
    L: 4.63, W: 1.78, R: 0.32, wb: 2.70, axle: 0.04,
    top: [[0, 0.64], [0.03, 0.86], [0.1, 0.96], [0.19, 1.0], [0.27, 1.22], [0.36, 1.41], [0.47, 1.44], [0.57, 1.41], [0.66, 1.18], [0.72, 0.99], [0.82, 0.93], [0.94, 0.84], [1, 0.62]],
    belt: [[0, 0.9], [0.3, 0.97], [0.7, 0.95], [1, 0.84]],
    bot: [[0, 0.38], [0.05, 0.2], [0.94, 0.2], [1, 0.34]],
    wf: [[0, 0.84], [0.05, 0.95], [0.15, 1], [0.85, 1], [0.95, 0.94], [1, 0.82]],
    rf: 0.74, glass: [0.22, 0.7], pillars: [0.47], plate: 'white',
  },
  // supermini hatchback, Fit/Yaris-sized
  hatch: {
    L: 3.99, W: 1.70, R: 0.3, wb: 2.53, axle: 0.02,
    top: [[0, 0.78], [0.02, 1.0], [0.04, 1.3], [0.09, 1.47], [0.2, 1.52], [0.52, 1.53], [0.61, 1.44], [0.7, 1.15], [0.78, 0.99], [0.92, 0.89], [1, 0.66]],
    belt: [[0, 0.98], [0.5, 0.99], [1, 0.88]],
    bot: [[0, 0.42], [0.05, 0.2], [0.94, 0.2], [1, 0.34]],
    wf: [[0, 0.9], [0.06, 0.98], [0.9, 1], [1, 0.86]],
    rf: 0.78, glass: [0.04, 0.71], pillars: [0.27, 0.45], plate: 'white',
  },
  // tall kei wagon, N-BOX-sized (yellow kei plate)
  kei: {
    L: 3.395, W: 1.475, R: 0.28, wb: 2.52, axle: 0.0,
    top: [[0, 0.72], [0.012, 1.55], [0.04, 1.76], [0.08, 1.79], [0.7, 1.79], [0.8, 1.66], [0.87, 1.18], [0.93, 1.0], [1, 0.74]],
    belt: [[0, 1.02], [0.8, 1.03], [1, 0.92]],
    bot: [[0, 0.4], [0.04, 0.18], [0.95, 0.18], [1, 0.34]],
    wf: [[0, 0.93], [0.04, 0.99], [0.95, 1], [1, 0.9]],
    rf: 0.9, glass: [0.03, 0.86], pillars: [0.3, 0.6], plate: 'kei',
  },
  // tall-roof taxi, JPN Taxi-sized
  taxi: {
    L: 4.40, W: 1.695, R: 0.31, wb: 2.75, axle: 0.03,
    top: [[0, 0.8], [0.02, 1.0], [0.05, 1.45], [0.1, 1.68], [0.18, 1.74], [0.6, 1.75], [0.7, 1.52], [0.77, 1.12], [0.82, 1.02], [0.93, 0.94], [1, 0.7]],
    belt: [[0, 0.98], [0.6, 1.0], [1, 0.9]],
    bot: [[0, 0.4], [0.05, 0.2], [0.94, 0.2], [1, 0.34]],
    wf: [[0, 0.9], [0.05, 0.98], [0.9, 1], [1, 0.86]],
    rf: 0.8, glass: [0.06, 0.76], pillars: [0.33, 0.55], plate: 'green',
  },
};

const lerp = THREE.MathUtils.lerp, smooth = THREE.MathUtils.smoothstep;
function curve(keys, u) {
  if (u <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [u1, v1] = keys[i];
    if (u <= u1) {
      const [u0, v0] = keys[i - 1];
      const t = (u - u0) / (u1 - u0);
      return lerp(v0, v1, t * t * (3 - 2 * t));
    }
  }
  return keys[keys.length - 1][1];
}

function section(sp, u) {
  const z = (u - 0.5) * sp.L;
  const top = curve(sp.top, u);
  const belt = Math.min(curve(sp.belt, u), top - 0.04);
  const bot = curve(sp.bot, u);
  const hw = (sp.W / 2) * curve(sp.wf, u);
  const cabin = smooth(top - belt, 0.12, 0.45);
  const rw = hw * lerp(0.97, sp.rf, cabin);
  // raise the lower edge into a wheel arch around each axle
  let arch = bot;
  for (const az of [sp.wb / 2 + sp.axle, -sp.wb / 2 + sp.axle]) {
    const dz = z - az, r = sp.R + 0.07;
    if (Math.abs(dz) < r) arch = Math.max(arch, sp.R + Math.sqrt(r * r - dz * dz) * 0.92);
  }
  const sill = Math.max(bot + 0.16, arch + 0.03);
  const half = [
    [0, bot], [hw - 0.15, Math.max(bot, arch - 0.03)], [hw - 0.04, Math.max(bot + 0.05, arch)], [hw, sill],
    [hw, (sill + belt) / 2], [hw * 0.995, belt], [hw * 0.975, belt + 0.03],
    [rw + (hw * 0.975 - rw) * 0.35, belt + (top - belt) * 0.72], [rw, top - 0.035], [rw * 0.62, top], [0, top],
  ];
  const ring = half.slice();
  for (let i = half.length - 2; i >= 1; i--) ring.push([-half[i][0], half[i][1]]);
  return { z, top, belt, bot, hw, rw, arch, ring };
}

function bodyGeometry(sp) {
  const NS = 64;
  const secs = [];
  for (let i = 0; i <= NS; i++) secs.push(section(sp, i / NS));
  const RN = secs[0].ring.length;
  const pos = [];
  for (const s of secs) for (const [x, y] of s.ring) pos.push(x, y, s.z);
  const tris = [];
  for (let i = 0; i < NS; i++) for (let j = 0; j < RN; j++) {
    const a = i * RN + j, b = i * RN + ((j + 1) % RN), c = (i + 1) * RN + j, d = (i + 1) * RN + ((j + 1) % RN);
    tris.push([a, b, c], [b, d, c]);
  }
  // end caps with their own vertices so the bumpers keep a crisp edge
  for (const [si, front] of [[0, false], [NS, true]]) {
    const s = secs[si], base = pos.length / 3;
    let cx = 0, cy = 0;
    for (const [x, y] of s.ring) { pos.push(x, y, s.z); cy += y; }
    pos.push(cx, cy / RN, s.z);
    const cIdx = base + RN;
    for (let j = 0; j < RN; j++) {
      const p0 = base + j, p1 = base + ((j + 1) % RN);
      tris.push(front ? [cIdx, p0, p1] : [cIdx, p1, p0]);
    }
  }

  // sort triangles into paint / glass / black trim
  const P = (i) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  const groups = [[], [], []];
  const n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (const t of tris) {
    const A = P(t[0]), B = P(t[1]), C = P(t[2]);
    const cx = (A.x + B.x + C.x) / 3, cy = (A.y + B.y + C.y) / 3, cz = (A.z + B.z + C.z) / 3;
    n.crossVectors(e1.subVectors(B, A), e2.subVectors(C, A)).normalize();
    const u = cz / sp.L + 0.5;
    const s = section(sp, THREE.MathUtils.clamp(u, 0, 1));
    const slope = Math.abs(curve(sp.top, Math.min(1, u + 0.01)) - curve(sp.top, Math.max(0, u - 0.01))) / (0.02 * sp.L);
    let g = 0;
    const above = cy > s.belt + 0.035 && cy < s.top - 0.03;
    const inRange = u > sp.glass[0] && u < sp.glass[1];
    const pillar = sp.pillars.some((p) => Math.abs(u - p) < 0.016);
    const roof = n.y > 0.9;
    const edge = slope > 0.6 && Math.abs(cx) > s.rw * 0.88;
    if (above && inRange && !pillar && !roof && !edge) g = 1;
    else if (cy < Math.max(s.bot, s.arch) + 0.09 && Math.abs(n.z) < 0.9) g = 2;
    groups[g].push(...t);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const index = [];
  groups.forEach((list, gi) => { geo.addGroup(index.length, list.length, gi); index.push(...list); });
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

// ---------- parts ----------
// number plate: Japanese colours (white private, yellow kei, green commercial), reading DESY in Desy mode
// (desy.js), an ordinary number otherwise.
// aspect: width / height of the plate it goes on (2 for a Japanese plate, wider to cover a European one)
let plateN = 0;
export function plateTexture(kind, aspect = 2) {
  const c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 / aspect);
  const g = c.getContext('2d'), W = c.width, H = c.height;
  const bg = kind === 'kei' ? '#f2d21b' : kind === 'green' ? '#1f6b3a' : '#f4f4f0';
  const fg = kind === 'green' ? '#f4f4f0' : kind === 'kei' ? '#111' : '#1f6b3a';
  g.fillStyle = bg; g.beginPath(); g.roundRect(3, 3, W - 6, H - 6, H * 0.08); g.fill();
  g.strokeStyle = fg; g.lineWidth = Math.max(3, H * 0.025); g.beginPath(); g.roundRect(H * 0.06, H * 0.06, W - H * 0.12, H - H * 0.12, H * 0.06); g.stroke();
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  // small place name on top when there's room, the big letters under it
  const tall = aspect < 3;
  if (tall) { g.font = `700 ${Math.round(H * 0.2)}px ${JP_FONT}`; g.fillText('星見 500', W / 2, H * 0.24); }
  g.font = `900 ${Math.round(H * (tall ? 0.5 : 0.7))}px "Chakra Petch", ${JP_FONT}`;
  if (DESY) g.fillText('DESY', W / 2, tall ? H * 0.64 : H * 0.54, W * 0.86);
  else {
    // a kana for the class of car, then a four-figure number (a different one each time a plate is made)
    const n = 1000 + ((plateN++ * 3739 + 2467) % 9000), num = `${String(n).slice(0, 2)}-${String(n).slice(2)}`;
    const kana = kind === 'kei' ? 'あ' : kind === 'green' ? 'け' : 'さ';
    if (tall) { g.font = `700 ${Math.round(H * 0.26)}px ${JP_FONT}`; g.fillText(kana, W * 0.15, H * 0.66); g.font = `900 ${Math.round(H * 0.5)}px "Chakra Petch", ${JP_FONT}`; }
    g.fillText(num, tall ? W * 0.57 : W / 2, tall ? H * 0.64 : H * 0.54, W * 0.72);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

let rimTex = null;
function rimTexture() {
  if (rimTex) return rimTex;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#1a1b1e'; g.fillRect(0, 0, 256, 256);
  const gr = g.createRadialGradient(128, 128, 20, 128, 128, 128);
  gr.addColorStop(0, '#e2e5ea'); gr.addColorStop(0.8, '#a9aeb6'); gr.addColorStop(1, '#6d7178');
  g.fillStyle = gr;
  g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.arc(128, 128, 100, 0, Math.PI * 2, true); g.fill();
  for (let i = 0; i < 5; i++) {
    g.save(); g.translate(128, 128); g.rotate((i / 5) * Math.PI * 2);
    g.beginPath(); g.moveTo(-14, 18); g.lineTo(14, 18); g.lineTo(22, 104); g.lineTo(-22, 104); g.closePath(); g.fill();
    g.restore();
  }
  g.beginPath(); g.arc(128, 128, 30, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2a2c30'; g.beginPath(); g.arc(128, 128, 9, 0, Math.PI * 2); g.fill();
  rimTex = new THREE.CanvasTexture(c); rimTex.colorSpace = THREE.SRGBColorSpace;
  return rimTex;
}

export function wheel(R, w) {
  const g = new THREE.Group();
  // tyre: lathe a rounded profile around the axle
  const pts = [];
  const r0 = R * 0.66, sw = w / 2;
  pts.push(new THREE.Vector2(r0, -sw));
  for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + (i / 8) * Math.PI; pts.push(new THREE.Vector2(R - 0.05 + Math.cos(a) * 0.05, Math.sin(a) * sw)); }
  pts.push(new THREE.Vector2(r0, sw));
  const tyre = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.85 }));
  tyre.rotation.z = Math.PI / 2; g.add(tyre);
  const face = new THREE.MeshStandardMaterial({ map: rimTexture(), metalness: 0.8, roughness: 0.3 });
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r0, r0, w * 0.82, 24), [new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.7, roughness: 0.4 }), face, face]);
  rim.rotation.z = Math.PI / 2; g.add(rim);
  return g;
}

export function buildCar(type, color, scene) {
  const sp = CAR_SPECS[type];
  const car = new THREE.Group(); car.userData.dynamic = true;
  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.45, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0a0e14, metalness: 0.85, roughness: 0.12 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x18191c, roughness: 0.6 });
  const body = new THREE.Mesh(bodyGeometry(sp), [paint, glass, trim]);
  body.castShadow = true; body.receiveShadow = true;
  car.add(body);

  const add = (geo, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; car.add(m); return m; };
  const wheels = [];
  for (const az of [sp.wb / 2 + sp.axle, -sp.wb / 2 + sp.axle]) for (const s of [-1, 1]) {
    const w = wheel(sp.R, 0.19); w.position.set(s * (sp.W / 2 - 0.15), sp.R, az); car.add(w); wheels.push(w);
    // dark wheel-well liner behind the tyre
    const liner = new THREE.Mesh(new THREE.CylinderGeometry(sp.R + 0.07, sp.R + 0.07, 0.02, 20), trim);
    liner.rotation.z = Math.PI / 2; liner.position.set(s * (sp.W / 2 - 0.32), sp.R + 0.02, az); car.add(liner);
  }

  const head = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.55, 0.52) });
  const tail = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.04, 0.03) });
  const amber = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.18, 0.02) });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xcfd3d8, metalness: 1, roughness: 0.15 });
  const fr = section(sp, 0.985), rr = section(sp, 0.012);
  for (const s of [-1, 1]) {
    // headlights wrap round the front corners; tail lights round the rear
    const hy = Math.min(fr.top - 0.07, fr.belt - 0.04);
    add(new RoundedBoxGeometry(0.42, 0.13, 0.14, 2, 0.04), head, s * (fr.hw - 0.27), hy, fr.z + 0.02, s * 0.28);
    add(new RoundedBoxGeometry(0.1, 0.06, 0.12, 2, 0.02), amber, s * (fr.hw - 0.07), hy - 0.03, fr.z - 0.05, s * 0.7);
    const tl = type === 'kei' || type === 'hatch'
      ? add(new RoundedBoxGeometry(0.16, 0.42, 0.12, 2, 0.04), tail, s * (rr.hw - 0.11), rr.belt + 0.05, rr.z - 0.03)
      : add(new RoundedBoxGeometry(0.4, 0.14, 0.12, 2, 0.04), tail, s * (rr.hw - 0.25), Math.min(rr.top - 0.09, rr.belt), rr.z - 0.03, -s * 0.22);
    tl.userData.tail = true;
    add(new RoundedBoxGeometry(0.08, 0.05, 0.1, 2, 0.02), amber, s * (rr.hw - 0.08), Math.min(rr.top - 0.09, rr.belt) - 0.14, rr.z - 0.03);
    // mirrors near the A-pillar, door handles
    const mz = (sp.glass[1] - 0.5) * sp.L - 0.12, ms = section(sp, sp.glass[1] - 0.02);
    add(new RoundedBoxGeometry(0.2, 0.12, 0.09, 2, 0.03), paint, s * (ms.hw + 0.09), ms.belt + 0.1, mz);
    for (const p of sp.pillars) {
      const ds = section(sp, p - 0.06);
      add(new THREE.BoxGeometry(0.02, 0.03, 0.14), chrome, s * (ds.hw + 0.005), ds.belt - 0.07, ds.z);
    }
  }
  const lower = section(sp, 0.99);
  add(new RoundedBoxGeometry(fr.hw * 0.9, 0.14, 0.08, 2, 0.03), trim, 0, Math.min(fr.top - 0.1, fr.belt - 0.08), fr.z + 0.02);
  add(new RoundedBoxGeometry(lower.hw * 1.3, 0.12, 0.05, 2, 0.02), trim, 0, lower.bot + 0.12, lower.z + 0.02);
  const plateMat = new THREE.MeshStandardMaterial({ map: plateTexture(sp.plate), roughness: 0.4 });
  add(new THREE.PlaneGeometry(0.33, 0.165), plateMat, 0, lower.bot + 0.24, sp.L / 2 + 0.012);
  add(new THREE.PlaneGeometry(0.33, 0.165), plateMat, 0, rr.belt - 0.22, -sp.L / 2 - 0.012, Math.PI);

  if (type === 'taxi') {
    const c = document.createElement('canvas'); c.width = 256; c.height = 96;
    const g = c.getContext('2d');
    g.fillStyle = '#fff4d6'; g.fillRect(0, 0, 256, 96);
    g.fillStyle = '#1d2a5c'; g.font = `900 52px ${JP_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('TAXI', 128, 52);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const topS = section(sp, 0.4);
    add(new RoundedBoxGeometry(0.46, 0.18, 0.2, 2, 0.05), new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(1.6, 1.6, 1.5) }), 0, topS.top + 0.09, topS.z);
    const ws = section(sp, sp.glass[1] - 0.04);
    add(new THREE.BoxGeometry(0.28, 0.08, 0.02), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.25, 0.1) }), -0.4, ws.belt + 0.08, ws.z - 0.05);
  }

  car.userData = { dynamic: true, head, tail, amber, wheels, L: sp.L, W: sp.W, R: sp.R };
  scene.add(car);
  return car;
}
