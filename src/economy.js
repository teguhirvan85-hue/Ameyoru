// Money and small jobs around town. Kept in localStorage ('ameyoru.robo', the name from when it also held the
// robot cup) between visits.
//  · yen: from coins under vending machines, recycling empty cans, and helping people around town
//  · spent on anything with a price (ramen, gacha, UFO catcher, the konbini…) through pay()
import * as THREE from 'three';

// ---------- the small jobs ----------
// steps: 'ask' (not taken) → … → 'done'
const JOBS = {
  taxi: { name: 'Hungry taxi driver', pay: 600 },
  umbrella: { name: "Mrs. Sato's blue umbrella", pay: 500 },
  letter: { name: "Grandpa Mori's letter", pay: 400 },
  cat: { name: 'Mochi ran off', pay: 700 },
};

const KEY = 'ameyoru.robo';
function loadState() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch { s = null; }
  s = s || {};
  s.yen ??= 1000; s.cans ??= 0; s.night ??= 0;
  s.jobs ??= {}; s.looted ??= {}; s.litter ??= {};
  return s;
}

export function makeEconomy({ world, scene, ui, api, sound }) {
  const st = loadState();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* storage unavailable */ } };
  const yen = (n) => `¥${n.toLocaleString('en-US')}`;
  const hud = document.getElementById('wallet');
  const showWallet = () => { if (hud) hud.innerHTML = `<b>${yen(st.yen)}</b>${st.cans ? `<span>cans ${st.cans}</span>` : ''}`; };

  function earn(n, why) {
    st.yen += n; save(); showWallet();
    ui.toast(`+${yen(n)}${why ? ` · ${why}` : ''}`);
  }
  function pay(n, what) {
    if (st.yen < n) { ui.toast(`Not enough money: need ${yen(n)}, have ${yen(st.yen)}`); sound?.ui?.('no'); return false; }
    st.yen -= n; save(); showWallet();
    ui.toast(`−${yen(n)}${what ? ` · ${what}` : ''}`);
    return true;
  }
  const gotCan = (n = 1) => { st.cans += n; save(); showWallet(); };

  // ---- coins under vending machines: once per machine per night ----
  function vendCoin(key, a) {
    if (st.looted[key] === st.night) return [{ text: 'You already looked. Only dust and bottle caps.' }];
    st.looted[key] = st.night; save();
    const r = Math.random();
    if (r < 0.35) return [{ text: 'You crouch and peer under the machine… only dark and dust.' }];
    const n = r < 0.93 ? 10 * (1 + Math.floor(Math.random() * 10)) : 500;
    setTimeout(() => earn(n, 'coin under the machine'), 400);
    a.sound?.coin?.();
    return [{ text: n === 500 ? 'A ¥500 coin glints behind the dust! Your lucky night.' : `You feel around under the machine… a ${yen(n)} coin.` }];
  }
  // ---- recycling box: ¥20 a can ----
  const recycleLabel = () => (st.cans ? `Recycle ${st.cans} ${st.cans === 1 ? 'can' : 'cans'} (+${yen(st.cans * 20)})` : '');
  function recycle() {
    if (!st.cans) return null;
    const n = st.cans; st.cans = 0; save();
    earn(n * 20, `${n} ${n === 1 ? 'can' : 'cans'}`);
    return [{ text: `Clank, clank. ${n} ${n === 1 ? 'can goes' : 'cans go'} into the recycling box. The machine prints a ${yen(n * 20)} points slip.` }];
  }

  // ---- empty cans lying about (picked up once a night) ----
  const CANS = [[6.7, 22], [-6.7, -12], [6.7, -41], [-6.7, -88], [6.6, -126], [-6.6, -180], [45.4, 14], [56.6, -40], [45.4, -132], [56.6, -186],
    [-45.4, 6], [-56.6, -60], [-45.4, -120], [-56.6, -190], [30, -205.8], [-30, -205.8], [36, 43.6], [-52, 43.6]];
  const canMats = [0xc8102e, 0x1b5fbf, 0xd9d9d9, 0x2f8f4e].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.7 }));
  const canGeo = new THREE.CylinderGeometry(0.033, 0.033, 0.122, 12).rotateZ(Math.PI / 2);
  const litter = CANS.map(([x, z], i) => {
    const m = new THREE.Mesh(canGeo, canMats[i % canMats.length]);
    m.position.set(x, 0.185, z); m.rotation.y = i * 1.7; m.userData.dynamic = true; m.castShadow = true;
    scene.add(m);
    const key = `${x},${z}`;
    world.interactables.push({ pos: new THREE.Vector3(x, 0, z), r: 0.7, label: 'Pick up the empty can', anim: 'pick',
      hidden: () => st.litter[key] === st.night,
      action: () => { st.litter[key] = st.night; gotCan(); m.visible = false; return null; } });
    return { m, key };
  });
  const showLitter = () => { for (const c of litter) c.m.visible = st.litter[c.key] !== st.night; };
  showLitter();

  // ---- jobs ----
  const step = (id) => st.jobs[id] ?? 'ask';
  const setStep = (id, v) => { st.jobs[id] = v; save(); };
  const finish = (id, lines) => { setStep(id, 'done'); setTimeout(() => earn(JOBS[id].pay, JOBS[id].name), 600); allDone(); return lines; };
  function allDone() {
    if (Object.keys(JOBS).every((k) => step(k) === 'done') && !st.jobsBonus) {
      st.jobsBonus = true; save();
      setTimeout(() => earn(1000, 'every job done'), 2500);
    }
  }
  function job(id, ev, a) {
    const s = step(id);
    if (id === 'taxi') {
      if (s === 'ask') { setStep(id, 'bring'); return [{ who: 'Taxi driver', text: 'Night shift isn\'t over and my stomach\'s growling.' }, { who: 'Taxi driver', text: 'Could you grab me a nikuman from Hoshi Mart? I\'ll pay you back, plus a tip.' }]; }
      if (s === 'bring') {
        if (a.useItem('Nikuman')) return finish(id, [{ who: 'Taxi driver', text: 'Still hot! You\'re a lifesaver. Here, take this.' }]);
        return [{ who: 'Taxi driver', text: 'A nikuman from Hoshi Mart. The ones by the register.' }];
      }
      return [{ who: 'Taxi driver', text: 'If you need a cab, I\'m here. Though you can always walk.' }];
    }
    if (id === 'umbrella') {
      if (s === 'ask') { setStep(id, 'find'); return [{ who: 'Mrs. Sato', text: 'I left my blue umbrella behind… at the bus stop by the station, I think.' }, { who: 'Mrs. Sato', text: 'It was a gift from my grandchild. Would you fetch it for me?' }]; }
      if (ev === 'found') { setStep(id, 'return'); a.addItem('Blue umbrella'); return [{ text: 'A blue umbrella leans against the bus stop pole. Luckily no one took it.' }]; }
      if (s === 'find') return [{ who: 'Mrs. Sato', text: 'The bus stop in the station plaza. It\'s a blue umbrella.' }];
      if (s === 'return') { a.useItem('Blue umbrella'); return finish(id, [{ who: 'Mrs. Sato', text: 'That\'s the one! Thank you, dear. Please take a little something.' }]); }
      return [{ who: 'Mrs. Sato', text: 'I keep that umbrella with me now.' }];
    }
    if (id === 'letter') {
      if (s === 'ask') { setStep(id, 'post'); a.addItem("Grandpa Mori's letter"); return [{ who: 'Grandpa Mori', text: 'My knees won\'t take a long walk on a night like this.' }, { who: 'Grandpa Mori', text: 'Would you drop this letter in the red postbox outside Hoshi Mart? It\'s for my grandson in Osaka.' }]; }
      if (ev === 'posted') { a.useItem("Grandpa Mori's letter"); setStep(id, 'tell'); a.sound?.clunk?.(); return [{ text: 'The letter drops into the postbox with a soft sound.' }]; }
      if (s === 'post') return [{ who: 'Grandpa Mori', text: 'The red postbox, outside Hoshi Mart.' }];
      if (s === 'tell') return finish(id, [{ who: 'Grandpa Mori', text: 'Done? Good, good. This is for your trouble.' }]);
      return [{ who: 'Grandpa Mori', text: 'My grandson will be pleased.' }];
    }
    if (id === 'cat') {
      if (s === 'ask') { setStep(id, 'find'); return [{ who: 'Yui', text: 'My cat Mochi slipped out when the door was open! She\'s orange.' }, { who: 'Yui', text: 'She likes to hide in the west back street, near the south end.' }]; }
      if (ev === 'found') { setStep(id, 'return'); a.sound?.meow?.(); return [{ who: 'Mochi', text: 'Meow.' }, { text: 'Mochi sniffs your hand, then lets you pick her up. Take her home to Yui.' }]; }
      if (s === 'find') return [{ who: 'Yui', text: 'The west back street, near the south end. Just call "Mochi".' }];
      if (s === 'return') return finish(id, [{ who: 'Yui', text: 'Mochi! Thank you so much! Here, take my pocket money.' }]);
      return [{ who: 'Yui', text: 'Mochi\'s asleep in her basket now.' }];
    }
    return null;
  }

  // ---- the I menu: things you carry, jobs ----
  function openMenu() {
    ui.choose(`Items & jobs · ${yen(st.yen)}`, ['Things you carry', 'Job list', 'Story & finds', 'Close'], (k) => {
      if (k === 0) {
        const items = Object.entries(api.inv).filter(([, n]) => n > 0).map(([n, c]) => `${n}${c > 1 ? ` ×${c}` : ''}`);
        api.say([{ who: 'Things you carry', text: items.length ? items.join(' · ') : 'Nothing.' }, { text: `Empty cans: ${st.cans}. Money: ${yen(st.yen)}.` }], openMenu);
      } else if (k === 1) {
        const STEP = { ask: 'not taken', bring: 'buy a nikuman at Hoshi Mart', find: 'searching', return: 'return it', post: 'post it in the postbox', tell: 'tell Grandpa Mori', done: 'done ✓' };
        api.say(Object.entries(JOBS).map(([id, j]) => ({ who: `${j.name} · ${yen(j.pay)}`, text: STEP[step(id)] })), openMenu);
      }
      else if (k === 2 && api.quests) api.say(api.quests.summary(), openMenu);
    });
  }

  // a new night (after sleeping): coins and cans are back
  function newNight() { st.night++; save(); showLitter(); }

  showWallet();
  return { st, earn, pay, gotCan, vendCoin, recycle, recycleLabel, job, jobStep: step, openMenu, newNight };
}
