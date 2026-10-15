// Getting into a parked car and driving it. Getting in: the driver's door swings open, you sit down at the
// wheel, the door shuts and the engine starts; getting out runs the other way. While driving: a bicycle model
// (throttle, brake/reverse, steering) with the front wheels turning and all four rolling, bumping off anything
// solid, kept to the road, pavements, the cross street and the coin-parking lots.
import * as THREE from 'three';
import { DRIVE } from './district.js';

const WB = 2.6, MAX_V = 15, BOOST_V = 24, REV_V = -5;
const smooth = (t) => t * t * (3 - 2 * t);

export function makeDriving({ world, scene, groundY, walk }) {
  // thr/brk: the pedals, eased (no on/off jumps); pitch/roll: the body on its springs; acc: physics time not yet run;
  // impact: how hard the last knock was (the camera shakes with it)
  const st = { car: null, v: 0, steer: 0, braking: false, phase: null, t: 0, view: 'chase', thr: 0, brk: 0, acc: 0,
    pitch: 0, pitchV: 0, roll: 0, rollV: 0, vPrev: 0, yawRate: 0, impact: 0, scrape: 0 };
  const beam = new THREE.SpotLight(0xfff1d6, 0, 40, 0.45, 0.55, 1.3);
  scene.add(beam, beam.target);
  const dir = new THREE.Vector2(), tmp = new THREE.Vector3();
  // y: how high the car is — the expressway's deck and ramp only count up there, the streets only down here
  const inDrive = (x, z, y = 0) => DRIVE.some((r) => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ && y >= (r.minY ?? -1) && y <= (r.maxY ?? 4));
  const inWalk = (x, z) => walk.some((b) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ && (b.minY ?? -9) <= 0.5 && (b.maxY ?? 9) >= 0.1);
  const seat = { x: 0, z: 0, y: 0, yaw: 0, out: { x: 0, z: 0, y: 0 }, snap: true, pose: 'car' };

  for (const car of world.drivable) {
    world.interactables.push({ pos: car.position, r: Math.max(2.2, car.userData.L * 0.55), label: 'Get in & drive', hidden: () => !!st.car, action: (api) => { enter(car, api); return null; } });
  }

  // car-local → world
  const toWorld = (car, lx, ly, lz, out = new THREE.Vector3()) => out.set(lx, ly, lz).applyQuaternion(car.quaternion).add(car.position);
  const info = (car) => car.userData.rigInfo || { seat: 0.45, driverX: -(car.userData.W / 2 - 0.55), driverZ: -0.2, doorZ: 0, r: 0.32 };
  // where you stand beside the driver's (right-hand) door
  const doorSpot = (car) => { const i = info(car); return toWorld(car, -(car.userData.W / 2 + 0.55), 0, i.doorZ); };
  // with the Mixamo getting-in/out clips: where the character's root must stand so the clip's hips land on the seat.
  // hip = the clip's hips (character frame), yaw = the clip's facing at that moment, heading = the car's
  const rootFor = (car, hip, yaw, out) => {
    const i = info(car), seatP = toWorld(car, i.driverX, 0, i.driverZ, out), h0 = car.rotation.y - yaw;
    out.x = seatP.x - (hip.x * Math.cos(h0) + hip.z * Math.sin(h0));
    out.z = seatP.z - (-hip.x * Math.sin(h0) + hip.z * Math.cos(h0));
    return h0;
  };
  // the root's height that puts the clip's seated hips on the seat cushion
  const seatedY = (car, hip) => car.position.y + info(car).seat + 0.08 - hip.y;
  const placeSeat = (car) => {
    const i = info(car), p = toWorld(car, i.driverX, 0, i.driverZ, tmp);
    seat.x = p.x; seat.z = p.z; seat.y = car.position.y + i.seat; seat.yaw = car.rotation.y;
  };
  // the door swings out on its front hinge (it's on the car's right, so a positive turn opens it)
  const setDoor = (car, k) => { const d = car.userData.rig?.door; if (d) d.rotation.y = 1.05 * smooth(Math.max(0, Math.min(1, k))); };
  // how open the door is at time t: swings open over [o0, o0 + od], shut over [c0, c0 + cd]
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const doorAt = (t, o0, od, c0, cd) => clamp01((t - o0) / od) * (1 - clamp01((t - c0) / cd));
  // when the clips' hands open and shut the door (shares of the clip's length, read off the hand paths)
  const DOOR = { carIn: [0.18, 0.12, 0.655, 0.11], carOut: [0.08, 0.14, 0.76, 0.1] };
  const clipped = (api) => !!(api.player.specialInfo?.carIn && api.player.specialInfo?.carOut);
  // each seated clip's hips (and turn) at the moment they should be on the seat
  const REF = { carIn: ['end', 'yaw1'], drive: ['start', 'yaw0'], carOut: ['start', 'yaw0'] };
  const ref = (api, k) => { const I = api.player.specialInfo[k]; return { H: I[REF[k][0]], yaw: I[REF[k][1]] }; };
  // the seated hips while one clip crossfades into the next (the mixer blends the hips the same way)
  const seatedRef = (api) => {
    const P = api.player, b = ref(api, P.special);
    if (!P.prevSpecial || !REF[P.prevSpecial]) return b;
    const a = ref(api, P.prevSpecial), w = P.fadeK;
    return { H: { x: a.H.x + (b.H.x - a.H.x) * w, y: a.H.y + (b.H.y - a.H.y) * w, z: a.H.z + (b.H.z - a.H.z) * w }, yaw: a.yaw + (b.yaw - a.yaw) * w };
  };

  function enter(car, api) {
    st.car = car; st.v = 0; st.steer = 0; st.phase = 'enter'; st.t = 0;
    Object.assign(st, { thr: 0, brk: 0, acc: 0, phys: null, pitch: 0, pitchV: 0, roll: 0, rollV: 0, vPrev: 0, yawRate: 0, impact: 0 });
    car.rotation.order = 'YXZ';   // yaw first, then the body's pitch and roll about its own axes
    world.uncull(car);
    if (clipped(api)) {
      // walk up, open the door, turn and drop into the seat: the clip does the body, we keep it lined up with the car
      st.dur = api.player.playSpecial('carIn');
      const I = api.player.specialInfo.carIn;
      api.player.heading = rootFor(car, I.end, I.yaw1, tmp); api.player.group.position.set(tmp.x, groundY(tmp.x, tmp.z, 0.5), tmp.z);
    } else {
      const p = doorSpot(car);
      api.player.group.position.set(p.x, groundY(p.x, p.z, 0.5), p.z);
      api.player.heading = car.rotation.y + Math.PI / 2;
      api.sound.door('car', 1);
    }
  }

  function exit(api) {
    if (!st.car || st.phase) return;
    st.phase = 'exit'; st.t = 0; st.v = 0;
    api.sound.setEngine?.(0);
    if (clipped(api)) st.dur = api.player.playSpecial('carOut', { fade: 0.35 });
    else api.sound.door('car', 1);
  }

  function finishExit(api) {
    const car = st.car;
    for (const w of car.userData.rig?.wheels || []) w.steer.visible = true;
    car.userData.setLights?.(0.2);
    car.rotation.x = 0; car.rotation.z = 0;   // the body settles level
    beam.intensity = 0; st.car = null; st.phase = null; st.v = 0;
    api.player.group.visible = true;
  }

  // keep the car's collider and rain-catching roof on it
  function follow(car) {
    const { L, W } = car.userData, h = car.rotation.y, c = Math.abs(Math.cos(h)), s = Math.abs(Math.sin(h));
    const hx = (W * c + L * s) / 2, hz = (W * s + L * c) / 2, x = car.position.x, z = car.position.z;
    if (car.userData.col) Object.assign(car.userData.col, { minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz });
    if (car.userData.rs) Object.assign(car.userData.rs, { x0: x - hx * 0.6, x1: x + hx * 0.6, z0: z - hz * 0.6, z1: z + hz * 0.6 });
  }

  // three circles along the car push it out of anything solid; returns true if it hit something
  function collide(car) {
    const { L, W } = car.userData, r = W / 2 + 0.05, own = car.userData.col;
    let hit = false;
    for (const k of [0.3, -0.3, 0]) {
      const cx = car.position.x + dir.x * L * k, cz = car.position.z + dir.y * L * k;
      for (const c of world.colliders) {
        // only what's at the car's own level: up on the expressway the town below doesn't count
        const cy = car.position.y;
        if (c === own || (c.active && !c.active())) continue;
        if (c.minY === undefined ? cy > 4 : (cy + 1.2 < c.minY || cy > c.maxY)) continue;
        const px = Math.max(c.minX, Math.min(cx, c.maxX)), pz = Math.max(c.minZ, Math.min(cz, c.maxZ));
        const dx = cx - px, dz = cz - pz, d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        const d = Math.sqrt(d2) || 1e-4, push = r - d;
        car.position.x += (dx / d) * push; car.position.z += (dz / d) * push; hit = true;
      }
    }
    return hit;
  }

  // the driver (you) sits in the seat, the wheels roll and steer
  function pose(car, dt, api) {
    if (REF[api.player.special]) {
      // hands on the wheel (the driving clip, or the getting-in clip's last frame); kept lined up as the car moves
      const R = seatedRef(api);
      api.player.heading = rootFor(car, R.H, R.yaw, tmp);
      api.player.group.position.set(tmp.x, seatedY(car, R.H), tmp.z);
    } else { placeSeat(car); api.player.sit(seat); }
    api.player.update(dt, null, false, {});
    const rig = car.userData.rig;
    if (rig) {
      rig.spin += (st.v * dt) / info(car).r;
      // from the cabin the front tyres would show through the model's open dashboard, so they hide there
      const inside = st.view === 'inside' && !st.phase;
      for (const w of rig.wheels) { w.spin.rotation.x = rig.spin; if (w.front) { w.steer.rotation.y = st.steer; w.steer.visible = !inside; } }
    }
  }

  return {
    get car() { return st.car; },
    get speed() { return st.v; },
    get view() { return st.view; },
    get busy() { return !!st.phase; },
    get steer() { return st.steer; },
    get yawRate() { return st.yawRate; },
    // the last knock, handed to the camera once
    takeImpact() { const k = st.impact; st.impact = 0; return k; },
    // in-car view: the camera at the driver's eyes
    eye(out) { const car = st.car, i = info(car); return toWorld(car, i.driverX * 0.92, i.seat + 0.6, i.driverZ + 0.18, out); },
    exit,
    // returns true while you're in (or getting in or out of) a car
    update(dt, input, api, daylight = 0) {
      const car = st.car; if (!car) return false;
      const L = car.userData.L;
      // ---- getting in: door opens (0–0.5 s), you sit (0.5–1.0), door shuts (1.0–1.4), engine starts
      if (st.phase === 'enter' && api.player.special === 'carIn') {
        // the clip: walk up (0–1.2 s), door opens, turn and sit (to ~4 s), door shuts
        st.t += dt;
        const D = st.dur, I = api.player.specialInfo.carIn;
        // the door opens as the hand pulls the handle, and shuts as the hand pulls it in; the thud lands as it closes
        const [o0, od, c0, cd] = DOOR.carIn;
        if (st.t > D * o0 && !st.opened) { st.opened = true; api.sound.door('car', 1); }
        if (st.t > D * (c0 + cd) - 0.1 && !st.shut) { st.shut = true; api.sound.door('car', 0); }
        setDoor(car, doorAt(st.t, D * o0, D * od, D * c0, D * cd));
        const h0 = rootFor(car, I.end, I.yaw1, tmp), down = smooth(Math.min(1, Math.max(0, (st.t - D * 0.48) / (D * 0.3))));
        api.player.heading = h0;
        api.player.group.position.set(tmp.x, groundY(tmp.x, tmp.z, 0.5) * (1 - down) + seatedY(car, I.end) * down, tmp.z);
        api.player.update(dt, null, false, {});
        if (st.t >= D) {
          setDoor(car, 0); st.phase = null; st.opened = st.shut = false;
          // settle into the driving loop (hands working the wheel)
          if (api.player.specialInfo.drive) api.player.playSpecial('drive', { fade: 0.6 });
          car.userData.setLights?.(1.4);
          api.sound.burst({ freq: 120, q: 0.7, dur: 0.6, gain: 0.4 });
          api.toast(`W gas · S brake/reverse · A/D steer · Shift boost · Q horn · V camera · R radio (${api.sound.music?.stationName ?? ''}) · E get out`);
        }
        return true;
      }
      if (st.phase === 'exit' && api.player.special === 'carOut') {
        // the clip: door opens, swing the legs out and stand (to ~3 s), step away, door shuts behind you
        st.t += dt;
        const D = st.dur, O = api.player.specialInfo.carOut;
        const [o0, od, c0, cd] = DOOR.carOut;
        if (st.t > D * o0 && !st.opened) { st.opened = true; api.sound.door('car', 1); }
        if (st.t > D * (c0 + cd) - 0.1 && !st.shut) { st.shut = true; api.sound.door('car', 0); }
        setDoor(car, doorAt(st.t, D * o0, D * od, D * c0, D * cd));
        // (the first moments crossfade out of the driving pose: blend the seated hips the same way)
        const R = seatedRef(api), h0 = rootFor(car, R.H, R.yaw, tmp), up = smooth(Math.min(1, Math.max(0, (st.t - D * 0.22) / (D * 0.3))));
        api.player.heading = h0;
        api.player.group.position.set(tmp.x, seatedY(car, R.H) * (1 - up) + groundY(tmp.x, tmp.z, 0.5) * up, tmp.z);
        api.player.update(dt, null, false, {});
        if (st.t >= D) {
          // hand back to walking where the clip left the hips, facing the way it ended
          const ex = O.end.x * Math.cos(h0) + O.end.z * Math.sin(h0), ez = -O.end.x * Math.sin(h0) + O.end.z * Math.cos(h0);
          api.player.stopSpecial();
          const x = tmp.x + ex, z = tmp.z + ez;
          api.player.group.position.set(x, groundY(x, z, 0.5), z);
          api.player.heading = h0 + O.yaw1;
          setDoor(car, 0); st.opened = st.shut = false;
          finishExit(api);
        }
        return true;
      }
      if (st.phase === 'enter') {
        st.t += dt;
        setDoor(car, doorAt(st.t, 0, 0.5, 1.0, 0.4));
        if (st.t > 0.5) { placeSeat(car); seat.snap = st.t > 1.0; api.player.sit(seat); }
        api.player.update(dt, new THREE.Vector2(), false, { colliders: [], groundY, bounds: walk, onStep: () => {} });
        if (st.t >= 1.4) {
          setDoor(car, 0); st.phase = null; seat.snap = true;
          api.sound.door('car', 0); car.userData.setLights?.(1.4);
          api.sound.burst({ freq: 120, q: 0.7, dur: 0.6, gain: 0.4 });
          api.toast(`W gas · S brake/reverse · A/D steer · Shift boost · Q horn · V camera · R radio (${api.sound.music?.stationName ?? ''}) · E get out`);
        }
        return true;
      }
      // ---- getting out: door opens, you step out beside it, door shuts
      if (st.phase === 'exit') {
        st.t += dt;
        setDoor(car, doorAt(st.t, 0, 0.45, 0.95, 0.4));
        if (st.t < 0.5) pose(car, dt, api);
        else if (api.player.seated) {
          api.player.seat = null;
          let p = doorSpot(car);
          if (!inWalk(p.x, p.z)) { const i = info(car); p = toWorld(car, car.userData.W / 2 + 0.55, 0, i.doorZ); }
          api.player.group.position.set(p.x, groundY(p.x, p.z, 0.5), p.z);
          api.player.heading = car.rotation.y - Math.PI / 2;
        }
        if (st.t >= 1.35) { setDoor(car, 0); api.sound.door('car', 0); finishExit(api); }
        return true;
      }
      if (input.hit('KeyE')) { if (car.position.y > 3) api.toast('No stopping on the expressway — take the ramp down first'); else { exit(api); return true; } }
      if (input.hit('KeyV')) st.view = st.view === 'chase' ? 'inside' : 'chase';
      if (input.hit('KeyQ')) api.sound.horn?.();
      const fwd = input.down('KeyW', 'ArrowUp'), back = input.down('KeyS', 'ArrowDown');
      const left = input.down('KeyA', 'ArrowLeft'), right = input.down('KeyD', 'ArrowRight'), boost = input.down('ShiftLeft', 'ShiftRight');
      // the pedals ease in and out (a key is a foot, not a switch)
      st.thr += ((fwd ? 1 : 0) - st.thr) * Math.min(1, dt * (fwd ? 5 : 8));
      st.brk += ((back ? 1 : 0) - st.brk) * Math.min(1, dt * (back ? 7 : 9));
      const want = (left ? 1 : 0) - (right ? 1 : 0);
      // the physics runs in fixed 1/120 s steps, whatever the frame rate: the same car at 30 or 144 fps, no judder
      const H = 1 / 120;
      st.acc = Math.min(st.acc + dt, 0.1);
      let bumped = false, scraped = false;
      // the car on screen is drawn between the last two physics steps (below); the physics carries on from where
      // it really is. Without this a frame ran 0, 1, 2 or 3 steps as the frame time wobbled: the car stuttered
      // (worst on 120/144 Hz screens, where every few frames it didn't move at all)
      let ph = st.phys;
      // (first frame, or the car was put somewhere else meanwhile: start from where it is)
      if (!ph || Math.hypot(car.position.x - ph.sx, car.position.z - ph.sz) > 0.5 || Math.abs(car.rotation.y - ph.syaw) > 0.01) ph = st.phys = { x: car.position.x, z: car.position.z, yaw: car.rotation.y, px: car.position.x, pz: car.position.z, pyaw: car.rotation.y };
      car.position.x = ph.x; car.position.z = ph.z; car.rotation.y = ph.yaw;
      while (st.acc >= H) {
        st.acc -= H;
        ph.px = car.position.x; ph.pz = car.position.z; ph.pyaw = car.rotation.y;
        const high = car.position.y > 10;   // the expressway: faster
        const top = boost ? (high ? 34 : BOOST_V) : (high ? 25 : MAX_V);
        st.braking = false;
        if (st.thr > 0.01) {
          if (st.v < 0) st.v += 12 * st.thr * H;                                          // stopping a reverse
          else st.v += (boost ? 6.6 : 5.2) * st.thr * Math.max(0, 1 - (st.v / top) ** 2) * H;  // pulls hard, then tails off near the top
        }
        if (st.brk > 0.01) {
          if (st.v > 0.3) { st.v -= 11 * st.brk * H; st.braking = true; }
          else if (st.thr < 0.01) st.v -= 3 * st.brk * H;                                  // reverse
        }
        // rolling and air resistance
        st.v -= Math.sign(st.v) * Math.min(Math.abs(st.v), (0.9 + Math.abs(st.v) * 0.045 + (st.thr < 0.01 && st.brk < 0.01 ? 0.4 : 0)) * H);
        if (st.v > top) st.v -= Math.min(st.v - top, 6 * H);   // let go of the boost: ease back down
        st.v = Math.max(REV_V, st.v);
        // steering: eases in (slower the faster you go), and back to centre on its own; less lock at speed
        const maxS = 0.55 * (1 - Math.min(0.62, Math.abs(st.v) / 28));
        const rate = want ? 3.6 - Math.min(1.6, Math.abs(st.v) * 0.07) : 4.2;
        st.steer += (want * maxS - st.steer) * Math.min(1, H * rate);
        // bicycle model, a touch of understeer at speed
        st.yawRate = (st.v / WB) * Math.tan(st.steer) / (1 + st.v * st.v * 0.0012);
        car.rotation.y += st.yawRate * H;
        const h = car.rotation.y; dir.set(Math.sin(h), Math.cos(h));
        const ox = car.position.x, oz = car.position.z;
        car.position.x += dir.x * st.v * H; car.position.z += dir.y * st.v * H;
        // off the drivable ground: slide along the edge (keep the part of the move that stays on), don't stop dead
        const cy = car.position.y;
        const ok = (x, z, dx = dir.x, dz = dir.y) => inDrive(x + dx * L * 0.4, z + dz * L * 0.4, cy) && inDrive(x - dx * L * 0.4, z - dz * L * 0.4, cy);
        if (!ok(car.position.x, car.position.z)) {
          const nx = car.position.x, nz = car.position.z;
          if (ok(nx, oz)) car.position.z = oz;
          else if (ok(ox, nz)) car.position.x = ox;
          else { car.position.x = ox; car.position.z = oz; bumped = true; }
          scraped = true;
        }
        if (collide(car)) bumped = true;
      }
      ph.x = car.position.x; ph.z = car.position.z; ph.yaw = car.rotation.y;
      { const a = st.acc / H; car.position.x = ph.px + (ph.x - ph.px) * a; car.position.z = ph.pz + (ph.z - ph.pz) * a; car.rotation.y = ph.pyaw + (ph.yaw - ph.pyaw) * a; ph.sx = car.position.x; ph.sz = car.position.z; ph.syaw = car.rotation.y; }
      // knocks: a hard hit bounces back a little and shakes the camera; a scrape along a kerb just slows you
      if (bumped) {
        const hit = Math.abs(st.v);
        st.impact = Math.max(st.impact, Math.min(1, hit / 14));
        if (hit > 6) { api.sound.burst({ freq: 220, q: 1, dur: 0.2, gain: Math.min(0.6, hit * 0.05) }); st.v *= -0.18; }
        else if (hit > 2) { api.sound.burst({ freq: 260, q: 1.2, dur: 0.12, gain: hit * 0.04 }); st.v *= 0.45; }
        else st.v *= 0.7;
      } else if (scraped) st.v *= Math.pow(0.6, dt);
      // ride the ground (curbs, the plaza step)
      const gy = groundY(car.position.x, car.position.z, car.position.y + 0.3);
      car.position.y += (gy - car.position.y) * Math.min(1, dt * (Math.abs(gy - car.position.y) < 1.5 ? 22 : 10));
      // on a slope (the ramp) the body tilts with it: the ground under the front and the back wheels
      const yF = groundY(car.position.x + dir.x * L * 0.35, car.position.z + dir.y * L * 0.35, car.position.y + 0.9);
      const yB = groundY(car.position.x - dir.x * L * 0.35, car.position.z - dir.y * L * 0.35, car.position.y + 0.9);
      st.slope = (st.slope ?? 0) + (-Math.atan2(yF - yB, L * 0.7) - (st.slope ?? 0)) * Math.min(1, dt * 12);
      // the body on its springs: the nose dips under braking and lifts when you accelerate, it leans out in turns
      const along = (st.v - st.vPrev) / Math.max(dt, 1e-3); st.vPrev = st.v;
      const pitchT = THREE.MathUtils.clamp(-along * 0.0045, -0.035, 0.045);
      const rollT = THREE.MathUtils.clamp(-st.yawRate * Math.abs(st.v) * 0.0055, -0.05, 0.05);
      const K = 90, C = 2 * Math.sqrt(K) * 0.55;   // a little under-damped: one soft settle, no wobble
      st.pitchV += (K * (pitchT - st.pitch) - C * st.pitchV) * Math.min(dt, 0.05); st.pitch += st.pitchV * Math.min(dt, 0.05);
      st.rollV += (K * (rollT - st.roll) - C * st.rollV) * Math.min(dt, 0.05); st.roll += st.rollV * Math.min(dt, 0.05);
      car.rotation.x = st.pitch + (st.slope ?? 0); car.rotation.z = st.roll;
      follow(car);
      pose(car, dt, api);
      // lights, the beam ahead, spray, engine
      car.userData.setLights?.(st.braking || (st.v < 0.2 && back) ? 2.6 : 1.4);
      tmp.set(car.position.x + dir.x * L * 0.5, 0.8, car.position.z + dir.y * L * 0.5);
      beam.position.copy(tmp); beam.target.position.set(tmp.x + dir.x * 16, 0, tmp.z + dir.y * 16);
      beam.intensity = 55 * (1 - 0.85 * daylight);
      if (Math.abs(st.v) > 3 && Math.random() < dt * Math.abs(st.v) * 2) {
        const sx = (Math.random() < 0.5 ? -0.5 : 0.5) * car.userData.W, along = -L * 0.33;
        world.fx.splash?.(car.position.x + dir.x * along + dir.y * sx, 0.03, car.position.z + dir.y * along - dir.x * sx, 3 + Math.floor(Math.abs(st.v) * 0.5));
      }
      api.sound.setEngine?.(Math.max(0.05, Math.abs(st.v) / BOOST_V), fwd || back ? 1 : 0);
      return true;
    },
  };
}
