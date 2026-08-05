/* Genera build/icon.png (512x512) a partir de icon.svg.
   Lo usa el instalador de Windows como ícono del programa. */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const out = path.join(__dirname, 'build');
if (!fs.existsSync(out)) fs.mkdirSync(out);

sharp(path.join(__dirname, 'icon.svg'))
  .resize(512, 512)
  .png()
  .toFile(path.join(out, 'icon.png'))
  .then(() => console.log('✓ Ícono generado: build/icon.png'))
  .catch((err) => { console.error('Error generando el ícono:', err); process.exit(1); });
