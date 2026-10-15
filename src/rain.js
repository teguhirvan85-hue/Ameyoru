// Falling streaks that follow the camera, ripple rings and splash droplets where drops land,
// drips running off edges (awnings, roofs, balconies), and gusts that change the slant.
import * as THREE from 'three';

export class Rain {
  constructor(scene, groundY, count = 7000) {
    this.count = count; this.groundY = groundY;
    this.W = 36; this.H = 15; this.D = 36; this.wind = 1.4;
    this.drops = new Float32Array(count * 4);
    this.pos = new Float32Array(count * 6);
    const shade = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      this.drops.set([(Math.random() - 0.5) * this.W, Math.random() * this.H, (Math.random() - 0.5) * this.D, 15 + Math.random() * 8], i * 4);
      shade[i * 2] = 0.25; shade[i * 2 + 1] = 1;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('shade', new THREE.BufferAttribute(shade, 1));
    // drops catch the light: brighten streaks that pass close to the nearest lamps
    this.lights = Array.from({ length: 8 }, () => new THREE.Vector3(0, -100, 0));
    this.lines = new THREE.LineSegments(geo, new THREE.ShaderMaterial({
      uniforms: { lamps: { value: this.lights }, fogDensity: { value: 0.03 } },
      vertexShader: `
        attribute float shade; uniform vec3 lamps[8]; uniform float fogDensity;
        varying vec3 vCol;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          float L = 0.0;
          for (int i = 0; i < 8; i++) { vec3 d = wp.xyz - lamps[i]; L += 1.0 / (1.0 + dot(d, d) * 0.35); }
          vec4 mv = viewMatrix * wp;
          float dist = -mv.z;
          float fog = exp(-fogDensity * fogDensity * dist * dist);
          vCol = shade * fog * (vec3(0.13, 0.16, 0.22) + vec3(1.0, 0.8, 0.55) * L * 0.9);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying vec3 vCol; void main() { gl_FragColor = vec4(vCol, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.lines.frustumCulled = false; this.lines.renderOrder = 10;
    this.k = 1;
    scene.add(this.lines);

    this.R = 160;
    const ring = new THREE.RingGeometry(0.82, 1, 20); ring.rotateX(-Math.PI / 2);
    this.rip = new THREE.InstancedMesh(ring, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), this.R);
    this.rip.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rip.frustumCulled = false; this.rip.renderOrder = 11;
    this.ripData = [];
    const black = new THREE.Color(0, 0, 0);
    for (let i = 0; i < this.R; i++) { this.ripData.push({ x: 0, y: 0, z: 0, age: 1 }); this.rip.setColorAt(i, black); }
    this.next = 0;
    this.m4 = new THREE.Matrix4(); this.c = new THREE.Color();
    scene.add(this.rip);

    // surfaces drops land on before the ground: { x0, x1, z0, z1, y, splash }
    this.surfaces = [];
    // edges water drips from: { x, y, z0, z1, rate }
    this.edges = [];

    // splash droplets: tiny points thrown up and out, pulled down by gravity
    this.SP = 700;
    this.sp = new Float32Array(this.SP * 7); // x y z vx vy vz life
    this.spPos = new Float32Array(this.SP * 3);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.spPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.splashPts = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xaebfdc, size: 0.028, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.splashPts.frustumCulled = false; this.splashPts.renderOrder = 11;
    scene.add(this.splashPts);
    for (let i = 0; i < this.SP; i++) { this.sp[i * 7 + 1] = -100; this.sp[i * 7 + 6] = 0; }
    this.spNext = 0;

    // drips: short streaks falling from edges
    this.DP = 260;
    this.dp = new Float32Array(this.DP * 6); // x y z vy groundY alive
    this.dpPos = new Float32Array(this.DP * 6);
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(this.dpPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.drips = new THREE.LineSegments(dg, new THREE.LineBasicMaterial({ color: 0x9fb4d8, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.drips.frustumCulled = false; this.drips.renderOrder = 10;
    scene.add(this.drips);
    this.dpNext = 0; this.t = 0;
  }

  splashAt(x, y, z, n = 4) {
    for (let k = 0; k < n; k++) {
      const o = this.spNext * 7, a = Math.random() * Math.PI * 2, sp = 0.25 + Math.random() * 0.6;
      this.sp[o] = x; this.sp[o + 1] = y; this.sp[o + 2] = z;
      this.sp[o + 3] = Math.cos(a) * sp; this.sp[o + 4] = 0.6 + Math.random() * 1.0; this.sp[o + 5] = Math.sin(a) * sp;
      this.sp[o + 6] = 0.25 + Math.random() * 0.2;
      this.spNext = (this.spNext + 1) % this.SP;
    }
  }

  // 0..1 share of the streaks that are drawn (weather: downpour, drizzle, mist)
  setIntensity(k) { this.k = k; this.lines.geometry.setDrawRange(0, Math.floor(this.count * k) * 2); }
  setFog(d) { this.lines.material.uniforms.fogDensity.value = d; }

  update(dt, center, lights) {
    if (lights) lights.forEach((v, i) => this.lights[i].copy(v));
    this.t += dt;
    // gusts: the slant drifts and now and then swings harder
    this.wind = 1.4 + Math.sin(this.t * 0.23) * 0.9 + Math.sin(this.t * 0.71) * 0.4 + Math.max(0, Math.sin(this.t * 0.13) - 0.7) * 4;
    const { W, H, D, drops, pos, wind } = this;
    const hw = W / 2, hd = D / 2;
    const near = this.surfaces.filter((r) => Math.abs((r.x0 + r.x1) / 2 - center.x) < 22 && Math.abs((r.z0 + r.z1) / 2 - center.z) < 22);
    // rooms nearby: drops that find themselves inside one are not drawn (no rain falling through a shop)
    const rooms = (this.covers || []).filter((r) => center.x > r.minX - 22 && center.x < r.maxX + 22 && center.z > r.minZ - 22 && center.z < r.maxZ + 22);
    const n = Math.floor(this.count * this.k);
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      let x = drops[o], y = drops[o + 1], z = drops[o + 2];
      const s = drops[o + 3];
      const py = y;
      y -= s * dt; x += wind * dt;
      if (x - center.x > hw) x -= W; else if (x - center.x < -hw) x += W;
      if (z - center.z > hd) z -= D; else if (z - center.z < -hd) z += D;
      const dx = x - center.x, dz = z - center.z, close = dx * dx + dz * dz < 220;
      let hit = false;
      if (close) {
        for (const r of near) {
          if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1 && py >= r.y && y < r.y) {
            if (r.splash && Math.random() < 0.35) this.splashAt(x, r.y + 0.01, z, 2 + (Math.random() * 2 | 0));
            y += H; hit = true; break;
          }
        }
      }
      const gy = this.groundY(x, z);
      if (!hit && y < gy) {
        if (close) {
          if (Math.random() < 0.3) this.spawn(x, gy + 0.012, z);
          if (Math.random() < 0.18) this.splashAt(x, gy + 0.01, z, 2 + (Math.random() * 3 | 0));
        }
        y += H;
      }
      drops[o] = x; drops[o + 1] = y; drops[o + 2] = z;
      const len = s * 0.028, p = i * 6;
      let hidden = false;
      for (const r of rooms) if (x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ && y < r.ceil + 0.3 && y > r.y - 1) { hidden = true; break; }
      if (hidden) { pos[p + 1] = pos[p + 4] = -100; continue; }
      pos[p] = x - wind * 0.028; pos[p + 1] = y + len; pos[p + 2] = z;
      pos[p + 3] = x; pos[p + 4] = y; pos[p + 5] = z;
    }
    this.lines.geometry.attributes.position.needsUpdate = true;

    const { m4, c } = this;
    for (let i = 0; i < this.R; i++) {
      const r = this.ripData[i];
      if (r.age >= 1) continue;
      r.age += dt * 2.2;
      const k = Math.min(r.age, 1), s = 0.02 + k * 0.17;
      m4.makeScale(s, 1, s).setPosition(r.x, r.y, r.z);
      this.rip.setMatrixAt(i, m4);
      const v = (1 - k) * 0.22;
      this.rip.setColorAt(i, c.setRGB(v * 0.8, v * 0.9, v));
    }
    this.rip.instanceMatrix.needsUpdate = true;
    this.rip.instanceColor.needsUpdate = true;

    // drips off edges near the camera
    for (const e of this.edges) {
      // edges run along z ({ x, z0, z1 }) or, with alongX, along x ({ z, x0, x1 })
      const ax = e.alongX, mx = ax ? (e.x0 + e.x1) / 2 : e.x, mz = ax ? e.z : (e.z0 + e.z1) / 2;
      if (Math.abs(mz - center.z) > 20 || Math.abs(mx - center.x) > 20) continue;
      let n = (ax ? e.x1 - e.x0 : e.z1 - e.z0) * e.rate * dt;
      while (n > 0) {
        if (Math.random() < n) {
          const o = this.dpNext * 6, j = (Math.random() - 0.5) * 0.04;
          this.dp[o] = ax ? e.x0 + Math.random() * (e.x1 - e.x0) : e.x + j; this.dp[o + 1] = e.y; this.dp[o + 2] = ax ? e.z + j : e.z0 + Math.random() * (e.z1 - e.z0);
          this.dp[o + 3] = -0.5; this.dp[o + 4] = this.groundY(this.dp[o], this.dp[o + 2]); this.dp[o + 5] = 1;
          this.dpNext = (this.dpNext + 1) % this.DP;
        }
        n -= 1;
      }
    }
    const dpa = this.dpPos;
    for (let i = 0; i < this.DP; i++) {
      const o = i * 6, q = i * 6;
      if (!this.dp[o + 5]) { dpa[q + 1] = dpa[q + 4] = -100; continue; }
      this.dp[o + 3] -= 9.8 * dt;
      this.dp[o + 1] += this.dp[o + 3] * dt;
      if (this.dp[o + 1] <= this.dp[o + 4]) {
        this.dp[o + 5] = 0;
        this.splashAt(this.dp[o], this.dp[o + 4] + 0.01, this.dp[o + 2], 3);
        this.spawn(this.dp[o], this.dp[o + 4] + 0.012, this.dp[o + 2]);
        continue;
      }
      const len = Math.min(0.25, -this.dp[o + 3] * 0.03);
      dpa[q] = this.dp[o]; dpa[q + 1] = this.dp[o + 1] + len; dpa[q + 2] = this.dp[o + 2];
      dpa[q + 3] = this.dp[o]; dpa[q + 4] = this.dp[o + 1]; dpa[q + 5] = this.dp[o + 2];
    }
    this.drips.geometry.attributes.position.needsUpdate = true;

    // splash droplets
    const spp = this.spPos;
    for (let i = 0; i < this.SP; i++) {
      const o = i * 7;
      if (this.sp[o + 6] <= 0) { spp[i * 3 + 1] = -100; continue; }
      this.sp[o + 6] -= dt;
      this.sp[o + 4] -= 9.8 * dt;
      this.sp[o] += this.sp[o + 3] * dt; this.sp[o + 1] += this.sp[o + 4] * dt; this.sp[o + 2] += this.sp[o + 5] * dt;
      spp[i * 3] = this.sp[o]; spp[i * 3 + 1] = this.sp[o + 1]; spp[i * 3 + 2] = this.sp[o + 2];
    }
    this.splashPts.geometry.attributes.position.needsUpdate = true;
  }

  splash(x, y, z) { for (let i = 0; i < 3; i++) this.spawn(x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3); }

  spawn(x, y, z) {
    const r = this.ripData[this.next];
    r.x = x; r.y = y; r.z = z; r.age = 0;
    this.next = (this.next + 1) % this.R;
  }
}
