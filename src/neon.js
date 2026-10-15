// The neon of a Tokyo night street, laid over the town after it's built — nothing already there is changed:
//  · vertical signs (tategaki) projecting from the facades where two buildings meet (their balconies stop
//    there), Japanese neon text on a texture atlas, all merged into one draw call; a few flicker
//  · animated LED billboards on the tallest roofs, scrolling ads
//  · hologram koi swimming over the street, hologram rings over the junctions
//  · soft halos round every street lamp and sign (they swell in rain and haze), one draw call
import * as THREE from 'three';
import * as TX from './textures.js';

const WORDS = ['カラオケ', '居酒屋', 'ラーメン', '焼肉', '麻雀', 'スナック', '喫茶', 'ホテル', 'パチンコ', '寿司', 'うどん', 'ゲーム', '占い', '美容室', '薬局', '酒場', 'カフェ', '餃子', 'バー', '質屋', '整体', '歯科', 'ネイル', '中華', '天ぷら', '漫画', 'ダーツ', '鉄板焼'];
// [background, text/tube colour] — dark plates with bright tubes, and bright lightboxes with dark text
const STYLES = [['#0a0a12', '#ff3fa8'], ['#0a0a12', '#3ff0ff'], ['#0a0a12', '#ffe23f'], ['#0a0a12', '#a46bff'], ['#0a0a12', '#56ff8a'], ['#ffffff', '#c8102e'], ['#ffe14a', '#1a1a1a'], ['#ff2a4a', '#ffffff'], ['#1a4fff', '#ffffff'], ['#0a0a12', '#ff8a2a']];
const COLS = 8, ROWS = 4, CW = 160, CH = 512;   // atlas: 8×4 cells, each a tall sign face (the last cell is the dark edge)

function signAtlas(rnd) {
  const cells = [];
  const tex = TX.canvasTex(COLS * CW, ROWS * CH, (g, w, h) => {
    g.fillStyle = '#08080c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < COLS * ROWS - 1; i++) {
      const cx = (i % COLS) * CW, cy = Math.floor(i / COLS) * CH;
      const [bg, fg] = STYLES[i % STYLES.length], word = WORDS[(i * 7 + 3) % WORDS.length];
      const dark = bg === '#0a0a12';
      g.save(); g.beginPath(); g.rect(cx, cy, CW, CH); g.clip();
      g.fillStyle = bg; g.fillRect(cx, cy, CW, CH);
      if (!dark) { const gr = g.createLinearGradient(cx, cy, cx + CW, cy); gr.addColorStop(0, 'rgba(0,0,0,0.12)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.1)'); gr.addColorStop(1, 'rgba(0,0,0,0.12)'); g.fillStyle = gr; g.fillRect(cx, cy, CW, CH); }
      // a tube round the edge (neon) or a printed border (lightbox)
      g.strokeStyle = fg; g.lineWidth = dark ? 7 : 5; if (dark) { g.shadowColor = fg; g.shadowBlur = 18; }
      g.strokeRect(cx + 12, cy + 12, CW - 24, CH - 24);
      // the word, top to bottom
      const chars = [...word], size = Math.min(110, (CH - 70) / chars.length);
      g.font = `900 ${size}px ${TX.JP_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = dark ? '#ffffff' : fg;
      if (dark) { g.shadowColor = fg; g.shadowBlur = 26; }
      const top = cy + (CH - size * chars.length) / 2 + size / 2;
      chars.forEach((ch, k) => { g.fillText(ch, cx + CW / 2, top + k * size); if (dark) { g.fillStyle = fg; g.fillText(ch, cx + CW / 2, top + k * size); g.fillStyle = '#ffffff'; } });
      g.restore();
      cells.push({ u0: cx / w, u1: (cx + CW) / w, v0: 1 - (cy + CH) / h, v1: 1 - cy / h, color: new THREE.Color(dark ? fg : bg) });
    }
  }, { srgb: true });
  tex.anisotropy = 8;
  const dark = { u0: (COLS - 1) * CW / (COLS * CW) + 0.002, u1: 1 - 0.002, v0: 0.002, v1: CH / (ROWS * CH) - 0.002 };
  return { tex, cells, dark };
}

// a box whose two big faces show an atlas cell and whose edges show the dark cell
function signBox(W, H, T, cell, dark) {
  const g = new THREE.BoxGeometry(W, H, T);
  const uv = g.attributes.uv;
  // BoxGeometry face order: +x, −x, +y, −y, +z, −z (4 vertices each)
  for (let f = 0; f < 6; f++) {
    const c = f >= 4 ? cell : dark;
    for (let k = 0; k < 4; k++) {
      // the back face (−z) is seen from the other side: flip it so the text reads the right way round
      const i = f * 4 + k, u = f === 5 ? 1 - uv.getX(i) : uv.getX(i), v = uv.getY(i);
      uv.setXY(i, c.u0 + (c.u1 - c.u0) * u, c.v0 + (c.v1 - c.v0) * v);
    }
  }
  return g;
}

export function buildNeon({ scene, spans, updaters, lampSpots, mergeGeometries, rnd }) {
  const A = signAtlas(rnd);
  const signMat = new THREE.MeshBasicMaterial({ map: A.tex, color: new THREE.Color(1.7, 1.7, 1.7) });
  const steel = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.45, metalness: 0.8 });
  const parts = [], brackets = [], halos = [];
  const flickers = [];
  const tmp = new THREE.Object3D();
  const put = (geo, x, y, z, ry) => { tmp.position.set(x, y, z); tmp.rotation.set(0, ry, 0); tmp.updateMatrix(); return geo.applyMatrix4(tmp.matrix); };

  // ---------- vertical signs where two facades meet ----------
  const list = spans.slice().sort((a, b) => a.side - b.side || a.line - b.line || a.z0 - b.z0);
  let ci = 0;
  for (let i = 0; i < list.length; i++) {
    const a = list[i], b = list[i + 1];
    // where this facade meets the next one on the same street side (or its own end, now and then)
    const joined = b && b.side === a.side && Math.abs(b.line - a.line) < 0.01 && Math.abs(b.z0 - a.z1) < 0.8;
    if (!joined && rnd() < 0.5) continue;
    const h = joined ? Math.min(a.h, b.h) : a.h;
    if (h < 7) continue;
    const z = joined ? (a.z1 + b.z0) / 2 : a.z1 - 0.2;
    const out = -a.side, fx = a.side * a.line;
    const W = 0.62 + rnd() * 0.25, H = Math.min(h - 3.4, 2.2 + rnd() * 2.6), T = 0.16;
    const y = 3.3 + H / 2 + rnd() * Math.max(0, h - 3.6 - H);
    const cell = A.cells[ci++ % A.cells.length];
    const x = fx + out * (W / 2 + 0.12);
    const geo = put(signBox(W, H, T, cell, A.dark), x, y, z, 0);
    // a few flicker on their own; the rest are merged
    if (rnd() < 0.08) {
      const m = new THREE.Mesh(geo, signMat.clone()); m.userData.dynamic = true; m.material.userData.mutable = true; scene.add(m);
      flickers.push({ m, t: rnd() * 5, base: 1.7 });
    } else parts.push(geo);
    // two brackets into the wall, and a cap
    for (const yy of [y - H / 2 + 0.25, y + H / 2 - 0.25]) brackets.push(put(new THREE.BoxGeometry(0.14 + 0.12, 0.05, 0.05), fx + out * 0.12, yy, z, 0));
    brackets.push(put(new THREE.BoxGeometry(W + 0.04, 0.05, T + 0.04), x, y + H / 2 + 0.025, z, 0));
    halos.push({ x, y, z, c: cell.color, s: 1.6 + H * 0.5 });
  }
  // office blocks have no balconies: more signs down their pilasters (one or two per block)
  for (const sp of spans) {
    if (sp.style !== 'office' || sp.h < 9 || !sp.cols || sp.cols < 3) continue;
    const cw = (sp.z1 - sp.z0) / sp.cols, out = -sp.side, fx = sp.side * sp.line;
    const picks = new Set([1 + Math.floor(rnd() * (sp.cols - 1))]); if (sp.cols > 4 && rnd() < 0.6) picks.add(1 + Math.floor(rnd() * (sp.cols - 1)));
    for (const c of picks) {
      const z = sp.z0 + c * cw, W = 0.55 + rnd() * 0.25, H = Math.min(sp.h - 4, 1.8 + rnd() * 2.4), T = 0.14;
      const y = 3.6 + H / 2 + rnd() * Math.max(0, sp.h - 4 - H);
      const cell = A.cells[ci++ % A.cells.length], x = fx + out * (W / 2 + 0.2);
      parts.push(put(signBox(W, H, T, cell, A.dark), x, y, z, 0));
      for (const yy of [y - H / 2 + 0.2, y + H / 2 - 0.2]) brackets.push(put(new THREE.BoxGeometry(0.3, 0.05, 0.05), fx + out * 0.14, yy, z, 0));
      halos.push({ x, y, z, c: cell.color, s: 1.4 + H * 0.45 });
    }
  }
  if (parts.length) { const m = new THREE.Mesh(mergeGeometries(parts), signMat); m.userData.dynamic = true; scene.add(m); }
  if (brackets.length) { const m = new THREE.Mesh(mergeGeometries(brackets.map((g) => g.toNonIndexed())), steel); m.castShadow = true; scene.add(m); }
  updaters.push((t, dt) => {
    for (const f of flickers) {
      f.t -= dt;
      if (f.t < 0) { f.on = !f.on || Math.random() < 0.6; f.t = f.on ? 1 + Math.random() * 6 : 0.05 + Math.random() * 0.12; }
      const k = f.on === false ? 0.15 : f.base;
      f.m.material.color.setScalar(k);
    }
  });

  // ---------- LED billboards on the tallest roofs, facing the street ----------
  const tall = spans.filter((s) => s.h >= 12 && s.z1 - s.z0 > 7).sort((a, b) => b.h - a.h).slice(0, 7);
  const ads = [
    { bg: ['#0b1a4a', '#2a0b4a'], t1: 'RHYTHM NIGHT', t2: 'リズム祭 · 今夜', c: '#5cc8ff' },
    { bg: ['#4a0b1a', '#1a0b2a'], t1: 'KOI BANK', t2: '鯉銀行 · いつでも', c: '#ffb04a' },
    { bg: ['#0b3a2a', '#0b1a2a'], t1: 'HOSHI MART', t2: 'ほしマート 24時間', c: '#7dffb0' },
    { bg: ['#3a0b4a', '#0b0b2a'], t1: 'NEON SODA', t2: 'ネオンソーダ 新発売', c: '#ff5cf0' },
  ];
  const boards = [];
  tall.forEach((s, i) => {
    const ad = ads[i % ads.length], c = document.createElement('canvas'); c.width = 512; c.height = 288;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const out = -s.side, fx = s.side * s.line, z = (s.z0 + s.z1) / 2, W = Math.min(7.5, s.z1 - s.z0 - 1), H = W * 0.5625;
    const g = new THREE.Group(); g.position.set(fx + out * 0.4, s.h + H / 2 + 1.2, z); g.rotation.y = out > 0 ? Math.PI / 2 : -Math.PI / 2; scene.add(g);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.5, 1.5, 1.5) })); screen.position.z = 0.06; g.add(screen);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(W + 0.3, H + 0.3, 0.1), steel); g.add(frame);
    for (const sx of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.4, 0.15), steel); leg.position.set(sx * W * 0.35, -H / 2 - 0.7, -0.3); g.add(leg); }
    g.userData.dynamic = true; screen.material.userData.mutable = true;
    boards.push({ c, tex, ad, ph: i * 1.7, x: g.position.x, z });
    halos.push({ x: g.position.x + out * 0.5, y: g.position.y, z, c: new THREE.Color(ad.c), s: W * 0.9 });
  });
  let adT = 0;
  const drawAd = (b, t) => {
    const g = b.c.getContext('2d'), W = 512, H = 288, a = b.ad, k = t + b.ph;
    const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, a.bg[0]); gr.addColorStop(1, a.bg[1]); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // moving light bands
    for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(255,255,255,${0.04 + 0.03 * Math.sin(k * 2 + i)})`; g.fillRect(((k * 60 + i * 110) % (W + 120)) - 120, 0, 40, H); }
    g.textAlign = 'center'; g.fillStyle = a.c; g.shadowColor = a.c; g.shadowBlur = 20;
    g.font = `900 ${60 + Math.sin(k * 3) * 4}px ${TX.LATIN_FONT}`; g.fillText(a.t1, W / 2, 130);
    g.shadowBlur = 0; g.fillStyle = '#ffffff'; g.font = `700 30px ${TX.JP_FONT}`; g.fillText(a.t2, W / 2, 190);
    // a ticker along the bottom
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, H - 36, W, 36); g.fillStyle = a.c; g.font = `700 20px ${TX.LATIN_FONT}`; g.textAlign = 'left';
    const msg = `${a.t1} · ${a.t2} · AMEYORU · 雨夜 · `; const off = -((k * 70) % 600); g.fillText(msg + msg, off, H - 12);
    b.tex.needsUpdate = true;
  };
  boards.forEach((b) => drawAd(b, 0));
  updaters.push((t, dt, p) => {
    if ((adT -= dt) > 0) return; adT = 1 / 12;
    // only the screens near enough to read get redrawn
    for (const b of boards) if (Math.hypot(p.x - b.x, p.z - b.z) < 120) drawAd(b, t);
  });

  // ---------- holograms: koi over the street, rings over the junctions ----------
  const holoMat = (c1, c2) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { time: { value: 0 }, c1: { value: new THREE.Color(c1) }, c2: { value: new THREE.Color(c2) }, k: { value: 1 } },
    vertexShader: /* glsl */`uniform float time; varying vec3 vN, vW; varying vec2 vUv;
      void main(){ vUv = uv; vec3 p = position;
        // the body sways like a swimming fish (the tail most)
        float tail = smoothstep(0.0, 1.0, -p.z / 3.2 + 0.5); p.x += sin(time * 3.0 - p.z * 1.4) * 0.35 * tail;
        vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`uniform float time, k; uniform vec3 c1, c2; varying vec3 vN, vW; varying vec2 vUv;
      void main(){ vec3 V = normalize(cameraPosition - vW); float rim = pow(1.0 - abs(dot(normalize(vN), V)), 1.8);
        float scan = 0.65 + 0.35 * sin(vW.y * 40.0 - time * 6.0);
        float spots = smoothstep(0.55, 0.75, sin(vUv.x * 18.0) * sin(vUv.y * 9.0 + 1.3));
        vec3 col = mix(c1, c2, spots) * (0.12 + rim * 1.1) * scan * k;
        gl_FragColor = vec4(col, 1.0); }`,
  });
  const koiGeo = (() => {
    // a lathe body (nose at +z), a tail fan and two side fins, merged
    const prof = []; for (let i = 0; i <= 16; i++) { const t = i / 16; prof.push(new THREE.Vector2(Math.sin(Math.PI * Math.pow(t, 0.8)) * 0.75 * (1 - t * 0.55), (0.5 - t) * 6.4)); }
    const body = new THREE.LatheGeometry(prof, 24).rotateX(Math.PI / 2).scale(1, 0.75, 1);
    const tail = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(1.4, -1.6), new THREE.Vector2(0.2, -1.0), new THREE.Vector2(-0.2, -1.0), new THREE.Vector2(-1.4, -1.6)])).rotateX(-Math.PI / 2).translate(0, 0, -3.1);
    const fins = [-1, 1].map((s) => new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(1.2 * s, -0.5), new THREE.Vector2(0.9 * s, -1.0), new THREE.Vector2(0.1 * s, -0.6)])).rotateX(-Math.PI / 2).translate(0.5 * s, -0.25, 1.0));
    return mergeGeometries([body, tail, ...fins].map((g) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k); if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2)); return n; }));
  })();
  const holos = [];
  const koi = (cx, cz, r, y, c1, c2, sp) => {
    const m = new THREE.Mesh(koiGeo, holoMat(c1, c2)); m.userData.dynamic = true; m.renderOrder = 6; scene.add(m);
    holos.push({ m, cx, cz, r, y, sp, ph: Math.random() * 6 });
  };
  koi(0, -150, 9, 22, 0xff6a2a, 0xffffff, 0.22);   // over the station
  koi(0, 10, 7, 18, 0xff3fa8, 0x5cf0ff, -0.28);    // over the konbini crossing
  koi(0, -96, 8, 20, 0xffd23f, 0xff5a2a, 0.25);    // over the yokocho
  const ringMat = holoMat(0x3fd8ff, 0xb46bff), rings = [];
  for (const [x, y, z] of [[0, 13, 40], [0, 13, -200], [51, 11, -66], [-51, 11, -66]]) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.userData.dynamic = true; scene.add(g);
    for (const [r, tube] of [[3.2, 0.06], [2.6, 0.03], [3.6, 0.02]]) { const t = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, 96), ringMat); t.rotation.x = Math.PI / 2; t.renderOrder = 6; g.add(t); }
    rings.push(g);
    halos.push({ x, y, z, c: new THREE.Color(0x3fd8ff), s: 6 });
  }
  updaters.push((t) => {
    for (const h of holos) {
      const a = t * h.sp + h.ph;
      h.m.position.set(h.cx + Math.cos(a) * h.r, h.y + Math.sin(t * 0.7 + h.ph) * 0.8, h.cz + Math.sin(a) * h.r);
      h.m.rotation.y = Math.atan2(-Math.sin(a) * Math.sign(h.sp), Math.cos(a) * Math.sign(h.sp)); // nose along the way it swims
      h.m.material.uniforms.time.value = t;
    }
    ringMat.uniforms.time.value = t;
    rings.forEach((g, i) => { g.rotation.y = t * 0.3 * (i % 2 ? -1 : 1); g.children.forEach((c, k) => { c.rotation.y = Math.sin(t * 0.8 + k) * 0.15; }); });
  });

  // ---------- halos: a soft glow round lamps and signs, stronger in rain and haze ----------
  for (const s of lampSpots) {
    if (s.y < 2 || s.x < -300 || s.x > 300) continue;
    const c = new THREE.Color(s.c ?? 0xffc98a);
    halos.push({ x: s.x, y: s.y + 0.15, z: s.z, c, s: s.street ? 2.6 : 1.4 });
  }
  const N = halos.length, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N);
  halos.forEach((h, i) => { pos.set([h.x, h.y, h.z], i * 3); col.set([h.c.r, h.c.g, h.c.b], i * 3); size[i] = h.s; });
  const hg = new THREE.BufferGeometry();
  hg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); hg.setAttribute('color', new THREE.BufferAttribute(col, 3)); hg.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const haloMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { k: { value: 0.35 }, scale: { value: 400 } },
    vertexShader: /* glsl */`attribute float size; attribute vec3 color; varying vec3 vC; varying float vF; uniform float scale;
      void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = -mv.z;
        vF = smoothstep(1.5, 5.0, d) * (1.0 - smoothstep(60.0, 110.0, d)); gl_PointSize = size * scale / d; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`varying vec3 vC; varying float vF; uniform float k;
      void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = exp(-d * d * 4.0) * (1.0 - d); if (a <= 0.0) discard; gl_FragColor = vec4(vC * a * k * vF, 1.0); }`,
  });
  const haloPts = new THREE.Points(hg, haloMat); haloPts.frustumCulled = false; haloPts.renderOrder = 7; haloPts.userData.dynamic = true; scene.add(haloPts);

  return {
    haloPts,
    // halos: k from rain and haze; scale from the screen height
    setHalo(k, screenH) { haloMat.uniforms.k.value = k; haloMat.uniforms.scale.value = screenH * 0.5; },
    count: { signs: ci, boards: boards.length, halos: N },
  };
}
