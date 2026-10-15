// Rigging for the car models: their wheels and doors are not separate parts, so we cut them out of the
// meshes by position. Wheels become four pivots (front ones can steer, all can spin around their own
// centre); the driver's door (right side — Japanese cars are right-hand drive) gets a hinge at its front edge.
import * as THREE from 'three';
import { flipWinding } from './vehmerge.js';

const KEEP = ['position', 'normal', 'uv'];

// cfg: { r (wheel radius), half (half tyre width), door: length of the front door, belt: top of the door as a share of height }
export function rigCar(root, cfg = {}) {
  root.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  const W = size.x, L = size.z, H = size.y;
  const r = cfg.r ?? 0.32, half = cfg.half ?? 0.15;

  // wheel centres: from the lowest vertices (the tyre contact patches), one cluster per corner
  let wheels = cfg.centres;
  if (!wheels) {
    const acc = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]], v = new THREE.Vector3();
    root.traverse((o) => {
      if (!o.isMesh) return;
      const p = o.geometry.attributes.position, step = Math.max(1, Math.floor(p.count / 40000));
      for (let i = 0; i < p.count; i += step) {
        v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
        if (v.y > 0.05 || Math.abs(v.x) < W * 0.2) continue;
        const q = (v.x > 0 ? 1 : 0) + (v.z > 0 ? 2 : 0);
        acc[q][0] += v.x; acc[q][1] += v.z; acc[q][2]++;
      }
    });
    wheels = acc.map(([x, z, n], q) => n > 20
      ? { x: x / n, z: z / n }
      : { x: (q & 1 ? 1 : -1) * (W / 2 - 0.2), z: (q & 2 ? 1 : -1) * (L / 2 - 0.85) });
  }
  wheels = wheels.map((w) => ({ ...w, y: r, front: w.z > 0 }));
  const frontZ = Math.max(...wheels.map((w) => w.z));

  // the driver's door: outer skin of the right-hand (−x) side — Japanese cars are right-hand drive, and the
  // getting-in/out clips are the mirrored Mixamo ones — from just behind the front wheel arch
  const dz1 = frontZ - r - 0.1, dz0 = dz1 - (cfg.door ?? 1.05), dy0 = 0.25, dy1 = H * (cfg.belt ?? 0.9), dx = -(W / 2 - (cfg.depth ?? 0.24));

  const pivots = wheels.map((w, i) => {
    const steer = new THREE.Group(); steer.name = `rig_ws_${i}_${w.front ? 'F' : 'R'}`; steer.position.set(w.x, w.y, w.z);
    const spin = new THREE.Group(); spin.name = `rig_wr_${i}`; steer.add(spin); root.add(steer);
    return { steer, spin, w };
  });
  const hinge = new THREE.Group(); hinge.name = 'rig_door'; hinge.position.set(-W / 2, (dy0 + dy1) / 2, dz1); root.add(hinge);
  root.updateMatrixWorld(true);

  // pre-made wheels (the Corolla's): just move them under their pivots
  const made = [];
  root.traverse((o) => { if (o.userData.rigWheel) made.push(o); });
  for (const o of made) {
    const p = pivots.reduce((a, b) => (a.steer.position.distanceTo(o.position) < b.steer.position.distanceTo(o.position) ? a : b));
    o.position.sub(p.steer.position); p.spin.add(o);
  }

  root.updateMatrixWorld(true);
  // cut every other mesh: triangles inside a tyre cylinder go to that wheel, those in the door box to the door
  const meshes = [];
  const underMade = (o) => { for (let q = o; q; q = q.parent) if (q.userData.rigWheel) return true; return false; };
  root.traverse((o) => { if (o.isMesh && !underMade(o)) meshes.push(o); });
  const nm = new THREE.Matrix3();
  // wheels are taken as whole connected pieces ("islands": tyre, rim, disc, hub), so nothing of a tyre is left
  // behind on the body. An island belongs to a wheel when it is centred on that axle and no bigger than a wheel.
  const prep = meshes.map((mesh) => {
    const src = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    for (const k of Object.keys(src.attributes)) if (!KEEP.includes(k)) src.deleteAttribute(k);
    if (!src.attributes.normal) src.computeVertexNormals();
    const P = src.attributes.position, M = mesh.matrixWorld, n = P.count / 3;
    const wp = new Float32Array(P.count * 3), v = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(M); wp[i * 3] = v.x; wp[i * 3 + 1] = v.y; wp[i * 3 + 2] = v.z; }
    // union-find over triangles that share a vertex position
    const par = new Int32Array(n); for (let t = 0; t < n; t++) par[t] = t;
    const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    const seen = new Map();
    for (let i = 0; i < P.count; i++) {
      const key = Math.round(wp[i * 3] * 4000) * 73856093 ^ Math.round(wp[i * 3 + 1] * 4000) * 19349663 ^ Math.round(wp[i * 3 + 2] * 4000) * 83492791;
      const t = (i / 3) | 0, o = seen.get(key);
      if (o === undefined) seen.set(key, t); else { const ra = find(o), rb = find(t); if (ra !== rb) par[ra] = rb; }
    }
    // island bounds
    const isl = new Map();
    for (let t = 0; t < n; t++) {
      const root_ = find(t);
      let b = isl.get(root_);
      if (!b) { b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]; isl.set(root_, b); }
      for (let j = 0; j < 3; j++) { const i = (t * 3 + j) * 3; for (let e = 0; e < 3; e++) { b[e] = Math.min(b[e], wp[i + e]); b[e + 3] = Math.max(b[e + 3], wp[i + e]); } }
    }
    return { mesh, src, M, n, wp, find, isl };
  });
  // pick each wheel's islands; the biggest one (the tyre) tells the true centre and radius
  const wheelIsl = pivots.map(() => []);
  if (!made.length) for (const pm of prep) for (const [id, b] of pm.isl) {
    const cx = (b[0] + b[3]) / 2, cy = (b[1] + b[4]) / 2, cz = (b[2] + b[5]) / 2, ext = Math.max(b[4] - b[1], b[5] - b[2]);
    if (ext > r * 2.6 || b[3] - b[0] > half * 2.6) continue;
    for (let i = 0; i < 4; i++) {
      const w = pivots[i].w;
      if (Math.abs(cx - w.x) < half + 0.06 && Math.hypot(cy - w.y, cz - w.z) < r * 0.45) { wheelIsl[i].push({ pm, id, ext, cy, cz }); break; }
    }
  }
  let rReal = r;
  wheelIsl.forEach((list, i) => {
    if (!list.length) return;
    const big = list.reduce((x, y) => (y.ext > x.ext ? y : x));
    pivots[i].steer.position.y = big.cy; pivots[i].steer.position.z = big.cz; pivots[i].w.y = big.cy; pivots[i].w.z = big.cz;
    rReal = big.cy;   // the tyre touches the ground, so its centre height is its radius
  });
  root.updateMatrixWorld(true);
  const cen = new THREE.Vector3();
  for (const pm of prep) {
    const { mesh, src, M, n, wp, find } = pm;
    nm.getNormalMatrix(M);
    const P = src.attributes.position;
    const owner = new Map();
    wheelIsl.forEach((list, i) => list.forEach((e) => { if (e.pm === pm) owner.set(e.id, i); }));
    const dest = new Int8Array(n); // -1 body, 0..3 wheel, 4 door
    let moved = 0;
    for (let t = 0; t < n; t++) {
      let d = owner.get(find(t)) ?? -1;
      if (d < 0) {
        const i = t * 9;
        cen.set((wp[i] + wp[i + 3] + wp[i + 6]) / 3, (wp[i + 1] + wp[i + 4] + wp[i + 7]) / 3, (wp[i + 2] + wp[i + 5] + wp[i + 8]) / 3);
        if (cen.x < dx && cen.z > dz0 && cen.z < dz1 && cen.y > dy0 && cen.y < dy1) d = 4;
      }
      dest[t] = d; if (d >= 0) moved++;
    }
    if (!moved) continue;
    // rebuild: the body keeps what's left (in its own space), the parts move to their pivots (in pivot space)
    const take = (want, toPivot) => {
      const out = {};
      for (const k of Object.keys(src.attributes)) out[k] = [];
      const pv = new THREE.Vector3(), nv = new THREE.Vector3();
      for (let t = 0; t < n; t++) {
        if (dest[t] !== want) continue;
        for (let j = 0; j < 3; j++) {
          const vi = t * 3 + j;
          for (const k of Object.keys(src.attributes)) {
            const at = src.attributes[k];
            if (toPivot && k === 'position') { pv.fromBufferAttribute(at, vi).applyMatrix4(M).sub(toPivot); out[k].push(pv.x, pv.y, pv.z); }
            else if (toPivot && k === 'normal') { nv.fromBufferAttribute(at, vi).applyMatrix3(nm).normalize(); out[k].push(nv.x, nv.y, nv.z); }
            else for (let e = 0; e < at.itemSize; e++) out[k].push(at.array[vi * at.itemSize + e]);
          }
        }
      }
      const g = new THREE.BufferGeometry();
      for (const k of Object.keys(out)) g.setAttribute(k, new THREE.Float32BufferAttribute(out[k], src.attributes[k].itemSize));
      return g;
    };
    const part = (want, parent) => {
      if (!dest.some((d) => d === want)) return;
      const pos = parent.getWorldPosition(new THREE.Vector3());
      const g = take(want, pos);
      if (M.determinant() < 0) flipWinding(g); // a mirrored source part, baked: keep its faces outward
      const m = new THREE.Mesh(g, mesh.material);
      Object.assign(m.userData, mesh.userData); m.renderOrder = mesh.renderOrder; m.castShadow = mesh.castShadow; m.receiveShadow = mesh.receiveShadow;
      parent.add(m);
    };
    for (let i = 0; i < 4; i++) part(i, pivots[i].spin);
    part(4, hinge);
    mesh.geometry = take(-1, null);
  }
  root.userData.rigInfo = { r: rReal, seat: cfg.seat ?? 0.45, driverX: -(W / 2 - (cfg.driverIn ?? 0.55)), driverZ: (dz0 + dz1) / 2 - 0.25, doorZ: (dz0 + dz1) / 2 };
}

// after cloning a rigged car: find its pivots by name
export function findRig(car) {
  const wheels = [];
  car.traverse((o) => { if (o.name?.startsWith('rig_ws_')) wheels.push({ steer: o, spin: o.children.find((c) => c.name?.startsWith('rig_wr_')), front: o.name.endsWith('F') }); });
  return { wheels, door: car.getObjectByName('rig_door'), spin: 0 };
}
