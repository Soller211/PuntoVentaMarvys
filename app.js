/* ============================================================
   Punto de Venta - Lógica de la aplicación
   Sin dependencias. Los datos se guardan en este dispositivo
   (localStorage), por lo que funciona sin internet.
   ============================================================ */

/* ---------- Utilidades ---------- */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
// Convierte texto escrito por el usuario a número, aceptando coma o punto decimal.
const parseNum = (str) => parseFloat(String(str ?? '').trim().replace(',', '.')) || 0;

// Deja solo dígitos en un campo de teléfono mientras el usuario escribe,
// conservando la posición del cursor.
function filterDigitsInput(el) {
  const cleaned = el.value.replace(/\D/g, '');
  if (cleaned !== el.value) {
    const pos = Math.max(0, el.selectionStart - (el.value.length - cleaned.length));
    el.value = cleaned;
    try { el.setSelectionRange(pos, pos); } catch (_) {}
  }
}

const money = (n) => {
  const s = S.settings.currency || '$';
  const rounded = Math.round(n * 100) / 100;
  const decimals = Number.isInteger(rounded) ? 0 : 2;
  return s + rounded.toLocaleString('es-MX', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};
const escapeHtml = (str = '') => String(str).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const dayKey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
const fmtDate = (ts) => new Date(ts).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtTime = (ts) => new Date(ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
function minsAgo(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  return `hace ${h} h`;
}

/* ---------- Estados de entrega ---------- */
const STATUS = {
  preparacion: { label: 'En preparación', icon: 'clock', color: '#d97706' },
  camino: { label: 'En camino', icon: 'truck', color: '#2563eb' },
  listo: { label: 'Listo', icon: 'box', color: '#0891b2' },
  entregado: { label: 'Entregado', icon: 'checkCircle', color: '#16a34a' },
};
function statusFlow(type) {
  return type === 'domicilio'
    ? ['preparacion', 'camino', 'entregado']
    : ['preparacion', 'listo', 'entregado'];
}
function nextStatus(o) {
  const f = statusFlow(o.type);
  const i = f.indexOf(o.status || 'preparacion');
  return i >= 0 && i < f.length - 1 ? f[i + 1] : null;
}
function previousStatus(o) {
  const f = statusFlow(o.type);
  const i = f.indexOf(o.status || 'preparacion');
  return i > 0 ? f[i - 1] : null;
}

/* ---------- Almacenamiento ---------- */
const DB = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  },
  set(key, val) { localStorage.setItem(key, JSON.stringify(val)); },
};

/* ---------- Datos de ejemplo (solo la primera vez) ---------- */
const DEFAULT_SETTINGS = {
  restaurantName: 'Mi Restaurante',
  phone: '',
  address: '',
  currency: '$',
  defaultDeliveryFee: 0,
  primaryColor: '#e11d48',
  logo: '',
  licenseCode: '',
  nextFolio: 1,
  categories: ['Platillos', 'Entradas', 'Bebidas', 'Postres'],
  categoryColors: {},
};
const COLOR_PRESETS = ['#e11d48', '#ea580c', '#d97706', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#db2777', '#0f172a'];
const SAMPLE_PRODUCTS = [
  { id: uid(), name: 'Hamburguesa', price: 95, category: 'Platillos', active: true },
  { id: uid(), name: 'Torta especial', price: 75, category: 'Platillos', active: true },
  { id: uid(), name: 'Orden de papas', price: 45, category: 'Entradas', active: true },
  { id: uid(), name: 'Alitas (10 pzas)', price: 130, category: 'Entradas', active: true },
  { id: uid(), name: 'Refresco', price: 25, category: 'Bebidas', active: true },
  { id: uid(), name: 'Agua fresca 1L', price: 35, category: 'Bebidas', active: true },
  { id: uid(), name: 'Flan', price: 40, category: 'Postres', active: true },
];

/* ---------- Estado global ---------- */
const S = {
  settings: DB.get('mv_settings', null) || DEFAULT_SETTINGS,
  products: DB.get('mv_products', null) || SAMPLE_PRODUCTS,
  orders: DB.get('mv_orders', []),
  customers: DB.get('mv_customers', []),
  companies: DB.get('mv_companies', []),
  cart: [],            // [{ productId, name, price, qty }]
  activeCat: 'Todos',
  search: '',
  histPeriod: 'hoy',
  view: 'vender',
};
// Guardar los datos de ejemplo si es la primera vez
if (!DB.get('mv_settings', null)) DB.set('mv_settings', S.settings);
if (!DB.get('mv_products', null)) DB.set('mv_products', S.products);

// Si ya venía usando la app (tenía ventas o nombre propio), no mostrar la bienvenida
if (S.settings.onboarded === undefined) {
  S.settings.onboarded = (S.orders.length > 0 || S.settings.restaurantName !== 'Mi Restaurante');
  DB.set('mv_settings', S.settings);
}

// Migración: si la instalación ya tenía ventas antes de tener un contador de folios,
// arrancarlo después del folio más alto que ya existe (para no repetir números).
if (!S.settings.nextFolio) {
  const maxFolio = S.orders.reduce((m, o) => Math.max(m, o.folio || 0), 0);
  S.settings.nextFolio = maxFolio + 1;
  DB.set('mv_settings', S.settings);
}

// Entrega un folio nuevo y único cada vez (nunca se repite, aunque se borren ventas).
function nextFolio() {
  const folio = S.settings.nextFolio;
  S.settings.nextFolio = folio + 1;
  saveSettings();
  return folio;
}

function saveProducts() {
  try { DB.set('mv_products', S.products); return true; }
  catch (e) { toast('Almacenamiento lleno. Usa imágenes más pequeñas o quita algunas.'); return false; }
}
const saveOrders = () => DB.set('mv_orders', S.orders);
function saveCustomers() {
  try { DB.set('mv_customers', S.customers); return true; }
  catch (e) { toast('Almacenamiento lleno, no se pudo guardar el cliente.'); return false; }
}
const customerKey = (phone) => String(phone || '').replace(/\D/g, '');
// Guarda o actualiza un cliente cuando se confirma una venta con teléfono.
function upsertCustomer({ name, phone, address, notes, company }) {
  const key = customerKey(phone);
  if (!key) return;
  let c = S.customers.find((x) => x.phone === key);
  if (c) {
    if (name) c.name = name;
    if (address) c.address = address;
    if (notes) c.notes = notes;
    if (company) c.company = company;
    c.updatedAt = Date.now();
  } else {
    S.customers.push({ id: uid(), name: name || '', phone: key, address: address || '', notes: notes || '', company: company || '', createdAt: Date.now(), updatedAt: Date.now() });
  }
  saveCustomers();
}

// Empresas: varios clientes (distinto nombre/teléfono) pueden compartir la misma
// dirección de entrega cuando piden desde la misma empresa/oficina.
function saveCompanies() {
  try { DB.set('mv_companies', S.companies); return true; }
  catch (e) { toast('Almacenamiento lleno, no se pudo guardar la empresa.'); return false; }
}
const companyKey = (name) => String(name || '').trim().toLowerCase();
function upsertCompany({ name, address, phone }) {
  const key = companyKey(name);
  if (!key) return null;
  let co = S.companies.find((x) => companyKey(x.name) === key);
  if (co) {
    if (address) co.address = address;
    if (phone) co.phone = phone;
    co.updatedAt = Date.now();
  } else {
    co = { id: uid(), name: name.trim(), address: address || '', phone: phone || '', createdAt: Date.now(), updatedAt: Date.now() };
    S.companies.push(co);
  }
  saveCompanies();
  return co;
}
function saveSettings() {
  try { DB.set('mv_settings', S.settings); return true; }
  catch (e) { toast('Almacenamiento lleno. Usa un logo/imágenes más pequeñas.'); return false; }
}

/* ============================================================
   LICENCIA (prueba gratis + código de activación)

   Este mismo código y clave están en generate-license.js — deben
   coincidir exactamente para que los códigos generados sean válidos
   aquí. CAMBIA LICENSE_SALT por tu propio secreto antes de vender,
   y actualiza el mismo valor en generate-license.js.
   ============================================================ */
// Interruptor maestro: en false, nadie ve avisos de prueba/activación (uso familiar/interno).
// Cámbialo a true cuando quieras empezar a vender a otros negocios.
const LICENSE_ENFORCED = false;
const LICENSE_SALT = 'MARVYS-CAMBIA-ESTA-CLAVE-2026';
const TRIAL_LIMIT = 20; // ventas gratis antes de pedir activación
const SELLER_WHATSAPP = ''; // tu número con código de país, ej. "5218112345678"

function licenseChecksum(part1, part2) {
  const str = part1 + part2 + LICENSE_SALT;
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return hash.toString(36).toUpperCase().padStart(4, '0').slice(-4);
}
function isValidLicense(code) {
  const clean = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length !== 12) return false;
  return licenseChecksum(clean.slice(0, 4), clean.slice(4, 8)) === clean.slice(8, 12);
}
function isActivated() { return !LICENSE_ENFORCED || isValidLicense(S.settings.licenseCode); }
function salesUsed() { return S.orders.length; }
function trialRemaining() { return Math.max(0, TRIAL_LIMIT - salesUsed()); }

/* ---------- Tema (color del negocio) ---------- */
function hexToRgb(hex) {
  hex = String(hex).replace('#', '');
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const n = parseInt(hex, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function mix(hex, target, amt) {
  const c = hexToRgb(hex);
  const r = Math.round(c.r + (target.r - c.r) * amt);
  const g = Math.round(c.g + (target.g - c.g) * amt);
  const b = Math.round(c.b + (target.b - c.b) * amt);
  return `rgb(${r},${g},${b})`;
}
function applyColorValue(primary) {
  const root = document.documentElement.style;
  root.setProperty('--primary', primary);
  root.setProperty('--primary-dark', mix(primary, { r: 0, g: 0, b: 0 }, 0.20));
  root.setProperty('--primary-soft', mix(primary, { r: 255, g: 255, b: 255 }, 0.87));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = primary;
}
function applyTheme() { applyColorValue(S.settings.primaryColor || '#e11d48'); }

function applyBranding() {
  const name = $('#brandName');
  if (name) name.textContent = S.settings.restaurantName || 'Punto de Venta';
  const logo = $('#brandLogo');
  if (logo) logo.innerHTML = S.settings.logo ? `<img src="${S.settings.logo}" alt="logo">` : icon('utensils', 17);
}

/* ---------- Redimensionar imágenes (para no llenar el almacenamiento) ---------- */
function resizeImage(file, maxSize, cb) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      cb(canvas.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = () => toast('No se pudo leer la imagen');
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

/* ---------- Toast (aviso rápido) ---------- */
let toastTimer;
function toast(msg) {
  clearTimeout(toastTimer);
  let el = $('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  toastTimer = setTimeout(() => el.remove(), 2200);
}

/* ---------- Modal genérico ---------- */
const modalBackdrop = $('#modalBackdrop');
const modalEl = $('#modal');
function openModal(html) {
  modalEl.innerHTML = html;
  modalBackdrop.hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  modalBackdrop.hidden = true;
  modalEl.innerHTML = '';
  document.body.style.overflow = '';
  pendingConfirmCallback = null;
}

// Ventana de confirmación con el estilo de la app (reemplaza confirm() del navegador).
let pendingConfirmCallback = null;
function confirmDialog(message, onConfirm, opts = {}) {
  const { confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false } = opts;
  pendingConfirmCallback = onConfirm;
  openModal(`
    <div class="modal-head">
      <h2>${icon('alert')} Confirmar</h2>
      <button class="modal-close" data-close>${icon('close', 16)}</button>
    </div>
    <div class="modal-body"><p style="margin:0">${escapeHtml(message)}</p></div>
    <div class="modal-foot">
      <button class="btn btn-ghost" data-close>${escapeHtml(cancelLabel)}</button>
      <button class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-block" id="confirmDialogBtn">${escapeHtml(confirmLabel)}</button>
    </div>
  `);
}
modalBackdrop.addEventListener('click', (e) => {
  if (e.target !== modalBackdrop) return;
  if ($('#checkoutTotals')) captureCheckoutInputs();
  closeModal();
  if (S.view === 'vender') renderPOS();
});

// Cierra las listas de autocompletado (clientes/empresas) al tocar fuera de ellas.
document.addEventListener('click', (e) => {
  if (e.target.closest('.autocomplete-wrap')) return;
  $$('.autocomplete-list').forEach((el) => { el.hidden = true; el.innerHTML = ''; });
});

/* ============================================================
   VISTA: VENDER (Punto de venta)
   ============================================================ */
/* ---------- Íconos (SVG, sin emoji ambiguos) ---------- */
const ICON_PATHS = {
  eye: '<circle cx="12" cy="12" r="3"/><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/>',
  eyeOff: '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c6 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s4 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/>',
  edit: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  receipt: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6"/><path d="M9 17h6"/>',
  chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  box: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="M3.3 7 12 12l8.7-5"/><path d="M12 22V12"/>',
  checkCircle: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  mapPin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01"/><path d="M18 12h.01"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>',
  trendingUp: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  award: '<circle cx="12" cy="8" r="6"/><path d="M15.48 13.5 17 22l-5-3-5 3 1.52-8.5"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  palette: '<circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.6-.7 1.6-1.6 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16c3.3 0 6-2.7 6-6 0-4.4-4.5-8-10-8Z"/>',
  rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  utensils: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M12 6h.01"/><path d="M16 6h.01"/><path d="M8 10h.01"/><path d="M12 10h.01"/><path d="M16 10h.01"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42Z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
};
function icon(name, size) {
  return `<svg viewBox="0 0 24 24" width="${size || 18}" height="${size || 18}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name] || ''}</svg>`;
}

const CAT_COLORS = ['#e11d48', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];
function catColor(cat) {
  const custom = (S.settings.categoryColors || {})[cat];
  if (custom) return custom;
  const i = S.settings.categories.indexOf(cat);
  return CAT_COLORS[(i < 0 ? 0 : i) % CAT_COLORS.length];
}

let checkout = { type: 'domicilio', payment: 'efectivo', deliveryFee: 0, cash: '', discountType: 'percent', discountValue: '', cCompany: '' };

function renderPOS() {
  $('#brandName').textContent = S.settings.restaurantName || 'Punto de Venta';

  // Barra de categorías
  const cats = ['Todos', ...S.settings.categories.filter((c) =>
    S.products.some((p) => p.active && p.category === c))];
  $('#catBar').innerHTML = cats.map((c) =>
    `<button class="cat-chip ${c === S.activeCat ? 'active' : ''}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`
  ).join('');

  // Productos (con filtro por categoría y por búsqueda)
  const term = (S.search || '').trim().toLowerCase();
  let list = S.products.filter((p) => p.active &&
    (S.activeCat === 'Todos' || p.category === S.activeCat));
  if (term) list = list.filter((p) => p.name.toLowerCase().includes(term));

  const grid = $('#productGrid');
  if (!S.products.some((p) => p.active)) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <span class="emoji">${icon('utensils',42)}</span>
      No tienes productos todavía.<br>Ve a <strong>Menú</strong> para agregarlos.
    </div>`;
  } else if (list.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <span class="emoji">${icon('search',42)}</span>No se encontraron productos.</div>`;
  } else {
    grid.innerHTML = list.map((p) => {
      const line = S.cart.find((i) => i.productId === p.id);
      const qty = line ? line.qty : 0;
      return `<button class="product-card ${qty ? 'in-cart' : ''} ${p.image ? 'has-img' : ''}" data-add="${p.id}" style="--cat-color:${escapeHtml(catColor(p.category))}">
        ${qty ? `<span class="qty-badge">${qty}</span>` : ''}
        ${p.image ? `<div class="p-img" style="background-image:url('${escapeHtml(p.image)}')"></div>` : ''}
        <div class="p-name">${escapeHtml(p.name)}</div>
        <div class="p-price">${money(p.price)}</div>
        <span class="p-plus">+</span>
      </button>`;
    }).join('');
  }
  renderCartFab();
  renderOrderPanel();
}

function renderCartFab() {
  const fab = $('#cartFab');
  const count = S.cart.reduce((s, i) => s + i.qty, 0);
  if (count === 0) { fab.hidden = true; return; }
  fab.hidden = false;
  $('#cartFabCount').textContent = count;
  $('#cartFabTotal').textContent = money(computeTotals().total);
}

function cartSubtotal() { return S.cart.reduce((s, i) => s + i.price * i.qty, 0); }

// Calcula subtotal, descuento, envío y total a partir del carrito y el estado del cobro.
function computeTotals() {
  const subtotal = cartSubtotal();
  const fee = checkout.type === 'domicilio' ? parseNum(checkout.deliveryFee) : 0;
  const dv = parseNum(checkout.discountValue);
  let discountAmount = 0;
  if (dv > 0) {
    discountAmount = checkout.discountType === 'fixed' ? dv : subtotal * (dv / 100);
    discountAmount = Math.min(discountAmount, subtotal);
  }
  const total = Math.max(0, subtotal - discountAmount + fee);
  return { subtotal, fee, discountAmount, total };
}

// Especificación por producto (ej. "sin cebolla") para un artículo del pedido actual.
function openItemNoteForm(productId) {
  const line = S.cart.find((i) => i.productId === productId);
  if (!line) return;
  openModal(`
    <div class="modal-head">
      <h2>${icon('edit')} Especificación</h2>
      <button class="modal-close" data-close>${icon('close', 16)}</button>
    </div>
    <div class="modal-body">
      <p style="margin-top:0;color:var(--text-muted);font-size:.9rem">${escapeHtml(line.name)}</p>
      <div class="field">
        <label>Nota para este producto (opcional)</label>
        <input id="itemNoteInput" placeholder="Ej. sin cebolla, término medio" value="${escapeHtml(line.notes || '')}">
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" data-close>Cancelar</button>
      <button class="btn btn-primary btn-block" id="saveItemNote">Guardar</button>
    </div>
  `);
  modalEl.dataset.itemProductId = productId;
}
function saveItemNote() {
  const pid = modalEl.dataset.itemProductId;
  const line = S.cart.find((i) => i.productId === pid);
  if (line) line.notes = ($('#itemNoteInput') ? $('#itemNoteInput').value : '').trim();
  closeModal();
  renderPOS();
}

function addToCart(productId) {
  const p = S.products.find((x) => x.id === productId);
  if (!p) return;
  const line = S.cart.find((i) => i.productId === productId);
  if (line) line.qty++;
  else {
    if (S.cart.length === 0) checkout.deliveryFee = checkout.type === 'domicilio' ? Number(S.settings.defaultDeliveryFee || 0) : 0;
    S.cart.push({ productId, name: p.name, price: p.price, qty: 1, notes: '' });
  }
  renderPOS();
}
function changeQty(productId, delta) {
  const line = S.cart.find((i) => i.productId === productId);
  if (!line) return;
  line.qty += delta;
  if (line.qty <= 0) S.cart = S.cart.filter((i) => i.productId !== productId);
  renderPOS();
}

/* ---------- Panel del pedido (al lado en compu, hoja en teléfono) ---------- */
function renderOrderPanel() {
  const panel = $('#orderPanel');
  const { subtotal, fee, discountAmount, total } = computeTotals();

  const items = S.cart.map((i) => {
    const prod = S.products.find((p) => p.id === i.productId);
    return `
    <div class="cart-item">
      ${prod && prod.image ? `<div class="ci-img" style="background-image:url('${escapeHtml(prod.image)}')"></div>` : ''}
      <div class="ci-info">
        <div class="ci-name">${escapeHtml(i.name)}</div>
        <div class="ci-price">${money(i.price)} c/u</div>
        ${i.notes
          ? `<button class="ci-note" data-itemnote="${i.productId}">${icon('edit', 12)} ${escapeHtml(i.notes)}</button>`
          : `<button class="ci-note-add" data-itemnote="${i.productId}">+ especificación</button>`}
      </div>
      <div class="qty-ctrl">
        <button class="qty-btn" data-qty="${i.productId}" data-delta="-1">−</button>
        <span class="qty-num">${i.qty}</span>
        <button class="qty-btn" data-qty="${i.productId}" data-delta="1">+</button>
      </div>
      <div class="ci-total">${money(i.price * i.qty)}</div>
      <button class="icon-btn ci-remove" data-removeitem="${i.productId}" title="Quitar del pedido">${icon('trash', 15)}</button>
    </div>`;
  }).join('');

  panel.innerHTML = `
    <div class="op-head">
      <h2>${icon('receipt')} Pedido</h2>
      <div style="display:flex;gap:8px;align-items:center">
        ${S.cart.length ? `<button class="op-clear" data-clearcart>Vaciar</button>` : ''}
        <button class="op-close" data-closesheet>${icon('close',16)}</button>
      </div>
    </div>
    <div class="op-type">
      <div class="seg">
        <button data-type="domicilio" class="${checkout.type === 'domicilio' ? 'active' : ''}">${icon('truck',16)} Domicilio</button>
        <button data-type="llevar" class="${checkout.type === 'llevar' ? 'active' : ''}">${icon('box',16)} Para llevar</button>
      </div>
    </div>
    <div class="op-items">
      ${S.cart.length ? items : `<div class="op-empty"><span class="emoji">${icon('cart',38)}</span>Toca un producto<br>para agregarlo al pedido</div>`}
    </div>
    <div class="op-foot">
      <div class="totals">
        <div class="total-line"><span class="muted">Subtotal</span><span>${money(subtotal)}</span></div>
        ${discountAmount > 0 ? `<div class="total-line"><span class="muted">Descuento</span><span>-${money(discountAmount)}</span></div>` : ''}
        ${checkout.type === 'domicilio' ? `<div class="total-line"><span class="muted">Envío</span><span>${money(fee)}</span></div>` : ''}
        <div class="total-line grand"><span>Total</span><span>${money(total)}</span></div>
      </div>
      <button class="btn btn-success btn-block btn-lg" id="toCheckout" ${S.cart.length ? '' : 'disabled'} style="margin-top:12px">
        ${S.cart.length ? 'Cobrar ' + money(total) : 'Cobrar'}
      </button>
    </div>`;
}

/* ---------- Hoja del pedido en teléfono ---------- */
function openSheet() {
  if (S.cart.length === 0) return;
  $('#orderPanel').classList.add('open');
  $('#sheetBackdrop').hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeSheet() {
  $('#orderPanel').classList.remove('open');
  $('#sheetBackdrop').hidden = true;
  document.body.style.overflow = '';
}

/* ---------- Modal de cobro ---------- */
function openCheckout() {
  const { subtotal, fee, discountAmount, total } = computeTotals();
  const cashNum = parseNum(checkout.cash);
  const change = cashNum - total;
  const currency = S.settings.currency || '$';

  const customerFields = checkout.type === 'domicilio' ? `
    <div class="field"><label>Nombre del cliente</label><input id="cName" placeholder="Ej. Juan Pérez" value="${escapeHtml(checkout.cName || '')}"></div>
    <div class="field autocomplete-wrap">
      <label>Teléfono</label>
      <input id="cPhone" type="tel" inputmode="tel" placeholder="10 dígitos" value="${escapeHtml(checkout.cPhone || '')}" autocomplete="off">
      <div class="autocomplete-list" id="phoneSuggestions" hidden></div>
      <span class="field-hint">Si ya compró antes, aparecerá aquí para llenar sus datos. <button type="button" class="link-btn" data-openentity="customers">Ver clientes guardados</button></span>
    </div>
    <div class="field autocomplete-wrap">
      <label>Empresa (opcional)</label>
      <input id="cCompany" placeholder="Ej. Constructora ABC" value="${escapeHtml(checkout.cCompany || '')}" autocomplete="off">
      <div class="autocomplete-list" id="companySuggestions" hidden></div>
      <span class="field-hint">Si varias personas piden desde la misma empresa, se reutiliza su dirección. <button type="button" class="link-btn" data-openentity="companies">Ver empresas guardadas</button></span>
    </div>
    <div class="field"><label>Dirección de entrega</label><textarea id="cAddress" rows="2" placeholder="Calle, número, colonia, referencias">${escapeHtml(checkout.cAddress || '')}</textarea></div>
    <div class="field"><label>Costo de envío</label><input id="cFee" type="text" inputmode="decimal" value="${checkout.deliveryFee}"></div>
    <div class="field"><label>Notas del pedido (opcional)</label><input id="cNotes" placeholder="Ej. sin cebolla" value="${escapeHtml(checkout.cNotes || '')}"></div>
  ` : `
    <div class="field"><label>Nombre (opcional)</label><input id="cName" placeholder="Para identificar el pedido" value="${escapeHtml(checkout.cName || '')}"></div>
    <div class="field"><label>Notas (opcional)</label><input id="cNotes" placeholder="Ej. sin picante" value="${escapeHtml(checkout.cNotes || '')}"></div>
  `;

  const cashSection = checkout.payment === 'efectivo' ? `
    <div class="field"><label>¿Con cuánto paga?</label><input id="cCash" type="text" inputmode="decimal" placeholder="0" value="${escapeHtml(checkout.cash)}"></div>
    <div class="change-box ${change < 0 ? 'neg' : ''}" id="changeBox" ${cashNum > 0 ? '' : 'hidden'}>${change < 0 ? 'Faltan ' + money(-change) : 'Cambio: ' + money(change)}</div>
  ` : '';

  openModal(`
    <div class="modal-head">
      <h2 id="checkoutTitle">Cobrar ${money(total)}</h2>
      <button class="modal-close" data-close>${icon('close',16)}</button>
    </div>
    <div class="modal-body">
      ${customerFields}
      <div class="field" style="margin-top:6px">
        <label>${icon('tag', 15)} Descuento (opcional)</label>
        <div class="discount-row">
          <div class="seg seg-mini" id="discSeg">
            <button data-disctype="percent" class="${checkout.discountType === 'percent' ? 'active' : ''}">%</button>
            <button data-disctype="fixed" class="${checkout.discountType === 'fixed' ? 'active' : ''}">${escapeHtml(currency)}</button>
          </div>
          <input id="cDiscount" type="text" inputmode="decimal" placeholder="0" value="${escapeHtml(String(checkout.discountValue || ''))}">
        </div>
      </div>
      <div class="field" style="margin-top:6px">
        <label>Forma de pago</label>
        <div class="seg" id="paySeg">
          <button data-pay="efectivo" class="${checkout.payment === 'efectivo' ? 'active' : ''}">${icon('cash',16)} Efectivo</button>
          <button data-pay="transferencia" class="${checkout.payment === 'transferencia' ? 'active' : ''}">${icon('card',16)} Transf./Tarjeta</button>
        </div>
      </div>
      ${cashSection}
      <div class="totals" id="checkoutTotals">
        <div class="total-line"><span class="muted">Subtotal</span><span>${money(subtotal)}</span></div>
        ${discountAmount > 0 ? `<div class="total-line"><span class="muted">Descuento</span><span>-${money(discountAmount)}</span></div>` : ''}
        ${checkout.type === 'domicilio' ? `<div class="total-line"><span class="muted">Envío</span><span>${money(fee)}</span></div>` : ''}
        <div class="total-line grand"><span>Total</span><span>${money(total)}</span></div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" id="backToCart">Atrás</button>
      <button class="btn btn-success btn-block" id="confirmSale">Confirmar venta</button>
    </div>
  `);
}

// Recalcula el total y el cambio SIN reconstruir la ventana (no toca los campos
// donde el usuario está escribiendo, para no perder el cursor).
function updateCheckoutTotals() {
  if (modalBackdrop.hidden || !$('#checkoutTotals')) return;
  const { subtotal, fee, discountAmount, total } = computeTotals();
  const cashNum = parseNum(checkout.cash);
  const change = cashNum - total;

  $('#checkoutTotals').innerHTML = `
    <div class="total-line"><span class="muted">Subtotal</span><span>${money(subtotal)}</span></div>
    ${discountAmount > 0 ? `<div class="total-line"><span class="muted">Descuento</span><span>-${money(discountAmount)}</span></div>` : ''}
    ${checkout.type === 'domicilio' ? `<div class="total-line"><span class="muted">Envío</span><span>${money(fee)}</span></div>` : ''}
    <div class="total-line grand"><span>Total</span><span>${money(total)}</span></div>
  `;
  const title = $('#checkoutTitle');
  if (title) title.textContent = 'Cobrar ' + money(total);

  const changeBox = $('#changeBox');
  if (changeBox) {
    if (cashNum > 0) {
      changeBox.hidden = false;
      changeBox.className = 'change-box' + (change < 0 ? ' neg' : '');
      changeBox.textContent = change < 0 ? 'Faltan ' + money(-change) : 'Cambio: ' + money(change);
    } else {
      changeBox.hidden = true;
    }
  }
}

// Guarda los valores que el usuario escribió en el cobro (para no perderlos al re-dibujar)
function captureCheckoutInputs() {
  const g = (id) => $('#' + id) ? $('#' + id).value : undefined;
  if (g('cName') !== undefined) checkout.cName = g('cName');
  if (g('cPhone') !== undefined) checkout.cPhone = g('cPhone');
  if (g('cAddress') !== undefined) checkout.cAddress = g('cAddress');
  if (g('cCompany') !== undefined) checkout.cCompany = g('cCompany');
  if (g('cNotes') !== undefined) checkout.cNotes = g('cNotes');
  if (g('cFee') !== undefined) checkout.deliveryFee = parseNum(g('cFee'));
  if (g('cCash') !== undefined) checkout.cash = g('cCash');
  if (g('cDiscount') !== undefined) checkout.discountValue = g('cDiscount');
}

/* ---------- Autocompletado propio (clientes / empresas) ---------- */
function renderPhoneSuggestions(query) {
  const box = $('#phoneSuggestions');
  if (!box) return;
  const digits = query.replace(/\D/g, '');
  const matches = digits ? S.customers.filter((c) => c.phone.includes(digits)).slice(0, 6) : [];
  if (!matches.length) { box.hidden = true; box.innerHTML = ''; return; }
  box.innerHTML = matches.map((c) => `
    <div class="autocomplete-item" data-pickcustomer="${c.id}">
      <div class="ac-name">${escapeHtml(c.name || 'Sin nombre')}</div>
      <div class="ac-sub">${escapeHtml(c.phone)}${c.address ? ' · ' + escapeHtml(c.address) : ''}</div>
    </div>`).join('');
  box.hidden = false;
}
function renderCompanySuggestions(query) {
  const box = $('#companySuggestions');
  if (!box) return;
  const q = query.trim().toLowerCase();
  const matches = q ? S.companies.filter((co) => co.name.toLowerCase().includes(q)).slice(0, 6) : [];
  if (!matches.length) { box.hidden = true; box.innerHTML = ''; return; }
  box.innerHTML = matches.map((co) => `
    <div class="autocomplete-item" data-pickcompany="${co.id}">
      <div class="ac-name">${escapeHtml(co.name)}</div>
      <div class="ac-sub">${co.address ? escapeHtml(co.address) : 'Sin dirección'}</div>
    </div>`).join('');
  box.hidden = false;
}
function pickCustomerSuggestion(c) {
  const phoneEl = $('#cPhone');
  if (phoneEl) { phoneEl.value = c.phone; checkout.cPhone = c.phone; }
  const nameEl = $('#cName');
  if (nameEl && !nameEl.value.trim() && c.name) { nameEl.value = c.name; checkout.cName = c.name; }
  const addrEl = $('#cAddress');
  if (addrEl && !addrEl.value.trim() && c.address) { addrEl.value = c.address; checkout.cAddress = c.address; }
  const coEl = $('#cCompany');
  if (coEl && !coEl.value.trim() && c.company) { coEl.value = c.company; checkout.cCompany = c.company; }
  const box = $('#phoneSuggestions'); if (box) { box.hidden = true; box.innerHTML = ''; }
}
function pickCompanySuggestion(co) {
  const companyEl = $('#cCompany') || $('#custCompany');
  if (companyEl) {
    companyEl.value = co.name;
    if (companyEl.id === 'cCompany') checkout.cCompany = co.name;
  }
  const addrEl = $('#cAddress') || $('#custAddress');
  if (addrEl && !addrEl.value.trim() && co.address) {
    addrEl.value = co.address;
    if (addrEl.id === 'cAddress') checkout.cAddress = co.address;
  }
  const box = $('#companySuggestions'); if (box) { box.hidden = true; box.innerHTML = ''; }
}

function confirmSale() {
  if (!isActivated() && salesUsed() >= TRIAL_LIMIT) { closeModal(); openPaywall(); return; }

  captureCheckoutInputs();

  if (checkout.type === 'domicilio') {
    if (!(checkout.cAddress || '').trim()) { toast('Falta la dirección de entrega'); const el = $('#cAddress'); if (el) el.focus(); return; }
    if (!(checkout.cPhone || '').trim()) { toast('Falta el teléfono del cliente'); const el = $('#cPhone'); if (el) el.focus(); return; }
  }

  const { subtotal, fee: deliveryFee, discountAmount, total } = computeTotals();
  const cashNum = parseNum(checkout.cash);

  if (checkout.payment === 'efectivo' && cashNum > 0 && cashNum < total) {
    confirmDialog(
      'El monto recibido es menor al total. ¿Guardar de todos modos?',
      () => finalizeSale({ subtotal, deliveryFee, discountAmount, total, cashNum }),
      { confirmLabel: 'Guardar de todos modos' }
    );
    return;
  }

  finalizeSale({ subtotal, deliveryFee, discountAmount, total, cashNum });
}

function finalizeSale({ subtotal, deliveryFee, discountAmount, total, cashNum }) {
  const order = {
    id: uid(),
    folio: nextFolio(),
    date: Date.now(),
    items: S.cart.map((i) => ({ name: i.name, price: i.price, qty: i.qty, notes: i.notes || '' })),
    type: checkout.type,
    customer: {
      name: checkout.cName || '',
      phone: checkout.cPhone || '',
      address: checkout.cAddress || '',
      notes: checkout.cNotes || '',
      company: checkout.cCompany || '',
    },
    subtotal,
    discountType: checkout.discountType,
    discountValue: parseNum(checkout.discountValue),
    discountAmount,
    deliveryFee,
    total,
    payment: checkout.payment,
    cashReceived: checkout.payment === 'efectivo' ? cashNum : null,
    change: checkout.payment === 'efectivo' && cashNum > 0 ? cashNum - total : null,
    status: 'preparacion',
  };

  S.orders.unshift(order);
  saveOrders();
  updateActiveBadge();
  if (order.customer.company) upsertCompany({ name: order.customer.company, address: order.customer.address });
  if (order.customer.phone) upsertCustomer(order.customer);

  // Limpiar carrito y datos de cobro
  S.cart = [];
  checkout = { type: 'domicilio', payment: 'efectivo', deliveryFee: 0, cash: '', discountType: 'percent', discountValue: '', cCompany: '' };

  updateDayTotal();
  closeSheet();
  renderPOS();
  showTicket(order);

  if (!isActivated() && trialRemaining() > 0 && trialRemaining() <= 3) {
    setTimeout(() => toast(`Te quedan ${trialRemaining()} ventas de prueba gratis`), 600);
  }
}

/* ---------- Licencia: pantalla de activación / fin de prueba ---------- */
function openPaywall() {
  const waLink = SELLER_WHATSAPP
    ? `https://wa.me/${SELLER_WHATSAPP}?text=${encodeURIComponent('Hola, quiero activar mi Punto de Venta')}`
    : '';
  openModal(`
    <div class="modal-head">
      <h2>${icon('tag')} Activa tu Punto de Venta</h2>
      <button class="modal-close" data-close>${icon('close', 16)}</button>
    </div>
    <div class="modal-body">
      <p>Ya usaste tus ${TRIAL_LIMIT} ventas de prueba gratis. Para seguir vendiendo,
      activa tu licencia con el código que te dieron al comprar.</p>
      <div class="field">
        <label>Código de activación</label>
        <input id="licenseInput" placeholder="XXXX-XXXX-XXXX" autocomplete="off" style="text-transform:uppercase">
      </div>
      <button class="btn btn-primary btn-block" id="activateLicenseBtn">Activar</button>
      ${waLink ? `<a class="btn btn-block" style="margin-top:10px;text-decoration:none;display:flex;align-items:center;justify-content:center;gap:8px" href="${waLink}" target="_blank">${icon('chat')} Comprar por WhatsApp</a>` : ''}
      <p class="field-hint" style="text-align:center;margin-top:10px">Tus ventas y tu menú siguen guardados, solo se pausan las ventas nuevas hasta activar.</p>
    </div>
  `);
}

function activateLicense() {
  const el = $('#licenseInput');
  const code = el ? el.value : '';
  if (!isValidLicense(code)) { toast('Código inválido, revísalo e intenta de nuevo'); return; }
  S.settings.licenseCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  saveSettings();
  closeModal();
  toast('¡Activado! Ya puedes seguir vendiendo');
  if (S.view === 'ajustes') renderSettings();
}

/* ---------- Ticket ---------- */
function ticketHtml(o) {
  const lines = o.items.map((i) => `
    <div class="t-row"><span>${i.qty}x ${escapeHtml(i.name)}</span><span>${money(i.price * i.qty)}</span></div>
    ${i.notes ? `<div class="t-item-note">— ${escapeHtml(i.notes)}</div>` : ''}
  `).join('');
  const cust = o.type === 'domicilio' && (o.customer.name || o.customer.address) ? `
    <hr>
    <div>Cliente: ${escapeHtml(o.customer.name || '-')}</div>
    ${o.customer.phone ? `<div>Tel: ${escapeHtml(o.customer.phone)}</div>` : ''}
    ${o.customer.address ? `<div class="t-pre">Dir: ${escapeHtml(o.customer.address)}</div>` : ''}
  ` : '';
  const notes = o.customer.notes ? `<div class="t-pre">Notas: ${escapeHtml(o.customer.notes)}</div>` : '';
  const payLabel = o.payment === 'efectivo' ? 'Efectivo' : 'Transferencia/Tarjeta';
  const cashLines = o.payment === 'efectivo' && o.cashReceived ? `
    <div class="t-row"><span>Recibido</span><span>${money(o.cashReceived)}</span></div>
    <div class="t-row"><span>Cambio</span><span>${money(o.change || 0)}</span></div>
  ` : '';

  return `<div class="ticket">
    ${S.settings.logo ? `<div class="t-center"><img src="${S.settings.logo}" style="max-width:130px;max-height:70px;object-fit:contain"></div>` : ''}
    <div class="t-center t-big">${escapeHtml(S.settings.restaurantName || 'Restaurante')}</div>
    ${S.settings.phone ? `<div class="t-center">Tel: ${escapeHtml(S.settings.phone)}</div>` : ''}
    ${S.settings.address ? `<div class="t-center">${escapeHtml(S.settings.address)}</div>` : ''}
    <hr>
    <div class="t-row"><span>Folio #${o.folio}</span><span>${fmtTime(o.date)}</span></div>
    <div>${fmtDate(o.date)}</div>
    <div class="t-order-type">${o.type === 'domicilio' ? 'Pedido a domicilio' : 'Pedido para llevar'}</div>
    <hr>
    ${lines}
    <hr>
    <div class="t-row"><span>Subtotal</span><span>${money(o.subtotal)}</span></div>
    ${o.discountAmount ? `<div class="t-row"><span>Descuento${o.discountType === 'percent' ? ` (${o.discountValue}%)` : ''}</span><span>-${money(o.discountAmount)}</span></div>` : ''}
    ${o.deliveryFee ? `<div class="t-row"><span>Envío</span><span>${money(o.deliveryFee)}</span></div>` : ''}
    <div class="t-row t-total"><span>TOTAL</span><span>${money(o.total)}</span></div>
    <div class="t-row"><span>Pago</span><span>${payLabel}</span></div>
    ${cashLines}
    ${cust}
    ${notes}
    <hr>
    <div class="t-center">¡Gracias por su compra!</div>
  </div>`;
}

function showTicket(o) {
  openModal(`
    <div class="modal-head">
      <h2>${icon('checkCircle')} Venta guardada</h2>
      <button class="modal-close" data-close>${icon('close',16)}</button>
    </div>
    <div class="modal-body">${ticketHtml(o)}</div>
    <div class="modal-foot" style="flex-wrap:wrap">
      <button class="btn" id="printTicket">${icon('printer')} Imprimir</button>
      <button class="btn" id="waTicket">${icon('chat')} WhatsApp</button>
      <button class="btn btn-primary btn-block" data-close style="flex:1 1 100%">Nueva venta</button>
    </div>
  `);
  modalEl.dataset.orderId = o.id;
}

function printTicket(o) {
  let area = $('#printArea');
  if (!area) { area = document.createElement('div'); area.id = 'printArea'; document.body.appendChild(area); }
  area.innerHTML = ticketHtml(o);

  // El navegador imprime el título de la pestaña en el encabezado de la hoja.
  // Lo cambiamos por el folio para que no diga "Punto de Venta".
  const prevTitle = document.title;
  document.title = `${S.settings.restaurantName || 'Ticket'} - Folio ${o.folio}`;
  window.print();
  setTimeout(() => { document.title = prevTitle; }, 500);

  if (!DB.get('mv_printhint_shown', false)) {
    DB.set('mv_printhint_shown', true);
    toast('Tip: en "Más opciones" del cuadro de impresión, desactiva "Encabezados y pies" para un ticket más limpio');
  }
}

// Mensaje corto avisando el avance del pedido (distinto del ticket completo).
const STATUS_MESSAGES = {
  preparacion: 'Tu pedido está en preparación.',
  camino: 'Tu pedido va en camino.',
  listo: 'Tu pedido está listo para recoger.',
  entregado: 'Tu pedido fue entregado. ¡Gracias por tu compra!',
};
function whatsappStatusUpdate(o) {
  const msg = STATUS_MESSAGES[o.status || 'preparacion'];
  const text = encodeURIComponent(`*${S.settings.restaurantName || 'Restaurante'}*\n${msg}`);
  const phone = (o.customer.phone || '').replace(/\D/g, '');
  if (!phone) toast('Sin teléfono guardado: elige el contacto en WhatsApp');
  const url = phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
  window.open(url, '_blank');
}

function whatsappTicket(o) {
  const L = [];
  L.push(`*${S.settings.restaurantName || 'Restaurante'}*`);
  L.push(o.type === 'domicilio' ? 'Pedido a domicilio' : 'Pedido para llevar');
  L.push('');
  o.items.forEach((i) => {
    L.push(`${i.qty}x ${i.name} — ${money(i.price * i.qty)}`);
    if (i.notes) L.push(`   (${i.notes})`);
  });
  L.push('');
  L.push(`Subtotal: ${money(o.subtotal)}`);
  if (o.discountAmount) L.push(`Descuento${o.discountType === 'percent' ? ` (${o.discountValue}%)` : ''}: -${money(o.discountAmount)}`);
  if (o.deliveryFee) L.push(`Envío: ${money(o.deliveryFee)}`);
  L.push(`*Total: ${money(o.total)}*`);
  L.push(`Pago: ${o.payment === 'efectivo' ? 'Efectivo' : 'Transferencia/Tarjeta'}`);
  if (o.type === 'domicilio' && o.customer.address) {
    L.push('');
    if (o.customer.name) L.push(`Cliente: ${o.customer.name}`);
    L.push(`Dirección: ${o.customer.address}`);
  }
  if (o.customer.notes) L.push(`Notas: ${o.customer.notes}`);
  const text = encodeURIComponent(L.join('\n'));
  const phone = (o.customer.phone || '').replace(/\D/g, '');
  if (!phone) toast('Sin teléfono guardado: elige el contacto en WhatsApp');
  const url = phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
  window.open(url, '_blank');
}

/* ============================================================
   VISTA: HISTORIAL
   ============================================================ */
function updateDayTotal() {
  const start = startOfToday();
  const total = S.orders.filter((o) => o.date >= start).reduce((s, o) => s + o.total, 0);
  $('#dayTotal').textContent = 'Hoy: ' + money(total);
}

const PERIODS = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mes' },
  { id: 'todo', label: 'Siempre' },
];
function periodStart(period) {
  if (period === 'hoy') return startOfToday();
  if (period === 'semana') return startOfToday() - 6 * 864e5;   // últimos 7 días
  if (period === 'mes') return startOfToday() - 29 * 864e5;     // últimos 30 días
  return 0;                                                     // todo
}

/* ============================================================
   VISTA: PEDIDOS (estados de entrega)
   ============================================================ */
function activeOrders() {
  return S.orders.filter((o) => (o.status || 'entregado') !== 'entregado');
}
function updateActiveBadge() {
  const n = activeOrders().length;
  const badge = $('#pedidosBadge');
  if (!badge) return;
  badge.textContent = n;
  badge.hidden = n === 0;
}

function renderPedidos() {
  const active = activeOrders().sort((a, b) => a.date - b.date); // más antiguos primero
  $('#pedidosHead').innerHTML = `
    <h2 class="pedidos-title">${icon('truck')} Pedidos activos <span class="count-chip">${active.length}</span></h2>
    <p class="field-hint">Toca el botón grande para avanzar el estado. Al entregar, el pedido pasa al Historial.</p>
  `;

  if (active.length === 0) {
    $('#pedidosList').innerHTML = `<div class="empty-state">
      <span class="emoji">${icon('checkCircle',42)}</span>No hay pedidos pendientes.<br>Las ventas nuevas aparecen aquí para darles seguimiento.</div>`;
    return;
  }

  $('#pedidosList').innerHTML = active.map((o) => {
    const st = STATUS[o.status || 'preparacion'];
    const next = nextStatus(o);
    const nextMeta = next ? STATUS[next] : null;
    const prev = previousStatus(o);
    const itemsTxt = o.items.map((i) => `${i.qty}× ${escapeHtml(i.name)}`).join(', ');
    const dom = o.type === 'domicilio';
    return `
      <div class="pedido-card" style="--st:${st.color}">
        <div class="pc-top">
          <div>
            <span class="o-folio">#${o.folio}</span>
            <span class="tag tag-${o.type}">${dom ? 'Domicilio' : 'Para llevar'}</span>
          </div>
          <span class="status-pill" style="background:${st.color}1a;color:${st.color}">${icon(st.icon,15)} ${st.label}</span>
        </div>
        <div class="pc-items">${itemsTxt}</div>
        ${dom && o.customer.address ? `<div class="pc-addr">${icon('mapPin',14)} ${escapeHtml(o.customer.address)}${o.customer.name ? ' · ' + escapeHtml(o.customer.name) : ''}</div>` : ''}
        <div class="pc-meta">
          <span>${money(o.total)} · ${o.payment === 'efectivo' ? icon('cash',13) + ' Efectivo' : icon('card',13) + ' Transf.'}</span>
          <span>${minsAgo(o.date)}</span>
        </div>
        <div class="pc-actions">
          ${prev ? `<button class="icon-btn" data-revert="${o.id}" title="Regresar a: ${STATUS[prev].label}">${icon('undo')}</button>` : ''}
          ${nextMeta
            ? `<button class="btn btn-primary btn-block" data-advance="${o.id}" style="background:${nextMeta.color};border-color:${nextMeta.color}">Marcar: ${icon(nextMeta.icon,15)} ${nextMeta.label}</button>`
            : ''}
          <button class="icon-btn-label" data-order="${o.id}">${icon('receipt')}<span>Detalle</span></button>
          <button class="icon-btn-label" data-wapp="${o.id}">${icon('chat')}<span>Avisar</span></button>
        </div>
      </div>`;
  }).join('');
}

function advanceStatus(id) {
  const o = S.orders.find((x) => x.id === id);
  if (!o) return;
  const n = nextStatus(o);
  if (!n) return;
  o.status = n;
  saveOrders();
  updateActiveBadge();
  renderPedidos();
  toast(n === 'entregado' ? 'Pedido entregado' : `Ahora: ${STATUS[n].label}`);
}

// Regresa el pedido al estado anterior, por si se avanzó por equivocación
// (incluso desde "Entregado", para que vuelva a aparecer en Pedidos activos).
function revertStatus(id) {
  const o = S.orders.find((x) => x.id === id);
  if (!o) return;
  const p = previousStatus(o);
  if (!p) return;
  o.status = p;
  saveOrders();
  updateActiveBadge();
  renderPedidos();
  toast(`Regresado a: ${STATUS[p].label}`);
}

/* ---------- Gráfica de tendencia (línea/área) para ventas por día o por mes ----------
   Un bar chart con muchos días en $0 se ve raro (puros palitos casi invisibles).
   Para una tendencia en el tiempo, una línea/área se lee mucho mejor. */
const TREND_W = 600, TREND_H = 160, TREND_PAD_TOP = 16, TREND_PAD_BOTTOM = 28, TREND_PAD_X = 4;
function trendX(i, n) { return n <= 1 ? TREND_W / 2 : TREND_PAD_X + (i * (TREND_W - TREND_PAD_X * 2)) / (n - 1); }
function trendY(v, maxVal) {
  const chartH = TREND_H - TREND_PAD_TOP - TREND_PAD_BOTTOM;
  return TREND_PAD_TOP + chartH - (v / maxVal) * chartH;
}

function buildTrendChart(points, title) {
  const n = points.length;
  const maxVal = Math.max(1, ...points.map((p) => p.value));
  const baseline = TREND_H - TREND_PAD_BOTTOM;
  const linePts = points.map((p, i) => `${trendX(i, n)},${trendY(p.value, maxVal)}`).join(' ');
  const areaPts = `${trendX(0, n)},${baseline} ${linePts} ${trendX(n - 1, n)},${baseline}`;
  const last = points[n - 1];

  // Etiquetas del eje: si hay muchos puntos, solo mostramos algunas para no amontonarlas.
  const step = n <= 8 ? 1 : Math.ceil(n / 6);
  const labelsHtml = points.map((p, i) => {
    if (i !== 0 && i !== n - 1 && i % step !== 0) return '';
    return `<span class="trend-label" style="left:${(trendX(i, n) / TREND_W) * 100}%">${escapeHtml(p.label)}</span>`;
  }).join('');

  return `
    <div class="chart-card">
      <h3>${icon('trendingUp')} ${escapeHtml(title)}</h3>
      <div class="trend-chart" id="trendChart">
        <svg viewBox="0 0 ${TREND_W} ${TREND_H}" preserveAspectRatio="none" class="trend-svg">
          <line x1="${TREND_PAD_X}" y1="${baseline}" x2="${TREND_W - TREND_PAD_X}" y2="${baseline}" class="trend-baseline"/>
          <polygon points="${areaPts}" class="trend-area"/>
          <polyline points="${linePts}" class="trend-line"/>
          <circle cx="${trendX(n - 1, n)}" cy="${trendY(last.value, maxVal)}" r="4" class="trend-enddot"/>
          <circle id="trendHoverDot" cx="${trendX(n - 1, n)}" cy="${trendY(last.value, maxVal)}" r="5" class="trend-hoverdot" opacity="0"/>
        </svg>
        <div class="trend-labels">${labelsHtml}</div>
        <div class="trend-tooltip" id="trendTooltip" hidden></div>
      </div>
    </div>`;
}

// Se llama después de inyectar el HTML: engancha el tooltip al pasar el dedo/mouse.
function attachTrendInteractivity(points) {
  const wrap = $('#trendChart');
  if (!wrap) return;
  const svg = wrap.querySelector('.trend-svg');
  const tooltip = $('#trendTooltip');
  const hoverDot = $('#trendHoverDot');
  const n = points.length;
  const maxVal = Math.max(1, ...points.map((p) => p.value));

  function showAt(idx) {
    idx = Math.max(0, Math.min(n - 1, idx));
    const p = points[idx];
    hoverDot.setAttribute('cx', trendX(idx, n));
    hoverDot.setAttribute('cy', trendY(p.value, maxVal));
    hoverDot.setAttribute('opacity', '1');
    tooltip.hidden = false;
    tooltip.innerHTML = `<div class="tt-label">${escapeHtml(p.label)}</div><div class="tt-value">${money(p.value)}</div>`;
    const pct = Math.min(92, Math.max(8, (trendX(idx, n) / TREND_W) * 100));
    tooltip.style.left = pct + '%';
  }
  function hide() { hoverDot.setAttribute('opacity', '0'); tooltip.hidden = true; }
  function handlePointer(clientX) {
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return;
    const rel = (clientX - rect.left) / rect.width;
    showAt(Math.round(rel * (n - 1)));
  }
  svg.addEventListener('mousemove', (e) => handlePointer(e.clientX));
  svg.addEventListener('mouseleave', hide);
  svg.addEventListener('touchstart', (e) => handlePointer(e.touches[0].clientX), { passive: true });
  svg.addEventListener('touchmove', (e) => handlePointer(e.touches[0].clientX), { passive: true });
  svg.addEventListener('touchend', hide);
}

function renderHistorial() {
  const period = S.histPeriod || 'hoy';
  const start = periodStart(period);
  const orders = S.orders.filter((o) => o.date >= start);

  const total = orders.reduce((s, o) => s + o.total, 0);
  const avg = orders.length ? total / orders.length : 0;
  const cash = orders.filter((o) => o.payment === 'efectivo').reduce((s, o) => s + o.total, 0);
  const transfer = total - cash;
  const nDom = orders.filter((o) => o.type === 'domicilio').length;
  const discounts = orders.reduce((s, o) => s + (o.discountAmount || 0), 0);

  // Selector de periodo + tarjetas de resumen
  $('#histSummary').innerHTML = `
    <div class="seg period-seg">
      ${PERIODS.map((p) => `<button data-period="${p.id}" class="${p.id === period ? 'active' : ''}">${p.label}</button>`).join('')}
    </div>
    <div class="stat-grid">
      <div class="stat-card"><div class="s-label">Ventas</div><div class="s-value">${money(total)}</div></div>
      <div class="stat-card"><div class="s-label">Pedidos</div><div class="s-value">${orders.length}</div></div>
      <div class="stat-card"><div class="s-label">Ticket prom.</div><div class="s-value">${money(avg)}</div></div>
      <div class="stat-card"><div class="s-label">${icon('cash')} Efectivo</div><div class="s-value">${money(cash)}</div></div>
      <div class="stat-card"><div class="s-label">${icon('card')} Transf./Tarjeta</div><div class="s-value">${money(transfer)}</div></div>
      <div class="stat-card"><div class="s-label">${icon('truck')} A domicilio</div><div class="s-value">${nDom}</div></div>
      ${discounts > 0 ? `<div class="stat-card"><div class="s-label">${icon('tag')} Descuentos</div><div class="s-value">${money(discounts)}</div></div>` : ''}
    </div>
  `;

  // Gráfica de ventas por día (o por mes, si el periodo "Todo" abarca mucho tiempo)
  let salesChart = '';
  let trendPoints = null;
  if (period !== 'hoy' && orders.length) {
    const from = period === 'todo' ? orders.reduce((m, o) => Math.min(m, o.date), Date.now()) : start;
    const spanDays = Math.round((startOfToday() - from) / 864e5) + 1;

    if (spanDays > 31) {
      // Rango muy largo: agrupar por mes para que la gráfica no crezca sin límite
      const byMonth = {};
      orders.forEach((o) => {
        const d = new Date(o.date);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        byMonth[key] = (byMonth[key] || 0) + o.total;
      });
      const monthKeys = Object.keys(byMonth).sort();
      trendPoints = monthKeys.map((k) => {
        const [y, m] = k.split('-').map(Number);
        return { label: new Date(y, m, 1).toLocaleDateString('es-MX', { month: 'short', year: '2-digit' }), value: byMonth[k] };
      });
      salesChart = buildTrendChart(trendPoints, 'Ventas por mes');
    } else {
      const days = [];
      for (let d = startOfToday(); d >= from; d -= 864e5) days.unshift(d);
      trendPoints = days.map((d) => ({
        label: new Date(d).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric' }),
        value: orders.filter((o) => dayKey(o.date) === dayKey(d)).reduce((s, o) => s + o.total, 0),
      }));
      salesChart = buildTrendChart(trendPoints, 'Ventas por día');
    }
  }

  // Gráfica: productos más vendidos en el periodo (etiqueta ancha para no truncar el nombre)
  const counts = {};
  orders.forEach((o) => o.items.forEach((i) => { counts[i.name] = (counts[i.name] || 0) + i.qty; }));
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxCount = top.length ? top[0][1] : 1;
  const topChart = top.length ? `
    <div class="chart-card">
      <h3>${icon('award')} Más vendidos</h3>
      <div class="dot-plot">
        ${top.map(([name, c], i) => `
          <div class="dot-row">
            <span class="dot-label">${i + 1}. ${escapeHtml(name)}</span>
            <div class="dot-track">
              <div class="dot-stem" style="width:${(c / maxCount) * 100}%"></div>
              <div class="dot-marker" style="left:${(c / maxCount) * 100}%"></div>
            </div>
            <strong class="dot-value">${c}</strong>
          </div>`).join('')}
      </div>
    </div>` : '';

  // Lista de pedidos del periodo, agrupada por día
  let listHtml = '';
  if (orders.length === 0) {
    listHtml = `<div class="empty-state"><span class="emoji">${icon('trendingUp',42)}</span>No hay ventas en este periodo.</div>`;
  } else {
    let lastDay = null;
    orders.forEach((o) => {
      const k = dayKey(o.date);
      if (k !== lastDay) {
        lastDay = k;
        const dayTotal = orders.filter((x) => dayKey(x.date) === k).reduce((s, x) => s + x.total, 0);
        listHtml += `<div class="hist-day-title">${fmtDate(o.date)} · ${money(dayTotal)}</div>`;
      }
      listHtml += `
        <div class="order-row" data-order="${o.id}">
          <div class="o-main">
            <div class="o-folio">#${o.folio}
              <span class="tag tag-${o.type}">${o.type === 'domicilio' ? 'Domicilio' : 'Llevar'}</span>
              <span class="tag tag-${o.payment}">${o.payment === 'efectivo' ? 'Efectivo' : 'Transf.'}</span>
              ${o.discountAmount ? `<span class="tag tag-discount">${icon('tag',12)} -${money(o.discountAmount)}</span>` : ''}
              ${o.status && o.status !== 'entregado' ? `<span class="tag" style="background:${STATUS[o.status].color}1a;color:${STATUS[o.status].color}">${icon(STATUS[o.status].icon,13)} ${STATUS[o.status].label}</span>` : ''}
            </div>
            <div class="o-meta">${fmtTime(o.date)} · ${o.items.reduce((s, i) => s + i.qty, 0)} art.${o.customer.name ? ' · ' + escapeHtml(o.customer.name) : ''}</div>
          </div>
          <div class="o-total">${money(o.total)}</div>
        </div>`;
    });
  }
  $('#histList').innerHTML = salesChart + topChart + listHtml;
  if (trendPoints) attachTrendInteractivity(trendPoints);
}

function openOrderDetail(id) {
  const o = S.orders.find((x) => x.id === id);
  if (!o) return;
  const st = STATUS[o.status || 'entregado'];
  const next = nextStatus(o);
  const nextMeta = next ? STATUS[next] : null;
  const prev = previousStatus(o);
  const statusBar = `
    <div class="detail-status">
      <span>Estado:</span>
      <span class="status-pill" style="background:${st.color}1a;color:${st.color}">${icon(st.icon,15)} ${st.label}</span>
      <div style="margin-left:auto;display:flex;gap:8px">
        ${prev ? `<button class="icon-btn" data-revert="${o.id}" title="Regresar a: ${STATUS[prev].label}">${icon('undo')}</button>` : ''}
        ${nextMeta ? `<button class="btn btn-primary" data-advance="${o.id}" style="background:${nextMeta.color};border-color:${nextMeta.color}">→ ${nextMeta.label}</button>` : ''}
      </div>
    </div>`;
  openModal(`
    <div class="modal-head">
      <h2>Pedido #${o.folio}</h2>
      <button class="modal-close" data-close>${icon('close',16)}</button>
    </div>
    <div class="modal-body">
      ${statusBar}
      ${ticketHtml(o)}
    </div>
    <div class="modal-foot" style="flex-wrap:wrap">
      <button class="btn" id="printTicket">${icon('printer')} Imprimir</button>
      <button class="btn" id="waTicket">${icon('chat')} WhatsApp</button>
      <button class="btn btn-danger" id="deleteOrder">${icon('trash')} Borrar</button>
    </div>
  `);
  modalEl.dataset.orderId = o.id;
}

/* ============================================================
   VISTA: MENÚ (administrar productos)
   ============================================================ */
function openCategoryColorPicker(cat) {
  const current = catColor(cat);
  openModal(`
    <div class="modal-head">
      <h2>${icon('palette')} Color de "${escapeHtml(cat)}"</h2>
      <button class="modal-close" data-close>${icon('close', 16)}</button>
    </div>
    <div class="modal-body">
      <div class="color-presets">
        ${COLOR_PRESETS.map((c) => `<button type="button" class="swatch ${c.toLowerCase() === current.toLowerCase() ? 'active' : ''}" data-catcolor="${c}" style="background:${c}"></button>`).join('')}
        <label class="swatch swatch-custom">${icon('palette', 16)}<input type="color" id="catColorInput" value="${current}"></label>
      </div>
    </div>
  `);
  modalEl.dataset.editingCat = cat;
  $('#catColorInput').addEventListener('change', (e) => setCategoryColor(cat, e.target.value));
}
function setCategoryColor(cat, color) {
  S.settings.categoryColors = S.settings.categoryColors || {};
  S.settings.categoryColors[cat] = color;
  saveSettings();
  closeModal();
  renderMenu();
}

function renderMenu() {
  const wrap = $('#menuAdmin');
  if (S.products.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><span class="emoji">${icon('utensils',42)}</span>No hay productos. Agrega el primero.</div>`;
    return;
  }
  const cats = [...new Set(S.products.map((p) => p.category))];
  wrap.innerHTML = cats.map((cat) => `
    <div>
      <h3 class="menu-cat-title">
        <button type="button" class="cat-color-dot" data-editcatcolor="${escapeHtml(cat)}" style="background:${catColor(cat)}" title="Cambiar color de la categoría"></button>
        <span>${escapeHtml(cat)}</span>
      </h3>
      ${S.products.filter((p) => p.category === cat).map((p) => `
        <div class="menu-row">
          <div class="m-thumb" style="${p.image ? `background-image:url('${escapeHtml(p.image)}')` : ''}">${p.image ? '' : icon('utensils',20)}</div>
          <div class="m-info">
            <div class="m-name ${p.active ? '' : 'off'}">${escapeHtml(p.name)}</div>
            <div class="m-price">${money(p.price)}</div>
          </div>
          <button class="icon-btn" data-toggle="${p.id}" title="${p.active ? 'Ocultar del menú' : 'Mostrar en el menú'}">${icon(p.active ? 'eye' : 'eyeOff')}</button>
          <button class="icon-btn" data-edit="${p.id}" title="Editar">${icon('edit')}</button>
          <button class="icon-btn" data-delete="${p.id}" title="Borrar">${icon('trash')}</button>
        </div>`).join('')}
    </div>`).join('');
}

let productImage = ''; // imagen (dataURL) del producto que se está editando
function openProductForm(id) {
  const p = id ? S.products.find((x) => x.id === id) : null;
  productImage = p && p.image ? p.image : '';
  const catOptions = S.settings.categories.map((c) =>
    `<option value="${escapeHtml(c)}" ${p && p.category === c ? 'selected' : ''}>${escapeHtml(c)}</option>`
  ).join('');
  openModal(`
    <div class="modal-head">
      <h2>${p ? 'Editar producto' : 'Nuevo producto'}</h2>
      <button class="modal-close" data-close>${icon('close',16)}</button>
    </div>
    <div class="modal-body">
      <div class="field">
        <label>Imagen (opcional)</label>
        <div class="img-picker">
          <div class="img-preview" id="imgPreview" style="${productImage ? `background-image:url('${escapeHtml(productImage)}')` : ''}">${productImage ? '' : icon('image',24)}</div>
          <div class="img-actions">
            <button type="button" class="btn" id="pickImg">${productImage ? 'Cambiar' : 'Elegir imagen'}</button>
            <button type="button" class="btn btn-ghost" id="removeImg" ${productImage ? '' : 'hidden'}>Quitar</button>
          </div>
        </div>
        <input type="file" id="pImgFile" accept="image/*" hidden>
      </div>
      <div class="field"><label>Nombre</label><input id="pName" placeholder="Ej. Hamburguesa" value="${p ? escapeHtml(p.name) : ''}"></div>
      <div class="field"><label>Precio</label><input id="pPrice" type="text" inputmode="decimal" placeholder="0" value="${p ? p.price : ''}"></div>
      <div class="field"><label>Categoría</label>
        <select id="pCat">${catOptions}<option value="__new__">+ Nueva categoría…</option></select>
      </div>
      <div class="field" id="newCatField" hidden><label>Nombre de la nueva categoría</label><input id="pNewCat" placeholder="Ej. Combos"></div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" data-close>Cancelar</button>
      <button class="btn btn-primary btn-block" id="saveProduct">Guardar</button>
    </div>
  `);
  modalEl.dataset.editId = id || '';
  $('#pCat').addEventListener('change', (e) => {
    $('#newCatField').hidden = e.target.value !== '__new__';
  });
  $('#pImgFile').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    resizeImage(file, 500, (dataUrl) => {
      productImage = dataUrl;
      const prev = $('#imgPreview');
      if (prev) { prev.style.backgroundImage = `url('${dataUrl}')`; prev.textContent = ''; }
      const rm = $('#removeImg'); if (rm) rm.hidden = false;
      const pick = $('#pickImg'); if (pick) pick.textContent = 'Cambiar';
    });
  });
}

function saveProduct() {
  const id = modalEl.dataset.editId;
  const name = $('#pName').value.trim();
  const price = parseFloat($('#pPrice').value.trim().replace(',', '.'));
  let cat = $('#pCat').value;
  if (cat === '__new__') {
    cat = $('#pNewCat').value.trim();
    if (!cat) { toast('Escribe el nombre de la categoría'); return; }
    if (!S.settings.categories.includes(cat)) { S.settings.categories.push(cat); saveSettings(); }
  }
  if (!name) { toast('Escribe el nombre'); return; }
  if (isNaN(price) || price < 0) { toast('Escribe un precio válido'); return; }

  if (id) {
    const p = S.products.find((x) => x.id === id);
    Object.assign(p, { name, price, category: cat, image: productImage });
  } else {
    S.products.push({ id: uid(), name, price, category: cat, active: true, image: productImage });
  }
  if (!saveProducts()) return;
  closeModal();
  renderMenu();
  toast('Producto guardado');
}

/* ============================================================
   VISTA: AJUSTES
   ============================================================ */
/* ---------- Clientes guardados ---------- */
function openCustomersList() {
  const rows = S.customers.slice().sort((a, b) => b.updatedAt - a.updatedAt);
  openModal(`
    <div class="modal-head">
      <h2>${icon('users')} Clientes guardados</h2>
      <button class="modal-close" data-close>${icon('close', 16)}</button>
    </div>
    <div class="modal-body">
      <button class="btn btn-primary btn-block" id="addCustomerBtn" style="margin-bottom:14px">${icon('plus')} Agregar cliente</button>
      ${rows.length ? rows.map((c) => `
        <div class="menu-row">
          <div class="m-info">
            <div class="m-name">${escapeHtml(c.name || 'Sin nombre')}</div>
            <div class="field-hint">${escapeHtml(c.phone)}${c.address ? ' · ' + escapeHtml(c.address) : ''}${c.company ? ' · ' + escapeHtml(c.company) : ''}</div>
          </div>
          <button class="icon-btn" data-editcustomer="${c.id}" title="Editar">${icon('edit')}</button>
          <button class="icon-btn" data-deletecustomer="${c.id}" title="Borrar">${icon('trash')}</button>
        </div>`).join('')
        : `<div class="empty-state"><span class="emoji">${icon('users', 42)}</span>Aún no tienes clientes guardados.<br>Se guardan solos al vender, o agrégalos aquí.</div>`}
    </div>
  `);
}

// id === null crea un cliente nuevo; con id edita uno existente.
function openCustomerEditForm(id) {
  const c = id ? S.customers.find((x) => x.id === id) : null;
  if (id && !c) return;
  openModal(`
    <div class="modal-head">
      <h2>${icon('edit')} ${c ? 'Editar cliente' : 'Nuevo cliente'}</h2>
      <button class="modal-close" data-close>${icon('close', 16)}</button>
    </div>
    <div class="modal-body">
      <div class="field"><label>Nombre</label><input id="custName" placeholder="Ej. Juan Pérez" value="${escapeHtml(c ? c.name : '')}"></div>
      <div class="field"><label>Teléfono</label><input id="custPhone" inputmode="tel" placeholder="10 dígitos" value="${escapeHtml(c ? c.phone : '')}"></div>
      <div class="field"><label>Dirección</label><textarea id="custAddress" rows="2" placeholder="Calle, número, colonia, referencias">${escapeHtml(c ? c.address : '')}</textarea></div>
      <div class="field autocomplete-wrap">
        <label>Empresa (opcional)</label>
        <input id="custCompany" placeholder="Ej. Constructora ABC" value="${escapeHtml(c ? c.company || '' : '')}" autocomplete="off">
        <div class="autocomplete-list" id="companySuggestions" hidden></div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" data-close>Cancelar</button>
      <button class="btn btn-primary btn-block" id="saveCustomerEdit">Guardar</button>
    </div>
  `);
  modalEl.dataset.customerId = id || '';
}

function saveCustomerEdit() {
  const id = modalEl.dataset.customerId;
  const newPhone = customerKey($('#custPhone').value);
  if (!newPhone) { toast('Teléfono inválido'); return; }
  const dup = S.customers.find((x) => x.phone === newPhone && x.id !== id);
  if (dup) { toast('Ya existe un cliente con ese teléfono'); return; }

  const name = $('#custName').value.trim();
  const address = $('#custAddress').value.trim();
  const company = $('#custCompany').value.trim();

  let c = id ? S.customers.find((x) => x.id === id) : null;
  if (c) {
    c.name = name; c.phone = newPhone; c.address = address; c.company = company;
    c.updatedAt = Date.now();
  } else {
    c = { id: uid(), name, phone: newPhone, address, company, notes: '', createdAt: Date.now(), updatedAt: Date.now() };
    S.customers.push(c);
  }
  if (company) upsertCompany({ name: company, address });
  if (!saveCustomers()) return;
  toast(id ? 'Cliente actualizado' : 'Cliente agregado');
  openCustomersList();
}

/* ---------- Empresas guardadas ---------- */
function openCompaniesList() {
  const rows = S.companies.slice().sort((a, b) => b.updatedAt - a.updatedAt);
  openModal(`
    <div class="modal-head">
      <h2>${icon('building')} Empresas guardadas</h2>
      <button class="modal-close" data-close>${icon('close', 16)}</button>
    </div>
    <div class="modal-body">
      <p class="field-hint" style="margin-top:0">Varios clientes pueden compartir la dirección de una misma empresa.</p>
      <button class="btn btn-primary btn-block" id="addCompanyBtn" style="margin-bottom:14px">${icon('plus')} Agregar empresa</button>
      ${rows.length ? rows.map((co) => `
        <div class="menu-row">
          <div class="m-info">
            <div class="m-name">${escapeHtml(co.name)}</div>
            <div class="field-hint">${co.address ? escapeHtml(co.address) : 'Sin dirección'}${co.phone ? ' · ' + escapeHtml(co.phone) : ''}</div>
          </div>
          <button class="icon-btn" data-editcompany="${co.id}" title="Editar">${icon('edit')}</button>
          <button class="icon-btn" data-deletecompany="${co.id}" title="Borrar">${icon('trash')}</button>
        </div>`).join('')
        : `<div class="empty-state"><span class="emoji">${icon('building', 42)}</span>Aún no tienes empresas guardadas.</div>`}
    </div>
  `);
}

function openCompanyEditForm(id) {
  const co = id ? S.companies.find((x) => x.id === id) : null;
  if (id && !co) return;
  openModal(`
    <div class="modal-head">
      <h2>${icon('edit')} ${co ? 'Editar empresa' : 'Nueva empresa'}</h2>
      <button class="modal-close" data-close>${icon('close', 16)}</button>
    </div>
    <div class="modal-body">
      <div class="field"><label>Nombre de la empresa</label><input id="coName" placeholder="Ej. Constructora ABC" value="${escapeHtml(co ? co.name : '')}"></div>
      <div class="field"><label>Dirección</label><textarea id="coAddress" rows="2" placeholder="Calle, número, colonia, referencias">${escapeHtml(co ? co.address : '')}</textarea></div>
      <div class="field"><label>Teléfono (opcional)</label><input id="coPhone" inputmode="tel" value="${escapeHtml(co ? co.phone || '' : '')}"></div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" data-close>Cancelar</button>
      <button class="btn btn-primary btn-block" id="saveCompanyEdit">Guardar</button>
    </div>
  `);
  modalEl.dataset.companyId = id || '';
}

function saveCompanyEdit() {
  const id = modalEl.dataset.companyId;
  const name = $('#coName').value.trim();
  if (!name) { toast('Escribe el nombre de la empresa'); return; }
  const dup = S.companies.find((x) => companyKey(x.name) === companyKey(name) && x.id !== id);
  if (dup) { toast('Ya existe una empresa con ese nombre'); return; }

  const address = $('#coAddress').value.trim();
  const phone = customerKey($('#coPhone').value);

  let co = id ? S.companies.find((x) => x.id === id) : null;
  if (co) {
    co.name = name; co.address = address; co.phone = phone;
    co.updatedAt = Date.now();
  } else {
    co = { id: uid(), name, address, phone, createdAt: Date.now(), updatedAt: Date.now() };
    S.companies.push(co);
  }
  if (!saveCompanies()) return;
  toast(id ? 'Empresa actualizada' : 'Empresa agregada');
  openCompaniesList();
}

function renderSettings() {
  const s = S.settings;
  const activated = isActivated();
  const waLink = SELLER_WHATSAPP
    ? `https://wa.me/${SELLER_WHATSAPP}?text=${encodeURIComponent('Hola, quiero activar mi Punto de Venta')}`
    : '';
  const licenseSection = !LICENSE_ENFORCED ? '' : `
    <div class="license-box ${activated ? 'ok' : ''}">
      <div class="license-status">
        ${activated
          ? `${icon('checkCircle')} Licencia activada`
          : `${icon('tag')} Prueba gratis: ${trialRemaining()} de ${TRIAL_LIMIT} ventas restantes`}
      </div>
      ${activated ? '' : `
        <div class="field" style="margin-top:10px">
          <label>Código de activación</label>
          <input id="licenseInput" placeholder="XXXX-XXXX-XXXX" value="${escapeHtml(s.licenseCode || '')}" style="text-transform:uppercase">
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary" id="activateLicenseBtn">Activar</button>
          ${waLink ? `<a class="btn" style="text-decoration:none;display:flex;align-items:center;gap:8px" href="${waLink}" target="_blank">${icon('chat')} Comprar por WhatsApp</a>` : ''}
        </div>`}
    </div>`;
  $('#settingsForm').innerHTML = `
    <div class="quick-section">
      <h3 class="menu-cat-title">Clientes y empresas</h3>
      <div class="quick-buttons">
        <button class="btn" id="openCustomers">${icon('users')} Clientes (${S.customers.length})</button>
        <button class="btn" id="openCompanies">${icon('building')} Empresas (${S.companies.length})</button>
      </div>
    </div>
    ${licenseSection}
    <div class="field">
      <label>Logo del negocio (opcional)</label>
      <div class="img-picker">
        <div class="img-preview" id="logoPreview" style="${s.logo ? `background-image:url('${escapeHtml(s.logo)}')` : ''}">${s.logo ? '' : icon('utensils',24)}</div>
        <div class="img-actions">
          <button type="button" class="btn" id="pickLogo">${s.logo ? 'Cambiar' : 'Elegir logo'}</button>
          <button type="button" class="btn btn-ghost" id="removeLogo" ${s.logo ? '' : 'hidden'}>Quitar</button>
        </div>
      </div>
      <input type="file" id="logoFile" accept="image/*" hidden>
    </div>
    <div class="field"><label>Nombre del negocio</label><input id="setName" value="${escapeHtml(s.restaurantName)}"></div>
    <div class="field"><label>Teléfono</label><input id="setPhone" type="tel" value="${escapeHtml(s.phone)}"></div>
    <div class="field"><label>Dirección</label><input id="setAddress" value="${escapeHtml(s.address)}"></div>
    <div class="field"><label>Símbolo de moneda</label><input id="setCurrency" maxlength="3" value="${escapeHtml(s.currency)}" style="max-width:100px"></div>
    <div class="field"><label>Costo de envío por defecto</label><input id="setFee" type="text" inputmode="decimal" value="${s.defaultDeliveryFee}"><span class="field-hint">Se puede cambiar en cada pedido a domicilio.</span></div>
    <div class="field">
      <label>Color del negocio</label>
      <div class="color-presets">
        ${COLOR_PRESETS.map((c) => `<button type="button" class="swatch ${c.toLowerCase() === (s.primaryColor || '').toLowerCase() ? 'active' : ''}" data-color="${c}" style="background:${c}"></button>`).join('')}
        <label class="swatch swatch-custom" title="Color personalizado">
          ${icon('palette',16)}<input type="color" id="setColor" value="${escapeHtml(s.primaryColor || '#e11d48')}">
        </label>
      </div>
      <span class="field-hint">El cambio se aplica al instante.</span>
    </div>
    <button class="btn btn-primary" id="saveSettings">Guardar cambios</button>

    <button class="btn" id="restartOnboarding" style="margin-top:4px">${icon('rocket')} Ver guía de inicio otra vez</button>

    <div class="settings-danger">
      <h3 class="menu-cat-title">Datos</h3>
      <button class="btn" id="exportData">${icon('download')} Exportar respaldo (JSON)</button>
      <button class="btn" id="importData" style="margin-top:8px">${icon('upload')} Importar respaldo</button>
      <input type="file" id="importFile" accept="application/json" hidden>
      <button class="btn btn-danger" id="clearData" style="margin-top:8px">${icon('trash')} Borrar todas las ventas</button>
    </div>
    <p class="field-hint" style="text-align:center;margin-top:8px">Los datos se guardan solo en este dispositivo.</p>
  `;
}

function saveSettingsForm() {
  S.settings.restaurantName = $('#setName').value.trim() || 'Mi Restaurante';
  S.settings.phone = $('#setPhone').value.trim();
  S.settings.address = $('#setAddress').value.trim();
  S.settings.currency = $('#setCurrency').value.trim() || '$';
  S.settings.defaultDeliveryFee = parseNum($('#setFee').value);
  if ($('#setColor')) S.settings.primaryColor = $('#setColor').value;
  saveSettings();
  applyTheme();
  applyBranding();
  updateDayTotal();
  toast('Ajustes guardados');
}

function exportData() {
  const data = { settings: S.settings, products: S.products, orders: S.orders, exportedAt: Date.now() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `respaldo-pos-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Un respaldo es un archivo externo: no confiar en su contenido a ciegas.
// Solo se aceptan imágenes en formato data-URL y colores en formato hex;
// cualquier otra cosa se descarta en vez de guardarse tal cual.
const DATA_IMAGE_RE = /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
function sanitizeImportedData(data) {
  if (!Array.isArray(data.products) || !Array.isArray(data.orders)) {
    throw new Error('Formato inválido');
  }
  data.products.forEach((p) => {
    if (p && typeof p.image === 'string' && p.image && !DATA_IMAGE_RE.test(p.image)) p.image = '';
  });
  if (data.settings && typeof data.settings === 'object') {
    if (typeof data.settings.logo === 'string' && data.settings.logo && !DATA_IMAGE_RE.test(data.settings.logo)) {
      data.settings.logo = '';
    }
    if (data.settings.categoryColors && typeof data.settings.categoryColors === 'object') {
      Object.keys(data.settings.categoryColors).forEach((k) => {
        if (!HEX_COLOR_RE.test(data.settings.categoryColors[k])) delete data.settings.categoryColors[k];
      });
    }
  }
  return data;
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = sanitizeImportedData(JSON.parse(reader.result));
      confirmDialog('Esto reemplazará TODOS los datos actuales. ¿Continuar?', () => {
        S.settings = data.settings || S.settings;
        S.products = data.products;
        S.orders = data.orders;
        saveSettings(); saveProducts(); saveOrders();
        updateDayTotal();
        renderSettings();
        toast('Respaldo importado');
      }, { confirmLabel: 'Reemplazar todo', danger: true });
    } catch (e) { toast('Archivo no válido'); }
  };
  reader.readAsText(file);
}

/* ============================================================
   PANTALLA DE BIENVENIDA (configuración guiada)
   ============================================================ */
let obStep = 0;
let obData = null;

function maybeOnboard() {
  if (S.settings.onboarded) return false;
  obStep = 0;
  obData = { name: '', color: S.settings.primaryColor || '#e11d48', sample: true };
  renderOnboarding();
  return true;
}

function renderOnboarding() {
  const ob = $('#onboarding');
  ob.hidden = false;
  const dots = [0, 1, 2].map((i) => `<span class="ob-dot ${i === obStep ? 'on' : ''}"></span>`).join('');

  let body = '';
  if (obStep === 0) {
    body = `
      <div class="ob-emoji">${icon('utensils',46)}</div>
      <h1>¡Bienvenido!</h1>
      <p>Vamos a configurar tu punto de venta en 3 pasos rápidos.</p>
      <div class="field" style="text-align:left;margin-top:8px">
        <label>¿Cómo se llama tu negocio?</label>
        <input id="obName" placeholder="Ej. Tacos El Güero" value="${escapeHtml(obData.name)}" autocomplete="off">
      </div>
      <button class="btn btn-primary btn-block btn-lg" data-ob="next">Continuar →</button>
      <button class="btn btn-ghost btn-block" data-ob="skip">Saltar por ahora</button>`;
  } else if (obStep === 1) {
    body = `
      <div class="ob-emoji">${icon('palette',46)}</div>
      <h1>Elige tu color</h1>
      <p>Se usará en toda la app. Verás el cambio al instante.</p>
      <div class="color-presets" style="justify-content:center;margin:8px 0 4px">
        ${COLOR_PRESETS.map((c) => `<button type="button" class="swatch ${c.toLowerCase() === obData.color.toLowerCase() ? 'active' : ''}" data-obcolor="${c}" style="background:${c}"></button>`).join('')}
        <label class="swatch swatch-custom">${icon('palette',16)}<input type="color" id="obColor" value="${escapeHtml(obData.color)}"></label>
      </div>
      <button class="btn btn-primary btn-block btn-lg" data-ob="next">Continuar →</button>
      <button class="btn btn-ghost btn-block" data-ob="back">← Atrás</button>`;
  } else {
    body = `
      <div class="ob-emoji">${icon('utensils',46)}</div>
      <h1>Tu menú</h1>
      <p>¿Cómo quieres empezar?</p>
      <button type="button" class="ob-choice ${obData.sample ? 'active' : ''}" data-obsample="1">
        <strong>${icon('utensils',16)} Con menú de ejemplo</strong>
        <small>Trae productos de muestra que puedes editar o borrar. Ideal para aprender rápido.</small>
      </button>
      <button type="button" class="ob-choice ${obData.sample ? '' : 'active'}" data-obsample="0">
        <strong>${icon('edit',16)} Empezar vacío</strong>
        <small>Agrego mis propios productos desde cero.</small>
      </button>
      <button class="btn btn-primary btn-block btn-lg" data-ob="finish">¡Empezar a vender! ${icon('rocket',16)}</button>
      <button class="btn btn-ghost btn-block" data-ob="back">← Atrás</button>`;
  }

  ob.innerHTML = `<div class="ob-card"><div class="ob-progress">${dots}</div>${body}</div>`;
  if (obStep === 0) setTimeout(() => { const el = $('#obName'); if (el) el.focus(); }, 60);
}

function captureObName() {
  const el = $('#obName');
  if (el) obData.name = el.value;
}

function finishOnboarding(skip) {
  if (!skip) {
    if (obData.name.trim()) S.settings.restaurantName = obData.name.trim();
    S.settings.primaryColor = obData.color;
    if (!obData.sample && S.orders.length === 0) { S.products = []; saveProducts(); }
  }
  S.settings.onboarded = true;
  saveSettings();
  applyTheme();
  applyBranding();
  $('#onboarding').hidden = true;
  switchView('vender');
  if (!skip) toast('¡Listo! Ya puedes vender');
}

/* ============================================================
   NAVEGACIÓN ENTRE VISTAS
   ============================================================ */
function switchView(view) {
  S.view = view;
  $$('.view').forEach((v) => { v.hidden = v.id !== 'view-' + view; });
  $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  if (view === 'vender') renderPOS();
  if (view === 'pedidos') renderPedidos();
  if (view === 'historial') renderHistorial();
  if (view === 'menu') renderMenu();
  if (view === 'ajustes') renderSettings();
}

/* ============================================================
   EVENTOS (delegación desde el documento)
   ============================================================ */
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-view],[data-add],[data-cat],[data-close],[data-qty],[data-removeitem],[data-itemnote],[data-order],[data-toggle],[data-edit],[data-delete],[data-type],[data-pay],[data-disctype],[data-clearcart],[data-closesheet],[data-color],[data-period],[data-advance],[data-revert],[data-wapp],[data-ob],[data-obcolor],[data-obsample],[data-editcustomer],[data-deletecustomer],[data-editcatcolor],[data-catcolor],[data-editcompany],[data-deletecompany],[data-pickcustomer],[data-pickcompany],[data-openentity]');

  // Navegación
  const nav = e.target.closest('.nav-btn');
  if (nav) { switchView(nav.dataset.view); return; }

  if (!t) return;

  // Cerrar modal
  if (t.hasAttribute('data-close')) {
    if ($('#checkoutTotals')) captureCheckoutInputs();
    closeModal();
    if (S.view === 'vender') renderPOS();
    return;
  }

  // POS: categoría
  if (t.dataset.cat) { S.activeCat = t.dataset.cat; renderPOS(); return; }

  // POS: agregar producto
  if (t.dataset.add) { addToCart(t.dataset.add); return; }

  // Pedido: cambiar cantidad
  if (t.dataset.qty) { changeQty(t.dataset.qty, Number(t.dataset.delta)); return; }

  // Pedido: quitar producto directamente / agregar-editar especificación
  if (t.dataset.removeitem) { S.cart = S.cart.filter((i) => i.productId !== t.dataset.removeitem); renderPOS(); return; }
  if (t.dataset.itemnote) { openItemNoteForm(t.dataset.itemnote); return; }

  // Pedido: tipo (domicilio / para llevar)
  if (t.dataset.type) {
    checkout.type = t.dataset.type;
    checkout.deliveryFee = t.dataset.type === 'domicilio' ? Number(S.settings.defaultDeliveryFee || 0) : 0;
    renderPOS();
    return;
  }

  // Pedido: vaciar / cerrar hoja
  if (t.hasAttribute('data-clearcart')) { S.cart = []; renderPOS(); return; }
  if (t.hasAttribute('data-closesheet')) { closeSheet(); return; }

  // Cobro: forma de pago
  if (t.dataset.pay) { captureCheckoutInputs(); checkout.payment = t.dataset.pay; openCheckout(); return; }

  // Cobro: tipo de descuento (% o monto fijo)
  if (t.dataset.disctype) { captureCheckoutInputs(); checkout.discountType = t.dataset.disctype; openCheckout(); return; }

  // Ajustes: elegir color de un preset
  if (t.dataset.color) {
    S.settings.primaryColor = t.dataset.color;
    applyTheme(); saveSettings(); renderSettings();
    return;
  }

  // Historial: filtro de periodo
  if (t.dataset.period) { S.histPeriod = t.dataset.period; renderHistorial(); return; }

  // Pedidos: avanzar estado de entrega
  if (t.dataset.advance) {
    const openId = !modalBackdrop.hidden ? modalEl.dataset.orderId : null;
    advanceStatus(t.dataset.advance);
    if (openId) { closeModal(); if (S.view === 'historial') renderHistorial(); if (S.view === 'pedidos') renderPedidos(); }
    return;
  }

  if (t.dataset.revert) {
    const openId = !modalBackdrop.hidden ? modalEl.dataset.orderId : null;
    revertStatus(t.dataset.revert);
    if (openId) { closeModal(); if (S.view === 'historial') renderHistorial(); if (S.view === 'pedidos') renderPedidos(); }
    return;
  }

  // Pedidos: WhatsApp al cliente
  if (t.dataset.wapp) { const o = S.orders.find((x) => x.id === t.dataset.wapp); if (o) whatsappStatusUpdate(o); return; }

  // Bienvenida: elegir color
  if (t.dataset.obcolor) { obData.color = t.dataset.obcolor; applyColorValue(obData.color); renderOnboarding(); return; }
  // Bienvenida: elegir tipo de menú
  if (t.dataset.obsample !== undefined) { obData.sample = t.dataset.obsample === '1'; renderOnboarding(); return; }
  // Bienvenida: pasos
  if (t.dataset.ob) {
    const action = t.dataset.ob;
    if (action === 'next') { if (obStep === 0) captureObName(); obStep++; renderOnboarding(); }
    else if (action === 'back') { obStep--; renderOnboarding(); }
    else if (action === 'skip') { finishOnboarding(true); }
    else if (action === 'finish') { finishOnboarding(false); }
    return;
  }

  // Historial: abrir detalle
  if (t.dataset.order) { openOrderDetail(t.dataset.order); return; }

  // Menú: acciones
  if (t.dataset.toggle) { const p = S.products.find((x) => x.id === t.dataset.toggle); p.active = !p.active; saveProducts(); renderMenu(); return; }
  if (t.dataset.edit) { openProductForm(t.dataset.edit); return; }

  // Clientes: editar / borrar
  if (t.dataset.editcustomer) { openCustomerEditForm(t.dataset.editcustomer); return; }
  if (t.dataset.deletecustomer) {
    const cid = t.dataset.deletecustomer;
    confirmDialog('¿Borrar este cliente guardado?', () => {
      S.customers = S.customers.filter((x) => x.id !== cid);
      saveCustomers();
      openCustomersList();
    }, { confirmLabel: 'Borrar', danger: true });
    return;
  }

  // Categorías: cambiar color
  if (t.dataset.editcatcolor) { openCategoryColorPicker(t.dataset.editcatcolor); return; }
  if (t.dataset.catcolor) { setCategoryColor(modalEl.dataset.editingCat, t.dataset.catcolor); return; }

  // Empresas: editar / borrar
  if (t.dataset.editcompany) { openCompanyEditForm(t.dataset.editcompany); return; }
  if (t.dataset.deletecompany) {
    const coid = t.dataset.deletecompany;
    confirmDialog('¿Borrar esta empresa guardada?', () => {
      S.companies = S.companies.filter((x) => x.id !== coid);
      saveCompanies();
      openCompaniesList();
    }, { confirmLabel: 'Borrar', danger: true });
    return;
  }

  // Autocompletado: elegir un cliente/empresa de la lista de sugerencias
  if (t.dataset.pickcustomer) {
    const c = S.customers.find((x) => x.id === t.dataset.pickcustomer);
    if (c) pickCustomerSuggestion(c);
    return;
  }
  if (t.dataset.pickcompany) {
    const co = S.companies.find((x) => x.id === t.dataset.pickcompany);
    if (co) pickCompanySuggestion(co);
    return;
  }
  // Acceso directo a Clientes/Empresas desde el formulario de cobro
  if (t.dataset.openentity === 'customers') { openCustomersList(); return; }
  if (t.dataset.openentity === 'companies') { openCompaniesList(); return; }

  if (t.dataset.delete) {
    const pid = t.dataset.delete;
    confirmDialog('¿Borrar este producto? (No afecta ventas ya registradas)', () => {
      S.products = S.products.filter((x) => x.id !== pid); saveProducts(); renderMenu();
    }, { confirmLabel: 'Borrar', danger: true });
    return;
  }
});

// Botones con id fijo (dentro de modales o vistas)
document.addEventListener('click', (e) => {
  const id = e.target.id || (e.target.closest('button') || {}).id;
  const order = () => S.orders.find((o) => o.id === modalEl.dataset.orderId);
  switch (id) {
    case 'cartFab': openSheet(); break;
    case 'toCheckout': closeSheet(); openCheckout(); break;
    case 'backToCart': captureCheckoutInputs(); closeModal(); renderPOS(); break;
    case 'confirmSale': confirmSale(); break;
    case 'printTicket': printTicket(order()); break;
    case 'waTicket': whatsappTicket(order()); break;
    case 'deleteOrder': {
      const orderId = modalEl.dataset.orderId;
      confirmDialog('¿Borrar esta venta del historial?', () => {
        S.orders = S.orders.filter((o) => o.id !== orderId);
        saveOrders(); updateDayTotal(); updateActiveBadge();
        if (S.view === 'pedidos') renderPedidos(); else renderHistorial();
      }, { confirmLabel: 'Borrar', danger: true });
      break;
    }
    case 'pickLogo': $('#logoFile').click(); break;
    case 'removeLogo': S.settings.logo = ''; saveSettings(); applyBranding(); renderSettings(); break;
    case 'openCustomers': openCustomersList(); break;
    case 'addCustomerBtn': openCustomerEditForm(null); break;
    case 'saveCustomerEdit': saveCustomerEdit(); break;
    case 'openCompanies': openCompaniesList(); break;
    case 'addCompanyBtn': openCompanyEditForm(null); break;
    case 'saveCompanyEdit': saveCompanyEdit(); break;
    case 'restartOnboarding':
      obStep = 0;
      obData = { name: S.settings.restaurantName === 'Mi Restaurante' ? '' : S.settings.restaurantName, color: S.settings.primaryColor || '#e11d48', sample: S.products.length > 0 };
      renderOnboarding();
      break;
    case 'addProductBtn': openProductForm(null); break;
    case 'pickImg': $('#pImgFile').click(); break;
    case 'removeImg': {
      productImage = '';
      const prev = $('#imgPreview'); if (prev) { prev.style.backgroundImage = ''; prev.innerHTML = icon('image', 24); }
      e.target.hidden = true;
      const pick = $('#pickImg'); if (pick) pick.textContent = 'Elegir imagen';
      break;
    }
    case 'saveProduct': saveProduct(); break;
    case 'saveSettings': saveSettingsForm(); break;
    case 'saveItemNote': saveItemNote(); break;
    case 'activateLicenseBtn': activateLicense(); break;
    case 'confirmDialogBtn': {
      const cb = pendingConfirmCallback;
      pendingConfirmCallback = null;
      closeModal();
      if (cb) cb();
      break;
    }
    case 'exportData': exportData(); break;
    case 'importData': $('#importFile').click(); break;
    case 'clearData':
      confirmDialog('¿Borrar TODAS las ventas? Esto no se puede deshacer.', () => {
        S.orders = []; saveOrders(); updateDayTotal(); updateActiveBadge(); toast('Ventas borradas');
      }, { confirmLabel: 'Borrar todo', danger: true });
      break;
  }
});

// Cerrar la hoja del pedido al tocar el fondo oscuro
$('#sheetBackdrop').addEventListener('click', closeSheet);

// Buscador de productos + color personalizado en vivo
document.addEventListener('input', (e) => {
  if (e.target.id === 'productSearch') { S.search = e.target.value; renderPOS(); }
  if (e.target.id === 'setColor') {
    S.settings.primaryColor = e.target.value;
    applyTheme(); saveSettings();
    $$('.swatch[data-color]').forEach((b) => b.classList.remove('active'));
  }
  if (e.target.id === 'obColor' && obData) {
    obData.color = e.target.value;
    applyColorValue(obData.color);
    $$('.swatch[data-obcolor]').forEach((b) => b.classList.remove('active'));
  }
  if (e.target.id === 'logoFile') {
    const f = e.target.files && e.target.files[0];
    if (f) resizeImage(f, 240, (d) => { S.settings.logo = d; if (saveSettings() !== false) { applyBranding(); renderSettings(); toast('Logo actualizado'); } });
  }
});

// Guardar lo que se escribe en el cobro (para recalcular cambio en vivo)
document.addEventListener('input', (e) => {
  if (e.target.id === 'cCash' || e.target.id === 'cFee' || e.target.id === 'cDiscount') {
    captureCheckoutInputs();
    updateCheckoutTotals();
  }
  if (e.target.id === 'cPhone' || e.target.id === 'setPhone' || e.target.id === 'custPhone') {
    filterDigitsInput(e.target);
  }
  if (e.target.id === 'cPhone') renderPhoneSuggestions(e.target.value);
  if (e.target.id === 'cCompany' || e.target.id === 'custCompany') renderCompanySuggestions(e.target.value);
  if (e.target.id === 'importFile') {
    if (e.target.files && e.target.files[0]) importData(e.target.files[0]);
  }
});

/* ============================================================
   INICIO
   ============================================================ */
applyTheme();
applyBranding();
updateDayTotal();
updateActiveBadge();
switchView('vender');
maybeOnboard();

// Registrar service worker (para que funcione sin internet, si está en un servidor)
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
