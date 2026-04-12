import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import store from './store.js';
import { SyncService } from './syncService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.js
// │
process.env.DIST = path.join(__dirname, '../dist');
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public');

let win: BrowserWindow | null;
// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 750,
    title: "PS3 Save Sync",
    icon: path.join(__dirname, "../public/icon.png"),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    // We want a premium look, no default menu usually, but leave it for now
    autoHideMenuBar: true,
  });

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString());
  });

  // Open developer console automatically for debugging
  if (!app.isPackaged) {
    win.webContents.openDevTools();
  }

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(process.env.DIST!, 'index.html'));
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    win = null;
  }
});

app.on('ready', () => {
  ipcMain.handle('ping', () => 'pong');

  // Nextcloud Store getters/setters
  ipcMain.handle('get-settings', () => store.store);
  ipcMain.handle('save-settings', (event, data) => {
    store.set(data);
    return true;
  });

  // Sync Logic Pipeline
  ipcMain.handle('scan-deltas', async () => {
    try {
      const sync = new SyncService();
      await sync.init();
      return { success: true, data: await sync.scanDeltas() };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('get-ps3-profiles', async () => {
    try {
      const sync = new SyncService();
      await sync.init();
      return { success: true, data: await sync.getAvailableProfiles() };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('get-ps2-inventory', async () => {
    try {
      const sync = new SyncService();
      await sync.init();
      return { success: true, data: await sync.getPS2Inventory() };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('perform-vmc-sync', async (event, action, fileName) => {
    try {
      const sync = new SyncService();
      await sync.init();
      await sync.performVMCSync(action, fileName);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('decompose-vmc-to-psv', async (event, vmcFileName, gameSerial, folderName) => {
    try {
      const sync = new SyncService();
      await sync.init();
      await sync.decomposeVMCGameToPSV(vmcFileName, gameSerial, folderName);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('decompose-vmc-to-psu', async (event, vmcFileName, gameSerial, folderName) => {
    try {
      const sync = new SyncService();
      await sync.init();
      await sync.decomposeVMCGameToPSU(vmcFileName, gameSerial, folderName);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('perform-sync', async (event, action, profileId, folderName) => {
    try {
      const sync = new SyncService();
      await sync.init();
      await sync.performSync(action, profileId, folderName);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  createWindow();
});
