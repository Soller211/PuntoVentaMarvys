# 🍔 Punto de Venta — Restaurante a domicilio

App web sencilla para tomar pedidos, cobrar y llevar el historial de ventas.
Funciona en **teléfono** y en la **computadora/tablet de la tienda**, incluso **sin internet**.
Todo se guarda **en el mismo dispositivo** (no necesita servidor).

## 🚀 Instalarlo en tu negocio (lo más fácil)

**Abre este enlace en tu teléfono, tablet o computadora:**

### 👉 https://sollerventapoint.esolergonzalez.workers.dev

Luego agrégalo como app (queda un ícono en la pantalla y funciona sin internet):
- **Android / Chrome:** menú ⋮ → *Agregar a pantalla principal*.
- **iPhone / Safari:** botón compartir ⬆️ → *Agregar a inicio*.
- **Computadora / Chrome o Edge:** ícono de instalar ⊕ a la derecha de la barra de dirección.

Después entra a **⚙️ Ajustes** para poner el nombre y color de tu negocio, y a
**🍽️ Menú** para cargar tus productos con sus precios y fotos. ¡Listo para vender!

> Cada dispositivo guarda **su propia** información. Repite la instalación en cada
> aparato donde lo vayas a usar y haz respaldos desde *Ajustes → Exportar respaldo*.

### 💻 Para computadora con Windows (programa instalable)
Descarga el instalador desde la sección **[Releases](https://github.com/Soller211/PuntoVentaMarvys/releases/latest)**
(archivo `Punto de Venta Setup X.X.X.exe`), dale doble clic e instálalo. Queda como
un programa normal de Windows, con su ícono, y funciona **sin internet**.

> La primera vez, Windows puede mostrar *"Windows protegió tu PC"* porque el
> instalador no tiene firma de pago. Haz clic en **Más información → Ejecutar de
> todas formas**. Es normal en software independiente.

---


## ✨ Qué incluye
- **Vender:** menú por categorías, buscador, armar el pedido (siempre visible al lado), domicilio o para llevar.
- **Imágenes en los productos** para reconocerlos de un vistazo.
- **Cobro:** efectivo (calcula el cambio) o transferencia/tarjeta.
- **Cliente:** nombre, teléfono, dirección y notas para las entregas.
- **Ticket:** imprimir o enviar por WhatsApp.
- **Reportes por Hoy / Semana / Mes / Todo:** ventas, pedidos, ticket promedio,
  efectivo vs. transferencia, gráfica de ventas por día y productos más vendidos.
- **Color del negocio** personalizable (Ajustes).
- **Menú editable** y **respaldo** de tus datos (exportar/importar).

---

## ▶️ Cómo usarla

### Opción A — Todo local en la tienda (sin internet) ⭐
Usa una computadora como "servidor" y abre la app desde el teléfono/tablet por la WiFi.

1. Instala **Node.js** una sola vez: https://nodejs.org (botón verde, "LTS").
2. En esta carpeta, abre una terminal y ejecuta:
   ```bash
   node server.js
   ```
3. Verás dos direcciones. Úsalas así:
   - En **esa computadora**: `http://localhost:8080`
   - En el **teléfono/tablet** (conectados a la **misma WiFi**): `http://192.168.x.x:8080`
     (la dirección exacta la muestra la terminal)
4. En cada dispositivo, agrega la app a la pantalla de inicio (ver Opción B, paso 4).

> No necesita internet, solo que los dispositivos estén en la misma red WiFi.
> Deja esa computadora encendida con `node server.js` mientras usan el POS.

### Opción B — Con internet (la más fácil de repartir)
Publícala gratis una vez y abre el enlace en cualquier dispositivo:

1. Entra a **https://app.netlify.com/drop**
2. **Arrastra esta carpeta completa** a la página. Te dará un enlace (URL).
3. Abre ese enlace en el teléfono, la tablet o la computadora de la tienda.
4. **Instálala como app:**
   - **Android/Chrome:** menú ⋮ → *Agregar a pantalla principal*.
   - **iPhone/Safari:** botón compartir → *Agregar a inicio*.
   - **Computadora/Chrome:** ícono de instalar ⊕ en la barra de dirección.

Solo necesita internet la **primera vez** para cargar; después funciona sin conexión.

### Opción C — Rápida para probar (una sola computadora)
```bash
node server.js
```
y abre **http://localhost:8080**. (O abre `index.html` con doble clic.)

---

## 💾 Sobre los datos
- Los datos viven **solo en ese dispositivo/navegador**. Si usas el teléfono y la
  computadora, cada uno tiene su propia información (así lo pediste: un dispositivo).
- Haz un **respaldo** de vez en cuando: *Ajustes → Exportar respaldo*. Guarda el
  archivo en un lugar seguro. Para pasarlo a otro equipo: *Ajustes → Importar respaldo*.

## 🔧 Personalizar
- **Ajustes:** nombre del negocio, teléfono, dirección, moneda y costo de envío.
- **Menú:** agregar, editar, ocultar o borrar productos y categorías.

## 🔜 Si más adelante quieres sincronizar varios dispositivos
Habría que agregar un servidor o servicio en la nube. La app está organizada para
poder dar ese paso después sin empezar de cero.
