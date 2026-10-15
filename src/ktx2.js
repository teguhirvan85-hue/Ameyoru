// One shared KTX2 (Basis Universal) loader for every model and texture loader in the game: the textures ship as
// UASTC (tools/ktx2-assets.mjs) and are transcoded here to whatever compressed format the GPU takes (ASTC on
// phones, BC7 on desktops), so they stay small in video memory. Loaders are registered as they're made; the
// shared loader is created once the renderer exists (it needs to ask the GPU what it supports).
import { CompressedTexture } from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { TEX_MAX } from './device.js';

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

// Once a texture is on the GPU its transcoded data is only dead weight in JavaScript (it was as big again as what
// the GPU holds): drop it a few seconds after the upload. Copies of a texture (GLTFLoader makes them; they share
// its data) carry the same hook, so whichever is uploaded lets go of it. Textures marked userData.keepData (the surfaces, uploaded again for each
// repeat they're used at) keep it. Everything in the town is uploaded in the warm-up frame (main.js), before this.
function dropData(t) {
  const mips = t.mipmaps;
  if (t.userData.keepData || !mips?.length) return;
  setTimeout(() => { for (const m of mips) m.data = null; }, 3000);
}
// (a texture sets its own onUpdate to null when it's made, and copies don't carry it: hand it on when cloned)
const clone = CompressedTexture.prototype.clone;
CompressedTexture.prototype.clone = function () { const c = clone.call(this); c.onUpdate = this.onUpdate; return c; };

export function setupKTX2(renderer) {
  if (!ktx2) {
    ktx2 = new KTX2Loader().setTranscoderPath(TRANSCODER).detectSupport(renderer);
    const make = ktx2._createTextureFrom.bind(ktx2);
    ktx2._createTextureFrom = async (...a) => { const t = capMips(await make(...a)); t.onUpdate = dropData; return t; };
  }
  for (const l of waiting.splice(0)) l.setKTX2Loader(ktx2);
  return ktx2;
}
// a GLTFLoader that may meet KTX2 textures (KHR_texture_basisu)
export function withKTX2(loader) { if (ktx2) loader.setKTX2Loader(ktx2); else waiting.push(loader); return loader; }
export const ktx2Loader = () => ktx2;
