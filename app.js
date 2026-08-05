/* ============================================================
   Punto de Venta - Lógica de la aplicación
   Sin dependencias. Los datos se guardan en este dispositivo
   (localStorage), por lo que funciona sin internet.
   ============================================================ */

/* ---------- Utilidades ---------- */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const money = (n) => {
  const s = S.settings.currency || '$';
  return s + (Math.round(n * 100) / 100).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};
const escapeHtml = (str = '') => String(str).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const dayKey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
const fmtDate = (ts) => new Date(ts).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtTime = (ts) => new Date(ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

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
  categories: ['Platillos', 'Entradas', 'Bebidas', 'Postres'],
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
  cart: [],            // [{ productId, name, price, qty }]
  activeCat: 'Todos',
  search: '',
  histPeriod: 'hoy',
  view: 'vender',
};
// Guardar los datos de ejemplo si es la primera vez
if (!DB.get('mv_settings', null)) DB.set('mv_settings', S.settings);
if (!DB.get('mv_products', null)) DB.set('mv_products', S.products);

function saveProducts() {
  try { DB.set('mv_products', S.products); return true; }
  catch (e) { toast('⚠️ Almacenamiento lleno. Usa imágenes más pequeñas o quita algunas.'); return false; }
}
const saveOrders = () => DB.set('mv_orders', S.orders);
const saveSettings = () => DB.set('mv_settings', S.settings);

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
function applyTheme() {
  const primary = S.settings.primaryColor || '#e11d48';
  const root = document.documentElement.style;
  root.setProperty('--primary', primary);
  root.setProperty('--primary-dark', mix(primary, { r: 0, g: 0, b: 0 }, 0.20));
  root.setProperty('--primary-soft', mix(primary, { r: 255, g: 255, b: 255 }, 0.87));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = primary;
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
}
modalBackdrop.addEventListener('click', (e) => { if (e.target === modalBackdrop) closeModal(); });

/* ============================================================
   VISTA: VENDER (Punto de venta)
   ============================================================ */
const CAT_COLORS = ['#e11d48', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];
function catColor(cat) {
  const i = S.settings.categories.indexOf(cat);
  return CAT_COLORS[(i < 0 ? 0 : i) % CAT_COLORS.length];
}

let checkout = { type: 'domicilio', payment: 'efectivo', deliveryFee: 0, cash: '' };

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
      <span class="emoji">🍽️</span>
      No tienes productos todavía.<br>Ve a <strong>Menú</strong> para agregarlos.
    </div>`;
  } else if (list.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <span class="emoji">🔍</span>No se encontraron productos.</div>`;
  } else {
    grid.innerHTML = list.map((p) => {
      const line = S.cart.find((i) => i.productId === p.id);
      const qty = line ? line.qty : 0;
      return `<button class="product-card ${qty ? 'in-cart' : ''} ${p.image ? 'has-img' : ''}" data-add="${p.id}" style="--cat-color:${catColor(p.category)}">
        ${qty ? `<span class="qty-badge">${qty}</span>` : ''}
        ${p.image ? `<div class="p-img" style="background-image:url('${p.image}')"></div>` : ''}
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
  const total = cartSubtotal() + (checkout.type === 'domicilio' ? Number(checkout.deliveryFee || 0) : 0);
  $('#cartFabTotal').textContent = money(total);
}

function cartSubtotal() { return S.cart.reduce((s, i) => s + i.price * i.qty, 0); }

function addToCart(productId) {
  const p = S.products.find((x) => x.id === productId);
  if (!p) return;
  const line = S.cart.find((i) => i.productId === productId);
  if (line) line.qty++;
  else {
    if (S.cart.length === 0) checkout.deliveryFee = checkout.type === 'domicilio' ? Number(S.settings.defaultDeliveryFee || 0) : 0;
    S.cart.push({ productId, name: p.name, price: p.price, qty: 1 });
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
  const subtotal = cartSubtotal();
  const fee = checkout.type === 'domicilio' ? Number(checkout.deliveryFee || 0) : 0;
  const total = subtotal + fee;

  const items = S.cart.map((i) => `
    <div class="cart-item">
      <div class="ci-info">
        <div class="ci-name">${escapeHtml(i.name)}</div>
        <div class="ci-price">${money(i.price)} c/u</div>
      </div>
      <div class="qty-ctrl">
        <button class="qty-btn" data-qty="${i.productId}" data-delta="-1">−</button>
        <span class="qty-num">${i.qty}</span>
        <button class="qty-btn" data-qty="${i.productId}" data-delta="1">+</button>
      </div>
      <div class="ci-total">${money(i.price * i.qty)}</div>
    </div>`).join('');

  panel.innerHTML = `
    <div class="op-head">
      <h2>🧾 Pedido</h2>
      <div style="display:flex;gap:8px;align-items:center">
        ${S.cart.length ? `<button class="op-clear" data-clearcart>Vaciar</button>` : ''}
        <button class="op-close" data-closesheet>✕</button>
      </div>
    </div>
    <div class="op-type">
      <div class="seg">
        <button data-type="domicilio" class="${checkout.type === 'domicilio' ? 'active' : ''}">🛵 Domicilio</button>
        <button data-type="llevar" class="${checkout.type === 'llevar' ? 'active' : ''}">🥡 Para llevar</button>
      </div>
    </div>
    <div class="op-items">
      ${S.cart.length ? items : `<div class="op-empty"><span class="emoji">🛒</span>Toca un producto<br>para agregarlo al pedido</div>`}
    </div>
    <div class="op-foot">
      <div class="totals">
        <div class="total-line"><span class="muted">Subtotal</span><span>${money(subtotal)}</span></div>
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
  const subtotal = cartSubtotal();
  const total = subtotal + (checkout.type === 'domicilio' ? checkout.deliveryFee : 0);
  const cashNum = parseFloat(checkout.cash) || 0;
  const change = cashNum - total;

  const customerFields = checkout.type === 'domicilio' ? `
    <div class="field"><label>Nombre del cliente</label><input id="cName" placeholder="Ej. Juan Pérez" value="${escapeHtml(checkout.cName || '')}"></div>
    <div class="field"><label>Teléfono</label><input id="cPhone" type="tel" inputmode="tel" placeholder="10 dígitos" value="${escapeHtml(checkout.cPhone || '')}"></div>
    <div class="field"><label>Dirección de entrega</label><textarea id="cAddress" rows="2" placeholder="Calle, número, colonia, referencias">${escapeHtml(checkout.cAddress || '')}</textarea></div>
    <div class="field"><label>Costo de envío</label><input id="cFee" type="number" inputmode="decimal" min="0" value="${checkout.deliveryFee}"></div>
    <div class="field"><label>Notas del pedido (opcional)</label><input id="cNotes" placeholder="Ej. sin cebolla" value="${escapeHtml(checkout.cNotes || '')}"></div>
  ` : `
    <div class="field"><label>Nombre (opcional)</label><input id="cName" placeholder="Para identificar el pedido" value="${escapeHtml(checkout.cName || '')}"></div>
    <div class="field"><label>Notas (opcional)</label><input id="cNotes" placeholder="Ej. sin picante" value="${escapeHtml(checkout.cNotes || '')}"></div>
  `;

  const cashSection = checkout.payment === 'efectivo' ? `
    <div class="field"><label>¿Con cuánto paga?</label><input id="cCash" type="number" inputmode="decimal" min="0" placeholder="0" value="${escapeHtml(checkout.cash)}"></div>
    ${cashNum > 0 ? `<div class="change-box ${change < 0 ? 'neg' : ''}">${change < 0 ? 'Faltan ' + money(-change) : 'Cambio: ' + money(change)}</div>` : ''}
  ` : '';

  openModal(`
    <div class="modal-head">
      <h2>Cobrar ${money(total)}</h2>
      <button class="modal-close" data-close>✕</button>
    </div>
    <div class="modal-body">
      ${customerFields}
      <div class="field" style="margin-top:6px">
        <label>Forma de pago</label>
        <div class="seg" id="paySeg">
          <button data-pay="efectivo" class="${checkout.payment === 'efectivo' ? 'active' : ''}">💵 Efectivo</button>
          <button data-pay="transferencia" class="${checkout.payment === 'transferencia' ? 'active' : ''}">💳 Transf./Tarjeta</button>
        </div>
      </div>
      ${cashSection}
      <div class="totals">
        <div class="total-line"><span class="muted">Subtotal</span><span>${money(subtotal)}</span></div>
        ${checkout.type === 'domicilio' ? `<div class="total-line"><span class="muted">Envío</span><span>${money(checkout.deliveryFee)}</span></div>` : ''}
        <div class="total-line grand"><span>Total</span><span>${money(total)}</span></div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" id="backToCart">Atrás</button>
      <button class="btn btn-success btn-block" id="confirmSale">Confirmar venta</button>
    </div>
  `);
}

// Guarda los valores que el usuario escribió en el cobro (para no perderlos al re-dibujar)
function captureCheckoutInputs() {
  const g = (id) => $('#' + id) ? $('#' + id).value : undefined;
  if (g('cName') !== undefined) checkout.cName = g('cName');
  if (g('cPhone') !== undefined) checkout.cPhone = g('cPhone');
  if (g('cAddress') !== undefined) checkout.cAddress = g('cAddress');
  if (g('cNotes') !== undefined) checkout.cNotes = g('cNotes');
  if (g('cFee') !== undefined) checkout.deliveryFee = Number(g('cFee')) || 0;
  if (g('cCash') !== undefined) checkout.cash = g('cCash');
}

function confirmSale() {
  captureCheckoutInputs();
  const subtotal = cartSubtotal();
  const deliveryFee = checkout.type === 'domicilio' ? Number(checkout.deliveryFee || 0) : 0;
  const total = subtotal + deliveryFee;
  const cashNum = parseFloat(checkout.cash) || 0;

  if (checkout.payment === 'efectivo' && cashNum > 0 && cashNum < total) {
    if (!confirm('El monto recibido es menor al total. ¿Guardar de todos modos?')) return;
  }

  const order = {
    id: uid(),
    folio: (S.orders.length + 1),
    date: Date.now(),
    items: S.cart.map((i) => ({ name: i.name, price: i.price, qty: i.qty })),
    type: checkout.type,
    customer: {
      name: checkout.cName || '',
      phone: checkout.cPhone || '',
      address: checkout.cAddress || '',
      notes: checkout.cNotes || '',
    },
    subtotal,
    deliveryFee,
    total,
    payment: checkout.payment,
    cashReceived: checkout.payment === 'efectivo' ? cashNum : null,
    change: checkout.payment === 'efectivo' && cashNum > 0 ? cashNum - total : null,
  };

  S.orders.unshift(order);
  saveOrders();

  // Limpiar carrito y datos de cobro
  S.cart = [];
  checkout = { type: 'domicilio', payment: 'efectivo', deliveryFee: 0, cash: '' };

  updateDayTotal();
  closeSheet();
  renderPOS();
  showTicket(order);
}

/* ---------- Ticket ---------- */
function ticketHtml(o) {
  const lines = o.items.map((i) =>
    `<div class="t-row"><span>${i.qty}x ${escapeHtml(i.name)}</span><span>${money(i.price * i.qty)}</span></div>`
  ).join('');
  const cust = o.type === 'domicilio' && (o.customer.name || o.customer.address) ? `
    <hr>
    <div>Cliente: ${escapeHtml(o.customer.name || '-')}</div>
    ${o.customer.phone ? `<div>Tel: ${escapeHtml(o.customer.phone)}</div>` : ''}
    ${o.customer.address ? `<div>Dir: ${escapeHtml(o.customer.address)}</div>` : ''}
  ` : '';
  const notes = o.customer.notes ? `<div>Notas: ${escapeHtml(o.customer.notes)}</div>` : '';
  const payLabel = o.payment === 'efectivo' ? 'Efectivo' : 'Transferencia/Tarjeta';
  const cashLines = o.payment === 'efectivo' && o.cashReceived ? `
    <div class="t-row"><span>Recibido</span><span>${money(o.cashReceived)}</span></div>
    <div class="t-row"><span>Cambio</span><span>${money(o.change || 0)}</span></div>
  ` : '';

  return `<div class="ticket">
    <div class="t-center t-big">${escapeHtml(S.settings.restaurantName || 'Restaurante')}</div>
    ${S.settings.phone ? `<div class="t-center">Tel: ${escapeHtml(S.settings.phone)}</div>` : ''}
    ${S.settings.address ? `<div class="t-center">${escapeHtml(S.settings.address)}</div>` : ''}
    <hr>
    <div class="t-row"><span>Folio #${o.folio}</span><span>${o.type === 'domicilio' ? 'DOMICILIO' : 'PARA LLEVAR'}</span></div>
    <div>${fmtDate(o.date)} ${fmtTime(o.date)}</div>
    <hr>
    ${lines}
    <hr>
    <div class="t-row"><span>Subtotal</span><span>${money(o.subtotal)}</span></div>
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
      <h2>✅ Venta guardada</h2>
      <button class="modal-close" data-close>✕</button>
    </div>
    <div class="modal-body">${ticketHtml(o)}</div>
    <div class="modal-foot" style="flex-wrap:wrap">
      <button class="btn" id="printTicket">🖨️ Imprimir</button>
      <button class="btn" id="waTicket">📱 WhatsApp</button>
      <button class="btn btn-primary btn-block" data-close style="flex:1 1 100%">Nueva venta</button>
    </div>
  `);
  modalEl.dataset.orderId = o.id;
}

function printTicket(o) {
  let area = $('#printArea');
  if (!area) { area = document.createElement('div'); area.id = 'printArea'; document.body.appendChild(area); }
  area.innerHTML = ticketHtml(o);
  window.print();
}

function whatsappTicket(o) {
  const L = [];
  L.push(`*${S.settings.restaurantName || 'Restaurante'}*`);
  L.push(`Folio #${o.folio} — ${o.type === 'domicilio' ? 'Domicilio' : 'Para llevar'}`);
  L.push('');
  o.items.forEach((i) => L.push(`${i.qty}x ${i.name} — ${money(i.price * i.qty)}`));
  L.push('');
  L.push(`Subtotal: ${money(o.subtotal)}`);
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
  { id: 'todo', label: 'Todo' },
];
function periodStart(period) {
  if (period === 'hoy') return startOfToday();
  if (period === 'semana') return startOfToday() - 6 * 864e5;   // últimos 7 días
  if (period === 'mes') return startOfToday() - 29 * 864e5;     // últimos 30 días
  return 0;                                                     // todo
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

  // Selector de periodo + tarjetas de resumen
  $('#histSummary').innerHTML = `
    <div class="seg period-seg">
      ${PERIODS.map((p) => `<button data-period="${p.id}" class="${p.id === period ? 'active' : ''}">${p.label}</button>`).join('')}
    </div>
    <div class="stat-grid">
      <div class="stat-card"><div class="s-label">Ventas</div><div class="s-value">${money(total)}</div></div>
      <div class="stat-card"><div class="s-label">Pedidos</div><div class="s-value">${orders.length}</div></div>
      <div class="stat-card"><div class="s-label">Ticket prom.</div><div class="s-value">${money(avg)}</div></div>
      <div class="stat-card"><div class="s-label">💵 Efectivo</div><div class="s-value">${money(cash)}</div></div>
      <div class="stat-card"><div class="s-label">💳 Transf./Tarjeta</div><div class="s-value">${money(transfer)}</div></div>
      <div class="stat-card"><div class="s-label">🛵 A domicilio</div><div class="s-value">${nDom}</div></div>
    </div>
  `;

  // Gráfica de ventas por día (cuando el periodo abarca varios días)
  let salesChart = '';
  if (period !== 'hoy' && orders.length) {
    const days = [];
    const from = period === 'todo' ? (orders.reduce((m, o) => Math.min(m, o.date), Date.now())) : start;
    for (let d = startOfToday(); d >= from; d -= 864e5) days.unshift(d);
    const perDay = days.map((d) => ({
      d,
      total: orders.filter((o) => dayKey(o.date) === dayKey(d)).reduce((s, o) => s + o.total, 0),
    }));
    const maxDay = Math.max(1, ...perDay.map((x) => x.total));
    salesChart = `
      <div class="chart-card">
        <h3>📈 Ventas por día</h3>
        <div class="bar-chart">
          ${perDay.map((x) => `
            <div class="bar-row">
              <span>${new Date(x.d).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric' })}</span>
              <div class="bar-track"><div class="bar-fill" style="width:${(x.total / maxDay) * 100}%"></div></div>
              <strong>${money(x.total)}</strong>
            </div>`).join('')}
        </div>
      </div>`;
  }

  // Gráfica: productos más vendidos en el periodo
  const counts = {};
  orders.forEach((o) => o.items.forEach((i) => { counts[i.name] = (counts[i.name] || 0) + i.qty; }));
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxCount = top.length ? top[0][1] : 1;
  const topChart = top.length ? `
    <div class="chart-card">
      <h3>🏆 Más vendidos</h3>
      <div class="bar-chart">
        ${top.map(([name, c]) => `
          <div class="bar-row">
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(name)}</span>
            <div class="bar-track"><div class="bar-fill" style="width:${(c / maxCount) * 100}%"></div></div>
            <strong>${c}</strong>
          </div>`).join('')}
      </div>
    </div>` : '';

  // Lista de pedidos del periodo, agrupada por día
  let listHtml = '';
  if (orders.length === 0) {
    listHtml = `<div class="empty-state"><span class="emoji">📊</span>No hay ventas en este periodo.</div>`;
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
            </div>
            <div class="o-meta">${fmtTime(o.date)} · ${o.items.reduce((s, i) => s + i.qty, 0)} art.${o.customer.name ? ' · ' + escapeHtml(o.customer.name) : ''}</div>
          </div>
          <div class="o-total">${money(o.total)}</div>
        </div>`;
    });
  }
  $('#histList').innerHTML = salesChart + topChart + listHtml;
}

function openOrderDetail(id) {
  const o = S.orders.find((x) => x.id === id);
  if (!o) return;
  openModal(`
    <div class="modal-head">
      <h2>Pedido #${o.folio}</h2>
      <button class="modal-close" data-close>✕</button>
    </div>
    <div class="modal-body">${ticketHtml(o)}</div>
    <div class="modal-foot" style="flex-wrap:wrap">
      <button class="btn" id="printTicket">🖨️ Imprimir</button>
      <button class="btn" id="waTicket">📱 WhatsApp</button>
      <button class="btn btn-danger" id="deleteOrder">🗑️ Borrar</button>
    </div>
  `);
  modalEl.dataset.orderId = o.id;
}

/* ============================================================
   VISTA: MENÚ (administrar productos)
   ============================================================ */
function renderMenu() {
  const wrap = $('#menuAdmin');
  if (S.products.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><span class="emoji">🍔</span>No hay productos. Agrega el primero.</div>`;
    return;
  }
  const cats = [...new Set(S.products.map((p) => p.category))];
  wrap.innerHTML = cats.map((cat) => `
    <div>
      <h3 class="menu-cat-title">${escapeHtml(cat)}</h3>
      ${S.products.filter((p) => p.category === cat).map((p) => `
        <div class="menu-row">
          <div class="m-thumb" style="${p.image ? `background-image:url('${p.image}')` : ''}">${p.image ? '' : '🍽️'}</div>
          <div class="m-info">
            <div class="m-name ${p.active ? '' : 'off'}">${escapeHtml(p.name)}</div>
            <div class="m-price">${money(p.price)}</div>
          </div>
          <button class="icon-btn" data-toggle="${p.id}" title="${p.active ? 'Ocultar' : 'Mostrar'}">${p.active ? '👁️' : '🚫'}</button>
          <button class="icon-btn" data-edit="${p.id}" title="Editar">✏️</button>
          <button class="icon-btn" data-delete="${p.id}" title="Borrar">🗑️</button>
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
      <button class="modal-close" data-close>✕</button>
    </div>
    <div class="modal-body">
      <div class="field">
        <label>Imagen (opcional)</label>
        <div class="img-picker">
          <div class="img-preview" id="imgPreview" style="${productImage ? `background-image:url('${productImage}')` : ''}">${productImage ? '' : '📷'}</div>
          <div class="img-actions">
            <button type="button" class="btn" id="pickImg">${productImage ? 'Cambiar' : 'Elegir imagen'}</button>
            <button type="button" class="btn btn-ghost" id="removeImg" ${productImage ? '' : 'hidden'}>Quitar</button>
          </div>
        </div>
        <input type="file" id="pImgFile" accept="image/*" hidden>
      </div>
      <div class="field"><label>Nombre</label><input id="pName" placeholder="Ej. Hamburguesa" value="${p ? escapeHtml(p.name) : ''}"></div>
      <div class="field"><label>Precio</label><input id="pPrice" type="number" inputmode="decimal" min="0" placeholder="0" value="${p ? p.price : ''}"></div>
      <div class="field"><label>Categoría</label>
        <select id="pCat">${catOptions}<option value="__new__">➕ Nueva categoría…</option></select>
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
  const price = parseFloat($('#pPrice').value);
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
function renderSettings() {
  const s = S.settings;
  $('#settingsForm').innerHTML = `
    <div class="field"><label>Nombre del negocio</label><input id="setName" value="${escapeHtml(s.restaurantName)}"></div>
    <div class="field"><label>Teléfono</label><input id="setPhone" type="tel" value="${escapeHtml(s.phone)}"></div>
    <div class="field"><label>Dirección</label><input id="setAddress" value="${escapeHtml(s.address)}"></div>
    <div class="field"><label>Símbolo de moneda</label><input id="setCurrency" maxlength="3" value="${escapeHtml(s.currency)}" style="max-width:100px"></div>
    <div class="field"><label>Costo de envío por defecto</label><input id="setFee" type="number" inputmode="decimal" min="0" value="${s.defaultDeliveryFee}"><span class="field-hint">Se puede cambiar en cada pedido a domicilio.</span></div>
    <div class="field">
      <label>Color del negocio</label>
      <div class="color-presets">
        ${COLOR_PRESETS.map((c) => `<button type="button" class="swatch ${c.toLowerCase() === (s.primaryColor || '').toLowerCase() ? 'active' : ''}" data-color="${c}" style="background:${c}"></button>`).join('')}
        <label class="swatch swatch-custom" title="Color personalizado">
          🎨<input type="color" id="setColor" value="${escapeHtml(s.primaryColor || '#e11d48')}">
        </label>
      </div>
      <span class="field-hint">El cambio se aplica al instante.</span>
    </div>
    <button class="btn btn-primary" id="saveSettings">Guardar cambios</button>

    <div class="settings-danger">
      <h3 class="menu-cat-title">Datos</h3>
      <button class="btn" id="exportData">⬇️ Exportar respaldo (JSON)</button>
      <button class="btn" id="importData" style="margin-top:8px">⬆️ Importar respaldo</button>
      <input type="file" id="importFile" accept="application/json" hidden>
      <button class="btn btn-danger" id="clearData" style="margin-top:8px">🗑️ Borrar todas las ventas</button>
    </div>
    <p class="field-hint" style="text-align:center;margin-top:8px">Los datos se guardan solo en este dispositivo.</p>
  `;
}

function saveSettingsForm() {
  S.settings.restaurantName = $('#setName').value.trim() || 'Mi Restaurante';
  S.settings.phone = $('#setPhone').value.trim();
  S.settings.address = $('#setAddress').value.trim();
  S.settings.currency = $('#setCurrency').value.trim() || '$';
  S.settings.defaultDeliveryFee = Number($('#setFee').value) || 0;
  if ($('#setColor')) S.settings.primaryColor = $('#setColor').value;
  saveSettings();
  applyTheme();
  $('#brandName').textContent = S.settings.restaurantName;
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

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.products || !data.orders) throw new Error('Formato inválido');
      if (!confirm('Esto reemplazará TODOS los datos actuales. ¿Continuar?')) return;
      S.settings = data.settings || S.settings;
      S.products = data.products;
      S.orders = data.orders;
      saveSettings(); saveProducts(); saveOrders();
      updateDayTotal();
      renderSettings();
      toast('Respaldo importado');
    } catch (e) { toast('Archivo no válido'); }
  };
  reader.readAsText(file);
}

/* ============================================================
   NAVEGACIÓN ENTRE VISTAS
   ============================================================ */
function switchView(view) {
  S.view = view;
  $$('.view').forEach((v) => { v.hidden = v.id !== 'view-' + view; });
  $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  if (view === 'vender') renderPOS();
  if (view === 'historial') renderHistorial();
  if (view === 'menu') renderMenu();
  if (view === 'ajustes') renderSettings();
}

/* ============================================================
   EVENTOS (delegación desde el documento)
   ============================================================ */
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-view],[data-add],[data-cat],[data-close],[data-qty],[data-order],[data-toggle],[data-edit],[data-delete],[data-type],[data-pay],[data-clearcart],[data-closesheet],[data-color],[data-period]');

  // Navegación
  const nav = e.target.closest('.nav-btn');
  if (nav) { switchView(nav.dataset.view); return; }

  if (!t) return;

  // Cerrar modal
  if (t.hasAttribute('data-close')) { closeModal(); if (S.view === 'vender') renderPOS(); return; }

  // POS: categoría
  if (t.dataset.cat) { S.activeCat = t.dataset.cat; renderPOS(); return; }

  // POS: agregar producto
  if (t.dataset.add) { addToCart(t.dataset.add); return; }

  // Pedido: cambiar cantidad
  if (t.dataset.qty) { changeQty(t.dataset.qty, Number(t.dataset.delta)); return; }

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

  // Ajustes: elegir color de un preset
  if (t.dataset.color) {
    S.settings.primaryColor = t.dataset.color;
    applyTheme(); saveSettings(); renderSettings();
    return;
  }

  // Historial: filtro de periodo
  if (t.dataset.period) { S.histPeriod = t.dataset.period; renderHistorial(); return; }

  // Historial: abrir detalle
  if (t.dataset.order) { openOrderDetail(t.dataset.order); return; }

  // Menú: acciones
  if (t.dataset.toggle) { const p = S.products.find((x) => x.id === t.dataset.toggle); p.active = !p.active; saveProducts(); renderMenu(); return; }
  if (t.dataset.edit) { openProductForm(t.dataset.edit); return; }
  if (t.dataset.delete) {
    if (confirm('¿Borrar este producto? (No afecta ventas ya registradas)')) {
      S.products = S.products.filter((x) => x.id !== t.dataset.delete); saveProducts(); renderMenu();
    }
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
    case 'backToCart': closeModal(); break;
    case 'confirmSale': confirmSale(); break;
    case 'printTicket': printTicket(order()); break;
    case 'waTicket': whatsappTicket(order()); break;
    case 'deleteOrder':
      if (confirm('¿Borrar esta venta del historial?')) {
        S.orders = S.orders.filter((o) => o.id !== modalEl.dataset.orderId);
        saveOrders(); closeModal(); updateDayTotal(); renderHistorial();
      }
      break;
    case 'addProductBtn': openProductForm(null); break;
    case 'pickImg': $('#pImgFile').click(); break;
    case 'removeImg': {
      productImage = '';
      const prev = $('#imgPreview'); if (prev) { prev.style.backgroundImage = ''; prev.textContent = '📷'; }
      e.target.hidden = true;
      const pick = $('#pickImg'); if (pick) pick.textContent = 'Elegir imagen';
      break;
    }
    case 'saveProduct': saveProduct(); break;
    case 'saveSettings': saveSettingsForm(); break;
    case 'exportData': exportData(); break;
    case 'importData': $('#importFile').click(); break;
    case 'clearData':
      if (confirm('¿Borrar TODAS las ventas? Esto no se puede deshacer.')) {
        S.orders = []; saveOrders(); updateDayTotal(); toast('Ventas borradas');
      }
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
});

// Guardar lo que se escribe en el cobro (para recalcular cambio en vivo)
document.addEventListener('input', (e) => {
  if (e.target.id === 'cCash' || e.target.id === 'cFee') {
    captureCheckoutInputs();
    openCheckout();
    const el = $('#' + e.target.id);
    if (el) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch (_) {} }
  }
  if (e.target.id === 'importFile') {
    if (e.target.files && e.target.files[0]) importData(e.target.files[0]);
  }
});

/* ============================================================
   INICIO
   ============================================================ */
applyTheme();
updateDayTotal();
switchView('vender');

// Registrar service worker (para que funcione sin internet, si está en un servidor)
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
