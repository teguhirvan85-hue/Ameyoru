// Dressing for the real vehicle models (assets.js): what the files don't carry. A company livery on the box
// truck's sides, and soft lamp glows (head, tail, amber hazards) for models whose lamps aren't separate
// materials, so they still light up at night. Glows are additive: black — invisible — when off.
import * as THREE from 'three';
import * as TX from './textures.js';
import { LIVERY, liveryTex } from './trucks.js';

// per model, in its own frame (faces +z, ground y = 0): lamp centres as [x from the middle, height], and for
// the truck the box side panel (x, z from–to, y from–to)
const DRESS = {
  isuzu_elf: { head: [0.68, 0.5], tail: [0.72, 0.62], box: { x: 0.805, z0: -2.92, z1: 1.42, y0: 0.86, y1: 2.08 } },
  daihatsu_cast: { head: [0.55, 0.74], tail: [0.6, 0.86] },
  wagonr: { head: [0.55, 0.8], tail: [0.58, 0.95] },
  carry_pickup: { head: [0.6, 0.62], tail: [0.66, 0.55] },
  carry_minivan: { head: [0.55, 0.7], tail: [0.62, 0.72] },
  hiace_2013: { amber: [[0.78, 0.95, 1], [0.78, 1.0, -1]] },
  jpn_taxi: { amber: [[0.7, 0.86, 1], [0.66, 1.0, -1]] },
};

let gTex = null;
// lamp glows show at dusk and night only (main.js sets this from the daylight)
let night = 1;
export function setVehicleNight(n) { night = n; }
const glowMat = (c) => new THREE.MeshBasicMaterial({ map: gTex, color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });

export function dressVehicle(car, key, { livery = null } = {}) {
  const d = DRESS[key]; if (!d) return car;
  gTex ??= TX.glow();
  const { L } = car.userData;
  const quad = (mat, x, y, z, w, h, back) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z); if (back) m.rotation.y = Math.PI; m.renderOrder = 7; car.add(m); return m;
  };
  // head and tail glows: they follow the car's own light switch (setLights)
  if (d.head) {
    const head = glowMat(new THREE.Color(0, 0, 0)), tail = glowMat(new THREE.Color(0, 0, 0));
    head.userData.mutable = tail.userData.mutable = true;
    for (const s of [-1, 1]) {
      quad(head, s * d.head[0], d.head[1], L / 2 + 0.03, 0.42, 0.3);
      quad(tail, s * d.tail[0], d.tail[1], -L / 2 - 0.03, 0.3, 0.3, true);
    }
    const set0 = car.userData.setLights;
    car.userData.setLights = (k) => {
      set0?.(k);
      head.color.setRGB(0.9, 0.85, 0.7).multiplyScalar(k > 0.5 ? night : 0);
      tail.color.setRGB(0.5, 0.03, 0.02).multiplyScalar(k * (0.25 + 0.75 * night));
    };
  }
  // hazards: amber glows at the four corners (parked vehicles blink them)
  const amber = glowMat(new THREE.Color(0, 0, 0)); amber.userData.mutable = true;
  const corners = d.amber ?? [[d.head[0], d.head[1], 1], [d.tail[0], d.tail[1], -1]];
  for (const [x, y, end] of corners) for (const s of [-1, 1]) quad(amber, s * x, y, end * (L / 2 + 0.04), 0.22, 0.22, end < 0);
  car.userData.amber = amber;
  // the box truck's company livery on both sides of the box
  if (d.box && livery !== null) {
    const b = d.box, tex = liveryTex(LIVERY[livery % LIVERY.length]);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0.2, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(b.z1 - b.z0, b.y1 - b.y0), mat);
      m.position.set(s * b.x, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
      // facing outwards, the lettering reads left to right from either side
      m.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
      m.castShadow = false; m.receiveShadow = true; car.add(m);
    }
  }
  return car;
}
