import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { setInteriorGlow } from './interiors.js';
import { buildWorld, groundY, BOUNDS, JP_TEXT } from './world.js';
import { Rain } from './rain.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { UI } from './ui.js';
import { loadAssets } from './assets.js';
import { loadSurfaces } from './surfaces.js';
import { ROSTER, loadCharacter, savedCharacter, saveCharacter, skinOf, savedSkin, saveSkin } from './characters.js';
import { glow } from './textures.js';
import { roomAt, ROOMS } from './rooms.js';
import { makeDriving } from './driving.js';
import { bridgeY } from './district.js';
import { makeNPCs } from './npcs.js';
import { PLACED } from './furnish.js';
import { makeMinimap } from './minimap.js';
import { makeCine } from './cine.js';
import { makePlaces } from './places.js';
import { makeRouter } from './route.js';
import { makeGuide } from './guide.js';
import { makeWalkers } from './walkers.js';
import { setVehicleNight } from './realveh.js';
import { TONE } from './vrmtone.js';
import { makeEconomy } from './economy.js';
import { makePhoto } from './photo.js';
import { NORTH } from './north.js';
import { makeQuests } from './quests.js';
import { setupKTX2 } from './ktx2.js';
import { MOBILE } from './device.js';
import { makeTouch } from './touch.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
setupKTX2(renderer);   // the models' textures are KTX2 (ktx2.js)
renderer.setPixelRatio(MOBILE ? 1 : Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = !MOBILE;   // (phones: no moving shadows, see setQuality)
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false; // refreshed every other frame in loop()

const scene = new THREE.Scene();
scene.matrixWorldAutoUpdate = false; // step() updates the matrices once a frame (render passes would each redo it)
scene.background = new THREE.Color(0x05070d);
scene.fog = new THREE.FogExp2(0x0d1426, 0.03);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 400);
const cine = makeCine(camera);   // the title drone and the opening shot
const titleAt = new THREE.Vector3();

// ---------- photo mode (P) ----------
let photo = null, quests = null, touch = null;
function enterPhoto() {
  if (!photo) {
    // the character can change (C): always reach the current one
    const hero = new Proxy({}, { get: (_, k) => { const v = player[k]; return typeof v === 'function' ? v.bind(player) : v; }, set: (_, k, v) => { player[k] = v; return true; } });
    photo = makePhoto({ camera, renderer, film, dof, player: hero, groundY, walk: BOUNDS, isDriving: () => !!driving?.car, toast: (m) => ui.toast(m) });
  }
  mode = 'photo';
  if (document.pointerLockElement) document.exitPointerLock();
  ui.hidePrompt(); $('hud').classList.add('hidden');
  if (minimap.open) minimap.toggle(false);
  photo.enter();
}
function exitPhoto() {
  photo.exit();
  mode = 'play'; $('hud').classList.remove('hidden');
  clock.getDelta();
  lockPointer();
}

const composer = new EffectComposer(renderer);
// the main render keeps its depth in a texture (both of the composer's buffers, whichever it lands in),
// so depth of field needs no second render of the town
for (const rt of [composer.renderTarget1, composer.renderTarget2]) { rt.depthTexture = new THREE.DepthTexture(innerWidth || 1, innerHeight || 1); rt.depthTexture.type = THREE.UnsignedIntType; }
composer.addPass(new RenderPass(scene, camera));
// depth of field: sharp from the camera to just past what you look at (your character, or what's in the middle
// of the screen through your own eyes), then the distance softens; bright lights open into soft bokeh. Each
// sample is weighed by its own blur so sharp things in front never smear into the background.
const dof = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, cameraNear: { value: 0.1 }, cameraFar: { value: 400 }, uFocus: { value: 4 }, uAuto: { value: 0 }, uMaxR: { value: 6 }, uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 800) }, uK: { value: 1 },
    uSpan: { value: 1.6 }, uOff: { value: 4 }, uRange: { value: 55 } },   // where the blur starts and how fast it grows (photo mode changes them)
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    #include <packing>
    uniform sampler2D tDiffuse, tDepth; uniform float cameraNear, cameraFar, uFocus, uAuto, uMaxR, uK, uSpan, uOff, uRange; uniform vec2 uTexel; varying vec2 vUv;
    float dist(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, cameraNear, cameraFar); }
    float coc(float z, float f) { return clamp((z - f * uSpan - uOff) / uRange, 0.0, 1.0) * uK; }
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      float f = uAuto > 0.5 ? clamp(dist(vec2(0.5)), 1.5, 80.0) : uFocus;
      float c = coc(dist(vUv), f);
      if (c < 0.02) { gl_FragColor = base; return; }
      vec3 acc = base.rgb; float wsum = 1.0;
      for (int i = 1; i < 24; i++) {
        float fi = float(i), r = sqrt(fi / 24.0) * c * uMaxR, a = fi * 2.39996;
        vec2 suv = vUv + vec2(cos(a), sin(a)) * r * uTexel;
        float cs = coc(dist(suv), f);
        // a sample that is itself sharp (nearer) only counts as much as it is blurred
        float w = cs >= c * 0.6 ? 1.0 : cs / max(c, 1e-3);
        vec3 s = texture2D(tDiffuse, suv).rgb;
        w *= 1.0 + dot(s, vec3(0.3, 0.6, 0.1)) * 0.6;   // highlights spread into bokeh
        acc += s * w; wsum += w;
      }
      gl_FragColor = vec4(acc / wsum, base.a);
    }`,
});
{ const r0 = dof.render.bind(dof); dof.render = (r, w, rb, dt, m) => { dof.uniforms.tDepth.value = rb.depthTexture; r0(r, w, rb, dt, m); }; }
composer.addPass(dof);
// ambient occlusion indoors: corners, the floor under a counter, the gap behind a shelf go darker
const ao = new GTAOPass(scene, camera, innerWidth, innerHeight);
ao.blendIntensity = 0.9;
ao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.6, thickness: 1.2, scale: 1.1, samples: 12 });
ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 12 });
ao.enabled = false;
composer.addPass(ao);
// one bad pixel (NaN/Inf) would be smeared over the whole frame by the bloom blur — scrub them first
const scrub = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, texel: { value: new THREE.Vector2(1 / innerWidth, 1 / innerHeight) } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 texel; varying vec2 vUv;
    bool bad(vec4 c) { return any(isnan(c)) || any(isinf(c)); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      if (bad(c)) {
        vec4 sum = vec4(0.0); float n = 0.0;
        for (int i = 0; i < 8; i++) {
          float a = float(i) * 0.785398;
          vec4 s = texture2D(tDiffuse, vUv + vec2(cos(a), sin(a)) * texel * 2.0);
          if (!bad(s)) { sum += s; n += 1.0; }
        }
        c = n > 0.0 ? sum / n : vec4(0.0, 0.0, 0.0, 1.0);
      }
      gl_FragColor = min(c, vec4(48.0));
    }`,
});
composer.addPass(scrub);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.45, 0.8);
composer.addPass(bloom);
composer.addPass(new OutputPass());
// colour grade for the night: a touch of violet in the shadows, warm magenta in the highlights, a little more
// colour and a gentle S-curve — strongest at night, nothing by day (uNight)
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uNight: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uNight; varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c += vec3(0.018, 0.0, 0.04) * uNight * (1.0 - smoothstep(0.0, 0.45, l));
      c += vec3(0.025, 0.0, 0.012) * uNight * smoothstep(0.55, 1.0, l);
      c = mix(vec3(l), c, 1.0 + 0.14 * uNight);
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.12 * uNight);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
});
composer.addPass(grade);
// rain on the lens (third person, outdoors, while it rains): drops that come and go and bend the image behind
// them, a few sliding down. The drop map holds each drop's tilt (rg), its outline (b) and its own clock (a).
const dropTex = (() => {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const img = g.createImageData(S, S), d = img.data;
  for (let i = 0; i < S * S; i++) { d[i * 4] = 128; d[i * 4 + 1] = 128; d[i * 4 + 2] = 0; d[i * 4 + 3] = 255; }
  for (let n = 0; n < 220; n++) {
    const cx = Math.random() * S, cy = Math.random() * S, r = 2 + Math.pow(Math.random(), 3) * 14, ry = r * (1 + Math.random() * 0.4), clk = Math.floor(Math.random() * 255);
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const dx = (x - cx) / r, dy = (y - cy) / ry, q = dx * dx + dy * dy; if (q > 1) continue;
      const i = (((y + S) % S) * S + ((x + S) % S)) * 4;
      d[i] = 128 + dx * 120; d[i + 1] = 128 - dy * 120; d[i + 2] = 255 * (1 - q * q); d[i + 3] = clk;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return t;
})();
const lens = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uDrops: { value: dropTex }, uK: { value: 0 }, uTime: { value: 0 }, uAspect: { value: innerWidth / Math.max(1, innerHeight) } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse, uDrops; uniform float uK, uTime, uAspect; varying vec2 vUv;
    vec4 drop(vec2 uv) { return texture2D(uDrops, uv); }
    void main() {
      if (uK < 0.01) { gl_FragColor = texture2D(tDiffuse, vUv); return; }
      vec2 duv = vUv * vec2(uAspect, 1.0) * 1.3;
      vec4 a = drop(duv);
      vec4 b = drop(duv * 0.7 + vec2(0.37, uTime * 0.035));          // a slower layer that slides down
      float sa = a.b * step(fract(a.a + uTime * 0.05), uK * 0.55);
      float sb = b.b * step(fract(b.a + uTime * 0.03), uK * 0.35);
      vec2 off = (a.rg - 0.5) * 0.05 * sa + (b.rg - 0.5) * 0.05 * sb;
      vec3 c = texture2D(tDiffuse, vUv + off).rgb;
      float m = max(sa, sb);
      if (m > 0.0) { c = (c + texture2D(tDiffuse, vUv + off + vec2(0.002, 0.0)).rgb + texture2D(tDiffuse, vUv + off - vec2(0.0, 0.002)).rgb) / 3.0; c += m * 0.025; }
      gl_FragColor = vec4(c, 1.0);
    }`,
});
composer.addPass(lens);
// film look: slight lens fringing toward the edges, vignette, animated grain
const film = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, uVig: { value: 1.1 }, uGrain: { value: 1 }, uFilter: { value: 0 }, uExpo: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, uVig, uGrain, uFilter, uExpo; varying vec2 vUv;
    float rand(vec2 c) { return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5; float r2 = dot(c, c);
      vec2 off = c * r2 * 0.012;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col *= uExpo;
      // photo mode's looks (0 = the game's own)
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      if (uFilter > 0.5 && uFilter < 1.5) col = vec3(smoothstep(0.03, 0.85, l));                                   // noir
      else if (uFilter < 2.5 && uFilter > 1.5) col = mix(col, col * vec3(1.1, 1.0, 0.82), 0.9) * 0.94 + vec3(0.035, 0.025, 0.01);   // warm film
      else if (uFilter < 3.5 && uFilter > 2.5) col = mix(vec3(l), col * vec3(0.86, 1.0, 1.16), 1.3);              // cool neon
      else if (uFilter < 4.5 && uFilter > 3.5) col = mix(col, vec3(l), 0.4) * 0.86 + vec3(0.07, 0.065, 0.075);     // faded
      else if (uFilter > 4.5) col = vec3(l * 1.07, l * 0.88, l * 0.64) + vec3(0.02, 0.01, 0.0);                    // sepia
      col *= 1.0 - r2 * uVig;
      col += (rand(vUv * 1000.0 + fract(time) * 37.0) - 0.5) * 0.035 * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(film);

const ui = new UI(), input = new Input(), sound = new Sound();
let lensK = 0;
let world, rain, player, driving, npcs, minimap, walkers, economy, places, router, guide, mode = 'loading', t = 0, lastView = 'chase';

// ---------- things you carry (snacks, capsule toys, prizes), kept between visits ----------
const inv = (() => { try { return JSON.parse(localStorage.getItem('ameyoru.inv')) || {}; } catch { return {}; } })();
const addItem = (name, n = 1) => { inv[name] = (inv[name] || 0) + n; try { localStorage.setItem('ameyoru.inv', JSON.stringify(inv)); } catch { /* storage unavailable */ } ui.toast(`Got: ${name}`); };
const useItem = (name) => { if (!inv[name]) return false; inv[name]--; try { localStorage.setItem('ameyoru.inv', JSON.stringify(inv)); } catch { /* storage unavailable */ } return true; };
// what world actions get to work with
let activity = null;
// the price in a label or a choice ('Play taiko ¥100'); not money you get ('+¥…') nor the change machine
const priceOf = (s) => { if (!s || /^Trade/.test(s)) return 0; const m = /(?<![+])¥\s?([\d.,]+)/.exec(s); return m ? +m[1].replace(/[.,]/g, '') : 0; };
const api = {
  get sound() { return sound; }, get player() { return player; }, ui, inv, addItem, useItem,
  toast: (m) => ui.toast(m),
  say: (lines, done) => ui.openDialog(lines, done),
  // a choice with a price on it is paid when it's picked (not enough money: nothing happens but a note)
  choose: (title, opts, cb) => ui.choose(title, opts, (k) => {
    const n = priceOf(opts[k]);
    if (n && economy && !economy.pay(n, opts[k].replace(/\s*[(]?¥.*$/, ''))) return;
    cb(k);
  }),
  pay: (n, what) => (economy ? economy.pay(n, what) : true),
  earn: (n, why) => economy?.earn(n, why),
  gotCan: () => economy?.gotCan(),
  // fade out, move somewhere (another floor, a room far off the map), fade back in
  // pitch: tilt the camera too (negative looks up), e.g. to a star in the sky
  teleport: (x, y, z, yaw, then, pitch) => ui.fade(() => {
    player.seat = null; player.group.position.set(x, y, z); player.heading = yaw; player.speed = 0;
    cam.yaw = yaw + Math.PI; cam.cur = 1.2; if (pitch !== undefined) cam.pitch = pitch; then?.();
  }),
  sit: (seat) => player.sit(seat),
  start: (a) => { activity = a; a.begin?.(api); },
};
// mode: 'third' (behind you) or 'first' (through your eyes) — V switches on foot, kept between visits
const cam = { yaw: 0, pitch: 0.2, dist: 4.0, cur: 4.0, mode: (() => { try { return localStorage.getItem('ameyoru.view') === 'first' ? 'first' : 'third'; } catch { return 'third'; } })() };
const ray = new THREE.Raycaster();
ray.camera = camera; // a sprite among the blockers needs it
const camDir = new THREE.Vector3(), camTarget = new THREE.Vector3(), move = new THREE.Vector2();
// setTimeout fallback so loading still finishes in a background tab, where rAF is paused
const heroSurface = { x0: 0, x1: 0, z0: 0, z1: 0, y: -10, splash: true };
const frame = () => new Promise((r) => { requestAnimationFrame(() => r()); setTimeout(r, 60); });

async function boot() {
  ui.bootFx();
  ui.progress(0.04, 'Opening city systems…');
  const tFont = ui.task('書体', 'Japanese & Latin type');
  ui.progress(0.1, 'Loading fonts…');
  await Promise.race([
    Promise.all([
      document.fonts.load('900 64px "Noto Sans JP"', JP_TEXT),
      document.fonts.load('700 64px "Chakra Petch"', 'HOSHI MART GAME CENTER'),
    ]).catch(() => {}),
    new Promise((r) => setTimeout(r, 4000)),
  ]);
  tFont.done('Noto Sans JP · Chakra Petch');
  ui.progress(0.2, 'Loading models…');
  const tModels = ui.task('車両', 'Vehicles & objects');
  const assets = await loadAssets((k) => ui.progress(0.2 + k * 0.15));
  tModels.done(`${Object.keys(assets.cars || {}).length} vehicles · ${Object.keys(assets.props || {}).length} objects`);
  ui.progress(0.35, 'Loading textures…');
  const tTex = ui.task('素材', 'PBR surfaces & night sky');
  assets.surfaces = await loadSurfaces(renderer, (k) => ui.progress(0.35 + k * 0.12));
  tTex.done('asphalt · tile · concrete · wood');
  ui.progress(0.5, 'Laying the streets…'); await frame();
  const tCity = ui.task('街区', 'Building the city');
  world = buildWorld(scene, renderer, assets);
  { const S = world.stats, N = world.neon?.count || {}; tCity.done(`${S.lamps} lamps · ${N.signs ?? 0} neon · ${N.boards ?? 0} LED screens · ${S.rooms} rooms`); }
  // money and small jobs
  economy = makeEconomy({ world, scene, ui, api, sound });
  Object.assign(world.fx, {
    vendCoin: (k, a) => economy.vendCoin(k, a), recycle: () => economy.recycle(), recycleLabel: () => economy.recycleLabel(),
    job: (id, ev, a) => economy.job(id, ev, a), jobStep: (id) => economy.jobStep(id),
  });
  ui.progress(0.75, 'Bringing down the rain…'); await frame();
  const tRain = ui.task('雨', 'Rain, puddles & weather');
  rain = new Rain(scene, groundY, MOBILE ? 3500 : undefined);   // half the drops on a phone (each is moved every frame)
  rain.surfaces = world.rainSurfaces; rain.edges = world.rainEdges;
  rain.covers = ROOMS;
  world.fx.splash = (x, y, z, n) => rain.splashAt(x, y, z, n);
  setWeather(load('ameyoru.weather2', 0), false);
  if (localStorage.getItem('ameyoru.quality') !== null) setQuality(load('ameyoru.quality', 2), false);
  else if (MOBILE) setQuality(1, false);
  // the hero's head and shoulders catch the rain too
  rain.surfaces.push(heroSurface);
  tRain.done(`${WEATHER[weather].name.toLowerCase()} · ${world.rainSurfaces.length} roofs & awnings`);
  const tLife = ui.task('交通', 'Traffic & townsfolk');
  player = new Player(scene);
  driving = makeDriving({ world, scene, groundY, walk: BOUNDS });
  world.fx.playerCar = () => driving?.car;   // the expressway's traffic makes room for you
  // real characters in the places the stand-in figures mark (they load in the background)
  npcs = makeNPCs(scene, world.npcSlots);
  minimap = makeMinimap(world);
  // places to find, the GPS and the guide on the ground (the map's mark)
  places = makePlaces({ banner });
  router = makeRouter(world);
  guide = makeGuide(scene, groundY);
  minimap.setPlaces(places);
  minimap.onMark = (pt) => setMark(pt);
  // the night's story, the maneki-neko and the north's jobs
  quests = makeQuests({ world, scene, ui, api, NORTH, banner, setMark: (pt) => setMark(pt), getMark: () => markPt, driving, player,
    setClock: (m) => { gameMin = m; tickClock(0); },
    // the clear sky for the finale, without changing your saved weather choice
    setWeather: (i) => { weather = i; for (const o of world.fx.far || []) o.visible = WEATHER[i].fog < 0.05; applyAtmos(); },
    lookUp: () => { cam.yaw = 0; cam.pitch = -0.12; cam.lookT = performance.now() + 4000; } });
  api.quests = quests;
  // a phone or a tablet: a stick, look by dragging, buttons for the keys
  touch = makeTouch({ input, look: (dx, dy) => {
    if (mode === 'photo' && photo) { photo.state.yaw -= dx * 0.005; photo.state.pitch = THREE.MathUtils.clamp(photo.state.pitch - dy * 0.005, -1.45, 1.45); return; }
    cam.yaw -= dx * 0.005 * settings.sens; cam.lookT = performance.now();
    const fp = cam.mode === 'first' && !driving?.car;
    cam.pitch = THREE.MathUtils.clamp(cam.pitch + dy * 0.004 * settings.sens * (settings.invertY ? -1 : 1), fp ? -1.3 : -0.12, fp ? 1.35 : 1.1);
  } });
  applySettings();
  // people walking the pavements
  walkers = makeWalkers(scene, world);
  world.fx.walkers = walkers.agents; // for the map
  // shops and rooms you can hear from outside, through their doors
  sound.addLeaks(ROOMS.filter((r) => r.amb).map((r) => ({ x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2, y: r.y, kind: r.amb, room: r })));
  tLife.done(`${world.drivable.length} drivable cars · ${walkers.agents.length} pedestrians`);
  ui.progress(0.85, 'Calling the character…');
  const tHero = ui.task('主人公', 'Character');
  try { await wear(savedCharacter(), false); } catch (e) { console.warn('[ameyoru] VRM failed, using placeholder', e); }
  { const e = savedCharacter(), sk = skinOf(e); tHero.done(e.skins ? `${e.name} · ${sk.name}` : e.name); }
  camera.position.set(0, 1.8, 31);
  camera.lookAt(0, 2, 0);
  // get everything ready now, so the game never has to stop and prepare something while you play
  await prepareAll();
  window.ameyoru = { get npcs() { return npcs; }, get walkers() { return walkers; }, get economy() { return economy; }, get mode() { return mode; }, player, cam, camera, world, ui, composer, film, renderer, scene, rain, api, step: (dt = 1 / 30, n = 1) => { for (let i = 0; i < n; i++) step(dt); }, get driving() { return driving; }, activity: () => activity, setClock: (m) => { gameMin = m; }, skip: (s) => { t += s; }, openMenu, closeMenu, wear: (id) => wear(ROSTER.find((c) => c.id === id)), get places() { return places; }, get router() { return router; }, get route() { return route; }, get mark() { return markPt; }, setMark: (p) => setMark(p), get photo() { return photo; }, enterPhoto: () => enterPhoto() }; // debug handle for the console
  ui.task('準備完了', 'The city is ready. Welcome to Hoshimi.').done();
  ui.progress(1, 'Ready');
  await new Promise((r) => setTimeout(r, 700));
  mode = 'title';
  player.group.visible = false;   // the drone shows the town; you appear when the opening shot comes down to you
  ui.showTitle(); renderTitleMenu();
}

// ---------- characters ----------
let current = null, currentKey = null;
async function wear(entry, fx = true, skinI = savedSkin(entry)) {
  const skin = skinOf(entry, skinI);
  const { vrm, clips } = await loadCharacter(entry, skin);
  const p = player.group.position;
  player.useVRM(vrm);
  if (clips.idle && clips.walk && clips.run) player.useAnimations(clips);
  current = entry.id; currentKey = skin.key;
  saveCharacter(entry.id); saveSkin(entry, skin.i);
  if (fx) burst(p);
}

// a soft flash of light where the character changes
const burstMat = new THREE.SpriteMaterial({ map: glow(), color: 0x9fd8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
const burstSprite = new THREE.Sprite(burstMat); burstSprite.visible = false; scene.add(burstSprite);
let burstT = 0;
function burst(p) { burstSprite.position.set(p.x, p.y + 1.0, p.z); burstT = 0.6; burstSprite.visible = true; sound.chime?.(); }
function updateBurst(dt) {
  if (burstT <= 0) return;
  burstT -= dt;
  const k = 1 - burstT / 0.6;
  burstSprite.scale.setScalar(0.6 + k * 3.2);
  burstMat.opacity = (1 - k) * 0.9;
  if (burstT <= 0) burstSprite.visible = false;
}

// menu.skin: the outfit picked for the selected character (a character with skins shows them under the cards)
const menu = { open: false, sel: 0, skin: 0, busy: false, saved: null };
const $ = (id) => document.getElementById(id);
const pickSkin = () => { const e = ROSTER[menu.sel]; menu.skin = e.id === current ? skinOf(e).i : savedSkin(e); };
function renderMenu() {
  $('cards').innerHTML = '';
  ROSTER.forEach((c, i) => {
    const d = document.createElement('div');
    d.className = 'card' + (i === menu.sel ? ' sel' : '') + (c.id === current ? ' on' : '') + (menu.busy && i === menu.sel ? ' busy' : '');
    const look = skinOf(c, i === menu.sel ? menu.skin : savedSkin(c));
    d.innerHTML = `<img src="${look.thumb}" alt=""><div class="nm">${c.name}</div>`;
    d.addEventListener('click', () => { if (menu.sel !== i) { menu.sel = i; pickSkin(); } choose(); });
    $('cards').appendChild(d);
  });
  const c = ROSTER[menu.sel], look = skinOf(c, menu.skin);
  // the outfits of the selected character
  const row = $('skins');
  row.innerHTML = '';
  row.classList.toggle('hidden', !c.skins);
  (c.skins || []).forEach((sk, i) => {
    const b = document.createElement('button');
    b.className = 'skin' + (i === menu.skin ? ' sel' : '') + (skinOf(c, i).key === currentKey ? ' on' : '');
    b.innerHTML = `<img src="${sk.thumb}" alt=""><span>${sk.name}</span>`;
    b.addEventListener('click', () => { menu.skin = i; choose(); });
    row.appendChild(b);
  });
  $('cmSkinHint').classList.toggle('hidden', !c.skins);
  $('cmInfo').querySelector('.nm').textContent = c.skins ? `${c.name} · ${look.name}` : c.name;
  $('cmInfo').querySelector('.by').textContent = `by ${c.author} · ${c.license}`;
}
function openMenu() {
  menu.open = true;
  menu.sel = Math.max(0, ROSTER.findIndex((c) => c.id === current));
  pickSkin();
  menu.saved = { yaw: cam.yaw, pitch: cam.pitch, dist: cam.dist };
  if (document.pointerLockElement) document.exitPointerLock();
  ui.hidePrompt();
  $('charMenu').classList.remove('hidden');
  renderMenu();
}
function closeMenu() {
  menu.open = false;
  Object.assign(cam, { pitch: menu.saved.pitch, dist: menu.saved.dist });
  $('charMenu').classList.add('hidden');
}
async function choose() {
  const entry = ROSTER[menu.sel];
  if (menu.busy || skinOf(entry, menu.skin).key === currentKey) return;
  menu.busy = true; renderMenu();
  try { await wear(entry, true, menu.skin); } catch (e) { console.warn('[ameyoru] could not load', entry.id, e); }
  menu.busy = false; renderMenu();
}
function menuInput(dt) {
  if (input.hit('ArrowRight') || input.hit('KeyD')) { menu.sel = (menu.sel + 1) % ROSTER.length; pickSkin(); renderMenu(); }
  if (input.hit('ArrowLeft') || input.hit('KeyA')) { menu.sel = (menu.sel + ROSTER.length - 1) % ROSTER.length; pickSkin(); renderMenu(); }
  const n = ROSTER[menu.sel].skins?.length || 0;
  if (n && (input.hit('ArrowDown') || input.hit('KeyS'))) { menu.skin = (menu.skin + 1) % n; renderMenu(); }
  if (n && (input.hit('ArrowUp') || input.hit('KeyW'))) { menu.skin = (menu.skin + n - 1) % n; renderMenu(); }
  if (input.hit('Enter') || input.hit('Space')) choose();
  if (input.hit('KeyC') || input.hit('Escape')) { closeMenu(); return; }
  // swing the camera round to face the character
  const front = player.heading;
  const d = THREE.MathUtils.euclideanModulo(front - cam.yaw + Math.PI, Math.PI * 2) - Math.PI;
  cam.yaw += d * Math.min(1, dt * 4);
  cam.pitch += (0.06 - cam.pitch) * Math.min(1, dt * 4);
  cam.dist += (2.7 - cam.dist) * Math.min(1, dt * 4);
}

// ---------- title menu ----------
const tmenu = { i: 0, panel: null };
const TITLE_ACTS = ['start', 'settings', 'controls', 'credits'];
function renderTitleMenu() {
  document.querySelectorAll('#tmenu button').forEach((b, i) => b.classList.toggle('sel', i === tmenu.i));
}
function titlePanel(kind) {
  const el = document.getElementById('tpanel');
  if (!kind || tmenu.panel === kind) { tmenu.panel = null; el.classList.add('hidden'); return; }
  tmenu.panel = kind; el.classList.remove('hidden');
  if (kind === 'controls') {
    const K = [['W A S D', 'Walk / steer'], ['Shift', 'Run'], ['Mouse', 'Turn camera'], ['E', 'Look · talk · get in a car'], ['V', 'Camera: eyes / behind'],
      ['C', 'Change character & outfit'], ['Tab', 'Town map'], ['P', 'Photo mode'], ['I', 'Items & jobs'], ['R', 'Change weather'], ['J', 'Skip time'], ['T', 'Speed up time (hold)'],
      ['G', 'Graphics quality'], ['O', 'Volume'], ['M', 'Sound on/off'], ['H', 'Controls panel']];
    el.innerHTML = `<h3>Controls</h3>${K.map(([k, v]) => `<div class="row"><span>${k}</span><span>${v}</span></div>`).join('')}`;
  } else {
    el.innerHTML = `<h3>Credits</h3>
      <p><b>Ameyoru</b> — a rainy night in Hoshimi.</p>
      <p><b>Characters</b> · VRoid Project (pixiv), 6, siroihakumai — VRoid Hub. Animation: Adobe Mixamo.</p>
      <p><b>Vehicles</b> · Karol Miklas, Kucing Garage, Doz3, BHP3D, Romanov_13, Alvin.Woodly, Nieve5677, SIU Car Garage, by__Rx, ProPolyModels — Sketchfab (CC BY).</p>
      <p><b>Objects</b> · filadog, Watanuki_San, DreamNoms — Sketchfab (CC BY). Textures & props: Poly Haven (CC0).</p>
      <p><b>Sound</b> · Freesound (CC0).</p>`;
  }
}
function titleAct(act) {
  if (act === 'start') start();
  else if (act === 'settings') { titlePanel(null); openSettings(null); }
  else titlePanel(act);
}
document.querySelectorAll('#tmenu button').forEach((b, i) => {
  b.addEventListener('mouseenter', () => { tmenu.i = i; renderTitleMenu(); });
  b.addEventListener('click', () => { tmenu.i = i; renderTitleMenu(); titleAct(TITLE_ACTS[i]); });
});
function titleInput() {
  const n = TITLE_ACTS.length;
  if (input.hit('ArrowDown') || input.hit('KeyS')) { tmenu.i = (tmenu.i + 1) % n; renderTitleMenu(); }
  if (input.hit('ArrowUp') || input.hit('KeyW')) { tmenu.i = (tmenu.i + n - 1) % n; renderTitleMenu(); }
  if (input.hit('Enter') || input.hit('Space')) titleAct(TITLE_ACTS[tmenu.i]);
  if (input.hit('Escape') && tmenu.panel) titlePanel(null);
}

// ---------- discoveries, districts, the map's mark and the way to it ----------
const bannerQ = [];
let bannerBusy = false;
function banner(kick, name, jp = '', sub = '') {
  bannerQ.push({ kick, name, jp, sub });
  if (!bannerBusy) nextBanner();
}
function nextBanner() {
  const b = bannerQ.shift(); const el = $('banner');
  if (!b) { bannerBusy = false; el.classList.add('hidden'); return; }
  bannerBusy = true;
  $('bnKick').textContent = b.kick; $('bnName').textContent = b.name; $('bnJp').textContent = b.jp; $('bnSub').textContent = b.sub;
  el.classList.remove('hidden', 'out'); void el.offsetWidth;
  if (b.kick === 'DISCOVERED' || b.kick === 'MARK REACHED') sound.chime?.();
  setTimeout(() => { el.classList.add('out'); setTimeout(nextBanner, 600); }, 2800);
}
let markPt = null, route = null, routeT = 0;
const here = () => (driving?.car ? driving.car.position : player.group.position);
function setMark(pt) {
  if (pt) {
    // a click near a place you know takes its name
    const pl = places.PLACES.find((q) => q.x !== null && places.has(q.id) && Math.hypot(q.x - pt.x, q.z - pt.z) < 6);
    markPt = pt.quest ? pt : pl ? { x: pl.x, z: pl.z, name: pl.name, id: pl.id } : { x: pt.x, z: pt.z, name: 'Marked spot' };
    routeT = 0;
  } else { markPt = null; route = null; }
  minimap.setMark(markPt); minimap.setRoute(route);
  $('mpMark').innerHTML = markPt ? `Mark · <b>${markPt.name}</b> · ${Math.round(Math.hypot(markPt.x - here().x, markPt.z - here().z))} m · right-click to clear` : 'No mark · click the map to set one';
  renderMapList();
}
function wayTick(dt) {
  const p = here(), outside = mode === 'play' && router.inMap(p.x, p.z);
  if (mode === 'play') places.update(dt, p);
  if (markPt && outside) {
    if ((routeT -= dt) <= 0) { routeT = 0.8; route = router.find(p, markPt); }
    // keep the line starting at you; drop the corners you've passed
    if (route) {
      while (route.length > 2 && Math.hypot(route[1].x - p.x, route[1].z - p.z) < 2.2) route.splice(1, 1);
      route[0] = { x: p.x, z: p.z };
    }
    minimap.setRoute(route);
    const end = route?.length === 2 ? route[1] : null;   // a mark indoors: its route ends at the door
    if (Math.hypot(markPt.x - p.x, markPt.z - p.z) < 3.5 || (end && Math.hypot(end.x - p.x, end.z - p.z) < 1.5)) { banner('MARK REACHED', markPt.name); setMark(null); }
  }
  const inRoom = roomAt(player.group.position);   // the covered arcades count as outdoors here
  guide.update(dt, route, markPt, p, outside && (!inRoom || inRoom.amb === 'shotengai'));
}
// the big map: open/close; the list of places down its side
function openMap(v) {
  minimap.toggle(v);
  if (v) { renderMapList(); setMark(markPt ? { x: markPt.x, z: markPt.z } : null); if (document.pointerLockElement) document.exitPointerLock(); }
  else if (mode === 'play') lockPointer();
}
const KIND_ICON = { shop: '■', food: '●', play: '◆', sight: '▲', transit: '▬', secret: '★', love: '♥' };
function renderMapList() {
  if (!places) return;
  $('mpCount').textContent = `${places.count} / ${places.total} found`;
  const box = $('mpList'); box.innerHTML = '';
  for (const d of places.DISTRICTS) {
    const list = places.PLACES.filter((q) => q.d === d.id);
    if (!list.length) continue;
    const h = document.createElement('h4'); h.innerHTML = `${d.name} <span>${list.filter((q) => places.has(q.id)).length}/${list.length}</span>`; box.appendChild(h);
    for (const q of list) {
      const f = places.has(q.id) || !!q.always, b = document.createElement('button');
      b.className = 'mp-pl' + (f ? '' : ' unk') + (q.kind === 'love' ? ' love' : '') + (markPt?.id === q.id ? ' marked' : '');
      b.innerHTML = f ? `<span class="ic">${KIND_ICON[q.kind]}</span><span>${q.name}</span><span class="jp">${q.jp}</span>` : '<span class="ic">?</span><span>???</span><span></span>';
      if (f && q.x !== null) b.addEventListener('click', () => { setMark({ x: q.x, z: q.z }); minimap.centre(q.x, q.z); });
      else if (f) b.title = q.d === 'tsukino' ? 'In Tsukino — take the train from Hoshimi Station' : 'Somewhere up high';
      box.appendChild(b);
    }
  }
}

// ---------- frames per second (Settings · Gambar) ----------
let fpsAcc = 0, fpsN = 0;
function fpsTick(dt) {
  if (!settings.fps) return;
  fpsAcc += dt; fpsN++;
  if (fpsAcc >= 0.5) { $('fps').textContent = `${Math.round(fpsN / fpsAcc)} FPS`; fpsAcc = 0; fpsN = 0; }
}

// ---------- the opening shot ----------
let introT = 0;
function start() {
  if (mode !== 'title') return;
  titlePanel(null);
  mode = 'intro'; introT = 0;
  sound.init();
  player.group.visible = true;
  document.getElementById('title').classList.add('hidden');
  ui.cine(true, `${hhmm()} · ${weatherWord()}`);
  // the play camera starts behind you, looking where you face
  cam.yaw = player.heading + Math.PI; cam.pitch = 0.2; cam.cur = cam.dist;
  const home = !driving?.car && !roomAt(player.group.position) && Math.hypot(player.group.position.x, player.group.position.z - 27) < 6;
  introQuick = !home;
  if (home) cine.beginIntro(player.group.position);
}
let introQuick = false;
function finishIntro() {
  if (mode !== 'intro') return;
  mode = 'play';
  ui.cine(false);
  ui.showHudIn();
  lockPointer();
}
const gamePos = new THREE.Vector3(), gameQuat = new THREE.Quaternion();
function introStep(dt) {
  introT += dt;
  // you stand idle while it plays: the game runs with the keys held back, which also places the play camera
  const skip = introT > 0.4 && (input.hit('Enter') || input.hit('Escape') || input.hit('Space'));
  input.blocked = true;
  play(dt);
  input.blocked = false;
  gamePos.copy(camera.position); gameQuat.copy(camera.quaternion);
  // not at the start of the street (you came back to the title from somewhere else): a fade from black only
  const r = introQuick ? { done: introT > 1.1, k: 1 } : cine.intro(dt, gamePos, gameQuat);
  if (r.k > 0.5) ui.cineCard(true);
  if (r.done || skip) { camera.position.copy(gamePos); camera.quaternion.copy(gameQuat); finishIntro(); }
}
canvas.addEventListener('click', () => { if (mode === 'intro' && introT > 0.4) finishIntro(); });

// ---------- camera control ----------
function lockPointer() {
  try { canvas.requestPointerLock()?.catch?.(() => {}); } catch { /* not supported */ }
}
canvas.addEventListener('click', () => {
  if (mode === 'play' && !ui.dialogOpen && !menu.open && document.pointerLockElement !== canvas) lockPointer();
});
document.addEventListener('pointerlockchange', () => ui.setLocked(document.pointerLockElement === canvas));
let dragging = false;
canvas.addEventListener('mousedown', () => { dragging = true; });
addEventListener('mouseup', () => { dragging = false; });
addEventListener('mousemove', (e) => {
  if (mode !== 'play' || menu.open) return;
  if (document.pointerLockElement !== canvas && !dragging) return;
  cam.yaw -= e.movementX * 0.0024 * settings.sens;
  if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) cam.lookT = performance.now();   // the chase camera waits before it swings back
  // through your own eyes you can look far up and down
  const fp = cam.mode === 'first' && !driving?.car;
  cam.pitch = THREE.MathUtils.clamp(cam.pitch + e.movementY * 0.002 * settings.sens * (settings.invertY ? -1 : 1), fp ? -1.3 : -0.12, fp ? 1.35 : 1.1);
});

// first person: the camera sits in your head, your own head is hidden (the body, arms and legs stay — look down
// and you see them), a light bob with your steps
function setView(mode) {
  cam.mode = mode;
  try { localStorage.setItem('ameyoru.view', mode); } catch { /* storage unavailable */ }
  if (mode === 'third') { cam.pitch = THREE.MathUtils.clamp(cam.pitch, -0.12, 1.1); cam.cur = 1.2; }
  else cam.pitch = THREE.MathUtils.clamp(cam.pitch, -0.3, 0.3);
  ui.toast(mode === 'first' ? 'Camera: through the eyes · V' : 'Camera: from behind · V');
}
const headPos = new THREE.Vector3(), lookDir = new THREE.Vector3();
let bobT = 0;
function hideHead(hide) {
  const h = player.vrm?.humanoid?.getRawBoneNode('head');
  if (!h) return;
  const k = hide ? 0.0001 : 1;
  if (h.scale.x === k) return;
  h.scale.setScalar(k);
  // the hair's spring bones were squeezed to a point: let them settle afresh
  if (!hide) player.vrm.springBoneManager?.reset?.();
}
function firstPersonCamera(dt) {
  const head = player.vrm?.humanoid?.getRawBoneNode('head');
  if (head) { player.group.updateMatrixWorld(true); head.getWorldPosition(headPos); }
  else headPos.set(player.group.position.x, player.group.position.y + (player.height || 1.6) - 0.1, player.group.position.z);
  const cp = Math.cos(cam.pitch);
  lookDir.set(-Math.sin(cam.yaw) * cp, -Math.sin(cam.pitch), -Math.cos(cam.yaw) * cp);
  // eyes are a little in front of the head bone and above it
  const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
  const sp = Math.min(1, (player.speed || 0) / 4.5);
  bobT += dt * (5 + sp * 6) * (sp > 0.05 ? 1 : 0);
  camera.position.set(headPos.x + fx * 0.1, headPos.y + 0.07 + Math.sin(bobT * 2) * 0.025 * sp, headPos.z + fz * 0.1);
  camera.position.x += Math.cos(bobT) * 0.015 * sp * fz; camera.position.z -= Math.cos(bobT) * 0.015 * sp * fx;
  camera.lookAt(camera.position.x + lookDir.x, camera.position.y + lookDir.y, camera.position.z + lookDir.z);
  const fov = 72 + sp * 4 + settings.fov;
  if (Math.abs(camera.fov - fov) > 0.05 || camera.near !== 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 3); camera.near = 0.05; camera.updateProjectionMatrix(); }
}

// a critically damped spring (no overshoot): moves cur toward target, vel carries over between frames
const _dc = new THREE.Vector3(), _dt = new THREE.Vector3();
function smoothDamp(cur, target, vel, time, dt) {
  const w = 2 / Math.max(1e-4, time), x = w * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  _dc.subVectors(cur, target);
  _dt.copy(vel).addScaledVector(_dc, w).multiplyScalar(dt);
  vel.addScaledVector(_dt, -w).multiplyScalar(e);
  cur.copy(target).add(_dc.add(_dt).multiplyScalar(e));
}
const camFocus = new THREE.Vector3(), camFocusV = new THREE.Vector3(), camWant = new THREE.Vector3();
let camFocusReady = false, camRoll = 0, camShake = 0;
function updateCamera(dt) {
  const p = player.group.position, car = driving?.car, room = car ? null : roomAt(p);
  // through your own eyes (on foot)
  const fp = cam.mode === 'first' && !car;
  hideHead(fp);
  if (fp) { firstPersonCamera(dt); return; }
  if (camera.near !== 0.1) { camera.near = 0.1; camera.updateProjectionMatrix(); }
  camWant.set(p.x, p.y + (car ? 1.35 : player.height ? player.height * (menu.open ? 0.62 : 0.88) : 1.55), p.z);
  const v = car ? driving.speed : 0;
  if (car) {
    // look a little ahead of the car, more the faster it goes
    const ahead = THREE.MathUtils.clamp(v * 0.16, -1, 3);
    camWant.x += Math.sin(car.rotation.y) * ahead; camWant.z += Math.cos(car.rotation.y) * ahead;
    // swing round behind the car while it's moving (in reverse too: the view stays behind the car, as when you
    // look over your shoulder) — unless you've just looked around with the mouse
    const behind = car.rotation.y + Math.PI;
    const idle = (performance.now() - (cam.lookT || 0)) / 1000;
    if (Math.abs(v) > 1 && idle > 1.2) cam.yaw += Math.atan2(Math.sin(behind - cam.yaw), Math.cos(behind - cam.yaw)) * Math.min(1, dt * (1.4 + Math.abs(v) * 0.09) * Math.min(1, idle - 1.2));
  }
  // the point the camera follows trails the character (or car) on a spring: steps and bumps don't jolt the picture
  if (!camFocusReady || camFocus.distanceToSquared(camWant) > 25) { camFocus.copy(camWant); camFocusV.set(0, 0, 0); camFocusReady = true; }
  else smoothDamp(camFocus, camWant, camFocusV, car ? 0.11 : room ? 0.04 : 0.07, dt);
  camTarget.copy(camFocus);
  const cp = Math.cos(cam.pitch);
  camDir.set(Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp);
  const far = car ? 6.5 + THREE.MathUtils.clamp(v * 0.06, 0, 1.4) : cam.dist;   // the car camera eases back at speed
  ray.set(camTarget, camDir); ray.far = far;
  const hit = ray.intersectObjects(world.blockers, false)[0];
  // poles, pillars and posts (merged into batches, so not in the blockers): boxes the camera stops in front of
  const hd = Math.min(hit ? hit.distance : Infinity, poleHit(camTarget, camDir, far));
  const want = car ? (hd < Infinity ? Math.max(1.5, hd - 0.25) : far) : Math.min(hd < Infinity ? Math.max(0.6, hd - 0.25) : cam.dist, room ? room.camDist ?? 2.2 : Infinity);
  cam.cur += (want - cam.cur) * Math.min(1, dt * (want < cam.cur ? 20 : 4));
  camera.position.copy(camTarget).addScaledVector(camDir, cam.cur);
  camera.position.y = Math.max(0.3, camera.position.y);
  if (room) {
    // indoors the camera comes in closer and stays inside the walls and under the ceiling
    cam.inside = Math.min(1, (cam.inside || 0) + dt * 3);
    const m = 0.22;
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, room.minX + m, room.maxX - m);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, room.minZ + m, room.maxZ - m);
    camera.position.y = THREE.MathUtils.clamp(camera.position.y, room.y + 0.4, room.ceil - 0.15);
  } else cam.inside = Math.max(0, (cam.inside || 0) - dt * 3);
  if (car && driving.view === 'inside' && !driving.busy) {
    // from the driver's seat, looking down the bonnet (the mouse still turns your head a little)
    driving.eye(camera.position);
    const h = car.rotation.y - THREE.MathUtils.clamp(Math.atan2(Math.sin(cam.yaw - car.rotation.y - Math.PI), Math.cos(cam.yaw - car.rotation.y - Math.PI)), -0.7, 0.7);
    camera.lookAt(camera.position.x + Math.sin(h) * 10, camera.position.y - 0.6, camera.position.z + Math.cos(h) * 10);
  } else {
    camera.lookAt(camTarget);
    // behind the car: a slight lean into turns, and a shake when you hit something
    if (car) {
      camRoll += (THREE.MathUtils.clamp(-driving.yawRate * Math.abs(v) * 0.004, -0.035, 0.035) - camRoll) * Math.min(1, dt * 3);
      camShake = Math.max(camShake * Math.exp(-dt * 7), driving.takeImpact());
    } else { camRoll *= Math.exp(-dt * 6); camShake *= Math.exp(-dt * 7); }
    if (Math.abs(camRoll) > 1e-4) camera.rotateZ(camRoll);
    if (camShake > 0.01) {
      const k = camShake * 0.09, tt = performance.now() * 0.05;
      camera.position.x += Math.sin(tt * 1.7) * k; camera.position.y += Math.sin(tt * 2.3 + 1) * k * 0.7; camera.position.z += Math.sin(tt * 1.3 + 2) * k;
    }
  }
  // a wider view as the car picks up speed, or as you break into a run
  const fov = (car ? 60 + Math.min(14, Math.abs(driving.speed) * 0.6) : 64 + Math.min(1, (player.speed || 0) / 4.5) * 5) + settings.fov;
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix(); }
}

// the expressway runs on into tunnels at both ends: drive in and you come back out the other way
let turning = false, onDeck = false;
function expresswayEnds() {
  const car = driving.car, EX = NORTH.expressway;
  if (!car || turning || car.position.y < 10) return;
  const z = car.position.z;
  if (z > EX.tunnelS + 5 && z < EX.tunnelN - 5) return;
  turning = true;
  ui.fade(() => {
    car.rotation.y += Math.PI; car.position.x = 2 * EX.x - car.position.x;
    car.position.z = z < 0 ? EX.tunnelS + 12 : EX.tunnelN - 12;
    cam.yaw = car.rotation.y + Math.PI; camFocusReady = false;
    turning = false;
    ui.toast('Through the tunnel and back · Hoshimi Route');
  }, 0.45);
}

// ---------- thunderstorms: lightning flashes the sky and the streets, the thunder follows (later when it's far) ----------
const bolt = new THREE.DirectionalLight(0xd4ddff, 0); bolt.position.set(-30, 80, -40); scene.add(bolt);
const boltLine = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: new THREE.Color(3, 3.2, 4), fog: false, transparent: true, opacity: 0 }));
boltLine.frustumCulled = false; scene.add(boltLine);
let stormT = 6, flashT = -1, flashK = 1;
const stormy = () => WEATHER[weather].storm || (WEATHER[weather].auto && SPELLS[sky.spell].storm && sky.k > 0.7);
function storm(dt, p) {
  if (stormy() && (stormT -= dt) <= 0) {
    stormT = 6 + Math.random() * 16; flashT = 0; flashK = 0.5 + Math.random() * 0.5;
    // the bolt itself, somewhere out over the town: a jagged line from the clouds down
    const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 120, x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d, pts = [];
    let px = x, py = 170, pz = z;
    while (py > 10) { const nx = px + (Math.random() - 0.5) * 16, ny = py - 8 - Math.random() * 10, nz = pz + (Math.random() - 0.5) * 16; pts.push(px, py, pz, nx, ny, nz); if (Math.random() < 0.25) pts.push(nx, ny, nz, nx + (Math.random() - 0.5) * 24, ny - 12, nz + (Math.random() - 0.5) * 24); px = nx; py = ny; pz = nz; }
    boltLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); boltLine.geometry.computeBoundingSphere();
    sound.thunder(flashK, d / 120);
  }
  if (flashT >= 0) {
    flashT += dt;
    // two or three quick pulses
    const f = flashT < 0.07 ? 1 : flashT < 0.13 ? 0.15 : flashT < 0.2 ? 0.8 : flashT < 0.32 ? 0.3 * (1 - (flashT - 0.2) / 0.12) : 0;
    const k = f * flashK * (1 - 0.8 * indoorK);
    bolt.intensity = k * 7; boltLine.material.opacity = Math.min(1, f * 1.5);
    if (flashT > 0.35) { flashT = -1; bolt.intensity = 0; boltLine.material.opacity = 0; }
  }
}

// ---------- per-frame ----------
function play(dt) {
  // behind the wheel: the car takes the keys, the camera follows it, the HUD shows the speed
  if (driving?.car) {
    driving.update(dt, input, api, daylight);
    expresswayEnds();
    // switching view: start looking straight ahead
    if (driving.car && driving.view !== lastView) { cam.yaw = driving.car.rotation.y + Math.PI; lastView = driving.view; }
    // in the cabin view the camera sits at your eyes, so hide your own body
    player.group.visible = !(driving.car && driving.view === 'inside' && !driving.busy);
    updateCamera(dt);
    if (driving.car && !driving.busy) ui.showPrompt('E · Get out of the car'); else ui.hidePrompt();
    ui.setLoc('運転中', `Driving · ${Math.round(Math.abs(driving.speed) * 3.6)} km/h · ${hhmm()}`);
    sound.setRoom(null);
    sound.setCar(!!driving.car, driving.car?.position);
    if (driving.car && !driving.busy) {
      if (input.hit('KeyR')) ui.toast(`Radio · ${sound.music?.nextStation() ?? ''}`);
      // wipers sweep while it rains
      if (rainNow() > 0.12 && (wipeT -= dt) <= 0) { wipeT = 1.3 - rainNow() * 0.5; sound.wipe(); }
    }
    if (input.hit('KeyH')) { settings.help = !settings.help; saveSettings(); applySettings(); }
    if (input.hit('KeyM')) ui.setMuted(sound.toggleMute());
    if (input.hit('KeyJ')) jumpTime();
    if (input.hit('Tab')) openMap(!minimap.open);
    // Esc at the wheel: close the map if it's open, else pause
    if (input.hit('Escape')) { if (minimap.open) openMap(false); else openPause(); }
    return;
  }
  if (!driving?.car) sound.setCar(false);
  // O: straight to the sound settings (through the pause menu); Esc with nothing open: pause
  if (input.hit('KeyO') && !ui.dialogOpen && !menu.open) { openPause(); openSettings(() => { $('pause').classList.remove('hidden'); renderPause(); }, 2); $('pause').classList.add('hidden'); return; }
  if (input.hit('Escape') && minimap.open) openMap(false);
  else if (minimap.open && input.hit('Space')) minimap.centreOnYou();
  else if (input.hit('Escape') && !ui.dialogOpen && !menu.open && !activity) { openPause(); return; }
  if (menu.open) menuInput(dt);
  else if (input.hit('KeyC') && !ui.dialogOpen) openMenu();
  let f = 0, s = 0;
  const busy = ui.dialogOpen || menu.open || minimap.open || !!activity;
  const eHit = input.hit('KeyE');
  let used = false;
  if (ui.choice) used = ui.choiceInput(input.hit('KeyW') || input.hit('ArrowUp'), input.hit('KeyS') || input.hit('ArrowDown'), eHit || input.hit('Enter'));
  if (activity) { used = true; if (activity.update(dt, eHit, api) === false) { activity.end?.(api); activity = null; ui.hidePrompt(); } }
  if (!busy) {
    if (input.down('KeyW', 'ArrowUp')) f += 1;
    if (input.down('KeyS', 'ArrowDown')) f -= 1;
    if (input.down('KeyD', 'ArrowRight')) s += 1;
    if (input.down('KeyA', 'ArrowLeft')) s -= 1;
  }
  const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
  move.set(-sy * f + cy * s, -cy * f - sy * s);
  if (move.lengthSq() > 1) move.normalize();
  player.update(dt, move, input.down('ShiftLeft', 'ShiftRight'), {
    colliders: world.colliders, groundY, bounds: BOUNDS,
    onStep: (run) => {
      const q = player.group.position, gy = groundY(q.x, q.z, q.y);
      sound.step(run, surfaceAt(q));
      rain.splash(q.x, gy + 0.012, q.z);
      rain.splashAt(q.x + (Math.random() - 0.5) * 0.2, gy + 0.02, q.z + (Math.random() - 0.5) * 0.2, run ? 9 : 5);
    },
  });
  // V: through your own eyes ↔ from behind
  if (!busy && input.hit('KeyV')) setView(cam.mode === 'first' ? 'third' : 'first');
  // first person: the body turns to where you look when you're standing still
  if (cam.mode === 'first' && !player.seated && move.lengthSq() < 0.01 && !player.gest) {
    const want = cam.yaw + Math.PI, d = Math.atan2(Math.sin(want - player.heading), Math.cos(want - player.heading));
    player.heading += d * Math.min(1, dt * 10); player.group.rotation.y = player.heading;
  }
  updateCamera(dt);

  const p = player.group.position;
  // inside a room: its own sound, its name on the HUD
  const room = roomAt(p);
  sound.setRoom(room?.amb ?? null, room);
  // a roof right above you (an awning, a canopy): the rain drums on it
  sound.setShelter(!room && rain.surfaces.some((r) => p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1 && r.y > p.y + 1.2 && r.y < p.y + 7));
  // the platform melody when a train pulls in while you're at the station
  const stopped = !!world.sound.trainStopped;
  if (stopped && !trainWas && (room?.amb === 'station' || (p.y > 6 && Math.abs(p.z + 155) < 8))) sound.departure();
  trainWas = stopped;
  foley(dt);
  indoorK += ((room && room.amb !== 'shotengai' ? 1 : 0) - indoorK) * Math.min(1, dt * 3);
  // inside, the real ceiling lights do the work: the painted-on glow fades, and corners get their occlusion
  const glowK = 1 - 0.85 * indoorK;
  if (Math.abs(glowK - lastGlow) > 0.01) { setInteriorGlow(glowK); lastGlow = glowK; }
  ao.enabled = indoorK > 0.5 && quality >= 2; // costs a few ms, so only on the top quality setting
  const place = room ? [room.jp, room.name] : p.x > 600 ? ['月野', 'Tsukino'] : p.y > 6 && Math.abs(p.z + 155) < 6 ? ['星見駅', 'Hoshimi Station platform'] : p.y > 6 ? ['屋上', 'Apartment rooftop'] : ['星見通り', 'Hoshimi Street'];
  ui.setLoc(place[0], `${place[1]} · ${hhmm()} · ${weatherWord()}`);
  if (player.seated && !busy && (f || s)) player.stand();
  let near = null, best = Infinity;
  for (const it of world.interactables) {
    if (it.hidden?.()) continue;
    if (Math.abs((it.pos.y || 0) - p.y) > 2.5) continue; // the bridge is above the street
    const d = Math.hypot(it.pos.x - p.x, it.pos.z - p.z);
    if (d < it.r && d < best) { best = d; near = it; }
  }
  if (player.seated && !busy) ui.showPrompt('Stand up');
  else if (near && !busy) ui.showPrompt(near.label); else if (!activity) ui.hidePrompt();
  if (eHit && !used && !menu.open) {
    if (ui.dialogOpen) ui.advance();
    else if (player.seated) player.stand();
    else if (near) {
      const it = near;
      // the body joins in: press the button, pick it up, open the door, or talk while the words are up
      const g = gestureFor(it);
      if (g && !it.sit) player.gesture(g, { face: it.faceYaw ?? Math.atan2(it.pos.x - p.x, it.pos.z - p.z), loop: g === 'talk', at: g === 'open' ? 0.4 : 0, rate: ['talk', 'sing'].includes(g) ? 1 : 1.25, then: /drink|beer/i.test(String(it.label)) ? 'drink' : null });
      const done = () => { if (g === 'talk') player.stopGesture('talk'); };
      // something with a price: pay first (it's the label that says how much)
      const price = priceOf(it.label);
      if (price && !economy.pay(price, it.label.replace(/\s*¥.*$/, ''))) { if (g) player.stopGesture(g, true); return; }
      if (it.sit) { player.sit(it.sit); it.onSit?.(api); }
      else if (it.action) { const lines = it.action(api); if (lines) ui.openDialog(lines, done); else if (g === 'talk') player.stopGesture('talk', true); }
      else {
        const lines = typeof it.lines === 'function' ? it.lines(api) : it.lines;
        it.onStart?.(sound);
        ui.openDialog(lines, () => { done(); it.onDone?.(sound, api); });
      }
    }
  }
  if (input.hit('KeyH')) { settings.help = !settings.help; saveSettings(); applySettings(); }
  if (input.hit('KeyM')) ui.setMuted(sound.toggleMute());
  if (input.hit('Tab')) openMap(!minimap.open);
  if (input.hit('KeyI') && !ui.dialogOpen && !menu.open) economy.openMenu();
  if (input.hit('KeyR')) setWeather((weather + 1) % WEATHER.length);
  if (input.hit('KeyJ')) jumpTime();
  if (input.hit('KeyG')) setQuality((quality + QUALITY.length - 1) % QUALITY.length);
}

// if the first seconds of play run slow, render at a lower resolution
let perfT = 0, perfN = 0, perfDone = false;
// ---------- weather (R) and graphics quality (G) ----------
const load = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : +v; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, String(v)); } catch { /* storage unavailable */ } };
// 'Automatic' changes by itself: short spells (about 15–40 game minutes, 1.5–4 real minutes) of clear sky,
// overcast, drizzle, rain and the odd downpour, one leading to the next the way weather does, eased in and out
const WEATHER = [
  { name: 'Automatic (random)', k: 1, fog: 0.03, auto: true },
  { name: 'Heavy rain', k: 1, fog: 0.03 },
  { name: 'Drizzle', k: 0.28, fog: 0.025 },
  { name: 'Fog', k: 0.12, fog: 0.058 },
  { name: 'Clear', k: 0, fog: 0.016 },
  { name: 'Thunderstorm', k: 1, fog: 0.032, storm: true },
];
let weather = 0;
function setWeather(i, announce = true) {
  weather = Math.max(0, Math.min(WEATHER.length - 1, i | 0));
  const w = WEATHER[weather];
  for (const o of world.fx.far || []) o.visible = w.fog < 0.05;
  save('ameyoru.weather2', weather);
  applyAtmos();
  if (announce) ui.toast(`Weather: ${w.name} · R`);
}

// the spells: how hard it rains, how cloudy the sky is, a little extra haze; and where each one tends to go next
const SPELLS = {
  cerah: { k: 0, cloud: 0.1, fog: 0, next: { mendung: 0.6, gerimis: 0.4 } },
  mendung: { k: 0, cloud: 0.85, fog: 0.004, next: { cerah: 0.35, gerimis: 0.4, hujan: 0.25 } },
  gerimis: { k: 0.26, cloud: 1, fog: 0.006, next: { mendung: 0.35, hujan: 0.45, cerah: 0.2 } },
  hujan: { k: 0.62, cloud: 1, fog: 0.01, next: { gerimis: 0.45, deras: 0.3, mendung: 0.25 } },
  deras: { k: 1, cloud: 1, fog: 0.014, next: { hujan: 0.5, gerimis: 0.3, badai: 0.2 } },
  badai: { k: 1, cloud: 1, fog: 0.016, storm: true, next: { deras: 0.6, hujan: 0.4 } },   // thunderstorm
};
const pickFrom = (w) => { let r = Math.random() * Object.values(w).reduce((a, b) => a + b, 0); for (const [k, v] of Object.entries(w)) if ((r -= v) <= 0) return k; return Object.keys(w)[0]; };
const sky = { spell: pickFrom({ cerah: 0.2, mendung: 0.25, gerimis: 0.2, hujan: 0.25, deras: 0.1 }), left: 0, k: 0, cloud: 0, fog: 0 };
sky.left = 15 + Math.random() * 25;
{ const S = SPELLS[sky.spell]; sky.k = S.k; sky.cloud = S.cloud; sky.fog = S.fog; } // the first spell is already there
// dm: game minutes gone by
function skyTick(dm) {
  if ((sky.left -= dm) <= 0) { sky.spell = pickFrom(SPELLS[sky.spell].next); sky.left = 15 + Math.random() * 25; }
  // ease towards the spell: rain picks up or dies down over ~4 game minutes (about 25 s)
  const S = SPELLS[sky.spell], e = 1 - Math.exp(-dm / 4);
  sky.k += (S.k - sky.k) * e; sky.cloud += (S.cloud - sky.cloud) * e; sky.fog += (S.fog - sky.fog) * e;
  if (sky.k < 0.004) sky.k = 0;
}

// ---------- the night goes on: 23:52 → dawn; the rain eases off towards morning ----------
let wetness = sky.k > 0.05 ? 1 : 0.6; // how wet the streets are (1 soaked, 0 dry)
let gameMin = 23 * 60 + 52, daylight = 0, rainFade = 1, indoorK = 0, lastGlow = 1;
const NIGHT_FOG = new THREE.Color(0x0d1426), DAWN_FOG = new THREE.Color(0x9aa4b2), WARM_FOG = new THREE.Color(0xc8a088), NIGHT_BG = new THREE.Color(0x05070d), DAWN_BG = new THREE.Color(0x9aa6b8);
const clockMin = () => ((gameMin % 1440) + 1440) % 1440;
const ss = THREE.MathUtils.smoothstep;
const bell = (m, c, w) => Math.max(0, 1 - Math.abs(m - c) / w);
let warm = 0;
const sunDir = new THREE.Vector3();
function tickClock(dt) {
  const fast = input.down('KeyT') && mode === 'play';
  const dm = (dt * (fast ? 400 : 10)) / 60;
  gameMin += dm;
  skyTick(dm);
  // the streets get wet within a few minutes of rain, and dry slowly once it stops (faster by day)
  const rk = rainNow();
  if (rk > 0.05) wetness += (1 - wetness) * (1 - Math.exp(-dm * rk / 2.5));
  else wetness = Math.max(0, wetness - dm / (daylight > 0.5 ? 40 : 80));
  world?.setWet(wetness);
  const m = clockMin();
  // 04:40 → 06:40 sunrise, day until 17:00, dusk until 19:10, then night
  daylight = ss(m, 280, 400) * (1 - ss(m, 1020, 1150));
  warm = Math.max(bell(m, 345, 70), bell(m, 1085, 75)) * 0.9;
  rainFade = sky.k;
  applyAtmos();
}
// jump the clock: night → dawn → morning → noon → dusk
const TIMES = [['Night', 23 * 60 + 52], ['Dawn', 5 * 60 + 30], ['Morning', 8 * 60], ['Noon', 13 * 60], ['Dusk', 17 * 60 + 50]];
let timeIdx = 0;
function jumpTime() {
  timeIdx = (timeIdx + 1) % TIMES.length;
  ui.fade(() => { gameMin = TIMES[timeIdx][1]; tickClock(0); ui.toast(`${TIMES[timeIdx][0]} · ${hhmm()} · J`); }, 0.3);
}
function applyAtmos() {
  if (!world || !rain) return;
  const w = WEATHER[weather], rk = w.auto ? rainFade : w.k;
  rain.setIntensity(rk); sound.setRain(rk);
  const fog = (w.auto ? 0.016 + 0.014 * rainFade + sky.fog : w.fog) * (1 - 0.5 * daylight);
  // indoors: hardly any haze, and a gentler bloom so white walls and tiles don't glow milky
  scene.fog.density = fog * (1 - 0.75 * indoorK); rain.setFog(fog);
  bloom.strength = (0.55 - 0.3 * indoorK) * (1 - 0.5 * daylight); bloom.threshold = 0.8 + 0.25 * indoorK + 0.2 * daylight;
  // characters roll off just under where the bloom starts (vrmtone.js)
  TONE.uCeil.value = bloom.threshold - 0.04 + 0.25 * daylight;
  renderer.toneMappingExposure = (1.05 - 0.15 * daylight) * (1 - 0.18 * indoorK);
  // nothing past the point where the fog has swallowed it gets drawn
  // up on the Sky Deck the whole town is in view: draw it further out (the haze is thinner up there too, indoorK)
  const deck = player && roomAt(player.group.position)?.amb === 'skydeck';
  // (and the street puddles' mirror is no use from up there)
  if (deck !== onDeck) { onDeck = deck; world.setReflections(deck ? false : QUALITY[quality].reflect && !MOBILE); }
  NORTH.setMist?.(Math.max(bell(clockMin(), 330, 120) * (1 - 0.85 * daylight), w.fog > 0.05 ? 0.8 : 0));
  // (a phone draws a shorter way out — the fog hides it — so less of the town is on its GPU at once)
  world.setCull(deck ? (MOBILE ? 120 : 230) : THREE.MathUtils.clamp(1.8 / fog, 50, 140) * (quality === 0 ? 0.8 : 1) * (MOBILE ? 0.6 : 1));
  scene.fog.color.lerpColors(NIGHT_FOG, DAWN_FOG, daylight).lerp(WARM_FOG, warm * 0.5); scene.background.lerpColors(NIGHT_BG, DAWN_BG, daylight);
  // the sun's path: up in the east at 06:00, high at noon, down in the west at 18:00
  const a = ((clockMin() - 360) / 720) * Math.PI;
  sunDir.set(Math.cos(a) * 0.85, Math.max(0.06, Math.sin(a)), 0.45).normalize();
  world.setDaylight(daylight, warm, 1 - (w.auto ? sky.cloud : Math.min(1, rk * 1.5)), sunDir);
  world.fx.daylight = daylight;
  setVehicleNight(1 - daylight);
}
const hhmm = () => { const m = Math.floor(clockMin()); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
function weatherWord() {
  const w = WEATHER[weather], k = w.auto ? rainFade : w.k;
  if (w.name === 'Fog') return 'fog';
  if (k < 0.05) {
    if (w.auto && sky.cloud > 0.5) return 'overcast';
    return daylight > 0.5 ? 'clear' : 'clear, starry';
  }
  return k < 0.35 ? 'drizzle' : k > 0.85 ? 'heavy rain' : 'rain';
}
api.sleep = (then) => ui.fade(() => { gameMin = 23 * 60 + 52; economy?.newNight(); then?.(); ui.toast('The next night… 23:52'); }, 0.8);
const QUALITY = [
  { name: 'Low', pr: 0.75, bloom: false, shadows: false, reflect: false },
  { name: 'Medium', pr: 1, bloom: true, shadows: true, reflect: true },
  { name: 'High', pr: Math.min(devicePixelRatio, 1.5), bloom: true, shadows: true, reflect: true },
];
let quality = MOBILE ? 1 : 2;   // a phone starts on Medium (render at 1× the screen's pixels); it can still choose
function setQuality(i, announce = true) {
  quality = Math.max(0, Math.min(QUALITY.length - 1, i | 0));
  const q = QUALITY[quality];
  renderer.setPixelRatio(q.pr); composer.setPixelRatio(q.pr); composer.setSize(innerWidth, innerHeight);
  bloom.enabled = q.bloom;
  world.setReflections(q.reflect && !MOBILE);   // no road mirror on a phone: it draws the whole town a second time
  applyAtmos();
  let changed = false;
  world.setShadows(q.shadows && !MOBILE); changed = true;   // no moving shadows on a phone: half the shader programs
  if (changed) scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
  if (announce) { save('ameyoru.quality', quality); ui.toast(`Graphics: ${q.name} · G`); }
}

function adapt(dt) {
  if (perfDone) return;
  perfT += dt; perfN++;
  if (perfT < 4) return;
  perfDone = true;
  const fps = perfN / perfT;
  // drop a quality step on slow machines, unless the player picked one themselves
  if (localStorage.getItem('ameyoru.quality') === null) { if (fps < 25) setQuality(0, false); else if (fps < 40) setQuality(1, false); }
  console.info(`[ameyoru] ${fps.toFixed(0)} fps during warm-up`);
}

const clock = new THREE.Clock();
let frameNo = 0;
function loop() {
  requestAnimationFrame(loop);
  step(Math.min(clock.getDelta(), 0.05));
}
// ---------- getting everything ready behind the loading screen ----------
async function prepareAll() {
  // 1. the townspeople (VRM characters) finish loading
  const t0 = performance.now();
  console.time('[ameyoru] prepare');
  const tPeople = ui.task('住人', 'Townsfolk (VRM)');
  while ((!npcs.ready || !walkers.ready) && performance.now() - t0 < 120000) {
    const k = (npcs.progress + walkers.progress) / 2;
    ui.progress(0.86 + k * 0.06, `Loading townsfolk… ${Math.round(k * 100)}%`);
    await new Promise((r) => setTimeout(r, 200));
  }
  tPeople.done(`${npcs.roots?.().length ?? 0} in shops · ${walkers.roots?.().length ?? 0} pedestrian bodies`);
  // 2. watch the city run for a few seconds (quickly, without drawing) and merge whatever stands still
  ui.progress(0.92, 'Tidying the city…'); await frame();
  const tFreeze = ui.task('最適化', 'Tidying the city');
  world.freezer.begin();
  for (let i = 0; i < 110; i++) { t += 1 / 30; world.update(t, 1 / 30, player.group.position); if (i % 20 === 0) await frame(); }
  const fr = world.freezer.finish(); freezeState = 'done';
  console.info('[ameyoru] froze', fr.removed, 'meshes into', fr.made);
  tFreeze.done(`${fr.removed.toLocaleString('en-US')} parts → ${fr.made} groups`);
  const tGpu = ui.task('描画', 'Shaders & textures to the GPU');
  // 3. compile every shader and upload every texture and mesh to the GPU: draw the whole world once, all of it,
  //    with everything that's normally hidden or culled switched on
  ui.progress(0.95, 'Preparing HD graphics…'); await frame();
  warmed = true;
  if (npcs.ready) world.reflectSkip.push(...npcs.roots());
  if (walkers.ready) world.reflectSkip.push(...walkers.roots());
  // everything that's hidden right now (rooms' extras, far furniture, idle characters, cars waiting off-screen, the
  // food that appears when you order) is shown for this one frame, so it's all on the GPU before you meet it.
  // Not on a phone: the whole town on the GPU at once is more than a phone browser allows (Safari closes the page);
  // there things go up as they come into view.
  const hidden = [], culled = [];
  if (!MOBILE) {
    scene.traverse((o) => { if (!o.visible) hidden.push(o); });
    for (const o of hidden) o.visible = true;
    scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine) && o.frustumCulled) { o.frustumCulled = false; culled.push(o); } });
    camera.layers.enable(1);
  }
  const aoWas = ao.enabled; ao.enabled = quality >= 2;
  // (a phone compiles each shader when it's first needed: all ~360 at once is another spike it can't take)
  if (!MOBILE) { try { await renderer.compileAsync(scene, camera); } catch { renderer.compile(scene, camera); } }
  ui.progress(0.98, 'Preparing HD graphics…'); await frame();
  scene.updateMatrixWorld();
  renderer.shadowMap.needsUpdate = true;
  const tw = performance.now();
  if (innerWidth && innerHeight) composer.render();
  else {
    // the page has no size yet (a hidden tab): draw into a small offscreen target, which uploads just the same
    const rt = new THREE.WebGLRenderTarget(256, 144);
    renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.setRenderTarget(null); rt.dispose();
  }
  console.info('[ameyoru] warm-up frame', Math.round(performance.now() - tw), 'ms');
  camera.layers.disable(1); ao.enabled = aoWas;
  for (const o of culled) o.frustumCulled = true;
  for (const o of hidden) o.visible = false;
  await frame();
  tGpu.done(`${renderer.info.programs?.length ?? 0} shader programs · ${renderer.info.memory.textures} textures`);
  console.timeEnd('[ameyoru] prepare');
}

// ---------- freezing the static city (freeze.js) ----------
// watch every mesh for a few seconds (behind the title if we can), then merge whatever stood still
let freezeT = 0, freezeState = 'idle';
function freezeTick(dt) {
  if (freezeState === 'done' || !world?.freezer) return;
  freezeT += dt;
  if (freezeState === 'idle' && freezeT > 0.6) { world.freezer.begin(); freezeState = 'watch'; freezeT = 0; }
  else if (freezeState === 'watch' && freezeT > 3.5) {
    const r = world.freezer.finish(); freezeState = 'done';
    console.info('[ameyoru] froze', r.removed, 'meshes into', r.made);
  }
}

// ---------- shader warm-up ----------
// once the characters and furniture have loaded, compile every material they use in one go (behind the title,
// ideally), so nothing stutters the first time it comes into view; people also stay out of the road's reflection
let warmed = false;
function warmUp() {
  warmed = true;
  world.reflectSkip.push(...npcs.roots());
  const hidden = [...PLACED, ...npcs.roots()].filter((o) => !o.visible);
  for (const o of hidden) o.visible = true;
  try { renderer.compile(scene, camera); } catch (e) { console.warn('[ameyoru] warm-up', e); }
  for (const o of hidden) o.visible = false;
}

// how far along the ray (o + d·t, 0 ≤ t ≤ far) it first enters one of the world's camera obstacles, else Infinity
const CAM_R = 0.18; // the camera keeps this far off them
function poleHit(o, d, far) {
  let best = Infinity;
  for (const b of world.camObs || []) {
    // quick reject: nowhere near the segment
    if (Math.abs(b.minX - o.x) > far + 1.5 || Math.abs(b.minZ - o.z) > far + 1.5) continue;
    let t0 = 0, t1 = far;
    for (const [oo, dd, lo, hi] of [[o.x, d.x, b.minX - CAM_R, b.maxX + CAM_R], [o.y, d.y, b.minY, b.maxY + CAM_R], [o.z, d.z, b.minZ - CAM_R, b.maxZ + CAM_R]]) {
      if (Math.abs(dd) < 1e-6) { if (oo < lo || oo > hi) { t0 = Infinity; break; } continue; }
      let a = (lo - oo) / dd, c = (hi - oo) / dd; if (a > c) [a, c] = [c, a];
      if (a > t0) t0 = a; if (c < t1) t1 = c;
      if (t0 > t1) { t0 = Infinity; break; }
    }
    // starting inside one (standing right against a pole) doesn't count
    if (t0 > 0.05 && t0 < best) best = t0;
  }
  return best;
}

// ---------- sound helpers ----------
const earDir = new THREE.Vector3();
let wipeT = 0, trainWas = false;
const rainNow = () => { const w = WEATHER[weather]; return w.auto ? rainFade : w.k; };
// what your feet are on
const FLOOR_SOUND = { konbini: 'tile', station: 'tile', ramen: 'tile', shotengai: 'tile', arcade: 'carpet', karaoke: 'carpet', pachinko: 'carpet', quiet: 'wood', kissa: 'wood', izakaya: 'wood', laundry: 'tile', gacha: 'tile' };
function surfaceAt(q) {
  const room = roomAt(q);
  if (room) return FLOOR_SOUND[room.amb] ?? 'tile';
  if (q.y > 0.4 && bridgeY(q.x, q.z) !== null) return 'metal';
  if (q.y > 3) return 'tile';
  return wetness > 0.3 ? 'wet' : 'tile';
}
// small sounds for what the character does: buttons, cans, phone taps, chairs and beds
const fol = { g: null, ph: null, t: 0 };
function foley(dt) {
  const g = player.gest && !player.gest.end ? player.gest.k : null;
  if (g !== fol.g) {
    fol.g = g;
    if (g === 'push') sound.click(0.5);
    else if (g === 'drink') { sound.canOpen(0.45); sound.gulp(3.9); }
    else if (g === 'pick') sound.rustle(0.6);
    else if (g === 'open') sound.rustle(0.2, 0.6);
  }
  if (g === 'text' && player.gest.w > 0.5 && (fol.t -= dt) <= 0) { fol.t = 0.08 + Math.random() * (Math.random() < 0.15 ? 1.2 : 0.25); sound.tap(); }
  const ph = player.chair?.phase ?? null;
  if (ph !== fol.ph) {
    if (ph === 'down') sound.creak(player.seat?.lie ? 'bed' : 'chair', 1.7);
    else if (ph === 'lie') { sound.creak('bed', 0.9); sound.rustle(1.4, 1.5); }
    else if (ph === 'up') sound.creak('chair', 0.6);
    fol.ph = ph;
  }
}
// ---------- settings: from the pause menu, the title screen (and O, which opens the sound tab) ----------
const SET_KEY = 'ameyoru.settings';
const SET_DEFAULT = { fov: 0, dof: !MOBILE, lens: true, fps: false, sens: 1, invertY: false, help: true, minimap: true };
const settings = { ...SET_DEFAULT, ...(() => { try { return JSON.parse(localStorage.getItem(SET_KEY)) || {}; } catch { return {}; } })() };
const saveSettings = () => { try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch { /* storage unavailable */ } };
function applySettings() {
  dof.enabled = settings.dof;
  $('fps').classList.toggle('hidden', !settings.fps);
  $('controls').classList.toggle('hidden', !settings.help);
  minimap?.setMini(settings.minimap);
}
const pct = (v) => `${Math.round(v)}%`;
const vol = (k, label, hint) => ({ label, hint, type: 'range', min: 0, max: 100, step: 5, fmt: pct, get: () => Math.round(sound.vol[k] * 100), set: (v) => sound.setVolume(k, v / 100) });
const ST_TABS = [
  ['Graphics', [
    { label: 'Graphics quality', hint: 'Automatic adjusts to your device\'s speed', type: 'choice', opts: ['Automatic', 'Low', 'Medium', 'High'],
      get: () => (localStorage.getItem('ameyoru.quality') === null ? 0 : quality + 1),
      set: (i) => { if (i === 0) { localStorage.removeItem('ameyoru.quality'); setQuality(MOBILE ? 1 : 2, false); perfDone = false; perfT = 0; perfN = 0; } else { setQuality(i - 1, false); save('ameyoru.quality', i - 1); } } },
    { k: 'fov', label: 'Field of view', hint: 'How wide the camera sees', type: 'range', min: -10, max: 15, step: 1, fmt: (v) => (v ? `${v > 0 ? '+' : ''}${v}°` : 'Standard') },
    { k: 'dof', label: 'Depth of field', hint: 'The far background softly blurred, like a camera lens', type: 'toggle' },
    { k: 'lens', label: 'Raindrops on the lens', hint: 'Water beads on the camera when it rains', type: 'toggle' },
    { k: 'fps', label: 'Show FPS', hint: 'Frames per second at the top of the screen', type: 'toggle' },
  ]],
  ['Controls', [
    { k: 'sens', label: 'Mouse sensitivity', hint: 'How fast the camera turns', type: 'range', min: 0.3, max: 2, step: 0.1, fmt: (v) => `${v.toFixed(1)}×` },
    { k: 'invertY', label: 'Invert Y axis', hint: 'Mouse up = camera looks down', type: 'toggle' },
    { label: 'Camera', hint: 'Can also be switched any time with V', type: 'choice', opts: ['Behind', 'Eyes'], get: () => (cam.mode === 'first' ? 1 : 0), set: (i) => setView(i ? 'first' : 'third') },
  ]],
  ['Sound', [
    vol('master', 'Master', 'All sound at once'), vol('music', 'Music', 'Background music & car radio'), vol('amb', 'Ambience', 'Rain, town, shops'),
    vol('sfx', 'Effects', 'Footsteps, doors, machines'), vol('voice', 'Voices', 'Chatter in shops & on the street'),
  ]],
  ['Display', [
    { k: 'help', label: 'Controls panel', hint: 'Key list at the top right (also the H key)', type: 'toggle' },
    { k: 'minimap', label: 'Minimap', hint: 'Round map in the bottom right corner', type: 'toggle' },
  ]],
];
const stUI = { open: false, tab: 0, sel: 0, back: null };
const stGet = (r) => (r.get ? r.get() : settings[r.k]);
function stSet(r, v) {
  if (r.set) r.set(v); else { settings[r.k] = v; saveSettings(); applySettings(); }
}
function stStep(r, dir) {
  if (r.type === 'toggle') stSet(r, !stGet(r));
  else if (r.type === 'choice') stSet(r, (stGet(r) + dir + r.opts.length) % r.opts.length);
  else stSet(r, Math.round(THREE.MathUtils.clamp(stGet(r) + dir * r.step, r.min, r.max) / r.step) * r.step);
  renderSettings();
}
function renderSettings() {
  $('stTabs').innerHTML = '';
  ST_TABS.forEach(([name], i) => {
    const b = document.createElement('button'); b.textContent = name; b.className = i === stUI.tab ? 'on' : '';
    b.addEventListener('click', () => { stUI.tab = i; stUI.sel = 0; renderSettings(); });
    $('stTabs').appendChild(b);
  });
  const box = $('stRows'); box.innerHTML = '';
  ST_TABS[stUI.tab][1].forEach((r, i) => {
    const row = document.createElement('div'); row.className = 'st-row' + (i === stUI.sel ? ' sel' : '');
    const v = stGet(r);
    let ctl = '';
    if (r.type === 'toggle') ctl = `<button class="st-tog${v ? ' on' : ''}" aria-label="${r.label}"></button><span class="tx">${v ? 'On' : 'Off'}</span>`;
    else if (r.type === 'choice') ctl = `<button class="arr" data-d="-1" aria-label="previous">‹</button><span class="v">${r.opts[v]}</span><button class="arr" data-d="1" aria-label="next">›</button>`;
    else ctl = `<input type="range" min="${r.min}" max="${r.max}" step="${r.step}" value="${v}" aria-label="${r.label}"><span class="num">${r.fmt(v)}</span>`;
    row.innerHTML = `<div class="lbl"><b>${r.label}</b><i>${r.hint || ''}</i></div><div class="st-val">${ctl}</div>`;
    row.addEventListener('mouseenter', () => { stUI.sel = i; for (const [j, el] of [...box.children].entries()) el.classList.toggle('sel', j === i); });
    row.querySelector('.st-tog')?.addEventListener('click', () => stStep(r, 1));
    row.querySelectorAll('.arr').forEach((b) => b.addEventListener('click', () => stStep(r, +b.dataset.d)));
    const inp = row.querySelector('input');
    if (inp) {
      inp.addEventListener('input', () => { stSet(r, +inp.value); row.querySelector('.num').textContent = r.fmt(+inp.value); });
      inp.addEventListener('change', () => inp.blur());
    }
    box.appendChild(row);
  });
}
function openSettings(back, tab = 0) {
  stUI.open = true; stUI.back = back; stUI.tab = tab; stUI.sel = 0;
  $('settings').classList.remove('hidden'); renderSettings();
}
function closeSettings() {
  stUI.open = false; $('settings').classList.add('hidden'); document.activeElement?.blur?.();
  stUI.back?.();
}
$('stReset').addEventListener('click', () => {
  Object.assign(settings, SET_DEFAULT); saveSettings(); applySettings();
  for (const k of ['music', 'amb', 'sfx', 'voice', 'master']) sound.setVolume(k, { music: 0.55, amb: 0.85, sfx: 0.9, voice: 0.8, master: 0.9 }[k]);
  localStorage.removeItem('ameyoru.quality'); setQuality(MOBILE ? 1 : 2, false);
  renderSettings(); ui.toast('Settings reset to defaults');
});
function settingsInput() {
  const rows = ST_TABS[stUI.tab][1];
  if (input.hit('Escape') || input.hit('Backspace')) { closeSettings(); return; }
  if (input.hit('KeyE') || input.hit('BracketRight')) { stUI.tab = (stUI.tab + 1) % ST_TABS.length; stUI.sel = 0; renderSettings(); }
  if (input.hit('KeyQ') || input.hit('BracketLeft')) { stUI.tab = (stUI.tab + ST_TABS.length - 1) % ST_TABS.length; stUI.sel = 0; renderSettings(); }
  if (input.hit('ArrowDown') || input.hit('KeyS')) { stUI.sel = (stUI.sel + 1) % rows.length; renderSettings(); }
  if (input.hit('ArrowUp') || input.hit('KeyW')) { stUI.sel = (stUI.sel + rows.length - 1) % rows.length; renderSettings(); }
  if (input.hit('ArrowRight') || input.hit('KeyD')) stStep(rows[stUI.sel], 1);
  if (input.hit('ArrowLeft') || input.hit('KeyA')) stStep(rows[stUI.sel], -1);
  if ((input.hit('Enter') || input.hit('Space')) && rows[stUI.sel].type === 'toggle') stStep(rows[stUI.sel], 1);
}

// ---------- pause (Esc): the town stops; resume, the map, settings, controls, back to the title ----------
const pz = { i: 0, note: 'night' };
const PZ_ACTS = ['resume', 'map', 'settings', 'controls', 'title'];
const JOB_LIST = [['taxi', 'Hungry taxi driver'], ['umbrella', "Mrs. Sato's blue umbrella"], ['letter', "Grandpa Mori's letter"], ['cat', 'Mochi ran off']];
function renderPause() {
  document.querySelectorAll('#pzMenu button').forEach((b, i) => b.classList.toggle('sel', i === pz.i));
  $('pzPlace').textContent = ui.locJp || '星見通り';
  $('pzSub').textContent = ui.locSub || '';
  const note = $('pzNote');
  if (pz.note === 'controls') {
    const K = [['W A S D', 'Walk / steer'], ['Shift', 'Run'], ['E', 'Look · talk · car'], ['V', 'Camera: eyes / behind'], ['C', 'Character & outfit'],
      ['Tab', 'Town map'], ['P', 'Photo mode'], ['I', 'Items & jobs'], ['R', 'Weather · radio in the car'], ['J', 'Skip time'], ['T', 'Speed up time'], ['G', 'Graphics quality'], ['O', 'Sound'], ['M', 'Mute']];
    note.innerHTML = `<h3>Controls</h3>${K.map(([k, v]) => `<div class="row"><span>${k}</span><span>${v}</span></div>`).join('')}`;
    return;
  }
  const st = economy?.st, steps = st?.jobs || {};
  const done = JOB_LIST.filter(([id]) => steps[id] === 'done').length;
  note.innerHTML = `<h3>Tonight's notes</h3>
    <div class="row"><span>Time</span><span>${hhmm()}</span></div>
    <div class="row"><span>Weather</span><span>${weatherWord()}</span></div>
    <div class="row"><span>Money</span><span>¥${(st?.yen ?? 0).toLocaleString('en-US')}</span></div>
    <div class="row"><span>Empty cans</span><span>${st?.cans ?? 0}</span></div>
    <h3 style="margin-top:14px">Odd jobs · ${done}/${JOB_LIST.length}</h3>
    ${JOB_LIST.map(([id, name]) => { const s = steps[id] ?? 'ask'; const lbl = s === 'done' ? 'done' : s === 'ask' ? 'not taken' : 'under way';
      return `<div class="job${s === 'done' ? ' done' : ''}"><span class="mk">${s === 'done' ? '✓' : s === 'ask' ? '○' : '◐'}</span><b>${name}</b><i>${lbl}</i></div>`; }).join('')}`;
}
function openPause() {
  if (mode !== 'play') return;
  mode = 'pause'; pz.i = 0; pz.note = 'night';
  if (document.pointerLockElement) document.exitPointerLock();
  ui.hidePrompt();
  sound.duck(0.35);
  $('pause').classList.remove('hidden'); renderPause();
}
function closePause(lock = true) {
  if (mode !== 'pause') return;
  mode = 'play'; $('pause').classList.add('hidden');
  clock.getDelta();   // the time spent paused doesn't count
  if (lock) lockPointer();
}
function pauseAct(act) {
  if (act === 'resume') closePause();
  else if (act === 'map') { closePause(false); openMap(true); }
  else if (act === 'settings') { $('pause').classList.add('hidden'); openSettings(() => { $('pause').classList.remove('hidden'); renderPause(); }); }
  else if (act === 'controls') { pz.note = pz.note === 'controls' ? 'night' : 'controls'; renderPause(); }
  else if (act === 'title') backToTitle();
}
document.querySelectorAll('#pzMenu button').forEach((b, i) => {
  b.addEventListener('mouseenter', () => { pz.i = i; renderPause(); });
  b.addEventListener('click', () => { pz.i = i; pauseAct(PZ_ACTS[i]); });
});
function pauseInput() {
  const n = PZ_ACTS.length;
  if (input.hit('Escape')) { closePause(); return; }
  if (input.hit('ArrowDown') || input.hit('KeyS')) { pz.i = (pz.i + 1) % n; renderPause(); }
  if (input.hit('ArrowUp') || input.hit('KeyW')) { pz.i = (pz.i + n - 1) % n; renderPause(); }
  if (input.hit('Enter') || input.hit('Space')) pauseAct(PZ_ACTS[pz.i]);
}
// back to the title: the drone takes over again (you stay where you were)
function backToTitle() {
  $('pause').classList.add('hidden');
  $('hud').classList.add('hidden');
  if (minimap.open) minimap.toggle(false);
  mode = 'title'; tmenu.i = 0; tmenu.shot = null;
  player.group.visible = false;
  const t = $('title'); t.classList.remove('hidden', 'fade');
  // replay the brand's entrance
  for (const el of t.querySelectorAll('.t-brand, #tmenu')) { el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; }
  renderTitleMenu();
  clock.getDelta();
}
// losing the mouse (Esc while it's captured) pauses, unless a menu or a dialog took it on purpose
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas || mode !== 'play') return;
  if (menu.open || ui.dialogOpen || stUI.open || minimap.open || activity) return;
  openPause();
});

// which gesture an interaction gets (an interactable can also say so itself with anim: 'push' | 'pick' | 'talk' | 'open' | null)
const GESTURE_BY_LABEL = [
  [/^(talk|ask|greet|chat|order|check in|say hi)/i, 'talk'],
  [/^(take|pick up|prize counter|check the box|look under)/i, 'pick'],
  [/^(buy|pay|trade|spin|try|photo|switch|tv|play taiko|play ufo|play)/i, 'push'],
  [/^(open|close)/i, 'open'],
];
function gestureFor(it) {
  if (it.anim !== undefined) return it.anim;
  const label = String(it.label || '');
  return GESTURE_BY_LABEL.find(([re]) => re.test(label))?.[1] ?? null;
}

// one frame of the game; the loop calls it, and the console can (window.ameyoru.step) when the tab is hidden
function step(dt) {
  if (mode === 'loading') return;
  // the settings take the keys wherever they're open (the title keeps moving behind them)
  // (a key they used — Esc closing them — isn't read again by the menu underneath in the same frame)
  const stHad = stUI.open;
  if (stHad) settingsInput();
  // paused: nothing moves, the last frame stays on screen under the frosted glass
  if (mode === 'pause') { if (!stHad) pauseInput(); input.endFrame(); return; }
  // photo mode: the town holds still, only the camera moves
  if (mode === 'photo') {
    photo.update(dt, input);
    if (input.hit('Escape') || input.hit('KeyP') || photo.wantExit) exitPhoto();
    { const pr = renderer.getPixelRatio(); dof.uniforms.cameraNear.value = camera.near; dof.uniforms.cameraFar.value = camera.far; dof.uniforms.uTexel.value.set(1 / (innerWidth * pr), 1 / (innerHeight * pr)); }
    camera.getWorldDirection(earDir); sound.setListener(camera.position, earDir);
    sound.update(dt, world.sound, player.group.position, { speed: 0, run: false });
    ui.update(dt);
    touch?.show(true); touch?.el.classList.add('photo');
    input.endFrame();
    scene.updateMatrixWorld();
    if (innerWidth && innerHeight) composer.render();
    photo?.afterRender();
    return;
  }
  if (mode === 'play' && input.hit('KeyP') && !menu.open && !ui.dialogOpen && !minimap.open && !activity && !(driving?.busy)) { enterPhoto(); input.endFrame(); return; }
  fpsTick(dt);
  t += dt;
  freezeTick(dt);
  if (mode === 'title') {
    if (!stHad) titleInput();
    const r = cine.title(dt);
    ui.titleDim(r.dim);
    if (r.name !== tmenu.shot) { tmenu.shot = r.name; document.getElementById('tshot').textContent = `${r.name} · ${hhmm()}`; }
  } else if (mode === 'intro') introStep(dt);
  else play(dt);
  // on the title the town is culled and lit around the drone, not around you
  world.update(t, dt, mode === 'title' ? titleAt.set(camera.position.x, 0.15, camera.position.z) : player.group.position);
  if (minimap) {
    // the map covers this town only (not the rooms far off, nor Tsukino)
    const q = player.group.position, here = mode === 'play' && q.x > -140 && q.x < 200 && q.z > -220 && q.z < 245;
    if (!here && minimap.open) minimap.toggle(false);
    minimap.update(q, cam.yaw, driving?.car ? driving.car.rotation.y : player.heading, here);
  }
  if (places) wayTick(dt);
  if (quests && mode === 'play') quests.update(dt, player.group.position, t);
  storm(dt, mode === 'title' ? camera.position : player.group.position);
  npcs?.update(dt, player.group.position, roomAt(player.group.position));
  walkers?.update(dt, player.group.position, daylight, rainNow(), !!roomAt(player.group.position), camera);
  if (npcs?.ready && !warmed) warmUp();
  tickClock(dt);
  world.doors.update(dt, player.group.position, sound);
  if ((frameNo++ & 1) === 0) renderer.shadowMap.needsUpdate = true;
  { const q = player.group.position, top = q.y + (player.height || 1.6) + 0.05;
    Object.assign(heroSurface, { x0: q.x - 0.2, x1: q.x + 0.2, z0: q.z - 0.2, z1: q.z + 0.2, y: top }); }
  rain.update(dt, camera.position, world.rainLights);
  film.uniforms.time.value = t;
  // the night grade fades out by day and indoors; drops gather on the lens in the rain (outside, from behind);
  // lamp and sign halos swell in rain and haze
  grade.uniforms.uNight.value = (1 - daylight) * (1 - indoorK * 0.6);
  // depth of field: focus on your character from behind (or the car), on whatever's in the middle through your
  // own eyes or from the driver's seat; much less indoors, where everything is close
  { const U = dof.uniforms, car = driving?.car;
    U.cameraNear.value = camera.near; U.cameraFar.value = camera.far;
    // the drone and the opening shot focus on what's in the middle of the picture too
    U.uAuto.value = mode === 'title' || mode === 'intro' || (cam.mode === 'first' && !car) || (car && driving.view === 'inside') ? 1 : 0;
    U.uFocus.value = car ? 6.5 : cam.cur;
    const pr = renderer.getPixelRatio(); U.uTexel.value.set(1 / (innerWidth * pr), 1 / (innerHeight * pr)); U.uMaxR.value = 6 * pr;
    U.uK.value = 1 - indoorK * 0.8; }
  { const q = player.group.position, outside = mode === 'play' && !roomAt(q) && cam.mode === 'third' && !(driving?.car && driving.view === 'inside');
    lensK += ((outside ? rainNow() : 0) - lensK) * Math.min(1, dt * (outside ? 0.35 : 2));
    lens.uniforms.uK.value = settings.lens ? lensK : 0; lens.uniforms.uTime.value = t; lens.uniforms.uAspect.value = innerWidth / Math.max(1, innerHeight); }
  world.neon?.setHalo((0.22 + rainNow() * 0.38) * (1 - 0.8 * daylight) * (1 - indoorK * 0.85), renderer.domElement.height);
  if (mode === 'play') adapt(dt);
  updateBurst(dt);
  camera.getWorldDirection(earDir); sound.setListener(camera.position, earDir);
  sound.setTime(clockMin(), daylight);
  // music dips under dialogue, a passing train and the crossing bell
  sound.duck(ui.dialogOpen ? 0.45 : world.sound.trainDist < 35 || world.sound.bell ? 0.6 : 1);
  sound.update(dt, world.sound, player.group.position, { speed: driving?.car ? 0 : player.speed, run: input.down('ShiftLeft', 'ShiftRight') });
  ui.update(dt);
  touch?.show(mode === 'play' && !minimap.open); touch?.el.classList.remove('photo');
  input.endFrame();
  // every pass (main view, puddle reflection, shadows, AO) would otherwise walk the whole scene to update matrices:
  // do it once per frame here instead
  scene.updateMatrixWorld();
  if (innerWidth && innerHeight) composer.render();
}

addEventListener('resize', () => {
  if (!innerWidth || !innerHeight) return; // hidden/minimized views report 0×0
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  scrub.uniforms.texel.value.set(1 / innerWidth, 1 / innerHeight);
  ao.setSize(innerWidth, innerHeight);
  world?.reflector.getRenderTarget().setSize(Math.round(innerWidth * 0.6), Math.round(innerHeight * 0.6));
});

boot().then(loop);
