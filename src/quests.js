// The night's story, the things to find and the north's two jobs.
//  · Starfall over Hoshimi (星降る夜): Ms. Hoshino, an old astronomer, wants to see the meteor shower before dawn.
//    Find her lens and her star chart, ask the harbour to dim its floodlights, and meet her on the Sky Deck.
//  · 20 maneki-neko (招き猫) hidden round town: ¥500 for every five, ¥3,000 for all of them.
//  · Courier (Hoshimi Logistics' night desk) and a night taxi fare.
// State in localStorage 'ameyoru.quests'. The objective shows under the location, and the GPS mark follows it
// unless you've set one of your own.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const KEY = 'ameyoru.quests';
const NEKO = [
  [6.7, 0.17, -2.2], [-6.7, 0.17, -30], [-7.2, 0.17, -44.5], [6.7, 0.17, -63.5], [-26, 0.17, -99.2], [22, 0.17, -110],
  [-20, 0.17, -145], [12, 0.17, -147], [46.4, 0.17, -80], [-56, 0.17, -120], [3, 0.17, -206.2], [-46.3, 0.17, 30],
  [5.2, 0.17, 45.4], [-5.5, 0.17, 80], [30, 0.17, 105.2], [-11.7, 0.77, 150.7], [94, 0.17, 96], [116.2, 0.17, 74],
  [130, 0.17, 108], [-13.8, 116.02, 190.4],
];
const STORY = {
  none: null,
  meet: ['Talk to the astronomer', 'Shin-Hoshimi Plaza'],
  lens: ["Find Ms. Hoshino's telescope lens", 'outside the Kissaten, Hoshimi Street'],
  chart: ['Find her star chart', 'Yokochō alley'],
  crane: ['Ask the harbour to dim its floodlights', 'the crane operator, Hoshimi Harbour'],
  deck: ['Meet Ms. Hoshino on the Sky Deck', 'Hoshimi Sky Tower (lift ¥1,000)'],
  done: null,
};

export function makeQuests({ world, scene, ui, api, NORTH, banner, setMark, getMark, setClock, setWeather, lookUp, driving, player }) {
  let st;
  try { st = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { st = {}; }
  st.story ??= 'none'; st.neko ??= {}; st.courier ??= 'ask'; st.parcels ??= {}; st.fare ??= 'ask';
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* storage unavailable */ } };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const N = NORTH.npcs;

  // ---------- the objective line on the HUD ----------
  const obj = document.createElement('div'); obj.id = 'objective'; obj.className = 'hidden';
  document.getElementById('hud')?.appendChild(obj);
  let questMark = null, markedKey = null;
  function objective() {
    // the story first, then whichever job is running
    let line = null, where = null, pt = null;
    const s = STORY[st.story];
    if (s) {
      [line, where] = s;
      pt = { meet: N.hoshino.talk, lens: { x: -5.7, z: -5.9 }, chart: { x: -25, z: -98.3 }, crane: N.crane.talk, deck: { x: 0, z: 186 } }[st.story];
    } else if (st.courier === 'deliver') {
      const next = PARCELS.find((q) => !st.parcels[q.id]);
      line = `Deliver the parcels (${PARCELS.filter((q) => st.parcels[q.id]).length}/3)`; where = next.where; pt = next;
    } else if (st.courier === 'back') { line = 'Back to the night desk'; where = 'Hoshimi Logistics, the harbour'; pt = N.dispatcher.talk; }
    else if (st.fare === 'pickup') { line = 'Bring a car for the passenger'; where = 'the boulevard, by the plaza'; pt = N.passenger.talk; }
    else if (st.fare === 'ride') { line = 'Drive the passenger to Hoshimi Station'; where = 'the station plaza'; pt = { x: -15, z: -146 }; }
    obj.classList.toggle('hidden', !line);
    if (line) obj.innerHTML = `<b>★ ${line}</b><span>${where}</span>`;
    // the GPS follows the objective, unless you've marked somewhere yourself
    // (once per objective: reach it, or clear it, and it isn't put back)
    const m = getMark(), key = pt ? `${line}|${pt.x},${pt.z}` : null;
    if (pt && key !== markedKey && (!m || m.quest)) { markedKey = key; questMark = { x: pt.x, z: pt.z, name: line, quest: true }; setMark(questMark); }
    else if (!pt && m && m.quest) { questMark = null; markedKey = null; setMark(null); }
  }

  // ---------- Starfall over Hoshimi ----------
  const say = (lines, done) => api.say(lines, done);
  const H = (text) => ({ who: 'Ms. Hoshino', text });
  const items = {};
  {
    // the lens in a velvet pouch on the bench outside the Kissaten; the chart pinned to a lantern post in the yokochō
    // a wooden bench outside the Kissaten (it stays, the pouch goes)
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a30, roughness: 0.6 }), iron = new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.4, metalness: 0.7 });
    const bench = new THREE.Group(); bench.position.set(-6.35, 0.15, -6.2); scene.add(bench); bench.userData.static = true;
    for (const [w, h, d, x, y, z, m] of [[0.4, 0.05, 1.5, 0, 0.42, 0, wood], [0.06, 0.4, 1.5, -0.18, 0.66, 0, wood], [0.36, 0.4, 0.05, 0, 0.2, -0.65, iron], [0.36, 0.4, 0.05, 0, 0.2, 0.65, iron]]) {
      const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; bench.add(o);
    }
    world.colliders.push({ minX: -6.6, maxX: -6.1, minZ: -7, maxZ: -5.4 });
    const pouch = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10).scale(1, 0.62, 1), new THREE.MeshStandardMaterial({ color: 0x5a1f3a, roughness: 0.9 }));
    pouch.position.set(-6.32, 0.15 + 0.445 + 0.05, -5.9); pouch.castShadow = true; pouch.userData.dynamic = true; scene.add(pouch); items.lens = pouch;
    const chartT = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 160; const g = c.getContext('2d');
      g.fillStyle = '#e8dcc0'; g.fillRect(0, 0, 128, 160); g.strokeStyle = 'rgba(40,40,80,.6)'; g.beginPath(); g.arc(64, 70, 50, 0, 7); g.stroke();
      g.fillStyle = '#1a2a5a'; for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(14 + Math.random() * 100, 20 + Math.random() * 100, Math.random() * 2 + 0.5, 0, 7); g.fill(); }
      g.font = 'bold 14px sans-serif'; g.fillText('ペルセウス', 22, 148); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const chart = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.4), new THREE.MeshStandardMaterial({ map: chartT, roughness: 0.8, side: THREE.DoubleSide }));
    // pinned to a little notice board on a post by the alley's south wall
    const post = new THREE.Group(); post.position.set(-25, 0.15, -99.0); post.userData.static = true; scene.add(post);
    const dw = new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.8 });
    for (const [w, h, d, y] of [[0.1, 1.9, 0.1, 0.95], [0.62, 0.62, 0.05, 1.45], [0.7, 0.05, 0.12, 1.79]]) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), dw); o.position.y = y; o.castShadow = true; post.add(o); }
    world.colliders.push({ minX: -25.1, maxX: -24.9, minZ: -99.1, maxZ: -98.9 });
    chart.position.set(-25, 1.45, -98.97); chart.userData.dynamic = true; scene.add(chart); items.chart = chart;
  }
  const showItems = () => { items.lens.visible = st.story === 'lens'; items.chart.visible = st.story === 'chart'; };
  showItems();
  const go = (step) => { st.story = step; save(); showItems(); objective(); };
  world.interactables.push(
    { pos: V(N.hoshino.talk.x, 0, N.hoshino.talk.z), r: 1.3, label: 'Talk to the astronomer', anim: 'talk',
      hidden: () => !['none', 'meet', 'lens', 'chart', 'crane'].includes(st.story),
      action: () => {
        if (st.story === 'none' || st.story === 'meet') {
          go('lens');
          return [H('Ah — you look like someone who looks up. Tonight, before dawn, the clouds may part.'), H('The Hoshimi meteor shower. Once a year. But the city is so bright…'),
            H('I need three things. My lens — I left it outside the Kissaten on Hoshimi Street. My star chart, pinned up in the yokochō.'), H('And the harbour floodlights dimmed, if anyone can talk the crane operator round. Then meet me on the Sky Deck.')];
        }
        return [H({ lens: 'My lens is in a little velvet pouch, on the bench outside the Kissaten.', chart: 'The chart is pinned to a lantern post in the yokochō alley.', crane: 'The crane operator works the night shift by the big red cranes.' }[st.story])];
      } },
    { pos: V(-5.7, 0, -5.9), r: 1.0, label: 'Pick up the velvet pouch', anim: 'pick', hidden: () => st.story !== 'lens',
      action: () => { api.addItem('Telescope lens'); go('chart'); return [{ text: 'A heavy brass lens, wrapped in velvet. Someone polished it with great care.' }]; } },
    { pos: V(-25, 0, -98.3), r: 1.0, label: 'Take the star chart', anim: 'pick', hidden: () => st.story !== 'chart',
      action: () => { api.addItem('Star chart'); go('crane'); return [{ text: 'A hand-drawn chart of the autumn sky. "Perseus, low in the north-east, 04:40" is circled in red.' }]; } },
    { pos: V(N.crane.talk.x, 0, N.crane.talk.z), r: 1.3, label: 'Talk to the crane operator', anim: 'talk', hidden: () => st.story !== 'crane',
      action: () => { NORTH.dimCranes?.(0.15); go('deck'); return [{ who: 'Crane operator', text: 'Old Hoshino and her meteors? Every year she asks.' }, { who: 'Crane operator', text: 'Ship\'s loaded, nothing moves till six. Fine — I\'ll kill the floods for an hour. Go on, then.' }, { text: 'Out on the quay, the great floodlights fade one by one.' }]; } },
    { pos: V(N.hoshinoDeck.talk.x, NORTH.sky.deckY, N.hoshinoDeck.talk.z), r: 1.4, label: 'Talk to Ms. Hoshino', anim: 'talk', hidden: () => st.story !== 'deck',
      action: () => { queueMicrotask(finale); return [H('You found everything. The lens, the chart… and the harbour has gone dark.'), H('It\'s nearly 04:40. Look — out over the old town. Keep watching.')]; } },
  );

  // after the story: she still likes a word
  for (const w of [N.hoshino, N.hoshinoDeck]) {
    world.interactables.push({ pos: V(w.talk.x, w.y > 1 ? w.y : 0, w.talk.z), r: 1.3, label: 'Talk to Ms. Hoshino', anim: 'talk', hidden: () => st.story !== 'done',
      action: () => [H(['Every year I say it\'s my last shower. Every year I come back.', 'Next year, the Geminids. You\'ll come, won\'t you?', 'The lens still smells of the Kissaten\'s coffee. I don\'t mind.'][Math.floor(Math.random() * 3)])] });
  }

  // ---------- the meteor shower ----------
  const POOL = 26, meteors = [];
  const streakGeo = new THREE.CylinderGeometry(0.02, 0.45, 26, 6, 1, true).translate(0, -13, 0);
  for (let i = 0; i < POOL; i++) {
    const m = new THREE.Mesh(streakGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.9, 2.4), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    m.visible = false; m.frustumCulled = false; m.userData.dynamic = true; scene.add(m);
    meteors.push({ m, life: 0, t: 0, v: new THREE.Vector3() });
  }
  let shower = 0, spawnT = 0;
  function spawn(p) {
    const s = meteors.find((q) => q.t >= q.life); if (!s) return;
    const a = Math.PI + (Math.random() - 0.5) * 1.8, d = 160 + Math.random() * 120;   // over the old town, to the south
    s.m.position.set(p.x + Math.sin(a) * d, p.y + 70 + Math.random() * 90, p.z + Math.cos(a) * d);
    s.v.set((Math.random() - 0.5) * 60, -35 - Math.random() * 30, (Math.random() - 0.5) * 60).normalize().multiplyScalar(90 + Math.random() * 60);
    s.m.quaternion.setFromUnitVectors(V(0, -1, 0), s.v.clone().normalize());
    s.t = 0; s.life = 0.7 + Math.random() * 0.8; s.m.visible = true;
  }
  function finale() {
    ui.fade(() => {
      setClock(4 * 60 + 38); setWeather(4, false); NORTH.dimCranes?.(0.15);
      lookUp?.();
      shower = 48; banner('★', 'Starfall over Hoshimi', '星降る夜', 'the meteor shower');
    }, 0.8);
  }
  function endShower() {
    say([H('…There. Did you see that long one? That was for you.'), H('Thank you. An old woman got her sky back tonight.')], () => {
      st.story = 'done'; save(); objective();
      api.earn(3000, 'Starfall over Hoshimi');
      api.useItem?.('Telescope lens'); api.useItem?.('Star chart');
      setTimeout(() => banner('STORY COMPLETE', 'Starfall over Hoshimi', '星降る夜', 'thank you for playing'), 1200);
    });
  }

  // ---------- maneki-neko ----------
  const nekoGeo = (() => {
    const parts = [], col = (g, c) => { g = g.index ? g.toNonIndexed() : g; const a = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) a.set(c, i); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); if (g.attributes.uv) g.deleteAttribute('uv'); return g; };
    const W = [0.96, 0.95, 0.92], R = [0.85, 0.12, 0.1], G = [0.95, 0.72, 0.2], B = [0.05, 0.05, 0.06];
    parts.push(col(new THREE.SphereGeometry(0.1, 16, 12).scale(1, 1.1, 0.9).translate(0, 0.11, 0), W));
    parts.push(col(new THREE.SphereGeometry(0.085, 16, 12).translate(0, 0.27, 0.01), W));
    for (const s of [-1, 1]) {
      parts.push(col(new THREE.ConeGeometry(0.03, 0.06, 8).translate(s * 0.05, 0.36, 0), W));
      parts.push(col(new THREE.SphereGeometry(0.011, 8, 6).translate(s * 0.03, 0.285, 0.08), B));
    }
    parts.push(col(new THREE.CylinderGeometry(0.025, 0.028, 0.14, 10).rotateZ(-0.3).translate(0.1, 0.25, 0.03), W));   // the beckoning paw
    parts.push(col(new THREE.TorusGeometry(0.06, 0.012, 8, 20).rotateX(Math.PI / 2).translate(0, 0.2, 0.01), R));
    parts.push(col(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 16).rotateX(Math.PI / 2).translate(0, 0.12, 0.095), G));
    parts.push(col(new THREE.CylinderGeometry(0.11, 0.12, 0.03, 18).translate(0, 0.015, 0), R));
    return parts;
  })();
  const nekoOne = mergeGeometries(nekoGeo);
  const nekoMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.1, emissive: 0x221a10 });
  const glint = new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 1.7, 0.9), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
  const nekos = NEKO.map(([x, y, z], i) => {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = i * 2.3; g.userData.dynamic = true;
    g.add(new THREE.Mesh(nekoOne, nekoMat));
    const sp = new THREE.Mesh(new THREE.OctahedronGeometry(0.04), glint); sp.position.set(0, 0.48, 0); g.add(sp);
    scene.add(g);
    const id = `n${i}`;
    g.visible = !st.neko[id];
    world.interactables.push({ pos: V(x, y > 1 ? y : 0, z), r: 0.9, label: 'Pick up the maneki-neko', anim: 'pick', hidden: () => !!st.neko[id],
      action: () => {
        st.neko[id] = true; save(); g.visible = false;
        const n = Object.keys(st.neko).length;
        api.toast(`招き猫 Maneki-neko · ${n} / ${NEKO.length}`); api.sound?.chime?.();
        if (n === NEKO.length) { setTimeout(() => api.earn(3000, 'every maneki-neko'), 800); banner('ALL FOUND', 'Every maneki-neko', '招き猫', `${n} / ${n}`); }
        else if (n % 5 === 0) setTimeout(() => api.earn(500, `${n} maneki-neko`), 800);
        return null;
      } });
    return { g, sp, i };
  });

  // ---------- the courier job ----------
  const PARCELS = [
    { id: 'ginza', x: -4.6, z: 52, where: 'Hoshimi Ginza', label: 'Deliver a parcel (Hoshimi Ginza)' },
    { id: 'tower', x: 0, z: 169.4, where: 'the Sky Tower reception', label: 'Deliver a parcel to reception' },
    { id: 'landing', x: 95.4, z: 155, where: 'the yakatabune landing', label: 'Deliver a parcel to the boatman' },
  ];
  const D = (text) => ({ who: 'Night desk', text });
  world.interactables.push({ pos: V(N.dispatcher.talk.x, 0, N.dispatcher.talk.z), r: 1.3, label: 'Talk to the night desk', anim: 'talk',
    action: () => {
      if (st.courier === 'ask') { st.courier = 'deliver'; st.parcels = {}; save(); objective(); api.addItem('Parcels', 3);
        return [D('Short-handed tonight. Three parcels, north side: Hoshimi Ginza, the Sky Tower reception, the yakatabune landing.'), D('¥1,200 when you\'re back. Car, feet, whatever gets them there.')]; }
      if (st.courier === 'deliver') return [D('Ginza, the Sky Tower, the boat landing. Bring me the slips.')];
      if (st.courier === 'back') { st.courier = 'done'; save(); setTimeout(() => { objective(); api.earn(1200, 'Hoshimi Logistics'); }, 300); return [D('All three signed for. Nice work — come back any night.')]; }
      return [D('Nothing more tonight. Thanks again.')];
    } });
  for (const q of PARCELS) {
    world.interactables.push({ pos: V(q.x, 0, q.z), r: 1.2, label: q.label, anim: 'pick', hidden: () => st.courier !== 'deliver' || st.parcels[q.id],
      action: () => {
        st.parcels[q.id] = true; api.useItem?.('Parcels');
        if (PARCELS.every((p) => st.parcels[p.id])) st.courier = 'back';
        save(); objective();
        return [{ text: `Parcel delivered · ${q.where}. A quick signature on the slip.` }];
      } });
  }

  // ---------- the night taxi fare ----------
  world.interactables.push({ pos: V(N.passenger.talk.x, 0, N.passenger.talk.z), r: 1.3, label: 'Talk to the waiting man', anim: 'talk', hidden: () => st.fare === 'ride' || st.fare === 'done',
    action: () => {
      if (st.fare === 'ask') { st.fare = 'pickup'; save(); objective(); return [{ who: 'Salaryman', text: 'Not a single taxi on the whole boulevard. Last train from Hoshimi Station in twenty minutes…' }, { who: 'Salaryman', text: 'You have a car? Pull up here and get me to the station. ¥1,500, cash.' }]; }
      return [{ who: 'Salaryman', text: 'Any car will do. Just pull up here.' }];
    } });
  const STATION = { x: -15, z: -146 };
  if ((st.fare === 'ride' || st.fare === 'done') && N.passenger.slot) N.passenger.slot.off = true;

  // ---------- every frame ----------
  let startT = 25, objT = 0;
  function update(dt, p, t) {
    // the story offers itself a little while into the night
    if (st.story === 'none' && (startT -= dt) <= 0) { st.story = 'meet'; save(); objective(); banner('NEW STORY', 'Starfall over Hoshimi', '星降る夜', 'an astronomer waits at Shin-Hoshimi Plaza'); }
    if ((objT -= dt) <= 0) { objT = 2; objective(); }
    for (const n of nekos) if (n.g.visible) { n.sp.position.y = 0.48 + Math.sin(t * 2 + n.i) * 0.03; n.sp.rotation.y = t * 2; glint.opacity = 0.35 + 0.3 * Math.sin(t * 3); }
    // the fare: pick him up, drop him at the station
    const car = driving?.car;
    if (car && st.fare === 'pickup' && Math.hypot(car.position.x - N.passenger.x, car.position.z - N.passenger.z) < 9) { st.fare = 'ride'; save(); if (N.passenger.slot) N.passenger.slot.off = true; api.toast('The passenger gets in the back · drive to Hoshimi Station'); objective(); }
    if (car && st.fare === 'ride' && Math.hypot(car.position.x - STATION.x, car.position.z - STATION.z) < 16 && Math.abs(driving.speed) < 1.5) {
      st.fare = 'done'; save(); objective(); api.earn(1500, 'night fare'); api.toast('"Made it! Keep the change."');
    }
    // the shower
    if (shower > 0) {
      shower -= dt; spawnT -= dt;
      if (spawnT <= 0) { spawnT = 0.15 + Math.random() * 0.55; spawn(p); }
      if (shower <= 0) endShower();
    }
    for (const s of meteors) {
      if (s.t >= s.life) { if (s.m.visible) s.m.visible = false; continue; }
      s.t += dt; s.m.position.addScaledVector(s.v, dt);
      const k = s.t / s.life; s.m.material.opacity = Math.min(1, k * 6) * (1 - k);
    }
  }

  objective();
  return {
    update, st,
    summary: () => [
      { who: 'Starfall over Hoshimi 星降る夜', text: st.story === 'done' ? 'complete ✓' : STORY[st.story] ? STORY[st.story][0] : 'an astronomer waits at Shin-Hoshimi Plaza' },
      { who: 'Maneki-neko 招き猫', text: `${Object.keys(st.neko).length} / ${NEKO.length} found` },
      { who: 'Courier · ¥1,200', text: { ask: 'ask the night desk at the harbour', deliver: `delivering (${PARCELS.filter((q) => st.parcels[q.id]).length}/3)`, back: 'back to the night desk', done: 'done ✓' }[st.courier] },
      { who: 'Night fare · ¥1,500', text: { ask: 'a man waits on the boulevard', pickup: 'bring a car', ride: 'to Hoshimi Station', done: 'done ✓' }[st.fare] },
    ],
  };
}
