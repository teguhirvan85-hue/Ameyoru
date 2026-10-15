// Playable characters (VRM). Each one is loaded on demand, retargeted with the shared Mixamo clips, and cached.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { loadMixamoClip } from './mixamo.js';
import { tameHighlights } from './vrmtone.js';

function makeWet(vrm) {
  vrm.scene.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      // a cool fresnel rim reads as a wet sheen; swapping the matcap instead turned VRoid cloth near-black
      if (!m.isMToonMaterial || /face|eye|mouth|brow|outline/i.test(m.name)) continue;
      m.parametricRimColorFactor?.setRGB(0.2, 0.26, 0.36);
      m.parametricRimFresnelPowerFactor = 3.5;
      m.parametricRimLiftFactor = 0.05;
      m.rimLightingMixFactor = 0.6;
    }
  });
}

// Add a character: drop the .vrm (and a square thumbnail) in assets/characters and add an entry here.
// `clips` overrides the shared Mixamo animations for that character (file names in assets/anims, no extension).
export const ROSTER = [
  { id: 'ren', name: 'Ren', file: 'assets/characters/hero.vrm', thumb: 'assets/characters/hero.jpg', author: 'VRoid Project (pixiv)', license: 'Free to use · credit not required' },
  { id: 'mio', name: 'Mio', file: 'assets/characters/char2.vrm', thumb: 'assets/characters/char2.jpg', author: '6 · VRoid Hub', license: 'Free to use · credit not required', clips: { walk: 'walk_female', start: 'walk_female_start', stop: 'walk_female_stop', turn: 'turn180_female' } },
  // one character, three outfits (each a full .vrm): the menu shows them as skins under the card
  { id: 'savi', name: 'Savi', author: 'siroihakumai · VRoid Hub', license: 'Free to use · credit not required', skins: [
    { id: 'china', name: 'China', file: 'assets/characters/savi_china.vrm', thumb: 'assets/characters/savi_china.jpg' },
    { id: 'dress', name: 'Dress', file: 'assets/characters/savi_dress.vrm', thumb: 'assets/characters/savi_dress.jpg' },
    { id: 'space', name: 'Space Suit', file: 'assets/characters/savi_space.vrm', thumb: 'assets/characters/savi_space.jpg' },
  ] },
];

// the outfit a character wears: its chosen skin (remembered), or the character itself when it has none
export function skinOf(entry, i = savedSkin(entry)) {
  if (!entry.skins) return { key: entry.id, file: entry.file, thumb: entry.thumb, i: 0 };
  const k = Math.min(Math.max(0, i), entry.skins.length - 1), s = entry.skins[k];
  return { key: `${entry.id}:${s.id}`, file: s.file, thumb: s.thumb, name: s.name, i: k };
}
export function savedSkin(entry) {
  try { const id = localStorage.getItem(`ameyoru.skin.${entry.id}`); return Math.max(0, entry.skins?.findIndex((s) => s.id === id) ?? 0); } catch { return 0; }
}
export function saveSkin(entry, i) {
  try { if (entry.skins) localStorage.setItem(`ameyoru.skin.${entry.id}`, entry.skins[i].id); } catch { /* storage unavailable */ }
}

const CLIPS = { idle: 'idle', walk: 'walk', run: 'run', look: 'idle_look', carIn: 'car_enter', carOut: 'car_exit',
  stairsUp: 'stairs_up', stairsDown: 'stairs_down', sitDown: 'sit_down', sitIdle: 'sit_idle', standUp: 'stand_up', drive: 'driving',
  start: 'walk_start', stop: 'walk_stop', turn: 'turn180',
  push: 'button_push', pick: 'pick_up', talk: 'talking', open: 'open_door', text: 'texting', sing: 'singing', lie: 'lie_down', drink: 'drinking' };
// clips that keep their own travel (the game lines the character up so the hips land where they should)
const ROOTED = ['carIn', 'carOut', 'sitDown', 'sitIdle', 'standUp', 'drive', 'lie'];
const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));
const cache = new Map();

export function loadCharacter(entry, skin = skinOf(entry)) {
  if (!cache.has(skin.key)) {
    cache.set(skin.key, (async () => {
      const gltf = await loader.loadAsync(skin.file);
      const vrm = gltf.userData.vrm;
      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.combineSkeletons(gltf.scene);
      VRMUtils.rotateVRM0(vrm);
      makeWet(vrm);
      tameHighlights(vrm.scene);
      const clips = {};
      await Promise.all(Object.entries({ ...CLIPS, ...entry.clips }).map(async ([k, file]) => {
        try { clips[k] = await loadMixamoClip(`assets/anims/${file}.json`, vrm, k, { extractYaw: k === 'turn', inPlace: !ROOTED.includes(k), detrend: k.startsWith('stairs') }); } catch (e) { console.warn('[ameyoru] clip failed', file, e); }
      }));
      return { vrm, clips };
    })().catch((e) => { cache.delete(skin.key); throw e; }));
  }
  return cache.get(skin.key);
}

export function savedCharacter() {
  try { return ROSTER.find((c) => c.id === localStorage.getItem('ameyoru.character')) || ROSTER[0]; } catch { return ROSTER[0]; }
}
export function saveCharacter(id) {
  try { localStorage.setItem('ameyoru.character', id); } catch { /* storage unavailable */ }
}
