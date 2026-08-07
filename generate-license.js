/* ============================================================
   Generador de códigos de activación.

   Cuando un cliente te pague, te dicta el ID que le aparece en
   Ajustes → Licencia (algo como K7M2-P9XQ). Con ese ID generas su
   código aquí y se lo mandas por WhatsApp.

   El código queda amarrado a ese ID: no le sirve en otra computadora.

   USO:
     node generate-license.js K7M2-P9XQ                  (pago único)
     node generate-license.js K7M2-P9XQ --meses 1        (mensualidad)
     node generate-license.js K7M2-P9XQ --meses 12       (anualidad)
     node generate-license.js K7M2-P9XQ --dias 15        (prueba extendida)

   LA LLAVE SECRETA:
   Se lee de license-salt.txt (en esta carpeta) o de la variable de
   entorno LICENSE_SALT. Ese archivo NO se sube a GitHub y tiene que
   ser EXACTAMENTE el mismo valor que guardaste en el secret
   LICENSE_SALT del repositorio, que es el que se inyecta al compilar
   el instalador. Si no coinciden, los códigos que generes aquí no
   van a funcionar en la app instalada.

   Para crear tu llave la primera vez:
     node generate-license.js --nueva-llave
   ============================================================ */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const LicenseCore = require('./license-core.js');

const SALT_FILE = path.join(__dirname, 'license-salt.txt');

function leerLlave() {
  if (process.env.LICENSE_SALT) return process.env.LICENSE_SALT.trim();
  if (fs.existsSync(SALT_FILE)) {
    const valor = fs.readFileSync(SALT_FILE, 'utf8').trim();
    if (valor) return valor;
  }
  return null;
}

function crearLlave() {
  if (fs.existsSync(SALT_FILE)) {
    console.error(`\n  Ya existe ${path.basename(SALT_FILE)}. Si lo reemplazas, TODOS los códigos`);
    console.error('  que ya entregaste dejarán de funcionar. Bórralo a mano si estás seguro.\n');
    process.exit(1);
  }
  const llave = crypto.randomBytes(32).toString('base64');
  fs.writeFileSync(SALT_FILE, llave + '\n', { mode: 0o600 });
  console.log('\n  Llave creada en license-salt.txt (no se sube a GitHub).\n');
  console.log('  Ahora guárdala también en GitHub para que se inyecte al compilar:');
  console.log('  Settings → Secrets and variables → Actions → New repository secret');
  console.log('    Nombre:  LICENSE_SALT');
  console.log('    Valor:   ' + llave);
  console.log('\n  Guárdala en un lugar seguro. Si la pierdes, no podrás generar');
  console.log('  códigos nuevos que sirvan en las apps ya instaladas.\n');
}

// Lee argumentos tipo "--meses 3" o "--dias 15".
function leerArgumentos(args) {
  const opciones = { id: null, meses: 0, dias: 0 };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--meses' || a === '--dias') {
      const n = Number(args[++i]);
      if (!Number.isInteger(n) || n <= 0) {
        console.error(`\n  El valor de ${a} debe ser un número entero mayor que cero.\n`);
        process.exit(1);
      }
      if (a === '--meses') opciones.meses = n; else opciones.dias = n;
    } else if (a === '--unico') {
      opciones.meses = 0; opciones.dias = 0;
    } else if (!a.startsWith('--')) {
      opciones.id = a;
    }
  }
  return opciones;
}

// Meses de calendario de verdad: quien paga un año espera la misma fecha del
// año siguiente, no 360 días. Contar "30 días por mes" le quedaría a deber.
function sumarMeses(desde, meses) {
  const d = new Date(desde);
  const dia = d.getDate();
  d.setDate(1); // primero al día 1, si no "31 de enero + 1 mes" se brinca a marzo
  d.setMonth(d.getMonth() + meses);
  // Si el mes destino no tiene ese día (31 de febrero), se usa el último que tenga.
  const ultimoDia = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(dia, ultimoDia));
  return d.getTime();
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--nueva-llave')) { crearLlave(); return; }

  // --dev: usa la llave de relleno, que es la que trae el código sin compilar.
  // Sirve para probar la activación en el navegador (localhost). Estos códigos
  // NO funcionan en el instalador de verdad, y los de verdad NO funcionan en
  // local: son dos llaves distintas a propósito.
  const modoDev = args.includes('--dev');
  const salt = modoDev ? '__LICENSE_SALT__' : leerLlave();
  if (!salt) {
    console.error('\n  No encuentro la llave secreta.');
    console.error('  Si es la primera vez, créala con:  node generate-license.js --nueva-llave');
    console.error('  Si solo quieres probar en localhost, agrega --dev\n');
    process.exit(1);
  }

  const { id, meses, dias } = leerArgumentos(args);
  if (!id) {
    console.error('\n  Falta el ID de instalación del cliente.');
    console.error('  Lo ve en la app, en Ajustes → ID de esta instalación.\n');
    console.error('  Ejemplos:');
    console.error('    node generate-license.js K7M2-P9XQ              (pago único)');
    console.error('    node generate-license.js K7M2-P9XQ --meses 1    (mensualidad)');
    console.error('    node generate-license.js K7M2-P9XQ --meses 12   (anualidad)\n');
    process.exit(1);
  }

  if (LicenseCore.cleanId(id).length !== 8) {
    console.error(`\n  "${id}" no parece un ID de instalación: deben ser 8 letras/números`);
    console.error('  (se muestra como XXXX-XXXX). Pídeselo otra vez al cliente.\n');
    process.exit(1);
  }

  let codigo;
  let descripcion;
  try {
    if (meses > 0 || dias > 0) {
      let vence = Date.now();
      if (meses > 0) vence = sumarMeses(vence, meses);
      if (dias > 0) vence += dias * 86400000;
      codigo = LicenseCore.makeCode({ installId: id, plan: 'temporal', expiresAt: vence, salt });
      const cuanto = meses > 0
        ? `${meses} ${meses === 1 ? 'mes' : 'meses'}${dias > 0 ? ` y ${dias} días` : ''}`
        : `${dias} días`;
      descripcion = `Vence el ${new Date(vence).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })} (${cuanto})`;
    } else {
      codigo = LicenseCore.makeCode({ installId: id, plan: 'unico', salt });
      descripcion = 'Pago único: no vence';
    }
  } catch (e) {
    console.error(`\n  No se pudo generar el código: ${e.message}\n`);
    process.exit(1);
  }

  // Se vuelve a leer el código recién hecho: si algo no cuadra, mejor
  // enterarse aquí y no cuando el cliente ya lo esté tecleando.
  const prueba = LicenseCore.checkCode(codigo, id, salt);
  if (!prueba.valid) {
    console.error('\n  El código generado no se validó a sí mismo. No lo entregues.\n');
    process.exit(1);
  }

  console.log('\n  Código de activación' + (modoDev ? '  (SOLO PARA PROBAR)' : '') + '\n');
  console.log('    ' + codigo + '\n');
  console.log('    Para el equipo:  ' + LicenseCore.formatId(id));
  console.log('    ' + descripcion + '\n');

  if (modoDev) {
    console.log('  Hecho con la llave de relleno: sirve en localhost y en el código sin');
    console.log('  compilar, pero NO en el instalador de verdad. No se lo mandes a un cliente.\n');
    return;
  }

  console.log('  Mándaselo al cliente para que lo pegue en Ajustes → Código de activación.');
  console.log('  Anota a qué cliente y a qué ID corresponde: si reinstala o cambia de');
  console.log('  computadora, su ID cambia y hay que generarle uno nuevo.\n');
}

main();
