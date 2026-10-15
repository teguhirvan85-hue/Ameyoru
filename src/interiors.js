// Real rooms behind the shop glass (barber, coin laundry, real estate office, capsule-toy shop) and the
// detailed capsule machine. Everything is placed in a shop-local frame: d = metres in from the glass,
// lz = metres along the frontage (positive = to the viewer's right when facing the shop), y = up.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasTex, JP_FONT, LATIN_FONT } from './textures.js';
import { place } from './furnish.js';

export const SHOP_H = 3.0, SHOP_DEPTH = 4.4;
const FLOOR = 0.158;

// interiors are self-lit a little, so a bright shop still reads as bright from the dark street
// scale for all the self-lighting below: tuned against bloom so white rooms don't blow out
const GLOW = 0.4;
const litCache = new Map();
// every self-lit material, so the glow can be turned down once you're inside and the real lights take over
const GLOWING = [];
const glowing = (m) => { m.userData.baseEI = m.emissiveIntensity; m.userData.mutable = true; GLOWING.push(m); return m; };
export function setInteriorGlow(k) { for (const m of GLOWING) m.emissiveIntensity = m.userData.baseEI * k; }
// a photo-scanned surface (S.surf) for inside a shop: it glows a little like the rest, so a lit shop reads from the street
// u, v: how many times the texture repeats; tint: colour multiplier
export function inSurf(S, name, u, v, { tint = 0xffffff, k = 0.25, rough = null } = {}) {
  const base = S.surf?.(name, u, v, { color: tint, wet: rough ?? 1, metal: false });
  if (!base?.map) return lit(tint, 0.3);
  const m = base.clone();
  m.emissive = new THREE.Color(tint); m.emissiveMap = base.map; m.emissiveIntensity = k * GLOW * 2;
  return glowing(m);
}
export const lit = (hex, k = 0.4, o = {}) => {
  const key = `${hex}|${k}|${JSON.stringify(o)}`;
  if (!litCache.has(key)) {
    const c = new THREE.Color(hex);
    litCache.set(key, glowing(new THREE.MeshStandardMaterial({ color: c, emissive: c.clone().multiplyScalar(k * GLOW), roughness: 0.6, ...o })));
  }
  return litCache.get(key);
};
export const litMap = (map, k = 0.5, o = {}) => glowing(new THREE.MeshStandardMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: k * GLOW, roughness: 0.6, ...o }));
// emissive that follows per-instance colour (InstancedMesh.setColorAt), for small lit products
export function instLit(k = 0.3, o = {}) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: k, roughness: 0.35, ...o });
  m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = emissive * vColor;'); };
  return glowing(m);
}

const txt = (g, s, x, y, size, color, font = JP_FONT, weight = 900, align = 'center') => {
  g.fillStyle = color; g.font = `${weight} ${size}px ${font}`; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(s, x, y);
};
const tiles = (a, b, n, grout, size) => { const t = canvasTex(128, 128, (g, w, h) => {
  const s = w / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { g.fillStyle = (x + y) % 2 ? a : b; g.fillRect(x * s, y * s, s, s); }
  if (grout) { g.fillStyle = grout; for (let i = 0; i <= n; i++) { g.fillRect(i * s - 1, 0, 2, h); g.fillRect(0, i * s - 1, w, 2); } }
}, { repeat: true }); t.repeat.set(SHOP_DEPTH / size, 10 / size); return t; };

// ---------- shop-local frame ----------
export function frame(S, side, z0, z1) {
  const L = S.LINE, cz = (z0 + z1) / 2, flip = side < 0 ? Math.PI : 0, w = z1 - z0;
  const wx = (d) => side * (L + d), wz = (lz) => cz + side * lz;
  const b = (geo, mat, d, y, lz, rot = 0) => S.batch(geo, mat, wx(d), y, wz(lz), rot + flip);
  const m = (geo, mat, d, y, lz, rot = 0) => { const o = S.mesh(geo, mat, wx(d), y, wz(lz)); o.rotation.y = rot + flip; return o; };
  // parts of one object, given in that object's own frame (its front faces local −x when rot = 0)
  const obj = (d, lz, rot = 0, single = false) => {
    const c = Math.cos(rot), s = Math.sin(rot);
    return (geo, mat, ox, oy, oz, r2 = 0) => (single ? m : b)(geo, mat, d + ox * c + oz * s, oy, lz - ox * s + oz * c, rot + r2);
  };
  const person = (d, lz, rot, color, y0 = FLOOR, h = 1.65, act = null) => S.person(wx(d), wz(lz), rot + flip + Math.PI / 2, color, y0, h, act);
  // a place for someone (npcs.js): x, z from shop-local d, lz
  const npc = (slot) => S.npcSlots?.push(slot);
  // furniture you bump into
  const solid = (d0, d1, lz0, lz1) => S.collide(Math.min(wx(d0), wx(d1)), Math.max(wx(d0), wx(d1)), Math.min(wz(lz0), wz(lz1)), Math.max(wz(lz0), wz(lz1)));
  // a seat: you face local direction rot (0 = towards the street) and get up at (od, olz)
  const yawOf = (rot) => Math.atan2(side * -Math.cos(rot), side * Math.sin(rot));
  const seat = (d, lz, rot, y, od, olz, extra = {}) => S.interactables.push({
    pos: new THREE.Vector3(wx(od), 0, wz(olz)), r: 0.75, label: extra.label ?? 'Sit',
    sit: { x: wx(d), z: wz(lz), y, yaw: yawOf(rot), out: { x: wx(od), z: wz(olz), y: FLOOR } }, onSit: extra.onSit,
  });
  // something to use: label, and action(api) that may return dialog lines
  const act = (d, lz, label, action, r = 1.1) => { const it = { pos: new THREE.Vector3(wx(d), 0, wz(lz)), r, label, action }; S.interactables.push(it); return it; };
  // a real model (Poly Haven, furnish.js) at d, lz; rot as for obj() (0 = its front towards the street)
  const model = (name, d, y, lz, rot = 0, o) => place(S.scene, name, wx(d), y, wz(lz), rot + flip - Math.PI / 2, o);
  return { side, L, cz, w, hw: w / 2 - 0.12, wx, wz, b, m, obj, person, flip, solid, seat, act, yawOf, model, npc };
}

// floor, walls, ceiling with light panels, and a borrowable light inside
// floorTex / wallTex / ceilTex: [surface name, metres per repeat, tint] to use a photo-scanned surface instead
export function room(S, F, { floor, wall, ceil = lit(0xd8d8d4, 0.4), panel = 1.5, light = 0xffffff, k = 14, floorTex, wallTex, ceilTex }) {
  const D = SHOP_DEPTH, H = SHOP_H - 0.06, W = F.w - 0.16;
  // ceilings with light panels are the office kind: acoustic tiles
  if (!ceilTex && panel > 0) ceilTex = ['ceiling_interior', 1.2, 0xe8e8e4];
  const tex = (t, u, v) => inSurf(S, t[0], u / t[1], v / t[1], { tint: t[2] ?? 0xffffff });
  if (floorTex) floor = tex(floorTex, D, W);
  if (ceilTex) ceil = tex(ceilTex, D, W);
  const wallBack = wallTex ? tex(wallTex, W, H) : wall, wallSide = wallTex ? tex(wallTex, D, H) : wall;
  F.b(new THREE.PlaneGeometry(D, W).rotateX(-Math.PI / 2), floor, D / 2, FLOOR, 0);
  F.b(new THREE.BoxGeometry(0.1, H, W), wallBack, D + 0.05, H / 2, 0);
  for (const s of [-1, 1]) F.b(new THREE.BoxGeometry(D, H, 0.1), wallSide, D / 2, H / 2, s * (W / 2 + 0.05));
  F.b(new THREE.PlaneGeometry(D, W).rotateX(Math.PI / 2), ceil, D / 2, H, 0);
  const pm = new THREE.MeshBasicMaterial({ color: new THREE.Color(panel, panel, panel * 0.98) });
  if (panel > 0) for (let d = 0.9; d < D - 0.3; d += 1.4) for (let z = -W / 2 + 0.8; z < W / 2 - 0.4; z += 1.6) F.b(new THREE.BoxGeometry(0.5, 0.03, 1.2), pm, d, H - 0.02, z);
  S.light?.(F.wx(1.6), 2.5, F.cz, light, k * 0.28, 7);
  return { D, H, W };
}

// ---------- capsule-toy machine (two stacked units), front facing local −x ----------
const G = {};
function gachaMats() {
  if (G.ready) return G;
  G.cols = ['#e84a5f', '#2a9df4', '#f5b700', '#3dbb6c', '#9b59d0', '#f2f2f2', '#ff7a2f', '#22b8b0'];
  G.body = G.cols.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.3, metalness: 0.1, emissive: new THREE.Color(c).multiplyScalar(0.07) }));
  G.front = G.cols.map((c) => litMap(canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = c; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(0, 0, w, 8);
    // price plate, coin slot, return lever and the capsule door
    g.fillStyle = '#fff'; g.beginPath(); g.roundRect(10, 14, 108, 26, 6); g.fill();
    txt(g, '1回 300円', 64, 27, 17, '#d11');
    g.fillStyle = '#d7dbe0'; g.beginPath(); g.roundRect(22, 46, 84, 40, 8); g.fill();
    g.fillStyle = '#1a1a1e'; for (let i = 0; i < 3; i++) g.fillRect(34 + i * 10, 54, 4, 22);
    txt(g, '¥100', 86, 66, 13, '#333', LATIN_FONT, 700);
    g.fillStyle = '#26282d'; g.beginPath(); g.roundRect(36, 94, 56, 28, 6); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(40, 97, 48, 6);
  }), 0.55, { roughness: 0.35 }));
  G.chrome = new THREE.MeshStandardMaterial({ color: 0xe2e6ea, metalness: 0.95, roughness: 0.18 });
  G.dark = new THREE.MeshStandardMaterial({ color: 0x1a1b1f, roughness: 0.5 });
  G.glass = new THREE.MeshStandardMaterial({ color: 0xeef6ff, transparent: true, opacity: 0.08, roughness: 0.04, metalness: 0.1, depthWrite: false });
  G.backer = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.32, 0.34, 0.4) });
  const names = ['ネコ大集合', 'ロボ戦士', 'ミニ寿司', 'おばけ', '電車コレ', 'ハムスター', '宇宙人', 'カエル', 'パンダ', '恐竜', 'お菓子', '星見駅'];
  G.cards = litMap(canvasTex(1024, 384, (g) => {
    names.forEach((n, i) => {
      const x = (i % 4) * 256, y = Math.floor(i / 4) * 128, hue = (i * 47) % 360;
      g.fillStyle = `hsl(${hue},80%,58%)`; g.fillRect(x, y, 256, 128);
      g.fillStyle = '#fff'; g.beginPath(); g.roundRect(x + 8, y + 8, 240, 112, 12); g.fill();
      for (let k = 0; k < 4; k++) { g.fillStyle = `hsl(${(hue + k * 60) % 360},70%,60%)`; g.beginPath(); g.arc(x + 40 + k * 58, y + 82, 22, 0, Math.PI * 2); g.fill(); g.fillStyle = '#222'; g.fillRect(x + 32 + k * 58, y + 76, 4, 4); g.fillRect(x + 44 + k * 58, y + 76, 4, 4); }
      txt(g, n, x + 128, y + 34, 30, `hsl(${hue},70%,35%)`);
      g.fillStyle = '#d11'; g.beginPath(); g.arc(x + 226, y + 24, 16, 0, Math.PI * 2); g.fill(); txt(g, '全6種', x + 226, y + 25, 9, '#fff');
    });
  }), 0.7);
  G.cardGeo = (cell) => {
    const g = new THREE.PlaneGeometry(0.42, 0.2).rotateY(-Math.PI / 2), uv = g.attributes.uv;
    const cu = (cell % 4) / 4, cv = 1 - (Math.floor(cell / 4) + 1) / 3;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, cu + uv.getX(i) / 4, cv + uv.getY(i) / 3);
    return g;
  };
  G.geo = {
    bodyR: new RoundedBoxGeometry(0.42, 0.52, 0.45, 2, 0.025),
    body: new THREE.BoxGeometry(0.42, 0.52, 0.45),
    front: new THREE.PlaneGeometry(0.43, 0.43).rotateY(-Math.PI / 2),
    knob: new THREE.CylinderGeometry(0.065, 0.065, 0.035, 12).rotateZ(Math.PI / 2),
    grip: new THREE.BoxGeometry(0.03, 0.13, 0.03),
    globe: new THREE.BoxGeometry(0.4, 0.4, 0.42),
    post: new THREE.BoxGeometry(0.025, 0.42, 0.025),
    capR: new RoundedBoxGeometry(0.44, 0.05, 0.47, 1, 0.015),
    cap: new THREE.BoxGeometry(0.44, 0.05, 0.47),
    back: new THREE.PlaneGeometry(0.42, 0.38).rotateY(-Math.PI / 2),
    flap: new THREE.BoxGeometry(0.02, 0.1, 0.16),
  };
  G.capTop = new THREE.SphereGeometry(0.046, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  G.capBot = new THREE.SphereGeometry(0.046, 10, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  G.ready = true;
  return G;
}

// returns capsule positions so the caller can instance them in one go
// fine: rounded bodies (for the few out on the pavement); the many inside use plain boxes
export function gachaUnit(F, d, lz, rot, rnd, caps, tiers = 2, nCaps = 14, fine = false) {
  const M = gachaMats(), P = F.obj(d, lz, rot), geo = M.geo;
  const c = Math.cos(rot), s = Math.sin(rot);
  for (let t = 0; t < tiers; t++) {
    const ci = Math.floor(rnd() * M.cols.length), by = FLOOR + t * 0.98;
    P(fine ? geo.bodyR : geo.body, M.body[ci], 0, by + 0.26, 0);
    P(geo.front, M.front[ci], -0.227, by + 0.27, 0);
    P(geo.knob, M.chrome, -0.245, by + 0.33, 0.07);
    P(geo.grip, M.chrome, -0.268, by + 0.33, 0.07);
    P(geo.flap, M.dark, -0.232, by + 0.1, 0);
    // display case: chrome corner posts, glass, a printed backing card and a lid
    for (const [px, pz] of [[-0.19, -0.2], [-0.19, 0.2], [0.19, -0.2], [0.19, 0.2]]) P(geo.post, M.chrome, px, by + 0.73, pz);
    P(geo.globe, M.glass, 0, by + 0.73, 0);
    P(geo.back, M.backer, 0.19, by + 0.73, 0);
    P(fine ? geo.capR : geo.cap, M.body[ci], 0, by + 0.955, 0);
    P(G.cardGeo(Math.floor(rnd() * 12)), M.cards, -0.205, by + 0.84, 0);
    for (let k = 0; k < nCaps; k++) {
      const ox = (rnd() - 0.5) * 0.28, oz = (rnd() - 0.5) * 0.32, oy = by + 0.58 + Math.pow(rnd(), 1.5) * 0.26;
      caps.push({ x: F.wx(d + ox * c + oz * s), y: oy, z: F.wz(lz - ox * s + oz * c), h: rnd() });
    }
  }
}

// two-tone capsules (clear top, coloured bottom), all shops in a few instanced meshes
export function gachaCapsules(S, caps) {
  if (!caps.length) return;
  gachaMats();
  const top = new THREE.InstancedMesh(G.capTop, new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, roughness: 0.1, emissive: 0x444444 }), caps.length);
  const bot = new THREE.InstancedMesh(G.capBot, instLit(0.45, { roughness: 0.3 }), caps.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), col = new THREE.Color();
  caps.forEach((p, i) => {
    q.setFromEuler(e.set((p.h - 0.5) * 2, p.h * 6, (p.h * 7 % 1 - 0.5) * 2));
    m4.compose(v.set(p.x, p.y, p.z), q, one);
    top.setMatrixAt(i, m4); bot.setMatrixAt(i, m4);
    bot.setColorAt(i, col.setHSL(p.h, 0.85, 0.55));
  });
  S.scene.add(top, bot);
}

// one turn of a capsule machine: the capsule rolls out and goes into your collection
const PRIZES = [['Mini cat', 'ネコ大集合'], ['Silver robot', 'ロボ戦士'], ['Mini salmon sushi', 'ミニ寿司'], ['Cute ghost', 'おばけ'], ['Shinkansen train', '電車コレ'], ['Hamster', 'ハムスター'], ['Green alien', '宇宙人'], ['Frog', 'カエル'], ['Panda', 'パンダ'], ['Dinosaur', '恐竜']];
export function playGacha(api) {
  const [n, jp] = PRIZES[Math.floor(Math.random() * PRIZES.length)];
  api.sound.capsule();
  setTimeout(() => api.addItem(`Gacha: ${n}`), 600);
  const have = api.inv[`Gacha: ${n}`] || 0;
  return [{ who: 'ガチャ', text: `Click, click, click… a capsule drops. Inside: ${n} (${jp}).${have ? ' Another double.' : ' New!'}` }];
}

// ---------- capsule-toy shop: machines on every wall plus a back-to-back island ----------
export function gachaInterior(S, F, rnd, caps) {
  const R = room(S, F, { floor: lit(0xe4e2e8, 0.25, { roughness: 0.15 }), wall: lit(0xf0d8e6, 0.3), panel: 1.3, light: 0xfff0fa, k: 12 });
  const step = 0.47;
  // back wall
  const nb = Math.floor((R.W - 0.2) / step);
  for (let i = 0; i < nb; i++) gachaUnit(F, R.D - 0.25, -((nb - 1) * step) / 2 + i * step, 0, rnd, caps, 2, 10);
  // side walls, facing in
  const ns = Math.floor((R.D - 1.2) / step);
  for (const s of [-1, 1]) for (let i = 0; i < ns; i++) gachaUnit(F, 0.9 + i * step, s * (R.W / 2 - 0.25), s < 0 ? Math.PI / 2 : -Math.PI / 2, rnd, caps, 2, 10);
  // island, two rows back to back
  const ni = Math.max(0, Math.floor((R.W - 2.6) / step));
  for (let i = 0; i < ni; i++) {
    const z = -((ni - 1) * step) / 2 + i * step;
    gachaUnit(F, 2.1, z, 0, rnd, caps, 2, 10);
    gachaUnit(F, 2.57, z, Math.PI, rnd, caps, 2, 10);
  }
  // hanging header signs over the aisles
  const hdr = litMap(canvasTex(512, 96, (g, w, h) => { g.fillStyle = '#ff4fa0'; g.fillRect(0, 0, w, h); txt(g, 'NEW ARRIVAL 新作', w / 2, h / 2, 46, '#fff'); }), 0.9);
  F.b(new THREE.PlaneGeometry(1.6, 0.3).rotateY(-Math.PI / 2), hdr, 1.9, 2.55, 0);
  F.b(new THREE.BoxGeometry(0.01, 0.6, 0.01), G.chrome, 1.9, 2.75, -0.6);
  F.b(new THREE.BoxGeometry(0.01, 0.6, 0.01), G.chrome, 1.9, 2.75, 0.6);
  F.person(1.4, R.W / 2 - 1.1, -Math.PI / 2 + 0.3, 0x6a7fb0, FLOOR, 1.3);
  F.person(1.5, -0.4, 0.2, 0x3a3f4a);
  // the machine rows are solid; the island's front row takes your coins
  F.solid(R.D - 0.5, R.D + 0.1, -R.W / 2, R.W / 2);
  for (const s of [-1, 1]) F.solid(0.65, 0.9 + (ns - 1) * step + 0.25, s * (R.W / 2 - 0.5), s * R.W / 2);
  if (ni > 0) F.solid(1.86, 2.81, -((ni - 1) * step) / 2 - 0.25, ((ni - 1) * step) / 2 + 0.25);
  if (ni > 0) for (const lz of [-1.2, 0, 1.2]) F.act(1.55, lz, 'Spin the gacha ¥300', playGacha, 0.75);
}

// ---------- barber: chairs facing mirrors along the back wall ----------
export function barberInterior(S, F, rnd) {
  const wood = lit(0x8a5a36, 0.25, { roughness: 0.5 });
  const R = room(S, F, { floor: litMap(tiles('#f2f2f0', '#1c1c1e', 2, null, 0.6), 0.25, { roughness: 0.2 }), wall: lit(0xd6ebe6, 0.4), wallTex: ['plastered_wall', 1.6, 0xd6ebe6], light: 0xeaf6ff, k: 14 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xe8ecf0, metalness: 0.95, roughness: 0.15 });
  const leather = new THREE.MeshStandardMaterial({ color: 0x7a1820, roughness: 0.35, emissive: 0x2a0508 });
  const mirror = new THREE.MeshStandardMaterial({ color: 0xc9d6dc, metalness: 1, roughness: 0.04, emissive: 0x3a4850 });
  const n = Math.max(1, Math.min(3, Math.floor((R.W - 1.6) / 1.35)));
  const z0 = -((n - 1) * 1.35) / 2;
  const bottleCols = [0x2f8f5b, 0xd8a52b, 0x1d4fb8, 0xf2f2f2, 0xb3201a].map((c) => lit(c, 0.3, { roughness: 0.2 }));
  for (let i = 0; i < n; i++) {
    const lz = z0 + i * 1.35;
    // mirror with a frame, counter and cabinet
    F.b(new THREE.PlaneGeometry(0.95, 1.15).rotateY(-Math.PI / 2), mirror, R.D - 0.02, 1.6, lz);
    for (const s of [-1, 1]) F.b(new THREE.BoxGeometry(0.04, 1.22, 0.04), wood, R.D - 0.03, 1.6, lz + s * 0.5);
    F.b(new THREE.BoxGeometry(0.04, 0.04, 1.04), wood, R.D - 0.03, 2.21, lz);
    F.b(new THREE.BoxGeometry(0.38, 0.05, 1.15), lit(0xf3f3f3, 0.3, { roughness: 0.2 }), R.D - 0.19, 0.95, lz);
    F.b(new THREE.BoxGeometry(0.36, 0.78, 1.1), wood, R.D - 0.2, FLOOR + 0.39, lz);
    for (let k = 0; k < 4; k++) F.b(new THREE.CylinderGeometry(0.03, 0.035, 0.18 + rnd() * 0.08, 10), bottleCols[Math.floor(rnd() * bottleCols.length)], R.D - 0.12, 1.07, lz - 0.38 + k * 0.1);
    F.b(new THREE.BoxGeometry(0.18, 0.12, 0.26), lit(0x2b2e34, 0.15), R.D - 0.15, 1.04, lz + 0.32);
    // a real barber's chair facing the mirror
    const P = F.obj(R.D - 1.15, lz, Math.PI);
    F.model('BarberShopChair_01', R.D - 1.15, FLOOR, lz, Math.PI, { h: 1.3 });
    // a customer in a cape in the middle chair, and the barber behind
    if (i === Math.floor(n / 2)) {
      // the customer in the chair (a real character, see npcs.js)
      F.npc({ x: F.wx(R.D - 1.15), y: FLOOR, z: F.wz(lz), yaw: Math.PI + F.flip - Math.PI / 2, act: 'sit', seat: FLOOR + 0.52, h: 1.62, pins: [], pick: 3 });
      F.person(R.D - 1.75, lz + 0.25, 0, 0xf2f2f2);
    }
  }
  // waiting sofa by the glass, magazine rack, UV sterilizer, price board, clock and a plant
  const sofa = lit(0x2c3e50, 0.2, { roughness: 0.7 });
  const sz = -R.W / 2 + 0.35;
  F.model('Sofa_01', 1.25, FLOOR, sz - 0.05, Math.PI / 2, { s: 0.85 });
  F.b(new THREE.BoxGeometry(0.35, 0.7, 0.3), wood, 2.2, FLOOR + 0.35, sz - 0.05);
  F.b(new THREE.PlaneGeometry(0.3, 0.25).rotateX(-0.4), litMap(canvasTex(64, 64, (g, w, h) => { for (let i = 0; i < 4; i++) { g.fillStyle = `hsl(${i * 80},60%,55%)`; g.fillRect(i * 16, 0, 15, h); } }), 0.5), 2.2, FLOOR + 0.72, sz + 0.05);
  const uv = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 0.9, 2.4) });
  F.b(new THREE.BoxGeometry(0.4, 0.5, 0.3), lit(0xdfe3e8, 0.3), R.D - 0.6, 1.55, R.W / 2 - 0.17);
  F.b(new THREE.PlaneGeometry(0.3, 0.32).rotateY(Math.PI), uv, R.D - 0.6, 1.57, R.W / 2 - 0.33);
  const price = litMap(canvasTex(192, 256, (g, w, h) => {
    g.fillStyle = '#fbfaf5'; g.fillRect(0, 0, w, h); g.fillStyle = '#b3201a'; g.fillRect(0, 0, w, 40);
    txt(g, '料金表', w / 2, 21, 24, '#fff');
    [['カット', '3,800'], ['顔そり', '1,500'], ['シャンプー', '800'], ['学生', '2,800'], ['こども', '2,200']].forEach(([a, b], i) => { txt(g, a, 16, 70 + i * 38, 18, '#222', JP_FONT, 700, 'left'); txt(g, '¥' + b, w - 14, 70 + i * 38, 18, '#b3201a', LATIN_FONT, 700, 'right'); });
  }), 0.6);
  F.b(new THREE.PlaneGeometry(0.5, 0.66).rotateY(Math.PI), price, 1.3, 1.7, R.W / 2 - 0.02);
  const clock = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#222'; g.lineWidth = 6; g.stroke(); g.lineWidth = 5; g.beginPath(); g.moveTo(64, 64); g.lineTo(64, 24); g.moveTo(64, 64); g.lineTo(96, 76); g.stroke(); for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.fillStyle = '#222'; g.fillRect(64 + Math.cos(a) * 48 - 2, 64 + Math.sin(a) * 48 - 2, 4, 4); } });
  F.b(new THREE.CircleGeometry(0.17, 24).rotateY(-Math.PI / 2), litMap(clock, 0.6), R.D - 0.02, 2.5, 0);
  plant(F, 0.5, R.W / 2 - 0.35);
  // stations and furniture are solid; the waiting sofa can be sat on
  F.solid(R.D - 0.42, R.D + 0.1, -R.W / 2, R.W / 2);
  for (let i = 0; i < n; i++) F.solid(R.D - 1.5, R.D - 0.8, z0 + i * 1.35 - 0.33, z0 + i * 1.35 + 0.33);
  F.solid(R.D - 2.0, R.D - 1.5, z0 + Math.floor(n / 2) * 1.35, z0 + Math.floor(n / 2) * 1.35 + 0.5);
  F.solid(0.55, 1.95, -R.W / 2, -R.W / 2 + 0.6);
  F.solid(2.0, 2.4, -R.W / 2, -R.W / 2 + 0.3);
  F.solid(0.3, 0.7, R.W / 2 - 0.55, R.W / 2 - 0.15);
  const talk = (api) => api.say([{ who: 'Barber', text: 'Sorry, no more chairs tonight. But stay out of the rain a while, it\'s pouring.' }, { text: 'A small radio on the shelf plays enka, softly.' }]);
  for (const d of [0.95, 1.55]) F.seat(d, sz + 0.06, Math.PI / 2, FLOOR + 0.45, d, sz + 0.85, { onSit: talk });
}

function plant(F, d, lz, s = 1) {
  F.model('potted_plant_02', d, FLOOR, lz, (d * 7 + lz * 3) % 6.28, { h: 0.85 * s });
}

// ---------- coin laundry: stacked dryers, washers, folding table ----------
export function laundryInterior(S, F, rnd) {
  const R = room(S, F, { floor: lit(0xc9ced3, 0.3), floorTex: ['floor_tiles_06', 1.2, 0xdde0e4], wall: lit(0xe8ebee, 0.35), wallTex: ['plastered_wall', 1.6, 0xeef0f2], panel: 1.8, light: 0xf0f6ff, k: 16 });
  // a wet-floor sign by the door (it's raining) and a laundry crate
  F.model('WetFloorSign_01', 0.55, FLOOR, 0.9, -0.5);
  F.model('plastic_crate_01', 2.6, FLOOR, -R.W / 2 + 1.05, 0.3);
  const shell = lit(0xe2e5e8, 0.25, { roughness: 0.35, metalness: 0.2 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xe0e4e8, metalness: 0.95, roughness: 0.15 });
  const drum = new THREE.MeshStandardMaterial({ color: 0x5a6068, metalness: 0.8, roughness: 0.35, emissive: 0x15181c });
  const glass = new THREE.MeshStandardMaterial({ color: 0xdfeaf5, transparent: true, opacity: 0.25, roughness: 0.05, metalness: 0.4, depthWrite: false });
  const clothes = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#4a5560'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) { g.fillStyle = `hsl(${Math.floor(Math.random() * 360)},${30 + Math.random() * 40}%,${35 + Math.random() * 35}%)`; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 10 + Math.random() * 22, 6 + Math.random() * 12, Math.random() * 3, 0, Math.PI * 2); g.fill(); }
  });
  const clothM = litMap(clothes, 0.35);
  const label = (t, c) => litMap(canvasTex(128, 48, (g, w, h) => { g.fillStyle = '#20242a'; g.fillRect(0, 0, w, h); txt(g, t, 34, h / 2, 13, '#fff'); g.fillStyle = '#000'; g.fillRect(70, 8, 50, 32); txt(g, c, 95, h / 2 + 1, 20, '#ff5a3c', LATIN_FONT, 700); }), 0.9);
  const dryerLbl = label('乾燥 10分', '¥100'), washLbl = label('洗濯 30分', '¥500');
  const spinners = [];
  const machine = (d, y, lz, rot, size, lbl, spin) => {
    const P = F.obj(d, lz, rot), sp = F.obj(d, lz, rot, true);
    P(new RoundedBoxGeometry(0.7, size, 0.74, 2, 0.03), shell, 0, y + size / 2, 0);
    P(new THREE.PlaneGeometry(0.62, 0.2).rotateY(-Math.PI / 2), lbl, -0.352, y + size - 0.14, 0);
    const r = size * 0.3, cy = y + size * 0.42;
    P(new THREE.TorusGeometry(r + 0.02, 0.03, 10, 32).rotateY(Math.PI / 2), chrome, -0.36, cy, 0);
    P(new THREE.CircleGeometry(r, 28).rotateY(-Math.PI / 2), glass, -0.37, cy, 0);
    if (spin) { const c = sp(new THREE.CircleGeometry(r * 0.96, 24), clothM, -0.3, cy, 0, -Math.PI / 2); c.rotation.order = 'YXZ'; spinners.push(c); }
    else P(new THREE.CircleGeometry(r * 0.96, 24).rotateY(-Math.PI / 2), drum, -0.3, cy, 0);
    P(new THREE.BoxGeometry(0.03, 0.12, 0.05), chrome, -0.37, cy, r + 0.05);
  };
  // two tiers of dryers on the back wall
  const n = Math.floor((R.W - 0.2) / 0.76);
  for (let i = 0; i < n; i++) for (let t = 0; t < 2; t++) machine(R.D - 0.4, FLOOR + t * 0.86, -((n - 1) * 0.76) / 2 + i * 0.76, 0, 0.84, dryerLbl, rnd() < 0.35);
  // big washers down the left wall, facing in
  const nw = Math.floor((R.D - 1.6) / 0.78);
  for (let i = 0; i < nw; i++) machine(1.1 + i * 0.78, FLOOR, -R.W / 2 + 0.4, Math.PI / 2, 1.05, washLbl, i === 0);
  S.updaters.push((t, dt) => { for (const c of spinners) c.rotation.z += dt * 2.2; });
  // folding table, basket, plastic chairs
  const top = lit(0xf6f6f4, 0.4, { roughness: 0.3 });
  const tz = R.W / 2 - 1.1;
  F.b(new THREE.BoxGeometry(1.4, 0.04, 0.7), top, 2.0, 0.9, tz);
  for (const [a, c] of [[-0.62, -0.3], [0.62, -0.3], [-0.62, 0.3], [0.62, 0.3]]) F.b(new THREE.CylinderGeometry(0.02, 0.02, 0.74, 8), chrome, 2.0 + a, FLOOR + 0.37, tz + c);
  F.b(new RoundedBoxGeometry(0.5, 0.28, 0.36, 2, 0.04), lit(0x2a7de1, 0.3, { roughness: 0.4 }), 1.8, 1.06, tz);
  F.b(new RoundedBoxGeometry(0.42, 0.06, 0.3, 2, 0.02), lit(0xf2e6d8, 0.3), 2.35, 0.95, tz + 0.05);
  for (let i = 0; i < 3; i++) {
    const cz = R.W / 2 - 0.4, cd = 0.7 + i * 0.5, chair = lit([0xe8a33b, 0x2f8f5b, 0xe8a33b][i], 0.3, { roughness: 0.4 });
    F.b(new RoundedBoxGeometry(0.4, 0.05, 0.4, 2, 0.02), chair, cd, FLOOR + 0.45, cz);
    F.b(new RoundedBoxGeometry(0.4, 0.38, 0.05, 2, 0.02), chair, cd, FLOOR + 0.7, cz + 0.18);
    for (const [a, c] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) F.b(new THREE.CylinderGeometry(0.012, 0.012, 0.45, 6), chrome, cd + a, FLOOR + 0.22, cz + c);
  }
  F.person(1.5, R.W / 2 - 1.1, 0, 0x5a6b7a);
  // change machine, detergent vending, notice board, TV
  F.b(new RoundedBoxGeometry(0.4, 1.4, 0.4, 2, 0.03), lit(0x2b2e34, 0.15, { metalness: 0.4, roughness: 0.3 }), R.D - 1.3, FLOOR + 0.7, R.W / 2 - 0.25);
  F.b(new THREE.PlaneGeometry(0.3, 0.16).rotateY(Math.PI), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 2.2, 1.0) }), R.D - 1.3, 1.25, R.W / 2 - 0.46);
  const det = litMap(canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#1f63c6'; g.fillRect(0, 0, w, h); txt(g, '洗剤', w / 2, 22, 24, '#fff');
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) { g.fillStyle = '#f2f6fa'; g.fillRect(10 + c * 38, 50 + r * 52, 32, 44); g.fillStyle = ['#ff7a2f', '#2f8f5b', '#e84a5f'][(r + c) % 3]; g.fillRect(16 + c * 38, 58 + r * 52, 20, 26); }
    g.fillStyle = '#111'; g.fillRect(30, 216, 68, 26);
  }), 0.7);
  F.b(new RoundedBoxGeometry(0.55, 1.5, 0.45, 2, 0.03), lit(0x1f63c6, 0.3), R.D - 2.0, FLOOR + 0.75, R.W / 2 - 0.28);
  F.b(new THREE.PlaneGeometry(0.5, 1.2).rotateY(Math.PI), det, R.D - 2.0, FLOOR + 0.85, R.W / 2 - 0.51);
  const board = litMap(canvasTex(256, 160, (g, w, h) => {
    g.fillStyle = '#c9a77a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 7; i++) { const x = 10 + (i % 4) * 60 + Math.random() * 6, y = 10 + Math.floor(i / 4) * 75 + Math.random() * 6; g.fillStyle = ['#fff', '#fff8c4', '#e8f4ff'][i % 3]; g.fillRect(x, y, 52, 64); g.fillStyle = '#d11'; g.beginPath(); g.arc(x + 26, y + 4, 3, 0, Math.PI * 2); g.fill(); g.fillStyle = '#555'; for (let k = 0; k < 5; k++) g.fillRect(x + 6, y + 16 + k * 9, 40 - (k % 2) * 12, 3); }
  }), 0.5);
  F.b(new THREE.PlaneGeometry(0.9, 0.56).rotateY(Math.PI), board, 1.4, 1.75, R.W / 2 - 0.02);
  F.b(new THREE.BoxGeometry(0.7, 0.42, 0.06), lit(0x111111, 0.05), R.D - 0.1, 2.45, R.W / 2 - 0.9, -Math.PI / 2);
  F.b(new THREE.PlaneGeometry(0.64, 0.36).rotateY(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.8, 1.3) }), R.D - 0.14, 2.45, R.W / 2 - 0.9);
  // machines and furniture are solid; the plastic chairs can be sat on; one dryer has something left in it
  F.solid(R.D - 0.8, R.D + 0.1, -R.W / 2, R.W / 2);
  F.solid(0.7, 1.1 + (nw - 1) * 0.78 + 0.4, -R.W / 2, -R.W / 2 + 0.8);
  F.solid(1.3, 2.7, tz - 0.37, tz + 0.37);
  F.solid(R.D - 2.3, R.D - 1.05, R.W / 2 - 0.55, R.W / 2);
  for (let i = 0; i < 3; i++) F.seat(0.7 + i * 0.5, R.W / 2 - 0.42, -Math.PI / 2, FLOOR + 0.47, 0.55, R.W / 2 - 0.95);
  F.act(R.D - 1.05, 0.3, 'Open the dryer', (api) => {
    api.sound.door('swing', 1);
    if (!api.inv['Mystery socks']) { api.addItem('Mystery socks'); return [{ text: 'The round door swings open. Still warm... and one sock left behind.' }]; }
    return [{ text: 'Empty. The warmth is gone.' }];
  });
}

// ---------- real estate office: listing sheets on wires in the window, a counter with desks ----------
export function estateListings(rnd) {
  // 16 listing sheets in one atlas (4 × 4)
  return canvasTex(1024, 1024, (g) => {
    const kinds = ['1K', '1DK', '1LDK', '2LDK', 'ワンルーム', '3LDK'];
    for (let i = 0; i < 16; i++) {
      const x = (i % 4) * 256, y = Math.floor(i / 4) * 256;
      g.fillStyle = '#fdfdfb'; g.fillRect(x + 4, y + 4, 248, 248);
      const accent = ['#1d6b3a', '#1d4fb8', '#c0392b', '#e67e22'][i % 4];
      g.fillStyle = accent; g.fillRect(x + 4, y + 4, 248, 34);
      txt(g, i % 3 ? '賃貸マンション' : '売アパート', x + 128, y + 22, 18, '#fff');
      // floor plan
      g.strokeStyle = '#333'; g.lineWidth = 3; g.strokeRect(x + 22, y + 52, 120, 96);
      g.lineWidth = 2; g.beginPath(); g.moveTo(x + 82, y + 52); g.lineTo(x + 82, y + 148); g.moveTo(x + 22, y + 104); g.lineTo(x + 82, y + 104); g.moveTo(x + 112, y + 148); g.lineTo(x + 112, y + 118); g.lineTo(x + 142, y + 118); g.stroke();
      g.fillStyle = '#c9e2f5'; g.fillRect(x + 84, y + 54, 56, 48);
      // photo
      g.fillStyle = `hsl(${(i * 37) % 360},25%,70%)`; g.fillRect(x + 152, y + 52, 86, 64);
      g.fillStyle = 'rgba(255,255,255,0.6)'; for (let k = 0; k < 3; k++) for (let j = 0; j < 2; j++) g.fillRect(x + 162 + k * 24, y + 62 + j * 26, 16, 18);
      txt(g, kinds[i % kinds.length], x + 195, y + 132, 22, '#222', LATIN_FONT, 700);
      txt(g, (3 + (i * 7) % 9) + '.' + ((i * 3) % 10) + '万円', x + 128, y + 182, 36, '#d11');
      g.fillStyle = '#555'; for (let k = 0; k < 3; k++) g.fillRect(x + 22, y + 206 + k * 12, 212 - k * 40, 5);
      if (i % 5 === 2) { g.save(); g.translate(x + 200, y + 200); g.rotate(-0.4); g.fillStyle = 'rgba(220,20,20,0.9)'; g.fillRect(-46, -18, 92, 36); txt(g, '成約済', 0, 1, 22, '#fff'); g.restore(); }
    }
  });
}

export function estateInterior(S, F, rnd, doorW = 1.0) {
  const R = room(S, F, { floor: lit(0x6f7a86, 0.2, { roughness: 0.95 }), floorTex: ['laminate_floor_02', 1.4, 0xc8bca8], wall: lit(0xe6e4dc, 0.3), wallTex: ['plastered_wall', 1.6, 0xeeeae2], light: 0xfff6ea, k: 10 });
  // listing sheets in clear sleeves, hung on wires either side of the door
  const atlas = estateListings(rnd), sheetM = litMap(atlas, 0.3, { side: THREE.DoubleSide, roughness: 0.5, color: 0xdddddd });
  const sheet = (cell) => {
    const g = new THREE.PlaneGeometry(0.3, 0.3).rotateY(-Math.PI / 2), uv = g.attributes.uv;
    const cu = (cell % 4) / 4, cv = 1 - (Math.floor(cell / 4) + 1) / 4;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, cu + uv.getX(i) / 4, cv + uv.getY(i) / 4);
    return g;
  };
  const wire = lit(0x9aa0a8, 0.2, { metalness: 0.8, roughness: 0.3 });
  const half = R.W / 2 - 0.1;
  for (const [a, b] of [[-half, -doorW / 2 - 0.1], [doorW / 2 + 0.1, half]]) {
    const cols = Math.floor((b - a) / 0.34);
    if (cols < 1) continue;
    for (const y of [2.4, 2.0, 1.6, 1.2]) {
      F.b(new THREE.CylinderGeometry(0.004, 0.004, b - a, 4).rotateX(Math.PI / 2), wire, 0.12, y + 0.17, (a + b) / 2);
      for (let c = 0; c < cols; c++) {
        if (y < 1.5 && (c + Math.round(y * 10)) % 3 === 0) continue; // gaps so you can see in
        F.b(sheet(Math.floor(rnd() * 16)), sheetM, 0.12, y, a + 0.17 + c * ((b - a - 0.34) / Math.max(1, cols - 1)));
      }
    }
  }
  // service counter with low partitions, customer chairs, staff with monitors
  const counter = lit(0xf2f0ea, 0.35, { roughness: 0.4 }), wood = lit(0x9a7048, 0.25, { roughness: 0.5 });
  const cd = R.D - 1.7, cw = Math.min(R.W - 1.2, 3.6);
  F.b(new THREE.BoxGeometry(0.6, 0.72, cw), counter, cd, FLOOR + 0.36, 0);
  F.b(new THREE.BoxGeometry(0.7, 0.04, cw + 0.1), wood, cd, FLOOR + 0.74, 0);
  const seats = Math.max(2, Math.floor(cw / 1.2));
  const partition = new THREE.MeshStandardMaterial({ color: 0xe8f0f6, transparent: true, opacity: 0.45, roughness: 0.2, depthWrite: false });
  const paper = litMap(atlas, 0.6);
  for (let i = 0; i < seats; i++) {
    const lz = -cw / 2 + (i + 0.5) * (cw / seats);
    if (i > 0) F.b(new THREE.BoxGeometry(0.6, 0.45, 0.03), partition, cd, FLOOR + 0.98, lz - cw / seats / 2);
    // customer chair (front of counter) and the monitor facing the staff side
    F.model('dining_chair_02', cd - 0.72, FLOOR, lz, Math.PI);
    if (i % 2 === 0) F.model('binder_notebook', cd + 0.1, FLOOR + 0.762, lz - 0.3, 0.3, { s: 0.6 });
    F.b(new THREE.BoxGeometry(0.04, 0.3, 0.46), lit(0x16181c, 0.05), cd + 0.12, FLOOR + 0.98, lz + 0.1);
    F.b(new THREE.BoxGeometry(0.02, 0.2, 0.02), lit(0x16181c, 0.05), cd + 0.12, FLOOR + 0.82, lz + 0.1);
    F.b(new THREE.PlaneGeometry(0.36, 0.26).rotateX(-Math.PI / 2), paper, cd - 0.15, FLOOR + 0.765, lz - 0.15);
    F.person(cd + 0.6, lz, Math.PI, [0x1d2a44, 0x2a2d35, 0x40322a][i % 3], FLOOR, 1.65, 'talk');
  }
  F.person(cd - 0.75, -cw / 2 + 0.5 * (cw / seats), 0, 0x8a4a3a, FLOOR, 1.25);
  // binder shelves and the area map on the back wall
  const shelf = lit(0xe6e2da, 0.3);
  for (const s of [-1, 1]) {
    const lz = s * (R.W / 2 - 0.65);
    F.b(new THREE.BoxGeometry(0.35, 1.9, 1.0), shelf, R.D - 0.18, FLOOR + 0.95, lz);
    for (let r = 0; r < 4; r++) for (let k = 0; k < 11; k++) F.b(new THREE.BoxGeometry(0.24, 0.32, 0.07), lit(['#1d4fb8', '#c0392b', '#2f8f5b', '#f2c400', '#333'][(r + k * 3) % 5], 0.25), R.D - 0.22, FLOOR + 0.3 + r * 0.45, lz - 0.42 + k * 0.084);
  }
  const map = litMap(canvasTex(512, 320, (g, w, h) => {
    g.fillStyle = '#eef0e6'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffffff'; g.lineWidth = 14; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(0, 30 + i * 55); g.lineTo(w, 50 + i * 50); g.stroke(); g.beginPath(); g.moveTo(40 + i * 90, 0); g.lineTo(20 + i * 95, h); g.stroke(); }
    g.strokeStyle = '#2f8f5b'; g.lineWidth = 6; g.setLineDash([16, 10]); g.beginPath(); g.moveTo(0, 200); g.lineTo(w, 140); g.stroke(); g.setLineDash([]);
    for (let i = 0; i < 14; i++) { g.fillStyle = ['#d11', '#1d4fb8'][i % 2]; g.beginPath(); g.arc(30 + (i * 137) % (w - 60), 30 + (i * 83) % (h - 60), 7, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#1d6b3a'; g.fillRect(0, 0, w, 36); txt(g, '星見エリアマップ', w / 2, 19, 22, '#fff');
  }), 0.5);
  F.b(new THREE.PlaneGeometry(1.4, 0.88).rotateY(-Math.PI / 2), map, R.D - 0.01, 1.85, 0);
  plant(F, 0.55, -R.W / 2 + 0.35, 1.2);
  // brochure stand by the door, water dispenser
  F.b(new THREE.BoxGeometry(0.3, 1.1, 0.45), lit(0xd8dce0, 0.3), 0.55, FLOOR + 0.55, R.W / 2 - 0.4);
  F.b(new THREE.PlaneGeometry(0.4, 0.8).rotateY(-Math.PI / 2), paper, 0.39, FLOOR + 0.65, R.W / 2 - 0.4);
  F.b(new THREE.CylinderGeometry(0.13, 0.13, 0.4, 16), new THREE.MeshStandardMaterial({ color: 0x8ec8ff, transparent: true, opacity: 0.6, roughness: 0.1, depthWrite: false }), R.D - 0.6, FLOOR + 1.25, -R.W / 2 + 1.4);
  F.b(new THREE.BoxGeometry(0.3, 1.0, 0.3), lit(0xf4f4f4, 0.35), R.D - 0.6, FLOOR + 0.5, -R.W / 2 + 1.4);
  // counter, shelves and fittings are solid; the customer chairs face the staff across the counter
  F.solid(cd - 0.36, cd + 0.36, -cw / 2 - 0.05, cw / 2 + 0.05);
  for (const s of [-1, 1]) F.solid(R.D - 0.36, R.D + 0.1, s * (R.W / 2 - 1.15), s * (R.W / 2 - 0.15));
  F.solid(0.35, 0.75, -R.W / 2, -R.W / 2 + 0.6);
  F.solid(0.4, 0.72, R.W / 2 - 0.65, R.W / 2 - 0.15);
  F.solid(R.D - 0.75, R.D - 0.45, -R.W / 2 + 1.25, -R.W / 2 + 1.55);
  const staff = (api) => api.say([
    { who: 'Agent', text: 'Good evening! Looking for a place? There\'s a 1K near Hoshimi Station, ¥58,000 a month. The window faces the tracks.' },
    { who: 'Agent', text: 'If you want somewhere quiet, there\'s a 1LDK by the park. Though three people are already waiting to view it.' },
    { text: 'She slides a flyer across. The paper is a little damp from your umbrella.' },
  ], () => api.addItem('Apartment flyer'));
  for (let i = 1; i < seats; i++) { const lz = -cw / 2 + (i + 0.5) * (cw / seats); F.seat(cd - 0.7, lz, Math.PI, FLOOR + 0.49, cd - 1.35, lz, { onSit: staff }); }
}

// ---------- seated figure (front faces local −x at rot 0); seat = absolute height of the seat top ----------
export function sitter(F, d, lz, rot, { cloth = 0x2a2d35, seat = 0.62, hair = 0x1a1614, hands = 'table' } = {}) {
  // a stand-in made of separate meshes, so it can hide when a real character sits here instead
  const pins = [], P0 = F.obj(d, lz, rot, true), P = (...a) => { const m = P0(...a); m.userData.dynamic = true; pins.push(m); return m; };
  F.npc({ x: F.wx(d), y: FLOOR, z: F.wz(lz), yaw: rot + F.flip - Math.PI / 2, act: 'sit', seat, h: 1.62, pins, pick: Math.floor(Math.abs(d * 31 + lz * 17)) });
  const c = lit(cloth, 0.12), sk = lit(0xe0b898, 0.15), hr = lit(hair, 0.03), pants = lit(0x1e2027, 0.04);
  const shin = Math.min(0.46, seat - FLOOR - 0.06);
  for (const s of [-1, 1]) {
    P(new THREE.CapsuleGeometry(0.068, 0.26, 3, 8).rotateZ(Math.PI / 2), pants, -0.19, seat + 0.07, s * 0.1);
    P(new THREE.CapsuleGeometry(0.058, shin - 0.1, 3, 8), pants, -0.38, seat + 0.07 - shin / 2, s * 0.1);
    // arms reach forward and down to the counter/table
    const ay = hands === 'lap' ? seat + 0.32 : seat + 0.47;
    P(new THREE.CapsuleGeometry(0.05, 0.32, 3, 8).rotateZ(hands === 'lap' ? -0.35 : -0.85), c, -0.14, ay, s * 0.21);
  }
  P(new THREE.CapsuleGeometry(0.16, 0.34, 4, 10).scale(0.75, 1, 1.12), c, 0.02, seat + 0.4, 0);
  P(new THREE.SphereGeometry(0.105, 14, 10), sk, -0.01, seat + 0.83, 0);
  P(new THREE.SphereGeometry(0.113, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), hr, 0.01, seat + 0.86, 0);
}

const stool = (F, d, lz, seat, top, leg) => {
  F.b(new THREE.CylinderGeometry(0.19, 0.17, 0.07, 16), top, d, seat - 0.035, lz);
  F.b(new THREE.CylinderGeometry(0.03, 0.04, seat - FLOOR - 0.07, 8), leg, d, FLOOR + (seat - FLOOR) / 2 - 0.03, lz);
  F.b(new THREE.TorusGeometry(0.13, 0.012, 6, 16).rotateX(Math.PI / 2), leg, d, FLOOR + 0.28, lz);
};
const planks = (a, b, size) => { const t = canvasTex(256, 256, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? a : b; g.fillRect(0, i * 32, w, 32); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, i * 32, w, 2); g.fillRect(((i * 97) % 200) + 20, i * 32, 2, 32); } for (let k = 0; k < 300; k++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`; g.fillRect(Math.random() * w, Math.random() * h, 30, 1); } }, { repeat: true }); t.repeat.set(SHOP_DEPTH / size, 10 / size); return t; };
// a strip of vertical menu cards (tanzaku) or wooden plaques, as one texture
const menuStrip = (items, paper, ink, n = items.length) => canvasTex(64 * n, 256, (g, w, h) => {
  g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, w, h);
  items.forEach((t, i) => {
    const x = i * 64;
    g.fillStyle = paper; g.fillRect(x + 6, 4, 52, h - 8);
    g.fillStyle = ink; g.font = `900 30px ${JP_FONT}`; g.textAlign = 'center'; g.textBaseline = 'top';
    const chars = [...t[0]]; chars.forEach((ch, k) => g.fillText(ch, x + 32, 12 + k * 32));
    g.fillStyle = '#b3201a'; g.font = `700 16px ${LATIN_FONT}`; g.textBaseline = 'bottom'; g.fillText(t[1], x + 32, h - 10);
  });
});
const pendant = (F, d, lz, y, col, k = 2.2, r = 0.13) => {
  F.b(new THREE.CylinderGeometry(0.004, 0.004, SHOP_H - 0.06 - y, 4), lit(0x111111, 0), d, (SHOP_H - 0.06 + y) / 2, lz);
  F.b(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k) }), d, y, lz);
};
const bottles = (F, d, y, lz0, lz1, rnd, tall = 0.36) => {
  const cols = [0x2f5a33, 0x5a3a14, 0x1d2a44, 0xd8d2c0, 0x4a1f1f].map((c) => lit(c, 0.25, { roughness: 0.15 }));
  for (let z = lz0; z < lz1; z += 0.11 + rnd() * 0.05) F.b(new THREE.CylinderGeometry(0.04, 0.045, tall * (0.7 + rnd() * 0.3), 10), cols[Math.floor(rnd() * cols.length)], d, y + tall * 0.4, z);
};

// ---------- izakaya: long counter with stools, chef, bottle shelves, menu cards, paper lanterns ----------
export function izakayaInterior(S, F, rnd) {
  const R = room(S, F, { floor: lit(0x4a3020, 0.25), floorTex: ['wood_floor', 1.4, 0x8a6448], wall: lit(0x6a4a30, 0.2), wallTex: ['plastered_wall', 1.6, 0xb08a62], ceil: lit(0x3a2614, 0.15), ceilTex: ['dark_wood', 1.5, 0x9a7a5a], panel: 0, light: 0xffb070, k: 12 });
  const wood = inSurf(S, 'dark_wood', 1, 1, { tint: 0xc09070 }), top = inSurf(S, 'wood_table', 2, 0.4, { tint: 0xe0b080, k: 0.35 }), dark = lit(0x221510, 0.1);
  const cd = R.D - 1.45, cw = R.W - 1.0;
  F.b(new THREE.BoxGeometry(0.45, 0.95, cw), wood, cd, FLOOR + 0.47, 0);
  F.b(new THREE.BoxGeometry(0.62, 0.06, cw + 0.1), top, cd - 0.05, FLOOR + 0.98, 0);
  // back shelves of real sake and shochu bottles, menu cards above
  for (const y of [1.15, 1.65]) {
    F.b(new THREE.BoxGeometry(0.3, 0.03, cw), wood, R.D - 0.16, y, 0);
    for (let z = -cw / 2 + 0.38; z < cw / 2 - 0.3; z += 0.72) F.model('wine_bottles_01', R.D - 0.16, y + 0.015, z, 0, { s: 0.95 });
  }
  F.model('ceramic_pot', cd - 0.05, FLOOR + 1.01, cw / 2 - 0.25, 0.4, { s: 0.45 });
  const menu = [['焼鳥', '¥180'], ['枝豆', '¥380'], ['唐揚げ', '¥580'], ['刺身', '¥980'], ['おでん', '¥450'], ['熱燗', '¥550'], ['生ビール', '¥600'], ['冷奴', '¥350'], ['焼きおにぎり', '¥320'], ['ハイボール', '¥450'], ['塩辛', '¥400'], ['だし巻き', '¥480']];
  const strip = litMap(menuStrip(menu, '#f4ecd8', '#1a1a1a'), 0.6, { transparent: true });
  F.b(new THREE.PlaneGeometry(Math.min(cw, 4.4), 0.62).rotateY(-Math.PI / 2), strip, R.D - 0.01, 2.35, 0);
  // the chef behind the counter, in white with a headband
  F.person(R.D - 0.75, -0.4, Math.PI, 0xf4f4f2);
  F.b(new THREE.TorusGeometry(0.11, 0.02, 6, 16).rotateX(Math.PI / 2), lit(0xffffff, 0.4), R.D - 0.75, FLOOR + 1.55, -0.4);
  // stools and customers, beer mugs and small plates on the counter
  const n = Math.floor(cw / 0.62), seat = FLOOR + 0.62, mug = lit(0xf2b233, 0.35, { roughness: 0.1, transparent: true, opacity: 0.85 }), foam = lit(0xfaf6ea, 0.4), plate = lit(0xf2efe8, 0.3);
  for (let i = 0; i < n; i++) {
    const lz = -cw / 2 + 0.31 + i * (cw / n);
    stool(F, cd - 0.65, lz, seat, lit(0x7a1f1f, 0.15), dark);
    const taken = rnd() < 0.55;
    if (!taken) {
      // an empty stool: sit and order; what you order turns up on the counter
      const beer = [F.m(new THREE.CylinderGeometry(0.045, 0.04, 0.14, 12), mug, cd - 0.2, FLOOR + 1.08, lz + 0.15), F.m(new THREE.CylinderGeometry(0.046, 0.046, 0.03, 12), foam, cd - 0.2, FLOOR + 1.16, lz + 0.15)];
      const skewer = [F.m(new THREE.CylinderGeometry(0.09, 0.07, 0.02, 16), plate, cd - 0.2, FLOOR + 1.02, lz - 0.1), F.m(new THREE.BoxGeometry(0.03, 0.03, 0.16), lit(0x8a4a1a, 0.2), cd - 0.2, FLOOR + 1.045, lz - 0.1)];
      [...beer, ...skewer].forEach((o) => { o.visible = false; });
      F.seat(cd - 0.62, lz, Math.PI, seat, cd - 1.25, lz, { onSit: (api) => api.choose('What\'ll it be?', ['Draft beer ¥600', 'Yakitori ¥180', 'Edamame ¥380', 'Maybe later'], (k) => {
        if (k === 3) return;
        (k === 0 ? beer : skewer).forEach((o) => { o.visible = true; });
        api.sound.beep();
        api.say([{ who: 'Chef', text: ['One cold beer! Kanpai.', 'Negima yakitori, fresh off the grill. Careful, it\'s hot.', 'Edamame, salted just right.'][k] }]);
      }) });
    }
    if (taken) {
      sitter(F, cd - 0.62, lz, Math.PI, { cloth: [0x2a3a5a, 0x3a3a3a, 0x5a4a3a, 0x1d2a44][i % 4], seat });
      F.b(new THREE.CylinderGeometry(0.045, 0.04, 0.14, 12), mug, cd - 0.2, FLOOR + 1.08, lz + 0.15);
      F.b(new THREE.CylinderGeometry(0.046, 0.046, 0.03, 12), foam, cd - 0.2, FLOOR + 1.16, lz + 0.15);
      F.b(new THREE.CylinderGeometry(0.09, 0.07, 0.02, 16), plate, cd - 0.2, FLOOR + 1.02, lz - 0.1);
    }
  }
  // paper lanterns hanging along the room
  for (let k = 0; k < 3; k++) {
    const lz = -R.W / 2 + (k + 0.5) * (R.W / 3);
    F.b(new THREE.CylinderGeometry(0.004, 0.004, 0.5, 4), dark, 1.2, 2.7, lz);
    F.b(new THREE.SphereGeometry(0.17, 16, 12).scale(1, 1.25, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.3, 0.6) }), 1.2, 2.3, lz);
  }
  // a low table near the window with two more customers
  F.b(new THREE.BoxGeometry(0.7, 0.05, 0.9), top, 1.1, FLOOR + 0.72, -R.W / 2 + 0.9);
  F.b(new THREE.BoxGeometry(0.08, 0.68, 0.08), dark, 1.1, FLOOR + 0.36, -R.W / 2 + 0.9);
  sitter(F, 1.65, -R.W / 2 + 0.9, Math.PI * 0, { cloth: 0x6a2a2a, seat: FLOOR + 0.45 });
  F.b(new THREE.BoxGeometry(0.4, 0.06, 0.4), lit(0x3a2614, 0.1), 1.62, FLOOR + 0.42, -R.W / 2 + 0.9);
  F.b(new THREE.CylinderGeometry(0.045, 0.04, 0.14, 12), mug, 1.05, FLOOR + 0.82, -R.W / 2 + 1.0);
  F.solid(cd - 0.36, cd + 0.3, -cw / 2, cw / 2);
  F.solid(R.D - 0.32, R.D + 0.1, -R.W / 2, R.W / 2);
  F.solid(R.D - 1.0, R.D - 0.5, -0.65, -0.15);
  F.solid(0.7, 1.9, -R.W / 2 + 0.35, -R.W / 2 + 1.45);
}

// ---------- ramen: counter facing an open kitchen with stock pots ----------
export function ramenInterior(S, F, rnd) {
  const R = room(S, F, { floor: lit(0x8a3a2a, 0.2), floorTex: ['interior_tiles', 1.0, 0xc87058], wall: lit(0xe9dfc9, 0.3), wallTex: ['plastered_wall', 1.6, 0xeee2c8], panel: 1.4, light: 0xfff0d8, k: 14 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.9, roughness: 0.25, emissive: 0x202224 });
  const wood = inSurf(S, 'wood_table', 2, 0.4, { tint: 0xe8c090, k: 0.35 }), red = lit(0xb3201a, 0.25);
  const cd = R.D - 1.7, cw = R.W - 0.9;
  F.b(new THREE.BoxGeometry(0.5, 1.0, cw), inSurf(S, 'dark_wood', 1, 1, { tint: 0xb08060 }), cd, FLOOR + 0.5, 0);
  // the kitchen wall behind the pots: white tiles
  F.b(new THREE.PlaneGeometry(cw, 1.7).rotateY(-Math.PI / 2), inSurf(S, 'long_white_tiles', cw / 1.0, 1.7, { tint: 0xf4f2ec, k: 0.3 }), R.D - 0.005, FLOOR + 0.85, 0);
  F.b(new THREE.BoxGeometry(0.55, 0.05, cw + 0.05), wood, cd - 0.03, FLOOR + 1.02, 0);
  F.b(new THREE.BoxGeometry(0.12, 0.25, cw), wood, cd + 0.2, FLOOR + 1.17, 0);
  // kitchen: steel counter, burners and big pots, a chef
  F.b(new THREE.BoxGeometry(0.6, 0.85, cw), steel, R.D - 0.35, FLOOR + 0.42, 0);
  for (let k = 0; k < 3; k++) {
    const lz = -cw / 2 + 0.6 + k * 0.7;
    F.b(new THREE.CylinderGeometry(0.24, 0.24, 0.5, 20), steel, R.D - 0.35, FLOOR + 1.1, lz);
    F.b(new THREE.CylinderGeometry(0.235, 0.235, 0.01, 20), lit(0xc9a060, 0.35), R.D - 0.35, FLOOR + 1.3, lz);
  }
  S.steam(F.wx(R.D - 0.35), FLOOR + 1.5, F.wz(-cw / 2 + 1.3));
  F.person(R.D - 1.0, 0.6, Math.PI, 0xf4f4f2);
  F.b(new THREE.TorusGeometry(0.11, 0.025, 6, 16).rotateX(Math.PI / 2), lit(0x1d4fb8, 0.3), R.D - 1.0, FLOOR + 1.55, 0.6);
  // wooden menu plaques across the back wall
  const menu = [['醤油らーめん', '680'], ['味噌らーめん', '750'], ['塩らーめん', '700'], ['豚骨', '780'], ['つけ麺', '850'], ['餃子', '350'], ['チャーハン', '550'], ['ビール', '550']];
  F.b(new THREE.PlaneGeometry(Math.min(cw, 4.2), 0.8).rotateY(-Math.PI / 2), litMap(menuStrip(menu, '#c8a46a', '#1a1208'), 0.55, { transparent: true }), R.D - 0.01, 2.3, 0);
  // stools, slurping customers, bowls
  const n = Math.floor(cw / 0.6), seat = FLOOR + 0.66, bowl = red, soup = lit(0xc89a50, 0.35);
  for (let i = 0; i < n; i++) {
    const lz = -cw / 2 + 0.3 + i * (cw / n);
    F.model('metal_stool_02', cd - 0.62, FLOOR, lz, 0, { h: seat - FLOOR });
    const taken = rnd() < 0.6;
    if (!taken) {
      const served = [F.m(new THREE.SphereGeometry(0.1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), bowl, cd - 0.15, FLOOR + 1.15, lz), F.m(new THREE.CircleGeometry(0.095, 16).rotateX(-Math.PI / 2), soup, cd - 0.15, FLOOR + 1.12, lz)];
      served.forEach((o) => { o.visible = false; });
      F.seat(cd - 0.6, lz, Math.PI, seat, cd - 1.2, lz, { onSit: (api) => {
        if (!api.useItem('Ramen ticket')) return api.say([{ who: 'Chef', text: 'Irasshai! Get a ticket from the machine by the door first.' }]);
        api.say([{ who: 'Chef', text: 'One shoyu ramen! Here you go.' }, { text: 'Clear amber broth, thick slices of chashu. The steam blurs your view.' }]);
        served.forEach((o) => { o.visible = true; }); api.sound.beep();
      } });
    }
    if (taken) {
      sitter(F, cd - 0.6, lz, Math.PI, { cloth: [0x2a2d35, 0x3b4a6b, 0x6b6b6b, 0x2f4a33][i % 4], seat });
      F.b(new THREE.SphereGeometry(0.1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), bowl, cd - 0.15, FLOOR + 1.15, lz);
      F.b(new THREE.CircleGeometry(0.095, 16).rotateX(-Math.PI / 2), soup, cd - 0.15, FLOOR + 1.12, lz);
    }
  }
  // water jug and condiment trays
  for (let k = 0; k < 3; k++) F.b(new THREE.BoxGeometry(0.12, 0.1, 0.25), lit(0x222222, 0.1), cd + 0.2, FLOOR + 1.35, -cw / 2 + 0.8 + k * 1.4);
  F.b(new THREE.CylinderGeometry(0.06, 0.06, 0.22, 12), new THREE.MeshStandardMaterial({ color: 0xe8f4ff, transparent: true, opacity: 0.5, roughness: 0.05, depthWrite: false }), cd - 0.1, FLOOR + 1.16, cw / 2 - 0.3);
  F.solid(cd - 0.3, cd + 0.28, -cw / 2, cw / 2);
  F.solid(R.D - 0.7, R.D + 0.1, -R.W / 2, R.W / 2);
}

// ---------- kissa: booths in red velvet, pendant lamps, a siphon counter, a man with a newspaper ----------
export function kissaInterior(S, F, rnd) {
  const R = room(S, F, { floor: lit(0x5a3a22, 0.2), floorTex: ['wood_floor', 1.2, 0x9a6a48], wall: lit(0x5e4030, 0.18), wallTex: ['plastered_wall', 1.6, 0x8a6448], ceil: lit(0x3a2414, 0.12), ceilTex: ['dark_wood', 1.4, 0x7a5a40], panel: 0, light: 0xffc890, k: 10 });
  const velvet = inSurf(S, 'fabric_leather_02', 1, 1, { tint: 0xb02530, k: 0.2 }), wood = inSurf(S, 'dark_wood', 1, 1, { tint: 0x8a6448 }), cup = lit(0xf6f2ea, 0.35), cup0 = cup;
  // booths along both side walls: bench, back, a table between
  for (const s of [-1, 1]) {
    const bz = s * (R.W / 2 - 0.35);
    for (let k = 0; k < 2; k++) {
      const d = 1.1 + k * 1.5;
      for (const e of [-0.45, 0.45]) {
        F.b(new RoundedBoxGeometry(0.45, 0.14, 0.62, 2, 0.04), velvet, d + e, FLOOR + 0.42, bz);
        F.b(new RoundedBoxGeometry(0.12, 0.6, 0.62, 2, 0.04), velvet, d + e * 1.35, FLOOR + 0.75, bz);
      }
      F.b(new THREE.BoxGeometry(0.55, 0.04, 0.62), wood, d, FLOOR + 0.7, bz);
      F.b(new THREE.CylinderGeometry(0.04, 0.12, 0.68, 10), wood, d, FLOOR + 0.34, bz);
      F.b(new THREE.CylinderGeometry(0.045, 0.035, 0.07, 12), cup, d - 0.1, FLOOR + 0.76, bz + 0.1);
      F.b(new THREE.CylinderGeometry(0.07, 0.07, 0.01, 14), cup, d - 0.1, FLOOR + 0.725, bz + 0.1);
      pendant(F, d, bz, 2.05, 0xffb060, 2.0);
    }
  }
  // the old man and his newspaper, a woman with coffee
  sitter(F, 1.1 + 0.42, -(R.W / 2 - 0.35), 0, { cloth: 0x5a5a4a, seat: FLOOR + 0.49, hair: 0xb8b8b0 });
  F.b(new THREE.PlaneGeometry(0.5, 0.36).rotateY(-Math.PI / 2 + 0.25), litMap(canvasTex(128, 96, (g, w, h) => { g.fillStyle = '#e8e2d2'; g.fillRect(0, 0, w, h); g.fillStyle = '#222'; g.font = `900 14px ${JP_FONT}`; g.fillText('星見新聞', 6, 16); for (let i = 0; i < 9; i++) g.fillRect(6 + (i % 3) * 40, 26 + Math.floor(i / 3) * 22, 34, 3); }), 0.5, { side: THREE.DoubleSide }), 1.1 + 0.05, FLOOR + 1.0, -(R.W / 2 - 0.35));
  sitter(F, 2.6 - 0.42, R.W / 2 - 0.35, Math.PI, { cloth: 0xc9a77a, seat: FLOOR + 0.49, hair: 0x3a2214 });
  // counter with siphon coffee makers, cups shelf, a master in a vest
  const cd = R.D - 0.8, cw = Math.min(R.W - 2.6, 3.0);
  F.b(new THREE.BoxGeometry(0.5, 1.0, cw), wood, cd, FLOOR + 0.5, 0);
  F.b(new THREE.BoxGeometry(0.6, 0.05, cw + 0.1), inSurf(S, 'wood_table', 2, 0.4, { tint: 0xc89870, k: 0.3 }), cd, FLOOR + 1.02, 0);
  F.model('tea_set_01', cd, FLOOR + 1.045, cw / 2 - 0.45, Math.PI, { s: 0.5 });
  // a slow ceiling fan over the booths
  const fan = F.model('ceiling_fan', R.D / 2, SHOP_H - 0.06, 0, 0, { s: 0.75, moving: true });
  S.updaters.push((t, dt) => { fan.rotation.y += dt * 1.4; });
  const glass = new THREE.MeshStandardMaterial({ color: 0xe8f0f6, transparent: true, opacity: 0.4, roughness: 0.05, depthWrite: false });
  for (let k = 0; k < 3; k++) {
    const lz = -cw / 2 + 0.5 + k * 0.5;
    F.b(new THREE.SphereGeometry(0.08, 14, 10), glass, cd, FLOOR + 1.15, lz);
    F.b(new THREE.CylinderGeometry(0.05, 0.03, 0.2, 12), glass, cd, FLOOR + 1.35, lz);
    F.b(new THREE.SphereGeometry(0.06, 12, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), lit(0x2a1408, 0.1), cd, FLOOR + 1.15, lz);
  }
  F.person(R.D - 0.3, 0.4, Math.PI, 0x1a1a1a);
  for (const y of [1.45, 1.8]) { F.b(new THREE.BoxGeometry(0.25, 0.03, cw), wood, R.D - 0.12, y, 0); for (let z = -cw / 2 + 0.1; z < cw / 2; z += 0.16) F.b(new THREE.CylinderGeometry(0.04, 0.035, 0.08, 10), cup, R.D - 0.12, y + 0.055, z); }
  // a shelf of manga and a wall clock
  F.b(new THREE.BoxGeometry(0.3, 1.4, 0.8), wood, R.D - 0.2, FLOOR + 0.7, -R.W / 2 + 0.6);
  for (let r = 0; r < 4; r++) for (let k = 0; k < 9; k++) F.b(new THREE.BoxGeometry(0.18, 0.2, 0.07), lit(['#c0392b', '#1d4fb8', '#e6c34a', '#2f8f5b', '#e8e2d2'][(r * 3 + k) % 5], 0.2), R.D - 0.23, FLOOR + 0.2 + r * 0.33, -R.W / 2 + 0.28 + k * 0.08);
  plant(F, R.D - 0.5, R.W / 2 - 1.1, 1.1);
  // booths and counter are solid; the empty benches can be sat on (coffee comes to the table)
  for (const s of [-1, 1]) for (let k = 0; k < 2; k++) F.solid(1.1 + k * 1.5 - 0.75, 1.1 + k * 1.5 + 0.75, s * (R.W / 2 - 0.7), s * R.W / 2);
  F.solid(cd - 0.3, cd + 0.3, -cw / 2 - 0.05, cw / 2 + 0.05);
  F.solid(R.D - 0.35, R.D + 0.1, -R.W / 2, -R.W / 2 + 1.05);
  F.solid(R.D - 0.75, R.D - 0.25, R.W / 2 - 1.35, R.W / 2 - 0.85);
  const coffee = (api, cup) => api.choose('What\'ll it be?', ['Blend coffee ¥450', 'Melon cream soda ¥550', 'Napolitan ¥780', 'Maybe later'], (k) => {
    if (k === 3) return;
    cup.visible = true; api.sound.beep();
    api.say([{ who: 'Master', text: ['Brewed slowly. Here you are.', 'Green cream soda with ice cream on top. A classic.', 'Spaghetti in tomato sauce, the plate still sizzling.'][k] }]);
  });
  const taken = [[0, -1, 1], [1, 1, -1]];
  for (const s of [-1, 1]) for (let k = 0; k < 2; k++) for (const e of [-1, 1]) {
    if (taken.some(([tk, ts, te]) => tk === k && ts === s && te === e)) continue;
    const d = 1.1 + k * 1.5, lz = s * (R.W / 2 - 0.35);
    const cup = F.m(new THREE.CylinderGeometry(0.045, 0.035, 0.07, 12), cup0, d + e * 0.12, FLOOR + 0.76, lz - s * 0.1); cup.visible = false;
    F.seat(d + e * 0.42, lz, e > 0 ? 0 : Math.PI, FLOOR + 0.49, d + e * 0.42, s * (R.W / 2 - 1.05), { onSit: (api) => coffee(api, cup) });
  }
}

// ---------- karaoke lobby: neon trim, reception, drink bar, a corridor of booth doors, a mirror ball ----------
export function karaokeInterior(S, F, rnd) {
  const R = room(S, F, { floor: lit(0x1a1028, 0.15, { roughness: 0.12, metalness: 0.3 }), wall: lit(0x24163a, 0.18), ceil: lit(0x120a1c, 0.1), panel: 0, light: 0xd070ff, k: 14 });
  const pink = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.6, 2.4) }), cyan = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 2.6, 3) });
  // neon lines round the walls
  for (const [y, m] of [[0.9, cyan], [2.7, pink]]) {
    F.b(new THREE.BoxGeometry(0.02, 0.025, R.W - 0.2), m, R.D - 0.02, y, 0);
    for (const s of [-1, 1]) F.b(new THREE.BoxGeometry(R.D - 0.1, 0.025, 0.02), m, R.D / 2, y, s * (R.W / 2 - 0.02));
  }
  // corridor doors on the back wall with lit portholes and room numbers
  const nd = Math.max(2, Math.floor((R.W - 1.2) / 1.4));
  for (let k = 0; k < nd; k++) {
    const lz = -((nd - 1) * 1.4) / 2 + k * 1.4;
    F.b(new THREE.BoxGeometry(0.06, 2.0, 0.85), lit(0x3a2a52, 0.12, { roughness: 0.3 }), R.D - 0.03, FLOOR + 1.0, lz);
    F.b(new THREE.PlaneGeometry(0.3, 0.45).rotateY(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL((k * 0.23) % 1, 0.9, 0.55).multiplyScalar(1.8) }), R.D - 0.07, FLOOR + 1.45, lz);
    F.b(new THREE.PlaneGeometry(0.25, 0.12).rotateY(-Math.PI / 2), litMap(canvasTex(64, 32, (g, w, h) => { g.fillStyle = '#111'; g.fillRect(0, 0, w, h); txt(g, String(101 + k), w / 2, h / 2, 20, '#ffe14a', LATIN_FONT, 700); }), 1.2), R.D - 0.07, FLOOR + 2.1, lz);
  }
  // reception desk with a neon front edge, staff and a ranking screen
  const rz = R.W / 2 - 1.3, rd = 1.9;
  F.b(new RoundedBoxGeometry(0.6, 1.05, 2.0, 2, 0.05), lit(0x0c0614, 0.05, { roughness: 0.3, metalness: 0.4 }), rd, FLOOR + 0.52, rz);
  F.b(new THREE.BoxGeometry(0.02, 0.03, 2.0), pink, rd - 0.31, FLOOR + 0.95, rz);
  F.b(new THREE.BoxGeometry(0.02, 0.03, 2.0), cyan, rd - 0.31, FLOOR + 0.1, rz);
  F.person(rd + 0.6, rz, Math.PI, 0x1a1a1a);
  const rank = litMap(canvasTex(256, 160, (g, w, h) => {
    g.fillStyle = '#0a0612'; g.fillRect(0, 0, w, h); txt(g, '今週のランキング', w / 2, 18, 18, '#ff6fd8');
    ['夜に駆ける', '雨夜の歌', 'Hoshimi Love', '残酷な天使', '星のメロディ'].forEach((t, i) => { txt(g, `${i + 1}`, 22, 46 + i * 24, 18, '#ffe14a', LATIN_FONT, 700); txt(g, t, 44, 46 + i * 24, 16, '#fff', JP_FONT, 700, 'left'); });
  }), 1.4);
  F.b(new THREE.BoxGeometry(0.06, 0.62, 1.0), lit(0x111111, 0.05), R.D - 0.06, 2.1, rz);
  F.b(new THREE.PlaneGeometry(0.95, 0.58).rotateY(-Math.PI / 2), rank, R.D - 0.1, 2.1, rz);
  // drink bar against the other wall
  const dz = -R.W / 2 + 0.4;
  F.b(new THREE.BoxGeometry(1.4, 0.95, 0.5), lit(0xd8d8de, 0.2, { metalness: 0.5, roughness: 0.3 }), 1.5, FLOOR + 0.48, dz);
  F.b(new THREE.BoxGeometry(0.9, 0.6, 0.4), lit(0x202024, 0.1), 1.5, FLOOR + 1.25, dz);
  for (let k = 0; k < 5; k++) F.b(new THREE.PlaneGeometry(0.14, 0.2), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(k / 5, 0.8, 0.55).multiplyScalar(1.5) }), 1.15 + k * 0.17, FLOOR + 1.35, dz + 0.205);
  // spinning mirror ball
  const ball = F.m(new THREE.IcosahedronGeometry(0.2, 2), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.15, flatShading: true, emissive: 0x333344 }), R.D / 2, 2.55, 0);
  S.updaters.push((t) => { ball.rotation.y = t * 0.6; });
  // waiting sofa against the window, someone already waiting on it
  F.b(new RoundedBoxGeometry(0.5, 0.42, 1.4, 2, 0.06), lit(0x3a2a52, 0.15), 0.5, FLOOR + 0.22, -1.6);
  F.b(new RoundedBoxGeometry(0.14, 0.5, 1.4, 2, 0.05), lit(0x3a2a52, 0.15), 0.28, FLOOR + 0.6, -1.6);
  sitter(F, 0.55, -1.95, Math.PI, { cloth: 0x6a2a6a, seat: FLOOR + 0.45, hands: 'lap' });
  F.seat(0.55, -1.3, Math.PI, FLOOR + 0.45, 1.1, -1.3);
  F.solid(0.22, 0.75, -2.3, -0.9);
  F.solid(rd - 0.32, rd + 0.32, rz - 1.02, rz + 1.02);
  F.solid(0.8, 2.2, -R.W / 2, -R.W / 2 + 0.65);
  F.act(rd - 0.75, rz, 'Check in at reception', (api) => { api.choose('Karaoke Hoshimi', ['Room, 1 hour ¥500 (free drinks)', 'Just looking'], (k) => {
    if (k) return;
    api.sound.beep();
    const from = { x: F.wx(rd - 0.9), z: F.wz(rz), yaw: F.yawOf(Math.PI) };
    api.say([{ who: 'Receptionist', text: 'Room 103, straight ahead then left. The mics have been cleaned. Enjoy singing!' }], () => S.pockets?.karaoke?.enter(api, from));
  }); return null; });
}

// ---------- apartment lobby: mailboxes, auto-lock panel, inner glass doors, a lift ----------
export function apartmentInterior(S, F, rnd) {
  const R = room(S, F, { floor: litMap(tiles('#8e8a82', '#86827a', 2, '#6e6a62', 0.9), 0.2, { roughness: 0.25 }), wall: lit(0xd9d2c4, 0.3), panel: 0, light: 0xfff0d0, k: 8 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.9, roughness: 0.3, emissive: 0x1a1c1e });
  // downlights
  for (let d = 0.8; d < R.D; d += 1.3) F.b(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.0, 1.6) }), d, SHOP_H - 0.07, 0);
  // mailbox wall: a grid of little doors with name slots
  const mz = -R.W / 2 + 0.12, mb = lit(0x9aa0a8, 0.2, { metalness: 0.6, roughness: 0.35 }), slot = lit(0x1a1a1a, 0), tag = lit(0xf4f4f0, 0.6);
  F.b(new THREE.BoxGeometry(1.5, 1.2, 0.2), mb, 1.4, FLOOR + 1.1, mz);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
    const d = 0.86 + c * 0.27, y = FLOOR + 0.62 + r * 0.29;
    F.b(new THREE.BoxGeometry(0.25, 0.27, 0.01), lit(0xb0b6be, 0.2, { metalness: 0.6, roughness: 0.3 }), d, y, mz + 0.105);
    F.b(new THREE.BoxGeometry(0.16, 0.012, 0.012), slot, d, y + 0.08, mz + 0.11);
    F.b(new THREE.BoxGeometry(0.1, 0.03, 0.006), tag, d - 0.04, y - 0.06, mz + 0.112);
  }
  // inner glass doors with an auto-lock keypad beside them
  const gd = 2.5, glass = new THREE.MeshStandardMaterial({ color: 0xdfeaf5, transparent: true, opacity: 0.18, roughness: 0.03, metalness: 0.6, depthWrite: false });
  F.b(new THREE.PlaneGeometry(R.W - 0.2, 2.5).rotateY(-Math.PI / 2), glass, gd, FLOOR + 1.25, 0);
  for (const z of [-R.W / 2 + 0.1, -0.8, 0, 0.8, R.W / 2 - 0.1]) F.b(new THREE.BoxGeometry(0.06, 2.5, 0.06), steel, gd, FLOOR + 1.25, z);
  F.b(new THREE.BoxGeometry(0.06, 0.06, R.W - 0.2), steel, gd, FLOOR + 2.5, 0);
  F.b(new THREE.BoxGeometry(0.2, 0.32, 0.22), steel, gd - 0.3, FLOOR + 1.2, 1.2);
  F.b(new THREE.PlaneGeometry(0.1, 0.06).rotateY(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.6, 2.2) }), gd - 0.41, FLOOR + 1.28, 1.2);
  // lift doors with a lit floor indicator, a bench and a plant past the glass
  F.b(new THREE.BoxGeometry(0.04, 2.1, 1.0), steel, R.D - 0.03, FLOOR + 1.05, -0.6);
  F.b(new THREE.BoxGeometry(0.03, 2.1, 0.01), lit(0x333333, 0), R.D - 0.06, FLOOR + 1.05, -0.6);
  F.b(new THREE.PlaneGeometry(0.3, 0.1).rotateY(-Math.PI / 2), litMap(canvasTex(64, 24, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); txt(g, '▲ 3F', w / 2, h / 2, 16, '#ff9a3c', LATIN_FONT, 700); }), 1.4), R.D - 0.06, FLOOR + 2.3, -0.6);
  F.b(new RoundedBoxGeometry(0.4, 0.42, 1.2, 2, 0.04), lit(0x6a4a30, 0.15), R.D - 0.4, FLOOR + 0.21, R.W / 2 - 0.9);
  plant(F, R.D - 0.4, 0.6, 1.1);
  // notice board by the mailboxes
  F.b(new THREE.PlaneGeometry(0.7, 0.5).rotateY(Math.PI), litMap(canvasTex(140, 100, (g, w, h) => { g.fillStyle = '#e8e2d2'; g.fillRect(0, 0, w, h); for (let i = 0; i < 4; i++) { g.fillStyle = ['#fff', '#fff8c4'][i % 2]; g.fillRect(8 + (i % 2) * 66, 8 + Math.floor(i / 2) * 46, 58, 40); g.fillStyle = '#555'; for (let k = 0; k < 3; k++) g.fillRect(14 + (i % 2) * 66, 18 + Math.floor(i / 2) * 46 + k * 9, 40, 3); } }), 0.5), 1.3, FLOOR + 1.6, R.W / 2 - 0.02);
  F.solid(0.6, 2.2, -R.W / 2, -R.W / 2 + 0.28);
  F.solid(gd - 0.06, gd + 0.06, -R.W / 2, R.W / 2);
  F.act(1.4, -R.W / 2 + 0.75, 'Check the box for mail', (api) => {
    if (!api.inv['Pizza flyer']) { api.addItem('Pizza flyer'); return [{ text: 'Mailbox 305 is stuffed with flyers. A pizza coupon, 30% off.' }]; }
    return [{ text: 'Just the electricity bill. That can wait.' }];
  });
  const roof = S.roof, from = { x: F.wx(gd - 0.7), z: F.wz(1.2), yaw: F.yawOf(0) };
  if (roof) roof.lobby = from;
  F.act(gd - 0.4, 1.2, 'Open the door & take the lift', (api) => { api.choose('Lift · メゾン星見', ['3F · Room 305 (your room)', 'Roof', 'Cancel'], (k) => {
    if (k === 2) return;
    api.sound.beep();
    if (k === 0) S.pockets?.apartment?.enter(api, from);
    else if (roof?.go) roof.go(api);
  }); return null; }, 1.0);
}

// ---------- roses (Poly Pizza low-poly models, placed as instances, each bloom its own colour) ----------
// kind: 'rose' (one stem) or 'roses' (a bunch of a dozen); list: [{ x, y, z, h, c, up?, spin? }] in world space,
// h the height it's scaled to, c the bloom colour, up the way the stem points (default straight up)
const ROSE_PINKS = [0xf27ea0, 0xf7a8c0, 0xe0457a, 0xfbd3de, 0xffffff, 0xf59cb5, 0xd63a6a];
export function placeRoses(S, kind, list) {
  const part = S.assets?.part?.(kind, ['*']);
  if (!part || !list.length) return [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  const Y = new THREE.Vector3(0, 1, 0), out = [];
  for (const { geometry, material } of part.pieces) {
    // the blooms are the red material; the stems and leaves keep their green
    const c0 = material.color ?? new THREE.Color(1, 1, 1), bloom = c0.r > c0.g * 2;
    const mat = material.clone();
    if (bloom) { mat.color = new THREE.Color(1, 1, 1); mat.emissive = new THREE.Color(0.06, 0.03, 0.04); }
    mat.roughness = bloom ? 0.55 : 0.7; mat.metalness = 0;
    const im = new THREE.InstancedMesh(geometry, mat, list.length);
    list.forEach((r, i) => {
      q.setFromUnitVectors(Y, r.up ?? Y); q2.setFromAxisAngle(Y, r.spin ?? i * 2.4);
      q.multiply(q2);
      const k = r.h / part.size.y;
      m4.compose(p.set(r.x, r.y, r.z), q, sc.set(k, k, k)); im.setMatrixAt(i, m4);
      if (bloom) im.setColorAt(i, col.setHex(r.c ?? ROSE_PINKS[i % ROSE_PINKS.length]));
    });
    im.computeBoundingSphere(); im.castShadow = false; im.receiveShadow = true;
    S.scene.add(im); out.push(im);
  }
  return out;
}

// ---------- Desy Ika · Flowers & Café: a florist in front, a little café at the back ----------
// a hedge wall with pink roses and her name in neon, tiered stands of rose buckets, two marble tables, a
// barista's counter with an espresso machine and a cake under glass. Pink and white, warm light.
export function floristInterior(S, F, rnd) {
  const R = room(S, F, { floor: lit(0xd9b89a, 0.2), floorTex: ['wood_floor', 1.2, 0xe8c8a8], wall: lit(0xf6dde3, 0.3), wallTex: ['plastered_wall', 1.6, 0xf8e0e6], ceil: lit(0xfaf4f2, 0.35), ceilTex: ['plastered_wall', 1.6, 0xfaf4f2], panel: 0, light: 0xffe2ea, k: 12 });
  const white = lit(0xf4f1ec, 0.3), marble = inSurf(S, 'long_white_tiles', 1, 1, { tint: 0xf7f2f2, k: 0.3 }), oak = inSurf(S, 'wood_table', 1, 1, { tint: 0xd8b48a, k: 0.25 });
  const black = lit(0x1d1c1f, 0.05, { roughness: 0.4, metalness: 0.5 }), zinc = lit(0xb8bec4, 0.15, { metalness: 0.8, roughness: 0.35 }), brass = lit(0xc9a35a, 0.2, { metalness: 0.9, roughness: 0.25 });
  const roses = [], bunches = [], sprigs = [];
  const W2 = R.W / 2;

  // ---- the flower wall at the back: a boxwood hedge, roses pushed into it, her name in pink neon ----
  const hedgeW = Math.min(R.W - 1.8, 4.2), hedgeH = 1.85, hy = FLOOR + 0.55 + hedgeH / 2, hz = -0.55;
  const hedge = litMap(canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#1f3a1e'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 2 + Math.random() * 4, a = Math.random() * Math.PI;
      g.fillStyle = `hsl(${105 + Math.random() * 25},${35 + Math.random() * 25}%,${16 + Math.random() * 22}%)`;
      g.beginPath(); g.ellipse(x, y, r * 1.6, r, a, 0, Math.PI * 2); g.fill();
    }
  }), 0.35, { roughness: 0.9 });
  F.b(new THREE.BoxGeometry(0.08, hedgeH, hedgeW), hedge, R.D - 0.06, hy, hz);
  F.b(new THREE.BoxGeometry(0.1, hedgeH + 0.08, 0.05), white, R.D - 0.05, hy, hz - hedgeW / 2 - 0.02);
  F.b(new THREE.BoxGeometry(0.1, hedgeH + 0.08, 0.05), white, R.D - 0.05, hy, hz + hedgeW / 2 + 0.02);
  // roses round the edge of the hedge, thinning towards the middle where the sign is
  const up = new THREE.Vector3(-F.side, 0, 0);   // out of the back wall, towards the street
  for (let i = 0; i < 110; i++) {
    const u = rnd() * 2 - 1, v = rnd() * 2 - 1;
    if (Math.abs(u) < 0.7 && Math.abs(v) < 0.52) continue;   // keep her name clear
    const lz = hz + u * (hedgeW / 2 - 0.08), y = hy + v * (hedgeH / 2 - 0.08);
    const d = R.D - 0.06 - 0.06;
    roses.push({ x: F.wx(d + 0.2), y, z: F.wz(lz), h: 0.3, up, spin: rnd() * 6.28, c: ROSE_PINKS[Math.floor(rnd() * ROSE_PINKS.length)] });
  }
  // her name in neon script, and a smaller line under it
  const neon = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, map: canvasTex(1024, 384, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const [blur, col, lw] of [[40, 'rgba(255,90,160,0.9)', 14], [14, 'rgba(255,150,200,1)', 9], [0, '#fff3f8', 4]]) {
      g.shadowColor = col; g.shadowBlur = blur; g.strokeStyle = col; g.lineWidth = lw; g.lineJoin = 'round';
      g.font = 'italic 600 170px "Bodoni 72", Didot, "Playfair Display", Georgia, serif'; g.strokeText('Desy Ika', w / 2, 150);
    }
    g.shadowBlur = 18; g.shadowColor = 'rgba(255,150,200,1)'; g.fillStyle = '#ffe6f0'; g.font = `600 44px ${LATIN_FONT}`; g.fillText('F L O W E R S   &   C A F É', w / 2, 305);
  }) });
  neon.color = new THREE.Color(1.6, 1.4, 1.5);
  F.b(new THREE.PlaneGeometry(2.6, 0.975).rotateY(-Math.PI / 2), neon, R.D - 0.13, hy + 0.08, hz);
  S.light?.(F.wx(R.D - 0.8), FLOOR + 1.8, F.wz(hz), 0xff7ab0, 6, 4);
  F.act(R.D - 1.0, hz, 'Read the little card in the flowers', () => [
    { who: 'A card tucked into the roses', text: 'For Desy Ika, the brightest flower in Hoshimi.' },
    { text: 'Underneath, in smaller handwriting: "Every rainy night in this town leads back to you."' },
  ], 1.0);

  // ---- tiered stands of zinc buckets along the street-side half of the left wall ----
  const sz = -W2 + 0.42;
  for (let tier = 0; tier < 3; tier++) {
    // the low tier in front, the high one against the wall, so every bucket shows
    const d0 = 0.7, len = Math.min(R.D - 1.9, 2.4), y = FLOOR + 0.06 + tier * 0.3, o = (2 - tier) * 0.24;
    F.b(new THREE.BoxGeometry(len, 0.04, 0.32), white, d0 + len / 2, y + 0.3, sz + o);
    for (const e of [0, len]) F.b(new THREE.BoxGeometry(0.04, y + 0.3 - FLOOR, 0.04), white, d0 + e, (FLOOR + y + 0.3) / 2, sz + o + 0.12);
    for (let k = 0; k < 4; k++) {
      const d = d0 + 0.3 + k * (len - 0.6) / 3, by = y + 0.32;
      F.b(new THREE.CylinderGeometry(0.12, 0.095, 0.24, 16, 1, true), zinc, d, by + 0.12, sz + o);
      F.b(new THREE.TorusGeometry(0.12, 0.008, 6, 20).rotateX(Math.PI / 2), zinc, d, by + 0.24, sz + o);
      bunches.push({ x: F.wx(d), y: by + 0.05, z: F.wz(sz + o), h: 0.62 + rnd() * 0.12, spin: rnd() * 6.28, c: ROSE_PINKS[(tier * 4 + k) % ROSE_PINKS.length] });
    }
  }
  F.solid(0.6, Math.min(R.D - 1.1, 3.2), -W2, sz + 0.75);
  F.act(1.8, sz + 0.95, 'Buy a pink rose ¥300', (api) => { api.addItem('Pink rose'); api.sound.beep(); return [{ who: 'Florist', text: 'One pink rose, wrapped in paper with a ribbon. "For someone special?" she smiles.' }]; }, 0.9);
  // the florist at the wrapping table by the window
  const wd = 0.75, wz2 = -W2 + 1.75;
  F.b(new THREE.BoxGeometry(0.6, 0.05, 1.1), oak, wd + 0.25, FLOOR + 0.9, wz2 + 0.6);
  for (const [a, b] of [[-0.25, 0.1], [0.25, 0.1], [-0.25, 1.1], [0.25, 1.1]]) F.b(new THREE.BoxGeometry(0.04, 0.88, 0.04), black, wd + 0.25 + a, FLOOR + 0.44, wz2 + b);
  F.b(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 16).rotateX(Math.PI / 2), lit(0xf5d6e0, 0.3), wd + 0.25, FLOOR + 0.99, wz2 + 0.75);   // a roll of pink paper
  F.b(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 12), lit(0xd63a6a, 0.2), wd + 0.15, FLOOR + 0.93, wz2 + 0.3);                   // a ribbon spool
  F.solid(wd - 0.05, wd + 0.55, wz2 + 0.05, wz2 + 1.15);

  // ---- the café: two little marble tables by the window, a single rose on each ----
  const cups = [];
  const tz = Math.min(1.45, W2 - 2.4);   // to the right of the way in from the door, clear of the counter
  for (const [d, lz] of [[1.0, tz], [2.6, tz]]) {
    F.b(new THREE.CylinderGeometry(0.34, 0.34, 0.035, 28), marble, d, FLOOR + 0.74, lz);
    F.b(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 10), brass, d, FLOOR + 0.37, lz);
    F.b(new THREE.CylinderGeometry(0.2, 0.22, 0.03, 20), brass, d, FLOOR + 0.02, lz);
    F.b(new THREE.CylinderGeometry(0.03, 0.026, 0.16, 12), lit(0xe8f0f6, 0.2, { transparent: true, opacity: 0.55, roughness: 0.05 }), d + 0.08, FLOOR + 0.84, lz - 0.06);
    roses.push({ x: F.wx(d + 0.08), y: FLOOR + 0.78, z: F.wz(lz - 0.06), h: 0.34, c: 0xf27ea0 });
    for (const e of [-1, 1]) {
      const cd = d + e * 0.52;
      F.model('dining_chair_02', cd, FLOOR, lz, e > 0 ? 0 : Math.PI, { h: 0.86 });
      const cup = F.m(new THREE.CylinderGeometry(0.045, 0.035, 0.08, 14), lit(0xffffff, 0.4), d + e * 0.16, FLOOR + 0.8, lz + 0.08); cup.visible = false; cups.push(cup);
      F.seat(cd, lz, e > 0 ? 0 : Math.PI, FLOOR + 0.47, cd, lz - 0.7, { label: 'Sit down', onSit: (api) => order(api, cup) });
    }
    F.solid(d - 0.36, d + 0.36, lz - 0.36, lz + 0.36);
    pendant(F, d, lz, 2.15, 0xffc0d8, 2.0, 0.11);
  }
  const order = (api, cup) => api.choose('Desy Ika · Café', ['Rose latte ¥520', 'Strawberry shortcake ¥480', 'Sakura tea ¥450', 'Just sit a while'], (k) => {
    if (k === 3) { api.say([{ text: 'Rain on the glass, roses all around. You stay a while.' }]); return; }
    cup.visible = true; api.sound.beep();
    api.say([{ who: 'Barista', text: ['A latte with a rose drawn in the foam, and a little rose syrup underneath.', 'Strawberries, cream, a sponge as soft as a cloud.', 'Pale pink tea; a salted cherry blossom opens slowly in the cup.'][k] }]);
  });

  // ---- the counter at the back right: marble on white panelling, espresso machine, cake under glass ----
  const cd = R.D - 0.75, cw = Math.min(W2 - 0.5, 1.9), cz2 = W2 - 0.25 - cw / 2;
  F.b(new THREE.BoxGeometry(0.55, 1.0, cw), white, cd, FLOOR + 0.5, cz2);
  for (let z = cz2 - cw / 2 + 0.1; z < cz2 + cw / 2; z += 0.12) F.b(new THREE.BoxGeometry(0.02, 0.9, 0.02), lit(0xe8e2dc, 0.25), cd - 0.285, FLOOR + 0.5, z);
  F.b(new THREE.BoxGeometry(0.62, 0.05, cw + 0.08), marble, cd, FLOOR + 1.02, cz2);
  // espresso machine: chrome body, two group heads, a cup rail on top
  const ex = cd + 0.05, ez = cz2 + cw / 2 - 0.45;
  F.b(new RoundedBoxGeometry(0.42, 0.42, 0.62, 2, 0.03), zinc, ex, FLOOR + 1.26, ez);
  F.b(new THREE.BoxGeometry(0.02, 0.3, 0.5), lit(0xf27ea0, 0.4), ex - 0.21, FLOOR + 1.3, ez);
  for (const dz of [-0.14, 0.14]) { F.b(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 12), black, ex - 0.24, FLOOR + 1.12, ez + dz); F.b(new THREE.CylinderGeometry(0.03, 0.025, 0.06, 12), lit(0xffffff, 0.4), ex - 0.26, FLOOR + 1.07, ez + dz); }
  for (let k = 0; k < 5; k++) F.b(new THREE.CylinderGeometry(0.04, 0.032, 0.07, 12), lit(0xffffff, 0.4), ex, FLOOR + 1.51, ez - 0.22 + k * 0.11);
  // the cake under a glass dome, a jar of biscotti, a vase of roses at the end
  const kz = cz2 - cw / 2 + 0.35;
  F.b(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 24), lit(0xfbe3ea, 0.35), cd - 0.05, FLOOR + 1.11, kz);
  F.b(new THREE.CylinderGeometry(0.165, 0.165, 0.02, 24), lit(0xf27ea0, 0.4), cd - 0.05, FLOOR + 1.175, kz);
  for (let k = 0; k < 8; k++) F.b(new THREE.SphereGeometry(0.018, 8, 6), lit(0xd8202e, 0.4), cd - 0.05 + Math.cos(k * 0.785) * 0.12, FLOOR + 1.2, kz + Math.sin(k * 0.785) * 0.12);
  F.b(new THREE.SphereGeometry(0.2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf2f6fa, transparent: true, opacity: 0.22, roughness: 0.03, depthWrite: false }), cd - 0.05, FLOOR + 1.05, kz);
  F.b(new THREE.CylinderGeometry(0.07, 0.07, 0.2, 16), new THREE.MeshStandardMaterial({ color: 0xeef4f8, transparent: true, opacity: 0.35, roughness: 0.05, depthWrite: false }), cd + 0.12, FLOOR + 1.15, kz + 0.3);
  F.b(new THREE.CylinderGeometry(0.06, 0.05, 0.22, 14), lit(0xf4f1ec, 0.35), cd + 0.1, FLOOR + 1.16, cz2 + 0.05);
  bunches.push({ x: F.wx(cd + 0.1), y: FLOOR + 1.08, z: F.wz(cz2 + 0.05), h: 0.5, c: 0xf7a8c0, spin: 1.3 });
  F.solid(cd - 0.32, R.D, cz2 - cw / 2 - 0.05, W2);
  F.person(R.D - 0.25, cz2 - 0.2, Math.PI, 0xf2c6d2);
  // a chalk menu on the wall behind the counter, a shelf of cups
  const menu = litMap(canvasTex(256, 192, (g, w, h) => {
    g.fillStyle = '#26302a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#d8b48a'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = '#ffd6e4'; g.textAlign = 'center'; g.font = 'italic 700 30px Georgia, serif'; g.fillText('Café Menu', w / 2, 38);
    g.font = '600 18px Georgia, serif'; g.fillStyle = '#f5f0e6';
    ['Rose latte  ¥520', 'Sakura tea  ¥450', 'Shortcake  ¥480', 'Pink rose  ¥300'].forEach((t, i) => g.fillText(t, w / 2, 76 + i * 30));
  }), 0.5);
  F.b(new THREE.PlaneGeometry(0.9, 0.68).rotateY(-Math.PI / 2), menu, R.D - 0.01, FLOOR + 1.85, cz2);
  F.b(new THREE.BoxGeometry(0.22, 0.03, cw - 0.2), oak, R.D - 0.11, FLOOR + 1.42, cz2);

  // ---- light, plants and the finishing touches ----
  for (const [d, lz] of [[R.D - 1.4, hz - 1.0], [R.D - 1.4, hz + 1.0]]) pendant(F, d, lz, 2.2, 0xffd0e0, 2.1, 0.12);
  plant(F, R.D - 0.45, -W2 + 0.45, 1.05);
  plant(F, 0.45, W2 - 0.4, 0.9);

  placeRoses(S, 'rose', roses);
  placeRoses(S, 'roses', bunches);
  void sprigs; void cups;
}
