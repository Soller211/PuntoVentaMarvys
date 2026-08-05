/* ============================================================
   Servidor local para la tienda.
   Sirve la app en la red WiFi para abrirla desde el teléfono,
   la tablet o la computadora. No necesita internet.

   Cómo usarlo:
     1) Instala Node.js (una sola vez): https://nodejs.org
     2) En esta carpeta ejecuta:  node server.js
     3) Abre la dirección que aparezca en pantalla.
   ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  // Seguridad: no salir de la carpeta
  const filePath = path.join(ROOT, path.normalize(urlPath));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Prohibido'); return; }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('No encontrado');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

// Buscar la dirección IP en la red local
function localIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

server.listen(PORT, () => {
  const ip = localIP();
  console.log('\n  🍔  Punto de Venta funcionando\n');
  console.log('  En esta computadora:   http://localhost:' + PORT);
  console.log('  En el teléfono/tablet: http://' + ip + ':' + PORT + '   (misma red WiFi)');
  console.log('\n  Para detenerlo: presiona Ctrl + C\n');
});
