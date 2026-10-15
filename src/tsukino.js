// Tsukino (月野): the next stop down the line, built far east of Hoshimi (x ≈ 1200). A small station at the north
// end opens onto Tsukino Ginza, a covered shopping arcade (shōtengai) — mostly shuttered at this hour, except a
// pachinko parlour that never sleeps, a taiyaki stand and a 100-yen shop.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as TX from './textures.js';
import { buildTrain } from './train.js';
import { WALK } from './district.js';

export const TSU = { x: 1200, z0: -60, z1: 60, half: 4.5, roof: 7.6 };

export function buildTsukino(W) {
  const { scene, mesh, batch, std, basic, surf, collide, interactables, updaters, lampSpots, spot, glowPool, rainSurfaces, rainEdges, props, addRoom, doors } = W;
  const rnd = TX.mulberry32(777);
  const X = TSU.x, A = TSU.half, Z0 = TSU.z0, Z1 = TSU.z1, RH = TSU.roof;
  const bx = (x0, x1, y0, y1, z0, z1, mat) => batch(new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const plane = (w, h, mat, x, y, z, ry = 0) => { const m = mesh(new THREE.PlaneGeometry(w, h), mat, x, y, z); m.rotation.y = ry; return m; };
  const glow = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) });
  const steel = std(0x6a6e74, { metalness: 0.7, roughness: 0.4 });

  // ground: wet asphalt all round, patterned tiles under the arcade
  const ground = mesh(new THREE.PlaneGeometry(260, 260), surf('asphalt_02', 40, 40, { wet: 0.45, color: 0x7a7c82 }), X, 0.0, 0); ground.rotation.x = -Math.PI / 2;
  const tileT = TX.canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#8a8478'; g.fillRect(0, 0, w, h);
    const s = 32; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#9a9286' : '#7e776c'; g.fillRect(x * s + 1, y * s + 1, s - 2, s - 2); }
    g.fillStyle = '#b8862a'; for (let x = 0; x < 8; x++) g.fillRect(x * s + 1, 3 * s + 1, s - 2, s * 2 - 2);
    g.fillStyle = '#d8d2c4'; g.beginPath(); g.arc(w / 2, h / 2, 26, 0, Math.PI * 2); g.fill(); g.fillStyle = '#b8862a'; g.font = `900 30px ${TX.JP_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('月', w / 2, h / 2 + 2);
  }, { repeat: true });
  tileT.repeat.set(1, (Z1 - Z0) / 8);
  const tiles = mesh(new THREE.PlaneGeometry(A * 2, Z1 - Z0), new THREE.MeshStandardMaterial({ map: tileT, roughness: 0.18, metalness: 0.15 }), X, 0.03, (Z0 + Z1) / 2); tiles.rotation.x = -Math.PI / 2;

  // arched translucent roof on steel trusses, skylight seams, a lit strip down the middle
  const roofM = new THREE.MeshStandardMaterial({ color: 0xb8c4cc, emissive: 0x2a3036, transparent: true, opacity: 0.78, roughness: 0.35, metalness: 0.2, side: THREE.DoubleSide, depthWrite: false });
  const arch = new THREE.CylinderGeometry(A + 0.3, A + 0.3, Z1 - Z0, 24, 1, true, -Math.PI / 2, Math.PI);
  arch.rotateX(-Math.PI / 2); arch.scale(1, 0.45, 1);   // half-cylinder along z, arching upwards
  mesh(arch, roofM, X, RH, (Z0 + Z1) / 2);
  for (let z = Z0; z <= Z1; z += 4) {
    const tr = new THREE.TorusGeometry(A + 0.28, 0.06, 6, 24, Math.PI); tr.scale(1, 0.45, 1);
    batch(tr, steel, X, RH, z);
    bx(X - A - 0.3, X + A + 0.3, RH - 0.05, RH + 0.05, z - 0.04, z + 0.04, steel);
    for (const s of [-1, 1]) bx(X + s * (A + 0.25) - 0.08, X + s * (A + 0.25) + 0.08, 4.0, RH, z - 0.08, z + 0.08, steel);
  }
  bx(X - 0.3, X + 0.3, RH + A * 0.45 - 0.05, RH + A * 0.45, Z0, Z1, glow(1.6, 1.6, 1.5));
  rainSurfaces.push({ x0: X - A - 0.4, x1: X + A + 0.4, z0: Z0, z1: Z1, y: RH + A * 0.45, splash: true });
  for (const z of [Z0, Z1]) rainEdges.push({ x0: X - A, x1: X + A, z, y: RH, rate: 4, alongX: true });
  // lights under the roof, the arcade's name across both ends, hanging banners and lantern strings
  for (let z = Z0 + 3; z < Z1; z += 6) { mesh(new THREE.SphereGeometry(0.22, 14, 10), glow(2.4, 2.2, 1.8), X, RH - 0.25, z); lampSpots.push(spot(X, RH - 0.6, z, { c: 0xfff0d8, k: 22, d: 14 })); }
  const nameT = TX.canvasTex(1024, 128, (g, w, h) => { g.fillStyle = '#1a2a5a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#ffd27a'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12); g.fillStyle = '#ffe9b0'; g.font = `900 76px ${TX.JP_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('月野銀座商店街', w / 2, h / 2 - 4); g.font = `700 20px ${TX.LATIN_FONT}`; g.fillText('TSUKINO GINZA SHOPPING STREET', w / 2, h - 18); });
  for (const [z, ry] of [[Z1 + 0.05, 0], [Z0 - 0.05, Math.PI]]) { bx(X - A - 0.3, X + A + 0.3, 4.6, 5.8, z - 0.1, z + 0.1, std(0x1a2a5a)); plane(A * 2, 1.0, basic(nameT, 1.4), X, 5.2, z + (ry ? -0.11 : 0.11), ry); }
  const banners = ['大売出し', '月野まつり', '雨の日割引', 'スタンプ', '歳末セール', '星見線'];
  for (let z = Z0 + 6; z < Z1 - 2; z += 8) for (const s of [-1, 1]) {
    const t = banners[Math.floor(rnd() * banners.length)], c = ['#c0392b', '#1d4fb8', '#2f8f5b', '#e67e22'][Math.floor(rnd() * 4)];
    // two faces back to back so the lettering reads the right way from both directions
    const b = new THREE.Group(); b.position.set(X + s * 2.0, 5.2, z); scene.add(b);
    const bm = basic(TX.nobori(t, c, '#fff4d0'), 0.95);
    for (const ry of [0, Math.PI]) { const f = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 2.0), bm); f.rotation.y = ry; f.position.z = ry ? -0.005 : 0.005; b.add(f); }
    b.userData = { sp: 0.7 + rnd() * 0.4, ph: rnd() * 6 };
    updaters.push((tt) => { b.rotation.x = Math.sin(tt * b.userData.sp + b.userData.ph) * 0.05; });
  }
  const lbulbs = [];
  for (let z = Z0 + 1; z < Z1; z += 0.6) lbulbs.push(new THREE.Vector3(X + Math.sin(z * 0.5) * 2.2, 5.9 + Math.cos(z * 0.9) * 0.1, z));
  W.bulbs(lbulbs, [0xffd27a, 0xff6a5a, 0xfff2c4], 4);
  for (let z = Z0 + 10; z < Z1; z += 20) for (const s of [-1, 1]) { const sp = mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.3, 12).rotateZ(s * Math.PI / 2), std(0xd8d8d8), X + s * (A - 0.2), 4.2, z); }

  // shop fronts along both sides: mostly shuttered at this hour, two-storey facades above
  const facadeM = ['#8a8070', '#6e7074', '#9a8c78', '#5e6670'].map((c) => surf('white_plaster_02', 2, 2, { color: new THREE.Color(c).getHex(), wet: 0.85 }));
  const openShops = { 3: 'taiyaki', 8: 'hyakkin', 12: 'pachinko', 17: 'tea', 22: 'izakaya' };
  let idx = 0;
  const shopList = [];
  const pachinkoAt = [];
  for (const s of [-1, 1]) {
    let z = Z0 + 0.5;
    while (z < Z1 - 3) {
      const w = 4 + Math.floor(rnd() * 3), z0 = z, z1 = Math.min(Z1, z + w), cz = (z0 + z1) / 2, fx = X + s * A, out = -s;
      const kind = openShops[idx++] || (rnd() < 0.15 ? 'snack' : 'closed');
      // the building: block behind the frontage, facade up to the roof, upper windows
      const fm = facadeM[Math.floor(rnd() * facadeM.length)];
      if (kind === 'pachinko') { bx(fx, fx + s * 10, 3.7, RH + 2, z0, z1, fm); bx(fx + s * 9.1, fx + s * 10, 0, 3.7, z0, z1, fm); }
      else bx(fx, fx + s * 10, 0, RH + 2, z0, z1, fm);
      if (kind !== 'pachinko') collide(Math.min(fx, fx + s * 10), Math.max(fx, fx + s * 10), z0, z1);
      for (let k = 0; k < Math.floor(w / 1.8); k++) {
        const wz = z0 + 0.9 + k * 1.8, on = rnd() < 0.3;
        plane(1.1, 1.0, on ? glow(1.3, 1.0, 0.6) : std(0x1a2028, { roughness: 0.1, metalness: 0.5 }), fx + out * 0.01, 5.4, wz, s > 0 ? -Math.PI / 2 : Math.PI / 2);
      }
      // a signboard for every shop, lit or not
      const names = { closed: ['青果 八百丸', '鮮魚 魚正', '洋品 マキ', '金物 タナカ', '呉服 月乃屋', '時計 メガネ', '薬 ツキノ', '靴 ハヤシ', '花 フローラ', '写真館'][Math.floor(rnd() * 10)], taiyaki: 'たい焼き 月', hyakkin: '100円ショップ', pachinko: 'パチンコ ムーン', tea: '日本茶 緑香園', izakaya: '酒処 三日月', snack: 'スナック 夜桜' };
      const lit = kind !== 'closed';
      shopList.push({ s, cz, name: names[kind], lit, kind });
      const sign = mesh(new THREE.BoxGeometry(0.2, 0.7, Math.min(w - 0.6, 4)), [std(0x202226), std(0x202226), std(0x202226), std(0x202226), basic(TX.signH(names[kind], lit ? '#f6f2e8' : '#3a3d42', lit ? '#1a1a1a' : '#9aa0a8'), lit ? 1.2 : 0.4), basic(TX.signH(names[kind], lit ? '#f6f2e8' : '#3a3d42', lit ? '#1a1a1a' : '#9aa0a8'), lit ? 1.2 : 0.4)], fx + out * 0.1, 3.4, cz);
      if (kind === 'closed') {
        const n = Math.max(1, Math.floor((w - 0.6) / 1.08)), start = z0 + 0.3 + (w - 0.6 - n * 1.08) / 2;
        for (let i = 0; i < n; i++) props[rnd() < 0.3 ? 'shutterG' : 'shutter'].push({ x: fx + out * 0.16, y: 0, z: start + (i + 0.5) * 1.08, ry: s > 0 ? -Math.PI / 2 : Math.PI / 2 });
        plane(w - 0.4, 2.8, std(0x16181c), fx, 1.45, cz, s > 0 ? -Math.PI / 2 : Math.PI / 2);
      } else if (kind === 'taiyaki') {
        // a hatch window with fish-shaped cakes on the iron, steam, a menu
        plane(w - 0.6, 2.6, glow(1.4, 1.05, 0.65), fx, 1.4, cz, s > 0 ? -Math.PI / 2 : Math.PI / 2);
        bx(fx + out * 0.05, fx + out * 0.55, 0, 1.0, z0 + 0.4, z1 - 0.4, std(0x6a4426, { roughness: 0.6 }));
        for (let i = 0; i < 8; i++) { const f = mesh(new THREE.SphereGeometry(0.07, 10, 6), std(0xc8862a, { roughness: 0.6, emissive: 0x3a2008 }), fx + out * 0.3, 1.04, z0 + 0.8 + i * ((w - 1.6) / 7)); f.scale.set(0.6, 0.35, 1.4); }
        W.steam(fx + out * 0.3, 1.6, cz);
        W.person(fx - out * 0.8, cz, s > 0 ? Math.PI / 2 : -Math.PI / 2, 0xf4f4f2, 0);
        collide(Math.min(fx, fx + out * 0.6), Math.max(fx, fx + out * 0.6), z0 + 0.4, z1 - 0.4);
        interactables.push({ pos: new THREE.Vector3(fx + out * 1.1, 0, cz), r: 1.4, label: 'Buy taiyaki ¥180', action: (api) => { api.sound.beep(); api.addItem('Red bean taiyaki'); return [{ who: 'Vendor', text: 'Fresh off the iron! Head first, or tail first?' }, { text: 'Crisp outside, hot anko inside. The steam is warm in the cold air.' }]; } });
        lampSpots.push(spot(fx + out * 0.8, 2.2, cz, { c: 0xffb060, k: 12, d: 8 }));
      } else if (kind === 'pachinko') {
        pachinkoAt.push({ s, z0, z1, cz, fx, w });
      } else {
        // lit but closing up: a bright interior behind glass, a half-drawn shutter
        const col = { hyakkin: [1.6, 1.6, 1.7], tea: [1.3, 1.2, 0.8], izakaya: [1.5, 0.9, 0.5], snack: [1.2, 0.6, 1.4] }[kind];
        plane(w - 0.6, 2.6, glow(...col), fx, 1.4, cz, s > 0 ? -Math.PI / 2 : Math.PI / 2);
        plane(w - 0.6, 1.0, std(0x8a8e94, { metalness: 0.6, roughness: 0.4 }), fx + out * 0.03, 2.3, cz, s > 0 ? -Math.PI / 2 : Math.PI / 2);
        glowPool(fx + out * 1.2, 0.012, cz, 2.4, w * 0.9, new THREE.Color(...col).getHex(), 0.25);
        if (kind === 'hyakkin') interactables.push({ pos: new THREE.Vector3(fx + out * 1.0, 0, cz), r: 1.4, label: 'Look at the 100円ショップ', lines: [{ text: 'The shutter is half down. Inside, a clerk counts colourful plastic baskets.' }] });
        if (kind === 'izakaya') W.lantern2?.(fx + out * 0.4, 2.6, cz);
      }
      z = z1 + 0.05;
    }
  }

  // ---------- PACHINKO MOON: bright, loud, open all night ----------
  for (const P of pachinkoAt) {
    const { s, z0, z1, cz, fx } = P, D = 9, xb = fx + s * D, inX = (k) => fx + s * k, H = 3.6;
    const xmin = Math.min(fx, xb), xmax = Math.max(fx, xb);
    collide(Math.min(xb, xb + s * 1), Math.max(xb, xb + s * 1), z0, z1); collide(xmin, xmax, z0, z0 + 0.15); collide(xmin, xmax, z1 - 0.15, z1);
    // LED facade, glass doors
    const led = TX.canvasTex(512, 128, (g, w, h) => { g.fillStyle = '#1a0000'; g.fillRect(0, 0, w, h); for (let i = 0; i < 60; i++) { g.fillStyle = ['#ff2a2a', '#ffe14a', '#2affff'][i % 3]; g.beginPath(); g.arc(8 + (i % 30) * 17, i < 30 ? 8 : h - 8, 4, 0, Math.PI * 2); g.fill(); } g.fillStyle = '#ffe14a'; g.shadowColor = '#ff2a2a'; g.shadowBlur = 16; g.font = `900 60px ${TX.JP_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('パチンコ MOON', w / 2, h / 2); });
    const ledM = basic(led, 1.8);
    plane(z1 - z0 - 0.4, 1.0, ledM, fx + s * -0.12, 3.6, cz, s > 0 ? -Math.PI / 2 : Math.PI / 2);
    updaters.push((t) => { const k = 1.4 + Math.sin(t * 6) * 0.4; ledM.color.setRGB(k, k, k); });
    const gl = new THREE.MeshStandardMaterial({ color: 0xffe0c0, transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.5, depthWrite: false });
    for (const [a, b] of [[z0 + 0.2, cz - 1.0], [cz + 1.0, z1 - 0.2]]) plane(b - a, 2.8, gl, fx, 1.4, (a + b) / 2, s > 0 ? -Math.PI / 2 : Math.PI / 2);
    collide(fx - 0.08, fx + 0.08, z0, cz - 1.0); collide(fx - 0.08, fx + 0.08, cz + 1.0, z1);
    doors.add({ kind: 'auto', x: fx, z: cz, y: 0, w: 2.0, h: 2.3, along: 'z' });
    // inside: red carpet, mirrored ceiling strip, rows of machines with stools and a few players
    bx(xmin, xmax, 0, 0.02, z0, z1, std(0x6a0a14, { roughness: 0.9, emissive: 0x200004 }));
    bx(xmin, xmax, H, H + 0.1, z0, z1, std(0x2a2a30, { metalness: 0.8, roughness: 0.2 }));
    for (const z of [z0, z1]) bx(xmin, xmax, 0, H, z - 0.05, z + 0.05, std(0x3a0a20, { emissive: 0x100004 }));
    bx(xb - s * 0.05, xb, 0, H, z0, z1, std(0x3a0a20, { emissive: 0x100004 }));
    for (let k = 1.5; k < D; k += 2.2) bx(Math.min(inX(k - 0.6), inX(k + 0.6)), Math.max(inX(k - 0.6), inX(k + 0.6)), H - 0.03, H - 0.01, z0 + 0.5, z1 - 0.5, glow(2.4, 2.2, 2));
    const face = TX.canvasTex(128, 256, (g, w, h) => {
      g.fillStyle = '#0a0a1a'; g.fillRect(0, 0, w, h);
      const gr = g.createRadialGradient(64, 90, 5, 64, 90, 60); gr.addColorStop(0, '#ffe14a'); gr.addColorStop(1, '#c0392b'); g.fillStyle = gr; g.beginPath(); g.arc(64, 90, 52, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#0a0a1a'; g.fillRect(34, 70, 60, 40); g.fillStyle = '#4fd0ff'; g.font = `900 30px ${TX.LATIN_FONT}`; g.textAlign = 'center'; g.fillText('777', 64, 100);
      for (let i = 0; i < 50; i++) { g.fillStyle = '#d8dce2'; g.beginPath(); g.arc(Math.random() * w, Math.random() * 160, 2.5, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#c0c4ca'; g.fillRect(14, 170, 100, 40); g.fillStyle = '#ff2a2a'; g.fillRect(14, 215, 100, 6);
    });
    const faceM = basic(face, 1.3), body = std(0xd8b04a, { metalness: 0.6, roughness: 0.3, emissive: 0x302008 });
    const rows = [3.2, 6.6];
    for (const k of rows) for (const fdir of [-1, 1]) {
      const x = inX(k) + fdir * 0.35 * s;
      for (let z = z0 + 0.9; z < z1 - 0.6; z += 0.75) {
        bx(x - 0.25, x + 0.25, 0, 1.75, z - 0.34, z + 0.34, body);
        plane(0.62, 1.2, faceM, x + fdir * s * 0.26, 1.2, z, fdir * s > 0 ? Math.PI / 2 : -Math.PI / 2);
        // a round stool in front of every machine
        batch(new THREE.CylinderGeometry(0.17, 0.15, 0.08, 14), std(0x8a1a2a, { roughness: 0.5 }), x + fdir * s * 0.75, 0.55, z);
        batch(new THREE.CylinderGeometry(0.03, 0.05, 0.52, 8), steel, x + fdir * s * 0.75, 0.26, z);
      }
      collide(Math.min(x - 0.3, x + 0.3), Math.max(x - 0.3, x + 0.3), z0 + 0.5, z1 - 0.5);
    }
    // a couple of players and a free stool to sit at
    W.person(inX(3.2) - s * 1.0, z0 + 1.65, s > 0 ? Math.PI / 2 : -Math.PI / 2, 0x3a3a3a, 0);
    W.person(inX(6.6) + s * 1.0, z1 - 1.4, s > 0 ? -Math.PI / 2 : Math.PI / 2, 0x6a2a2a, 0);
    const seatX = inX(3.2) - s * 0.95, seatZ = cz + 0.15;
    interactables.push({ pos: new THREE.Vector3(seatX - s * 0.5, 0, seatZ), r: 0.9, label: 'Play pachinko ¥1000', action: (api) => {
      api.player.sit({ x: seatX, z: seatZ, y: 0.55, yaw: Math.atan2(s, 0), out: { x: seatX - s * 0.6, z: seatZ, y: 0 } });
      api.start(pachinko());
      return null;
    } });
    for (let k = 0; k < 3; k++) lampSpots.push(spot(inX(1.5 + k * 3), H - 0.3, cz, { c: [0xffd060, 0xff60a0, 0x60d0ff][k], k: 16, d: 9 }));
    glowPool(fx - s * 1.5, 0.012, cz, 3, z1 - z0, 0xffc060, 0.35);
    addRoom({ name: 'Pachinko Moon', jp: 'パチンコ ムーン', minX: xmin + 0.05, maxX: xmax - 0.05, minZ: z0 + 0.15, maxZ: z1 - 0.15, y: 0, ceil: H, amb: 'pachinko', camDist: 2.4, floor: false,
      conn: [{ minX: Math.min(fx - s * 0.9, fx + s * 0.3), maxX: Math.max(fx - s * 0.9, fx + s * 0.3), minZ: cz - 0.85, maxZ: cz + 0.85 }] });
  }
  // a pachinko round: balls rattle down, sometimes the reels line up
  function pachinko() {
    let t = 0, balls = 250, reach = false, done = false;
    return {
      begin(api) { api.sound.beep(); },
      update(dt, e, api) {
        t += dt;
        if (t % 0.12 < dt) { api.sound.burst({ freq: 2800 + Math.random() * 1500, q: 8, dur: 0.03, gain: 0.05 }); balls -= 2; }
        if (!reach && t > 3 && Math.random() < dt * 0.6) { reach = true; api.sound.tone(880, 0, 0.3, 0.07, 'square'); }
        api.ui.showPrompt(reach ? `リーチ!! … ${Math.max(0, balls)} balls left  · E to stop` : `Balls rattling down… ${Math.max(0, balls)} left  · E to stop`);
        if (e || balls <= 0 || (reach && t > 7)) {
          const win = reach && Math.random() < 0.35;
          if (win) { api.sound.win(); api.addItem('Pachinko balls (1 box)'); }
          else api.sound.lose();
          api.say([{ who: 'MOON', text: win ? '7 – 7 – 7! Lights spin, the music bursts. A whole box of balls!' : reach ? 'Reach… 7 – 7 – 6. So close.' : 'Every ball drains into the bottom hole. As usual.' }]);
          api.player.stand();
          return false;
        }
        return true;
      },
    };
  }

  // ---------- TSUKINO STATION at the north end: canopy, gates, a ground-level platform, a train waiting ----------
  const SZ0 = Z1 + 1, SZ1 = Z1 + 13, track = Z1 + 16;
  bx(X - 14, X + 14, 0, 0.15, SZ0, track - 1.5, surf('large_grey_tiles', 10, 6, { wet: 0.5 }));
  bx(X - 14, X + 14, 4.0, 4.3, SZ0, SZ1, std(0xe8e6e0, { roughness: 0.6 }));
  for (const x of [X - 13, X - 6.5, X + 6.5, X + 13]) bx(x - 0.15, x + 0.15, 0, 4.0, SZ0 + 0.5, SZ0 + 0.8, steel);
  for (let x = X - 12; x <= X + 12; x += 3) bx(x - 1, x + 1, 3.96, 3.98, SZ0 + 3, SZ0 + 3.15, glow(2.2, 2.2, 2.3));
  const sn = TX.canvasTex(512, 128, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = '#2f9a4f'; g.fillRect(0, 96, w, 18); g.fillStyle = '#1a1a1a'; g.font = `900 60px ${TX.JP_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('つきの', w / 2, 46); g.font = `700 20px ${TX.LATIN_FONT}`; g.fillText('Tsukino', w / 2, 122 - 8); });
  plane(4.5, 1.1, basic(sn, 1.2), X, 4.9, SZ0 - 0.02, Math.PI);
  bx(X - 2.4, X + 2.4, 4.3, 5.5, SZ0 - 0.05, SZ0, std(0x1a1a1a));
  // gates across the concourse (always open at this hour), a ticket machine, the platform edge and a train
  for (let k = 0; k <= 4; k++) { const x = X - 4 + k * 2; bx(x - 0.15, x + 0.15, 0.15, 1.15, SZ0 + 6 - 0.9, SZ0 + 6 + 0.9, std(0xd8dce2, { metalness: 0.4, roughness: 0.35 })); bx(x - 0.1, x + 0.1, 1.15, 1.16, SZ0 + 6.2, SZ0 + 6.5, glow(0.4, 1.4, 2.6)); collide(x - 0.16, x + 0.16, SZ0 + 5.1, SZ0 + 6.9); }
  for (const s of [-1, 1]) collide(Math.min(X + s * 4.15, X + s * 14), Math.max(X + s * 4.15, X + s * 14), SZ0 + 5.1, SZ0 + 6.9);
  bx(X - 14, X + 14, 0.15, 0.17, track - 2.0, track - 1.6, std(0xf2c400));
  const train = buildTrain(scene, std, 4);
  train.position.set(X + 40, 0, track);
  // the station building beside the canopy, and tracks into the dark
  bx(X - 30, X - 14, 0, 7, SZ0, SZ1 + 1, std(0x7a7a74, { roughness: 0.9 }));
  bx(X + 14, X + 30, 0, 7, SZ0, SZ1 + 1, std(0x7a7a74, { roughness: 0.9 }));
  bx(X - 140, X + 140, 0, 0.12, track - 1.5, track + 1.5, std(0x3a3632, { roughness: 0.95 }));
  for (const d of [-0.53, 0.53]) bx(X - 140, X + 140, 0.12, 0.2, track + d - 0.035, track + d + 0.035, std(0x9a9ea4, { metalness: 0.9, roughness: 0.3 }));
  for (const s of [-1, 1]) collide(Math.min(X + s * 14, X + s * 30), Math.max(X + s * 14, X + s * 30), SZ0, SZ1 + 1);
  lampSpots.push(spot(X, 3.6, SZ0 + 3, { c: 0xeef4ff, k: 20, d: 14 }), spot(X, 3.6, SZ1 - 1, { c: 0xeef4ff, k: 16, d: 12 }));
  const arrive = { x: X + 2, y: 0.15, z: track - 2.6, yaw: Math.PI };
  interactables.push({ pos: new THREE.Vector3(X - 2, 0, track - 2.2), r: 2.4, label: 'Board the train to Hoshimi', action: (api) => { api.sound.door('auto', 1); W.pockets.train.ride(api, W.trainHome(), 'Hoshimi'); return null; } });
  interactables.push({ pos: new THREE.Vector3(X, 0, SZ0 + 1.5), r: 2, label: 'Look at the station', lines: [{ who: 'Tsukino Station', text: 'A small station, unstaffed at night. The ticket gates stand wide open; the lights hum.' }] });
  addRoom({ name: 'Tsukino Station', jp: '月野駅', minX: X - 14, maxX: X + 14, minZ: SZ0, maxZ: track - 1.5, y: 0.15, ceil: 3.9, amb: 'station', camDist: 3.2 });

  // the far (south) end: the arcade opens onto a dark wet street with a lone vending machine
  for (const s of [-1, 1]) bx(X + s * A, X + s * (A + 14), 0, 9, Z0 - 14, Z0, std(0x4a4e55, { roughness: 0.9 }));
  bx(X - A - 14, X + A + 14, 0, 9, Z0 - 26, Z0 - 14, std(0x3a3e45, { roughness: 0.9 }));
  for (let x = -3; x <= 3; x += 1.5) { batch(new THREE.CylinderGeometry(0.08, 0.08, 0.8, 10), std(0xf2c400), X + x, 0.4, Z0 - 1.2); collide(X + x - 0.12, X + x + 0.12, Z0 - 1.32, Z0 - 1.08); }
  lampSpots.push(spot(X + 3, 4.5, Z0 - 5, { c: 0xffc98a, k: 18, d: 14, street: true }));

  // where you can walk
  WALK.push({ minX: X - A + 0.25, maxX: X + A - 0.25, minZ: Z0 - 1.0, maxZ: Z1 + 1.2, maxY: 3 });
  WALK.push({ minX: X - 13.6, maxX: X + 13.6, minZ: SZ0, maxZ: track - 1.75, maxY: 3 });
  addRoom({ name: 'Tsukino Ginza', jp: '月野銀座', minX: X - A, maxX: X + A, minZ: Z0, maxZ: Z1 + 1, y: 0, ceil: RH + 1.5, amb: 'shotengai', camDist: 4, floor: false });

  // ---------------------------------------------------------------------------------------------
  // the lived-in details: projecting signs, a ramen yatai, bicycles, vending machines, a flower stand,
  // people out late, a ticket machine and benches at the station
  // ---------------------------------------------------------------------------------------------
  const sCol = ['#ffcf4f', '#ff8a3a', '#9df0ff', '#ff6fd8', '#f4f4f0'];
  shopList.forEach((sh, i) => {
    if (i % 2 && !sh.lit) return;
    const face = basic(TX.signV(sh.name.replace(/\s/g, '').slice(0, 5), sh.lit ? '#16100c' : '#2a2c30', sh.lit ? sCol[i % sCol.length] : '#8a9096'), sh.lit ? 1.5 : 0.5);
    const x = X + sh.s * (A - 0.45);
    mesh(new THREE.BoxGeometry(0.5, 1.5, 0.14), [std(0x202226), std(0x202226), std(0x202226), std(0x202226), face, face], x, 4.4, sh.cz + 0.6);
    bx(x - 0.25, x + 0.25, 5.15, 5.2, sh.cz + 0.55, sh.cz + 0.65, steel);
  });
  // ramen yatai: a wooden cart with a red curtain, lanterns, stools and a cook
  {
    const yx = X + 1.6, yz = -18, wood = std(0x6a4426, { roughness: 0.6 }), red = std(0xb3201a, { roughness: 0.8 });
    bx(yx - 0.6, yx + 0.6, 0.2, 1.0, yz - 1.1, yz + 1.1, wood);
    bx(yx - 0.75, yx + 0.75, 1.0, 1.05, yz - 1.2, yz + 1.2, std(0x8a5a32, { roughness: 0.4 }));
    for (const dz of [-1.0, 1.0]) for (const dx of [-0.55, 0.55]) bx(yx + dx - 0.04, yx + dx + 0.04, 1.05, 2.25, yz + dz - 0.04, yz + dz + 0.04, wood);
    bx(yx - 0.85, yx + 0.85, 2.25, 2.35, yz - 1.3, yz + 1.3, wood);
    const nr = basic(TX.canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#b3201a'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(0,0,0,0.3)'; for (let i = 1; i < 4; i++) g.fillRect(i * 64, 18, 3, h); g.fillStyle = '#fff4d0'; g.font = `900 34px ${TX.JP_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('中華そば', w / 2, 32); }), 0.95);
    plane(2.4, 0.45, nr, yx - 0.86, 2.0, yz, -Math.PI / 2);
    for (const wz of [-0.25, 0.25]) bx(yx - 0.6, yx + 0.6, 0.12, 0.22, yz + wz * 3.6 - 0.15, yz + wz * 3.6 + 0.15, std(0x222222));
    const pot = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.35, 18), std(0xc8ccd2, { metalness: 0.9, roughness: 0.25 }), yx + 0.25, 1.22, yz + 0.5);
    W.steam(yx + 0.25, 1.45, yz + 0.5);
    for (const dz of [-0.9, 0.9]) {
      const g = new THREE.Group(); g.position.set(yx - 0.95, 2.1, yz + dz); scene.add(g);
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 10), new THREE.MeshBasicMaterial({ map: TX.lantern('ラーメン'), color: new THREE.Color(1.6, 1.6, 1.6) })); l.scale.set(1, 1.4, 1); l.position.y = -0.3; g.add(l);
    }
    for (const dz of [-0.7, 0, 0.7]) { batch(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 14), red, yx - 1.25, 0.6, yz + dz); batch(new THREE.CylinderGeometry(0.03, 0.04, 0.58, 8), steel, yx - 1.25, 0.3, yz + dz); }
    W.person(yx + 0.95, yz - 0.2, -Math.PI / 2, 0xf4f4f2, 0);
    W.person(yx - 1.55, yz + 0.7, Math.PI / 2, 0x2a3a5a, 0);
    collide(yx - 0.9, yx + 0.9, yz - 1.3, yz + 1.3);
    lampSpots.push(spot(yx - 0.8, 2.0, yz, { c: 0xffa060, k: 14, d: 8 }));
    glowPool(yx - 1.3, 0.035, yz, 3, 3.4, 0xff9a50, 0.16);
    interactables.push({ pos: new THREE.Vector3(yx - 1.6, 0, yz - 0.7), r: 1.2, label: 'Eat at the yatai ¥700', action: (api) => {
      api.sound.beep(); api.addItem('Yatai chūka soba');
      return [{ who: 'Yatai owner', text: 'Here you go, chūka soba! The broth is my grandfather\'s recipe.' }, { text: 'The steam is warm. Beyond the arcade, rain drums on the plastic roof.' }];
    } });
  }
  // bicycles parked along a shutter, a pair of vending machines, a flower stand, a few people still about
  for (let k = 0; k < 6; k++) { const b = W.bike(X - A + 0.55, -40 + k * 0.62, [0x2b6cb0, 0xd9d9d9, 0x3a8a4a, 0x8a2a2a, 0x222222, 0xe8c000][k]); b.position.y = 0; b.rotation.y = Math.PI / 2; }
  collide(X - A, X - A + 1.2, -40.4, -36.4);
  for (const [vz, col] of [[22, '#c8102e'], [23.05, '#1b5fbf']]) {
    const vx = X + A - 0.5;
    mesh(new RoundedBoxGeometry(0.78, 1.83, 1.02, 3, 0.05), std(col, { roughness: 0.35, metalness: 0.35 }), vx, 0.92, vz);
    plane(0.92, 1.72, basic(TX.vendingFront(col), 0.95), vx - 0.395, 0.93, vz, -Math.PI / 2);
    collide(vx - 0.42, vx + 0.42, vz - 0.53, vz + 0.53);
  }
  lampSpots.push(spot(X + A - 1.2, 1.2, 22.5, { c: 0xdfeeff, k: 6, d: 5 }));
  glowPool(X + A - 1.4, 0.035, 22.5, 1.8, 2.2, 0xdfeeff, 0.35);
  interactables.push({ pos: new THREE.Vector3(X + A - 1.4, 0, 22.5), r: 1.2, label: 'Buy a drink', faceYaw: Math.PI / 2, action: (api) => { api.sound.clunk(); api.addItem('Hot canned coffee'); return [{ text: 'Clunk. Hot canned coffee, ¥130. Your hands warm up at once.' }]; } });
  {
    const fx0 = X + A - 0.7, fz = 34, bucket = std(0x3a5a8a, { roughness: 0.5 });
    bx(fx0 - 0.4, fx0 + 0.4, 0, 0.6, fz - 1.2, fz + 1.2, std(0x6a4426));
    for (let k = 0; k < 8; k++) {
      const z = fz - 1.0 + k * 0.28, hue = (k * 0.13) % 1;
      batch(new THREE.CylinderGeometry(0.11, 0.09, 0.28, 12), bucket, fx0 - 0.15 + (k % 2) * 0.3, 0.74, z);
      for (let f = 0; f < 5; f++) batch(new THREE.SphereGeometry(0.05, 8, 6), std(new THREE.Color().setHSL(hue, 0.7, 0.6).getHex(), { roughness: 0.8, emissive: new THREE.Color().setHSL(hue, 0.7, 0.2).getHex() }), fx0 - 0.15 + (k % 2) * 0.3 + (f - 2) * 0.03, 0.95 + (f % 2) * 0.06, z + (f % 3 - 1) * 0.03);
    }
    collide(fx0 - 0.45, fx0 + 0.45, fz - 1.25, fz + 1.25);
  }
  for (const [px, pz, ry, c] of [[X - 1.2, 5, 0.4, 0x2a2d35], [X + 2.0, -32, Math.PI, 0x6a2a4a], [X - 2.6, 40, -0.6, 0x3b4a6b], [X + 0.4, 48, Math.PI - 0.3, 0x5a5a4a]]) W.person(px, pz, ry, c, 0);
  // the station: a ticket machine, a timetable, benches and a vending machine on the platform
  bx(X - 6.4, X - 5.6, 0.15, 1.75, SZ0 + 4.4, SZ0 + 5.0, std(0xd8dce2, { roughness: 0.35, metalness: 0.4 }));
  plane(0.7, 1.2, basic(TX.vendingFront('#1d4fb8'), 1.0), X - 6.0, 1.05, SZ0 + 4.38, Math.PI);
  collide(X - 6.45, X - 5.55, SZ0 + 4.35, SZ0 + 5.05);
  const tt = TX.canvasTex(256, 192, (g, w, h) => { g.fillStyle = '#f6f6f2'; g.fillRect(0, 0, w, h); g.fillStyle = '#2f9a4f'; g.fillRect(0, 0, w, 30); g.fillStyle = '#fff'; g.font = `900 18px ${TX.JP_FONT}`; g.fillText('時刻表  星見方面', 10, 21); g.fillStyle = '#222'; g.font = `700 16px ${TX.LATIN_FONT}`; for (let i = 0; i < 6; i++) g.fillText(`${['22', '23', '23', '23', '0', '0'][i]} : ${['48', '06', '24', '45', '04', '12'][i]}`, 20 + (i % 2) * 120, 60 + Math.floor(i / 2) * 40); });
  plane(1.1, 0.8, basic(tt, 1.05), X + 3, 2.0, SZ0 + 4.39, Math.PI);
  for (const bxp of [X - 8, X + 8]) { bx(bxp - 0.9, bxp + 0.9, 0.55, 0.6, track - 3.4, track - 3.0, std(0x2a7de1, { roughness: 0.4 })); bx(bxp - 0.9, bxp + 0.9, 0.6, 1.0, track - 3.45, track - 3.38, std(0x2a7de1, { roughness: 0.4 })); collide(bxp - 0.9, bxp + 0.9, track - 3.45, track - 3.0); }
  W.person(X + 7.5, track - 2.4, Math.PI, 0x40322a, 0.15);

  return { arrive };
}
