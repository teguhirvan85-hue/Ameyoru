// The town map: a small round map in the corner that turns with the camera, and the whole town (Tab).
// Everything is drawn once into an offscreen picture (roads, pavements, buildings, railway, places), then each
// frame only that picture is copied, turned, and the markers (you, traffic, cars you can drive) go on top.
// Markers differ by shape, not only colour.
import { WALK, DRIVE, RAISED, VIADUCT, PARK, YOKO } from './district.js';
import { RING } from './world.js';
import { NORTH } from './north.js';

const X0 = -135, X1 = 200, Z0 = -214, Z1 = 240, PX = 4; // map area in metres, pixels per metre in the picture
const W = (X1 - X0) * PX, H = (Z1 - Z0) * PX;
const mx = (x) => (x - X0) * PX, my = (z) => (Z1 - z) * PX; // north (+z) is up

export function makeMinimap(world) {
  const pic = document.createElement('canvas'); pic.width = W; pic.height = H;
  const g = pic.getContext('2d');
  const rect = (r, fill) => { g.fillStyle = fill; g.fillRect(mx(r.minX), my(r.maxZ), (r.maxX - r.minX) * PX, (r.maxZ - r.minZ) * PX); };
  const ground = (r) => (r.minY === undefined || r.minY < 0.5) && (r.maxY === undefined || r.maxY > 0.5) && r.maxX > X0 && r.minX < X1 && r.maxZ > Z0 && r.minZ < Z1;

  // night ground, then the blocks (everything solid and big enough), then the walkable ground and the roads
  g.fillStyle = '#0b0e15'; g.fillRect(0, 0, W, H);
  for (const c of world.colliders) {
    if (c.active || c.minY !== undefined) continue;
    if (c.maxX - c.minX < 1.5 || c.maxZ - c.minZ < 1.5 || !ground(c)) continue;
    rect(c, '#262b36');
  }
  // the blocks along the north cross street have no colliders: draw them from the solid meshes
  for (const b of world.blockers || []) {
    if (!b.geometry) continue;
    b.geometry.computeBoundingBox?.(); const bb = b.geometry.boundingBox; if (!bb) continue;
    const r = { minX: bb.min.x + b.position.x, maxX: bb.max.x + b.position.x, minZ: bb.min.z + b.position.z, maxZ: bb.max.z + b.position.z };
    if (b.position.y < 30 && ground(r) && r.maxX - r.minX > 3 && r.maxZ - r.minZ > 3) rect(r, '#262b36');
  }
  for (const r of WALK) if (ground(r)) rect(r, '#5a6170');
  for (const r of RAISED) if (ground(r) && r.y === undefined) rect(r, '#5a6170');
  // the park, green with a label
  rect({ minX: 7, maxX: PARK.x1, minZ: PARK.z0, maxZ: PARK.z1 }, '#2f4a37');
  // roads (asphalt), from the street layout
  const road = '#3a3f4a';
  const roads = [
    { minX: -4, maxX: 4, minZ: RING.south - RING.sHalf, maxZ: 44 },
    { minX: -70, maxX: 70, minZ: 38, maxZ: 42 },
    { minX: -RING.bx - RING.half, maxX: -RING.bx + RING.half, minZ: RING.south - RING.sHalf, maxZ: 42 },
    { minX: RING.bx - RING.half, maxX: RING.bx + RING.half, minZ: RING.south - RING.sHalf, maxZ: 42 },
    { minX: -RING.bx - RING.half, maxX: RING.bx + RING.half, minZ: RING.south - RING.sHalf, maxZ: RING.south + RING.sHalf },
  ];
  for (const r of roads) rect(r, road);
  // the north (north.js): water first, then the arcade, the plaza, the roads, the expressway over the canal
  const N = NORTH, Bv = N.blvd, CN = N.canal, HB = N.harbour, EX = N.expressway;
  rect({ minX: CN.x0, maxX: CN.x1, minZ: CN.z0, maxZ: CN.z1 }, '#12263a');
  rect({ minX: HB.quay, maxX: X1, minZ: Z0, maxZ: Z1 }, '#0f2133');
  rect({ minX: -N.sho.x, maxX: N.sho.x, minZ: N.sho.z0, maxZ: N.sho.roof1 }, '#6e5c4a');
  for (const r of [
    { minX: Bv.x0, maxX: Bv.x1, minZ: Bv.roadS, maxZ: Bv.roadN },
    { minX: -RING.bx - RING.half, maxX: -RING.bx + RING.half, minZ: 42, maxZ: Bv.roadS },
    { minX: RING.bx - RING.half, maxX: RING.bx + RING.half, minZ: 42, maxZ: Bv.roadS },
    { minX: HB.road0, maxX: HB.road1, minZ: HB.z0, maxZ: HB.z1 },
    { minX: N.ramp.x0, maxX: N.ramp.x1, minZ: N.ramp.z0, maxZ: N.ramp.z1 },
  ]) rect(r, road);
  rect({ minX: Bv.x0, maxX: Bv.x1, minZ: Bv.z - Bv.med, maxZ: Bv.z + Bv.med }, '#2f4a37');
  g.fillStyle = 'rgba(150,156,168,.42)'; g.fillRect(mx(EX.x - EX.half), 0, EX.half * 2 * PX, H);
  // coin-parking lots and other drivable patches off the roads
  for (const r of DRIVE) if (r.maxX - r.minX < 30 && r.maxZ - r.minZ < 30 && ground(r)) rect(r, road);
  // centre lines
  g.strokeStyle = 'rgba(220,226,236,.55)'; g.lineWidth = 1.5; g.setLineDash([8, 10]);
  const line = (x0, z0, x1, z1) => { g.beginPath(); g.moveTo(mx(x0), my(z0)); g.lineTo(mx(x1), my(z1)); g.stroke(); };
  line(0, 36, 0, RING.south + RING.sHalf); line(-66, 40, 66, 40); line(-RING.bx, 36, -RING.bx, RING.south + RING.sHalf);
  line(RING.bx, 36, RING.bx, RING.south + RING.sHalf); line(-RING.bx, RING.south, RING.bx, RING.south);
  line(-RING.bx, 44, -RING.bx, Bv.roadS); line(RING.bx, 44, RING.bx, Bv.roadS); line((HB.road0 + HB.road1) / 2, HB.z0, (HB.road0 + HB.road1) / 2, HB.z1);
  for (const z of [(Bv.roadS + Bv.z) / 2, (Bv.roadN + Bv.z) / 2]) line(Bv.x0, z, Bv.x1, z);
  g.strokeStyle = 'rgba(255,190,110,.5)'; line(EX.x, Z0, EX.x, Z1);
  g.setLineDash([]);
  // railway: the level-crossing line and the viaduct with the station
  g.fillStyle = '#4a4036'; g.fillRect(mx(-120), my(-66 + 1.2), 240 * PX, 2.4 * PX);
  g.strokeStyle = '#c9ccd2'; g.lineWidth = 1.2; line(-120, -66.55, 120, -66.55); line(-120, -65.45, 120, -65.45);
  g.fillStyle = 'rgba(160,168,182,.55)'; g.fillRect(0, my(VIADUCT.z1), W, (VIADUCT.z1 - VIADUCT.z0) * PX);
  g.strokeStyle = 'rgba(30,34,42,.9)'; g.setLineDash([3, 5]); line(X0, VIADUCT.track, X1, VIADUCT.track); g.setLineDash([]);

  const labels = [
    { name: '星見通り', x: 0, z: -180, big: true, rot: -Math.PI / 2 },
    { name: 'Park', x: 22, z: -109 },
    { name: '横丁 Yokochō', x: -24, z: (YOKO.z0 + YOKO.z1) / 2 },
    { name: 'Crossing', x: 28, z: -70.5 },
    { name: '星見銀座', x: 0, z: 70, rot: -Math.PI / 2 },
    { name: '星見通り大通り  Hoshimi-dōri', x: -64, z: NORTH.blvd.z + 4.5 },
    { name: '新星見  Shin-Hoshimi', x: -60, z: 168, big: true },
    { name: '星見運河', x: (NORTH.canal.x0 + NORTH.canal.x1) / 2, z: 185, rot: -Math.PI / 2 },
    { name: '首都高 星見線', x: NORTH.expressway.x, z: -20, rot: -Math.PI / 2 },
    { name: '星見港  Harbour', x: 152, z: 216, big: true },
  ];
  // ready-made copy for the big map, with the district names written on (the places are drawn live on top)
  const big = document.createElement('canvas'); big.width = W; big.height = H;
  {
    const b = big.getContext('2d'); b.drawImage(pic, 0, 0);
    b.textAlign = 'center'; b.textBaseline = 'middle';
    for (const l of labels) {
      b.save(); b.translate(mx(l.x), my(l.z)); if (l.rot) b.rotate(l.rot);
      b.font = `${l.big ? 900 : 700} ${l.big ? 34 : 22}px "Noto Sans JP", sans-serif`; b.lineWidth = 6; b.strokeStyle = 'rgba(8,10,16,.85)';
      b.strokeText(l.name, 0, 0); b.fillStyle = l.big ? '#9fdcff' : '#dfe6f2'; b.fillText(l.name, 0, 0); b.restore();
    }
  }

  // ---- the HUD pieces ----
  const mini = document.getElementById('minimap'), mc = mini.getContext('2d');
  const bigEl = document.getElementById('bigmap'), bcv = document.getElementById('bigmapCanvas'), bc = bcv.getContext('2d');
  const dpr = Math.min(2, devicePixelRatio || 1);
  const size = () => { const s = mini.clientWidth || 180; if (mini.width !== s * dpr) { mini.width = mini.height = s * dpr; } };
  let open = false, places = null, route = null, mark = null, onMark = null, lastP = { x: 0, z: 0 };

  // markers: you (arrow), traffic (small plain squares), cars you can drive (outlined squares)
  function markers(c, toX, toY, k, rot, p, heading) {
    // people on the pavements: small dots
    c.fillStyle = 'rgba(214,222,236,.75)';
    for (const a of world.fx?.walkers || []) {
      if (!a.on) continue;
      c.beginPath(); c.arc(toX(a.x, a.z), toY(a.x, a.z), Math.max(1.4, 0.45 * k), 0, Math.PI * 2); c.fill();
    }
    for (const a of world.fx?.traffic || []) {
      if (!a.on) continue;
      c.save(); c.translate(toX(a.pos.x, a.pos.z), toY(a.pos.x, a.pos.z)); c.rotate(Math.atan2(a.tan.x, a.tan.z) + rot);
      c.fillStyle = '#c9d2e0'; c.fillRect(-1.0 * k, -2.2 * k, 2.0 * k, 4.4 * k); c.restore();
    }
    for (const car of world.drivable || []) {
      c.save(); c.translate(toX(car.position.x, car.position.z), toY(car.position.x, car.position.z)); c.rotate(car.rotation.y + rot);
      c.strokeStyle = '#5cc8ff'; c.lineWidth = Math.max(1.5, 0.45 * k); c.strokeRect(-1.0 * k, -2.3 * k, 2.0 * k, 4.6 * k); c.restore();
    }
    // the route to your mark: a bright dashed line along the streets, and the mark itself (a diamond)
    if (route && route.length > 1) {
      c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
      c.strokeStyle = 'rgba(8,10,16,.75)'; c.lineWidth = Math.max(5, 1.4 * k); c.beginPath();
      route.forEach((q, i) => (i ? c.lineTo(toX(q.x, q.z), toY(q.x, q.z)) : c.moveTo(toX(q.x, q.z), toY(q.x, q.z)))); c.stroke();
      c.strokeStyle = '#ffb547'; c.lineWidth = Math.max(2.5, 0.7 * k); c.setLineDash([Math.max(6, 2 * k), Math.max(4, 1.2 * k)]); c.stroke();
      c.restore();
    }
    if (mark) {
      const x = toX(mark.x, mark.z), y = toY(mark.x, mark.z), s = Math.max(7, 2.2 * k);
      c.save(); c.translate(x, y); c.rotate(Math.PI / 4);
      c.fillStyle = 'rgba(255,181,71,.25)'; c.fillRect(-s, -s, 2 * s, 2 * s);
      c.strokeStyle = '#ffb547'; c.lineWidth = 2.5; c.strokeRect(-s, -s, 2 * s, 2 * s); c.restore();
    }
    // you: an arrow pointing the way you face
    c.save(); c.translate(toX(p.x, p.z), toY(p.x, p.z)); c.rotate(heading + rot);
    const s = Math.max(7, 2.4 * k);
    c.fillStyle = '#ffb547'; c.strokeStyle = '#0b0e15'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -s * 1.3); c.lineTo(s * 0.85, s * 0.9); c.lineTo(0, s * 0.45); c.lineTo(-s * 0.85, s * 0.9); c.closePath(); c.fill(); c.stroke();
    c.restore();
  }
  // a place's marker: the shape says what kind it is (shop ■, food ●, play ◆, sight ▲, station ▬, secret ★, love ♥); found
  // ones bright with their name, the rest a dim "?"
  // a heart (Desy's café): point down, about 2s across
  function heartPath(c, s) {
    c.moveTo(0, s * 1.05);
    c.bezierCurveTo(-s * 1.5, s * 0.05, -s * 0.95, -s * 1.15, 0, -s * 0.38);
    c.bezierCurveTo(s * 0.95, -s * 1.15, s * 1.5, s * 0.05, 0, s * 1.05);
    c.closePath();
  }
  function heart(c, x, y, s, alpha = 1) {
    c.save(); c.translate(x, y); c.globalAlpha = alpha;
    c.shadowColor = 'rgba(255,95,160,.85)'; c.shadowBlur = s * 1.2;
    c.beginPath(); heartPath(c, s); c.fillStyle = '#ff5f9e'; c.fill();
    c.shadowBlur = 0; c.lineWidth = Math.max(1.5, s * 0.22); c.strokeStyle = '#fff4f8'; c.stroke();
    c.restore();
  }
  function placeIcon(c, kind, x, y, s, found) {
    if (kind === 'love') { heart(c, x, y + s * 0.1, s * 1.25); return; }
    c.save(); c.translate(x, y);
    c.fillStyle = found ? '#ffd36b' : 'rgba(154,166,189,.55)'; c.strokeStyle = 'rgba(8,10,16,.9)'; c.lineWidth = 2;
    c.beginPath();
    if (!found) { c.arc(0, 0, s, 0, Math.PI * 2); c.fill(); c.stroke(); c.fillStyle = '#0b0e15'; c.font = `700 ${s * 1.5}px -apple-system, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', 0, s * 0.08); c.restore(); return; }
    if (kind === 'shop') c.rect(-s, -s, 2 * s, 2 * s);
    else if (kind === 'food') c.arc(0, 0, s, 0, Math.PI * 2);
    else if (kind === 'play') { c.moveTo(0, -s * 1.3); c.lineTo(s * 1.3, 0); c.lineTo(0, s * 1.3); c.lineTo(-s * 1.3, 0); c.closePath(); }
    else if (kind === 'sight') { c.moveTo(0, -s * 1.3); c.lineTo(s * 1.2, s); c.lineTo(-s * 1.2, s); c.closePath(); }
    else if (kind === 'transit') c.rect(-s * 1.5, -s * 0.6, s * 3, s * 1.2);
    else { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? s * 0.55 : s * 1.35; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); }
    c.fill(); c.stroke(); c.restore();
  }

  // ---- the big map: its own view you can pan and zoom ----
  const view = { cx: 0, cz: -80, s: 0, fit: 0 };   // centre (metres) and scale (screen px per metre)
  const fitView = (cw, ch) => { view.fit = Math.min(cw / (X1 - X0), ch / (Z1 - Z0)) * 0.96; };
  const toSX = (x) => bcv.width / 2 + (x - view.cx) * view.s, toSY = (z) => bcv.height / 2 - (z - view.cz) * view.s;
  const toWX = (sx) => view.cx + (sx - bcv.width / 2) / view.s, toWZ = (sy) => view.cz - (sy - bcv.height / 2) / view.s;
  const clampView = () => {
    view.s = Math.min(Math.max(view.s, view.fit), view.fit * 9);
    const hw = bcv.width / 2 / view.s, hh = bcv.height / 2 / view.s;
    view.cx = Math.min(Math.max(view.cx, X0 + Math.min(hw, (X1 - X0) / 2)), X1 - Math.min(hw, (X1 - X0) / 2));
    view.cz = Math.min(Math.max(view.cz, Z0 + Math.min(hh, (Z1 - Z0) / 2)), Z1 - Math.min(hh, (Z1 - Z0) / 2));
  };
  let drag = null;
  // two fingers on the map: pinch to zoom about the point between them (a phone has no mouse wheel)
  const touches = new Map();
  let pinch = null;
  bcv.addEventListener('pointerdown', (e) => {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) {
      const [a, b] = [...touches.values()], r = bcv.getBoundingClientRect();
      const sx = ((a.x + b.x) / 2 - r.left) * dpr, sy = ((a.y + b.y) / 2 - r.top) * dpr;
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: view.s, wx: toWX(sx), wz: toWZ(sy) };
      if (drag) drag.moved = true;   // a pinch is never a tap
      return;
    }
    drag = { x: e.clientX, y: e.clientY, cx: view.cx, cz: view.cz, moved: false, btn: e.button }; bcv.setPointerCapture(e.pointerId);
  });
  const lift = (e) => { touches.delete(e.pointerId); if (touches.size < 2) pinch = null; };
  bcv.addEventListener('pointercancel', (e) => { lift(e); drag = null; });
  bcv.addEventListener('pointermove', (e) => {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && touches.size === 2) {
      const [a, b] = [...touches.values()], r = bcv.getBoundingClientRect();
      const sx = ((a.x + b.x) / 2 - r.left) * dpr, sy = ((a.y + b.y) / 2 - r.top) * dpr;
      view.s = pinch.s * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pinch.d); clampView();
      // keep the point that was between the fingers under them
      view.cx = pinch.wx - (sx - bcv.width / 2) / view.s; view.cz = pinch.wz + (sy - bcv.height / 2) / view.s; clampView();
      return;
    }
    if (!drag) return;
    const dx = (e.clientX - drag.x) * dpr, dy = (e.clientY - drag.y) * dpr;
    if (Math.hypot(dx, dy) > 5 * dpr) { drag.moved = true; bcv.classList.add('drag'); }
    if (drag.moved) { view.cx = drag.cx - dx / view.s; view.cz = drag.cz + dy / view.s; clampView(); }
  });
  bcv.addEventListener('pointerup', (e) => {
    lift(e);
    if (!drag || touches.size) return;
    const r = bcv.getBoundingClientRect();
    if (!drag.moved) {
      if (drag.btn === 2) onMark?.(null);
      else onMark?.({ x: toWX((e.clientX - r.left) * dpr), z: toWZ((e.clientY - r.top) * dpr) });
    }
    drag = null; bcv.classList.remove('drag');
  });
  bcv.addEventListener('contextmenu', (e) => e.preventDefault());
  bcv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = bcv.getBoundingClientRect(), sx = (e.clientX - r.left) * dpr, sy = (e.clientY - r.top) * dpr;
    const wx = toWX(sx), wz = toWZ(sy);
    view.s *= Math.exp(-e.deltaY * 0.0015); clampView();
    // keep the point under the cursor where it was
    view.cx = wx - (sx - bcv.width / 2) / view.s; view.cz = wz + (sy - bcv.height / 2) / view.s; clampView();
  }, { passive: false });

  function drawBig(p, heading) {
    const cw = bcv.clientWidth * dpr, ch = bcv.clientHeight * dpr;
    if (bcv.width !== cw || bcv.height !== ch) { bcv.width = cw; bcv.height = ch; fitView(cw, ch); if (!view.s) view.s = view.fit; clampView(); }
    bc.fillStyle = '#0b0e15'; bc.fillRect(0, 0, cw, ch);
    // the picture is PX pixels a metre; on screen view.s pixels a metre
    const k = view.s / PX;
    bc.drawImage(big, toSX(X0), toSY(Z1), W * k, H * k);
    // places
    if (places) {
      bc.textAlign = 'center'; bc.textBaseline = 'middle';
      for (const pl of places.PLACES) {
        if (pl.x === null) continue;
        const f = places.has(pl.id) || !!pl.always, x = toSX(pl.x), y = toSY(pl.z), s = Math.max(5, view.s * 0.9);
        placeIcon(bc, pl.kind, x, y, s, f);
        if (f && view.s > view.fit * 1.25 || f && (pl.always || ['shrine', 'station', 'park', 'crossing', 'arcade', 'mart'].includes(pl.id))) {
          bc.font = `600 ${Math.round(12 * dpr)}px -apple-system, "Noto Sans JP", sans-serif`; bc.lineWidth = 4; bc.strokeStyle = 'rgba(8,10,16,.9)';
          bc.strokeText(pl.name, x, y - s - 9 * dpr); bc.fillStyle = '#f2f5fb'; bc.fillText(pl.name, x, y - s - 9 * dpr);
        }
      }
    }
    markers(bc, (x) => toSX(x), (x, z) => toSY(z), view.s * 1.0, 0, p, heading);
  }

  let miniOn = true;   // the small map can be switched off in the settings
  return {
    get open() { return open; },
    setMini(v) { miniOn = v; },
    setPlaces(pl) { places = pl; },
    setRoute(r) { route = r; },
    setMark(m) { mark = m; },
    set onMark(f) { onMark = f; },
    // the big map centres on a point (a place picked in the list, or you)
    centre(x, z) { view.cx = x; view.cz = z; view.s = Math.max(view.s, (view.fit || 1) * 2.2); clampView(); },
    centreOnYou() { this.centre(lastP.x, lastP.z); },
    toggle(v = !open) {
      open = v; bigEl.classList.toggle('hidden', !open); mini.classList.toggle('hidden', open);
      if (open) { view.s = 0; bcv.width = 0; }   // refit on the next draw
    },
    // p: where you are; camYaw: the camera's yaw (the small map turns with it); heading: which way you face
    update(p, camYaw, heading, show = true) {
      lastP = p;
      mini.style.visibility = show && !open && miniOn ? 'visible' : 'hidden';
      // only draw the big map while it's open, and the small one when it's showing
      if (open) {
        drawBig(p, heading);
        return;
      }
      if (!show) return;
      size();
      const S = mini.width, R = S / 2, zoom = 0.55 * dpr * (S / dpr / 184); // screen pixels per picture pixel
      // turn so the way the camera looks is up
      const rot = Math.PI - camYaw;
      mc.clearRect(0, 0, S, S);
      mc.save(); mc.beginPath(); mc.arc(R, R, R - 1, 0, Math.PI * 2); mc.clip();
      mc.fillStyle = '#0b0e15'; mc.fillRect(0, 0, S, S);
      mc.translate(R, R); mc.rotate(rot); mc.scale(zoom, zoom); mc.translate(-mx(p.x), -my(p.z));
      mc.drawImage(pic, 0, 0);
      mc.restore();
      // markers in screen space: picture → turn about you → screen
      const c = Math.cos(rot), s = Math.sin(rot), k = PX * zoom;
      const sx = (x, z) => { const dx = (x - p.x) * k, dy = (p.z - z) * k; return R + dx * c - dy * s; };
      const sy = (x, z) => { const dx = (x - p.x) * k, dy = (p.z - z) * k; return R + dx * s + dy * c; };
      mc.save(); mc.beginPath(); mc.arc(R, R, R - 1, 0, Math.PI * 2); mc.clip();
      markers(mc, sx, sy, k, rot, p, heading);
      mc.restore();
      // the mark, when it's off the edge: a small diamond on the rim pointing at it
      if (mark) {
        const mxs = sx(mark.x, mark.z) - R, mys = sy(mark.x, mark.z) - R, d = Math.hypot(mxs, mys);
        if (d > R - 10 * dpr) {
          const ex = R + mxs / d * (R - 12 * dpr), ey = R + mys / d * (R - 12 * dpr), q = 6 * dpr;
          mc.save(); mc.translate(ex, ey); mc.rotate(Math.PI / 4);
          mc.fillStyle = '#ffb547'; mc.strokeStyle = '#0b0e15'; mc.lineWidth = 2; mc.fillRect(-q, -q, 2 * q, 2 * q); mc.strokeRect(-q, -q, 2 * q, 2 * q); mc.restore();
        }
      }
      // Desy's café: a heart where it is, or a small one on the rim pointing the way
      for (const pl of places?.PLACES || []) {
        if (pl.kind !== 'love' || pl.x === null) continue;
        const hx = sx(pl.x, pl.z) - R, hy = sy(pl.x, pl.z) - R, d = Math.hypot(hx, hy), q = 6.5 * dpr;
        if (d < R - 12 * dpr) heart(mc, R + hx, R + hy, q);
        else heart(mc, R + hx / d * (R - 13 * dpr), R + hy / d * (R - 13 * dpr), q * 0.8, 0.85);
      }
      // north mark on the rim
      mc.font = `700 ${11 * dpr}px -apple-system, sans-serif`; mc.textAlign = 'center'; mc.textBaseline = 'middle';
      const tx = R + Math.sin(rot) * (R - 11 * dpr), ty = R - Math.cos(rot) * (R - 11 * dpr);
      mc.fillStyle = 'rgba(8,10,16,.8)'; mc.beginPath(); mc.arc(tx, ty, 8 * dpr, 0, Math.PI * 2); mc.fill();
      mc.fillStyle = '#e9eef8'; mc.fillText('N', tx, ty + 0.5 * dpr);
    },
  };
}
