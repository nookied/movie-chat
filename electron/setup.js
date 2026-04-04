const { execSync, exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Track the ollama serve process so it can be killed on app quit
let ollamaServeProcess = null;

// ── Homebrew path detection (Apple Silicon vs Intel) ─────────────────────────

function getBrewPath() {
  const candidates = ['/opt/homebrew/bin/brew', '/usr/local/bin/brew'];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function isBrewInstalled() {
  return getBrewPath() !== null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Run a shell command silently. Returns true on success. */
function run(cmd) {
  try {
    execSync(cmd, { stdio: 'pipe', timeout: 300_000 }); // 5 min timeout
    return true;
  } catch {
    return false;
  }
}

/** Check if a brew formula or cask is installed. */
function isInstalled(brew, name, isCask = false) {
  const flag = isCask ? '--cask' : '';
  try {
    execSync(`${brew} list ${flag} ${name} 2>/dev/null`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/** Check if a process is listening on a port. */
function isPortOpen(port) {
  try {
    execSync(`lsof -i :${port} -sTCP:LISTEN`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// ── Step 1: Homebrew ─────────────────────────────────────────────────────────

function installBrew() {
  return new Promise((resolve) => {
    const script = `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`;
    exec(`osascript -e 'tell app "Terminal" to do script "${script.replace(/"/g, '\\"')}"'`);

    let resolved = false;
    const interval = setInterval(() => {
      if (isBrewInstalled()) {
        resolved = true;
        clearInterval(interval);
        clearTimeout(timeout);
        resolve(true);
      }
    }, 3000);

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        clearInterval(interval);
        resolve(isBrewInstalled());
      }
    }, 600_000);
  });
}

// ── Step 2: Plex ─────────────────────────────────────────────────────────────

function installPlex(brew, onProgress) {
  if (isInstalled(brew, 'plex-media-server', true) || isPortOpen(32400)) {
    onProgress({ step: 'plex', status: 'done', message: 'Plex is already installed' });
    return true;
  }
  onProgress({ step: 'plex', status: 'installing', message: 'Installing Plex Media Server — usually takes about a minute...' });
  const ok = run(`${brew} install --cask plex-media-server`);
  onProgress({ step: 'plex', status: ok ? 'done' : 'skipped', message: ok ? 'Plex installed' : 'Plex install failed — you can set it up later' });
  return ok;
}

// ── Step 3: Transmission (GUI app + enable RPC) ─────────────────────────────

function installTransmission(brew, onProgress) {
  if (isInstalled(brew, 'transmission', true) || isPortOpen(9091)) {
    onProgress({ step: 'transmission', status: 'done', message: 'Transmission is already installed' });
    return true;
  }
  onProgress({ step: 'transmission', status: 'installing', message: 'Installing Transmission — usually takes about a minute...' });
  const ok = run(`${brew} install --cask transmission`);
  if (ok) {
    // Enable the web/RPC interface so movie-chat can communicate with it
    run('defaults write org.m0k.transmission RPC -bool true');
    run('defaults write org.m0k.transmission RPCEnabled -bool true');
    run('defaults write org.m0k.transmission RPCPort -int 9091');
    // Allow connections from localhost only
    run('defaults write org.m0k.transmission RPCUseWhitelist -bool true');
    run("defaults write org.m0k.transmission RPCWhitelist -string '127.0.0.1'");
    // Launch Transmission.app
    run('open -a Transmission');
    onProgress({ step: 'transmission', status: 'done', message: 'Transmission installed' });
  } else {
    onProgress({ step: 'transmission', status: 'skipped', message: 'Transmission install failed — you can set it up later' });
  }
  return ok;
}

// ── Step 4: Ollama ───────────────────────────────────────────────────────────

function installOllama(brew, onProgress) {
  return new Promise((resolve) => {
    // Check if already installed and running
    if (isPortOpen(11434)) {
      onProgress({ step: 'ollama', status: 'done', message: 'Ollama is already running' });
      resolve(true);
      return;
    }

    const installed = isInstalled(brew, 'ollama');
    if (!installed) {
      onProgress({ step: 'ollama', status: 'installing', message: 'Installing Ollama — usually takes about a minute...' });
      if (!run(`${brew} install ollama`)) {
        onProgress({ step: 'ollama', status: 'failed', message: 'Ollama install failed' });
        resolve(false);
        return;
      }
    }

    // Start ollama serve in background (tracked for cleanup on quit)
    onProgress({ step: 'ollama', status: 'installing', message: 'Starting Ollama...' });
    ollamaServeProcess = spawn('ollama', ['serve'], { stdio: 'ignore', detached: true });
    ollamaServeProcess.unref();

    // Wait for it to be ready (up to 30s — first launch can be slow)
    let attempts = 0;
    const waitInterval = setInterval(() => {
      attempts++;
      if (isPortOpen(11434)) {
        clearInterval(waitInterval);
        pullModel(onProgress).then(resolve);
      } else if (attempts > 30) {
        clearInterval(waitInterval);
        onProgress({ step: 'ollama', status: 'failed', message: 'Ollama failed to start' });
        resolve(false);
      }
    }, 1000);
  });
}

function pullModel(onProgress) {
  return new Promise((resolve) => {
    onProgress({ step: 'ollama', status: 'installing', message: 'Downloading AI model (this may take a few minutes)...' });

    const pull = spawn('ollama', ['pull', 'llama3.2']);
    let lastProgress = '';

    pull.stderr?.on('data', (data) => {
      const line = data.toString().trim();
      // Ollama outputs progress like "pulling abc123... 45%"
      if (line && line !== lastProgress) {
        lastProgress = line;
        const pctMatch = line.match(/(\d+)%/);
        if (pctMatch) {
          onProgress({ step: 'ollama', status: 'installing', message: `Downloading AI model... ${pctMatch[1]}%` });
        }
      }
    });

    pull.on('close', (code) => {
      if (code === 0) {
        onProgress({ step: 'ollama', status: 'done', message: 'AI model ready' });
        resolve(true);
      } else {
        onProgress({ step: 'ollama', status: 'failed', message: 'Model download failed' });
        resolve(false);
      }
    });
  });
}

// ── Step 5: Write config ─────────────────────────────────────────────────────

function writeSetupConfig(configPath, onProgress) {
  onProgress({ step: 'config', status: 'installing', message: 'Saving configuration...' });

  const config = {
    ollamaBaseUrl: 'http://localhost:11434',
    ollamaModel: 'llama3.2',
    ollamaOnly: 'true',
    plexBaseUrl: 'http://localhost:32400',
    transmissionBaseUrl: 'http://localhost:9091',
  };

  // Only include services that are actually reachable
  if (!isPortOpen(32400)) delete config.plexBaseUrl;
  if (!isPortOpen(9091)) delete config.transmissionBaseUrl;

  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

  onProgress({ step: 'config', status: 'done', message: 'Configuration saved' });
  return true;
}

// ── Main orchestrator ────────────────────────────────────────────────────────

/**
 * Run the full auto-setup pipeline.
 * @param {string} configPath - Path to config.local.json
 * @param {(event: {step: string, status: string, message: string}) => void} onProgress
 * @returns {Promise<{success: boolean, ollamaFailed: boolean}>}
 */
async function runAutoSetup(configPath, onProgress) {
  let ollamaFailed = false;

  // Step 1: Homebrew
  if (!isBrewInstalled()) {
    onProgress({ step: 'brew', status: 'installing', message: 'Installing Homebrew — please enter your password in the Terminal window...' });
    const ok = await installBrew();
    if (!ok) {
      onProgress({ step: 'brew', status: 'failed', message: 'Homebrew installation failed' });
      return { success: false, ollamaFailed: true };
    }
    onProgress({ step: 'brew', status: 'done', message: 'Homebrew installed' });
  } else {
    onProgress({ step: 'brew', status: 'done', message: 'Homebrew is already installed' });
  }

  const brew = getBrewPath();

  // Steps 2-3: Plex and Transmission (non-fatal, synchronous)
  installPlex(brew, onProgress);
  installTransmission(brew, onProgress);

  // Step 4: Ollama (important — this is the LLM)
  const ollamaOk = await installOllama(brew, onProgress);
  if (!ollamaOk) ollamaFailed = true;

  // Brief pause for newly installed services to start listening on their ports
  await new Promise((r) => setTimeout(r, 3000));

  // Step 5: Write config
  if (!ollamaFailed) {
    writeSetupConfig(configPath, onProgress);
  }

  return { success: !ollamaFailed, ollamaFailed };
}

/** Kill the ollama serve process if we spawned one. Call from app.before-quit. */
function cleanupOllama() {
  if (ollamaServeProcess) {
    try { ollamaServeProcess.kill(); } catch { /* already dead */ }
    ollamaServeProcess = null;
  }
}

module.exports = { runAutoSetup, isBrewInstalled, getBrewPath, cleanupOllama };
