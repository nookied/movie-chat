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
const LOG_DIR = path.join(app.getPath('userData'), 'logs');
const ELECTRON_LOG = path.join(LOG_DIR, 'electron.jsonl');
const ELECTRON_LOG_PREV = path.join(LOG_DIR, 'electron.1.jsonl');
// Per-file cap protects against runaway lifecycle spam. Electron-side log
// volume is very low (a few lines per app lifecycle). When the cap hits we
// rename the current file to electron.1.jsonl (overwriting any previous .1)
// so one generation of history is preserved — crucial when the lines we
// actually need are leading up to a crash loop.
const MAX_ELECTRON_LOG_BYTES = 2 * 1024 * 1024;

let mainWindow = null;
let setupWindow = null;
let tray = null;
let serverProcess = null;

// ── Config & log helpers ─────────────────────────────────────────────────────

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  if (!fs.existsSync(CONFIG_PATH)) fs.writeFileSync(CONFIG_PATH, '{}', 'utf-8');
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

/** Append one JSONL line to electron.jsonl. Same shape as lib/logger.ts so
 *  the diagnostics bundle can consume both files identically. */
function appendElectronLog(level, source, msg, meta) {
  const entry = { ts: new Date().toISOString(), level, source, msg };
  if (meta && Object.keys(meta).length > 0) entry.meta = meta;
  try {
    try {
      const stat = fs.statSync(ELECTRON_LOG);
      if (stat.size >= MAX_ELECTRON_LOG_BYTES) {
        // Rotate to .1.jsonl (overwriting any existing previous file) so one
        // generation of history survives. renameSync is atomic on POSIX —
        // no torn state visible to a concurrent reader.
        try { fs.renameSync(ELECTRON_LOG, ELECTRON_LOG_PREV); } catch { /* ignore */ }
      }
    } catch {
      // file doesn't exist yet — fine
    }
    fs.appendFileSync(ELECTRON_LOG, JSON.stringify(entry) + '\n');
  } catch {
    // silent — the console mirror below still surfaces the event
  }
  const method = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (meta) method(`[${source}] ${msg}`, meta);
  else method(`[${source}] ${msg}`);
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
      MOVIE_CHAT_LOG_DIR: LOG_DIR,
      NODE_ENV: isDev ? 'development' : 'production',
    },
    stdio: 'pipe',
  });

  // Forward spawned server stdout/stderr to Electron's console. The server
  // already writes its own structured JSONL via lib/logger.ts into LOG_DIR,
  // so we do NOT re-write these lines to any file — that would duplicate.
  serverProcess.stdout?.on('data', (d) => console.log('[server]', d.toString().trim()));
  serverProcess.stderr?.on('data', (d) => console.error('[server]', d.toString().trim()));
  serverProcess.on('exit', (code) => {
    serverProcess = null;
    if (app.isQuitting) return;
    serverRestarts++;
    if (serverRestarts > MAX_RESTARTS) {
      appendElectronLog('error', 'electron', 'Server exceeded max restarts — giving up', { restarts: serverRestarts, code });
      return;
    }
    const delay = Math.min(1000 * Math.pow(2, serverRestarts - 1), 30000);
    appendElectronLog('warn', 'electron', 'Server exited — restarting', { code, delayMs: delay, attempt: serverRestarts, maxRestarts: MAX_RESTARTS });
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
    // Keep sending progress to setup window (model download continues in background)
    setupWindow?.webContents?.send('setup:progress', data);

    // When model finishes downloading, close the setup window if it's still open
    if (data.step === 'model' && (data.status === 'done' || data.status === 'failed')) {
      setTimeout(() => {
        setupWindow?.close();
        setupWindow = null;
      }, 2000);
    }
  };

  const result = await runAutoSetup(CONFIG_PATH, sendProgress);

  setupWindow?.webContents?.send('setup:complete', result);

  // Brief pause so user sees the final status, then proceed to server + wizard.
  // The setup window stays open if the model is still downloading — it shows progress
  // and closes automatically when the download finishes.
  await new Promise((r) => setTimeout(r, 1500));
  // Don't close setup window here — it may still be showing model download progress.
  // It will close when the model download completes (see sendProgress above).
  // If Ollama failed entirely, close now since there's no model download.
  if (result.ollamaFailed) {
    setupWindow?.close();
    setupWindow = null;
  }
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
    appendElectronLog('info', 'updater', 'Update available', { version: info.version });
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
    appendElectronLog('error', 'updater', 'Auto-update error', { error: err.message });
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
  appendElectronLog('info', 'electron', 'App ready', { version: app.getVersion(), platform: process.platform, arch: process.arch, packaged: app.isPackaged });
  createTray();

  if (needsSetup()) {
    await doAutoSetup();
  }

  // Start server and open main window
  startServer();

  try {
    await waitForServer();
    createMainWindow();
    if (app.isPackaged) setupAutoUpdater();
  } catch {
    // Server failed to start — show error dialog instead of blank window
    const { dialog: dlg } = require('electron');
    dlg.showErrorBox(
      'Movie Chat couldn\'t start',
      'The server failed to start. Another app may be using port 3000, or the installation is incomplete.\n\nTry quitting and reopening the app.'
    );
    app.quit();
  }
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
