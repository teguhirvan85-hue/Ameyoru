// Ground-floor storefronts: twelve distinct shop types dealt like a shuffled deck so neighbours never repeat.
import * as THREE from 'three';
import { canvasTex, JP_FONT, LATIN_FONT, nobori } from './textures.js';
import { SHOP_H, SHOP_DEPTH, playGacha, frame, gachaUnit, gachaCapsules, gachaInterior, barberInterior, laundryInterior, estateInterior, izakayaInterior, ramenInterior, kissaInterior, karaokeInterior, apartmentInterior, floristInterior, placeRoses } from './interiors.js';
import { DESY, CAFE_NAME, CAFE_FULL } from './desy.js';

export { SHOP_H, SHOP_DEPTH };
// these get a real room behind the glass (world.js leaves the ground floor of their block open)
export const DEEP_SHOPS = new Set(['barber', 'laundry', 'estate', 'gacha', 'izakaya', 'ramen', 'kissa', 'karaoke', 'apartment', 'florist']);

// how each shop is entered: door kind, width, sound, and what the room is called
const wood = new THREE.MeshStandardMaterial({ color: 0x4a2e18, roughness: 0.6 });
const paper = new THREE.MeshStandardMaterial({ color: 0xf2e6c8, emissive: 0x6a5030, transparent: true, opacity: 0.85, roughness: 0.9 });
const DOOR = {
  izakaya: { kind: 'slide', w: 1.0, sound: 'wood', frame: wood, mat: paper, name: 'Izakaya', amb: 'izakaya' },
  ramen: { kind: 'slide', w: 1.0, sound: 'slide', name: 'Ramen shop', amb: 'ramen' },
  kissa: { kind: 'swing', w: 0.95, sound: 'swing', frame: wood, name: 'Kissaten', amb: 'kissa' },
  barber: { kind: 'swing', w: 0.95, sound: 'swing', name: 'Barber', amb: 'quiet' },
  laundry: { kind: 'auto', w: 1.4, name: 'Coin laundry', amb: 'laundry' },
  gacha: { kind: 'auto', w: 1.3, name: 'Capsule toy shop', amb: 'gacha' },
  estate: { kind: 'auto', w: 1.1, name: 'Estate agent', amb: 'quiet' },
  karaoke: { kind: 'auto', w: 1.4, name: 'Karaoke', amb: 'karaoke' },
  apartment: { kind: 'auto', w: 1.1, name: 'Apartment lobby', amb: 'quiet' },
  florist: { kind: 'swing', w: 1.0, sound: 'swing', frame: new THREE.MeshStandardMaterial({ color: 0xf2eee8, roughness: 0.5 }), name: CAFE_FULL, amb: 'kissa' },
};
const ROOM_JP = { izakaya: '居酒屋', ramen: 'ラーメン', kissa: '喫茶', barber: '理容', laundry: 'コインランドリー', gacha: 'ガチャガチャ', estate: '不動産', karaoke: 'カラオケ', apartment: 'メゾン星見', florist: '花とカフェ' };

const OPEN = ['izakaya', 'ramen', 'laundry', 'gacha', 'barber', 'kissa', 'snack', 'estate', 'karaoke'];

// One shared deck for both sides: every open type comes up about equally often, never twice in a row on a
// side, and the shop facing you across the street is not the same type either.
export function makeDeck(rnd) {
  const deck = [], last = { '-1': null, 1: null };
  let prev = null;
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const draw = () => { if (!deck.length) deck.push(...shuffle(OPEN.slice())); return deck.pop(); };
  const facing = [];
  return (side, z) => {
    const r = rnd();
    let t = r < 0.25 ? 'closed' : r < 0.4 ? 'apartment' : null;
    if (t === last[side]) t = null;
    if (!t) {
      const across = facing.filter((f) => f.side !== side && Math.abs(f.z - z) < 10).map((f) => f.t);
      for (let tries = 0; tries < 12; tries++) {
        t = draw();
        if (t !== last[side] && t !== prev && !across.includes(t)) break;
        deck.unshift(t);
      }
    }
    last[side] = t; prev = t;
    facing.push({ side, z, t });
    return t;
  };
}

// ---------- canvas helpers ----------
const tex = (w, h, draw) => canvasTex(w, h, draw);
const hsl = (r, s, l) => `hsl(${Math.floor(r * 360)},${s}%,${l}%)`;
function ceilingLights(g, w, color, step = 110, y = 12) { g.fillStyle = color; for (let x = 30; x < w; x += step) g.fillRect(x, y, step * 0.6, 5); }
function person(g, x, y, s = 1, c = 'rgba(25,20,18,0.8)') {
  g.fillStyle = c;
  g.beginPath(); g.arc(x, y, 10 * s, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.roundRect(x - 16 * s, y + 11 * s, 32 * s, 42 * s, 10 * s); g.fill();
}
function text(g, str, x, y, size, color, font = JP_FONT, weight = 900, align = 'center') {
  g.fillStyle = color; g.font = `${weight} ${size}px ${font}`; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(str, x, y);
}
function sheen(g, w, h) {
  const s = g.createLinearGradient(0, 0, w, h);
  s.addColorStop(0, 'rgba(255,255,255,0.10)'); s.addColorStop(0.45, 'rgba(255,255,255,0)'); s.addColorStop(0.75, 'rgba(255,255,255,0.05)'); s.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = s; g.fillRect(0, 0, w, h);
}

const INTERIOR = {
  izakaya: (rnd) => tex(512, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#4a2c18'); gr.addColorStop(1, '#1a0f08');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let x = 40; x < w; x += 90) { const p = g.createRadialGradient(x, 40, 2, x, 40, 40); p.addColorStop(0, 'rgba(255,200,120,0.9)'); p.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = p; g.fillRect(x - 40, 0, 80, 90); }
    for (let i = 0; i < 14; i++) { g.fillStyle = '#efe4c8'; g.fillRect(16 + i * 34, 60, 22, 70); g.fillStyle = '#222'; for (let k = 0; k < 4; k++) g.fillRect(25 + i * 34, 70 + k * 14, 4, 9); }
    for (let x = 10; x < w; x += 9) { g.fillStyle = hsl(rnd() * 0.15 + 0.05, 60, 25 + rnd() * 25); g.fillRect(x, 140, 6, 24); }
    g.fillStyle = '#6b4526'; g.fillRect(0, 186, w, 18); g.fillStyle = '#2b1a0e'; g.fillRect(0, 204, w, h - 204);
    for (let i = 0; i < 4; i++) person(g, 70 + i * 120 + rnd() * 30, 158, 1, 'rgba(20,12,8,0.85)');
  }),
  ramen: (rnd) => tex(512, 256, (g, w, h) => {
    g.fillStyle = '#e9dfc9'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(120,100,80,0.25)'; for (let x = 0; x < w; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 150); g.stroke(); } for (let y = 0; y < 150; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    ceilingLights(g, w, '#fffaf0');
    g.fillStyle = '#1d1d1d'; g.fillRect(60, 34, 390, 50);
    for (let i = 0; i < 6; i++) { text(g, ['醤油', '味噌', '塩', '豚骨', '餃子', 'ビール'][i], 92 + i * 62, 52, 16, '#fff'); text(g, '¥' + (680 + i * 70), 92 + i * 62, 72, 12, '#f6c343', LATIN_FONT, 700); }
    person(g, 300, 104, 1.1, 'rgba(40,40,40,0.8)'); g.fillStyle = '#fff'; g.fillRect(286, 88, 28, 10);
    g.fillStyle = '#8a5a32'; g.fillRect(0, 160, w, 22); g.fillStyle = '#5a3a20'; g.fillRect(0, 182, w, h);
    for (let x = 30; x < w; x += 64) { g.fillStyle = '#c0261b'; g.beginPath(); g.ellipse(x, 196, 18, 6, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#333'; g.fillRect(x - 3, 198, 6, 50); }
    for (let i = 0; i < 3; i++) person(g, 100 + i * 150 + rnd() * 30, 138, 0.95);
  }),
  laundry: () => tex(512, 256, (g, w, h) => {
    g.fillStyle = '#f3f6f8'; g.fillRect(0, 0, w, h); ceilingLights(g, w, '#ffffff', 90, 8);
    for (let row = 0; row < 2; row++) for (let i = 0; i < 6; i++) {
      const x = 22 + i * 80, y = 30 + row * 92;
      g.fillStyle = '#d9dee3'; g.fillRect(x, y, 70, 84); g.fillStyle = '#b8bfc6'; g.fillRect(x, y, 70, 12);
      g.fillStyle = '#2b3138'; g.beginPath(); g.arc(x + 35, y + 50, 25, 0, Math.PI * 2); g.fill();
      g.fillStyle = row ? '#6c8db4' : '#9aa7b3'; g.beginPath(); g.arc(x + 35, y + 50, 19, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(x + 28, y + 43, 6, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#e74c3c'; g.fillRect(x + 56, y + 16, 8, 5);
    }
    g.fillStyle = '#c7ccd1'; g.fillRect(0, 222, w, h); g.fillStyle = '#e8a33b'; for (let x = 60; x < w; x += 160) g.fillRect(x, 210, 70, 12);
  }),
  drug: (rnd) => tex(512, 256, (g, w, h) => {
    g.fillStyle = '#fbfcfd'; g.fillRect(0, 0, w, h); ceilingLights(g, w, '#ffffff', 70, 6);
    for (let row = 0; row < 5; row++) { const y = 28 + row * 40; g.fillStyle = '#d4d8dc'; g.fillRect(0, y + 32, w, 4); for (let x = 2; x < w;) { const iw = 5 + rnd() * 9; g.fillStyle = hsl(rnd(), 70, 45 + rnd() * 25); g.fillRect(x, y + 32 - (12 + rnd() * 18), iw, 30); x += iw + 1; } }
    for (let i = 0; i < 7; i++) { const x = 20 + rnd() * 440, y = 20 + rnd() * 170; g.fillStyle = '#ffe14a'; g.fillRect(x, y, 46, 30); text(g, ['特価', 'SALE', '¥98', '半額', '新商品'][i % 5], x + 23, y + 15, 14, '#d11', JP_FONT, 900); }
  }),
  barber: () => tex(512, 256, (g, w, h) => {
    g.fillStyle = '#cfe3ea'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.6)'; for (let x = 0; x < w; x += 20) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    ceilingLights(g, w, '#ffffff', 120);
    for (let i = 0; i < 3; i++) {
      const x = 50 + i * 150;
      g.fillStyle = '#9fb3bd'; g.fillRect(x, 40, 100, 90); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + 8, 46, 30, 78);
      g.fillStyle = '#7a1e1e'; g.beginPath(); g.roundRect(x + 20, 140, 60, 50, 12); g.fill(); g.fillStyle = '#333'; g.fillRect(x + 44, 190, 12, 40);
    }
    g.fillStyle = '#e9eef1'; g.fillRect(0, 230, w, h);
  }),
  kissa: (rnd) => tex(512, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#6a4a30'); gr.addColorStop(1, '#2a1a10'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let x = 50; x < w; x += 120) { const p = g.createRadialGradient(x, 70, 3, x, 70, 60); p.addColorStop(0, 'rgba(255,214,150,0.95)'); p.addColorStop(1, 'rgba(255,214,150,0)'); g.fillStyle = p; g.fillRect(x - 60, 10, 120, 120); g.fillStyle = '#3a2614'; g.fillRect(x - 1, 0, 2, 58); }
    for (let i = 0; i < 4; i++) { const x = 40 + i * 120; g.fillStyle = '#4a2e18'; g.fillRect(x, 170, 80, 8); g.fillRect(x + 36, 178, 8, 50); g.fillStyle = '#fff'; g.fillRect(x + 20, 162, 10, 8); if (rnd() < 0.6) person(g, x + 70, 140, 0.9, 'rgba(20,12,8,0.75)'); }
    g.fillStyle = '#2f5a33'; g.beginPath(); g.arc(470, 150, 26, 0, Math.PI * 2); g.fill();
  }),
  gacha: (rnd) => tex(512, 256, (g, w, h) => {
    g.fillStyle = '#f7f4fb'; g.fillRect(0, 0, w, h); ceilingLights(g, w, '#ffffff', 80, 6);
    for (let row = 0; row < 2; row++) for (let i = 0; i < 11; i++) {
      const x = 8 + i * 46, y = 30 + row * 105, c = hsl(rnd(), 75, 55);
      g.fillStyle = c; g.fillRect(x, y + 52, 40, 48);
      g.fillStyle = 'rgba(210,230,255,0.7)'; g.fillRect(x + 3, y + 14, 34, 38);
      for (let k = 0; k < 7; k++) { g.fillStyle = hsl(rnd(), 80, 60); g.beginPath(); g.arc(x + 8 + (k % 4) * 8, y + 40 - Math.floor(k / 4) * 9, 4, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = hsl(rnd(), 85, 50); g.fillRect(x, y, 40, 13);
    }
    person(g, 250, 120, 0.9, 'rgba(40,30,60,0.6)');
  }),
  estate: () => tex(512, 256, (g, w, h) => {
    g.fillStyle = '#f1f4f6'; g.fillRect(0, 0, w, h); ceilingLights(g, w, '#ffffff', 100);
    for (let i = 0; i < 3; i++) { g.fillStyle = '#c9ced3'; g.fillRect(40 + i * 160, 170, 110, 10); g.fillStyle = '#5b6168'; g.fillRect(70 + i * 160, 140, 40, 30); }
    person(g, 260, 120, 1, 'rgba(40,45,55,0.7)');
  }),
  books: (rnd) => tex(512, 256, (g, w, h) => {
    g.fillStyle = '#f5f1e8'; g.fillRect(0, 0, w, h); ceilingLights(g, w, '#ffffff', 100);
    for (let row = 0; row < 5; row++) { const y = 24 + row * 42; g.fillStyle = '#8a6a48'; g.fillRect(0, y + 36, w, 5); for (let x = 2; x < w;) { const bw = 3 + rnd() * 6; g.fillStyle = hsl(rnd(), 40 + rnd() * 30, 25 + rnd() * 40); g.fillRect(x, y + 36 - (24 + rnd() * 10), bw, 34); x += bw + 0.5; } }
    for (let i = 0; i < 3; i++) { g.fillStyle = '#c0392b'; g.fillRect(60 + i * 170, 6, 70, 14); text(g, ['新刊', '漫画', '雑誌'][i], 95 + i * 170, 13, 11, '#fff'); }
  }),
  karaoke: () => tex(512, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#2a0b4a'); gr.addColorStop(1, '#0b1a4a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.lineWidth = 4; for (const [c, y] of [['#ff4fd8', 30], ['#38e8ff', 46], ['#ffe14f', 62]]) { g.strokeStyle = c; g.shadowColor = c; g.shadowBlur = 12; g.beginPath(); g.moveTo(20, y); g.lineTo(w - 20, y); g.stroke(); }
    g.shadowBlur = 0; g.fillStyle = '#16102a'; g.fillRect(300, 150, 180, 70); text(g, 'RECEPTION', 390, 170, 16, '#38e8ff', LATIN_FONT, 700);
    g.fillStyle = '#ff4fd8'; g.fillRect(60, 90, 120, 140); person(g, 120, 130, 1.4, '#2a0b4a');
    person(g, 360, 120, 1, 'rgba(10,10,30,0.8)');
  }),
  apartment: () => tex(512, 256, (g, w, h) => {
    g.fillStyle = '#1a1c21'; g.fillRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 30, 0, h); gr.addColorStop(0, '#f2efe6'); gr.addColorStop(1, '#bdb6a6'); g.fillStyle = gr; g.fillRect(170, 30, 170, h - 30);
    g.fillStyle = '#d9d4c8'; for (let y = 200; y < h; y += 14) for (let x = 170; x < 340; x += 28) g.fillRect(x + (y % 28 ? 14 : 0), y, 26, 12);
    g.fillStyle = '#8f949b'; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillRect(360 + i * 34, 70 + j * 30, 30, 26); g.fillStyle = '#33373d'; g.fillRect(366 + i * 34, 78 + j * 30, 18, 3); g.fillStyle = '#8f949b'; }
    g.fillStyle = 'rgba(20,20,20,0.9)'; g.fillRect(253, 30, 4, h - 30);
    text(g, 'メゾン星見', 255, 16, 16, '#d8d2c2');
  }),
};

function signBoard(text1, bg, fg, { font = JP_FONT, border = true, neon = false, sub = null } = {}) {
  return tex(512, 128, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    if (border) { g.strokeStyle = neon ? fg : 'rgba(255,255,255,0.3)'; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12); }
    if (neon) { g.shadowColor = fg; g.shadowBlur = 22; }
    g.fillStyle = fg; g.font = `900 ${sub ? 58 : 70}px ${font}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text1, w / 2, sub ? h / 2 - 12 : h / 2 + 4, w - 40);
    if (sub) { g.shadowBlur = 0; g.font = `700 22px ${LATIN_FONT}`; g.fillText(sub, w / 2, h - 22, w - 60); }
  });
}

const LINES = {
  izakaya: [{ text: 'Laughter and clinking glasses behind the noren. The smell of yakitori slips out.' }, { text: '"Irasshaimase!" someone calls from inside, but not to you.' }],
  ramen: [{ text: 'A ticket machine by the door: shoyu ¥680, miso ¥750. Steam fogs the glass.' }, { text: 'An office worker slurps noodles alone at the end of the counter.' }],
  laundry: [{ text: 'Coin laundry, open 24 hours. One dryer is still turning, its owner nowhere to be seen.' }],
  gacha: [{ who: 'Gacha Gacha Hoshimi', text: 'A capsule toy shop, open 24 hours. Rows and rows of machines: tiny cats, robots, little sushi, even trains.' }, { text: 'You turn the handle on the "ロボ戦士" machine. Click, click… a capsule drops: a little silver robot. Nice enough for a shelf.' }],
  barber: [{ text: 'The barber pole turns slowly. The shop is closed, but someone forgot the light.' }],
  kissa: [{ text: 'A window of sample dishes: omurice, spaghetti napolitan, parfait. All of it plastic.' }, { text: 'Blend coffee ¥450. Inside, an old man reads the same newspaper twice.' }],
  snack: [{ text: 'A small bar lit in purple. Behind the door, someone sings enka, slightly off-key.' }],
  estate: [{ text: 'The glass is covered in apartment flyers: 1K near the station, ¥58,000 a month. Every one is stamped "成約" (taken).' }],
  books: [{ text: 'The magazine rack out front is wrapped in plastic against the rain. This week\'s issue is already sold out.' }],
  karaoke: [{ text: 'The karaoke neon flickers from colour to colour. "Night pack ¥1,500, free-flow drinks."' }],
  closed: [{ text: 'The shutter is pulled tight. Old sticker glue here and there.' }],
  apartment: [{ text: 'The lobby of Maison Hoshimi. The mailboxes are stuffed with pizza flyers.' }],
  florist: [{ who: CAFE_FULL, text: 'Buckets of pink roses line the window, and the glass glows warm against the rain.' }, { text: DESY ? 'Coffee and roses. Somebody named this place with a lot of love.' : 'Coffee and roses, open late for anyone caught in the rain.' }],
};

// S: helpers handed over from world.js
export function buildShop(S, type, side, z0, z1) {
  const { rnd, mesh, box, batch, basic, std, glowPool } = S;
  const w = z1 - z0, cz = (z0 + z1) / 2, out = -side, fx = side * (S.LINE - 0.02), ry = side > 0 ? -Math.PI / 2 : Math.PI / 2;
  const L = S.LINE, gw = w - 0.7;
  const face = (geo, mat, x, y, z) => { const m = mesh(geo, mat, x, y, z); m.rotation.y = ry; return m; };
  const signY = 3.3 + rnd() * 0.25;

  // varied ground-floor cladding on the side pillars
  const clad = S.cladding[Math.floor(rnd() * S.cladding.length)];
  for (const pz of [z0 + 0.18, z1 - 0.18]) batch(box(0.34, 3.0, 0.36), clad, side * (L - 0.15), 1.6, pz);

  const interior = (k, t = INTERIOR[type](rnd)) => face(new THREE.PlaneGeometry(gw, 2.7), basic(t, k), fx, 1.5, cz);
  // shop window frames and glass; shops you can enter leave a doorway in the middle with a transom above it
  const gap = DOOR[type]?.w ?? 0;
  const glazing = (frame = S.frameMat, panes = Math.max(2, Math.round(gw / 1.3))) => {
    for (let i = 0; i <= panes; i++) {
      const z = z0 + 0.35 + (i * gw) / panes;
      if (gap && Math.abs(z - cz) < gap / 2 + 0.1) continue;
      batch(box(0.07, 2.7, 0.06), frame, fx + out * 0.05, 1.5, z);
    }
    batch(box(0.07, 0.06, gw), frame, fx + out * 0.05, 2.82, cz);
    if (!gap) {
      batch(box(0.07, 0.06, gw), frame, fx + out * 0.05, 0.2, cz);
      face(new THREE.PlaneGeometry(gw, 2.7), S.shopGlass, fx + out * 0.04, 1.5, cz);
      return;
    }
    const a = cz - gap / 2, b = cz + gap / 2;
    for (const [p0, p1] of [[z0 + 0.35, a], [b, z1 - 0.35]]) {
      if (p1 - p0 < 0.05) continue;
      batch(box(0.07, 0.06, p1 - p0), frame, fx + out * 0.05, 0.2, (p0 + p1) / 2);
      face(new THREE.PlaneGeometry(p1 - p0, 2.7), S.shopGlass, fx + out * 0.04, 1.5, (p0 + p1) / 2);
    }
    for (const z of [a, b]) batch(box(0.08, 2.7, 0.07), frame, fx + out * 0.05, 1.5, z);
    batch(box(0.08, 0.07, gap), frame, fx + out * 0.05, 2.3, cz);
    face(new THREE.PlaneGeometry(gap, 0.5), S.shopGlass, fx + out * 0.04, 2.56, cz);
  };
  const fascia = (t, k = 1.3, width = Math.min(w - 1, 4.4), h = 0.78) => {
    const sm = basic(t, k), e = S.fasciaEdge, fm = [e, e, e, e, e, e];
    fm[side > 0 ? 1 : 0] = sm;
    mesh(box(0.24, h, width), fm, side * (L - 0.12), signY, cz);
    return sm;
  };
  // a glow on the pavement, plus a real coloured light the nearest-light pool can borrow when you're close
  const pool = (color, k, d = 2.6) => { S.light?.(side * (L - 1.3), 2.3, cz, color, 7 + k * 8, 7); return glowPool(side * (L - d / 2 - 0.1), 0.156, cz, d, w * 0.9, color, k); };
  const talk = (label) => S.interactables.push({ pos: new THREE.Vector3(side * (L - 1.0), 0, cz), r: 1.6, label, lines: LINES[type], type, side });

  switch (type) {
    case 'izakaya': {
      izakayaInterior(S, frame(S, side, z0, z1), rnd); glazing(S.woodMat);
      // wooden koshi lattice either side of the door
      const door = 1.1;
      for (let z = z0 + 0.4; z < z1 - 0.4; z += 0.075) if (Math.abs(z - cz) > door / 2) batch(box(0.04, 2.55, 0.035), S.woodMat, fx + out * 0.1, 1.45, z);
      batch(box(0.06, 0.06, gw), S.woodMat, fx + out * 0.11, 1.0, cz);
      const noren = basic(tex(256, 128, (g, cw, ch) => { g.fillStyle = '#1d2547'; g.fillRect(0, 0, cw, ch); g.fillStyle = '#0c1024'; for (let i = 1; i < 4; i++) g.fillRect(i * 64 - 2, 30, 4, ch); text(g, '酒', cw / 2, 56, 64, '#f2ecdf'); }), 0.9);
      face(new THREE.PlaneGeometry(door, 0.75), noren, fx + out * 0.14, 2.42, cz);
      S.lanterns(side, cz, '酒');
      for (let i = 0; i < 3; i++) batch(new THREE.CylinderGeometry(0.26, 0.26, 0.48, 14), S.strawMat, side * (L - 0.35), 0.4 + (i === 2 ? 0.48 : 0), z0 + 0.5 + (i === 2 ? 0.27 : i * 0.54));
      fascia(signBoard(['居酒屋 星', '炉端 灯', '酒場 雨音'][Math.floor(rnd() * 3)], '#2a1a10', '#f0e2c0', { border: false }), 0.9);
      pool(0xffb070, 0.3);
      break;
    }
    case 'ramen': {
      ramenInterior(S, frame(S, side, z0, z1), rnd); glazing();
      const noren = basic(tex(512, 96, (g, cw, ch) => { g.fillStyle = '#b3201a'; g.fillRect(0, 0, cw, ch); g.fillStyle = '#6a0f0b'; for (let i = 1; i < 5; i++) g.fillRect(i * 102, 26, 3, ch); text(g, 'ら ー め ん', cw / 2, 50, 46, '#fff'); }), 1.0);
      face(new THREE.PlaneGeometry(Math.min(gw, 3), 0.5), noren, fx + out * 0.1, 2.55, cz);
      // ticket machine
      const tm = basic(tex(128, 256, (g, cw, ch) => { g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, cw, ch); for (let r = 0; r < 6; r++) for (let c = 0; c < 3; c++) { g.fillStyle = ['#f6c343', '#e74c3c', '#3498db'][(r + c) % 3]; g.fillRect(10 + c * 38, 20 + r * 26, 32, 20); } g.fillStyle = '#222'; g.fillRect(30, 190, 70, 40); }), 1.0);
      mesh(box(0.42, 1.45, 0.55), [std(0xcfd2d6), std(0xcfd2d6), std(0xcfd2d6), std(0xcfd2d6), std(0xcfd2d6), std(0xcfd2d6)], side * (L - 0.25), 0.88, z1 - 0.6);
      face(new THREE.PlaneGeometry(0.5, 1.3), tm, side * (L - 0.47), 0.9, z1 - 0.6);
      S.steam(side * (L - 0.15), 3.7, z0 + 0.8);
      fascia(signBoard('ラーメン 雨', '#c62a1d', '#fff6d0', { sub: 'RAMEN · 深夜まで' }), 1.3);
      S.collide(side * (L - 0.5), side * L, z1 - 0.9, z1 - 0.3);
      S.interactables.push({ pos: new THREE.Vector3(side * (L - 0.95), 0, z1 - 0.6), r: 0.9, label: 'Buy a ramen ticket ¥680', action: (api) => {
        api.sound.beep(); api.addItem('Ramen ticket');
        return [{ text: 'You press 醤油らーめん. A small ticket prints out with a whir.' }];
      } });
      pool(0xffd9a0, 0.28);
      break;
    }
    case 'laundry': {
      laundryInterior(S, frame(S, side, z0, z1), rnd); glazing();
      fascia(signBoard('コインランドリー', '#1f63c6', '#ffffff', { sub: 'COIN LAUNDRY 24H' }), 1.2);
      batch(box(0.45, 0.42, 1.4), std(0x8a9099, { metalness: 0.5, roughness: 0.4 }), side * (L - 0.3), 0.36, z0 + 1.2);
      pool(0xe6f2ff, 0.45, 3);
      break;
    }
    case 'gacha': {
      const F = frame(S, side, z0, z1), caps = [];
      gachaInterior(S, F, rnd, caps); glazing();
      // a row of two-tier machines out on the pavement either side of the door
      const glassM = new THREE.MeshStandardMaterial({ color: 0xe8f2ff, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.6, depthWrite: false });
      const q = new THREE.Quaternion(), m4 = new THREE.Matrix4(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), col = new THREE.Color();
      const MW = 0.47, doorW = 1.3, hw = w / 2 - 0.4;
      for (const [r0, r1] of [[-hw, -doorW / 2], [doorW / 2, hw]]) {
        const n = Math.floor((r1 - r0) / MW);
        if (n < 1) continue;
        for (let i = 0; i < n; i++) gachaUnit(F, -0.27, r0 + (i + 0.5) * ((r1 - r0) / n), 0, rnd, caps, 2, 22, true);
        S.collide(side * (L - 0.52), side * (L - 0.02), F.wz(r0), F.wz(r1));
      }
      gachaCapsules(S, caps);
      // capsule recycling box by the door, and a POP strip of new arrivals
      const rz = cz + 1.0;
      batch(box(0.4, 0.7, 0.4), glassM, side * (L - 0.95), 0.5, rz);
      const recyc = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 8, 6), std(0xffffff, { roughness: 0.3 }), 26);
      for (let k = 0; k < 26; k++) { m4.compose(v.set(side * (L - 0.95) + (rnd() - 0.5) * 0.3, 0.2 + rnd() * 0.35, rz + (rnd() - 0.5) * 0.3), q, one); recyc.setMatrixAt(k, m4); recyc.setColorAt(k, col.setHSL(rnd(), 0.75, 0.55)); }
      S.scene.add(recyc);
      S.collide(side * (L - 1.2), side * (L - 0.7), rz - 0.25, rz + 0.25);
      for (const dz of [-1.6, 1.6]) S.interactables.push({ pos: new THREE.Vector3(side * (L - 0.85), 0, cz + dz), r: 0.8, label: 'Spin the gacha ¥300', action: playGacha });
      const popTex = tex(512, 64, (g, cw, ch) => { ['NEW!', '新作入荷', '¥300', '限定', 'NEW!', '人気No.1'].forEach((it, i) => { g.fillStyle = ['#ff4fa0', '#ffe14a', '#4fc3ff'][i % 3]; g.fillRect(i * 85 + 4, 4, 78, ch - 8); text(g, it, i * 85 + 43, ch / 2, it.length > 4 ? 15 : 22, '#1a1a1a'); }); });
      face(new THREE.PlaneGeometry(Math.min(w - 1, 4.4), 0.3), basic(popTex, 1.0), fx + out * 0.26, 2.95, cz);
      // neon fascia that slowly cycles colour, plus a vertical sign
      const sm = fascia(signBoard('ガチャガチャ', '#120a1c', '#ff6fd8', { neon: true, sub: 'CAPSULE TOYS 24H' }), 1.8, Math.min(w - 0.6, 5.5), 0.9);
      const vs = S.vSign(side, side > 0 ? z0 + 0.6 : z1 - 0.6, 5.4, 'ガチャ', '#120a1c', '#ffe14a', 1.1);
      S.updaters.push((t) => { sm.color.setHSL((t * 0.05) % 1, 0.6, 0.6).multiplyScalar(2.0); });
      pool(0xffd6f2, 0.45, 3);
      break;
    }
    case 'barber': {
      barberInterior(S, frame(S, side, z0, z1), rnd); glazing();
      // spinning barber pole
      const stripe = tex(64, 128, (g, cw, ch) => {
        g.fillStyle = '#fff'; g.fillRect(0, 0, cw, ch);
        const cols = ['#d11', '#fff', '#1d3fb8', '#fff'];
        for (let i = -8; i < 16; i++) { g.fillStyle = cols[((i % 4) + 4) % 4]; g.beginPath(); g.moveTo(0, i * 16); g.lineTo(cw, i * 16 - 32); g.lineTo(cw, i * 16 - 16); g.lineTo(0, i * 16 + 16); g.closePath(); g.fill(); }
      });
      stripe.wrapS = stripe.wrapT = THREE.RepeatWrapping;
      const pz = side > 0 ? z0 + 0.55 : z1 - 0.55;
      mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.85, 20), new THREE.MeshBasicMaterial({ map: stripe, color: new THREE.Color(1.3, 1.3, 1.3) }), side * (L - 0.22), 2.0, pz);
      for (const y of [1.55, 2.45]) mesh(new THREE.SphereGeometry(0.13, 16, 10), std(0xd9dde2, { metalness: 0.9, roughness: 0.2 }), side * (L - 0.22), y, pz);
      S.updaters.push((t) => { stripe.offset.y = (t * 0.35) % 1; });
      fascia(signBoard('理容 ヒロ', '#f4f4f4', '#b3201a', { sub: 'BARBER SHOP' }), 0.75);
      pool(0xe0f0ff, 0.28);
      break;
    }
    case 'kissa': {
      kissaInterior(S, frame(S, side, z0, z1), rnd); glazing(S.woodMat);
      // window case of plastic food samples
      const samples = basic(tex(256, 192, (g, cw, ch) => {
        g.fillStyle = '#f7efe0'; g.fillRect(0, 0, cw, ch);
        for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
          const x = 20 + c * 80, y = 18 + r * 90;
          g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x + 32, y + 48, 32, 12, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = ['#f2b233', '#d9532b', '#e8d3a8', '#8b5a2b', '#f0e070', '#c94b4b'][r * 3 + c]; g.beginPath(); g.ellipse(x + 32, y + 40, 22, 12, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#333'; g.fillRect(x + 8, y + 64, 48, 12); text(g, '¥' + (650 + (r * 3 + c) * 50), x + 32, y + 70, 10, '#fff', LATIN_FONT, 700);
        }
      }), 1.05);
      const cz2 = side > 0 ? z0 + 1.0 : z1 - 1.0;
      mesh(box(0.5, 0.95, 1.3), S.woodMat, side * (L - 0.27), 0.62, cz2);
      face(new THREE.PlaneGeometry(1.2, 0.85), samples, side * (L - 0.53), 0.68, cz2);
      S.collide(side * (L - 0.55), side * L, cz2 - 0.7, cz2 + 0.7);
      // A-frame chalkboard
      const chalk = basic(tex(128, 192, (g, cw, ch) => { g.fillStyle = '#1f2a22'; g.fillRect(0, 0, cw, ch); g.strokeStyle = '#8a6a48'; g.lineWidth = 8; g.strokeRect(4, 4, cw - 8, ch - 8); text(g, 'COFFEE', cw / 2, 40, 20, '#f5f0e0', LATIN_FONT, 700); text(g, '珈琲 ¥450', cw / 2, 80, 16, '#f5f0e0'); text(g, 'ナポリタン', cw / 2, 115, 14, '#f6c343'); text(g, '¥780', cw / 2, 140, 14, '#f6c343', LATIN_FONT, 700); }), 0.7);
      const az = side > 0 ? z1 - 0.8 : z0 + 0.8, ax = side * (L - 1.3);
      for (const tilt of [0.2, -0.2]) { const p = mesh(new THREE.PlaneGeometry(0.5, 0.75), chalk, ax + out * tilt * 0.4, 0.55, az); p.rotation.set(0, ry, 0); p.rotateX(tilt); if (tilt < 0) p.rotateY(Math.PI); }
      S.collide(ax - 0.25, ax + 0.25, az - 0.3, az + 0.3);
      fascia(signBoard('喫茶 ランプ', '#3b2416', '#e8c27a', { border: true }), 1.0);
      S.awning(side, z0, z1, '#2f4a33');
      pool(0xffcf90, 0.25);
      break;
    }
    case 'snack': {
      // mostly solid tiled wall with one frosted door
      face(new THREE.PlaneGeometry(gw, 2.7), S.tileDark, fx + out * 0.01, 1.5, cz);
      const dz = cz + (rnd() - 0.5) * (gw - 1.2);
      face(new THREE.PlaneGeometry(0.85, 2.05), basic(tex(64, 128, (g, cw, ch) => { const gr = g.createLinearGradient(0, 0, 0, ch); gr.addColorStop(0, '#d8b6ff'); gr.addColorStop(1, '#7a4ab8'); g.fillStyle = gr; g.fillRect(0, 0, cw, ch); g.fillStyle = 'rgba(255,255,255,0.25)'; for (let y = 6; y < ch; y += 8) g.fillRect(4, y, cw - 8, 2); g.fillStyle = '#c9a75a'; g.fillRect(cw - 12, ch / 2, 4, 14); }), 0.9), fx + out * 0.03, 1.2, dz);
      batch(box(0.08, 2.2, 0.06), S.frameMat, fx + out * 0.05, 1.2, dz - 0.46); batch(box(0.08, 2.2, 0.06), S.frameMat, fx + out * 0.05, 1.2, dz + 0.46);
      const neon = S.vSign(side, dz + (dz > cz ? -0.9 : 0.9), 2.2, 'スナック夢', '#14081c', '#d68bff', 0.8);
      neon.userData.mutable = true; S.flicker.push({ mat: neon, base: 1.7, t: 0 });
      glowPool(side * (L - 0.9), 0.156, dz, 1.8, 2.2, 0xb36bff, 0.4);
      // lit stand sign on the pavement, a brass handle, an intercom and a menu plate by the door
      const stand = basic(tex(128, 256, (g, cw, ch) => {
        const gr = g.createLinearGradient(0, 0, 0, ch); gr.addColorStop(0, '#fff6fb'); gr.addColorStop(1, '#f2d8ff'); g.fillStyle = gr; g.fillRect(0, 0, cw, ch);
        g.fillStyle = '#7a2fb8'; g.fillRect(0, 0, cw, 10); g.fillRect(0, ch - 10, cw, 10);
        g.fillStyle = '#5a1f8a'; g.font = `900 34px ${JP_FONT}`; g.textAlign = 'center'; g.textBaseline = 'top';
        ['ス', 'ナ', 'ッ', 'ク'].forEach((c, i) => g.fillText(c, cw / 2, 20 + i * 36));
        text(g, '夢', cw / 2, 190, 40, '#d11'); text(g, 'カラオケ有', cw / 2, 232, 15, '#5a1f8a');
      }), 1.4);
      const sx = side * (L - 0.6), szz = dz + (dz > cz ? -1.4 : 1.4);
      mesh(new THREE.BoxGeometry(0.3, 0.75, 0.3), [stand, stand, S.dark, S.dark, stand, stand], sx, 0.55, szz);
      mesh(new THREE.BoxGeometry(0.34, 0.08, 0.34), S.dark, sx, 0.18, szz);
      S.collide(sx - 0.2, sx + 0.2, szz - 0.2, szz + 0.2);
      mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.35, 8), std(0xc9a75a, { metalness: 0.9, roughness: 0.25 }), fx + out * 0.08, 1.15, dz + 0.3);
      face(new THREE.PlaneGeometry(0.12, 0.18), std(0x2b2e34, { roughness: 0.3, metalness: 0.4 }), fx + out * 0.04, 1.35, dz + 0.62);
      face(new THREE.PlaneGeometry(0.32, 0.22), basic(tex(128, 88, (g, cw, ch) => { g.fillStyle = '#1a0f22'; g.fillRect(0, 0, cw, ch); g.strokeStyle = '#c9a75a'; g.lineWidth = 3; g.strokeRect(3, 3, cw - 6, ch - 6); text(g, 'セット料金', cw / 2, 22, 14, '#c9a75a'); text(g, '¥3,000', cw / 2, 50, 22, '#fff', LATIN_FONT, 700); text(g, '飲み放題 90分', cw / 2, 74, 11, '#d68bff'); }), 1.0), fx + out * 0.04, 1.6, dz - 0.7);
      break;
    }
    case 'estate': {
      estateInterior(S, frame(S, side, z0, z1), rnd); glazing();
      // A-board of listings and two "vacancies" banners on the pavement
      const ab = basic(tex(160, 256, (g, cw, ch) => {
        g.fillStyle = '#1d6b3a'; g.fillRect(0, 0, cw, ch); g.fillStyle = '#fff'; g.fillRect(8, 40, cw - 16, ch - 48);
        text(g, 'おすすめ物件', cw / 2, 21, 20, '#fff');
        for (let i = 0; i < 3; i++) { const y = 48 + i * 68; g.fillStyle = '#c9e2f5'; g.fillRect(14, y, 54, 56); g.strokeStyle = '#333'; g.lineWidth = 2; g.strokeRect(14, y, 54, 56); text(g, ['1K', '1LDK', '2DK'][i], 114, y + 16, 18, '#1d4fb8', LATIN_FONT, 700); text(g, ['4.8万', '7.2万', '6.5万'][i], 114, y + 42, 22, '#d11'); }
      }), 0.9);
      const az = side > 0 ? z1 - 0.8 : z0 + 0.8, ax = side * (L - 1.2);
      ab.side = THREE.DoubleSide;
      for (const tilt of [0.18, -0.18]) { const p = mesh(new THREE.PlaneGeometry(0.5, 0.82), ab, ax + out * tilt * 0.4, 0.58, az); p.rotation.set(0, ry, 0); p.rotateX(tilt); }
      S.collide(ax - 0.28, ax + 0.28, az - 0.32, az + 0.32);
      const flag = basic(nobori('空室あり', '#c0392b', '#fff4d0'), 0.9); flag.side = THREE.DoubleSide;
      for (const fz of [side > 0 ? z0 + 0.9 : z1 - 0.9, side > 0 ? z0 + 1.7 : z1 - 1.7]) {
        mesh(new THREE.CylinderGeometry(0.018, 0.018, 2.6, 6), S.steel, side * (L - 1.5), 1.45, fz);
        const f = mesh(new THREE.PlaneGeometry(0.5, 1.9), flag, side * (L - 1.5), 1.6, fz + side * 0.27); f.rotation.y = ry + Math.PI / 2;
      }
      fascia(signBoard('星見不動産', '#1d6b3a', '#ffffff', { sub: 'REAL ESTATE' }), 1.0);
      pool(0xf0f6ff, 0.3);
      break;
    }
    case 'books': {
      interior(0.62); glazing();
      const covers = basic(tex(256, 128, (g, cw, ch) => { for (let i = 0; i < 8; i++) { g.fillStyle = hsl(rnd(), 60, 50); g.fillRect(4 + i * 31, 6 + (i % 2) * 60, 28, 56); g.fillStyle = '#fff'; g.fillRect(8 + i * 31, 12 + (i % 2) * 60, 20, 6); } }), 0.9);
      const rz = side > 0 ? z0 + 1.1 : z1 - 1.1;
      const rack = mesh(box(0.35, 1.1, 1.3), S.steel, side * (L - 0.3), 0.7, rz);
      const cv = face(new THREE.PlaneGeometry(1.25, 0.65), covers, side * (L - 0.49), 0.95, rz); cv.rotateX(-0.25);
      const plastic = face(new THREE.PlaneGeometry(1.35, 1.2), S.shopGlass, side * (L - 0.52), 0.75, rz);
      S.collide(side * (L - 0.5), side * L, rz - 0.7, rz + 0.7);
      fascia(signBoard('星見書店', '#14532d', '#f4ffe9', { sub: 'BOOKS · MAGAZINES' }), 1.1);
      pool(0xfff4dc, 0.28);
      break;
    }
    case 'karaoke': {
      karaokeInterior(S, frame(S, side, z0, z1), rnd); glazing();
      const fw = Math.min(w - 0.6, 5.5);
      const sm = fascia(signBoard('カラオケ', '#0c0614', '#ff4fd8', { neon: true, font: JP_FONT }), 2.0, fw, 0.95);
      // chasing bulbs all round the sign
      const bx = side * (L - 0.26), pts = [];
      for (let i = 0; i <= 28; i++) { const zz = cz - fw / 2 + (i * fw) / 28; pts.push(new THREE.Vector3(bx, signY + 0.55, zz), new THREE.Vector3(bx, signY - 0.55, zz)); }
      for (let i = 1; i < 6; i++) { const yy = signY - 0.55 + (i * 1.1) / 6; pts.push(new THREE.Vector3(bx, yy, cz - fw / 2), new THREE.Vector3(bx, yy, cz + fw / 2)); }
      S.bulbs?.(pts, [0xffe14a, 0xff6fd8, 0x5ce1ff], 8);
      // neon tube round the doorway
      const tube = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 2.6, 3) });
      for (const dz of [-0.75, 0.75]) S.mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.4, 8), tube, fx + out * 0.08, 1.35, cz + dz);
      S.mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.5, 8).rotateX(Math.PI / 2), tube, fx + out * 0.08, 2.55, cz);
      S.updaters.push((t) => { const k = Math.floor(t * 3) % 7 === 0 ? 0.25 : 1; tube.color.setRGB(0.5 * k, 2.6 * k, 3 * k); });
      // standing price board on the pavement
      const board = tex(160, 256, (g, cw, ch) => {
        g.fillStyle = '#16081c'; g.fillRect(0, 0, cw, ch); g.strokeStyle = '#ff4fd8'; g.lineWidth = 6; g.strokeRect(4, 4, cw - 8, ch - 8);
        text(g, 'カラオケ', cw / 2, 34, 26, '#ff6fd8'); text(g, '30分', cw / 2, 80, 22, '#fff'); text(g, '¥280', cw / 2, 112, 34, '#ffe14a', LATIN_FONT, 700);
        text(g, 'フリータイム', cw / 2, 158, 18, '#5ce1ff'); text(g, '¥1,500', cw / 2, 190, 30, '#ffe14a', LATIN_FONT, 700); text(g, 'ドリンク飲み放題', cw / 2, 228, 14, '#fff');
      });
      const az = side > 0 ? z1 - 0.9 : z0 + 0.9, ax = side * (L - 1.2);
      const bm = new THREE.MeshBasicMaterial({ map: board, color: new THREE.Color(1.15, 1.15, 1.15), side: THREE.DoubleSide });
      for (const tilt of [0.18, -0.18]) { const p = S.mesh(new THREE.PlaneGeometry(0.55, 0.9), bm, ax + out * tilt * 0.45, 0.6, az); p.rotation.set(0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0); p.rotateX(tilt); }
      S.collide(ax - 0.3, ax + 0.3, az - 0.35, az + 0.35);
      const v = S.vSign(side, side > 0 ? z0 + 0.7 : z1 - 0.7, 6.0, 'カラオケ', '#0c0614', '#38e8ff', 1.4);
      const c = new THREE.Color();
      S.updaters.push((t) => { c.setHSL((t * 0.08) % 1, 0.9, 0.6); sm.color.copy(c).multiplyScalar(2.2); v.color.setHSL((t * 0.08 + 0.5) % 1, 0.9, 0.6).multiplyScalar(2.0); });
      pool(0xd070ff, 0.45, 3);
      break;
    }
    case 'florist': {
      // the flower café (Desy Ika's in Desy mode, desy.js): white frames, a pink-striped awning, its name in neon,
      // roses out on the pavement
      floristInterior(S, frame(S, side, z0, z1), rnd); glazing(DOOR.florist.frame);
      const sign = tex(1024, 192, (g, cw, ch) => {
        const gr = g.createLinearGradient(0, 0, cw, 0); gr.addColorStop(0, '#2a1420'); gr.addColorStop(0.5, '#3a1a2a'); gr.addColorStop(1, '#2a1420');
        g.fillStyle = gr; g.fillRect(0, 0, cw, ch);
        g.strokeStyle = '#f7a8c0'; g.lineWidth = 4; g.strokeRect(10, 10, cw - 20, ch - 20);
        g.textAlign = 'center'; g.textBaseline = 'middle';
        for (const [blur, col, lw] of [[30, 'rgba(255,90,160,0.95)', 10], [10, 'rgba(255,160,205,1)', 6], [0, '#fff5f9', 2.5]]) {
          g.shadowColor = col; g.shadowBlur = blur; g.strokeStyle = col; g.lineWidth = lw; g.lineJoin = 'round';
          g.font = 'italic 600 104px "Bodoni 72", Didot, "Playfair Display", Georgia, serif'; g.strokeText(CAFE_NAME, cw / 2 - 90, 92);
        }
        g.shadowBlur = 10; g.shadowColor = '#ff9cc4'; g.fillStyle = '#ffe2ee'; g.font = `600 30px ${LATIN_FONT}`; g.textAlign = 'left';
        g.fillText('FLOWERS', cw / 2 + 170, 74); g.fillText('& CAFÉ', cw / 2 + 170, 116);
        // a little rose
        g.shadowBlur = 16; g.fillStyle = '#ff7ab0'; for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(150 + Math.cos(k * 1.256) * 14, 92 + Math.sin(k * 1.256) * 14, 16, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = '#ffd0e2'; g.beginPath(); g.arc(150, 92, 11, 0, Math.PI * 2); g.fill();
      });
      const sm = fascia(sign, 1.5, Math.min(w - 0.6, 5.6), 0.95);
      S.updaters.push((t) => { const k = 1.45 + Math.sin(t * 1.3) * 0.08; sm.color.setRGB(k, k * 0.96, k); });
      S.awning(side, z0, z1, '#e88aa8');
      const v = S.vSign(side, side > 0 ? z0 + 0.6 : z1 - 0.6, 5.0, '花カフェ', '#2a1420', '#ff9cc4', 1.1);
      void v;
      // tiered stands of rose buckets either side of the door, under the awning
      const zinc = std(0xb8bec4, { metalness: 0.8, roughness: 0.35 }), white = std(0xf2eee8, { roughness: 0.5 });
      const PINKS = [0xf27ea0, 0xf7a8c0, 0xffffff, 0xe0457a, 0xfbd3de, 0xd63a6a];
      const bunches = [];
      for (const s2 of [-1, 1]) {
        const a = s2 < 0 ? z0 + 0.6 : cz + 0.85, b = s2 < 0 ? cz - 0.85 : z1 - 0.6;
        if (b - a < 0.8) continue;
        for (let tier = 0; tier < 2; tier++) {
          const x = side * (L - 0.45 - (1 - tier) * 0.32), y = 0.15 + tier * 0.32;
          batch(box(0.3, 0.04, b - a), white, x, y + 0.3, (a + b) / 2);
          for (const e of [a + 0.05, b - 0.05]) batch(box(0.04, y + 0.15, 0.04), white, x, (0.15 + y + 0.3) / 2, e);
          const n = Math.max(2, Math.floor((b - a) / 0.34));
          for (let k = 0; k < n; k++) {
            const bz = a + 0.17 + k * ((b - a - 0.34) / Math.max(1, n - 1)), by = y + 0.32;
            batch(new THREE.CylinderGeometry(0.12, 0.095, 0.24, 16, 1, true), zinc, x, by + 0.12, bz);
            bunches.push({ x, y: by + 0.05, z: bz, h: 0.58 + rnd() * 0.12, spin: rnd() * 6.28, c: PINKS[(k + tier * 2 + (s2 > 0 ? 3 : 0)) % PINKS.length] });
          }
        }
        S.collide(side * (L - 1.05), side * (L - 0.25), a, b);
      }
      placeRoses(S, 'roses', bunches);
      pool(0xffb8d4, 0.4, 3);
      S.light?.(side * (L - 1.6), 2.4, cz, 0xff9cc4, 6, 6);
      break;
    }
    case 'apartment': {
      apartmentInterior(S, frame(S, side, z0, z1), rnd); glazing(S.frameMat, 2);
      batch(box(0.6, 0.12, 1.6), S.slab, side * (L - 0.3), 2.75, cz);
      if (w > 6.5) S.bike(side * (L - 0.55), side > 0 ? z0 + 1.2 : z1 - 1.2, [0x2b6cb0, 0xd9d9d9, 0x3a8a4a][Math.floor(rnd() * 3)]);
      glowPool(side * (L - 0.9), 0.156, cz, 1.8, 2.2, 0xfff0d0, 0.3);
      break;
    }
    default: { // closed
      const span = w - 0.8, n = Math.max(1, Math.floor(span / 1.08)), start = z0 + 0.4 + (span - n * 1.08) / 2;
      const graffiti = rnd() < 0.35;
      for (let i = 0; i < n; i++) (graffiti && i % 2 ? S.props.shutterG : S.props.shutter).push({ x: fx + out * 0.16, y: 0.15, z: start + (i + 0.5) * 1.08, ry });
      face(new THREE.PlaneGeometry(w - 0.6, 2.6), S.dark, fx, 1.45, cz);
      if (rnd() < 0.45) {
        const paper = basic(tex(128, 180, (g, cw, ch) => { g.fillStyle = '#f7f5ee'; g.fillRect(0, 0, cw, ch); text(g, 'テナント', cw / 2, 40, 22, '#c0261b'); text(g, '募集', cw / 2, 75, 30, '#c0261b'); g.fillStyle = '#333'; for (let i = 0; i < 4; i++) g.fillRect(16, 105 + i * 14, cw - 32, 4); }), 0.75);
        face(new THREE.PlaneGeometry(0.42, 0.6), paper, fx + out * 0.33, 1.4, start + 0.54);
      }
      if (rnd() < 0.6) S.props.secLight.push({ x: fx + out * 0.02, y: 2.85, z: cz, ry });
      if (rnd() < 0.5) fascia(signBoard(['古着 ノラ', '質屋 丸八', '青果 マルヤ', '電器 サトウ'][Math.floor(rnd() * 4)], '#3a3d42', '#c9ccd1', { border: false }), 0.5);
    }
  }
  if (type !== 'snack' && type !== 'closed') talk(type === 'apartment' ? 'Look at the lobby' : 'Look at the shop');
  else talk(type === 'snack' ? 'Listen' : 'Look');

  // walk-in shops: the shop front is solid except the doorway, which gets a real door; the room is registered
  const D = DOOR[type];
  if (D && S.doors) {
    const fa = side * (L - 0.1), fb = side * (L + 0.06);
    S.collide(fa, fb, z0, cz - D.w / 2); S.collide(fa, fb, cz + D.w / 2, z1);
    S.doors.add({ kind: D.kind, x: fx, z: cz, w: D.w, along: 'z', face: side, mat: D.mat, frame: D.frame, sound: D.sound ?? 'slide' });
    const xa = side * (L + 0.04), xb = side * (L + SHOP_DEPTH - 0.05), ca = side * (L - 0.9), cb = side * (L + 0.35);
    S.addRoom({
      name: D.name, jp: ROOM_JP[type], amb: D.amb, minX: Math.min(xa, xb), maxX: Math.max(xa, xb), minZ: z0 + 0.12, maxZ: z1 - 0.12, ceil: SHOP_H - 0.06,
      conn: [{ minX: Math.min(ca, cb), maxX: Math.max(ca, cb), minZ: cz - D.w / 2 + 0.12, maxZ: cz + D.w / 2 - 0.12 }],
    });
  }
}
