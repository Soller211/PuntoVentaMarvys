/* ============================================================
   App de escritorio (Electron).
   Abre el punto de venta como un programa de Windows: ventana
   propia, sin navegador, y funciona 100% sin internet.
   ============================================================ */
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 380,
    minHeight: 600,
    autoHideMenuBar: true,
    backgroundColor: '#f4f4f5',
    title: 'Punto de Venta',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { contextIsolation: true },
  });

  win.loadFile('index.html');

  // Los enlaces externos (WhatsApp, etc.) se abren en el navegador del sistema
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null); // sin barra de menú de Electron
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
