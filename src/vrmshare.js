// The townsfolk are a handful of VRoid models used many times over (standing characters in npcs.js, pedestrians in
// walkers.js). Each copy is parsed from the file on its own, which would give every copy its own textures; here
// every copy of a model takes the textures of the first one parsed, so the GPU holds each model's textures once.
const FIRST = new Map();   // model name → the first copy's materials, in traversal order (merging keeps the objects)
const matsOf = (root) => { const out = []; root.traverse((o) => { if (o.isMesh) out.push(...(Array.isArray(o.material) ? o.material : [o.material])); }); return out; };

// MToon keeps its textures in uniforms (the named properties are getters onto them), so swap there too.
export function shareModelTextures(name, root) {
  const mb = matsOf(root), ma = FIRST.get(name);
  if (!ma) { FIRST.set(name, mb); return; }
  if (ma.length !== mb.length) return;
  mb.forEach((m, i) => {
    const src = ma[i];
    for (const [k, u] of Object.entries(m.uniforms || {})) {
      const t = u?.value, st = src.uniforms?.[k]?.value;
      if (t?.isTexture && st?.isTexture && t !== st) { u.value = st; t.dispose(); }
    }
    for (const k of ['map', 'normalMap', 'emissiveMap']) if (m[k]?.isTexture && src[k]?.isTexture && m[k] !== src[k]) { const t = m[k]; m[k] = src[k]; t.dispose(); }
    m.needsUpdate = true;
  });
}
