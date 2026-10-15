// Photo mode (P): the town stops where it is — rain hangs in the air — and the camera comes off its rails.
// Fly it anywhere near you, set the lens (field of view, focus, blur), the exposure, a film look, a vignette and
// grain, tilt the horizon, pose your character or hide them, and save the picture as a PNG.
import * as THREE from 'three';

const FILTERS = [['None', 'なし'], ['Noir', 'ノワール'], ['Warm film', 'フィルム'], ['Cool neon', 'ネオン'], ['Faded', 'あせた'], ['Sepia', 'セピア']];
// a frame laid over the picture (drawn into the saved PNG too): none, or a soft white border with a line for Desy
const FRAMES = [['None', 'なし'], ['For Desy', 'デシーへ']];
const POSES = [['stand', 'Stand'], ['text', 'Phone'], ['talk', 'Talk'], ['drink', 'Drink'], ['sing', 'Sing'], ['pick', 'Reach']];
const RANGE = 35;   // how far from you the camera may fly (the town is drawn around you)

export function makePhoto({ camera, renderer, film, dof, player, groundY, walk, isDriving, toast }) {
  const st = { on: false, pos: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, fov: 55, autoFocus: true, focus: 6, blur: 1, ev: 0, filter: 0, vig: 1.1, grain: 1, showHero: true, pose: 'stand', panel: true, shot: false, frame: 0 };
  const DEF = { fov: 55, autoFocus: true, focus: 6, blur: 1, ev: 0, filter: 0, vig: 1.1, grain: 1, roll: 0 };
  const f = new THREE.Vector3(), r = new THREE.Vector3(), look = new THREE.Vector3();
  let center = new THREE.Vector3(), drag = null, heroWas = true;

  // ---------- the panel ----------
  const el = document.createElement('div'); el.id = 'photo'; el.className = 'hidden';
  el.innerHTML = `
    <div class="ph-card">
      <div class="ph-ttl">PHOTO MODE <em>写真モード</em></div>
      <div class="ph-sec">Lens</div>
      <label class="ph-row"><b>Field of view</b><input type="range" data-k="fov" min="18" max="100" step="1"><span data-v="fov"></span></label>
      <label class="ph-row"><b>Focus</b><button class="ph-tog" data-t="autoFocus"></button><span class="ph-sm" data-v="autoFocus"></span></label>
      <label class="ph-row" data-only="manual"><b>Focus distance</b><input type="range" data-k="focus" min="0.8" max="60" step="0.1"><span data-v="focus"></span></label>
      <label class="ph-row"><b>Background blur</b><input type="range" data-k="blur" min="0" max="3" step="0.05"><span data-v="blur"></span></label>
      <label class="ph-row"><b>Tilt</b><input type="range" data-k="roll" min="-25" max="25" step="0.5"><span data-v="roll"></span></label>
      <div class="ph-sec">Look</div>
      <label class="ph-row"><b>Exposure</b><input type="range" data-k="ev" min="-2" max="2" step="0.05"><span data-v="ev"></span></label>
      <div class="ph-chips" data-g="filter">${FILTERS.map(([n, j], i) => `<button data-i="${i}">${n}<i>${j}</i></button>`).join('')}</div>
      <label class="ph-row"><b>Vignette</b><input type="range" data-k="vig" min="0" max="2.5" step="0.05"><span data-v="vig"></span></label>
      <label class="ph-row"><b>Grain</b><input type="range" data-k="grain" min="0" max="3" step="0.05"><span data-v="grain"></span></label>
      <div class="ph-sec">Frame</div>
      <div class="ph-chips" data-g="frame">${FRAMES.map(([n, j], i) => `<button data-i="${i}">${n}<i>${j}</i></button>`).join('')}</div>
      <div class="ph-sec">Character</div>
      <label class="ph-row"><b>Show character</b><button class="ph-tog" data-t="showHero"></button><span class="ph-sm" data-v="showHero"></span></label>
      <div class="ph-chips" data-g="pose">${POSES.map(([k, n]) => `<button data-p="${k}">${n}</button>`).join('')}</div>
      <button class="ph-wide" data-a="face">Turn to the camera</button>
      <div class="ph-btns"><button class="ph-shoot" data-a="shoot">◉ Take photo <kbd>Space</kbd></button></div>
      <div class="ph-btns"><button data-a="reset">Reset</button><button data-a="exit">Exit <kbd>Esc</kbd></button></div>
      <div class="ph-keys"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> fly · <kbd>Q</kbd>/<kbd>E</kbd> down/up · <kbd>Shift</kbd> faster · drag to look · wheel to zoom · <kbd>H</kbd> hide panel</div>
    </div>`;
  document.body.appendChild(el);
  const flash = document.createElement('div'); flash.id = 'phflash'; document.body.appendChild(flash);
  // the frame as you compose (the saved picture gets the same, drawn by frameOnto)
  const frameEl = document.createElement('div'); frameEl.id = 'phframe'; frameEl.className = 'hidden';
  frameEl.innerHTML = '<span>for Desy Ika <i>♡</i></span><em>Hoshimi · 星見</em>';
  document.body.appendChild(frameEl);
  // on a touch screen: a small bar instead (the panel opens from it), so the stick stays free to fly the camera
  const bar = document.createElement('div'); bar.id = 'phbar'; bar.className = 'hidden';
  bar.innerHTML = '<button data-b="panel">⚙</button><button data-b="shoot" class="shoot">◉</button><button data-b="exit">✕</button>';
  document.body.appendChild(bar);
  const touch = () => document.body.classList.contains('touch');
  bar.querySelector('[data-b="panel"]').addEventListener('click', () => { st.panel = !st.panel; el.classList.toggle('hidden', !st.panel); });
  bar.querySelector('[data-b="shoot"]').addEventListener('click', () => { st.shot = true; });
  bar.querySelector('[data-b="exit"]').addEventListener('click', () => { st.wantExit = true; });
  const q = (s) => el.querySelector(s), qa = (s) => [...el.querySelectorAll(s)];
  const FMT = { fov: (v) => `${Math.round(v)}°`, focus: (v) => `${v.toFixed(1)} m`, blur: (v) => v.toFixed(2), roll: (v) => `${v.toFixed(1)}°`, ev: (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)} EV`, vig: (v) => v.toFixed(2), grain: (v) => v.toFixed(2),
    autoFocus: (v) => (v ? 'Auto (centre)' : 'Manual'), showHero: (v) => (v ? 'Shown' : 'Hidden') };
  function render() {
    for (const i of qa('input[data-k]')) i.value = st[i.dataset.k];
    for (const s of qa('[data-v]')) s.textContent = FMT[s.dataset.v](st[s.dataset.v]);
    for (const b of qa('.ph-tog')) b.classList.toggle('on', !!st[b.dataset.t]);
    for (const b of qa('[data-g="filter"] button')) b.classList.toggle('on', +b.dataset.i === st.filter);
    for (const b of qa('[data-g="frame"] button')) b.classList.toggle('on', +b.dataset.i === st.frame);
    frameEl.classList.toggle('hidden', !st.on || !st.frame);
    for (const b of qa('[data-g="pose"] button')) { b.classList.toggle('on', b.dataset.p === st.pose); b.disabled = isDriving() || !st.showHero; }
    q('[data-a="face"]').disabled = isDriving() || !st.showHero;
    q('[data-only="manual"]').style.display = st.autoFocus ? 'none' : '';
  }
  for (const i of qa('input[data-k]')) i.addEventListener('input', () => { st[i.dataset.k] = +i.value; render(); });
  for (const b of qa('.ph-tog')) b.addEventListener('click', (e) => { e.preventDefault(); st[b.dataset.t] = !st[b.dataset.t]; if (b.dataset.t === 'showHero') player.group.visible = st.showHero; render(); });
  for (const b of qa('[data-g="filter"] button')) b.addEventListener('click', () => { st.filter = +b.dataset.i; render(); });
  for (const b of qa('[data-g="frame"] button')) b.addEventListener('click', () => { st.frame = +b.dataset.i; render(); });
  for (const b of qa('[data-g="pose"] button')) b.addEventListener('click', () => { pose(b.dataset.p); render(); });
  q('[data-a="face"]').addEventListener('click', () => faceCamera());
  q('[data-a="shoot"]').addEventListener('click', () => { st.shot = true; });
  q('[data-a="reset"]').addEventListener('click', () => { Object.assign(st, DEF); render(); });
  q('[data-a="exit"]').addEventListener('click', () => { st.wantExit = true; });
  // keys typed on the panel's sliders shouldn't also fly the camera's arrow keys around: leave focus on the page
  for (const i of qa('input, button')) i.addEventListener('pointerup', () => i.blur());

  // ---------- looking around: drag on the picture; the wheel zooms ----------
  const canvas = renderer.domElement;
  canvas.addEventListener('mousedown', (e) => { if (st.on) drag = { x: e.clientX, y: e.clientY }; });
  addEventListener('mouseup', () => { drag = null; });
  addEventListener('mousemove', (e) => {
    if (!st.on || !drag) return;
    st.yaw -= (e.clientX - drag.x) * 0.0032; st.pitch = THREE.MathUtils.clamp(st.pitch - (e.clientY - drag.y) * 0.0032, -1.45, 1.45);
    drag.x = e.clientX; drag.y = e.clientY;
  });
  canvas.addEventListener('wheel', (e) => { if (!st.on) return; e.preventDefault(); st.fov = THREE.MathUtils.clamp(st.fov + Math.sign(e.deltaY) * 2, 18, 100); render(); }, { passive: false });

  // ---------- the character's pose ----------
  function settle(n = 36) { for (let i = 0; i < n; i++) player.update(1 / 30, new THREE.Vector2(), false, { colliders: [], groundY, bounds: walk, onStep: () => {} }); }
  function pose(k) {
    if (isDriving()) return;
    if (player.gest) player.stopGesture(null);
    if (k !== 'stand') { settle(8); player.gesture(k, { loop: true, at: k === 'pick' ? 0.45 : 0 }); }
    settle(k === 'stand' ? 24 : 36);
    st.pose = k;
  }
  function faceCamera() {
    if (isDriving()) return;
    const p = player.group.position;
    player.heading = Math.atan2(st.pos.x - p.x, st.pos.z - p.z);
    settle(4);
  }

  // ---------- in and out ----------
  function enter() {
    st.on = true; st.wantExit = false; st.shot = false;
    st.pos.copy(camera.position); camera.getWorldDirection(f);
    st.yaw = Math.atan2(f.x, f.z); st.pitch = Math.asin(THREE.MathUtils.clamp(f.y, -1, 1)); st.fov = camera.fov;
    center.copy(player.group.position);
    heroWas = player.group.visible; st.showHero = heroWas; st.pose = 'stand';
    st.panel = !touch(); el.classList.toggle('hidden', !st.panel); bar.classList.toggle('hidden', !touch()); render();
  }
  function exit() {
    st.on = false; el.classList.add('hidden'); bar.classList.add('hidden'); frameEl.classList.add('hidden');
    player.group.visible = heroWas;
    if (player.gest) { player.stopGesture(null); }
    // the lens and the film back to the game's
    film.uniforms.uVig.value = 1.1; film.uniforms.uGrain.value = 1; film.uniforms.uFilter.value = 0; film.uniforms.uExpo.value = 1;
    dof.uniforms.uOff.value = 4; dof.uniforms.uRange.value = 55; dof.uniforms.uSpan.value = 1.6;
  }

  // ---------- every frame while it's on ----------
  function update(dt, input) {
    if (input.hit('KeyH')) { st.panel = !st.panel; el.classList.toggle('hidden', !st.panel); }
    if (input.hit('Space') || input.hit('Enter')) st.shot = true;
    const fast = input.down('ShiftLeft', 'ShiftRight') ? 3 : input.down('AltLeft', 'AltRight') ? 0.3 : 1, sp = 3.2 * fast * dt;
    f.set(Math.sin(st.yaw) * Math.cos(st.pitch), Math.sin(st.pitch), Math.cos(st.yaw) * Math.cos(st.pitch));
    r.set(-f.z, 0, f.x).normalize();
    if (input.down('KeyW', 'ArrowUp')) st.pos.addScaledVector(f, sp);
    if (input.down('KeyS', 'ArrowDown')) st.pos.addScaledVector(f, -sp);
    if (input.down('KeyD', 'ArrowRight')) st.pos.addScaledVector(r, -sp);
    if (input.down('KeyA', 'ArrowLeft')) st.pos.addScaledVector(r, sp);
    if (input.down('KeyE')) st.pos.y += sp; if (input.down('KeyQ')) st.pos.y -= sp;
    // keep near you (the town is only drawn around you), above the ground
    const dx = st.pos.x - center.x, dz = st.pos.z - center.z, d = Math.hypot(dx, dz);
    if (d > RANGE) { st.pos.x = center.x + dx / d * RANGE; st.pos.z = center.z + dz / d * RANGE; }
    st.pos.y = THREE.MathUtils.clamp(st.pos.y, groundY(st.pos.x, st.pos.z, st.pos.y) + 0.2, center.y + 40);
    camera.position.copy(st.pos);
    camera.lookAt(look.copy(st.pos).add(f));
    if (st.roll) camera.rotateZ(THREE.MathUtils.degToRad(st.roll));
    if (Math.abs(camera.fov - st.fov) > 0.01) { camera.fov = st.fov; camera.updateProjectionMatrix(); }
    // the lens: focus in the middle of the picture or at a set distance; more blur also makes it start nearer
    const U = dof.uniforms, pr = renderer.getPixelRatio();
    U.uAuto.value = st.autoFocus ? 1 : 0; U.uFocus.value = st.focus; U.uK.value = st.blur > 0.01 ? 1 : 0;
    U.uSpan.value = 1.6 / (1 + st.blur); U.uOff.value = 4 / (1 + st.blur * 2.5); U.uRange.value = 55 / (1 + st.blur * 4); U.uMaxR.value = 6 * pr * (0.6 + st.blur * 0.7);
    // the film
    film.uniforms.uVig.value = st.vig; film.uniforms.uGrain.value = st.grain; film.uniforms.uFilter.value = st.filter; film.uniforms.uExpo.value = Math.pow(2, st.ev);
  }
  // right after the frame is drawn: the picture is still in the canvas, so take it now
  function afterRender() {
    if (!st.shot) return;
    st.shot = false;
    const url = st.frame ? frameOnto(canvas) : canvas.toDataURL('image/png');
    const d = new Date(), pad = (n) => String(n).padStart(2, '0');
    const name = `ameyoru_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
    fetch(url).then((r) => r.blob()).then((b) => {
      const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    });
    flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
    toast(`Photo saved · ${name}`);
    window.__lastPhoto = url;   // for checking it from the console
  }
  // the picture with the "For Desy" frame laid over it exactly as the overlay shows it (#phframe, in vmin):
  // a white border, wider at the foot, her name in italic serif on it
  function frameOnto(src) {
    const w = src.width, h = src.height, v = Math.min(w, h) / 100, b = 3.5 * v, foot = 11 * v;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    g.fillStyle = '#fbf6f2';
    g.fillRect(0, 0, w, b); g.fillRect(0, h - foot, w, foot); g.fillRect(0, 0, b, h); g.fillRect(w - b, 0, b, h);
    g.textBaseline = 'alphabetic'; g.fillStyle = '#b8476e'; g.textAlign = 'left';
    g.font = `italic 600 ${4.6 * v}px "Bodoni 72", Didot, Georgia, serif`;
    g.fillText('for Desy Ika ♡', b + 1.4 * v, h - foot * 0.36);
    g.fillStyle = '#8a7a80'; g.textAlign = 'right'; g.font = `500 ${2.4 * v}px "Chakra Petch", sans-serif`;
    const d = new Date();
    g.fillText(`HOSHIMI · 星見 · ${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`, w - b - 1.4 * v, h - foot * 0.4);
    return c.toDataURL('image/png');
  }
  return {
    enter, exit, update, afterRender,
    get on() { return st.on; },
    get wantExit() { return st.wantExit; },
    state: st,
  };
}
