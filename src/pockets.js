// Rooms reached through a fade rather than a doorway: a karaoke booth, your own 1K apartment, and the inside of
// a train car for the ride between Hoshimi and Tsukino. They sit far off the map (x ≈ -800) where nothing else is.
import * as THREE from 'three';
import { place } from './furnish.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as TX from './textures.js';
import { sitter } from './interiors.js';

const X0 = -800;
export function buildPockets(W) {
  const { scene, mesh, batch, std, basic, collide, interactables, updaters, lampSpots, spot, addRoom, doors, WALK, FLOORS, surf } = W;
  // a photo-scanned surface that still glows a touch, like the rest of these rooms
  const glowSurf = (name, u, v, tint, k = 0.12) => { const m = surf(name, u, v, { color: tint, metal: false }).clone(); if (m.map) { m.emissive = new THREE.Color(tint); m.emissiveMap = m.map; m.emissiveIntensity = k; } return m; };
  const lit = (c, k = 0.3, o = {}) => { const col = new THREE.Color(c); return new THREE.MeshStandardMaterial({ color: col, emissive: col.clone().multiplyScalar(k * 0.4), roughness: 0.6, ...o }); };
  const bx = (x0, x1, y0, y1, z0, z1, mat) => batch(new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const plane = (w, h, mat, x, y, z, ry = 0) => { const m = mesh(new THREE.PlaneGeometry(w, h), mat, x, y, z); m.rotation.y = ry; return m; };
  const glow = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) });
  // a closed box room: floor, four walls, ceiling, all facing in
  // gap: [x from, x to, height] — an opening in the far (z1) wall
  const shell = (x0, x1, z0, z1, h, floorM, wallM, ceilM, gap = null) => {
    bx(x0, x1, 0, 0.15, z0, z1, floorM);
    bx(x0 - 0.1, x0, 0, h, z0, z1, wallM); bx(x1, x1 + 0.1, 0, h, z0, z1, wallM);
    bx(x0, x1, 0, h, z0 - 0.1, z0, wallM);
    if (gap) { bx(x0, gap[0], 0, h, z1, z1 + 0.1, wallM); bx(gap[1], x1, 0, h, z1, z1 + 0.1, wallM); bx(gap[0], gap[1], gap[2], h, z1, z1 + 0.1, wallM); }
    else bx(x0, x1, 0, h, z1, z1 + 0.1, wallM);
    bx(x0, x1, h, h + 0.1, z0, z1, ceilM);
  };
  const seatAt = (x, z, y, yaw, ox, oz, onSit, label = 'Sit') => interactables.push({ pos: new THREE.Vector3(ox, 0, oz), r: 0.8, label, sit: { x, z, y, yaw, out: { x: ox, z: oz, y: 0.15 } }, onSit });
  const out = {};
  // a world-space frame so the shared seated figure can be used here (rot 0 faces −x)
  // the world as a frame for sitter(): x, z as they are; single = separate meshes (so they can hide)
  const Fw = {
    wx: (d) => d, wz: (z) => z, flip: 0, npc: (slot) => W.npcSlots?.push(slot),
    obj: (d, lz, rot, single = false) => { const c = Math.cos(rot), s = Math.sin(rot); return (geo, mat, ox, oy, oz, r2 = 0) => {
      const x = d + ox * c + oz * s, z = lz - ox * s + oz * c;
      if (!single) return batch(geo, mat, x, oy, z, rot + r2);
      const m = new THREE.Mesh(geo, mat); m.position.set(x, oy, z); m.rotation.y = rot + r2; scene.add(m); return m;
    }; },
  };

  // =========================== KARAOKE BOOTH ===========================
  {
    const x0 = X0, x1 = X0 + 3.4, z0 = 0, z1 = 3.8, h = 2.5;
    shell(x0, x1, z0, z1, h, glowSurf('dirty_carpet', 3, 3, 0x6a4a8a, 0.08), lit(0x2a1a44, 0.25), lit(0x120a1c, 0.1));
    // U-shaped sofa along three walls, a low table with drinks, a tambourine and the song tablet
    // the sofa in a worn purple faux leather
    const sofa = glowSurf('fabric_leather_02', 1.5, 1, 0x8a3aa0, 0.1);

    bx(x0, x0 + 0.6, 0.15, 0.55, z0 + 0.6, z1 - 0.1, sofa); bx(x0, x0 + 0.15, 0.55, 1.05, z0 + 0.6, z1 - 0.1, sofa);
    bx(x0, x1 - 1.2, 0.15, 0.55, z1 - 0.6, z1, sofa); bx(x0, x1 - 1.2, 0.55, 1.05, z1 - 0.15, z1, sofa);
    bx(x0 + 1.0, x0 + 2.0, 0.15, 0.55, z0 + 1.4, z1 - 1.0, lit(0x2a2a30, 0.15, { roughness: 0.2, metalness: 0.4 }));
    for (const [dx, dz, c] of [[0.2, 0.3, 0xffb030], [0.6, 0.9, 0x40c0ff], [0.3, 1.5, 0xff5080]]) {
      mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.14, 12), new THREE.MeshStandardMaterial({ color: c, transparent: true, opacity: 0.8, roughness: 0.1, emissive: new THREE.Color(c).multiplyScalar(0.3) }), x0 + 1.0 + dx, 0.62, z0 + 1.4 + dz);
    }
    mesh(new THREE.TorusGeometry(0.12, 0.025, 8, 20).rotateX(Math.PI / 2), lit(0xd33b2c, 0.3), x0 + 1.7, 0.57, z0 + 2.2);
    bx(x0 + 1.3, x0 + 1.55, 0.55, 0.57, z0 + 1.6, z0 + 1.95, glow(0.5, 0.8, 1.4));
    collide(x0, x0 + 0.6, z0 + 0.6, z1); collide(x0, x1 - 1.2, z1 - 0.6, z1); collide(x0 + 1.0, x0 + 2.0, z0 + 1.4, z1 - 1.0);
    // the big screen with scrolling lyrics (original words, made up for Hoshimi), and the karaoke machine
    const lyr = ['雨の星見通り', 'ネオンが揺れる夜', '傘を忘れたまま', 'きみを待っている', '最終電車まで', 'あと少しだけ'];
    const can = document.createElement('canvas'); can.width = 512; can.height = 288;
    const lt = new THREE.CanvasTexture(can); lt.colorSpace = THREE.SRGBColorSpace;
    const drawLyrics = (t) => {
      const g = can.getContext('2d'), w = 512, hh = 288;
      const gr = g.createLinearGradient(0, 0, w, hh); gr.addColorStop(0, `hsl(${(t * 20) % 360},50%,25%)`); gr.addColorStop(1, `hsl(${(t * 20 + 120) % 360},50%,15%)`);
      g.fillStyle = gr; g.fillRect(0, 0, w, hh);
      for (let i = 0; i < 20; i++) { g.fillStyle = 'rgba(255,255,255,0.08)'; g.beginPath(); g.arc((i * 97 + t * 30) % w, (i * 53) % hh, 18 + (i % 4) * 8, 0, Math.PI * 2); g.fill(); }
      const line = Math.floor(t / 3) % lyr.length, prog = (t % 3) / 3;
      g.font = `900 34px ${TX.JP_FONT}`; g.textBaseline = 'middle';
      for (const [k, y] of [[0, 190], [1, 240]]) {
        const s = lyr[(line + k) % lyr.length], x = 40 + k * 60;
        g.fillStyle = '#ffffff'; g.fillText(s, x, y);
        if (k === 0) { const wdt = g.measureText(s).width * prog; g.save(); g.beginPath(); g.rect(x, y - 24, wdt, 48); g.clip(); g.fillStyle = '#4fd0ff'; g.fillText(s, x, y); g.restore(); }
      }
      g.font = `700 16px ${TX.LATIN_FONT}`; g.fillStyle = '#ffe14a'; g.fillText('♪ 雨夜ブルース  /  Hoshimi Night Band', 20, 26);
      lt.needsUpdate = true;
    };
    drawLyrics(0);
    bx(x1 - 0.08, x1, 0.95, 2.15, z0 + 0.6, z0 + 2.8, lit(0x050505, 0));
    plane(2.1, 1.15, new THREE.MeshBasicMaterial({ map: lt, color: new THREE.Color(1.2, 1.2, 1.2) }), x1 - 0.09, 1.55, z0 + 1.7, -Math.PI / 2);
    bx(x1 - 0.5, x1, 0.15, 0.85, z0 + 0.8, z0 + 2.6, lit(0x1a1a22, 0.1, { metalness: 0.5 }));
    for (let i = 0; i < 6; i++) bx(x1 - 0.52, x1 - 0.5, 0.5 + i * 0.05, 0.52 + i * 0.05, z0 + 1.0 + i * 0.2, z0 + 1.15 + i * 0.2, glow(0.2 + i * 0.3, 2 - i * 0.2, 0.6));
    collide(x1 - 0.5, x1, z0 + 0.8, z0 + 2.6);
    // mirror ball and a coloured light that wheels round the room
    const ball = mesh(new THREE.IcosahedronGeometry(0.16, 2), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.12, flatShading: true, emissive: 0x333344 }), x0 + 1.7, h - 0.3, z0 + 1.9);
    const disco = spot(x0 + 1.7, h - 0.5, z0 + 1.9, { c: 0xff40d0, k: 14, d: 7 });
    lampSpots.push(disco);
    let singT = 0;
    updaters.push((t, dt) => {
      ball.rotation.y = t * 0.8;
      disco.c = new THREE.Color().setHSL((t * 0.12) % 1, 0.9, 0.6).getHex();
      if (singT > 0 || Math.floor(t * 4) % 4 === 0) drawLyrics(t);
      singT = Math.max(0, singT - dt);
    });
    // the door back to the corridor
    bx(x0 + 2.4, x0 + 3.3, 0.15, 2.2, z0 - 0.02, z0, lit(0x3a2a52, 0.15));
    plane(0.25, 0.4, glow(1.2, 0.8, 2.2), x0 + 2.85, 1.6, z0 + 0.01);
    addRoom({ name: 'Karaoke · Room 103', jp: 'カラオケ 103', minX: x0, maxX: x1, minZ: z0, maxZ: z1, y: 0.15, ceil: h, amb: 'karaoke', camDist: 1.8 });
    seatAt(x0 + 0.35, z0 + 1.8, 0.55, Math.PI / 2, x0 + 0.9, z0 + 1.0);
    seatAt(x0 + 1.5, z1 - 0.35, 0.55, Math.PI, x0 + 1.5, z1 - 1.0 - 0.3);
    let back = null;
    interactables.push({ pos: new THREE.Vector3(x1 - 0.9, 0, z0 + 1.7), r: 0.9, label: 'Sing', anim: 'sing', faceYaw: Math.PI / 2, action: (api) => {
      singT = 12; api.sound.win();
      const score = 70 + Math.floor(Math.random() * 29);
      return [
        { who: '♪', text: '雨の星見通り… ネオンが揺れる夜…' },
        { text: 'Your voice bounces around the tiny room. The tambourine on the table trembles by itself.' },
        { who: 'SCORE', text: `${score} points! ${score > 90 ? 'Nearly perfect!' : score > 80 ? 'Very nice.' : 'Not bad. Another song?'}` },
      ];
    } });
    interactables.push({ pos: new THREE.Vector3(x0 + 2.85, 0, z0 + 0.6), r: 0.8, label: 'Out to the lobby', action: (api) => { api.sound.door('swing', 1); api.teleport(back.x, 0.15, back.z, back.yaw); return null; } });
    out.karaoke = { enter: (api, from) => { back = from; api.teleport(x0 + 2.85, 0.15, z0 + 1.0, 0); } };
  }

  // =========================== APARTMENT 305 ===========================
  {
    const x0 = X0, x1 = X0 + 3.6, z0 = 30, z1 = 37.2, h = 2.45;
    const floorT = TX.canvasTex(256, 256, (g, w, hh) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#a07a52' : '#9a7450'; g.fillRect(0, i * 32, w, 32); g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(0, i * 32, w, 2); g.fillRect((i * 83) % w, i * 32, 2, 32); } }, { repeat: true });
    floorT.repeat.set(2, 4);
    shell(x0, x1, z0, z1, h, glowSurf('laminate_floor_02', (x1 - x0) / 1.4, (z1 - z0) / 1.4, 0xd8c4a8), glowSurf('plastered_wall', 3, 2, 0xf2ece0, 0.1), lit(0xf2efe8, 0.2), [x0 + 1.0, x0 + 2.6, 2.15]);
    // lived-in things: a desk chair, a plant, a clock over the TV, a bowl of mikan on the kotatsu, moving boxes never unpacked
    place(scene, 'dining_chair_02', x1 - 0.95, 0.15, z0 + 2.9, Math.PI / 2);
    place(scene, 'potted_plant_02', x0 + 0.45, 0.15, z1 - 1.75, 0.7, { h: 0.9 });
    place(scene, 'wall_clock', x0 + 0.03, 1.85, z0 + 5.0, Math.PI / 2, { s: 0.8 });
    place(scene, 'wooden_bowl_01', x0 + 1.5, 0.44, z0 + 5.1, 0, { s: 0.75 });
    place(scene, 'cardboard_box_01', x1 - 0.35, 0.15, z0 + 4.1, 0.2); place(scene, 'cardboard_box_01', x1 - 0.32, 0.49, z0 + 4.15, 1.4, { s: 0.85 });
    // genkan: a step down, shoes, a shoe cabinet, the door
    bx(x0, x1, 0.0, 0.18, z0, z0 + 0.9, lit(0x8a8680, 0.1, { roughness: 0.6 }));
    for (const [dx, c] of [[0.6, 0xf2f2f2], [0.9, 0x2a2a2a], [1.3, 0xc0392b]]) for (const s of [0, 0.12]) mesh(new RoundedBoxGeometry(0.1, 0.08, 0.26, 2, 0.03), lit(c, 0.2), x0 + dx + s, 0.2, z0 + 0.45);
    bx(x1 - 0.45, x1, 0.15, 1.1, z0 + 0.05, z0 + 0.85, lit(0xd8cfc0, 0.2));
    bx(x0 + 1.4, x0 + 2.3, 0.15, 2.2, z0 - 0.02, z0, lit(0x6a6e74, 0.15, { metalness: 0.6 }));
    collide(x1 - 0.45, x1, z0, z0 + 0.85);
    // kitchenette along the west wall: counter, sink, two burners, a kettle, a small fridge with a microwave
    const ctr = lit(0xd8dcdf, 0.25, { roughness: 0.3, metalness: 0.3 });
    bx(x0, x0 + 0.6, 0.15, 0.9, z0 + 1.0, z0 + 2.8, lit(0xf2f0ea, 0.2)); bx(x0, x0 + 0.62, 0.9, 0.94, z0 + 1.0, z0 + 2.8, ctr);
    bx(x0 + 0.1, x0 + 0.5, 0.86, 0.94, z0 + 1.2, z0 + 1.7, lit(0x8a9096, 0.1, { metalness: 0.8 }));
    for (const dz of [2.1, 2.5]) mesh(new THREE.TorusGeometry(0.09, 0.012, 6, 18).rotateX(Math.PI / 2), lit(0x222222, 0), x0 + 0.3, 0.95, z0 + dz);
    mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.18, 14), lit(0xc0392b, 0.3), x0 + 0.3, 1.03, z0 + 2.1);
    bx(x0, x0 + 0.6, 0.15, 1.2, z0 + 2.85, z0 + 3.45, lit(0xe8e8e8, 0.25)); bx(x0 + 0.05, x0 + 0.55, 1.2, 1.5, z0 + 2.9, z0 + 3.4, lit(0x2a2a2a, 0.1));
    plane(0.3, 0.12, glow(0.4, 1.6, 0.6), x0 + 0.56, 1.35, z0 + 3.15, Math.PI / 2);
    collide(x0, x0 + 0.62, z0 + 1.0, z0 + 3.45);
    // unit-bath door (closed)
    bx(x1 - 0.02, x1, 0.15, 2.0, z0 + 1.2, z0 + 1.95, lit(0xd8d4cc, 0.2));
    plane(0.25, 0.1, basic(TX.binLabel('バス', '#1d4fb8'), 1.0), x1 - 0.03, 1.6, z0 + 1.57, -Math.PI / 2);
    // the main room: bed, kotatsu with a mug, TV, desk with a glowing monitor, bookshelf, posters, a plant
    bx(x1 - 1.1, x1, 0.15, 0.45, z1 - 2.2, z1 - 0.1, lit(0x5a4a3a, 0.15));
    mesh(new RoundedBoxGeometry(1.05, 0.2, 2.0, 2, 0.08), lit(0x8fb0d8, 0.3, { roughness: 0.9 }), x1 - 0.55, 0.55, z1 - 1.15);
    mesh(new RoundedBoxGeometry(0.5, 0.12, 0.35, 2, 0.05), lit(0xf2f2f2, 0.3), x1 - 0.55, 0.7, z1 - 0.35);
    collide(x1 - 1.1, x1, z1 - 2.2, z1);
    const kx = x0 + 1.6, kz = z0 + 5.0;
    bx(kx - 0.45, kx + 0.45, 0.4, 0.44, kz - 0.45, kz + 0.45, lit(0x8a5a32, 0.2, { roughness: 0.4 }));
    mesh(new THREE.BoxGeometry(1.0, 0.25, 1.0), lit(0xc0503a, 0.25, { roughness: 0.95 }), kx, 0.29, kz);
    mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 12), lit(0xf2f2f2, 0.3), kx + 0.15, 0.49, kz - 0.1);
    for (const [dx, dz] of [[-0.75, 0], [0, 0.75]]) mesh(new RoundedBoxGeometry(0.5, 0.08, 0.5, 2, 0.03), lit(0x2a3a5a, 0.2), kx + dx, 0.19, kz + dz);
    collide(kx - 0.5, kx + 0.5, kz - 0.5, kz + 0.5);
    const tvOn = glow(0.6, 0.9, 1.5), tvOff = lit(0x050505, 0);
    bx(x0, x0 + 0.4, 0.15, 0.6, kz - 0.8, kz + 0.8, lit(0x2a2a2a, 0.1));
    bx(x0 + 0.08, x0 + 0.14, 0.62, 1.32, kz - 0.6, kz + 0.6, lit(0x111111, 0));
    const tv = plane(1.14, 0.64, tvOn, x0 + 0.15, 0.97, kz, Math.PI / 2); tv.userData.dynamic = true;
    collide(x0, x0 + 0.4, kz - 0.8, kz + 0.8);
    bx(x1 - 0.6, x1, 0.15, 0.75, z0 + 2.3, z0 + 3.5, lit(0xf2efe8, 0.2)); bx(x1 - 0.62, x1, 0.75, 0.78, z0 + 2.3, z0 + 3.5, lit(0x6a4a30, 0.2));
    bx(x1 - 0.3, x1 - 0.26, 0.8, 1.2, z0 + 2.6, z0 + 3.2, lit(0x111111, 0)); plane(0.55, 0.36, glow(0.8, 1.0, 1.4), x1 - 0.31, 1.0, z0 + 2.9, -Math.PI / 2);
    collide(x1 - 0.62, x1, z0 + 2.3, z0 + 3.5);
    bx(x0, x0 + 0.3, 0.15, 1.8, z1 - 1.3, z1 - 0.3, lit(0xf2efe8, 0.2));
    for (let r = 0; r < 4; r++) for (let k = 0; k < 10; k++) bx(x0 + 0.04, x0 + 0.26, 0.25 + r * 0.42, 0.45 + r * 0.42, z1 - 1.25 + k * 0.095, z1 - 1.17 + k * 0.095, lit(['#c0392b', '#1d4fb8', '#e6c34a', '#2f8f5b', '#e8e2d2'][(r * 3 + k) % 5], 0.25));
    collide(x0, x0 + 0.3, z1 - 1.3, z1 - 0.3);
    plane(0.6, 0.85, basic(TX.poster(), 1.0), x1 - 0.01, 1.55, z1 - 3.0, -Math.PI / 2);
    // the window: rain-streaked glass over a night view of the city, curtains, the balcony beyond
    const view = TX.canvasTex(512, 256, (g, w, hh) => {
      const gr = g.createLinearGradient(0, 0, 0, hh); gr.addColorStop(0, '#0a0e1a'); gr.addColorStop(1, '#2a2030'); g.fillStyle = gr; g.fillRect(0, 0, w, hh);
      for (let i = 0; i < 24; i++) { const bw = 20 + Math.random() * 40, bh = 60 + Math.random() * 150, x = Math.random() * w; g.fillStyle = '#121620'; g.fillRect(x, hh - bh, bw, bh); for (let k = 0; k < 30; k++) if (Math.random() < 0.4) { g.fillStyle = Math.random() < 0.7 ? '#ffd9a1' : '#bfe0ff'; g.fillRect(x + 3 + (k % 4) * (bw / 4), hh - bh + 6 + Math.floor(k / 4) * 10, 4, 5); } }
      g.strokeStyle = 'rgba(255,140,60,0.9)'; g.lineWidth = 2; g.beginPath(); g.moveTo(380, hh); g.lineTo(400, 60); g.lineTo(420, hh); g.stroke(); g.fillStyle = '#ff3020'; g.beginPath(); g.arc(400, 56, 3, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 120; i++) { g.strokeStyle = 'rgba(200,220,255,0.25)'; const x = Math.random() * w, y = Math.random() * hh; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 2, y + 10 + Math.random() * 20); g.stroke(); }
    });
    // a sliding glass door onto the balcony, and the view beyond it
    doors.add({ kind: 'slide', x: x0 + 1.8, z: z1 + 0.05, y: 0.15, w: 1.6, h: 2.0, along: 'x', face: 1, label: 'balcony door', sound: 'slide' });
    const bal = lit(0x9a968e, 0.15, { roughness: 0.8 }), rail = lit(0xb8bcc2, 0.15, { metalness: 0.6, roughness: 0.35 });
    bx(x0 - 0.1, x1 + 0.1, 0, 0.12, z1 + 0.1, z1 + 1.35, bal);
    for (const [a, b2] of [[x0 - 0.2, x0 - 0.1], [x1 + 0.1, x1 + 0.2]]) bx(a, b2, 0, 2.3, z1 + 0.1, z1 + 1.35, lit(0xd8d2c4, 0.2));
    bx(x0 - 0.1, x1 + 0.1, 0.12, 0.95, z1 + 1.3, z1 + 1.36, new THREE.MeshStandardMaterial({ color: 0xc8d4dc, transparent: true, opacity: 0.55, roughness: 0.4, depthWrite: false }));
    bx(x0 - 0.1, x1 + 0.1, 1.0, 1.06, z1 + 1.28, z1 + 1.38, rail);
    for (let x = x0; x <= x1 + 0.01; x += 0.9) bx(x - 0.025, x + 0.025, 0.12, 1.0, z1 + 1.3, z1 + 1.36, rail);
    // AC outdoor unit, laundry pole with towels, a plant, balcony sandals
    bx(x1 - 0.9, x1 - 0.1, 0.12, 0.72, z1 + 0.85, z1 + 1.25, lit(0xe8e8e4, 0.2));
    mesh(new THREE.CircleGeometry(0.2, 20), lit(0x333333, 0), x1 - 0.5, 0.42, z1 + 0.84).rotation.y = Math.PI;
    bx(x0 + 0.1, x1 - 0.1, 1.9, 1.93, z1 + 0.85, z1 + 0.88, rail);
    for (let k = 0; k < 4; k++) {
      const tw = mesh(new THREE.PlaneGeometry(0.4, 0.6).translate(0, -0.3, 0), new THREE.MeshStandardMaterial({ color: [0xf2f2ee, 0x8fb0d8, 0xe8b8b8, 0xd8d0a0][k], roughness: 0.95, side: THREE.DoubleSide }), x0 + 0.6 + k * 0.7, 1.9, z1 + 0.86);
      updaters.push((t) => { tw.rotation.x = Math.sin(t * 1.3 + k) * 0.12; });
    }
    mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.3, 12), lit(0x8a4a2a, 0.2), x0 + 0.3, 0.27, z1 + 1.05);
    mesh(new THREE.IcosahedronGeometry(0.28, 1), lit(0x2f6b3a, 0.2), x0 + 0.3, 0.6, z1 + 1.05);
    for (const dx of [0, 0.12]) mesh(new RoundedBoxGeometry(0.1, 0.05, 0.25, 2, 0.02), lit(0x2a5a8a, 0.2), x0 + 1.2 + dx, 0.15, z1 + 0.3);
    WALK.push({ minX: x0 + 0.1, maxX: x1 - 0.1, minZ: z1 + 0.25, maxZ: z1 + 1.15, minY: -1, maxY: 2 });
    WALK.push({ minX: x0 + 1.15, maxX: x0 + 2.45, minZ: z1 - 0.3, maxZ: z1 + 0.4, minY: -1, maxY: 2 });
    FLOORS.push({ minX: x0 - 0.1, maxX: x1 + 0.1, minZ: z1 + 0.1, maxZ: z1 + 1.35, y: 0.12 });
    collide(x1 - 0.95, x1 - 0.05, z1 + 0.8, z1 + 1.3); collide(x0 + 0.1, x0 + 0.5, z1 + 0.85, z1 + 1.25);
    // the city out there: a wide night panorama a little way off, the rain in front of it
    const pano = mesh(new THREE.PlaneGeometry(26, 11), basic(view, 0.9), x0 + 1.8, 2.5, z1 + 9);
    pano.rotation.y = Math.PI;
    lampSpots.push(spot(x0 + 1.8, 2.2, z1 + 1.0, { c: 0xffd0a0, k: 5, d: 5 }));
    interactables.push({ pos: new THREE.Vector3(x0 + 1.8, 0, z1 + 0.8), r: 1.0, label: 'Look out from the balcony', lines: [{ text: 'Rain falls on the balcony railing. Below, little umbrellas drift along the Hoshimi pavements.' }, { text: 'A neighbour\'s air conditioner hums. Curry drifts from the next window.' }] });

    // more of a lived-in room: rug, closet, clock, calendar, photos, desk lamp, console, manga, an indoor drying rack
    bx(kx - 1.15, kx + 1.15, 0.15, 0.165, kz - 1.1, kz + 1.1, lit(0xc8b89a, 0.2, { roughness: 1 }));
    const fusuma = TX.canvasTex(128, 192, (g, w, hh) => { g.fillStyle = '#efe8d8'; g.fillRect(0, 0, w, hh); g.strokeStyle = '#8a6a48'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, hh - 6); g.fillStyle = 'rgba(120,150,120,0.35)'; for (let i = 0; i < 8; i++) { g.beginPath(); g.ellipse(30 + i * 12, 150 - i * 10, 14, 5, -0.5, 0, Math.PI * 2); g.fill(); } g.fillStyle = '#5a4026'; g.fillRect(w - 18, hh / 2 - 10, 6, 20); });
    for (const dz of [0, 0.7]) plane(0.7, 1.9, basic(fusuma, 0.9), x1 - 0.02, 1.1, z0 + 3.9 + dz, -Math.PI / 2);
    const clockT = TX.canvasTex(96, 96, (g, w, hh) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(48, 48, 44, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#333'; g.lineWidth = 4; g.stroke(); g.lineWidth = 4; g.beginPath(); g.moveTo(48, 48); g.lineTo(48, 18); g.moveTo(48, 48); g.lineTo(70, 56); g.stroke(); });
    plane(0.32, 0.32, basic(clockT, 1.0), x0 + 0.02, 1.95, kz, Math.PI / 2);
    const cal = TX.canvasTex(96, 128, (g, w, hh) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, hh); g.fillStyle = '#c0392b'; g.fillRect(0, 0, w, 40); g.fillStyle = '#fff'; g.font = `900 22px ${TX.JP_FONT}`; g.fillText('10月', 20, 28); g.fillStyle = '#333'; for (let i = 0; i < 30; i++) g.fillRect(8 + (i % 7) * 12, 52 + Math.floor(i / 7) * 14, 7, 7); g.fillStyle = '#d11'; g.fillRect(8 + 5 * 12, 52 + 14, 8, 8); });
    plane(0.3, 0.4, basic(cal, 1.0), x1 - 0.02, 1.55, z0 + 2.5, -Math.PI / 2);
    for (const [px, pz, ry] of [[x1 - 0.03, z1 - 1.4, -Math.PI / 2], [x1 - 0.03, z1 - 1.0, -Math.PI / 2]]) { bx(px - 0.02, px + 0.01, 1.35, 1.6, pz - 0.12, pz + 0.12, lit(0x5a4026, 0.15)); plane(0.18, 0.18, lit(new THREE.Color().setHSL(Math.random(), 0.4, 0.6).getHex(), 0.5), px - 0.025, 1.475, pz, ry); }
    mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.04, 12), lit(0x222222, 0.1), x1 - 0.45, 0.8, z0 + 2.45);
    mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.35, 6), lit(0x222222, 0.1), x1 - 0.45, 0.97, z0 + 2.45);
    mesh(new THREE.ConeGeometry(0.1, 0.12, 14, 1, true), glow(2.2, 1.9, 1.4), x1 - 0.4, 1.14, z0 + 2.45);
    bx(x0 + 0.1, x0 + 0.3, 0.6, 0.65, kz + 0.2, kz + 0.55, lit(0xf2f2f2, 0.3));
    bx(x0 + 0.35, x0 + 0.42, 0.62, 0.65, kz - 0.3, kz - 0.1, lit(0x222222, 0.1));
    for (let k = 0; k < 7; k++) bx(x1 - 1.35, x1 - 1.17, 0.15 + k * 0.025, 0.17 + k * 0.025, z1 - 0.5 + (k % 2) * 0.01, z1 - 0.38 + (k % 2) * 0.01, lit(['#c0392b', '#1d4fb8', '#e6c34a', '#2f8f5b'][k % 4], 0.25));
    const hx = x0 + 2.9, hz = z1 - 1.5;
    for (const dx of [-0.35, 0.35]) bx(hx + dx - 0.015, hx + dx + 0.015, 0.15, 1.5, hz - 0.015, hz + 0.015, rail);
    bx(hx - 0.37, hx + 0.37, 1.48, 1.51, hz - 0.015, hz + 0.015, rail);
    for (let k = 0; k < 3; k++) { const sh = plane(0.25, 0.45, new THREE.MeshStandardMaterial({ color: [0xf2f2f2, 0x2a3a5a, 0xc87a5a][k], roughness: 0.9, side: THREE.DoubleSide }), hx - 0.22 + k * 0.22, 1.22, hz, Math.PI / 2); }
    collide(hx - 0.4, hx + 0.4, hz - 0.1, hz + 0.1);
    // genkan: slippers, an umbrella stand, a coat on a hook, a bowl for keys
    for (const dx of [0, 0.13]) mesh(new RoundedBoxGeometry(0.11, 0.04, 0.27, 2, 0.02), lit(0xc8a0c0, 0.2), x0 + 1.6 + dx, 0.18, z0 + 1.05);
    mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.45, 14, 1, true), lit(0x5a5e66, 0.1, { metalness: 0.6, side: THREE.DoubleSide }), x0 + 0.25, 0.4, z0 + 0.3);
    for (const dx of [-0.03, 0.04]) mesh(new THREE.ConeGeometry(0.05, 0.9, 8, 1, true), new THREE.MeshStandardMaterial({ color: 0xe8f0f8, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }), x0 + 0.25 + dx, 0.6, z0 + 0.3);
    bx(x0 + 0.5, x0 + 0.95, 0.95, 1.65, z0 + 0.02, z0 + 0.14, lit(0x3a4a5a, 0.15, { roughness: 0.9 }));
    mesh(new THREE.CylinderGeometry(0.09, 0.06, 0.05, 14), lit(0x8a6a48, 0.2), x1 - 0.22, 1.13, z0 + 0.45);
    // kitchen: range hood, spice shelf, rice cooker, a dish rack, sorted bins
    bx(x0, x0 + 0.5, 1.75, 1.95, z0 + 1.95, z0 + 2.65, lit(0xc8ccd2, 0.15, { metalness: 0.8, roughness: 0.3 }));
    bx(x0, x0 + 0.18, 1.45, 1.48, z0 + 1.05, z0 + 1.9, lit(0x8a6a48, 0.2));
    for (let k = 0; k < 6; k++) mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.09, 8), lit(['#c0392b', '#e6c34a', '#2f8f5b', '#f2f2f2', '#5a3a20', '#e67e22'][k], 0.25), x0 + 0.09, 1.53, z0 + 1.12 + k * 0.13);
    mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.22, 18), lit(0xf2f2f2, 0.3, { roughness: 0.3 }), x0 + 0.3, 1.05, z0 + 1.85);
    bx(x0 + 0.05, x0 + 0.4, 0.94, 0.96, z0 + 1.0, z0 + 1.2, rail);
    for (let k = 0; k < 4; k++) { const pl = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.012, 16), lit(0xf6f6f2, 0.3), x0 + 0.22, 1.05, z0 + 1.04 + k * 0.035); pl.rotation.x = Math.PI / 2; }
    for (let k = 0; k < 3; k++) bx(x0 + 0.7 + k * 0.3, x0 + 0.96 + k * 0.3, 0.15, 0.55, z0 + 3.2, z0 + 3.45, lit(['#2f8f5b', '#1d4fb8', '#e6c34a'][k], 0.25));
    collide(x0 + 0.65, x0 + 1.6, z0 + 3.15, z0 + 3.5);
    for (const dx of [0.5, 3.1]) mesh(new THREE.BoxGeometry(0.5, 2.1, 0.06), lit(0x6a8aa8, 0.25, { roughness: 0.95 }), x0 + dx, 1.2, z1 - 0.1);
    bx(x0 + 0.55, x0 + 3.05, 2.2, 2.26, z1 - 0.12, z1 - 0.06, lit(0x888888, 0.1));
    // ceiling light (switchable) and an AC unit
    const lamp = glow(2.2, 2.1, 1.9); lamp.userData.mutable = true;
    mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.06, 24), lamp, x0 + 1.8, h - 0.04, z0 + 4.6);
    const roomLight = spot(x0 + 1.8, h - 0.3, z0 + 4.6, { c: 0xfff0d8, k: 16, d: 8 }); lampSpots.push(roomLight);
    bx(x0 + 2.4, x1, 2.05, 2.35, z0 + 3.8, z0 + 4.0, lit(0xf2f2f2, 0.3));
    addRoom({ name: 'Room 305', jp: '305号室', minX: x0, maxX: x1, minZ: z0, maxZ: z1, y: 0.15, ceil: h, amb: 'quiet', camDist: 1.8 });
    let back = null, lightOn = true;
    seatAt(kx + 0.75 - 0.75, kz + 0.75, 0.32, Math.PI, kx, kz + 1.25, (api) => api.say([{ text: 'The kotatsu is warm. Your legs refuse to come out again.' }]));
    interactables.push({ pos: new THREE.Vector3(x0 + 0.9, 0, kz), r: 0.8, label: 'TV on/off', action: (api) => { tv.material = tv.material === tvOn ? tvOff : tvOn; api.sound.beep(); return null; } });
    interactables.push({ pos: new THREE.Vector3(x0 + 2.3, 0, z0 + 1.0), r: 0.8, label: 'Switch the light', action: (api) => { lightOn = !lightOn; lamp.color.setRGB(...(lightOn ? [2.2, 2.1, 1.9] : [0.1, 0.1, 0.1])); roomLight.k = lightOn ? 16 : 1.5; api.sound.burst({ freq: 2500, q: 3, dur: 0.03, gain: 0.2 }); return null; } });
    interactables.push({ pos: new THREE.Vector3(x0 + 1.8, 0, z1 - 0.9), r: 0.9, label: 'Look out the window', lines: [{ text: 'Rain runs down the glass. Far off, an orange tower blinks slowly above the Hoshimi rooftops.' }, { text: 'A train crosses the viaduct, its windows like a string of glowing beads.' }] });
    // sit on the foot of the bed facing the room, lie back with your head on the pillow, then the night passes
    interactables.push({ pos: new THREE.Vector3(x1 - 1.4, 0, z1 - 1.2), r: 0.9, label: 'Sleep until the next night', action: (api) => {
      const out = { x: x1 - 1.45, z: z1 - 1.3, y: 0.15 };
      if (!api.player.specialInfo?.lie) { api.sleep?.(); return null; }
      api.player.sit({ x: x1 - 0.55, z: z1 - 1.75, y: 0.66, yaw: Math.PI, out, lie: 0.35, wakeYaw: -Math.PI / 2,
        onLie: () => api.sleep?.(() => api.player.wake()) });
      return null;
    } });
    interactables.push({ pos: new THREE.Vector3(x0 + 1.85, 0, z0 + 1.1), r: 0.8, label: 'Out to the lobby', action: (api) => { api.sound.door('swing', 1); api.teleport(back.x, 0.15, back.z, back.yaw); return null; } });
    out.apartment = { enter: (api, from) => { back = from; api.teleport(x0 + 1.85, 0.15, z0 + 1.3, 0); } };
  }

  // =========================== TRAIN CAR (the ride) ===========================
  {
    const x0 = X0, x1 = X0 + 18, z0 = 60, z1 = 62.8, h = 2.3;
    shell(x0, x1, z0, z1, h, lit(0x6a6a62, 0.15, { roughness: 0.5 }), lit(0xd8dad8, 0.3), lit(0xe8eae8, 0.4));
    // long green benches under the windows, poles, swinging straps, door ends, hanging ads, LED info above the doors
    const bench = lit(0x2f7a4a, 0.25, { roughness: 0.9 });
    const doors = [3, 9, 15];
    for (const [za, zb] of [[z0, z0 + 0.5], [z1 - 0.5, z1]]) {
      for (let s = 0; s < doors.length + 1; s++) {
        const a = s === 0 ? x0 + 0.3 : x0 + doors[s - 1] + 0.75, b = s === doors.length ? x1 - 0.3 : x0 + doors[s] - 0.75;
        bx(a, b, 0.15, 0.6, za, zb, bench);
        bx(a, b, 0.6, 1.05, za === z0 ? z0 : z1 - 0.1, za === z0 ? z0 + 0.1 : z1, bench);
        collide(a, b, za, zb);
      }
    }
    // windows: a strip of night city that scrolls past
    const scen = TX.canvasTex(1024, 128, (g, w, hh) => {
      g.fillStyle = '#05070d'; g.fillRect(0, 0, w, hh);
      for (let x = 0; x < w;) { const bw = 20 + Math.random() * 60, bh = 30 + Math.random() * 90; g.fillStyle = '#0e121a'; g.fillRect(x, hh - bh, bw, bh); for (let k = 0; k < 16; k++) if (Math.random() < 0.35) { g.fillStyle = Math.random() < 0.8 ? '#ffd9a1' : '#bfe0ff'; g.fillRect(x + 3 + (k % 4) * (bw / 4.5), hh - bh + 5 + Math.floor(k / 4) * 9, 3, 4); } x += bw + 2; }
      for (let i = 0; i < 12; i++) { g.fillStyle = 'rgba(255,200,120,0.9)'; g.fillRect(Math.random() * w, 20 + Math.random() * 30, 30 + Math.random() * 40, 2); }
    }, { repeat: true });
    scen.repeat.set(2, 1);
    const win = new THREE.MeshBasicMaterial({ map: scen, color: new THREE.Color(1.0, 1.0, 1.05) });
    for (const [z, ry] of [[z0 + 0.02, 0], [z1 - 0.02, Math.PI]]) for (let s = 0; s < doors.length + 1; s++) {
      const a = s === 0 ? x0 + 0.6 : x0 + doors[s - 1] + 1.0, b = s === doors.length ? x1 - 0.6 : x0 + doors[s] - 1.0;
      plane(b - a, 0.8, win, (a + b) / 2, 1.55, z, ry);
    }
    const doorM = lit(0xb8bcc2, 0.2, { metalness: 0.6, roughness: 0.3 });
    for (const dx of doors) for (const [z, ry] of [[z0 + 0.03, 0], [z1 - 0.03, Math.PI]]) {
      bx(x0 + dx - 0.65, x0 + dx + 0.65, 0.15, 2.0, z - 0.02, z + 0.02, doorM);
      plane(0.45, 0.8, win, x0 + dx - 0.3, 1.4, z + (ry ? -0.03 : 0.03), ry); plane(0.45, 0.8, win, x0 + dx + 0.3, 1.4, z + (ry ? -0.03 : 0.03), ry);
      bx(x0 + dx - 0.5, x0 + dx + 0.5, 2.05, 2.2, z - 0.04, z + 0.04, lit(0x111111, 0));
    }
    const led = TX.canvasTex(512, 48, (g, w, hh) => { g.fillStyle = '#050505'; g.fillRect(0, 0, w, hh); g.fillStyle = '#ff9a3c'; g.font = `700 22px ${TX.JP_FONT}`; g.textBaseline = 'middle'; g.fillText('次は  つきの   Next: Tsukino   ▶▶', 10, hh / 2); }, { repeat: true });
    led.repeat.set(0.5, 1);
    for (const dx of doors) for (const [z, ry] of [[z0 + 0.07, 0], [z1 - 0.07, Math.PI]]) plane(0.95, 0.11, new THREE.MeshBasicMaterial({ map: led, color: new THREE.Color(1.5, 1.5, 1.5) }), x0 + dx, 2.12, z, ry);
    const steelM = lit(0xd0d4d8, 0.2, { metalness: 0.9, roughness: 0.2 });
    for (const za of [z0 + 0.75, z1 - 0.75]) bx(x0, x1, 2.0, 2.03, za - 0.015, za + 0.015, steelM);
    const straps = [];
    for (let x = x0 + 0.6; x < x1 - 0.3; x += 0.45) for (const za of [z0 + 0.75, z1 - 0.75]) {
      const g = new THREE.Group(); g.position.set(x, 2.0, za); scene.add(g);
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 0.01), lit(0xf2f2f2, 0.2)); st.position.y = -0.15; g.add(st);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 14), lit(0xf2c400, 0.3)); ring.position.y = -0.35; g.add(ring);
      straps.push(g);
    }
    for (const dx of doors) for (const e of [-0.8, 0.8]) for (const za of [z0 + 0.55, z1 - 0.55]) bx(x0 + dx + e - 0.02, x0 + dx + e + 0.02, 0.15, h, za - 0.02, za + 0.02, steelM);
    const ads = TX.canvasTex(256, 128, (g, w, hh) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, hh); g.fillStyle = '#d11'; g.font = `900 30px ${TX.JP_FONT}`; g.fillText('リズム祭', 14, 44); g.fillStyle = '#222'; g.font = `700 16px ${TX.JP_FONT}`; g.fillText('今週土曜 22:00 ゲームセンター・ルミナ', 14, 80); g.fillStyle = '#1d4fb8'; g.fillRect(0, hh - 16, w, 16); });
    for (let x = x0 + 1.5; x < x1 - 1; x += 3) { const a = plane(0.7, 0.35, basic(ads, 1.0), x, 1.85, (z0 + z1) / 2); a.material.side = THREE.DoubleSide; }
    for (let x = x0 + 1; x < x1; x += 2) bx(x - 0.6, x + 0.6, h - 0.03, h - 0.01, (z0 + z1) / 2 - 0.1, (z0 + z1) / 2 + 0.1, glow(2.1, 2.15, 2.2));
    for (const [x, z, rot, c] of [[x0 + 5, z0 + 0.3, Math.PI / 2, 0x2a2d35], [x0 + 6.2, z1 - 0.3, -Math.PI / 2, 0x6a2a2a], [x0 + 12, z0 + 0.3, Math.PI / 2, 0x3b4a6b], [x0 + 16.2, z1 - 0.3, -Math.PI / 2, 0xc9a77a]]) sitter(Fw, x, z, rot, { cloth: c, seat: 0.6, hands: 'lap' });
    addRoom({ name: 'Local train', jp: '各駅停車', minX: x0, maxX: x1, minZ: z0, maxZ: z1, y: 0.15, ceil: h, amb: 'station', camDist: 1.7 });
    // the ride: the city scrolls past, straps sway, then the doors open at the other end
    let ride = null;
    updaters.push((t, dt) => {
      if (!ride) return;
      ride.t += dt;
      const v = ride.t < 3 ? ride.t / 3 : ride.t > ride.len - 3 ? Math.max(0, (ride.len - ride.t) / 3) : 1;
      scen.offset.x = (scen.offset.x + dt * v * 0.35) % 1; led.offset.x = (led.offset.x + dt * 0.12) % 1;
      for (const [i, g] of straps.entries()) g.rotation.z = Math.sin(t * 2.3 + i * 0.4) * 0.08 * v + (ride.t < 3 ? -0.1 : ride.t > ride.len - 3 ? 0.12 : 0) * (1 - Math.abs(v - 0.5) * 2);
      W.sound.trainDist = 5 * (1 - v) + 1;
      if (ride.t >= ride.len) { const r = ride; ride = null; W.sound.trainDist = 999; r.api.sound.chime(); r.api.teleport(r.to.x, r.to.y, r.to.z, r.to.yaw); }
    });
    seatAt(x0 + 7, z0 + 0.25, 0.6, 0, x0 + 7, z0 + 1.0);
    seatAt(x0 + 10.5, z1 - 0.25, 0.6, Math.PI, x0 + 10.5, z1 - 1.0);
    out.train = {
      ride: (api, to, name) => {
        api.teleport(x0 + 9, 0.15, (z0 + z1) / 2, Math.PI / 2, () => { ride = { t: 0, len: 16, to, api }; api.toast(`Bound for ${name}…`); });
      },
    };
  }
  return out;
}
