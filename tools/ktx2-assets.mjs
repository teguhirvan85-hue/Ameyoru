// Turns the textures inside every model (.gltf with its image files, .glb, .vrm) into KTX2 / Basis UASTC: a GPU
// texture format that stays compressed in video memory (about a quarter of the plain RGBA it was), which is what
// lets phones hold the town. UASTC at quality 2 with light RDO and Zstandard is visually the same as the source.
// Colour textures are encoded as sRGB, data textures (normal, roughness/metal, occlusion, MToon masks) as linear.
// Everything else in a file (meshes, VRM extensions, materials) is left as it was. The originals are moved to a
// backup folder outside the repository first, so a file can always be put back.
//
// Usage: node tools/ktx2-assets.mjs <ktx binary> <backup dir> [assets dir] [--only <substring>]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const [KTX, BACKUP, ROOT = 'assets'] = process.argv.slice(2);
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
if (!KTX || !BACKUP) { console.error('usage: node tools/ktx2-assets.mjs <ktx> <backup dir> [assets dir]'); process.exit(1); }
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ktx2-'));

// ---------- which textures carry colour ----------
const SRGB_VRM0 = new Set(['_MainTex', '_ShadeTexture', '_EmissionMap', '_SphereAdd', '_RimTexture']);
const SRGB_MTOON = new Set(['shadeMultiplyTexture', 'matcapTexture', 'rimMultiplyTexture']);
const SRGB_KHR = new Set(['sheenColorTexture', 'specularColorTexture']);
// texture index → 'srgb' | 'linear' for every texture a material uses (others are left alone)
function textureUse(json) {
  const use = new Map();
  const mark = (i, cs) => { if (i === undefined || i === null) return; if (use.get(i) !== 'srgb') use.set(i, cs); };
  for (const m of json.materials || []) {
    const pbr = m.pbrMetallicRoughness || {};
    mark(pbr.baseColorTexture?.index, 'srgb'); mark(m.emissiveTexture?.index, 'srgb');
    mark(pbr.metallicRoughnessTexture?.index, 'linear'); mark(m.normalTexture?.index, 'linear'); mark(m.occlusionTexture?.index, 'linear');
    for (const [name, ext] of Object.entries(m.extensions || {})) {
      for (const [k, v] of Object.entries(ext || {})) {
        if (v && typeof v === 'object' && typeof v.index === 'number') {
          const srgb = name === 'VRMC_materials_mtoon' ? SRGB_MTOON.has(k) : SRGB_KHR.has(k);
          mark(v.index, srgb ? 'srgb' : 'linear');
        }
      }
    }
  }
  for (const mp of json.extensions?.VRM?.materialProperties || []) {
    for (const [k, i] of Object.entries(mp.textureProperties || {})) mark(i, SRGB_VRM0.has(k) ? 'srgb' : 'linear');
  }
  return use;
}

// image index → colour space (an image shared by colour and data textures is kept as colour)
function imageUse(json) {
  const tex = textureUse(json), img = new Map();
  for (const [ti, cs] of tex) {
    const t = json.textures?.[ti]; if (!t || t.source === undefined) continue;
    if (img.get(t.source) !== 'srgb') img.set(t.source, cs);
  }
  return img;
}

async function encode(input, output, cs) {
  const fmt = cs === 'srgb' ? ['--format', 'R8G8B8A8_SRGB', '--assign-tf', 'srgb'] : ['--format', 'R8G8B8A8_UNORM', '--assign-tf', 'linear'];
  await run(KTX, ['create', ...fmt, '--encode', 'uastc', '--uastc-quality', '2', '--uastc-rdo', '--uastc-rdo-l', '1', '--zstd', '18', '--generate-mipmap', input, output], { maxBuffer: 1 << 26 });
}

function markRequired(json) {
  for (const k of ['extensionsUsed', 'extensionsRequired']) { json[k] = json[k] || []; if (!json[k].includes('KHR_texture_basisu')) json[k].push('KHR_texture_basisu'); }
}
function pointTextures(json, converted) {
  for (const t of json.textures || []) {
    if (t.source === undefined || !converted.has(t.source)) continue;
    t.extensions = t.extensions || {}; t.extensions.KHR_texture_basisu = { source: t.source }; delete t.source;
  }
}
const backup = (file) => { const dest = path.join(BACKUP, path.relative(ROOT, file)); fs.mkdirSync(path.dirname(dest), { recursive: true }); if (!fs.existsSync(dest)) fs.copyFileSync(file, dest); };

// a small pool so several images encode at once
async function pool(jobs, n = Math.max(2, os.cpus().length - 1)) {
  let i = 0; const out = [];
  await Promise.all(Array.from({ length: n }, async () => { while (i < jobs.length) { const k = i++; out[k] = await jobs[k](); } }));
  return out;
}

// ---------- .gltf with image files next to it ----------
async function doGltf(file) {
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  if ((json.extensionsUsed || []).includes('KHR_texture_basisu')) return null;
  const dir = path.dirname(file), use = imageUse(json), converted = new Set(), moved = [];
  await pool([...use].map(([ii, cs]) => async () => {
    const im = json.images[ii]; if (!im?.uri || im.uri.startsWith('data:')) return;
    const src = path.join(dir, decodeURIComponent(im.uri)), out = src.replace(/\.(png|jpe?g|webp)$/i, '.ktx2');
    if (!fs.existsSync(src)) return;
    await encode(src, out, cs);
    im.uri = path.relative(dir, out).split(path.sep).join('/'); im.mimeType = 'image/ktx2';
    converted.add(ii); moved.push(src);
  }));
  if (!converted.size) return null;
  pointTextures(json, converted); markRequired(json);
  backup(file); for (const f of new Set(moved)) backup(f);
  fs.writeFileSync(file, JSON.stringify(json));
  // the source images go (they're in the backup); anything another file still points at stays
  for (const f of new Set(moved)) fs.rmSync(f, { force: true });
  return converted.size;
}

// ---------- .glb / .vrm: images live in the binary chunk ----------
function readGlb(buf) {
  const jsonLen = buf.readUInt32LE(12), json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  let bin = null; const o = 20 + jsonLen;
  if (o < buf.length) { const binLen = buf.readUInt32LE(o); bin = buf.subarray(o + 8, o + 8 + binLen); }
  return { json, bin };
}
function writeGlb(json, bin) {
  let js = Buffer.from(JSON.stringify(json)); const jp = (4 - (js.length % 4)) % 4; js = Buffer.concat([js, Buffer.alloc(jp, 0x20)]);
  const bp = (4 - (bin.length % 4)) % 4; bin = Buffer.concat([bin, Buffer.alloc(bp)]);
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([head, jh, js, bh, bin]);
}
// every bufferView index mentioned anywhere in the JSON (accessors, images, extensions)
function viewsUsed(node, out = new Set()) {
  if (Array.isArray(node)) node.forEach((n) => viewsUsed(n, out));
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) { if (k === 'bufferView' && typeof v === 'number') out.add(v); else viewsUsed(v, out); }
  return out;
}
function remapViews(node, map) {
  if (Array.isArray(node)) node.forEach((n) => remapViews(n, map));
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) { if (k === 'bufferView' && typeof v === 'number') node[k] = map.get(v); else remapViews(v, map); }
}
async function doGlb(file) {
  const buf = fs.readFileSync(file), { json, bin } = readGlb(buf);
  if (!bin || (json.extensionsUsed || []).includes('KHR_texture_basisu')) return null;
  if ((json.buffers || []).length !== 1) { console.warn('  skip (several buffers)', file); return null; }
  const use = imageUse(json), blobs = new Map(), converted = new Set();
  await pool([...use].map(([ii, cs]) => async () => {
    const im = json.images[ii]; if (im?.bufferView === undefined) return;
    const bv = json.bufferViews[im.bufferView], data = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
    const ext = /png/.test(im.mimeType) ? 'png' : 'jpg', a = path.join(TMP, `${path.basename(file)}_${ii}.${ext}`), b = a.replace(/\.\w+$/, '.ktx2');
    fs.writeFileSync(a, data);
    await encode(a, b, cs);
    blobs.set(ii, fs.readFileSync(b)); fs.rmSync(a); fs.rmSync(b);
    converted.add(ii);
  }));
  if (!converted.size) return null;
  // the new images as extra buffer views; then pack only the views still in use
  for (const [ii, data] of blobs) {
    json.bufferViews.push({ buffer: 0, byteOffset: 0, byteLength: data.length, _data: data });
    json.images[ii] = { ...json.images[ii], bufferView: json.bufferViews.length - 1, mimeType: 'image/ktx2' };
  }
  pointTextures(json, converted); markRequired(json);
  const used = [...viewsUsed({ ...json, bufferViews: undefined })].sort((x, y) => x - y), map = new Map(), parts = [], views = [];
  let off = 0;
  for (const vi of used) {
    const bv = json.bufferViews[vi], data = bv._data ?? bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
    const pad = (4 - (off % 4)) % 4; if (pad) { parts.push(Buffer.alloc(pad)); off += pad; }
    const nv = { ...bv, byteOffset: off }; delete nv._data; views.push(nv); map.set(vi, views.length - 1);
    parts.push(data); off += data.length;
  }
  json.bufferViews = views; remapViews({ ...json, bufferViews: undefined }, map);
  // remapViews walked a shallow copy whose children are the real objects, so json is updated in place
  const newBin = Buffer.concat(parts); json.buffers[0].byteLength = newBin.length;
  backup(file);
  fs.writeFileSync(file, writeGlb(json, newBin));
  return converted.size;
}

// ---------- every model under the assets folder ----------
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(gltf|glb|vrm)$/i.test(e.name)) files.push(p); } })(ROOT);
let total = 0;
for (const f of files) {
  if (only && !f.includes(only)) continue;
  const before = fs.statSync(f).size;
  try {
    const n = /\.gltf$/i.test(f) ? await doGltf(f) : await doGlb(f);
    if (n) { total += n; console.log(`${f}: ${n} textures → KTX2 (${(before / 1e6).toFixed(1)} → ${(fs.statSync(f).size / 1e6).toFixed(1)} MB file)`); }
  } catch (e) { console.warn(`  FAILED ${f}: ${e.message.split('\n')[0]}`); }
}
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`done: ${total} textures`);
