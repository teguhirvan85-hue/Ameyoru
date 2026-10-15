// The GPS: a 1 m grid over the town (walkable = pavements, roads, squares, rooms on the ground; minus anything
// solid), A* across it, then pulled straight wherever there's a clear line, so the route reads as a few clean
// legs along the streets.
import { WALK, DRIVE } from './district.js';

const X0 = -135, X1 = 200, Z0 = -214, Z1 = 240;
const NX = X1 - X0, NZ = Z1 - Z0;

export function makeRouter(world) {
  const open = new Uint8Array(NX * NZ);
  const idx = (i, j) => j * NX + i;
  const ground = (r) => (r.minY === undefined || r.minY < 0.5) && (r.maxY === undefined || r.maxY > 0.5);
  const fill = (r, v) => {
    const i0 = Math.max(0, Math.ceil(r.minX - X0)), i1 = Math.min(NX - 1, Math.floor(r.maxX - X0 - 0.001));
    const j0 = Math.max(0, Math.ceil(r.minZ - Z0)), j1 = Math.min(NZ - 1, Math.floor(r.maxZ - Z0 - 0.001));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) open[idx(i, j)] = v;
  };
  for (const r of WALK) if (ground(r)) fill(r, 1);
  for (const r of DRIVE) if (ground(r)) fill(r, 1);
  // solid things (walls, blocks, posts): a cell is shut if its centre is inside one (thin posts are left: you walk round them)
  for (const c of world.colliders) {
    if (c.active || c.minY !== undefined) continue;
    if (c.maxX - c.minX < 0.6 && c.maxZ - c.minZ < 0.6) continue;
    const i0 = Math.max(0, Math.ceil(c.minX - X0 - 0.5)), i1 = Math.min(NX - 1, Math.floor(c.maxX - X0 - 0.5));
    const j0 = Math.max(0, Math.ceil(c.minZ - Z0 - 0.5)), j1 = Math.min(NZ - 1, Math.floor(c.maxZ - Z0 - 0.5));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) open[idx(i, j)] = 0;
  }
  const cellOf = (x, z) => [Math.floor(x - X0), Math.floor(z - Z0)];
  // keep only what joins up with the street: a room behind walls (or a pocket between colliders) would be a
  // dead end the search wastes itself on, so a mark there snaps out to the pavement in front instead
  {
    const [si, sj] = cellOf(0, 0), q = new Int32Array(NX * NZ), reach = new Uint8Array(NX * NZ);
    let h = 0, n = 0;
    if (open[idx(si, sj)]) { q[n++] = idx(si, sj); reach[idx(si, sj)] = 1; }
    while (h < n) {
      const c = q[h++], i = c % NX, j = (c / NX) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= NX || b >= NZ) continue;
        const k = idx(a, b);
        if (open[k] && !reach[k]) { reach[k] = 1; q[n++] = k; }
      }
    }
    open.set(reach);
  }
  const ok = (i, j) => i >= 0 && j >= 0 && i < NX && j < NZ && open[idx(i, j)] === 1;
  // nearest open cell (a mark dropped on a roof or inside a block snaps to the street beside it)
  function snap(x, z, R = 10) {
    const [ci, cj] = cellOf(x, z);
    if (ok(ci, cj)) return [ci, cj];
    for (let r = 1; r <= R; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      if (ok(ci + di, cj + dj)) return [ci + di, cj + dj];
    }
    return null;
  }
  // a straight line between two points stays on open cells
  function clear(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.5);
    for (let k = 1; k < n; k++) { const [i, j] = cellOf(ax + (bx - ax) * k / n, az + (bz - az) * k / n); if (!ok(i, j)) return false; }
    return true;
  }
  // A* (8 neighbours, octile distance) with a binary heap on typed arrays
  const g = new Float32Array(NX * NZ), from = new Int32Array(NX * NZ), seen = new Uint32Array(NX * NZ);
  let stamp = 0;
  const heap = new Int32Array(NX * NZ), hf = new Float32Array(NX * NZ);
  function find(a, b) {
    const s = snap(a.x, a.z), e = snap(b.x, b.z);
    if (!s || !e) return null;
    stamp++;
    const S = idx(s[0], s[1]), E = idx(e[0], e[1]), ei = e[0], ej = e[1];
    const hcost = (i, j) => { const dx = Math.abs(i - ei), dz = Math.abs(j - ej); return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz); };
    let n = 0;
    const push = (c, f) => { let k = n++; while (k > 0) { const p = (k - 1) >> 1; if (hf[p] <= f) break; heap[k] = heap[p]; hf[k] = hf[p]; k = p; } heap[k] = c; hf[k] = f; };
    const pop = () => {
      const top = heap[0], lc = heap[--n], lf = hf[n]; let k = 0;
      for (;;) { let c = 2 * k + 1; if (c >= n) break; if (c + 1 < n && hf[c + 1] < hf[c]) c++; if (hf[c] >= lf) break; heap[k] = heap[c]; hf[k] = hf[c]; k = c; }
      heap[k] = lc; hf[k] = lf; return top;
    };
    seen[S] = stamp; g[S] = 0; from[S] = -1; push(S, hcost(s[0], s[1]));
    let iter = 0, got = false;
    while (n > 0 && iter++ < 60000) {
      const c = pop();
      if (c === E) { got = true; break; }
      const ci = c % NX, cj = (c / NX) | 0, gc = g[c];
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const i = ci + di, j = cj + dj;
        if (!ok(i, j)) continue;
        if (di && dj && (!ok(ci + di, cj) || !ok(ci, cj + dj))) continue;   // no cutting corners
        const nb = idx(i, j), ng = gc + (di && dj ? 1.4142 : 1);
        if (seen[nb] === stamp && g[nb] <= ng) continue;
        seen[nb] = stamp; g[nb] = ng; from[nb] = c;
        push(nb, ng + hcost(i, j));
      }
    }
    if (!got) return null;
    const pts = [];
    for (let c = E; c !== -1; c = from[c]) pts.push({ x: (c % NX) + X0 + 0.5, z: ((c / NX) | 0) + Z0 + 0.5 });
    pts.reverse();
    pts[0] = { x: a.x, z: a.z };
    // pull it straight: keep only the corners a straight line can't skip
    const out = [pts[0]];
    let k = 0;
    while (k < pts.length - 1) {
      let far = k + 1;
      for (let m = pts.length - 1; m > k + 1; m--) if (clear(pts[k].x, pts[k].z, pts[m].x, pts[m].z)) { far = m; break; }
      out.push(pts[far]); k = far;
    }
    return out;
  }
  return { find, inMap: (x, z) => x > X0 && x < X1 && z > Z0 && z < Z1 };
}
