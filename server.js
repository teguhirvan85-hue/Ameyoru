// Tiny static server for local play: node server.js  →  http://localhost:5180
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 5180;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

const os = require('os');
const SNAP = path.join(os.tmpdir(), 'ameyoru-snap.jpg');

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  // dev aid: the page can POST a base64 JPEG of the canvas here (window.snap), saved to the temp folder
  if (req.method === 'POST' && url === '/__snap') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 8e6) req.destroy(); });
    req.on('end', () => { fs.writeFile(SNAP, Buffer.from(body, 'base64'), () => { res.writeHead(200); res.end(SNAP); }); });
    return;
  }
  const file = path.join(ROOT, url === '/' ? 'index.html' : url);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(PORT, '127.0.0.1', () => console.log(`Ameyoru on http://localhost:${PORT}`));
