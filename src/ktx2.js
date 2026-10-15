// One shared KTX2 (Basis Universal) loader for every model and texture loader in the game: the textures ship as
// UASTC (tools/ktx2-assets.mjs) and are transcoded here to whatever compressed format the GPU takes (ASTC on
// phones, BC7 on desktops), so they stay small in video memory. Loaders are registered as they're made; the
// shared loader is created once the renderer exists (it needs to ask the GPU what it supports).
import { CompressedTexture } from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { TEX_MAX, MOBILE } from './device.js';

const TRANSCODER = 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/basis/';
let ktx2 = null;
const waiting = [];

// On a phone, the top mip levels above TEX_MAX are dropped: the GPU then holds a 512 px texture with its own
// mip chain (the levels below are the same pixels the full texture would have used at that distance anyway).
function capMips(t) {
  const m = t.mipmaps;
  if (!m || m.length < 2 || !(t.image.width > TEX_MAX || t.image.height > TEX_MAX)) return t;
  let k = 0;
  while (k < m.length - 1 && (m[k].width > TEX_MAX || m[k].height > TEX_MAX)) k++;
  t.mipmaps = m.slice(k);
  t.image = { ...t.image, width: t.mipmaps[0].width, height: t.mipmaps[0].height };
  return t;
}

// Once a texture is on the GPU its transcoded data is only dead weight in JavaScript (as big again as what the GPU
// holds). Copies of a texture (GLTFLoader makes them; they share its data) are counted, and the data goes as soon
// as every copy has been uploaded — straight away, so it never sits in memory twice. Textures marked
// userData.keepData (the surfaces, uploaded again for each repeat they're used at) keep it.
const USERS = new WeakMap();   // the shared mip levels → { made, uploaded }
function dropData(t) {
  const mips = t.mipmaps, u = mips?.length && USERS.get(mips[0]);
  if (!u || t.userData.keepData) return;
  if (++u.uploaded >= u.made) for (const m of mips) m.data = null;
}
// (a texture sets its own onUpdate to null when it's made, and copies don't carry it: hand it on when cloned)
const clone = CompressedTexture.prototype.clone;
CompressedTexture.prototype.clone = function () {
  const c = clone.call(this); c.onUpdate = this.onUpdate;
  const u = this.mipmaps?.length && USERS.get(this.mipmaps[0]); if (u) u.made++;
  return c;
};

export function setupKTX2(renderer) {
  if (!ktx2) {
    // on a phone, fewer transcoding workers at once (each holds its own copy of what it's working on)
    ktx2 = new KTX2Loader().setTranscoderPath(TRANSCODER).setWorkerLimit(MOBILE ? 1 : 4).detectSupport(renderer);
    const make = ktx2._createTextureFrom.bind(ktx2);
    ktx2._createTextureFrom = async (...a) => {
      const t = capMips(await make(...a));
      if (t.mipmaps?.length) { USERS.set(t.mipmaps[0], { made: 1, uploaded: 0 }); t.onUpdate = dropData; }
      return t;
    };
  }
  for (const l of waiting.splice(0)) l.setKTX2Loader(ktx2);
  return ktx2;
}
// a GLTFLoader that may meet KTX2 textures (KHR_texture_basisu)
export function withKTX2(loader) { if (ktx2) loader.setKTX2Loader(ktx2); else waiting.push(loader); return loader; }
export const ktx2Loader = () => ktx2;
