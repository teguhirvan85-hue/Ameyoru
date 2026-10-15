// Keeps the VRM characters from burning white. Their toon (MToon) shading takes a street lamp at arm's length
// at full strength, so pale clothes and faces went past white and then bloomed. This rolls the brightest part
// off softly — anything below the knee is untouched — under a ceiling that main.js sets from the time of day:
// below the bloom threshold at night, looser by day and indoors, where the bloom starts higher.
export const TONE = { uCeil: { value: 0.8 } };

const ROLL = `
  {
    float tmCeil = uCeil, tmKnee = uCeil * 0.6;
    float tmM = max(gl_FragColor.r, max(gl_FragColor.g, gl_FragColor.b));
    if (tmM > tmKnee) {
      float tmOut = tmKnee + (tmCeil - tmKnee) * (1.0 - exp(-(tmM - tmKnee) / (tmCeil - tmKnee)));
      gl_FragColor.rgb *= tmOut / tmM;
    }
  }
  #include <tonemapping_fragment>`;

const done = new WeakSet();   // (not userData: a cloned material copies that, but not the patch)
export function tameHighlights(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m?.isMToonMaterial || done.has(m)) continue;
      done.add(m);
      // MToon has its own hook (it adds its defines there): run it first, then add the roll-off
      const prev = m.onBeforeCompile;
      m.onBeforeCompile = (sh, renderer) => {
        prev?.call(m, sh, renderer);
        sh.uniforms.uCeil = TONE.uCeil;
        sh.fragmentShader = 'uniform float uCeil;\n' + sh.fragmentShader.replace('#include <tonemapping_fragment>', ROLL);
      };
      // MToon keys its shader programs itself: mark the patched ones so they don't share a program with plain MToon
      const key = m.customProgramCacheKey;
      m.customProgramCacheKey = () => `${key.call(m)}|tame`;
      m.needsUpdate = true;
    }
  });
}
