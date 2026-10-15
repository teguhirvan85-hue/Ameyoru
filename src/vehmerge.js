// A vehicle is many small meshes (a real car model: up to ~140), each one a draw call. This folds every mesh that
// never moves relative to the body into one mesh per material, leaving alone what does move (wheels, steering
// pivots, the driver's door) and anything marked userData.keep. Same look, a fraction of the draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Model files often carry many copies of one material (same colour, same maps); two meshes whose materials match
// in every setting can share one. Materials the game changes later (lamps, head/tail lights) keep their identity.
const sigOf = new WeakMap();
function signature(m) {
  if (sigOf.has(m)) return sigOf.get(m);
  const j = m.toJSON({ textures: {}, images: {} }); delete j.uuid; delete j.name;
  const sig = JSON.stringify(j) + (m.onBeforeCompile?.toString() ?? '') + (m.customProgramCacheKey?.() ?? '');
  sigOf.set(m, sig);
  return sig;
}

// a mirrored part (negative scale) baked into plain geometry turns its triangles inside out: swap two corners
// of each so they face the right way again
export function flipWinding(g) {
  for (const a of Object.values(g.attributes)) {
    const n = a.itemSize, arr = a.array;
    for (let t = 0; t < a.count; t += 3) for (let e = 0; e < n; e++) {
      const i1 = (t + 1) * n + e, i2 = (t + 2) * n + e, tmp = arr[i1]; arr[i1] = arr[i2]; arr[i2] = tmp;
    }
    a.needsUpdate = true;
  }
}

export function mergeVehicle(car, keep = []) {
  const units = new Set(keep.filter(Boolean));
  car.traverse((o) => { if (o !== car && o.userData.keep) units.add(o); });
  const live = new Set(['head', 'tail', 'amber'].map((k) => car.userData[k]).filter(Boolean));
  car.updateMatrixWorld(true);
  // the body, then each moving part on its own (merged relative to its own pivot, so it still turns as before)
  for (const u of [car, ...units]) mergeUnit(u, units, live);
  return car;
}

function mergeUnit(root, units, live) {
  const inv = root.matrixWorld.clone().invert();
  const groups = new Map(), drop = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || Array.isArray(o.material) || o.morphTargetInfluences) return;
    // a mesh belongs to the nearest moving part above it
    for (let p = o; p && p !== root; p = p.parent) if (units.has(p)) return;
    const g = o.geometry, attrs = ['position', 'normal', 'uv'].filter((k) => g.attributes[k]);
    if (!g.attributes.position || !g.attributes.normal) return;
    const mk = live.has(o.material) || o.material.userData.mutable ? o.material.uuid : signature(o.material);
    const key = `${mk}|${attrs.join(',')}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}|${o.renderOrder}|${o.visible ? 1 : 0}`;
    if (!groups.has(key)) groups.set(key, { mat: o.material, attrs, list: [], mesh: o });
    groups.get(key).list.push(o);
  });
  const m4 = new THREE.Matrix4();
  for (const { mat, attrs, list, mesh } of groups.values()) {
    if (list.length < 2) continue;
    const geos = list.map((o) => {
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (!attrs.includes(k)) g.deleteAttribute(k);
      g.morphAttributes = {};
      m4.multiplyMatrices(inv, o.matrixWorld); g.applyMatrix4(m4);
      if (m4.determinant() < 0) flipWinding(g);
      return g;
    });
    let merged = null;
    try { merged = mergeGeometries(geos, false); } catch { merged = null; }
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = mesh.castShadow; m.receiveShadow = mesh.receiveShadow; m.renderOrder = mesh.renderOrder; m.visible = mesh.visible;
    m.userData.tail = mesh.userData.tail; m.userData.lamp = mesh.userData.lamp;
    root.add(m);
    drop.push(...list);
  }
  for (const o of drop) o.parent?.remove(o);
}
