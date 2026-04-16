import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const CONTROLLED_PATH = '/usr/bin:/bin:/usr/sbin:/sbin';
const tmpDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'movie-chat-shell-'));
  tmpDirs.push(dir);
  return dir;
}

function writeExecutable(filePath: string, content: string) {
  fs.writeFileSync(filePath, content, { mode: 0o755 });
}

function writeStub(binDir: string, name: string, body: string) {
  writeExecutable(path.join(binDir, name), `#!/usr/bin/env bash
set -euo pipefail
${body}
`);
}

function readCalls(logFile: string): string[] {
  if (!fs.existsSync(logFile)) return [];
  return fs.readFileSync(logFile, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function prepareScriptEnv(home: string) {
  const logFile = path.join(home, 'script-calls.log');
  const binDir = path.join(home, 'bin');
  fs.mkdirSync(binDir, { recursive: true });

  return {
    binDir,
    logFile,
    env: {
      HOME: home,
      LANG: 'C',
      LC_ALL: 'C',
      PATH: `${binDir}:${CONTROLLED_PATH}`,
      TEST_LOG: logFile,
    },
  };
}

function runScript(
  scriptName: string,
  {
    args = [],
    cwd,
    env,
    input = '',
  }: {
    args?: string[];
    cwd: string;
    env: NodeJS.ProcessEnv;
    input?: string;
  }
) {
  return spawnSync('bash', [path.join(ROOT, scriptName), ...args], {
    cwd,
    env,
    encoding: 'utf8',
    input,
  });
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('shell scripts', () => {
  it('install.sh performs a fresh clone, install, and build in the regular test suite', () => {
    const root = makeTempDir();
    const home = path.join(root, 'home');
    fs.mkdirSync(home, { recursive: true });
    const { binDir, env, logFile } = prepareScriptEnv(home);

    writeStub(binDir, 'git', `
printf 'git %s\n' "$*" >> "$TEST_LOG"
if [ "$1" = "clone" ]; then
  DEST="\${@: -1}"
  mkdir -p "$DEST"
  cat > "$DEST/package.json" <<'JSON'
{"name":"movie-chat"}
JSON
  cat > "$DEST/ecosystem.config.js" <<'JS'
module.exports = {};
JS
  exit 0
fi
echo "unexpected git args: $*" >&2
exit 1
`);
    writeStub(binDir, 'node', `
printf '20.11.0'
`);
    writeStub(binDir, 'npm', `
printf 'npm %s\n' "$*" >> "$TEST_LOG"
exit 0
`);

    const result = runScript('install.sh', {
      cwd: ROOT,
      env,
      input: '\nn\nn\n',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('All done!');

    const installDir = path.join(home, 'movie-chat');
    expect(fs.existsSync(path.join(installDir, 'package.json'))).toBe(true);
    expect(readCalls(logFile)).toEqual([
      `git clone --quiet https://github.com/nookied/movie-chat.git ${installDir}`,
      'npm install --silent',
      'npm run build --silent',
    ]);
  });

  it('update.sh applies an update by pulling, installing, and rebuilding', () => {
    const root = makeTempDir();
    const home = path.join(root, 'home');
    const repoDir = path.join(root, 'repo');
    fs.mkdirSync(home, { recursive: true });
    fs.mkdirSync(repoDir, { recursive: true });
    fs.writeFileSync(path.join(repoDir, 'ecosystem.config.js'), 'module.exports = {};');

    const { binDir, env, logFile } = prepareScriptEnv(home);

    writeStub(binDir, 'git', `
printf 'git %s\n' "$*" >> "$TEST_LOG"
case "$1" in
  status) exit 0 ;;
  fetch) exit 0 ;;
  rev-parse)
    if [ "$2" = "HEAD" ]; then
      printf 'local-sha'
    else
      printf 'remote-sha'
    fi
    ;;
  rev-list) printf '2' ;;
  log) printf '    - fix one\\n    - fix two\\n' ;;
  pull) exit 0 ;;
  reset) exit 0 ;;
  *) echo "unexpected git args: $*" >&2; exit 1 ;;
esac
`);
    writeStub(binDir, 'npm', `
printf 'npm %s\n' "$*" >> "$TEST_LOG"
exit 0
`);

    const result = runScript('update.sh', {
      cwd: repoDir,
      env,
      input: 'y\n',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Downloaded latest code');
    expect(result.stdout).toContain('Build complete');
    expect(readCalls(logFile)).toContain('git pull --quiet');
    expect(readCalls(logFile)).toContain('npm install');
    expect(readCalls(logFile)).toContain('npm run build');
  });

  it('update.sh --auto skips when tracked files are dirty', () => {
    const root = makeTempDir();
    const home = path.join(root, 'home');
    const repoDir = path.join(root, 'repo');
    fs.mkdirSync(home, { recursive: true });
    fs.mkdirSync(repoDir, { recursive: true });
    fs.writeFileSync(path.join(repoDir, 'ecosystem.config.js'), 'module.exports = {};');

    const { binDir, env, logFile } = prepareScriptEnv(home);

    writeStub(binDir, 'git', `
printf 'git %s\n' "$*" >> "$TEST_LOG"
if [ "$1" = "status" ]; then
  printf ' M update.sh\\n'
  exit 0
fi
echo "unexpected git args: $*" >&2
exit 1
`);
    writeStub(binDir, 'npm', `
printf 'npm %s\n' "$*" >> "$TEST_LOG"
exit 0
`);

    const result = runScript('update.sh', {
      cwd: repoDir,
      env,
      args: ['--auto'],
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/Skipped .*local tracked modifications/);
    expect(readCalls(logFile)).toEqual(['git status --porcelain=v1 --untracked-files=no']);
  });

  it('update.sh rolls back when the build step fails', () => {
    const root = makeTempDir();
    const home = path.join(root, 'home');
    const repoDir = path.join(root, 'repo');
    fs.mkdirSync(home, { recursive: true });
    fs.mkdirSync(repoDir, { recursive: true });
    fs.writeFileSync(path.join(repoDir, 'ecosystem.config.js'), 'module.exports = {};');

    const { binDir, env, logFile } = prepareScriptEnv(home);

    writeStub(binDir, 'git', `
printf 'git %s\n' "$*" >> "$TEST_LOG"
case "$1" in
  status) exit 0 ;;
  fetch) exit 0 ;;
  rev-parse)
    if [ "$2" = "HEAD" ]; then
      printf 'rollback-sha'
    else
      printf 'remote-sha'
    fi
    ;;
  rev-list) printf '1' ;;
  log) printf '    - risky change\\n' ;;
  pull) exit 0 ;;
  reset)
    if [ "$2" = "--hard" ]; then
      exit 0
    fi
    ;;
  *) echo "unexpected git args: $*" >&2; exit 1 ;;
esac
`);
writeStub(binDir, 'npm', `
printf 'npm %s\n' "$*" >> "$TEST_LOG"
if [ "$1" = "run" ] && [ "$2" = "build" ] && [ "\${3:-}" != "--silent" ]; then
  echo 'build failed' >&2
  exit 1
fi
exit 0
`);

    const result = runScript('update.sh', {
      cwd: repoDir,
      env,
      input: 'y\n',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Update failed');
    expect(readCalls(logFile)).toContain('git reset --hard rollback-sha');
  });
});
