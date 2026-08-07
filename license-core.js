/* ============================================================
   Licencias: la matemática compartida.

   Este archivo lo usan DOS programas y tienen que coincidir exactamente:
     - app.js               (dentro de la app, para revisar el código)
     - generate-license.js  (en tu computadora, para crear los códigos)

   Por eso vive en un solo lugar. Antes la cuenta estaba copiada en los
   dos archivos y bastaba con tocar uno para que todos los códigos
   dejaran de servir sin darte cuenta.

   LA LLAVE SECRETA NO ESTÁ AQUÍ. En el repositorio solo queda el
   marcador __LICENSE_SALT__; el valor real lo mete inject-salt.js justo
   antes de publicar, tanto en el instalador de Windows como en la web de
   Cloudflare. Tú la tienes aparte en license-salt.txt, que no se sube.

   Qué lleva un código adentro:
     - el plan: pago único (no vence) o temporal (mensualidad/anualidad)
     - la fecha de vencimiento, cuando es temporal
     - una firma que lo amarra al ID de instalación del equipo, así que
       un código no funciona en otra computadora.
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LicenseCore = factory();
})(typeof self !== 'undefined' ? self : globalThis, function () {

  // Lo reemplaza inject-salt.js al publicar. Si ves este valor en la app ya
  // publicada, la llave real NO se inyectó y los códigos son falsificables.
  const BUILD_SALT = '__LICENSE_SALT__';
  const SALT_PLACEHOLDER = '__LICENSE_SALT__';

  // 32 símbolos, sin 0/O/1/I para que nadie se equivoque dictando el
  // código por teléfono o por WhatsApp.
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const BASE = 32n;

  // Las fechas se guardan como días contados desde aquí. Con 3 símbolos
  // (32³ = 32768 días) alcanza para ~89 años, de sobra.
  const EPOCH = Date.UTC(2026, 0, 1);
  const DAY = 86400000;
  const MAX_DAYS = 32 * 32 * 32 - 1;

  const PLAN_CHARS = { unico: 'P', temporal: 'T' };

  /* ---------- Revoltura ----------
     FNV-1a de 64 bits y luego una mezcla final (estilo splitmix64). La
     mezcla importa: sin ella, dos entradas parecidas dan resultados
     parecidos y se notaría el patrón entre un código y el siguiente.

     Ojo con lo que esto sí y no protege: la llave viaja dentro del .exe,
     así que quien la extraiga puede fabricar códigos por más fuerte que
     sea la cuenta. Lo que esto evita es que alguien deduzca la llave
     viendo códigos ya emitidos, que es el caso realista. */
  const MASK = 0xffffffffffffffffn;
  function hash64(str) {
    let h = 0xcbf29ce484222325n;
    for (let i = 0; i < str.length; i++) {
      h = ((h ^ BigInt(str.charCodeAt(i))) * 0x100000001b3n) & MASK;
    }
    h = ((h ^ (h >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK;
    h = ((h ^ (h >> 27n)) * 0x94d049bb133111ebn) & MASK;
    return (h ^ (h >> 31n)) & MASK;
  }

  // Número -> texto en el alfabeto de arriba, con largo fijo.
  function encode(value, length) {
    let v = BigInt(value);
    let out = '';
    for (let i = 0; i < length; i++) {
      out = ALPHABET[Number(v % BASE)] + out;
      v /= BASE;
    }
    return out;
  }

  // Texto -> número. Devuelve null si trae un símbolo que no es del alfabeto.
  function decode(str) {
    let v = 0n;
    for (const c of str) {
      const i = ALPHABET.indexOf(c);
      if (i < 0) return null;
      v = v * BASE + BigInt(i);
    }
    return v;
  }

  // El ID que teclea el cliente puede venir con guiones, espacios o en
  // minúsculas: se normaliza para que la firma siempre dé lo mismo.
  const cleanId = (id) => String(id == null ? '' : id).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cleanCode = (code) => String(code == null ? '' : code).toUpperCase().replace(/[^A-Z0-9]/g, '');

  // Firma de 8 símbolos que amarra el contenido del código a este equipo.
  function sign(payload, installId, salt) {
    const value = hash64(`${payload}|${cleanId(installId)}|${salt}`) % (BASE ** 8n);
    return encode(value, 8);
  }

  // El vencimiento se guarda con precisión de días, y siempre se redondea
  // hacia arriba: si el cliente pagó 30 días, nunca recibe 29 y medio.
  const dateToDays = (ts) => Math.ceil((ts - EPOCH) / DAY);
  const daysToDate = (days) => EPOCH + days * DAY;

  /* ---------- Crear un código ----------
     plan: 'unico' (no vence) o 'temporal' (vence en expiresAt).
     Devuelve algo como "PAAA-K7M2-9XQF". */
  function makeCode({ installId, plan = 'unico', expiresAt = 0, salt = BUILD_SALT }) {
    const id = cleanId(installId);
    if (!id) throw new Error('Falta el ID de instalación');
    const planChar = PLAN_CHARS[plan];
    if (!planChar) throw new Error(`Plan desconocido: ${plan}`);

    let days = 0;
    if (plan === 'temporal') {
      days = dateToDays(expiresAt);
      if (!(days > 0)) throw new Error('La fecha de vencimiento debe ser posterior a 2026');
      if (days > MAX_DAYS) throw new Error('La fecha de vencimiento es demasiado lejana');
    }

    const payload = planChar + encode(days, 3);
    const firma = sign(payload, id, salt);
    return `${payload}-${firma.slice(0, 4)}-${firma.slice(4)}`;
  }

  /* ---------- Revisar un código ----------
     Devuelve un objeto que dice todo lo que la app necesita mostrar.
     Nunca lanza error: un código mal escrito simplemente no vale. */
  function checkCode(code, installId, salt = BUILD_SALT, now = Date.now()) {
    const invalido = { valid: false, plan: null, expiresAt: 0, expired: false, daysLeft: 0 };
    const clean = cleanCode(code);
    if (clean.length !== 12) return invalido;

    const payload = clean.slice(0, 4);
    if (sign(payload, installId, salt) !== clean.slice(4)) return invalido;

    const plan = payload[0] === 'P' ? 'unico' : payload[0] === 'T' ? 'temporal' : null;
    if (!plan) return invalido;

    if (plan === 'unico') {
      return { valid: true, plan, expiresAt: 0, expired: false, daysLeft: Infinity };
    }

    const days = decode(payload.slice(1));
    if (days === null) return invalido;
    const expiresAt = daysToDate(Number(days));
    const daysLeft = Math.ceil((expiresAt - now) / DAY);
    // Vencido: sigue siendo un código legítimo, pero ya no da acceso.
    // Se distingue de uno inválido para poder avisar "se venció, renueva"
    // en vez de "código incorrecto", que confundiría al cliente.
    return { valid: daysLeft > 0, plan, expiresAt, expired: daysLeft <= 0, daysLeft };
  }

  // Genera un ID de instalación nuevo (8 símbolos, mostrado como XXXX-XXXX).
  function newInstallId(randomBytes) {
    let out = '';
    for (let i = 0; i < 8; i++) out += ALPHABET[randomBytes[i] % ALPHABET.length];
    return out;
  }

  const formatId = (id) => {
    const c = cleanId(id);
    return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
  };

  return {
    makeCode,
    checkCode,
    newInstallId,
    formatId,
    cleanId,
    buildSalt: () => BUILD_SALT,
    // true cuando la llave real no se inyectó al compilar.
    saltIsPlaceholder: (salt = BUILD_SALT) => salt === SALT_PLACEHOLDER,
    EPOCH,
    DAY,
  };
});
