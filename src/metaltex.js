// Painted-metal surface detail drawn once on canvases: plates with panel seams, rivets, vents, a little wear
// (scratched edges, grime) and decals, as colour + normal + roughness maps (the hand-built truck's box uses it).
import * as THREE from 'three';
import { phoneSize } from './textures.js';

const cache = {};
const rng = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

// height field (0..255 grey) → tangent-space normal map
function normalFrom(hc, strength = 2.2) {
  const w = hc.width, h = hc.height, src = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const ctx = out.getContext('2d'), img = ctx.createImageData(w, h), d = img.data;
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x - 1, y) - H(x + 1, y)) * strength, dy = (H(x, y - 1) - H(x, y + 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    d[i] = (dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}
const tex = (c, srgb) => { const t = new THREE.CanvasTexture(phoneSize(c)); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };

// armour plating: { map (white-ish, tinted by the material colour), normalMap, roughnessMap }
export function armourMaps(seed = 7) {
  if (cache['a' + seed]) return cache['a' + seed];
  const S = 512, r = rng(seed);
  const hc = document.createElement('canvas'); hc.width = hc.height = S; const hg = hc.getContext('2d');
  const cc = document.createElement('canvas'); cc.width = cc.height = S; const cg = cc.getContext('2d');
  const rc = document.createElement('canvas'); rc.width = rc.height = S; const rg = rc.getContext('2d');
  hg.fillStyle = '#808080'; hg.fillRect(0, 0, S, S);
  cg.fillStyle = '#f2f2f2'; cg.fillRect(0, 0, S, S);
  rg.fillStyle = '#6a6a6a'; rg.fillRect(0, 0, S, S);   // roughness ~0.42 (G channel is used)
  // panels: split the square into plates, seams are grooves
  const plates = [[0, 0, S, S]];
  for (let k = 0; k < 7; k++) {
    const i = Math.floor(r() * plates.length), [x, y, w, h] = plates[i];
    if (w < 90 || h < 90) continue;
    plates.splice(i, 1);
    if (w > h) { const c = Math.round(w * (0.35 + r() * 0.3)); plates.push([x, y, c, h], [x + c, y, w - c, h]); }
    else { const c = Math.round(h * (0.35 + r() * 0.3)); plates.push([x, y, w, c], [x, y + c, w, h - c]); }
  }
  for (const [x, y, w, h] of plates) {
    // a raised plate with bevelled edges
    const g = hg.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, '#8c8c8c'); g.addColorStop(1, '#7a7a7a');
    hg.fillStyle = g; hg.fillRect(x + 3, y + 3, w - 6, h - 6);
    hg.strokeStyle = '#2a2a2a'; hg.lineWidth = 3; hg.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    hg.strokeStyle = '#a8a8a8'; hg.lineWidth = 1; hg.strokeRect(x + 4.5, y + 4.5, w - 9, h - 9);
    cg.strokeStyle = 'rgba(40,44,52,0.55)'; cg.lineWidth = 2.5; cg.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    // rivets in the corners
    for (const [px, py] of [[x + 10, y + 10], [x + w - 10, y + 10], [x + 10, y + h - 10], [x + w - 10, y + h - 10]]) {
      const rg2 = hg.createRadialGradient(px - 1, py - 1, 0, px, py, 4); rg2.addColorStop(0, '#dcdcdc'); rg2.addColorStop(1, '#707070');
      hg.fillStyle = rg2; hg.beginPath(); hg.arc(px, py, 3.5, 0, Math.PI * 2); hg.fill();
      cg.fillStyle = 'rgba(150,155,165,0.9)'; cg.beginPath(); cg.arc(px, py, 2.5, 0, Math.PI * 2); cg.fill();
    }
    // now and then vent slots
    if (r() < 0.35 && w > 120 && h > 80) {
      const vx = x + w * 0.2, vy = y + h * 0.3, n = 5;
      for (let i = 0; i < n; i++) {
        hg.fillStyle = '#303030'; hg.fillRect(vx, vy + i * 10, w * 0.5, 5);
        cg.fillStyle = 'rgba(20,22,28,0.8)'; cg.fillRect(vx, vy + i * 10, w * 0.5, 5);
        rg.fillStyle = '#9a9a9a'; rg.fillRect(vx, vy + i * 10, w * 0.5, 5);
      }
    }
  }
  // wear: scratches along edges (bare metal shows: lighter, smoother), grime in the seams
  for (let i = 0; i < 140; i++) {
    const x = r() * S, y = r() * S, a = r() * Math.PI, l = 4 + r() * 22;
    cg.strokeStyle = `rgba(190,196,206,${0.15 + r() * 0.35})`; cg.lineWidth = 0.6 + r();
    cg.beginPath(); cg.moveTo(x, y); cg.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); cg.stroke();
    rg.strokeStyle = 'rgba(40,40,40,0.8)'; rg.lineWidth = 1; rg.beginPath(); rg.moveTo(x, y); rg.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); rg.stroke();
  }
  for (let i = 0; i < 30; i++) {
    const x = r() * S, y = r() * S, rad = 20 + r() * 60, g = cg.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(60,58,52,${0.06 + r() * 0.08})`); g.addColorStop(1, 'rgba(60,58,52,0)');
    cg.fillStyle = g; cg.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    const g2 = rg.createRadialGradient(x, y, 0, x, y, rad); g2.addColorStop(0, 'rgba(170,170,170,0.35)'); g2.addColorStop(1, 'rgba(170,170,170,0)');
    rg.fillStyle = g2; rg.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // decals: a unit number, warning chevrons, a small serial
  cg.save(); cg.translate(S * 0.62, S * 0.7);
  cg.fillStyle = 'rgba(30,34,44,0.85)'; cg.font = '900 64px "Chakra Petch", sans-serif'; cg.fillText(String(10 + Math.floor(r() * 89)), 0, 0);
  cg.font = '700 14px "Chakra Petch", sans-serif'; cg.fillText(`HRC-${Math.floor(r() * 9000 + 1000)}`, 0, 22);
  cg.restore();
  for (let i = 0; i < 6; i++) { cg.fillStyle = i % 2 ? 'rgba(240,190,40,0.85)' : 'rgba(20,20,20,0.85)'; cg.beginPath(); const bx = S * 0.08 + i * 14; cg.moveTo(bx, S * 0.9); cg.lineTo(bx + 14, S * 0.9); cg.lineTo(bx + 4, S * 0.96); cg.lineTo(bx - 10, S * 0.96); cg.fill(); }
  const out = { map: tex(cc, true), normalMap: tex(normalFrom(hc, 3)), roughnessMap: tex(rc) };
  cache['a' + seed] = out;
  return out;
}
