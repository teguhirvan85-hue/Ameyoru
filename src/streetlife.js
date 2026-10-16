// Street life: the small things people leave on a Japanese pavement. Pots and plants by the shop doors and the
// apartment lobbies, A-frame menu boards, beer crates by the izakaya, rubbish bags out for collection under a blue
// crow net, green transformer cabinets, a blue can bin beside every vending machine, metal bins on the wide
// pavements, and a few kerbside roadworks fenced off with cones, bars and blinking lamps.
// Everything stands against a wall (or on the kerb edge) and is checked before it goes down: on a pavement you can
// walk, clear of every collider, door and thing you can use, with a walking lane left free in front of it.
// Models are Poly Haven (CC0) and Sketchfab (CC BY) parts placed as instanced meshes (assets.js).
import * as THREE from 'three';
import * as TX from './textures.js';
import { NORTH } from './north.js';
import { CAFE_NAME } from './desy.js';

export function buildStreetLife(W) {
  const { scene, assets, colliders, WALK, interactables, doors, fronts, vends, collide, batch, box, std, updaters } = W;
  if (!assets?.part) return null;
  const rr = TX.mulberry32(8080);
  const T = {};
  const put = (k, t) => (T[k] ??= []).push(t);
  const taken = [];   // { x, z, r } of everything placed here

  // ---------- where something may stand ----------
  const walk = WALK.filter((r) => (r.minY ?? -1) < 0.5 && (r.maxY ?? 9) > 0.1);
  const solid = colliders.filter((c) => !(c.minY !== undefined && c.minY > 1.2));
  const G = 8, grid = new Map();
  for (const c of solid) {
    if (c.maxX - c.minX > 60 || c.maxZ - c.minZ > 60) { (grid.big ??= []).push(c); continue; }
    for (let gx = Math.floor(c.minX / G); gx <= Math.floor(c.maxX / G); gx++)
      for (let gz = Math.floor(c.minZ / G); gz <= Math.floor(c.maxZ / G); gz++) { const k = gx * 7919 + gz; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(c); }
  }
  const inWalk = (x, z) => walk.some((r) => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ);
  const hits = (x, z, r) => {
    for (const c of [...(grid.get(Math.floor(x / G) * 7919 + Math.floor(z / G)) ?? []), ...(grid.big ?? [])])
      if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) return true;
    return false;
  };
  const uses = interactables.filter((it) => it.pos.y < 1).map((it) => [it.pos.x, it.pos.z, it.r ?? 1]);
  const doorAt = (doors?.list ?? []).map((d) => [d.x, d.z, (d.w ?? 1) / 2 + 0.6]);
  const near = (x, z, r, skipUses = false) => (!skipUses && uses.some(([a, b, q]) => Math.hypot(x - a, z - b) < r + Math.max(1.1, q))) || doorAt.some(([a, b, q]) => Math.hypot(x - a, z - b) < r + q)
    || taken.some((p) => Math.hypot(x - p.x, z - p.z) < r + p.r + 0.1);
  // nx, nz: out from the wall; lane: how much walking room must stay free in front of it
  const free = (x, z, r, nx, nz, lane = 1.0, skipUses = false) => {
    if (!inWalk(x, z) || hits(x, z, r) || near(x, z, r, skipUses)) return false;
    const fx = x + nx * (r + lane), fz = z + nz * (r + lane);
    return inWalk(fx, fz) && !hits(fx, fz, 0.28);
  };
  const take = (x, z, r, solidToo = true) => { taken.push({ x, z, r }); if (solidToo) collide(x - r, x + r, z - r, z + r); };

  // ---------- the parts ----------
  const size = (file, nodes) => assets.part(file, nodes)?.size;
  const fit = (file, nodes, h) => { const s = size(file, nodes); return s ? h / s.y : 1; };
  const P = {
    plant: ['potted_plant_02', ['potted_plant_02_pot', 'potted_plant_02_leaves', 'potted_plant_02_dirt']],
    succ: ['potted_plant_04', ['potted_plant_04_dirt', 'potted_plant_04_plant', 'potted_plant_04_pot']],
    clay: ['planter_pot_clay', ['planter_pot_clay']],
    bag: ['trashbag', ['trashbag']],
    cab: ['utility_box_02', ['utility_box_02']],
    crateA: ['plastic_crate_02', ['plastic_crate_02']],
    crateB: ['plastic_crate_01', ['plastic_crate_01']],
    cone: ['cones', ['Object_3']],
    post: ['cones', ['Object_10']],
    barricade: ['cones', ['Object_19']],
    canBin: ['jp_street', ['pCube4_VendingMachineBin_0']],
    bin: ['jp_street', ['street_bin_inside_lambert10_0', 'street_bin_outside_lambert11_0']],
    sign: ['jp_street', ['square2_WorkOnTheRoad_0']],
  };
  // rubbish bags in Japan are the half-clear white ones (the model's black bag, re-dressed)
  { const p = assets.part(...P.bag); if (p) for (const q of p.pieces) { const m = q.material.clone(); m.map = null; m.color = new THREE.Color(0xdfe6ea); m.roughness = 0.32; m.transparent = true; m.opacity = 0.9; q.material = m; } }

  const ryOut = (alongZ, face) => (alongZ ? (face > 0 ? Math.PI / 2 : -Math.PI / 2) : (face > 0 ? 0 : Math.PI));

  // ---------- an A-frame menu board (chalk on black, in a wooden frame) ----------
  // what the board says follows the shop behind it (shops.js types); the small shops on the back streets get a mix
  const MENUS = {
    izakaya: ['IZAKAYA', 'Highball ¥290', 'Yakitori 5pc ¥680', 'Happy hour till 19:00'],
    ramen: ['RAMEN', 'Shoyu ramen ¥780', 'Gyoza 6pc ¥390', 'Large bowl +¥100'],
    kissa: ['COFFEE', 'Blend coffee ¥450', 'Napolitan ¥850', 'Custard pudding ¥380'],
    snack: ['SNACK BAR', 'Set ¥3,000', 'Karaoke free', 'Open 20:00 – 2:00'],
    karaoke: ['KARAOKE', '30 min ¥250', 'Free drinks +¥800', 'Rooms available'],
    barber: ['BARBER', 'Cut ¥1,800', 'Shave ¥1,000', 'No booking needed'],
    laundry: ['LAUNDRY', 'Wash ¥400', 'Dry 10 min ¥100', 'Open 24 hours'],
    estate: ['FOR RENT', '1K 22m² ¥68,000', '1LDK ¥98,000', '3 min to station'],
    gacha: ['GACHA', 'New capsules in!', '¥300 / ¥500', 'Open till midnight'],
    florist: [CAFE_NAME, 'Pink roses ¥300', 'Rose latte ¥520', 'Flowers & café'],
    lunch: ['LUNCH', 'Karaage set ¥880', 'Curry rice ¥750', 'Coffee +¥100'],
    today: ['TODAY', 'Shoyu ramen ¥780', 'Gyoza 6pc ¥390', 'Draft beer ¥500'],
    bakery: ['OPEN', 'Fresh bread', 'Melon pan ¥160', 'Coffee ¥200'],
    cafe: ['WELCOME', 'Hand-drip coffee', 'Cheesecake ¥480', 'Free Wi-Fi'],
  };
  const MIX = ['lunch', 'today', 'bakery', 'cafe', 'izakaya', 'kissa'];
  const boardMat = new Map();
  const menuMat = (key) => {
    if (!boardMat.has(key)) {
      const [h, a, b, c] = MENUS[key];
      boardMat.set(key, new THREE.MeshStandardMaterial({ roughness: 0.85, map: TX.canvasTex(256, 384, (g, w, hh) => {
        g.fillStyle = '#1d2220'; g.fillRect(0, 0, w, hh);
        g.globalAlpha = 0.08; for (let i = 0; i < 260; i++) { g.fillStyle = '#fff'; g.fillRect(Math.random() * w, Math.random() * hh, 2 + Math.random() * 10, 1); } g.globalAlpha = 1;
        g.fillStyle = '#f5f1e6'; g.textAlign = 'center';
        let s = 46; g.font = `700 ${s}px Georgia, serif`; while (g.measureText(h).width > w - 30 && s > 20) { s -= 2; g.font = `700 ${s}px Georgia, serif`; }
        g.fillText(h, w / 2, 70);
        g.strokeStyle = '#e8b04a'; g.lineWidth = 3; g.beginPath(); g.moveTo(40, 92); g.lineTo(w - 40, 92); g.stroke();
        [a, b, c].forEach((t, i) => {
          let q = 25; g.font = `600 ${q}px Georgia, serif`; while (g.measureText(t).width > w - 24 && q > 14) { q -= 1; g.font = `600 ${q}px Georgia, serif`; }
          g.fillStyle = i === 1 ? '#ffd27a' : '#f5f1e6'; g.fillText(t, w / 2, 160 + i * 66);
        });
        g.fillStyle = '#9fd8b8'; g.beginPath(); g.arc(w / 2, 352, 9, 0, Math.PI * 2); g.fill();
      }) }));
    }
    return boardMat.get(key);
  };
  const wood = std(0x6b4a2e, { roughness: 0.7 });
  let boards = 0;
  const boardAt = (scene.userData.boards = []);   // where they went (for checking from the console)
  function aframe(x, z, ry, key = MIX[Math.floor(rr() * MIX.length)]) {
    boards++; boardAt.push([+x.toFixed(1), +z.toFixed(1), key]);
    const g = new THREE.Group(); g.position.set(x, 0.15, z); g.rotation.y = ry; scene.add(g);
    const mat = menuMat(MENUS[key] ? key : 'today');
    // two leaves hinged at the top: feet 0.34 m apart, tops meeting over the middle
    for (const s of [1, -1]) {
      const leaf = new THREE.Group(); leaf.position.set(0, 0, s * 0.17); leaf.rotation.x = -s * 0.2; g.add(leaf);
      const fr = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.84, 0.035), wood); fr.position.y = 0.42; leaf.add(fr);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.72), mat); face.position.set(0, 0.44, s * 0.019); if (s < 0) face.rotation.y = Math.PI; leaf.add(face);
    }
    { const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6).rotateZ(Math.PI / 2), std(0x2a2a2a, { metalness: 0.7, roughness: 0.4 })); hinge.position.y = 0.83; g.add(hinge); }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.userData.static = true;
  }

  // ---------- the blue crow net thrown over a pile of rubbish bags ----------
  // one texture tile = one 12 cm square of the net
  const netMat = new THREE.MeshStandardMaterial({ map: TX.canvasTex(64, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = "rgba(30,95,200,1)"; g.lineWidth = 7; g.strokeRect(0, 0, w, h); }, { repeat: true }),
    transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.6 });
  // the net is draped over the bags: its height at each point is the tallest bag under it, falling to the ground
  // round the edge of the pile (weighted down there)
  function net(bags) {
    const xs = bags.map((b) => b.x), zs = bags.map((b) => b.z);
    const x0 = Math.min(...xs) - 0.55, x1 = Math.max(...xs) + 0.55, z0 = Math.min(...zs) - 0.55, z1 = Math.max(...zs) + 0.55;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, 18, 18).rotateX(-Math.PI / 2), p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i) + cx, vz = p.getZ(i) + cz;
      let y = 0.02;
      for (const b of bags) { const d = Math.hypot(vx - b.x, vz - b.z) / b.r; if (d < 1.6) y = Math.max(y, b.h * Math.max(0, 1 - d * d / 2.56) ** 0.7 + 0.02); }
      p.setY(i, y); uv.setXY(i, vx / 0.12, vz / 0.12);
    }
    g.computeVertexNormals();
    batch(g, netMat, cx, 0.15, cz);
  }

  // a board on the first of these spots along the front that's free, turned a little towards the street
  function board(f, at, ry, ts, key) {
    for (const t of ts.sort(() => rr() - 0.5)) {
      if (t < f.a0 + 0.4 || t > f.a1 - 0.4) continue;
      const p = at(0.5, t, 0.32, 0.9);
      if (p) { aframe(p[0], p[1], ry + Math.PI / 2 + (rr() - 0.5) * 0.35, key); take(p[0], p[1], 0.3); return true; }
    }
    return false;
  }

  // ---------- along the ground floors ----------
  for (const f of fronts) {
    const { alongZ, fixed, face, a0, a1, kind } = f;
    const Q = (o, t) => (alongZ ? [fixed + face * o, t] : [t, fixed + face * o]);
    const nx = alongZ ? face : 0, nz = alongZ ? 0 : face, ry = ryOut(alongZ, face);
    const at = (o, t, r, lane) => { const [x, z] = Q(o, t); return free(x, z, r, nx, nz, lane) ? [x, z] : null; };
    const pick = rr();
    if (kind === 'shop') {
      // pots either side of the shop window, sometimes a menu board out front, crates at the end
      for (const s of [-1, 1]) {
        const t = f.t + s * (f.sw / 2 + 0.45);
        if (rr() < 0.6) { const p = at(0.42, t, 0.36); if (p) { put('plant', { x: p[0], y: 0.15, z: p[1], ry: rr() * 6.28, s: fit(...P.plant, 0.75 + rr() * 0.3) }); take(p[0], p[1], 0.3); } }
        else { const p = at(0.3, t, 0.2); if (p) { put('succ', { x: p[0], y: 0.15, z: p[1], ry: rr() * 6.28, s: fit(...P.succ, 0.32) }); take(p[0], p[1], 0.14); const q = at(0.3, t + s * 0.36, 0.17); if (q) { put('clay', { x: q[0], y: 0.15, z: q[1], ry: rr() * 6.28, s: fit(...P.clay, 0.26) }); take(q[0], q[1], 0.16); } } }
      }
      if (pick < 0.8) board(f, at, ry, [f.t - f.sw / 2 - 1.05, f.t + f.sw / 2 + 1.05, f.t - f.sw / 2 - 1.6, f.t + f.sw / 2 + 1.6]);
      if (rr() < 0.3) {
        const t = rr() < 0.5 ? a0 + 0.5 : a1 - 0.5, p = at(0.32, t, 0.3);
        if (p) { const k = rr() < 0.5 ? 'crateA' : 'crateB', n = 1 + Math.floor(rr() * 3), hh = size(...P[k])?.y ?? 0.25; for (let i = 0; i < n; i++) put(k, { x: p[0] + (rr() - 0.5) * 0.04, y: 0.15 + i * hh * 0.97, z: p[1] + (rr() - 0.5) * 0.04, ry: ry + (i % 2) * Math.PI + (rr() - 0.5) * 0.1 }); take(p[0], p[1], 0.3); }
      }
    } else if (kind === 'shutter') {
      if (pick < 0.32) {
        // rubbish out for the morning collection, under a blue net
        const t = rr() < 0.5 ? a0 + 1.0 : a1 - 1.0, p = at(0.62, t, 0.55, 0.8);
        if (p) {
          const n = 3 + Math.floor(rr() * 3), bags = [];
          for (let i = 0; i < n; i++) {
            const u = (i - (n - 1) / 2) * 0.38, o = 0.3 + (i % 2) * 0.34, [x, z] = Q(o, t + u), h = 0.46 + rr() * 0.14;
            put('bag', { x, y: 0.15, z, ry: rr() * 6.28, s: fit(...P.bag, h) }); bags.push({ x, z, h: h + 0.03, r: 0.3 });
          }
          net(bags);
          take(p[0], p[1], 0.55);
        }
      } else if (pick < 0.55) {
        // somebody's pot garden along the wall
        let t = a0 + 0.8 + rr() * Math.max(0, a1 - a0 - 4);
        for (let i = 0; i < 3 + Math.floor(rr() * 3); i++, t += 0.4 + rr() * 0.2) {
          if (t > a1 - 0.4) break;
          const k = rr(), key = k < 0.3 ? 'plant' : k < 0.7 ? 'succ' : 'clay', r = key === 'plant' ? 0.3 : 0.16, p = at(r + 0.06, t, r);
          if (!p) continue;
          put(key, { x: p[0], y: 0.15, z: p[1], ry: rr() * 6.28, s: fit(...P[key], key === 'plant' ? 0.6 + rr() * 0.3 : key === 'succ' ? 0.3 : 0.24) });
          take(p[0], p[1], r * 0.9);
        }
      } else if (pick < 0.68) {
        // a green transformer cabinet against the wall
        const t = a0 + 1 + rr() * Math.max(0, a1 - a0 - 2), cs = size(...P.cab), p = at(0.33, t, 0.28, 1.0);
        if (p && cs && at(0.33, t - 0.26, 0.28, 1.0) && at(0.33, t + 0.26, 0.28, 1.0)) { put('cab', { x: p[0], y: 0.15, z: p[1], ry, s: 1.25 / cs.y }); take(p[0], p[1], 0.5); }
      }
    } else if (kind === 'main') {
      // the main street's open shops: a board out front for the ones that sell to passers-by
      if (MENUS[f.type] && f.type !== 'estate' && rr() < 0.8) board(f, at, ry, [a0 + 0.8, a1 - 0.8, a0 + 1.4, a1 - 1.4], f.type);
      else if (f.type === 'estate' && rr() < 0.6) board(f, at, ry, [a0 + 0.8, a1 - 0.8], 'estate');
    } else if (kind === 'lobby') {
      for (const s of [-1, 1]) {
        if (rr() < 0.55) { const p = at(0.4, f.t + s * 1.3, 0.34); if (p) { put('plant', { x: p[0], y: 0.15, z: p[1], ry: rr() * 6.28, s: fit(...P.plant, 0.85 + rr() * 0.25) }); take(p[0], p[1], 0.3); } }
      }
    }
  }

  // ---------- a blue can bin beside every vending machine ----------
  for (const v of vends) {
    for (const dz of [0.92, -0.92, 1.95, -1.95]) {
      const x = v.x + v.face * 0.12, z = v.z + dz;
      if (!free(x, z, 0.26, v.face, 0, 0.9, true)) continue;
      put('canBin', { x, y: 0.15, z, ry: v.face > 0 ? Math.PI / 2 : -Math.PI / 2, s: fit(...P.canBin, 0.78) });
      take(x, z, 0.26); break;
    }
  }

  // ---------- metal bins on the wide pavements (the boulevard), every so often by the kerb ----------
  {
    const B = NORTH.blvd;
    for (const [z, dir, back] of [[B.roadS - 0.55, -1, B.s - 1.5], [B.roadN + 0.55, 1, B.n + 1.5]]) {
      for (let x = B.x0 + 12; x < B.x1 - 10; x += 26 + rr() * 14) {
        // a real pavement here (a building behind it), not a side street's mouth
        if (!hits(x, back, 1.3) || !free(x, z, 0.3, 0, dir, 0.9)) continue;
        put('bin', { x, y: 0.15, z, ry: rr() * 6.28, s: fit(...P.bin, 0.86) }); take(x, z, 0.3);
      }
    }
  }

  // ---------- kerbside roadworks: cones joined by bars, a barricade at each end, a sign, blinking lamps ----------
  const amberOn = new THREE.Color(3.2, 1.7, 0.2), amberOff = new THREE.Color(0.3, 0.14, 0.02);
  const lampMats = [0, 1, 2].map(() => { const m = new THREE.MeshBasicMaterial({ color: amberOff.clone() }); m.userData.mutable = true; return m; });
  const barMat = new THREE.MeshStandardMaterial({ roughness: 0.5, map: TX.canvasTex(128, 16, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#1a1a1a' : '#f2c400'; g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16 + 16, 0); g.lineTo(i * 16 + 8, h); g.lineTo(i * 16 - 8, h); g.fill(); } }, { repeat: true }) });
  const coneH = 0.7, coneS = fit(...P.cone, coneH);
  function works(x0, x1, zk, dir) {
    // zk: the kerb's z; dir: −1 when the pavement lies to −z of it. The site takes the outer 1.1 m of pavement.
    const zIn = zk + dir * 1.1, zOut = zk + dir * 0.18, cx = (x0 + x1) / 2, cz = (zIn + zOut) / 2;
    const back = dir < 0 ? NORTH.blvd.s - 0.5 : NORTH.blvd.n + 0.5;
    for (let x = x0 - 0.6; x <= x1 + 0.61; x += 0.4) if (!inWalk(x, zIn) || !hits(x, back, 0.05) || hits(x, cz, 0.5) || near(x, cz, 0.4)) return false;
    if (!inWalk(cx, zIn + dir * 1.2) || hits(cx, zIn + dir * 1.2, 0.3)) return false;
    const pts = [];
    const n = Math.max(2, Math.round((x1 - x0) / 1.6));
    for (let i = 0; i <= n; i++) pts.push([x0 + (i * (x1 - x0)) / n, zIn]);
    pts.unshift([x0, zOut]); pts.push([x1, zOut]);
    pts.forEach(([x, z], i) => {
      put('cone', { x, y: 0.15, z, ry: rr() * 6.28, s: coneS });
      // a flashing lamp on every other cone, the three groups chasing along the line
      if (i % 2 === 0) { batch(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 10), lampMats[(i / 2) % 3], x, 0.15 + coneH + 0.05, z); batch(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 6), std(0x222222), x, 0.15 + coneH - 0.02, z); }
    });
    // the bars between neighbouring cones
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az);
      batch(new THREE.BoxGeometry(len, 0.06, 0.03), barMat, (ax + bx) / 2, 0.15 + coneH - 0.12, (az + bz) / 2, -Math.atan2(bz - az, bx - ax));
    }
    // barricades across both ends, the sign facing the walkers, a delineator post at the corners
    const bs = fit(...P.barricade, 1.0);
    put('barricade', { x: x0 - 0.35, y: 0.15, z: cz, ry: Math.PI / 2, s: bs }); put('barricade', { x: x1 + 0.35, y: 0.15, z: cz, ry: Math.PI / 2, s: bs });
    const ss = size(...P.sign);
    if (ss) {
      const k = 0.72 / Math.max(ss.x, ss.y, ss.z);
      // its face turned to the people walking past (the pavement side), the post behind it
      put('sign', { x: cx, y: 0.15 + 0.62, z: zIn + dir * 0.05, ry: dir > 0 ? 0 : Math.PI, s: k });
      batch(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 8), std(0x9aa0a6, { metalness: 0.6, roughness: 0.4 }), cx, 0.65, zIn - dir * 0.02);
      batch(new THREE.BoxGeometry(0.5, 0.04, 0.5), std(0x333333), cx, 0.17, zIn - dir * 0.02);
    }
    put('post', { x: x0 - 0.1, y: 0.15, z: zOut, ry: 0, s: fit(...P.post, 0.8) }); put('post', { x: x1 + 0.1, y: 0.15, z: zOut, ry: 0, s: fit(...P.post, 0.8) });
    // inside: a lifted manhole frame, a hand rammer's worth of gravel, a steel plate
    batch(new THREE.BoxGeometry(x1 - x0 - 0.6, 0.03, 0.7), std(0x3c3f44, { metalness: 0.7, roughness: 0.5 }), cx - 0.3, 0.165, cz);
    batch(new THREE.ConeGeometry(0.42, 0.22, 10), std(0x6f6a62, { roughness: 1 }), x1 - 0.7, 0.26, cz);
    collide(x0 - 0.5, x1 + 0.5, Math.min(zIn, zOut) - 0.15, Math.max(zIn, zOut) + 0.15);
    taken.push({ x: cx, z: cz, r: (x1 - x0) / 2 + 0.6 });
    return true;
  }
  {
    const B = NORTH.blvd; let made = 0;
    for (const [x, zk, dir] of [[-58, B.roadS, -1], [36, B.roadN, 1], [-104, B.roadN, 1], [70, B.roadS, -1], [-20, B.roadS, -1], [128, B.roadN, 1]]) {
      if (made >= 3) break;
      for (const dx of [0, 6, -6, 12]) if (works(x + dx - 2.4, x + dx + 2.4, zk, dir)) { made++; break; }
    }
    W.worksMade = made;
  }
  updaters.push((t) => { const k = Math.floor(t * 3) % 3; lampMats.forEach((m, i) => m.color.copy(i === k ? amberOn : amberOff)); });

  // ---------- out they go, as instanced meshes per cell ----------
  const shadowless = new Set(['succ', 'clay', 'post']);
  let count = 0;
  for (const [k, list] of Object.entries(T)) {
    const [file, nodes] = P[k];
    assets.place(scene, file, nodes, list, { shadow: !shadowless.has(k) });
    count += list.length;
  }
  W.streetStats = { fronts: fronts.length, kinds: fronts.reduce((o, f) => ((o[f.kind] = (o[f.kind] ?? 0) + 1), o), {}), vends: vends.length };
  console.info('[ameyoru] street life:', JSON.stringify(W.streetStats), '·', count, 'props,', Object.entries(T).map(([k, l]) => `${k} ${l.length}`).join(', '), '· roadworks', W.worksMade, '· boards', boards);
  return { count };
}
