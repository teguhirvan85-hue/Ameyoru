// A Japanese commuter EMU: ribbed stainless body with a line-colour stripe, four doors a side,
// lit interiors, bogies, roof AC units, a pantograph, gangways and a cab with a destination sign.
// The head of the train is at local x = 0 and the cars trail towards −x. Rail tops are at y ≈ 0.2.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasTex, JP_FONT, LATIN_FONT } from './textures.js';

const CL = 19.5, GAP = 0.5, W = 2.9, FLOOR = 1.15, ROOF = 3.75;

function sideTexture(lit) {
  // 19.5 m mapped onto 2048 px: four door pairs, windows between, a green line stripe
  return canvasTex(2048, 256, (g, w, h) => {
    const px = w / CL;
    if (!lit) {
      g.fillStyle = '#bfc4cb'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 6) { g.fillStyle = x % 12 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'; g.fillRect(x, 0, 3, h); }
      g.fillStyle = '#2f9a4f'; g.fillRect(0, h * 0.70, w, h * 0.07);
      g.fillStyle = '#1d6b36'; g.fillRect(0, h * 0.77, w, h * 0.02);
    } else { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); }
    const doors = [2.6, 7.4, 12.1, 16.9].map((m) => m * px);
    const winY = h * 0.18, winH = h * 0.38;
    const room = (x, ww) => {
      const gr = g.createLinearGradient(0, winY, 0, winY + winH);
      gr.addColorStop(0, '#fffaf0'); gr.addColorStop(1, '#e9e2cf');
      g.fillStyle = gr; g.fillRect(x, winY, ww, winH);
      g.fillStyle = 'rgba(70,90,120,0.55)'; g.fillRect(x, winY + winH * 0.62, ww, winH * 0.38); // seat backs
      g.fillStyle = 'rgba(40,40,40,0.5)'; for (let sx = x + 8; sx < x + ww - 4; sx += 22) g.fillRect(sx, winY + 4, 2, 12); // straps
      for (let k = 0; k < Math.floor(ww / 70); k++) if (Math.random() < 0.45) { // passengers
        const cx = x + 20 + Math.random() * (ww - 40);
        g.fillStyle = 'rgba(30,26,24,0.75)'; g.beginPath(); g.arc(cx, winY + winH * 0.45, 9, 0, Math.PI * 2); g.fill();
        g.fillRect(cx - 12, winY + winH * 0.55, 24, winH * 0.45);
      }
    };
    // windows between doors
    const spans = [[0.4 * px, doors[0] - 0.75 * px], ...doors.slice(0, 3).map((d, i) => [d + 0.75 * px, doors[i + 1] - 0.75 * px]), [doors[3] + 0.75 * px, w - 0.4 * px]];
    for (const [a, b] of spans) {
      const n = b - a > 3 * px ? 2 : 1, ww = (b - a - (n - 1) * 0.15 * px) / n;
      for (let k = 0; k < n; k++) {
        const x = a + k * (ww + 0.15 * px);
        if (lit) room(x, ww); else { g.fillStyle = '#1b2230'; g.fillRect(x, winY, ww, winH); g.strokeStyle = '#7d838c'; g.lineWidth = 4; g.strokeRect(x, winY, ww, winH); }
      }
    }
    // doors with their own tall windows
    for (const d of doors) {
      const dw = 1.3 * px;
      if (!lit) { g.fillStyle = '#a9aeb6'; g.fillRect(d - dw / 2, h * 0.08, dw, h * 0.86); g.fillStyle = '#5a6068'; g.fillRect(d - 1.5, h * 0.08, 3, h * 0.86); }
      for (const s of [-1, 1]) {
        const x = d + (s < 0 ? -dw / 2 + 0.12 * px : 0.06 * px), ww = dw / 2 - 0.18 * px;
        if (lit) room(x, ww); else { g.fillStyle = '#1b2230'; g.fillRect(x, winY - 4, ww, winH + 24); }
      }
    }
  });
}

function destTexture() {
  return canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#0a0a0a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ff8a1f'; g.font = `900 30px ${JP_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('各停 星見', w / 2, h / 2 - 2);
    g.fillStyle = 'rgba(255,138,31,0.15)'; for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 1, h);
  });
}

export function buildTrain(scene, std, cars = 4) {
  const train = new THREE.Group(); train.userData.dynamic = true;
  const sideMat = new THREE.MeshStandardMaterial({ map: sideTexture(false), emissive: 0xffffff, emissiveMap: sideTexture(true), emissiveIntensity: 1.25, metalness: 0.6, roughness: 0.35 });
  const shell = std(0xc3c8cf, { metalness: 0.65, roughness: 0.3 }), roofM = std(0x9aa0a8, { metalness: 0.5, roughness: 0.5 });
  const dark = std(0x1d1f23, { roughness: 0.7 }), steel = std(0x5a5f66, { metalness: 0.7, roughness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0b1018, metalness: 0.9, roughness: 0.08 });
  const add = (geo, mat, x, y, z, parent = train) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const wheels = [];
  for (let i = 0; i < cars; i++) {
    const cx = -i * (CL + GAP) - CL / 2;
    const bodyH = ROOF - FLOOR;
    add(new THREE.BoxGeometry(CL, bodyH, W), [shell, shell, roofM, dark, sideMat, sideMat], cx, FLOOR + bodyH / 2, 0);
    add(new RoundedBoxGeometry(CL - 0.1, 0.35, W - 0.25, 2, 0.15), roofM, cx, ROOF + 0.05, 0);
    // underfloor equipment and skirts
    add(new THREE.BoxGeometry(CL - 6, 0.55, W - 0.7), dark, cx, FLOOR - 0.32, 0);
    // bogies with wheelsets on the rails (gauge ≈ 1.07 m)
    for (const bx of [-6.9, 6.9]) {
      add(new THREE.BoxGeometry(2.6, 0.35, 2.2), steel, cx + bx, 0.72, 0);
      for (const wx of [-1.05, 1.05]) for (const wz of [-0.55, 0.55]) {
        const wh = add(new THREE.CylinderGeometry(0.43, 0.43, 0.12, 18), steel, cx + bx + wx, 0.62, wz);
        wh.rotation.x = Math.PI / 2; wheels.push(wh);
      }
    }
    // roof AC units, pantograph on the second car
    for (const ax of [-5, 5]) add(new RoundedBoxGeometry(2.6, 0.38, 1.6, 2, 0.12), std(0xd2d6dc, { metalness: 0.4, roughness: 0.4 }), cx + ax, ROOF + 0.38, 0);
    if (i === 1) {
      const p0 = new THREE.Vector3(cx + 1, ROOF + 0.3, 0);
      const rod = (a, b, r = 0.03) => { const d = new THREE.Vector3().subVectors(b, a); const m = add(new THREE.CylinderGeometry(r, r, d.length(), 6), steel, 0, 0, 0); m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); };
      const knee = new THREE.Vector3(cx - 0.4, ROOF + 0.95, 0), head = new THREE.Vector3(cx + 0.6, ROOF + 1.45, 0);
      rod(p0, knee, 0.04); rod(knee, head, 0.03);
      add(new THREE.BoxGeometry(0.12, 0.06, 1.6), steel, head.x, head.y, 0);
      add(new THREE.BoxGeometry(1.2, 0.12, 0.8), dark, cx + 1, ROOF + 0.26, 0);
    }
    // gangway bellows to the next car
    if (i < cars - 1) add(new THREE.BoxGeometry(GAP + 0.1, 2.2, 1.2), dark, cx - CL / 2 - GAP / 2, FLOOR + 1.2, 0);
  }
  // cab front: windshield, destination sign, head and tail lights, coupler
  const front = 0;
  add(new THREE.BoxGeometry(0.06, 1.0, W - 0.5), glass, front + 0.02, 2.75, 0);
  const dm = add(new THREE.PlaneGeometry(0.9, 0.24), new THREE.MeshBasicMaterial({ map: destTexture(), color: new THREE.Color(1.6, 1.6, 1.6) }), front + 0.06, 3.42, 0);
  dm.rotation.y = Math.PI / 2;
  add(new THREE.BoxGeometry(0.08, 0.1, W), std(0x2f9a4f, { roughness: 0.4 }), front + 0.03, 2.1, 0);
  const headM = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.9, 3.4) });
  const tailM = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.15, 0.1) });
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.06, 0.16, 0.34), headM, front + 0.04, 1.75, s * 1.0);
  const back = -(cars * (CL + GAP) - GAP);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.06, 0.14, 0.3), tailM, back - 0.04, 1.75, s * 1.0);
  add(new THREE.BoxGeometry(0.5, 0.25, 0.3), steel, front + 0.25, 0.95, 0);
  // headlight beam
  const beam = new THREE.SpotLight(0xfff4e0, 0, 60, 0.35, 0.5, 1.2);
  beam.position.set(front + 0.5, 1.8, 0); beam.target.position.set(front + 30, 0, 0);
  train.add(beam, beam.target);
  train.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
  scene.add(train);
  train.userData = { dynamic: true, length: cars * (CL + GAP) - GAP, wheels, beam };
  return train;
}

// Overhead catenary along the track: steel poles both sides, cantilever arms, messenger + contact wires.
export function buildCatenary(scene, std, z, from, to, skip) {
  const steel = std(0x6d7279, { metalness: 0.6, roughness: 0.45 });
  const g = new THREE.Group();
  const segs = [];
  const span = 25;
  for (let x = from; x <= to; x += span) {
    if (skip(x)) continue;
    for (const s of [-1, 1]) {
      const pz = z + s * 2.6;
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.22, 6.4, 0.22), steel); pole.position.set(x, 3.2, pz); g.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 2.0), steel); arm.position.set(x, 5.9, pz - s * 1.0); g.add(arm);
    }
  }
  for (let x = from; x < to; x += span) {
    for (const [y, sag] of [[6.1, 0.35], [5.25, 0.02]]) {
      for (let i = 0; i < 10; i++) {
        const t0 = i / 10, t1 = (i + 1) / 10;
        segs.push(new THREE.Vector3(x + span * t0, y - sag * 4 * t0 * (1 - t0), z), new THREE.Vector3(x + span * t1, y - sag * 4 * t1 * (1 - t1), z));
      }
    }
    for (let i = 1; i < 5; i++) { const xx = x + (span * i) / 5, t = i / 5; segs.push(new THREE.Vector3(xx, 6.1 - 0.35 * 4 * t * (1 - t), z), new THREE.Vector3(xx, 5.25, z)); }
  }
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(segs), new THREE.LineBasicMaterial({ color: 0x0a0b0d })));
  scene.add(g);
  return g;
}
