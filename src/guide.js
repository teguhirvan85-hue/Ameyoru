// The route on the ground: chevrons along the next ~40 m of the way to your mark, a soft pulse running through
// them towards it, and a column of light standing on the mark itself, seen over the roofs from anywhere in town.
import * as THREE from 'three';

const N = 18, GAP = 2.4;

export function makeGuide(scene, groundY) {
  // a flat chevron, pointing +z
  const sh = new THREE.Shape();
  sh.moveTo(0, 0.42); sh.lineTo(0.42, -0.05); sh.lineTo(0.28, -0.2); sh.lineTo(0, 0.12); sh.lineTo(-0.28, -0.2); sh.lineTo(-0.42, -0.05); sh.closePath();
  // laid flat its tip would point to −z: turned round so it points +z, the way the route's heading assumes
  const geo = new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2).rotateY(Math.PI).scale(1.7, 1, 1.7);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffb547, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, toneMapped: false });
  const chev = new THREE.InstancedMesh(geo, mat, N);
  chev.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
  chev.frustumCulled = false; chev.renderOrder = 4; chev.userData.dynamic = true; chev.count = 0;
  scene.add(chev);
  // the beacon: a tall soft column, brightest at the foot
  const bm = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    uniforms: { uK: { value: 1 }, uT: { value: 0 } },
    vertexShader: 'varying vec2 vUv; varying float vFace; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vFace = abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz))); gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform float uK, uT; varying vec2 vUv; varying float vFace;
      void main(){ float a = pow(1.0 - vUv.y, 2.2) * (0.55 + 0.45 * sin(vUv.y * 40.0 - uT * 3.0) * 0.3 + 0.45);
        a *= smoothstep(0.0, 0.7, vFace);   // soft at the column's silhouette, from whichever side you see it
        gl_FragColor = vec4(vec3(1.0, 0.62, 0.2) * a * uK * 0.6, 1.0); }`,
  });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 70, 16, 1, true).translate(0, 35, 0), bm);
  beacon.frustumCulled = false; beacon.renderOrder = 5; beacon.userData.dynamic = true; beacon.visible = false;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffb547, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
  ring.position.y = 0.04; beacon.add(ring);
  scene.add(beacon);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), c = new THREE.Color();
  let t = 0;
  return {
    objects: [chev, beacon],
    // route: points from you to the mark (or null); show: false hides it all (title, pause, indoors elsewhere)
    update(dt, route, mark, p, show = true) {
      t += dt;
      beacon.visible = !!mark && show;
      if (beacon.visible) {
        beacon.position.set(mark.x, groundY(mark.x, mark.z, 1), mark.z);
        // fades as you arrive, so it doesn't swallow the picture up close
        const d = Math.hypot(p.x - mark.x, p.z - mark.z);
        bm.uniforms.uK.value = THREE.MathUtils.clamp((d - 3) / 12, 0.15, 1); bm.uniforms.uT.value = t;
        ring.scale.setScalar(1 + Math.sin(t * 3) * 0.08);
        // wider far away, so it still reads as a column of light from across town (not a hairline)
        const w = Math.max(1, d / 30); beacon.scale.set(w, 1, w); ring.scale.multiplyScalar(1 / w);
      }
      chev.count = 0;
      if (!show || !route || route.length < 2) return;
      // walk the polyline from just ahead of you, dropping a chevron every GAP metres
      let seg = 0, along = 1.6, n = 0;
      let ax = route[0].x, az = route[0].z;
      while (n < N && seg < route.length - 1) {
        const bx = route[seg + 1].x, bz = route[seg + 1].z, L = Math.hypot(bx - ax, bz - az);
        if (along > L) { along -= L; ax = bx; az = bz; seg++; continue; }
        const k = along / L, x = ax + (bx - ax) * k, z = az + (bz - az) * k;
        q.setFromAxisAngle(up, Math.atan2(bx - ax, bz - az));
        v.set(x, groundY(x, z, 1) + 0.07, z);
        m4.compose(v, q, one); chev.setMatrixAt(n, m4);
        // fade out with distance; a brighter pulse travels along towards the mark
        const fade = 1 - 0.7 * n / N, pulse = 0.55 + 0.45 * Math.max(0, Math.sin(n * 0.9 - t * 5));
        c.setRGB(1, 0.71, 0.28).multiplyScalar(fade * pulse * 1.4); chev.setColorAt(n, c);
        n++; along += GAP;
      }
      chev.count = n;
      chev.instanceMatrix.needsUpdate = true; chev.instanceColor.needsUpdate = true;
    },
  };
}
