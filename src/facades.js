// Detailed building faces, shared by the whole town (world.js, district.js, north.js). A face is given by
// alongZ (it runs along z and looks ±x) or not (runs along x, looks ±z), its fixed x (or z), which way it looks, its
// extent a0..a1 and its height. On it: real window frames and lit/unlit glass, sills and grime, balconies with
// partitions, plants and AC units (apartments) or slab bands and pilasters (offices); and the things that make a
// Japanese street busy: lit signs sticking out from the wall, a banner over the second floor, steel fire escapes,
// cable runs and meters, a billboard on the roof, plant on the roof. Signs come from two shared atlases, so a
// hundred of them still merge into a handful of draw calls.
import * as THREE from 'three';
import * as TX from './textures.js';

const VSIGNS = [['スナック', '#1a0f24', '#ff7ad9'], ['居酒屋', '#2a0e0e', '#ffd27a'], ['焼肉', '#141414', '#ff5a36'], ['カラオケ', '#160b2a', '#9df0ff'], ['麻雀', '#0d2a16', '#e9fff2'],
  ['歯科', '#ffffff', '#1d4fb8'], ['整骨院', '#f6f1e2', '#b3201a'], ['BAR', '#0e0e12', '#ffcf4f'], ['ラーメン', '#2a1205', '#ffefc8'], ['質屋', '#0e2b5c', '#ffe17a'],
  ['美容室', '#f7d6e4', '#9a1b56'], ['占い', '#2a0b3a', '#ffd38a'], ['英会話', '#1f63c6', '#ffffff'], ['ホテル', '#101820', '#7fe0ff'], ['寿司', '#f2ecdc', '#1a1a1a'], ['塾', '#ffe14a', '#1b1b1b']];
const HSIGNS = [['2F 麻雀 東風', '#14532d', '#f4ffe9'], ['テナント募集', '#ffffff', '#c4182b'], ['ほしみ法律事務所', '#0e2b5c', '#ffffff'], ['3F BAR NOCTURNE', '#140c1c', '#ffcf4f'],
  ['ネイル & まつ毛', '#f7d6e4', '#9a1b56'], ['学習塾 ひかり', '#ffe14a', '#1b1b1b'], ['マッサージ 60分', '#ffffff', '#2f8f5b'], ['雨夜ラジオ 88.5', '#111111', '#5cc8ff'],
  ['HOSHI BEER', '#b3201a', '#fff2c0'], ['星見銀行', '#0e2b5c', '#ffffff'], ['ほしみ不動産', '#1d6b3a', '#ffffff'], ['CAFE & DINING 2F', '#2a1c12', '#ffd7a1'],
  ['歯科クリニック', '#ffffff', '#1d4fb8'], ['カラオケ 歌広場', '#6a1fb3', '#ffe76b'], ['ゲームセンター', '#101820', '#ff7ad9'], ['月極駐車場', '#1e3a8a', '#ffffff']];

// a canvas atlas: cells × rows of signs
function atlas(list, cw, ch, cols, vertical) {
  const rows = Math.ceil(list.length / cols), c = document.createElement('canvas');
  c.width = cw * cols; c.height = ch * rows;
  const g = c.getContext('2d');
  list.forEach(([text, bg, fg], i) => {
    const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
    g.fillStyle = bg; g.fillRect(x, y, cw, ch);
    g.strokeStyle = fg; g.lineWidth = Math.max(3, cw * 0.04); g.strokeRect(x + 6, y + 6, cw - 12, ch - 12);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (vertical) {
      const chars = [...text], n = chars.length, s = Math.min(cw * 0.66, (ch - 30) / n);
      g.font = `900 ${s}px ${TX.JP_FONT}`;
      chars.forEach((k, j) => g.fillText(k, x + cw / 2, y + 15 + s * (j + 0.55) + (ch - 30 - s * n) / 2));
    } else {
      let s = ch * 0.55; g.font = `900 ${s}px ${TX.JP_FONT}`;
      while (g.measureText(text).width > cw * 0.88 && s > 10) { s -= 2; g.font = `900 ${s}px ${TX.JP_FONT}`; }
      g.fillText(text, x + cw / 2, y + ch / 2 + 2);
    }
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return { t, cols, rows };
}
// a plane showing one atlas cell
function cellGeo(w, h, A, i) {
  const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
  const cu = (i % A.cols) / A.cols, cv = 1 - (Math.floor(i / A.cols) + 1) / A.rows;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, cu + uv.getX(k) / A.cols, cv + uv.getY(k) / A.rows);
  return g;
}

// the big lit adverts on steel frames over the rooftops: gradient boards with a headline, a line under it and a
// mark, painted once into one atlas (fictional brands of the town)
const ROOF_ADS = [
  ['HOSHI BEER', '生ビール 始めました', '#7a0d12', '#d42a2a', '#fff2c0', 'sun'],
  ['SORA MOBILE 5G', 'つながる、雨の夜も。', '#04224a', '#1176d8', '#ffffff', 'wave'],
  ['KIRA COFFEE', '深煎り ブレンド ¥180', '#1e130b', '#5a3a20', '#ffd7a1', 'cup'],
  ['雨夜ラジオ 88.5', 'AMEYORU FM — 24h', '#0b0b12', '#2b2350', '#5cc8ff', 'wave'],
  ['TSUKINO LINE', '星見 ⇄ 月野 6分', '#0b3a2a', '#1d8a5a', '#e9fff2', 'line'],
  ['ほしみ不動産', '賃貸・売買 0120-88-2026', '#0e3a1e', '#2f8f4e', '#ffffff', 'house'],
  ['NEON NOODLE', '深夜2時まで営業', '#2a0a1c', '#b3205e', '#ffe76b', 'bowl'],
  ['星見銀行', 'HOSHIMI BANK', '#0e2b5c', '#2456b8', '#ffffff', 'star'],
];
function adAtlas() {
  const cw = 512, ch = 192, cols = 2, rows = Math.ceil(ROOF_ADS.length / cols), c = document.createElement('canvas');
  c.width = cw * cols; c.height = ch * rows;
  const g = c.getContext('2d');
  ROOF_ADS.forEach(([head, sub, a, b, fg, mark], i) => {
    const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
    const gr = g.createLinearGradient(x, y, x + cw, y + ch); gr.addColorStop(0, a); gr.addColorStop(1, b);
    g.fillStyle = gr; g.fillRect(x, y, cw, ch);
    // a soft light from the top (the uplights) and a thin frame
    const sh = g.createLinearGradient(x, y, x, y + ch); sh.addColorStop(0, 'rgba(255,255,255,0.16)'); sh.addColorStop(0.5, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.18)');
    g.fillStyle = sh; g.fillRect(x, y, cw, ch);
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 3; g.strokeRect(x + 7, y + 7, cw - 14, ch - 14);
    // the mark on the left
    const mx = x + 92, my = y + ch / 2;
    g.save(); g.fillStyle = fg; g.strokeStyle = fg; g.lineWidth = 7; g.lineCap = 'round';
    if (mark === 'sun') { g.beginPath(); g.arc(mx, my, 34, 0, Math.PI * 2); g.fill(); for (let k = 0; k < 12; k++) { const t = k * Math.PI / 6; g.beginPath(); g.moveTo(mx + Math.cos(t) * 44, my + Math.sin(t) * 44); g.lineTo(mx + Math.cos(t) * 58, my + Math.sin(t) * 58); g.stroke(); } }
    else if (mark === 'wave') { for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(mx - 30, my + 26, 22 + k * 20, -Math.PI / 2, 0); g.stroke(); } g.beginPath(); g.arc(mx - 30, my + 26, 8, 0, Math.PI * 2); g.fill(); }
    else if (mark === 'cup') { g.fillRect(mx - 32, my - 20, 52, 54); g.beginPath(); g.arc(mx + 26, my + 6, 16, -Math.PI / 2, Math.PI / 2); g.stroke(); for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(mx - 20 + k * 16, my - 34); g.quadraticCurveTo(mx - 10 + k * 16, my - 46, mx - 20 + k * 16, my - 58); g.stroke(); } }
    else if (mark === 'line') { g.beginPath(); g.moveTo(mx - 52, my + 20); g.lineTo(mx + 52, my - 20); g.stroke(); for (const k of [-1, 0, 1]) { g.beginPath(); g.arc(mx + k * 46, my - k * 18, 11, 0, Math.PI * 2); g.fill(); } }
    else if (mark === 'house') { g.beginPath(); g.moveTo(mx - 46, my); g.lineTo(mx, my - 44); g.lineTo(mx + 46, my); g.closePath(); g.fill(); g.fillRect(mx - 32, my, 64, 40); }
    else if (mark === 'bowl') { g.beginPath(); g.arc(mx, my, 46, 0, Math.PI); g.fill(); for (let k = 0; k < 2; k++) { g.beginPath(); g.moveTo(mx + 10 + k * 14, my - 4); g.lineTo(mx + 40 + k * 14, my - 56); g.stroke(); } }
    else { g.beginPath(); for (let k = 0; k < 10; k++) { const r = k % 2 ? 20 : 48, t = -Math.PI / 2 + k * Math.PI / 5; g.lineTo(mx + Math.cos(t) * r, my + Math.sin(t) * r); } g.closePath(); g.fill(); }
    g.restore();
    // the words
    g.fillStyle = fg; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    let s = 64; g.font = `900 ${s}px ${TX.JP_FONT}`;
    while (g.measureText(head).width > cw - 200 && s > 20) { s -= 2; g.font = `900 ${s}px ${TX.JP_FONT}`; }
    g.fillText(head, x + 172, y + ch / 2 + 6);
    g.globalAlpha = 0.85; let s2 = 28; g.font = `700 ${s2}px ${TX.JP_FONT}`;
    while (g.measureText(sub).width > cw - 200 && s2 > 12) { s2 -= 1; g.font = `700 ${s2}px ${TX.JP_FONT}`; }
    g.fillText(sub, x + 174, y + ch / 2 + 48); g.globalAlpha = 1;
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return { t, cols, rows };
}

export function makeFacades(F) {
  const { batch, box, std, surf, SF, FINISHES, winMat, windowGeo, props, roofMat } = F;
  const rn = TX.mulberry32(F.seed ?? 31337);
  const M = F.mats;   // frame, sill, slab, rail, balc, part, cap, tank, steel, meter, streak
  const VA = atlas(VSIGNS, 96, 384, 8, true), HA = atlas(HSIGNS, 512, 96, 2, false);
  const vMat = new THREE.MeshBasicMaterial({ map: VA.t, color: new THREE.Color(1.35, 1.35, 1.35) });
  const hMat = new THREE.MeshBasicMaterial({ map: HA.t, color: new THREE.Color(1.2, 1.2, 1.2) });
  const signEdge = std(0x1a1b1e, { roughness: 0.5, metalness: 0.4 });
  const iron = std(0x33363b, { roughness: 0.45, metalness: 0.7 });
  const cable = std(0x111214, { roughness: 0.7 });
  const leaf = std(0x3a5f34, { roughness: 0.85 }), pot = std(0x7a4a32, { roughness: 0.8 });
  const lampLit = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.1, 1.6) });
  // the roofs get their own dice, so the faces below keep the layout they had
  const rr = TX.mulberry32((F.seed ?? 31337) + 77);
  const AD = adAtlas(), adMat = new THREE.MeshBasicMaterial({ map: AD.t, color: new THREE.Color(1.3, 1.3, 1.3) });
  const adBack = std(0x2a2d32, { roughness: 0.6, metalness: 0.5 });
  const lampHead = std(0x1c1e22, { roughness: 0.4, metalness: 0.7 });
  // aviation obstruction lights: medium-intensity ones flash red together; low ones burn steady
  const aviFlash = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.2, 0.1) }); aviFlash.userData.mutable = true;
  const aviSteady = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 0.12, 0.06) });
  const aviGeo = new THREE.SphereGeometry(0.16, 8, 6);
  const streakGeo = (w, h) => {
    const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv, o = rn();
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (w / 1.2) + o);
    return g;
  };
  // wall finishes for a block whose faces get the real windows (no painted window grid underneath them)
  function blockMats(alongZ, w, d, h) {
    const roof = SF ? surf('concrete_floor_02', alongZ ? d / 3 : w / 3, alongZ ? w / 3 : d / 3, { color: 0x8a8d92, wet: 0.7 }) : roofMat;
    if (!SF) { const p = std(0x5d6470, { roughness: 0.9 }); return [p, p, roof, roof, p, p]; }
    const [name, tile, tints] = FINISHES[Math.floor(rn() * FINISHES.length)];
    const tint = tints[Math.floor(rn() * tints.length)];
    const along = surf(name, w / tile, h / tile, { color: tint, wet: 0.85 }), across = surf(name, d / tile, h / tile, { color: tint, wet: 0.85 });
    return alongZ ? [across, across, roof, roof, along, along] : [along, along, roof, roof, across, across];
  }
  function wallMat(len, h) {
    if (!SF) return std(0x5d6470, { roughness: 0.9 });
    const [name, tile, tints] = FINISHES[Math.floor(rn() * FINISHES.length)];
    return surf(name, len / tile, h / tile, { color: tints[Math.floor(rn() * tints.length)], wet: 0.85 });
  }

  // ---------- the face itself ----------
  // d: how deep the block is behind it (parapets, roof); top: build the roof edge too; busy: 0..1 how much clutter
  function face(alongZ, fixed, fc, a0, a1, h, { style = rn() < 0.55 ? 'apt' : 'office', d = 10, top = true, busy = 1, acFloors = 4 } = {}) {
    const w = a1 - a0, ca = (a0 + a1) / 2;
    if (w < 2.5 || h < 5) return;
    const Q = (o, t) => (alongZ ? [fixed + fc * o, t] : [t, fixed + fc * o]);
    const Bx = (across, hh, along) => (alongZ ? box(across, hh, along) : box(along, hh, across));
    const ry = alongZ ? (fc > 0 ? Math.PI / 2 : -Math.PI / 2) : (fc > 0 ? 0 : Math.PI);
    const floors = Math.max(2, Math.floor(h / 3)), fh = h / floors, cols = Math.max(2, Math.round(w / 2.4)), cw = w / cols;
    const ww = cw * 30 / 48, wh = fh * 34 / 64;
    const at = (o, t, y, g, m, r = 0) => { const [x, z] = Q(o, t); batch(g, m, x, y, z, r); };
    for (let f = 0; f < floors - 1; f++) {
      const yc = h - f * fh - fh * 29 / 64;
      for (let c = 0; c < cols; c++) {
        const t = a0 + (c + 0.5) * cw, lit = rn() < 0.38;
        at(0.012, t, yc, windowGeo(ww, wh, lit ? Math.floor(rn() * TX.WINDOW_LIT) : TX.WINDOW_LIT + Math.floor(rn() * (TX.WINDOW_CELLS - TX.WINDOW_LIT))), winMat, ry);
        if (rn() < 0.7) at(0.009, t, yc - wh / 2 - 0.4, streakGeo(ww + 0.12, 0.6 + rn() * 0.6), M.streak, ry);
        at(0.04, t, yc + wh / 2 + 0.025, Bx(0.08, 0.05, ww + 0.1), M.frame);
        at(0.09, t, yc - wh / 2 - 0.03, Bx(0.18, 0.06, ww + 0.18), M.sill);
        at(0.04, t - ww / 2 - 0.025, yc, Bx(0.08, wh, 0.05), M.frame);
        at(0.04, t + ww / 2 + 0.025, yc, Bx(0.08, wh, 0.05), M.frame);
        at(0.03, t, yc, Bx(0.05, wh, 0.035), M.frame);
      }
    }
    if (style === 'apt') {
      const rail = rn() < 0.5;
      for (let k = 2; k < floors; k++) {
        const y = k * fh;
        at(0.47, ca, y, Bx(0.95, 0.14, w - 0.3), M.slab);
        if (rail) {
          at(0.92, ca, y + 1.07, Bx(0.06, 0.05, w - 0.3), M.rail);
          at(0.92, ca, y + 0.14, Bx(0.04, 0.04, w - 0.3), M.rail);
          for (let t = a0 + 0.22; t < a1 - 0.16; t += 0.12) at(0.92, t, y + 0.6, box(0.022, 0.92, 0.022), M.rail);
        } else {
          at(0.92, ca, y + 0.55, Bx(0.06, 1.0, w - 0.3), M.balc);
          at(0.93, ca, y + 1.08, Bx(0.08, 0.05, w - 0.3), M.rail);
        }
        for (let c = 0; c <= cols; c += 2) at(0.47, Math.min(a1 - 0.15, Math.max(a0 + 0.15, a0 + c * cw)), y + fh / 2, Bx(0.92, fh - 0.16, 0.05), M.part);
        for (let c = 0; c < cols; c++) {
          const r = rn();
          if (k <= acFloors && r < 0.28) { const [x, z] = Q(0.6, a0 + (c + 0.72) * cw); props.ac.push({ x, y: y + 0.07, z, ry, s: 0.72 }); }
          else if (r < 0.45 * busy) {
            // a pot plant or two on the balcony
            const t = a0 + (c + 0.3 + rn() * 0.4) * cw;
            at(0.7, t, y + 0.22, box(0.26, 0.3, 0.26), pot);
            at(0.7, t, y + 0.52, new THREE.IcosahedronGeometry(0.22 + rn() * 0.1, 1), leaf);
          } else if (r < 0.55 * busy) {
            // washing on a pole
            const t = a0 + (c + 0.5) * cw;
            at(0.72, t, y + fh - 0.4, Bx(0.02, 0.02, cw * 0.85), M.rail);
            for (let i = 0; i < 3; i++) at(0.72, t - cw * 0.28 + i * cw * 0.28, y + fh - 0.66, Bx(0.012, 0.42 + rn() * 0.2, 0.3), [M.towel0, M.towel1, M.towel2][i % 3]);
          }
        }
      }
    } else {
      for (let k = 2; k < floors; k++) at(0.15, ca, k * fh - 0.1, Bx(0.3, 0.16, w), M.slab);
      for (let c = 1; c < cols; c++) at(0.11, a0 + c * cw, fh * 2 + (h - fh * 2) / 2 - 0.15, Bx(0.22, h - fh * 2 + 0.3, 0.14), M.slab);
      for (let k = 2; k < Math.min(floors, acFloors + 1); k++) for (let c = 0; c < cols; c++) {
        if (rn() > 0.1) continue;
        const [x, z] = Q(0.17, a0 + (c + 0.8) * cw); props.ac.push({ x, y: k * fh - 0.95, z, ry, s: 0.68 });
      }
    }
    extras(alongZ, fixed, fc, a0, a1, h, { style, busy, floors, fh });
    if (!top) return;
    // parapet with coping all round the roof, a downpipe and meters
    at(0, ca, h + 0.37, Bx(0.25, 0.75, w), M.cap);
    at(-d + 0.12, ca, h + 0.37, Bx(0.25, 0.75, w), M.cap);
    at(-d / 2, a0 + 0.1, h + 0.37, Bx(d, 0.75, 0.2), M.cap);
    at(-d / 2, a1 - 0.1, h + 0.37, Bx(d, 0.75, 0.2), M.cap);
    at(0, ca, h + 0.77, Bx(0.34, 0.06, w + 0.1), M.sill);
    { const [x, z] = Q(0.14, a0 + 0.3); for (let y = 0; y < h - 1.2; y += 1) props.pipe.push({ x, y, z }); props.funnel.push({ x, y: h - 1.2, z }); }
    if (rn() < 0.7) at(0.09, a0 + 0.85, 1.55, Bx(0.18, 0.42, 0.3), M.meter);
    roof(Q, -d / 2, ca, w, d, h, { fc, alongZ, fixed, busy });
  }

  // ---------- what makes a street busy: signs, fire escapes, cables, lamps ----------
  function extras(alongZ, fixed, fc, a0, a1, h, { style = 'apt', busy = 1, floors = Math.max(2, Math.floor(h / 3)), fh = h / Math.max(2, Math.floor(h / 3)) } = {}) {
    const w = a1 - a0;
    const Q = (o, t) => (alongZ ? [fixed + fc * o, t] : [t, fixed + fc * o]);
    const Bx = (across, hh, along) => (alongZ ? box(across, hh, along) : box(along, hh, across));
    const ry = alongZ ? (fc > 0 ? Math.PI / 2 : -Math.PI / 2) : (fc > 0 ? 0 : Math.PI);
    const at = (o, t, y, g, m, r = 0) => { const [x, z] = Q(o, t); batch(g, m, x, y, z, r); };
    // lit signs sticking out from the wall, two-sided, on a bracket
    const nV = h >= 9 ? (rn() < 0.75 * busy ? 1 : 0) + (w > 10 && rn() < 0.45 * busy ? 1 : 0) : 0;
    for (let i = 0; i < nV; i++) {
      const t = i === 0 ? a1 - 0.6 : a0 + 0.6, sh = Math.min(h - 4.5, 2.2 + rn() * 2.2), y = 4.2 + sh / 2 + rn() * Math.max(0, h - 5 - sh);
      if (y + sh / 2 > h - 0.3) continue;
      const cell = Math.floor(rn() * VSIGNS.length), sw = 0.7;
      // the sign's two faces look along the street (± along the face)
      const ry2 = alongZ ? 0 : Math.PI / 2;
      for (const s of [1, -1]) at(0.25 + sw / 2, t + s * 0.1, y, cellGeo(sw, sh, VA, cell), vMat, ry2 + (s < 0 ? Math.PI : 0));
      at(0.25 + sw / 2, t, y, Bx(sw + 0.08, sh + 0.08, 0.18), signEdge);
      at(0.12, t, y + sh / 2 - 0.2, Bx(0.3, 0.05, 0.05), iron); at(0.12, t, y - sh / 2 + 0.2, Bx(0.3, 0.05, 0.05), iron);
    }
    // a banner across the second floor (over the shop), flat on the wall
    if (floors >= 3 && rn() < 0.5 * busy) {
      const bw = Math.min(w - 1.2, 5.5), t = a0 + 0.6 + bw / 2 + rn() * Math.max(0, w - 1.2 - bw);
      at(0.06, t, fh + 1.1, cellGeo(bw, bw * 96 / 512 * 1.4, HA, Math.floor(rn() * HSIGNS.length)), hMat, ry);
      at(0.03, t, fh + 1.1, Bx(0.05, bw * 96 / 512 * 1.4 + 0.1, bw + 0.1), signEdge);
    }
    // a steel fire escape down one end of the taller ones: landings, flights, railings
    if (floors >= 4 && rn() < (style === 'apt' ? 0.35 : 0.2) * busy && w > 7) {
      const t0 = a0 + 0.4, L = 3.2, ang = Math.atan2(fh, L - 0.8);
      for (let k = 1; k < floors; k++) {
        const y = k * fh;
        at(0.6, t0 + L / 2, y, Bx(1.1, 0.06, L), iron);
        at(1.12, t0 + L / 2, y + 0.5, Bx(0.04, 0.04, L), iron); at(1.12, t0 + L / 2, y + 1.0, Bx(0.04, 0.04, L), iron);
        for (let s = 0; s <= 4; s++) at(1.12, t0 + s * L / 4, y + 0.5, box(0.04, 1.0, 0.04), iron);
        // the flight down to the landing below, alternating direction
        const dir = k % 2 ? 1 : -1, len = Math.hypot(fh, L - 0.8);
        const flight = alongZ ? box(0.75, 0.05, len).rotateX(dir * ang) : box(len, 0.05, 0.75).rotateZ(-dir * ang);
        at(0.6, t0 + L / 2, y - fh / 2, flight, iron);
      }
      // the ladder that drops from the first landing
      at(0.95, t0 + 0.3, fh / 2 + 0.3, box(0.04, fh - 0.6, 0.04), iron); at(0.95, t0 + 0.7, fh / 2 + 0.3, box(0.04, fh - 0.6, 0.04), iron);
    }
    // cables down the wall from the roof, a lamp over the side door
    if (rn() < 0.6 * busy) for (let i = 0; i < 2 + Math.floor(rn() * 2); i++) at(0.06 + i * 0.03, a1 - 0.3 - i * 0.07, h / 2, new THREE.CylinderGeometry(0.012, 0.012, h - 0.5, 4), cable);
    if (rn() < 0.5 * busy) { at(0.12, a0 + 1.4, 2.6, Bx(0.18, 0.12, 0.3), iron); at(0.2, a0 + 1.4, 2.53, Bx(0.12, 0.02, 0.24), lampLit); }
  }

  // ---------- the roof: water tank, aerials, AC condensers, a dish; a billboard on the tall ones ----------
  function roof(Q, oc, ca, w, d, h, { fc = 1, alongZ = true, busy = 1 } = {}) {
    const at = (o, t, y, g, m) => { const [x, z] = Q(o, t); batch(g, m, x, y, z); };
    if (rn() < 0.55) {
      const o = oc + (rn() - 0.5) * Math.min(2, d * 0.3), t = ca + (rn() - 0.5) * w * 0.4;
      at(o, t, h + 1.6, new THREE.CylinderGeometry(0.72, 0.72, 1.3, 18), M.tank);
      at(o, t, h + 2.27, new THREE.CylinderGeometry(0.74, 0.74, 0.06, 18), M.steel);
      for (const [lo, lt] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) at(o + lo, t + lt, h + 0.47, box(0.07, 0.95, 0.07), M.steel);
      at(o, t, h + 0.95, box(1.15, 0.06, 1.15), M.steel);
    }
    if (rn() < 0.5) {
      const o = oc - 1, t = ca + (rn() - 0.5) * (w - 2);
      at(o, t, h + 1.2, new THREE.CylinderGeometry(0.02, 0.025, 2.4, 6), M.steel);
      for (let i = 0; i < 4; i++) at(o, t, h + 1.7 + i * 0.18, box(0.9 - i * 0.12, 0.02, 0.02), M.steel);
    }
    // a row of AC condensers, and sometimes a satellite dish
    if (rn() < 0.6 * busy) for (let i = 0; i < 2 + Math.floor(rn() * 3); i++) {
      const o = oc + (rn() - 0.5) * d * 0.5, t = ca - w * 0.3 + i * 1.1;
      at(o, t, h + 0.4, box(0.8, 0.6, 0.35), M.meter);
      at(o, t, h + 0.42, new THREE.CylinderGeometry(0.22, 0.22, 0.37, 14).rotateX(Math.PI / 2), M.steel);
    }
    if (rn() < 0.3) at(oc + 1, ca + w * 0.3, h + 0.9, new THREE.SphereGeometry(0.45, 12, 8, 0, Math.PI * 2, 0, 1.0).rotateX(-0.9), M.meter);
    if (h >= 15) at(oc, ca + w / 2 - 2.2, h + 1.3, box(3.0, 2.6, 3.2), M.part);
    // a lit billboard on a steel frame, facing the street
    let sign = false;
    if (h >= 15 && rn() < 0.3 * busy && w > 7) {
      sign = true;
      const bw = Math.min(w - 2, 8), bh = bw * 96 / 512 * 1.6, t = ca;
      const ry = alongZ ? (fc > 0 ? Math.PI / 2 : -Math.PI / 2) : (fc > 0 ? 0 : Math.PI);
      const [x, z] = Q(-1.2, t);
      batch(cellGeo(bw, bh, HA, Math.floor(rn() * HSIGNS.length)), hMat, x + (alongZ ? fc * 0.12 : 0), h + 1.6 + bh / 2, z + (alongZ ? 0 : fc * 0.12), ry);
      const Bx = (across, hh, along) => (alongZ ? box(across, hh, along) : box(along, hh, across));
      at(-1.2, t, h + 1.6 + bh / 2, Bx(0.2, bh + 0.2, bw + 0.2), signEdge);
      for (const s of [-1, 1]) at(-1.4, t + s * (bw / 2 - 0.4), h + 0.8 + bh / 4, box(0.12, 1.6 + bh / 2, 0.12), iron);
      at(-1.0, t, h + 1.55, Bx(0.6, 0.06, bw), iron);
    }
    roofMore(Q, at, oc, ca, w, d, h, { fc, alongZ, busy, sign });
  }

  // ---------- more on the roofs: a guard rail, big lit adverts with their uplights, a sign tower, phone masts,
  // red aviation lights on the tall ones ----------
  function roofMore(Q, at, oc, ca, w, d, h, { fc, alongZ, busy, sign }) {
    const ry = alongZ ? (fc > 0 ? Math.PI / 2 : -Math.PI / 2) : (fc > 0 ? 0 : Math.PI);
    const Bx = (across, hh, along) => (alongZ ? box(across, hh, along) : box(along, hh, across));
    // a brace in the plane of the street face (dy up over dt along)
    const brace = (o, t, y, dt, dy) => { const len = Math.hypot(dt, dy), a = Math.atan2(dt, dy); at(o, t, y, alongZ ? box(0.05, len, 0.05).rotateX(a) : box(0.05, len, 0.05).rotateZ(-a), iron); };
    // a steel guard rail on top of the street-side parapet
    if (rr() < 0.4) {
      at(0.02, ca, h + 1.25, Bx(0.05, 0.05, w - 0.3), M.rail); at(0.02, ca, h + 0.98, Bx(0.04, 0.04, w - 0.3), M.rail);
      for (let t = a0of(ca, w) + 0.15; t <= ca + w / 2 - 0.1; t += 1.5) at(0.02, t, h + 1.02, box(0.05, 0.5, 0.05), M.rail);
    }
    let tall = false;
    // a big lit advert over the street: the board on a lattice frame, a catwalk and uplights along its foot
    if (!sign && h >= 12 && w > 6.5 && rr() < 0.42 * busy) {
      tall = true;
      const bw = Math.min(w - 1.6, 9), bh = bw * 192 / 512, t = ca + (rr() - 0.5) * Math.max(0, w - 1.6 - bw), y0 = h + 2.1, o = -1.7;
      at(o, t, y0 + bh / 2, cellGeo(bw, bh, AD, Math.floor(rr() * ROOF_ADS.length)), adMat, ry);
      at(o - 0.09, t, y0 + bh / 2, Bx(0.16, bh + 0.16, bw + 0.16), adBack);
      at(o - 0.02, t, y0 + bh + 0.06, Bx(0.08, 0.12, bw + 0.2), signEdge);
      const n = Math.max(2, Math.round(bw / 2.6));
      for (let i = 0; i <= n; i++) {
        const tt = t - bw / 2 + 0.2 + i * (bw - 0.4) / n;
        at(o - 0.3, tt, (h + y0 + bh) / 2, box(0.12, y0 + bh - h, 0.12), iron);
        if (i < n) { const dt = (bw - 0.4) / n; brace(o - 0.3, tt + dt / 2, h + (y0 - h) / 2 + 0.1, dt, y0 - h - 0.2); }
      }
      // catwalk with a rail, and a lamp on an arm every couple of metres shining up the face
      at(o + 0.35, t, y0 - 0.1, Bx(0.8, 0.05, bw), iron);
      at(o + 0.72, t, y0 + 0.4, Bx(0.04, 0.04, bw), iron);
      for (let tt = t - bw / 2 + 0.9; tt < t + bw / 2 - 0.5; tt += 1.8) {
        at(o + 0.7, tt, y0 + 0.05, Bx(0.04, 0.3, 0.04), iron);
        at(o + 0.95, tt, y0 + 0.28, Bx(0.5, 0.04, 0.04), iron);
        at(o + 1.15, tt, y0 + 0.36, Bx(0.22, 0.14, 0.26), lampHead);
        at(o + 1.03, tt, y0 + 0.44, Bx(0.02, 0.1, 0.2), lampLit);
      }
    } else if (h >= 15 && rr() < 0.2 * busy) {
      // a tall sign tower on the roof's front edge: a vertical board on both sides of a lattice mast
      tall = true;
      const sh = 4.2 + rr() * 1.6, t = rr() < 0.5 ? ca - w / 2 + 1.4 : ca + w / 2 - 1.4, o = -0.9, y0 = h + 1.0, cell = Math.floor(rr() * VSIGNS.length);
      for (const s of [1, -1]) at(o + s * 0.13, t, y0 + sh / 2, cellGeo(1.25, sh, VA, cell), vMat, ry + (s < 0 ? Math.PI : 0));
      at(o, t, y0 + sh / 2, Bx(0.22, sh + 0.1, 1.33), signEdge);
      for (const s of [-1, 1]) at(o - 0.4, t + s * 0.5, h + (sh + 1.2) / 2, box(0.1, sh + 1.2, 0.1), iron);
      for (let k = 0; k < 3; k++) brace(o - 0.4, t, h + 0.6 + k * (sh / 3), 1.0, sh / 3);
      at(o, t, y0 + sh + 0.25, aviGeo, aviSteady);
    }
    // a phone mast with three panel antennas on the back corner of offices and tall blocks
    if (h >= 18 && rr() < 0.28) {
      // at the back of the a1 end, clear of the stair houses (a0 end in world.js, mid-depth in roof())
      const o = oc - d * 0.38, t = ca + w / 2 - 1.0, mh = 4 + rr() * 3;
      at(o, t, h + mh / 2, new THREE.CylinderGeometry(0.07, 0.09, mh, 8), M.steel);
      for (let k = 0; k < 3; k++) { const a = k * 2.09; const [x, z] = Q(o + Math.cos(a) * 0.22, t + Math.sin(a) * 0.22); batch(box(0.26, 1.3, 0.09), M.part, x, h + mh - 0.8, z, a + Math.PI / 2); }
      at(o, t, h + mh + 0.1, aviGeo, aviSteady);
      tall = true;
    }
    // obstruction lights at the front corners of the tall blocks (and of the masts and sign frames above)
    if (h >= 27 || (tall && h >= 21)) {
      const m = h >= 33 && rr() < 0.6 ? aviFlash : aviSteady;
      for (const s of [-1, 1]) { at(0.05, ca + s * (w / 2 - 0.35), h + 0.95, aviGeo, m); at(0.05, ca + s * (w / 2 - 0.35), h + 0.85, box(0.08, 0.12, 0.08), iron); }
    }
  }
  const a0of = (ca, w) => ca - w / 2;
  // the roof clutter for a block whose face is built elsewhere (world.js facade(): it has its own tank and aerial):
  // condensers, a dish, then everything in roofMore. Own dice, so the town's layout doesn't shift.
  function roofExtra(alongZ, fixed, fc, a0, a1, h, d, { busy = 1, sign = false } = {}) {
    const w = a1 - a0, ca = (a0 + a1) / 2, oc = -d / 2;
    if (w < 3 || h < 6) return;
    const Q = (o, t) => (alongZ ? [fixed + fc * o, t] : [t, fixed + fc * o]);
    const at = (o, t, y, g, m, r = 0) => { const [x, z] = Q(o, t); batch(g, m, x, y, z, r); };
    if (rr() < 0.65 * busy) for (let i = 0; i < 2 + Math.floor(rr() * 3); i++) {
      const o = oc + (rr() - 0.2) * d * 0.4, t = ca - w * 0.3 + i * 1.0;
      if (t > a1 - 0.6) break;
      at(o, t, h + 0.32, alongZ ? box(0.35, 0.6, 0.8) : box(0.8, 0.6, 0.35), M.meter);
      at(o + 0.06, t, h + 0.34, new THREE.CylinderGeometry(0.22, 0.22, 0.26, 14).rotateX(alongZ ? 0 : Math.PI / 2).rotateZ(alongZ ? Math.PI / 2 : 0), M.steel);
    }
    if (rr() < 0.3) at(oc - 1, a0 + 1.2, h + 0.8, new THREE.SphereGeometry(0.42, 12, 8, 0, Math.PI * 2, 0, 1.0).rotateX(-0.9), M.meter);
    // a run of pipes and a vent hood or two
    if (rr() < 0.5) { at(oc + 0.6, ca, h + 0.18, (alongZ ? box(0.12, 0.12, w * 0.6) : box(w * 0.6, 0.12, 0.12)), M.steel); at(oc + 0.6, ca + w * 0.3, h + 0.5, new THREE.CylinderGeometry(0.1, 0.1, 0.7, 10), M.steel); at(oc + 0.6, ca + w * 0.3, h + 0.9, new THREE.ConeGeometry(0.2, 0.16, 10), M.steel); }
    roofMore(Q, at, oc, ca, w, d, h, { fc, alongZ, busy, sign });
  }

  // the flashing lights: about 40 flashes a minute, 0.4 s on
  const tick = (t) => { const on = (t % 1.5) < 0.4; aviFlash.color.setRGB(on ? 3 : 0.1, on ? 0.2 : 0.008, on ? 0.1 : 0.006); };
  return { face, extras, roof, roofExtra, blockMats, wallMat, vMat, hMat, adMat, adAtlas: AD, adCell: (w, h, i) => cellGeo(w, h, AD, i), adCount: ROOF_ADS.length, aviSteady, aviFlash, aviGeo, lampHead, lampLit, tick };
}
