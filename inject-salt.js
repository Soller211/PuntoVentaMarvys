/* ============================================================
   Mete la llave de licencias en el código, justo antes de publicar.

   La llave NO vive en el repositorio (es público). Este script la toma
   de la variable de entorno LICENSE_SALT y reemplaza el marcador
   __LICENSE_SALT__ dentro de license-core.js.

   Lo usan los DOS caminos de publicación:

     - Instalador de Windows: .github/workflows/build-windows.yml
       (la llave sale del secret LICENSE_SALT del repositorio)

     - Web en Cloudflare: en el panel del Worker, pon
         Build command:  node inject-salt.js
       y agrega la variable de entorno LICENSE_SALT con el mismo valor.

   Si falta la llave, este script FALLA a propósito: es mejor que no se
   publique nada, a publicar algo donde los códigos sean falsificables.
   ============================================================ */
const fs = require('fs');
const path = require('path');

const ARCHIVO = path.join(__dirname, 'license-core.js');
const MARCADOR = "const BUILD_SALT = '__LICENSE_SALT__';";

function fallar(mensaje) {
  console.error('\n  ERROR: ' + mensaje + '\n');
  process.exit(1);
}

const salt = (process.env.LICENSE_SALT || '').trim();
if (!salt) {
  fallar('Falta la variable de entorno LICENSE_SALT.\n' +
         '  Sin ella los códigos de activación serían falsificables.\n' +
         '  Genérala con: node generate-license.js --nueva-llave');
}

// Una comilla simple rompería el archivo generado; y si alguien mete algo
// raro como llave, mejor detenerse aquí que producir un archivo inválido.
if (/['\\\r\n]/.test(salt)) {
  fallar('La llave no puede traer comillas, diagonales invertidas ni saltos de línea.');
}

const original = fs.readFileSync(ARCHIVO, 'utf8');
if (!original.includes(MARCADOR)) {
  fallar(`No encontré el marcador en ${path.basename(ARCHIVO)}.\n` +
         '  ¿Ya se había inyectado la llave, o cambió esa línea?');
}

// Solo se toca la constante BUILD_SALT. SALT_PLACEHOLDER tiene que conservar
// el texto original: es lo que le permite a la app darse cuenta de que se
// publicó sin llave y avisarlo en pantalla.
const resultado = original.replace(MARCADOR, `const BUILD_SALT = '${salt}';`);
fs.writeFileSync(ARCHIVO, resultado);

if (fs.readFileSync(ARCHIVO, 'utf8').includes(MARCADOR)) {
  fallar('El reemplazo no se aplicó.');
}

console.log('  Llave de licencias inyectada en license-core.js');
