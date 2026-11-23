const { app, BrowserWindow, shell, session } = require('electron');
const path = require('node:path');

const appUrl = process.env.ELECTRON_APP_URL;
if (!appUrl || !/^https:\/\//i.test(appUrl)) {
  throw new Error('ELECTRON_APP_URL debe ser una URL HTTPS de Netlify.');
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0b1220',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const allowedOrigin = new URL(appUrl).origin;
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(allowedOrigin)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(allowedOrigin)) event.preventDefault();
  });
  window.loadURL(appUrl);
}

app.whenReady().then(() => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({ responseHeaders: {
      ...details.responseHeaders,
      'Content-Security-Policy': ["default-src 'self' https: data: blob:; connect-src 'self' https:; img-src 'self' https: data: blob:; style-src 'self' 'unsafe-inline' https:; script-src 'self' https: 'unsafe-inline'"]
    }});
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
