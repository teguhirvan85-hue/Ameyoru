// Diagnostics for phones (?diag=1 in the address): a small readout in the corner — frames per second, what's on
// the GPU (textures, geometries, shader programs), draw calls — and a note of it every second in the phone's
// storage. When Safari closes the page (out of memory) and loads it again, the loading screen shows the last note
// from before: where it was, how far in, and what was on the GPU at that moment.
const ON = new URLSearchParams(location.search).has('diag');
const KEY = 'ameyoru.diag';

export function makeDiag(renderer) {
  if (!ON) return { stage() {}, frame() {} };
  // count draw calls over the whole frame (every pass), not just the last one
  renderer.info.autoReset = false;
  const t0 = performance.now();
  let stage = 'start', frames = 0, fps = 0, last = performance.now(), calls = 0, tris = 0;
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:99;padding:6px 8px;border-radius:8px;background:rgba(8,10,16,.82);color:#e9eef8;font:600 11px/1.35 ui-monospace,Menlo,monospace;white-space:pre;pointer-events:none';
  document.body.appendChild(box);

  // what the previous visit left behind (if it didn't end normally, that's where it died)
  let prev = null;
  try { prev = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* storage unavailable */ }
  if (prev && !prev.clean) {
    const p = document.createElement('div');
    p.style.cssText = 'position:fixed;left:6px;top:6px;right:6px;z-index:99;padding:8px 10px;border-radius:10px;background:rgba(120,20,40,.9);color:#fff;font:600 12px/1.4 ui-monospace,Menlo,monospace;white-space:pre-wrap';
    p.textContent = `LAST VISIT ENDED SUDDENLY\n${line(prev)}`;
    document.body.appendChild(p);
  }
  addEventListener('pagehide', () => { try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); s.clean = true; localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* */ } });

  function line(s) {
    return `stage ${s.stage} · ${s.t}s in · ${s.fps} fps\ntextures ${s.tex} · geometries ${s.geo} · programs ${s.prog}\ndraw calls ${s.calls} · triangles ${s.tris}k · ${s.ua}`;
  }
  function note() {
    const i = renderer.info, s = {
      stage, t: Math.round((performance.now() - t0) / 1000), fps,
      tex: i.memory.textures, geo: i.memory.geometries, prog: i.programs?.length ?? 0,
      calls, tris: Math.round(tris / 1000),
      ua: (navigator.userAgent.match(/iPhone OS [\d_]+|Android [\d.]+|Mac OS X [\d_]+/) || [''])[0], clean: false,
    };
    box.textContent = line(s);
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage full or unavailable */ }
  }
  setInterval(note, 1000);
  return {
    stage(name) { stage = name; note(); },
    // called after each frame: keep its totals for the readout, then start counting the next one
    frame() { calls = renderer.info.render.calls; tris = renderer.info.render.triangles; renderer.info.reset(); frames++; const now = performance.now(); if (now - last >= 1000) { fps = Math.round(frames * 1000 / (now - last)); frames = 0; last = now; } },
  };
}
