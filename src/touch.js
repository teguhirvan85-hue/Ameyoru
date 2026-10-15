// Touch controls (phones and tablets): a stick on the left to walk or drive (it presses W A S D for you, and
// runs when pushed all the way), drag anywhere else to look around, and round buttons for what the keys do:
// E (talk, use, get in/out), V (view), the map, photo mode, the menu. Only shown on a touch screen.
export function makeTouch({ input, look }) {
  const touch = ('ontouchstart' in window || navigator.maxTouchPoints > 0) && matchMedia('(pointer: coarse)').matches;
  if (!touch) return null;
  document.body.classList.add('touch');
  const el = document.createElement('div'); el.id = 'touch';
  el.innerHTML = `
    <div class="tc-look"></div>
    <div class="tc-stick"><div class="tc-knob"></div></div>
    <div class="tc-btns">
      <button data-k="KeyE" class="big">E<i>act</i></button>
      <button data-k="KeyV">V<i>view</i></button>
      <button data-k="Tab">⌖<i>map</i></button>
      <button data-k="KeyP">◉<i>photo</i></button>
      <button data-k="KeyI">☰<i>items</i></button>
    </div>
    <button class="tc-menu" data-k="Escape">❚❚</button>`;
  document.body.appendChild(el);
  const press = (code) => { if (!input.keys.has(code)) input.pressed.add(code); input.keys.add(code); };
  const release = (code) => input.keys.delete(code);

  // ---------- buttons: held while your finger is on them ----------
  for (const b of el.querySelectorAll('[data-k]')) {
    b.addEventListener('touchstart', (e) => { e.preventDefault(); press(b.dataset.k); b.classList.add('on'); }, { passive: false });
    const up = (e) => { e.preventDefault(); release(b.dataset.k); b.classList.remove('on'); };
    b.addEventListener('touchend', up, { passive: false }); b.addEventListener('touchcancel', up, { passive: false });
  }

  // ---------- the stick ----------
  const stick = el.querySelector('.tc-stick'), knob = el.querySelector('.tc-knob');
  let sid = null, sx = 0, sy = 0;
  const held = new Set();
  function setKeys(dx, dy) {
    const r = Math.hypot(dx, dy), want = new Set();
    if (r > 0.25) {
      const a = Math.atan2(dx, -dy);   // 0 = up
      if (Math.cos(a) > 0.38) want.add('KeyW'); if (Math.cos(a) < -0.38) want.add('KeyS');
      if (Math.sin(a) > 0.38) want.add('KeyD'); if (Math.sin(a) < -0.38) want.add('KeyA');
      if (r > 0.92) want.add('ShiftLeft');
    }
    for (const k of held) if (!want.has(k)) { release(k); held.delete(k); }
    for (const k of want) if (!held.has(k)) { press(k); held.add(k); }
  }
  stick.addEventListener('touchstart', (e) => {
    e.preventDefault(); const t = e.changedTouches[0]; sid = t.identifier;
    const r = stick.getBoundingClientRect(); sx = r.left + r.width / 2; sy = r.top + r.height / 2;
  }, { passive: false });
  addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === sid) {
        const R = stick.clientWidth / 2;
        let dx = (t.clientX - sx) / R, dy = (t.clientY - sy) / R; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
        knob.style.transform = `translate(${dx * R * 0.55}px, ${dy * R * 0.55}px)`;
        setKeys(dx, dy);
      } else if (t.identifier === lid) { look(t.clientX - lx, t.clientY - ly); lx = t.clientX; ly = t.clientY; }
    }
  }, { passive: false });
  const endTouch = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === sid) { sid = null; knob.style.transform = ''; setKeys(0, 0); }
      if (t.identifier === lid) lid = null;
    }
  };
  addEventListener('touchend', endTouch); addEventListener('touchcancel', endTouch);

  // ---------- looking: drag on the rest of the screen ----------
  const lookEl = el.querySelector('.tc-look');
  let lid = null, lx = 0, ly = 0;
  lookEl.addEventListener('touchstart', (e) => { e.preventDefault(); const t = e.changedTouches[0]; lid = t.identifier; lx = t.clientX; ly = t.clientY; }, { passive: false });

  return { el, show: (on) => el.classList.toggle('hidden', !on) };
}
