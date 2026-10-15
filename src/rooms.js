// Rooms you can walk into, and the doors that lead there.
// A room is a box you can be inside: the camera stays within it, rain is muffled, the HUD shows its name.
import * as THREE from 'three';

export const ROOMS = [];
export function roomAt(p) {
  for (const r of ROOMS) if (p.x > r.minX && p.x < r.maxX && p.z > r.minZ && p.z < r.maxZ && p.y > r.y - 0.8 && p.y < r.ceil) return r;
  return null;
}

// door kinds: 'auto' (glass halves slide apart when you come close), 'slide' (one panel, E to open),
// 'swing' (hinged, E to open). Manual doors close themselves once you've walked away.
export class Doors {
  constructor(W) { this.W = W; this.list = []; }

  // x, z: centre of the doorway; along: 'z' when the doorway runs along z (shop fronts), 'x' otherwise;
  // w: opening width; face: +1/-1, which side is "outside" along the normal axis
  add({ kind = 'slide', x, z, y = 0.15, w = 1.0, h = 2.1, along = 'z', face = 1, mat, frame, label = 'the door', sound = 'slide', lock = null, interact = true, solid = true }) {
    const { scene, colliders, interactables } = this.W;
    const g = new THREE.Group(); g.position.set(x, y, z); if (along === 'x') g.rotation.y = Math.PI / 2; scene.add(g); g.userData.dynamic = true;
    const glass = mat ?? new THREE.MeshStandardMaterial({ color: 0xdfeaf5, transparent: true, opacity: 0.22, roughness: 0.03, metalness: 0.6, depthWrite: false });
    const fr = frame ?? new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.35, metalness: 0.8 });
    const panel = (pw) => {
      const p = new THREE.Group();
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.03, h - 0.08, pw - 0.06), glass); m.position.y = h / 2; p.add(m);
      for (const [py, ph] of [[0.04, 0.08], [h - 0.03, 0.06]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, ph, pw), fr); b.position.y = py; p.add(b); }
      for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, h, 0.04), fr); b.position.set(0, h / 2, s * (pw / 2 - 0.02)); p.add(b); }
      g.add(p); return p;
    };
    const d = { kind, open: 0, want: 0, x, z, y, w, idle: 0, sound, lock, panels: [], label };
    if (kind === 'auto') { d.panels = [panel(w / 2), panel(w / 2)]; }
    else if (kind === 'slide') { d.panels = [panel(w)]; d.panels[0].position.x = -0.04 * face; }
    else {
      const hinge = new THREE.Group(); hinge.position.z = -w / 2; g.add(hinge);
      const p = panel(w); g.remove(p); hinge.add(p); p.position.z = w / 2; d.panels = [hinge];
    }
    d.layout = () => {
      const o = d.open;
      if (kind === 'auto') { d.panels[0].position.z = -w / 4 - o * (w / 2 - 0.05); d.panels[1].position.z = w / 4 + o * (w / 2 - 0.05); }
      else if (kind === 'slide') d.panels[0].position.z = o * (w - 0.1);
      else d.panels[0].rotation.y = -o * 1.45 * face;
    };
    d.layout();
    const nx = along === 'z' ? 0.12 : w / 2, nz = along === 'z' ? w / 2 : 0.12;
    if (solid) colliders.push({ minX: x - nx, maxX: x + nx, minZ: z - nz, maxZ: z + nz, active: () => d.open < 0.75 });
    if (kind !== 'auto' && interact) {
      interactables.push({
        pos: new THREE.Vector3(x, y - 0.15, z), r: 1.35, door: true,
        get label() { return d.open > 0.5 ? `Close ${label}` : `Open ${label}`; },
        action: (api) => {
          if (d.want === 0 && d.lock && !d.lock()) return d.lockedLines;
          d.want = d.want ? 0 : 1; d.idle = 0; api.sound.door(d.sound, d.want);
          return null;
        },
      });
    }
    d.group = g;
    this.list.push(d);
    return d;
  }

  update(dt, p, snd) {
    for (const d of this.list) {
      const dist = Math.hypot(p.x - d.x, p.z - d.z), level = Math.abs(p.y - d.y) < 1.5;
      if (d.kind === 'auto') {
        const want = dist < 2.0 && level ? 1 : 0;
        if (want && !d.want) snd?.door?.(['gate', 'konbini'].includes(d.sound) ? d.sound : 'auto', 1);
        d.want = want;
      } else if (d.want && dist > 2.6) {
        // walked off and left it open: it slides shut behind you after a moment
        d.idle += dt;
        if (d.idle > 2.5) { d.want = 0; d.idle = 0; if (dist < 25) snd?.door?.(d.sound, 0); }
      } else d.idle = 0;
      const sp = d.kind === 'auto' ? 2.6 : 3.2;
      const o = d.open + Math.sign(d.want - d.open) * Math.min(Math.abs(d.want - d.open), dt * sp);
      if (o !== d.open) { d.open = o; d.layout(); }
    }
  }
}
