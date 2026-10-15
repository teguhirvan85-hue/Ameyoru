// Photo-scanned PBR surfaces and the night HDRI (Poly Haven, CC0) in assets/textures.
// mat(name, u, v, opts) returns a material whose texture repeats u × v times across a face.
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { setupKTX2, ktx2Loader } from './ktx2.js';

export const SURFACES = ['asphalt_02', 'large_grey_tiles', 'concrete_floor_02', 'tiled_floor_001', 'concrete_wall_003', 'beige_wall_001', 'white_plaster_02', 'painted_plaster_wall', 'corrugated_iron', 'metal_plate',
  // interiors
  'wood_floor', 'laminate_floor_02', 'floor_tiles_06', 'interior_tiles', 'dirty_carpet', 'tatami_mat', 'ceiling_interior', 'dark_wood', 'wood_table', 'plastered_wall', 'long_white_tiles', 'linoleum_brown', 'fabric_leather_02'];

export async function loadSurfaces(renderer, onProgress) {
  // KTX2 (Basis UASTC, see tools/ktx2-surfaces.mjs): stays compressed on the GPU; the images were flipped upright
  // when encoded, as TextureLoader used to do on upload
  const loader = ktx2Loader() ?? setupKTX2(renderer);
  const sets = {};
  let done = 0;
  const total = SURFACES.length + 1;
  const tex = async (file, srgb) => {
    const t = await loader.loadAsync(`assets/textures/${file}`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.userData.keepData = true;   // copied for every repeat it's used at, each copy uploaded on its own
    return t;
  };
  await Promise.all(SURFACES.map(async (n) => {
    try {
      const [diff, nor, arm] = await Promise.all([tex(`${n}_diff.ktx2`, true), tex(`${n}_nor.ktx2`), tex(`${n}_arm.ktx2`)]);
      sets[n] = { diff, nor, arm };
    } catch (e) { console.warn('[ameyoru] surface failed', n, e); }
    onProgress?.(++done / total);
  }));

  let env = null;
  try {
    const hdr = await new RGBELoader().loadAsync('assets/textures/night_street_1k.hdr');
    const pm = new THREE.PMREMGenerator(renderer);
    env = pm.fromEquirectangular(hdr).texture;
    hdr.dispose(); pm.dispose();
  } catch (e) { console.warn('[ameyoru] hdri failed', e); }
  onProgress?.(++done / total);

  const cache = new Map();
  // wet: lowers roughness so surfaces read as rain-soaked
  function mat(name, u = 1, v = 1, { color = 0xffffff, wet = 1, normal = 1, metal = true } = {}) {
    const s = sets[name];
    if (!s) return new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
    const ru = Math.max(0.25, Math.round(u * 4) / 4), rv = Math.max(0.25, Math.round(v * 4) / 4);
    const key = `${name}|${ru}|${rv}|${color}|${wet}|${normal}`;
    if (cache.has(key)) return cache.get(key);
    const rep = (t) => { const c = t.clone(); c.repeat.set(ru, rv); c.needsUpdate = true; return c; };
    const m = new THREE.MeshStandardMaterial({
      color, map: rep(s.diff), normalMap: rep(s.nor), normalScale: new THREE.Vector2(normal, normal),
      roughnessMap: rep(s.arm), roughness: wet, aoMap: rep(s.arm), aoMapIntensity: 0.8,
      ...(metal ? { metalnessMap: rep(s.arm), metalness: 1 } : { metalness: 0 }),
    });
    m.userData.wetBase = wet; // world.setWet() takes it from this (soaked) towards 1 (dry)
    cache.set(key, m);
    return m;
  }
  return { mat, env, has: (n) => !!sets[n] };
}
