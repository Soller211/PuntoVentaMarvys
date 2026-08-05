/* ============================================================
   Generador de códigos de activación.

   Uso: cuando un cliente te pague, corre este comando y mándale
   el código que te muestra (por WhatsApp, correo, etc.):

     node generate-license.js

   IMPORTANTE: LICENSE_SALT debe ser EXACTAMENTE igual aquí y en
   app.js (busca la constante LICENSE_SALT). Si vas a vender esto
   en serio, cambia el valor por tu propio secreto en AMBOS archivos
   antes de generar el primer código real, y no lo compartas.
   ============================================================ */
const LICENSE_SALT = 'MARVYS-CAMBIA-ESTA-CLAVE-2026';

function licenseChecksum(part1, part2) {
  const str = part1 + part2 + LICENSE_SALT;
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return hash.toString(36).toUpperCase().padStart(4, '0').slice(-4);
}

function randomPart() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I para evitar confusiones
  let out = '';
  for (let i = 0; i < 4; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function generateCode() {
  const part1 = randomPart();
  const part2 = randomPart();
  const checksum = licenseChecksum(part1, part2);
  return `${part1}-${part2}-${checksum}`;
}

const code = generateCode();
console.log('\nNuevo código de activación:\n');
console.log('  ' + code);
console.log('\nMándaselo al cliente para que lo pegue en Ajustes → Código de activación.\n');
