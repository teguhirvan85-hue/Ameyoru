// The photo-scanned surfaces (assets/textures/<name>_{diff,nor,arm}.jpg, Poly Haven) as KTX2 / Basis UASTC, like the
// models' textures (tools/ktx2-assets.mjs). They used to load through TextureLoader, which flips images upright
// (flipY); compressed textures can't be flipped on upload, so each image is flipped here before it's encoded and
// the result is the same picture on the same faces. Colour (diff) is sRGB; normal and AO/rough/metal are linear.
// The JPGs go to the backup folder. Usage: node tools/ktx2-surfaces.mjs <ktx binary> <backup dir> [textures dir]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const [KTX, BACKUP, DIR = 'assets/textures'] = process.argv.slice(2);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ktx2s-'));
const files = fs.readdirSync(DIR).filter((f) => /_(diff|nor|arm)\.jpg$/.test(f));
let i = 0;
await Promise.all(Array.from({ length: Math.max(2, os.cpus().length - 1) }, async () => {
  while (i < files.length) {
    const f = files[i++], src = path.join(DIR, f), flipped = path.join(TMP, f.replace(/\.jpg$/, '.png')), out = src.replace(/\.jpg$/, '.ktx2');
    const srgb = /_diff\.jpg$/.test(f);
    await run('sips', ['-s', 'format', 'png', '-f', 'vertical', src, '--out', flipped]);
    await run(KTX, ['create', '--format', srgb ? 'R8G8B8A8_SRGB' : 'R8G8B8A8_UNORM', '--assign-tf', srgb ? 'srgb' : 'linear', '--encode', 'uastc', '--uastc-quality', '2', '--uastc-rdo', '--uastc-rdo-l', '1', '--zstd', '18', '--generate-mipmap', flipped, out]);
    fs.mkdirSync(path.join(BACKUP, 'textures'), { recursive: true });
    fs.copyFileSync(src, path.join(BACKUP, 'textures', f)); fs.rmSync(src); fs.rmSync(flipped);
    console.log(`${f} → ${path.basename(out)} (${(fs.statSync(out).size / 1e6).toFixed(2)} MB)`);
  }
}));
fs.rmSync(TMP, { recursive: true, force: true });
