// VRoid characters come as many separate skinned meshes (every hair strand is its own mesh: 70–100 per character,
// each one a draw call) although they share ~20 materials and one skeleton. This merges the meshes that draw the
// same way (same material, same parent, same skeleton and bind pose, no blend shapes) into one. Nothing looks
// different. Meshes with blend shapes (face expressions) are left alone.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const sig = (m) => m.elements.map((v) => v.toFixed(5)).join(',');

export function mergeVRM(root) {
  const groups = new Map();
  root.traverse((o) => {
    if (!o.isSkinnedMesh || !o.skeleton || o.morphTargetInfluences) return;
    const mat = [].concat(o.material).find((m) => m.visible !== false);
    if (!mat) return;
    const g = o.geometry, attrs = Object.keys(g.attributes).sort().join(',');
    const key = [o.parent?.uuid, mat.uuid, attrs, !!g.index, o.skeleton.uuid, sig(o.bindMatrix), sig(o.matrix), o.bindMode, o.renderOrder].join('|');
    if (!groups.has(key)) groups.set(key, { mat, list: [] });
    groups.get(key).list.push(o);
  });
  let before = 0, after = 0;
  for (const { mat, list } of groups.values()) {
    before += list.length;
    if (list.length < 2) { after += list.length; continue; }
    const geos = list.map((o) => { const g = o.geometry.clone(); g.morphAttributes = {}; g.clearGroups(); return g; });
    let merged = null;
    try { merged = mergeGeometries(geos, false); } catch { merged = null; }
    geos.forEach((g) => g.dispose());
    if (!merged) { after += list.length; continue; }
    const a = list[0], m = new THREE.SkinnedMesh(merged, mat);
    m.name = `${a.name}_merged`;
    m.position.copy(a.position); m.quaternion.copy(a.quaternion); m.scale.copy(a.scale);
    m.bindMode = a.bindMode; m.bind(a.skeleton, a.bindMatrix);
    m.castShadow = a.castShadow; m.receiveShadow = a.receiveShadow; m.renderOrder = a.renderOrder; m.frustumCulled = a.frustumCulled;
    m.layers.mask = a.layers.mask;
    a.parent.add(m);
    for (const o of list) { o.parent.remove(o); o.geometry.dispose(); }
    after++;
  }
  return { before, after };
}
