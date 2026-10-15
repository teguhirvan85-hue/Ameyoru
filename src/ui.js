// ?memlog=1 in the address: log the JavaScript memory in use after each loading step
const MEMLOG = new URLSearchParams(location.search).has('memlog');
const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.dialogOpen = false; this.typing = false;
    $('dialog').addEventListener('click', () => this.advance());
  }
  progress(p, msg) {
    $('bar').style.width = `${p * 100}%`; $('loadpct').textContent = `${Math.round(p * 100)}%`;
    if (msg) $('loadmsg').textContent = msg;
  }
  // one line of the loading log: the Japanese tag, what's happening, then [ OK ] and how long it took
  task(jp, what) {
    const li = document.createElement('li'); li.className = 'run';
    li.innerHTML = `<span class="jp"></span><span class="what"></span><span class="lead"></span><span class="ok">…</span><span class="ms"></span>`;
    li.querySelector('.jp').textContent = jp; li.querySelector('.what').textContent = what;
    $('bootLog').appendChild(li);
    const t0 = performance.now();
    return {
      // detail: the numbers that came out of it (shown dimmer after the name)
      done: (detail) => {
        li.className = '';
        if (detail) { const i = document.createElement('i'); i.textContent = ` · ${detail}`; li.querySelector('.what').appendChild(i); }
        li.querySelector('.ok').textContent = 'OK';
        const ms = performance.now() - t0;
        li.querySelector('.ms').textContent = ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
        // ?memlog=1: how much JavaScript memory each step of the loading leaves in use (a check for phones)
        if (MEMLOG && performance.memory) console.info(`[ameyoru] mem after ${what}: ${(performance.memory.usedJSHeapSize / 1e6).toFixed(0)} MB`);
      },
    };
  }
  // tips under the bar while it loads, and rain running down the glass in front of the street
  bootFx() {
    const HINTS = [
      'Press V to see through your character\'s eyes, again to step back.',
      'Coins sometimes roll under the vending machines. Take a look.',
      'The rain comes and goes on its own. The streets dry slowly.',
      'Press Tab to open the town map.',
      'The cars parked along the street can be driven.',
      'The night train to Tsukino leaves from the platform above the viaduct.',
      'Press C to change character and outfit.',
    ];
    let hi = Math.floor(Math.random() * HINTS.length);
    const h = $('loadhint'); h.textContent = HINTS[hi];
    this.hintT = setInterval(() => { h.classList.add('out'); setTimeout(() => { hi = (hi + 1) % HINTS.length; h.textContent = HINTS[hi]; h.classList.remove('out'); }, 500); }, 4200);
    const cv = $('bootRain'), g = cv.getContext('2d');
    const drops = [];
    const size = () => { cv.width = innerWidth * Math.min(2, devicePixelRatio || 1); cv.height = innerHeight * Math.min(2, devicePixelRatio || 1); };
    size(); addEventListener('resize', size);
    const add = (y) => drops.push({ x: Math.random() * cv.width, y: y ?? Math.random() * cv.height, r: 1.5 + Math.random() * 4.5, v: 0, stick: Math.random() * 3 });
    for (let i = 0; i < 70; i++) add();
    let last = performance.now();
    const tick = (now) => {
      if (this.bootDone) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      g.clearRect(0, 0, cv.width, cv.height);
      if (Math.random() < 0.6) add(Math.random() * cv.height * 0.6);
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        // a drop clings, then gives way and runs, leaving a faint trail
        if ((d.stick -= dt) < 0) d.v = Math.min(900, d.v + (220 + d.r * 60) * dt);
        const y0 = d.y; d.y += d.v * dt; d.x += Math.sin(d.y * 0.02 + d.r) * d.v * dt * 0.02;
        if (d.v > 0) { g.strokeStyle = 'rgba(190,225,255,0.08)'; g.lineWidth = d.r * 0.7; g.beginPath(); g.moveTo(d.x, y0 - d.r * 4); g.lineTo(d.x, d.y); g.stroke(); }
        const gr = g.createRadialGradient(d.x - d.r * 0.3, d.y - d.r * 0.3, d.r * 0.1, d.x, d.y, d.r);
        gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.5, 'rgba(160,210,255,0.16)'); gr.addColorStop(1, 'rgba(120,180,255,0.04)');
        g.fillStyle = gr; g.beginPath(); g.arc(d.x, d.y, d.r, 0, Math.PI * 2); g.fill();
        if (d.y > cv.height + 10 || drops.length > 260) drops.splice(i, 1);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  swap(from, to) {
    $(from).classList.add('fade');
    setTimeout(() => $(from).classList.add('hidden'), 600);
    $(to).classList.remove('hidden');
  }
  showTitle() { this.bootDone = true; clearInterval(this.hintT); this.swap('loading', 'title'); }
  showHud() { this.swap('title', 'hud'); }
  // after the opening shot: the HUD comes in softly
  showHudIn() { const h = $('hud'); h.classList.remove('hidden', 'fade'); h.classList.add('enter'); setTimeout(() => h.classList.remove('enter'), 1200); }
  // the title screen's dark veil (the drone's cuts between shots fade through it)
  titleDim(k) { $('tdim').style.opacity = k.toFixed(3); }
  // the opening shot's letterbox and the street's name card
  cine(on, sub) {
    const el = $('cine');
    if (on) {
      $('cineSub').textContent = sub || ''; el.classList.remove('hidden', 'out'); $('cineCard').classList.remove('on');
      const b = el.querySelector('.cine-black'); b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';   // replay the fade from black
    }
    else { el.classList.add('out'); $('cineCard').classList.remove('on'); setTimeout(() => el.classList.add('hidden'), 1200); }
  }
  cineCard(on) { $('cineCard').classList.toggle('on', on); }
  setLocked(l) { $('hint').classList.toggle('hidden', l); }
  toggleControls() { $('controls').classList.toggle('hidden'); }
  setMuted(m) { $('mute').classList.toggle('hidden', !m); }
  toast(text) {
    const el = $('toast'); el.textContent = text; el.classList.remove('hidden', 'out');
    clearTimeout(this.toastT); this.toastT = setTimeout(() => el.classList.add('out'), 1800);
  }
  // location line: Japanese name, then "place · time · weather"
  setLoc(jp, sub) {
    if (this.locJp !== jp) { $('locJp').textContent = jp; this.locJp = jp; }
    if (this.locSub !== sub) { $('locSub').textContent = sub; this.locSub = sub; }
  }
  // fade to black, run cb at the darkest point, fade back
  // (one asked for while another is still running waits its turn — a lift pressed right after arriving still goes)
  fade(cb, hold = 0.25) {
    const el = $('fade'); if (this.fading) { this.fadeNext = [cb, hold]; return; } this.fading = true;
    el.classList.add('on');
    setTimeout(() => { cb?.(); setTimeout(() => { el.classList.remove('on'); setTimeout(() => { this.fading = false; const n = this.fadeNext; this.fadeNext = null; if (n) this.fade(...n); }, 450); }, hold * 1000); }, 420);
  }
  // a short list of choices inside the dialog box: W/S to move, E to pick
  choose(title, options, cb) {
    this.choice = { options, i: 0, cb }; this.dialogOpen = true;
    $('dialog').classList.remove('hidden');
    $('who').textContent = title; $('who').classList.toggle('hidden', !title);
    this.typing = false; this.renderChoice();
  }
  renderChoice() {
    const c = this.choice;
    $('dtext').innerHTML = c.options.map((o, i) => `<div class="opt${i === c.i ? ' sel' : ''}">${i === c.i ? '▸ ' : '&nbsp;&nbsp;'}${o}</div>`).join('');
  }
  choiceInput(up, down, pick) {
    const c = this.choice; if (!c) return false;
    if (up) { c.i = (c.i + c.options.length - 1) % c.options.length; this.renderChoice(); }
    if (down) { c.i = (c.i + 1) % c.options.length; this.renderChoice(); }
    if (pick) { this.choice = null; this.dialogOpen = false; $('dialog').classList.add('hidden'); c.cb(c.i); }
    return true;
  }
  showPrompt(text) {
    if (this.promptText !== text) { $('promptText').textContent = text; this.promptText = text; }
    $('prompt').classList.remove('hidden');
  }
  hidePrompt() { $('prompt').classList.add('hidden'); }

  openDialog(lines, onDone) {
    this.lines = lines; this.i = 0; this.onDone = onDone; this.dialogOpen = true;
    $('dialog').classList.remove('hidden');
    this.line();
  }
  line() {
    const l = this.lines[this.i];
    $('who').textContent = l.who || '';
    $('who').classList.toggle('hidden', !l.who);
    this.full = l.text; this.shown = 0; this.typing = true;
    $('dtext').textContent = '';
  }
  advance() {
    if (!this.dialogOpen) return;
    if (this.typing) { this.typing = false; $('dtext').textContent = this.full; return; }
    this.i++;
    if (this.i < this.lines.length) { this.line(); return; }
    this.dialogOpen = false;
    $('dialog').classList.add('hidden');
    const cb = this.onDone; this.onDone = null; cb?.();
  }
  update(dt) {
    if (!this.typing) return;
    this.shown += dt * 48;
    const n = Math.floor(this.shown);
    $('dtext').textContent = this.full.slice(0, n);
    if (n >= this.full.length) this.typing = false;
  }
}
