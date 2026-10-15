// Freezing the static world into few meshes. The city is built from thousands of separate meshes (each one is a
// draw call the browser has to issue every frame, which is what makes it stutter). Here we watch every mesh for a
// few seconds (begin → finish); whatever didn't move, change or hide is merged with the others that share its
// material in the same 40 m cell. Nothing looks different; there are just far fewer draw calls.
// Anything that changes only when you interact with it must be marked userData.dynamic = true (on it or a parent).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const CELL = 40;
const BASE_COMPILE = THREE.Material.prototype.onBeforeCompile;
const tex = (t) => (t ? t.uuid : '-');
// two materials that would draw the same: merging may use either. Materials that code changes later
// (userData.mutable, custom shaders, anything that changed while we watched) only merge with themselves.
function matKey(m) {
  if (m.userData.mutable || m.isShaderMaterial || m.onBeforeCompile !== BASE_COMPILE) return m.uuid;
  const c = (x) => (x?.isColor ? x.getHexString() : '-');
  return [m.type, m.blending, m.transparent, c(m.color), c(m.emissive), m.emissiveIntensity, m.roughness, m.metalness, m.opacity, m.side, m.flatShading, m.vertexColors,
    m.fog, m.toneMapped, m.wireframe, m.depthWrite, m.depthTest, m.polygonOffset, m.polygonOffsetFactor, m.polygonOffsetUnits, m.alphaTest,
    tex(m.map), tex(m.normalMap), m.normalScale?.x, tex(m.roughnessMap), tex(m.metalnessMap), tex(m.aoMap), m.aoMapIntensity, tex(m.emissiveMap),
    tex(m.alphaMap), tex(m.envMap), m.envMapIntensity, tex(m.lightMap), tex(m.bumpMap), tex(m.displacementMap)].join('|');
}

export function makeFreezer(scene, { cullAdd } = {}) {
  let snap = null;
  const shown = (o) => { for (let p = o; p; p = p.parent) { if (!p.visible) return false; if (p === scene) return true; } return false; };
  const eligible = (o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.morphTargetInfluences) return false;
    if (Array.isArray(o.material) || !o.material) return false;
    // see-through things only when the order they're drawn in can't matter: additive glow that doesn't write depth
    if (o.material.transparent && !(o.material.blending === THREE.AdditiveBlending && !o.material.depthWrite)) return false;
    // cars (they drive), anything marked dynamic; and inside a group only if that group is known to be static
    // (a group may move later — a cat's head turning when you come close — even if it stood still while we watched)
    let staticGroup = o.parent === scene;
    for (let p = o; p && p !== scene; p = p.parent) {
      if (p.userData.dynamic || p.userData.L || p.userData.real) return false;
      if (p !== o && p.userData.static) staticGroup = true;
    }
    return staticGroup && shown(o);
  };

  function begin() {
    snap = new Map();
    scene.updateMatrixWorld(true);
    scene.traverse((o) => { if (eligible(o)) snap.set(o, { m: o.matrixWorld.clone(), mat: o.material, key: matKey(o.material) }); });
  }

  function finish() {
    if (!snap) return 0;
    scene.updateMatrixWorld(true);
    const groups = new Map(), v = new THREE.Vector3();
    for (const [o, s] of snap) {
      if (!o.parent || !eligible(o) || o.material !== s.mat || !o.matrixWorld.equals(s.m)) continue;
      // a material that changed while we watched is animated: only merge with its own instance
      const mk = matKey(o.material), key0 = mk === s.key ? mk : o.material.uuid;
      const g = o.geometry;
      if (!g.attributes.position) continue;
      if (!g.boundingSphere) g.computeBoundingSphere();
      v.copy(g.boundingSphere.center).applyMatrix4(o.matrixWorld);
      // which attributes it carries decides what it can merge with
      const attrs = ['position', 'normal', 'uv', 'color'].filter((k) => g.attributes[k]);
      if (o.material.vertexColors && !g.attributes.color) continue;
      const key = `${key0}|${attrs.join(',')}|${Math.floor(v.x / CELL)},${Math.floor(v.z / CELL)}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}|${o.renderOrder}`;
      if (!groups.has(key)) groups.set(key, { mat: o.material, attrs, list: [] });
      groups.get(key).list.push(o);
    }
    let removed = 0, made = 0;
    for (const { mat, attrs, list } of groups.values()) {
      if (list.length < 2) continue;
      const geos = [];
      for (const o of list) {
        let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        for (const k of Object.keys(g.attributes)) if (!attrs.includes(k)) g.deleteAttribute(k);
        g.morphAttributes = {};
        g.applyMatrix4(o.matrixWorld);
        geos.push(g);
      }
      let merged = null;
      try { merged = mergeGeometries(geos, false); } catch { merged = null; }
      for (const g of geos) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const m = new THREE.Mesh(merged, mat);
      m.castShadow = list[0].castShadow; m.receiveShadow = list[0].receiveShadow; m.renderOrder = list[0].renderOrder;
      m.matrixAutoUpdate = false; m.matrixWorldAutoUpdate = false; m.updateMatrix(); m.updateMatrixWorld(true);
      scene.add(m); cullAdd?.(m); made++;
      for (const o of list) { o.parent.remove(o); removed++; }
    }
    // whatever stood still but wasn't merged: stop recomputing its matrix every frame (and don't visit it)
    for (const [o, s] of snap) {
      if (o.parent !== scene || o.children.length || !o.matrixWorld.equals(s.m)) continue;
      let dyn = false; for (let p = o; p && p !== scene; p = p.parent) if (p.userData.dynamic) dyn = true;
      if (dyn) continue;
      o.matrixAutoUpdate = false; o.matrixWorldAutoUpdate = false;
    }
    snap = null;
    return { removed, made };
  }
  return { begin, finish, get watching() { return !!snap; } };
}
