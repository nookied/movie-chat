const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { autoUpdater } = require('electron-updater');
const { runAutoSetup, cleanupOllama } = require('./setup');

const PORT = 3000;
const CONFIG_DIR = path.join(app.getPath('userData'), 'config');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.local.json');

let mainWindow = null;
let setupWindow = null;
let tray = null;
let serverProcess = null;

// ── Config helpers ───────────────────────────────────────────────────────────

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  if (!fs.existsSync(CONFIG_PATH)) fs.writeFileSync(CONFIG_PATH, '{}', 'utf-8');
}

/** Check if minimum config exists (at least one LLM configured). */
function needsSetup() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    return !config.ollamaModel && !config.openRouterApiKey;
  } catch {
    return true;
  }
}

// ── Server management ────────────────────────────────────────────────────────

let serverRestarts = 0;
const MAX_RESTARTS = 5;

function startServer() {
  const isDev = !app.isPackaged;
  const serverPath = isDev
    ? path.join(__dirname, '..', '.next', 'standalone', 'server.js')
    : path.join(process.resourcesPath, 'standalone', 'server.js');

  const nodeBin = isDev ? process.argv[0] : process.execPath;

  serverProcess = spawn(nodeBin, [serverPath], {
    env: {
      ...process.env,
      PORT: String(PORT),
      CONFIG_PATH,
      NODE_ENV: isDev ? 'development' : 'production',
    },
    stdio: 'pipe',
  });

  serverProcess.stdout?.on('data', (d) => console.log('[server]', d.toString().trim()));
  serverProcess.stderr?.on('data', (d) => console.error('[server]', d.toString().trim()));
  serverProcess.on('exit', (code) => {
    serverProcess = null;
    if (app.isQuitting) return;
    serverRestarts++;
    if (serverRestarts > MAX_RESTARTS) {
      console.error(`Server crashed ${serverRestarts} times — giving up`);
      return;
    }
    const delay = Math.min(1000 * Math.pow(2, serverRestarts - 1), 30000);
    console.log(`Server exited (code ${code}), restarting in ${delay}ms (attempt ${serverRestarts}/${MAX_RESTARTS})`);
    setTimeout(startServer, delay);
  });
}

function waitForServer(retries = 30) {
  return new Promise((resolve, reject) => {
    function check(attempt) {
      if (attempt >= retries) return reject(new Error('Server did not start'));
      http.get(`http://localhost:${PORT}/api/setup/status`, (res) => {
        if (res.statusCode === 200) return resolve();
        setTimeout(() => check(attempt + 1), 500);
      }).on('error', () => {
        setTimeout(() => check(attempt + 1), 500);
      });
    }
    check(0);
  });
}

// ── Windows ──────────────────────────────────────────────────────────────────

function createSetupWindow() {
  setupWindow = new BrowserWindow({
    width: 480,
    height: 520,
    resizable: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  setupWindow.loadFile(path.join(__dirname, 'setup.html'));
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 480,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a1a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'iconTemplate.png');
  let icon;
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } else {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('Movie Chat');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Movie Chat', click: () => mainWindow?.show() },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);
  tray.on('click', () => mainWindow?.show());
}

// ── Auto-setup flow ──────────────────────────────────────────────────────────

async function doAutoSetup() {
  createSetupWindow();

  const sendProgress = (data) => {
    setupWindow?.webContents?.send('setup:progress', data);
  };

  const result = await runAutoSetup(CONFIG_PATH, sendProgress);

  setupWindow?.webContents?.send('setup:complete', result);

  // Brief pause so user sees the final status before window closes
  await new Promise((r) => setTimeout(r, 1500));
  setupWindow?.close();
  setupWindow = null;
  // The web-based wizard at /setup handles Plex token and API key collection
}

// ── IPC handlers ─────────────────────────────────────────────────────────────

ipcMain.on('setup:retry', () => {
  doAutoSetup();
});

// ── Auto-updater ─────────────────────────────────────────────────────────────

function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    console.log(`[updater] Update available: v${info.version}`);
  });

  autoUpdater.on('update-downloaded', (info) => {
    // Prompt user to restart
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Ready',
      message: `Movie Chat v${info.version} has been downloaded.`,
      detail: 'The update will be installed when you restart the app.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('[updater] Error:', err.message);
  });

  // Check for updates every 4 hours
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 4 * 60 * 60 * 1000);
}

// ── App lifecycle ────────────────────────────────────────────────────────────

app.on('ready', async () => {
  ensureConfigDir();
  createTray();

  if (needsSetup()) {
    await doAutoSetup();
  }

  // Start server and open main window
  startServer();

  try {
    await waitForServer();
  } catch {
    console.error('Failed to start server');
  }

  createMainWindow();

  // Check for updates after the app is fully loaded
  if (app.isPackaged) setupAutoUpdater();
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
  cleanupOllama();
});

app.on('activate', () => {
  if (mainWindow) mainWindow.show();
  else if (setupWindow) setupWindow.show();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
