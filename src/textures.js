// Every texture in the game is painted on a canvas here — no image files.
import * as THREE from 'three';

export const JP_FONT = '"Noto Sans JP","Hiragino Sans","Yu Gothic",sans-serif';
export const LATIN_FONT = '"Chakra Petch","Noto Sans JP",sans-serif';

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function make(w, h, draw, { srgb = true, repeat = false } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function noise(g, w, h, n, alpha, rnd = Math.random, light = false) {
  const v = light ? 255 : 0;
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(${v},${v},${v},${rnd() * alpha})`;
    g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
  }
}

function rrect(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }

function star(g, cx, cy, R, r, n) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + i * Math.PI / n, rr = i % 2 ? r : R;
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath(); g.fill();
}

// ---------- ground ----------
export function asphalt() {
  return make(512, 512, (g, w, h) => {
    g.fillStyle = '#2a2d33'; g.fillRect(0, 0, w, h);
    noise(g, w, h, 26000, 0.35);
    noise(g, w, h, 9000, 0.1, Math.random, true);
    for (let i = 0; i < 6; i++) {
      g.fillStyle = `rgba(0,0,0,${0.06 + Math.random() * 0.1})`;
      g.fillRect(Math.random() * w, Math.random() * h, 40 + Math.random() * 120, 30 + Math.random() * 90);
    }
  }, { repeat: true });
}

// White = asphalt, dark = puddle (lets the mirror underneath show through).
export function puddleAlpha(rnd) {
  return make(256, 1024, (g, w, h) => {
    g.fillStyle = 'rgb(240,240,240)'; g.fillRect(0, 0, w, h);
    for (const [x0, x1] of [[0, 12], [w - 12, w]]) {
      const gr = g.createLinearGradient(x0, 0, x1, 0);
      gr.addColorStop(x0 === 0 ? 0 : 1, 'rgb(30,30,30)'); gr.addColorStop(x0 === 0 ? 1 : 0, 'rgba(240,240,240,0)');
      g.fillStyle = gr; g.fillRect(x0, 0, x1 - x0, h);
    }
    for (const x of [w * 0.2, w * 0.31, w * 0.69, w * 0.8]) {
      g.fillStyle = 'rgba(150,150,150,0.4)'; g.fillRect(x - 7, 0, 14, h);
    }
    for (let i = 0; i < 20; i++) {
      const x = rnd() * w, y = rnd() * h, rx = 18 + rnd() * 70, ry = 30 + rnd() * 120;
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      gr.addColorStop(0, 'rgba(20,20,20,1)');
      gr.addColorStop(0.7, 'rgba(35,35,35,0.9)');
      gr.addColorStop(1, 'rgba(240,240,240,0)');
      g.save(); g.translate(x, y); g.scale(rx, ry);
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  }, { srgb: false, repeat: true });
}

export function sidewalk() {
  return make(256, 256, (g, w, h) => {
    const s = 64;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const v = 84 + Math.random() * 22;
      g.fillStyle = `rgb(${v},${v + 2},${v + 7})`; g.fillRect(x * s, y * s, s, s);
    }
    noise(g, w, h, 6000, 0.18);
    g.strokeStyle = 'rgba(18,20,24,0.85)'; g.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, h); g.stroke();
      g.beginPath(); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke();
    }
  }, { repeat: true });
}

export function tactile() {
  return make(64, 64, (g, w, h) => {
    g.fillStyle = '#c9a417'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8c53a';
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.beginPath(); g.arc(8 + x * 16, 8 + y * 16, 4, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = 'rgba(0,0,0,0.4)'; g.strokeRect(0, 0, w, h);
  }, { repeat: true });
}

export function gravel(rnd) {
  return make(256, 256, (g, w, h) => {
    g.fillStyle = '#3d3a37'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4000; i++) {
      const v = 40 + rnd() * 70;
      g.fillStyle = `rgb(${v},${v - 4},${v - 8})`;
      g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 3, 2 + rnd() * 3);
    }
  }, { repeat: true });
}

export function roadText(text) {
  const chars = [...text];
  return make(256, 512, (g, w, h) => {
    g.fillStyle = 'rgba(232,234,238,0.95)';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const step = h / chars.length;
    chars.forEach((c, i) => {
      g.save(); g.translate(w / 2, step * (i + 0.5)); g.scale(1, 1.35);
      g.font = `900 ${Math.round(step * 0.68)}px ${JP_FONT}`;
      g.fillText(c, 0, 0); g.restore();
    });
  });
}

export function stripes(a, b, n = 4) {
  return make(128, 128, (g, w, h) => {
    g.fillStyle = a; g.fillRect(0, 0, w, h);
    g.fillStyle = b;
    const s = w / n;
    for (let i = -n * 2; i < n * 2; i++) {
      g.beginPath();
      g.moveTo(i * s, 0); g.lineTo(i * s + s / 2, 0);
      g.lineTo(i * s + s / 2 + h, h); g.lineTo(i * s + h, h);
      g.closePath(); g.fill();
    }
  }, { repeat: true });
}

// ---------- sky & light ----------
export function skyGradient() {
  return make(8, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#02040a');
    gr.addColorStop(0.32, '#070d1c');
    gr.addColorStop(0.47, '#1b2644');
    gr.addColorStop(0.5, '#243050');
    gr.addColorStop(0.56, '#0d1324');
    gr.addColorStop(1, '#04060b');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}

export function glow() {
  return make(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, { srgb: false });
}

export function blob() {
  return make(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(0,0,0,0.6)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}

// ---------- buildings ----------
const LIT = ['#ffd9a1', '#ffc982', '#fff0d0', '#d8e8ff', '#9fc0ff'];

export function windows(cols, floors, wall, rnd, style) {
  const cw = 48, fh = 64, W = cols * cw, H = floors * fh;
  const cells = [];
  for (let f = 0; f < floors - 1; f++) for (let c = 0; c < cols; c++) {
    cells.push({ f, c, lit: rnd() < 0.3, col: LIT[Math.floor(rnd() * LIT.length)], curtain: rnd(), blind: rnd() < 0.3, ac: style === 'apt' && rnd() < 0.25 });
  }
  const draw = (emis) => (g) => {
    g.fillStyle = emis ? '#000' : wall; g.fillRect(0, 0, W, H);
    if (!emis) {
      noise(g, W, H, (W * H) / 40, 0.12, rnd);
      g.fillStyle = 'rgba(0,0,0,0.22)';
      for (let f = 1; f < floors; f++) g.fillRect(0, f * fh - 4, W, 4);
      g.fillStyle = '#1d1f24'; g.fillRect(0, (floors - 1) * fh, W, fh);
    }
    for (const k of cells) {
      const x = k.c * cw + 9, y = k.f * fh + 12, w = cw - 18, h = fh - 30;
      if (k.lit) {
        g.fillStyle = k.col; g.fillRect(x, y, w, h);
        if (k.blind) {
          g.fillStyle = emis ? 'rgba(0,0,0,0.45)' : 'rgba(80,60,40,0.45)';
          for (let i = 0; i < h; i += 4) g.fillRect(x, y + i, w, 2);
        } else {
          g.fillStyle = emis ? 'rgba(0,0,0,0.6)' : 'rgba(60,40,30,0.55)';
          g.fillRect(x, y, w * k.curtain * 0.6, h);
        }
      } else if (!emis) {
        const gr = g.createLinearGradient(x, y, x + w, y + h);
        gr.addColorStop(0, '#2b3446'); gr.addColorStop(1, '#0e1118');
        g.fillStyle = gr; g.fillRect(x, y, w, h);
      }
      if (!emis) {
        g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x - 2, y + h, w + 4, 3);
        if (style === 'apt') { g.fillStyle = 'rgba(25,27,32,0.85)'; g.fillRect(k.c * cw, y + h + 6, cw, 8); }
        if (k.ac) { g.fillStyle = '#c9cbd0'; g.fillRect(k.c * cw + 30, y + h + 4, 14, 10); }
      }
    }
  };
  return { map: make(W, H, draw(false)), emissiveMap: make(W, H, draw(true)) };
}

export function shopFront(kind, rnd) {
  return make(512, 256, (g, w, h) => {
    if (kind === 'shutter') {
      g.fillStyle = '#6c7078'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 8) {
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, y, w, 2);
        g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(0, y + 3, w, 1);
      }
      g.fillStyle = '#2a2c30'; g.fillRect(0, 0, w, 14);
      noise(g, w, h, 3000, 0.2, rnd);
      return;
    }
    if (kind === 'entrance') {
      g.fillStyle = '#17191e'; g.fillRect(0, 0, w, h);
      const dx = w * 0.35;
      const gr = g.createLinearGradient(0, 40, 0, h);
      gr.addColorStop(0, '#cfe0f5'); gr.addColorStop(1, '#8aa0bd');
      g.fillStyle = gr; g.fillRect(dx, 40, w * 0.3, h - 40);
      g.fillStyle = 'rgba(20,24,30,0.9)'; g.fillRect(dx + w * 0.15 - 2, 40, 4, h - 40);
      g.fillStyle = '#3a3f48';
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) g.fillRect(w * 0.72 + i * 26, 90 + j * 22, 22, 18);
      return;
    }
    const warm = rnd() < 0.6;
    // back wall and ceiling
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, warm ? '#f3d9b0' : '#dfe9f3'); gr.addColorStop(0.55, warm ? '#c79a68' : '#9fb1c4'); gr.addColorStop(1, warm ? '#5a4232' : '#3e4652');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = warm ? '#fff6e0' : '#f5fbff';
    for (let x = 30; x < w; x += 120) g.fillRect(x, 14, 80, 5);
    // shelves of small labelled goods, receding slightly
    for (let row = 0; row < 5; row++) {
      const y = 48 + row * 34, depth = 1 - row * 0.03;
      g.fillStyle = 'rgba(60,45,35,0.7)'; g.fillRect(8, y + 22, w - 16, 3);
      for (let x = 12; x < w - 14;) {
        const iw = 4 + rnd() * 8, ih = (10 + rnd() * 12) * depth;
        const hue = Math.floor(rnd() * 360);
        g.fillStyle = `hsl(${hue},${35 + rnd() * 45}%,${30 + rnd() * 35}%)`; g.fillRect(x, y + 22 - ih, iw, ih);
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x, y + 22 - ih * 0.6, iw, 2);
        x += iw + 1 + (rnd() < 0.08 ? 6 : 0);
      }
      g.fillStyle = '#f7f2e4';
      for (let x = 20; x < w; x += 46) g.fillRect(x, y + 25, 12, 4);
    }
    // a counter and a shopkeeper silhouette
    g.fillStyle = 'rgba(40,30,25,0.85)'; g.fillRect(w * 0.62, h * 0.66, w * 0.3, h * 0.34);
    if (rnd() < 0.6) {
      g.fillStyle = 'rgba(30,25,22,0.75)';
      g.beginPath(); g.arc(w * 0.75, h * 0.47, 11, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.roundRect(w * 0.75 - 18, h * 0.47 + 12, 36, 40, 10); g.fill();
    }
    // posters on the glass
    if (rnd() < 0.5) {
      g.fillStyle = ['#d33', '#f2c400', '#2a7de1'][Math.floor(rnd() * 3)];
      g.fillRect(w * 0.08, h * 0.45, 46, 64);
      g.fillStyle = '#fff'; g.fillRect(w * 0.08 + 6, h * 0.45 + 8, 34, 6); g.fillRect(w * 0.08 + 6, h * 0.45 + 20, 24, 4);
    }
    if (rnd() < 0.4) {
      g.fillStyle = ['#1d2b5a', '#5a1d1d', '#2b2b2b'][Math.floor(rnd() * 3)];
      for (let i = 0; i < 4; i++) g.fillRect(w * 0.38 + i * 30, 6, 26, 66);
      g.fillStyle = 'rgba(255,255,255,0.8)'; g.font = `700 16px ${JP_FONT}`; g.textAlign = 'center';
      g.fillText('営業中', w * 0.38 + 58, 46);
    }
    // glass sheen
    const sh = g.createLinearGradient(0, 0, w, h);
    sh.addColorStop(0, 'rgba(255,255,255,0.10)'); sh.addColorStop(0.4, 'rgba(255,255,255,0)'); sh.addColorStop(0.7, 'rgba(255,255,255,0.06)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sh; g.fillRect(0, 0, w, h);
  });
}

export function signH(text, bg, fg) {
  return make(512, 128, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = fg; g.font = `900 72px ${JP_FONT}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 4, w - 40);
  });
}

export function signV(text, bg, fg) {
  const chars = [...text].map(c => (c === 'ー' ? '｜' : c));
  return make(128, 512, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.globalAlpha = 0.5; g.lineWidth = 4; g.strokeRect(8, 8, w - 16, h - 16); g.globalAlpha = 1;
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    const step = Math.min(110, (h - 40) / chars.length);
    g.font = `900 ${Math.round(step * 0.8)}px ${JP_FONT}`;
    const top = (h - step * chars.length) / 2;
    chars.forEach((c, i) => g.fillText(c, w / 2, top + step * (i + 0.5)));
  });
}

export function neonText(text, color, bg = '#0c0a12') {
  return make(1024, 160, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.font = `700 92px ${LATIN_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 28; g.strokeStyle = color; g.lineWidth = 6;
    g.strokeText(text, w / 2, h / 2 + 4, w - 60);
    g.shadowBlur = 10; g.fillStyle = '#ffffff';
    g.fillText(text, w / 2, h / 2 + 4, w - 60);
  });
}

// ---------- props ----------
export function vendingFront(body) {
  return make(256, 480, (g, w, h) => {
    g.fillStyle = body; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f4f8ff'; g.fillRect(16, 24, w - 32, 280);
    const cans = ['#c8102e', '#1b5fbf', '#f2a900', '#2e8b57', '#ffffff', '#6b3fa0', '#e05a00', '#111111'];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
      const x = 26 + c * 42, y = 40 + r * 88;
      g.fillStyle = cans[(r * 5 + c * 3) % cans.length]; rrect(g, x, y, 30, 58, 6); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + 4, y + 6, 5, 44);
      g.fillStyle = (r + c) % 3 === 0 ? '#e33' : '#2a6'; g.fillRect(x + 6, y + 64, 18, 8);
    }
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(16, 24, w - 32, 30);
    g.fillStyle = '#1a1c20'; g.fillRect(36, 380, w - 110, 56);
    g.fillStyle = '#2b2e34'; g.fillRect(w - 62, 320, 40, 90);
    g.fillStyle = '#7cf'; g.fillRect(w - 56, 328, 28, 12);
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.font = `700 22px ${JP_FONT}`; g.textAlign = 'center';
    g.fillText('あったか〜い', w / 2 - 22, 345);
  });
}

export function productShelf(rnd) {
  return make(512, 256, (g, w, h) => {
    g.fillStyle = '#eceef1'; g.fillRect(0, 0, w, h);
    for (let r = 0; r < 5; r++) {
      const y = r * 51;
      g.fillStyle = '#d5d8dd'; g.fillRect(0, y + 44, w, 7);
      g.fillStyle = '#f6c343'; for (let x = 6; x < w; x += 38) g.fillRect(x, y + 45, 14, 5);
      for (let x = 3; x < w - 4;) {
        const pw = 5 + rnd() * 10, ph = 14 + rnd() * 24, bottle = rnd() < 0.3;
        g.fillStyle = `hsl(${Math.floor(rnd() * 360)},${45 + rnd() * 40}%,${38 + rnd() * 28}%)`;
        if (bottle) { g.fillRect(x, y + 44 - ph, pw, ph); g.fillRect(x + pw * 0.3, y + 44 - ph - 5, pw * 0.4, 5); }
        else g.fillRect(x, y + 44 - ph, pw, ph);
        g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(x + 1, y + 44 - ph * 0.55, pw - 2, 3);
        x += pw + 1;
      }
    }
  });
}

export function konbiniBand() {
  return make(1024, 128, (g, w, h) => {
    g.fillStyle = '#fbfcfd'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#14a39a'; g.fillRect(0, 0, w, 26);
    g.fillStyle = '#ff8a1f'; g.fillRect(0, h - 22, w, 22);
    g.fillStyle = '#e94f37'; g.fillRect(0, h - 30, w, 6);
    g.fillStyle = '#ff8a1f'; star(g, 82, 62, 30, 13, 5);
    g.fillStyle = '#174a9c'; g.font = `700 64px ${LATIN_FONT}`; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillText('HOSHI MART', 130, 64);
    g.font = `900 40px ${JP_FONT}`; g.textAlign = 'right'; g.fillStyle = '#14a39a';
    g.fillText('ほしマート', w - 40, 64);
  });
}

export function arcadeFront() {
  return make(1024, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#2a0f3d'); gr.addColorStop(1, '#120818');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const cols = ['#ff4fd8', '#38e8ff', '#ffe14f', '#7dff6a', '#ff7a3d'];
    for (let i = 0; i < 7; i++) {
      const x = 30 + i * 140, c = cols[i % cols.length];
      g.fillStyle = '#1b1b24'; rrect(g, x, 40, 110, 210, 10); g.fill();
      g.globalAlpha = 0.85; g.fillStyle = c; rrect(g, x + 10, 52, 90, 110, 6); g.fill(); g.globalAlpha = 1;
      for (let k = 0; k < 5; k++) {
        g.fillStyle = cols[(i + k + 1) % cols.length];
        g.beginPath(); g.arc(x + 22 + k * 16, 150 - ((k * 7) % 12), 9, 0, Math.PI * 2); g.fill();
      }
      g.strokeStyle = '#ddd'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(x + 55, 52); g.lineTo(x + 55, 90); g.stroke();
      g.fillStyle = '#ddd'; g.fillRect(x + 45, 90, 20, 6);
      g.fillStyle = c; g.fillRect(x + 10, 175, 90, 10);
    }
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, 0, w, h * 0.15);
    g.fillStyle = '#0a0a0e'; g.fillRect(0, 0, w, 8); g.fillRect(0, h - 10, w, 10);
  });
}

export function poster() {
  return make(256, 360, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#0b1a3a'); gr.addColorStop(1, '#2a0b3a');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(56,232,255,0.25)'; g.lineWidth = 1;
    for (let i = 0; i <= w; i += 16) { g.beginPath(); g.moveTo(i, 230); g.lineTo(w / 2 + (i - w / 2) * 2.2, h); g.stroke(); }
    for (let y = 240, s = 10; y < h; y += s, s *= 1.25) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    // a rhythm game night: a glowing ring of notes over the neon floor
    g.strokeStyle = '#38e8ff'; g.shadowColor = '#38e8ff'; g.shadowBlur = 16; g.lineWidth = 7;
    g.beginPath(); g.arc(w / 2, 160, 58, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#ff4fd8'; g.shadowColor = '#ff4fd8';
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 - Math.PI / 2; g.beginPath(); g.arc(w / 2 + Math.cos(a) * 58, 160 + Math.sin(a) * 58, 9, 0, Math.PI * 2); g.fill(); }
    // an eighth note in the middle
    g.fillStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 10;
    g.beginPath(); g.ellipse(w / 2 - 8, 182, 15, 11, -0.4, 0, Math.PI * 2); g.fill();
    g.fillRect(w / 2 + 4, 128, 6, 54);
    g.beginPath(); g.moveTo(w / 2 + 10, 128); g.quadraticCurveTo(w / 2 + 34, 140, w / 2 + 28, 166); g.lineTo(w / 2 + 22, 162); g.quadraticCurveTo(w / 2 + 26, 146, w / 2 + 10, 142); g.fill();
    g.shadowBlur = 0;
    g.textAlign = 'center';
    g.fillStyle = '#fff'; g.font = `900 40px ${JP_FONT}`; g.fillText('リズム祭', w / 2, 52);
    g.fillStyle = '#ff4fd8'; g.font = `700 20px ${LATIN_FONT}`; g.fillText('RHYTHM NIGHT', w / 2, 80);
    g.fillStyle = '#fff'; g.font = `700 18px ${LATIN_FONT}`; g.fillText('TONIGHT · TILL DAWN', w / 2, 300);
    g.fillStyle = '#9fdcff'; g.font = `500 14px ${LATIN_FONT}`; g.fillText('GAME CENTER LUMINA', w / 2, 324);
  });
}

export function train() {
  const draw = (emis) => (g, w, h) => {
    g.fillStyle = emis ? '#000' : '#c3c8d0'; g.fillRect(0, 0, w, h);
    if (!emis) {
      g.fillStyle = '#2f8f5b'; g.fillRect(0, h - 38, w, 14);
      g.fillStyle = '#1c5fa8'; g.fillRect(0, h - 22, w, 6);
    }
    const winY = 36, winH = 56;
    for (let i = 0; i < 8; i++) {
      const x = 40 + i * 122;
      if (i % 3 === 1) {
        if (!emis) { g.fillStyle = '#9aa1ab'; g.fillRect(x, 18, 60, h - 30); }
        g.fillStyle = emis ? '#fff1cf' : '#fff6de'; g.fillRect(x + 8, winY - 6, 44, winH - 4);
      } else {
        g.fillStyle = emis ? '#ffeec6' : '#fff4d8'; g.fillRect(x, winY, 96, winH);
        g.fillStyle = emis ? '#000' : 'rgba(60,50,40,0.6)';
        if ((i * 7) % 3) g.fillRect(x + 12, winY + 26, 18, 30);
        if ((i * 5) % 4) g.fillRect(x + 58, winY + 22, 16, 34);
      }
    }
  };
  return { map: make(1024, 160, draw(false)), emissiveMap: make(1024, 160, draw(true)) };
}

// ---------- detail pass: normal/roughness maps, signs, props ----------

// Paints a height field (white = high) and converts it to a tangent-space normal map.
export function normalMap(w, h, drawHeight, strength = 2) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  drawHeight(g, w, h);
  const src = g.getImageData(0, 0, w, h).data;
  const out = g.createImageData(w, h), o = out.data;
  const H = (x, y) => src[((((y + h) % h) * w) + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    o[i] = (-dx / l * 0.5 + 0.5) * 255; o[i + 1] = (dy / l * 0.5 + 0.5) * 255; o[i + 2] = (1 / l * 0.5 + 0.5) * 255; o[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

export function asphaltNormal() {
  return normalMap(512, 512, (g, w, h) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 30000; i++) {
      const v = 90 + Math.random() * 120;
      g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2.5, 1 + Math.random() * 2.5);
    }
    g.strokeStyle = '#303030'; g.lineWidth = 1.5;
    for (let k = 0; k < 5; k++) {
      let x = Math.random() * w, y = Math.random() * h;
      g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 14; s++) { x += (Math.random() - 0.5) * 30; y += Math.random() * 18; g.lineTo(x, y); }
      g.stroke();
    }
  }, 1.6);
}

export function sidewalkNormal() {
  return normalMap(256, 256, (g, w, h) => {
    g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 6000; i++) { const v = 130 + Math.random() * 60; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    g.strokeStyle = '#202020'; g.lineWidth = 5;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.stroke();
      g.beginPath(); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke();
    }
  }, 3);
}

// low value = glossy (standing water), used as roughnessMap (green channel)
export function wetRoughness(rnd, base = 150) {
  return make(256, 256, (g, w, h) => {
    g.fillStyle = `rgb(${base},${base},${base})`; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 10; i++) {
      const x = rnd() * w, y = rnd() * h, r = 15 + rnd() * 45;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgb(25,25,25)'); gr.addColorStop(1, `rgba(${base},${base},${base},0)`);
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }, { srgb: false, repeat: true });
}

export function wornPaint() {
  return make(256, 1024, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    // soft scuffs where tyres run, then fine speckle of road showing through
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 20 + Math.random() * 60;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(90,92,98,${0.12 + Math.random() * 0.18})`); gr.addColorStop(1, 'rgba(90,92,98,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(60,62,68,${0.15 + Math.random() * 0.45})`;
      const s2 = Math.random() < 0.9 ? 1 : 2;
      g.fillRect(Math.random() * w, Math.random() * h, s2, s2);
    }
  }, { repeat: true });
}

export function manhole() {
  return make(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const c = w / 2;
    g.fillStyle = '#3d3f44'; g.beginPath(); g.arc(c, c, 126, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#26282c'; g.lineWidth = 6;
    for (const r of [118, 92, 40]) { g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke(); }
    g.lineWidth = 4;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      g.beginPath(); g.moveTo(c + Math.cos(a) * 44, c + Math.sin(a) * 44); g.lineTo(c + Math.cos(a) * 88, c + Math.sin(a) * 88); g.stroke();
    }
    g.fillStyle = '#55585e';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      g.beginPath(); g.ellipse(c + Math.cos(a) * 20, c + Math.sin(a) * 20, 9, 15, a + Math.PI / 2, 0, Math.PI * 2); g.fill();
    }
  });
}

export function grate() {
  return make(64, 128, (g, w, h) => {
    g.fillStyle = '#2a2b2e'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#0a0a0c';
    for (let y = 8; y < h - 6; y += 10) g.fillRect(8, y, w - 16, 5);
  });
}

export function balconyPanel() {
  return make(256, 64, (g, w, h) => {
    g.fillStyle = '#b8bcc2'; g.fillRect(0, 0, w, h);
    noise(g, w, h, 1500, 0.15);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let x = 0; x < w; x += 64) g.fillRect(x, 0, 2, h);
    const gr = g.createLinearGradient(0, h * 0.6, 0, h);
    gr.addColorStop(0, 'rgba(40,35,30,0)'); gr.addColorStop(1, 'rgba(40,35,30,0.45)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, { repeat: true });
}

export function lantern(text) {
  const chars = [...text];
  return make(256, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, '#7a0c08'); gr.addColorStop(0.5, '#ff3a22'); gr.addColorStop(1, '#7a0c08');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(60,0,0,0.5)'; g.lineWidth = 2;
    for (let y = 10; y < h; y += 14) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 ${Math.round(150 / chars.length + 30)}px ${JP_FONT}`;
    const step = 190 / chars.length;
    for (const off of [w * 0.25, w * 0.75]) chars.forEach((c, i) => g.fillText(c, off, 33 + step * (i + 0.5)));
  });
}

export function signRound(text, ring = '#d0141e', fg = '#1d3f9a') {
  return make(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.fill();
    g.strokeStyle = ring; g.lineWidth = 26; g.beginPath(); g.arc(128, 128, 106, 0, Math.PI * 2); g.stroke();
    g.fillStyle = fg; g.font = `700 104px ${LATIN_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 128, 136);
  });
}

export function signStop() {
  return make(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const tri = (inset, color) => {
      g.fillStyle = color; g.beginPath();
      g.moveTo(8 + inset, 20 + inset * 0.6); g.lineTo(248 - inset, 20 + inset * 0.6); g.lineTo(128, 236 - inset); g.closePath(); g.fill();
    };
    tri(0, '#ffffff'); tri(12, '#d0141e');
    g.fillStyle = '#ffffff'; g.font = `900 46px ${JP_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('止まれ', 128, 92);
  });
}

export function signCrossing() {
  return make(256, 256, (g, w, h) => {
    g.fillStyle = '#1f55b8'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#fff'; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(128, 34); g.lineTo(228, 214); g.lineTo(28, 214); g.closePath(); g.fill();
    g.fillStyle = '#1f55b8';
    g.beginPath(); g.arc(126, 98, 13, 0, Math.PI * 2); g.fill();
    g.fillRect(116, 114, 20, 46);
    g.save(); g.translate(120, 158); g.rotate(0.35); g.fillRect(-5, 0, 10, 40); g.restore();
    g.save(); g.translate(132, 158); g.rotate(-0.35); g.fillRect(-5, 0, 10, 40); g.restore();
    g.fillStyle = '#222'; for (let i = 0; i < 5; i++) g.fillRect(60 + i * 30, 200, 18, 8);
  });
}

export function pedSignal(kind) {
  return make(128, 128, (g, w, h) => {
    g.fillStyle = '#0c0d10'; g.fillRect(0, 0, w, h);
    if (kind === 'off') return;
    const col = kind === 'walk' ? '#3dffb0' : '#ff3a2a';
    g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 10;
    g.beginPath(); g.arc(64, 26, 11, 0, Math.PI * 2); g.fill();
    if (kind === 'walk') {
      g.fillRect(56, 40, 16, 38);
      g.save(); g.translate(60, 76); g.rotate(0.45); g.fillRect(-5, 0, 10, 36); g.restore();
      g.save(); g.translate(68, 76); g.rotate(-0.45); g.fillRect(-5, 0, 10, 36); g.restore();
      g.save(); g.translate(58, 44); g.rotate(0.6); g.fillRect(-4, 0, 8, 30); g.restore();
      g.save(); g.translate(70, 44); g.rotate(-0.6); g.fillRect(-4, 0, 8, 30); g.restore();
    } else {
      g.fillRect(52, 40, 24, 44); g.fillRect(54, 84, 8, 32); g.fillRect(66, 84, 8, 32);
      g.fillRect(44, 42, 8, 36); g.fillRect(76, 42, 8, 36);
    }
  });
}

export function taxiSign() {
  return make(256, 96, (g, w, h) => {
    g.fillStyle = '#fff6d8'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1b3f8f'; g.font = `700 60px ${LATIN_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('TAXI', w / 2, h / 2 + 4);
  });
}

export const canvasTex = make; // shared with shops.js

// 4×4 atlas of window interiors. Cells 0–9 are lit rooms, 10–15 dark glass. Each window plane samples one cell.
export const WINDOW_CELLS = 16, WINDOW_LIT = 10;
export function windowAtlas() {
  const S = 256, rnd = mulberry32(77);
  const cells = [];
  for (let i = 0; i < WINDOW_CELLS; i++) {
    const lit = i < WINDOW_LIT;
    cells.push({
      lit, warm: rnd() < 0.65, tv: lit && rnd() < 0.2, blinds: rnd() < 0.3, curtain: rnd(), plant: rnd() < 0.3,
      lamp: rnd(), shelf: rnd() < 0.5, person: lit && rnd() < 0.3,
    });
  }
  const draw = (emis) => (g) => {
    cells.forEach((c, i) => {
      const x0 = (i % 4) * S, y0 = Math.floor(i / 4) * S;
      g.save(); g.translate(x0, y0);
      if (!c.lit) {
        if (emis) { g.fillStyle = '#000'; g.fillRect(0, 0, S, S); g.restore(); return; }
        const gr = g.createLinearGradient(0, 0, S, S);
        gr.addColorStop(0, '#1d2433'); gr.addColorStop(0.5, '#0b0e15'); gr.addColorStop(1, '#151a26');
        g.fillStyle = gr; g.fillRect(0, 0, S, S);
        g.fillStyle = 'rgba(160,180,220,0.08)'; g.beginPath(); g.moveTo(S * 0.2, 0); g.lineTo(S * 0.45, 0); g.lineTo(S * 0.1, S); g.lineTo(0, S); g.fill();
        if (c.curtain > 0.5) { g.fillStyle = 'rgba(60,55,50,0.6)'; g.fillRect(0, 0, S * 0.35, S); g.fillRect(S * 0.7, 0, S * 0.3, S); }
        g.restore(); return;
      }
      const wall = c.tv ? ['#3a4f8a', '#20305e'] : c.warm ? ['#f4d6a8', '#b07a48'] : ['#e4ecf4', '#93a6bd'];
      const gr = g.createLinearGradient(0, 0, 0, S);
      gr.addColorStop(0, wall[0]); gr.addColorStop(1, wall[1]);
      g.fillStyle = gr; g.fillRect(0, 0, S, S);
      // ceiling lamp glow
      const lx = S * (0.3 + c.lamp * 0.4);
      const lg = g.createRadialGradient(lx, S * 0.15, 4, lx, S * 0.15, S * 0.6);
      lg.addColorStop(0, c.tv ? 'rgba(140,180,255,0.7)' : 'rgba(255,250,230,0.85)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = lg; g.fillRect(0, 0, S, S);
      // room contents in silhouette
      g.fillStyle = 'rgba(40,28,20,0.55)';
      if (c.shelf) { g.fillRect(S * 0.62, S * 0.35, S * 0.3, S * 0.65); for (let k = 0; k < 4; k++) { g.fillStyle = `rgba(${90 + k * 30},${60 + k * 20},50,0.6)`; g.fillRect(S * 0.64, S * (0.4 + k * 0.14), S * 0.26, S * 0.05); } }
      g.fillStyle = 'rgba(30,22,18,0.6)'; g.fillRect(S * 0.08, S * 0.72, S * 0.45, S * 0.28);
      if (c.person) { g.fillStyle = 'rgba(25,18,15,0.75)'; g.beginPath(); g.arc(S * 0.35, S * 0.5, S * 0.07, 0, Math.PI * 2); g.fill(); g.fillRect(S * 0.27, S * 0.57, S * 0.16, S * 0.3); }
      if (c.plant) { g.fillStyle = 'rgba(30,60,35,0.8)'; g.beginPath(); g.arc(S * 0.86, S * 0.72, S * 0.1, 0, Math.PI * 2); g.fill(); }
      if (c.tv) { g.fillStyle = 'rgba(150,200,255,0.9)'; g.fillRect(S * 0.15, S * 0.45, S * 0.3, S * 0.18); }
      // curtains or blinds
      if (c.blinds) { g.fillStyle = emis ? 'rgba(0,0,0,0.45)' : 'rgba(210,200,180,0.55)'; for (let y = 0; y < S; y += 10) g.fillRect(0, y, S, 5); }
      else {
        const cw = S * (0.15 + c.curtain * 0.3);
        g.fillStyle = emis ? 'rgba(0,0,0,0.55)' : (c.warm ? 'rgba(170,90,60,0.85)' : 'rgba(90,110,140,0.85)');
        g.fillRect(0, 0, cw, S); g.fillRect(S - cw * 0.7, 0, cw * 0.7, S);
        if (!emis) { g.fillStyle = 'rgba(0,0,0,0.25)'; for (let x = 6; x < cw; x += 12) g.fillRect(x, 0, 3, S); }
      }
      g.restore();
    });
  };
  return { map: make(S * 4, S * 4, draw(false)), emissiveMap: make(S * 4, S * 4, draw(true)) };
}

// vertical grime streaks that run down a wall from a window sill (alpha in the texture)
export function rainStreaks() {
  return make(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * w, len = h * (0.3 + Math.random() * 0.7), a = 0.08 + Math.random() * 0.25;
      const gr = g.createLinearGradient(0, 0, 0, len);
      gr.addColorStop(0, `rgba(20,18,16,${a})`); gr.addColorStop(1, 'rgba(20,18,16,0)');
      g.fillStyle = gr; g.fillRect(x, 0, 1 + Math.random() * 3, len);
    }
    const top = g.createLinearGradient(0, 0, 0, h * 0.25);
    top.addColorStop(0, 'rgba(15,14,12,0.35)'); top.addColorStop(1, 'rgba(15,14,12,0)');
    g.fillStyle = top; g.fillRect(0, 0, w, h * 0.25);
  }, { repeat: true });
}

// asphalt repairs and cracks, drawn as an overlay with alpha
export function roadWear(rnd) {
  return make(256, 1024, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 7; i++) {
      const pw = 30 + rnd() * 110, ph = 40 + rnd() * 200, x = rnd() * (w - pw), y = rnd() * (h - ph);
      g.fillStyle = `rgba(${rnd() < 0.5 ? '20,20,22' : '70,70,72'},${0.25 + rnd() * 0.3})`;
      g.fillRect(x, y, pw, ph);
      g.strokeStyle = 'rgba(10,10,10,0.5)'; g.lineWidth = 1.5; g.strokeRect(x, y, pw, ph);
    }
    g.strokeStyle = 'rgba(8,8,8,0.6)';
    for (let k = 0; k < 14; k++) {
      let x = rnd() * w, y = rnd() * h;
      g.lineWidth = 0.8 + rnd() * 1.4;
      g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 10; s++) { x += (rnd() - 0.5) * 26; y += rnd() * 22; g.lineTo(x, y); }
      g.stroke();
    }
    // oil stains in the lanes
    for (let i = 0; i < 6; i++) {
      const x = w * (rnd() < 0.5 ? 0.25 : 0.75) + (rnd() - 0.5) * 30, y = rnd() * h, r = 10 + rnd() * 25;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(10,10,14,0.45)'); gr.addColorStop(1, 'rgba(10,10,14,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }, { repeat: true });
}

// ---------- konbini, shrine, drugstore details ----------
export function konbiniPosters() {
  return make(1024, 128, (g, w, h) => {
    g.fillStyle = '#f7f8fa'; g.fillRect(0, 0, w, h);
    const items = [['おでん', '#c0392b', '#fff4d0'], ['からあげ', '#e67e22', '#fff'], ['ATM', '#1d4fb8', '#fff'], ['コーヒー ¥120', '#4a2c18', '#ffe6b0'], ['Wi-Fi', '#14a39a', '#fff'], ['肉まん', '#f2c400', '#7a1f1f'], ['公共料金', '#2f8f5b', '#fff']];
    const pw = w / items.length;
    items.forEach(([t, bg, fg], i) => {
      g.fillStyle = bg; g.fillRect(i * pw + 4, 6, pw - 8, h - 12);
      g.fillStyle = fg; g.font = `900 ${t.length > 5 ? 26 : 38}px ${JP_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(t, i * pw + pw / 2, h / 2, pw - 16);
    });
  });
}

export function magazines(rnd) {
  // a rack of A4 covers (~0.2 m each across the 7.5 m rack): masthead, cover model, coverlines
  const titles = ['週刊ホシ', 'MONO', 'カーライフ', 'non-ni', '少年ジャンプ', 'ゲーム通信', 'PIA', 'Tokyo Walk', '料理の友', 'CAT', 'BRUTUS', '旅と鉄道'];
  return make(2048, 128, (g, w, h) => {
    g.fillStyle = '#5b6068'; g.fillRect(0, 0, w, h);
    for (let x = 3; x < w - 50; x += 57) {
      const hue = Math.floor(rnd() * 360), y = 8 + Math.floor(rnd() * 6), cw = 53, ch = h - y - 4;
      const bg = g.createLinearGradient(0, y, 0, y + ch); bg.addColorStop(0, `hsl(${hue},${30 + rnd() * 40}%,${70 + rnd() * 20}%)`); bg.addColorStop(1, `hsl(${(hue + 30) % 360},40%,${50 + rnd() * 20}%)`);
      g.fillStyle = bg; g.fillRect(x, y, cw, ch);
      // cover model: hair, face, shoulders
      const cx = x + cw / 2 + (rnd() - 0.5) * 10, hy = y + 50;
      g.fillStyle = `hsl(${Math.floor(rnd() * 40)},${20 + rnd() * 30}%,${10 + rnd() * 30}%)`; g.beginPath(); g.ellipse(cx, hy - 2, 14, 16, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#f0cdb0'; g.beginPath(); g.ellipse(cx, hy + 2, 10, 12, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = `hsl(${Math.floor(rnd() * 360)},50%,45%)`; g.beginPath(); g.ellipse(cx, y + ch + 6, 24, 26, 0, Math.PI, 0); g.fill();
      // masthead and coverlines
      const t = titles[Math.floor(rnd() * titles.length)];
      g.fillStyle = rnd() < 0.5 ? '#d11' : '#111'; g.font = `900 ${t.length > 5 ? 11 : 15}px ${JP_FONT}`; g.textAlign = 'center'; g.textBaseline = 'top';
      g.fillText(t, x + cw / 2, y + 3, cw - 4);
      g.fillStyle = '#ffe14a'; g.beginPath(); g.arc(x + 10, y + 34, 8, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; for (let k = 0; k < 3; k++) g.fillRect(x + 4, y + 70 + k * 8, 16 + rnd() * 10, 3);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x, y, 4, ch);
    }
  });
}

export function snackCase() {
  return make(256, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#fff3c4'); gr.addColorStop(1, '#f2b84a');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) {
      g.fillStyle = ['#b5651d', '#d98c2b', '#f4d27a', '#c0392b'][(i + r) % 4];
      g.beginPath(); g.ellipse(22 + i * 40, 40 + r * 52, 15, 11, 0, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, 0, w, 10);
  });
}

export function binLabel(text, color) {
  return make(128, 64, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff'; g.font = `900 ${text.length > 4 ? 18 : 24}px ${JP_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2, w - 10);
  });
}

export function plaque(text, bg = '#1a1a1a', fg = '#d8b04a') {
  const chars = [...text];
  return make(64, 128, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 3; g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = fg; g.font = `900 40px ${JP_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    chars.forEach((c, i) => g.fillText(c, w / 2, h / (chars.length + 1) * (i + 1)));
  });
}

export function nobori(text, bg, fg) {
  const chars = [...text];
  return make(96, 384, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.fillRect(0, 0, 10, h);
    g.font = `900 52px ${JP_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    chars.forEach((c, i) => g.fillText(c === 'ー' ? '｜' : c, w / 2 + 4, 40 + i * 56));
  });
}

export function ema(rnd) {
  return make(256, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) {
      const x = 8 + i * 41, y = 10 + (i % 2) * 8;
      g.fillStyle = '#c9a272'; g.beginPath(); g.moveTo(x, y + 14); g.lineTo(x + 18, y); g.lineTo(x + 36, y + 14); g.lineTo(x + 36, y + 60); g.lineTo(x, y + 60); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(40,20,10,0.6)'; g.lineWidth = 1.5;
      for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(x + 8 + k * 6, y + 22); g.lineTo(x + 8 + k * 6, y + 22 + 20 + rnd() * 14); g.stroke(); }
      g.fillStyle = '#b3201a'; g.fillRect(x + 4, y + 50, 28, 6);
    }
  });
}

// ---------- capsule-toy (gashapon) shop ----------
// 4×2 atlas of the illustrated cards on top of each machine
export function gachaCards() {
  const W = 256, H = 96, rnd = mulberry32(31);
  const names = ['ネコ大集合', 'ロボ戦士', 'ミニ寿司', 'おばけ', '電車コレ', 'ハムスター', '宇宙人', 'カエル'];
  return make(W * 4, H * 2, (g) => {
    names.forEach((n, i) => {
      const x0 = (i % 4) * W, y0 = Math.floor(i / 4) * H;
      const hue = Math.floor(rnd() * 360);
      const gr = g.createLinearGradient(x0, y0, x0, y0 + H);
      gr.addColorStop(0, `hsl(${hue},80%,62%)`); gr.addColorStop(1, `hsl(${(hue + 40) % 360},85%,48%)`);
      g.fillStyle = gr; g.fillRect(x0, y0, W, H);
      for (let k = 0; k < 4; k++) {
        const cx = x0 + 34 + k * 46, cy = y0 + 58;
        g.fillStyle = `hsl(${(hue + 120 + k * 50) % 360},70%,${55 + k * 6}%)`; g.beginPath(); g.arc(cx, cy, 17, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#111'; g.beginPath(); g.arc(cx - 6, cy - 3, 2.5, 0, Math.PI * 2); g.arc(cx + 6, cy - 3, 2.5, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = '#fff'; g.font = `900 26px ${JP_FONT}`; g.textAlign = 'left'; g.textBaseline = 'top';
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 4; g.strokeText(n, x0 + 10, y0 + 6); g.fillText(n, x0 + 10, y0 + 6);
      g.fillStyle = '#ffe14a'; g.beginPath(); g.arc(x0 + W - 34, y0 + 60, 26, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#d11'; g.font = `900 20px ${LATIN_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(i % 3 ? '¥300' : '¥500', x0 + W - 34, y0 + 61);
    });
  });
}

export function gachaFront(color) {
  return make(128, 160, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, 0, w, 10);
    g.fillStyle = '#e8e8ec'; g.beginPath(); g.roundRect(14, 18, 100, 70, 10); g.fill();
    g.fillStyle = '#9aa0a8'; g.beginPath(); g.arc(64, 53, 26, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#d0d4da'; g.fillRect(56, 30, 16, 46);
    g.fillStyle = '#1a1a1e'; g.fillRect(96, 26, 6, 18);
    g.fillStyle = '#26282d'; g.beginPath(); g.roundRect(30, 104, 68, 44, 8); g.fill();
    g.fillStyle = '#3a3d44'; g.fillRect(36, 110, 56, 8);
    g.fillStyle = '#fff'; g.font = `700 14px ${LATIN_FONT}`; g.textAlign = 'center'; g.fillText('¥100 × 3', 64, 98);
  });
}

// advertising plate strapped to a utility pole (電柱広告): clinic / shop name with an arrow and distance
export function poleAd(rnd) {
  const ads = [['星見内科クリニック', '#1d6b3a'], ['ほしみ歯科', '#1d4fb8'], ['雨宮整骨院', '#b3201a'], ['マルヤ不動産', '#6a3fa0'], ['星見眼科', '#0e7a8a'], ['はり・きゅう', '#7a4a1d']];
  const [name, col] = ads[Math.floor(rnd() * ads.length)];
  const chars = [...name];
  return make(96, 512, (g, w, h) => {
    g.fillStyle = '#f7f6f0'; g.fillRect(0, 0, w, h);
    g.fillStyle = col; g.fillRect(0, 0, w, 14); g.fillRect(0, h - 70, w, 70);
    g.fillStyle = col; g.font = `900 ${Math.min(52, 380 / chars.length)}px ${JP_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const step = Math.min(56, 400 / chars.length);
    chars.forEach((c, i) => g.fillText(c === 'ー' ? '｜' : c, w / 2, 40 + step * (i + 0.5)));
    g.fillStyle = '#fff'; g.font = `700 22px ${LATIN_FONT}`; g.fillText(`→ ${50 + Math.floor(rnd() * 400)}m`, w / 2, h - 35);
  });
}

// scrolling LED marquee text (orange dot-matrix look); scroll by moving texture offset.x
export function ledMarquee(text) {
  return make(2048, 64, (g, w, h) => {
    g.fillStyle = '#060504'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ff9a2a'; g.font = `900 46px ${JP_FONT}`; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillText(text, 10, h / 2 + 2);
    // dot-matrix mask
    g.globalCompositeOperation = 'destination-in';
    for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) { g.fillStyle = '#000'; g.fillRect(x, y, 3, 3); }
    g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#060504'; g.fillRect(0, 0, w, h);
  }, { repeat: true });
}

export function purikuraWrap() {
  return make(512, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, '#ff9ad5'); gr.addColorStop(0.5, '#b9a4ff'); gr.addColorStop(1, '#8fe3ff');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 6 + Math.random() * 14;
      g.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.5})`;
      g.beginPath(); g.moveTo(x, y + r * 0.3); g.bezierCurveTo(x - r, y - r * 0.6, x - r * 0.3, y - r, x, y - r * 0.35); g.bezierCurveTo(x + r * 0.3, y - r, x + r, y - r * 0.6, x, y + r * 0.3); g.fill();
    }
    g.fillStyle = '#fff'; g.font = `900 92px ${LATIN_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.strokeStyle = '#ff4fa0'; g.lineWidth = 10; g.strokeText('PURI', w / 2, h * 0.3); g.fillText('PURI', w / 2, h * 0.3);
    g.font = `900 56px ${JP_FONT}`; g.strokeText('プリクラ', w / 2, h * 0.5); g.fillText('プリクラ', w / 2, h * 0.5);
    g.font = `700 30px ${LATIN_FONT}`; g.fillStyle = '#5a2a8a'; g.fillText('¥500 · 4 SHOTS', w / 2, h * 0.68);
  });
}
