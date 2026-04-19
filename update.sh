#!/usr/bin/env bash
# Movie Chat — updater
# Manual:     bash update.sh  /  npm run update
# Auto (cron): bash update.sh --auto
set -euo pipefail

AUTO=0
[[ "${1:-}" == "--auto" ]] && AUTO=1

# ── colours ──────────────────────────────────────────────────────────────────
BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
RESET='\033[0m'

info()    { echo -e "  ${GREEN}✓${RESET}  $*"; }
warn()    { echo -e "  ${YELLOW}!${RESET}  $*"; }
error()   { echo -e "  ${RED}✗${RESET}  $*" >&2; }
heading() { echo -e "\n${BOLD}$*${RESET}"; }
ask()     { echo -en "  ${BOLD}?${RESET}  $* "; }

tracked_changes() {
  git status --porcelain=v1 --untracked-files=no
}

has_tracked_changes() {
  [ -n "$(tracked_changes)" ]
}

prompt_to_stash_changes() {
  local REASON="$1"

  if [ "$AUTO" -eq 1 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M')] Skipped — ${REASON}. Run manually to resolve."
    exit 1
  fi

  warn "$REASON"
  tracked_changes
  echo ""
  ask "Stash them and continue? [Y/n]"
  read -r REPLY
  if [[ "$REPLY" =~ ^[Nn]$ ]]; then
    echo "  Cancelled." && echo ""
    exit 0
  fi

  git stash push -m "update.sh auto-stash $(date '+%Y-%m-%d %H:%M')"
  info "Changes stashed (restore later with: git stash pop)"
}

pull_failed_due_to_local_changes() {
  local OUTPUT="$1"

  grep -Eq \
    'would be overwritten by merge|would be overwritten by checkout|cannot pull with rebase: You have unstaged changes|Please commit your changes or stash them before you merge|Please commit or stash them\.' \
    <<<"$OUTPUT"
}

# ── ensure npm is on PATH (cron strips PATH; handle nvm + Homebrew installs) ──
if ! command -v npm &>/dev/null; then
  # nvm
  [ -s "$HOME/.nvm/nvm.sh" ] && \. "$HOME/.nvm/nvm.sh"
fi
if ! command -v npm &>/dev/null; then
  # Homebrew – Apple Silicon
  [ -d "/opt/homebrew/bin" ] && export PATH="/opt/homebrew/bin:$PATH"
fi
if ! command -v npm &>/dev/null; then
  # Homebrew – Intel / Linux
  [ -d "/usr/local/bin" ] && export PATH="/usr/local/bin:$PATH"
fi
if ! command -v npm &>/dev/null; then
  error "npm not found — add it to PATH and re-run."
  exit 1
fi

ensure_supported_node() {
  if ! command -v node &>/dev/null; then
    if [ "$AUTO" -eq 1 ]; then
      echo "[$(date '+%Y-%m-%d %H:%M')] Skipped — Node.js is not installed. Install Node.js 24 LTS (recommended) or 20 LTS."
    else
      error "Node.js is not installed. Install Node.js 24 LTS (recommended) or 20 LTS from https://nodejs.org and re-run."
    fi
    exit 1
  fi

  local NODE_VER
  local NODE_MAJOR
  NODE_VER=$(node -e "process.stdout.write(process.version.slice(1))")
  NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)

  if [ "$NODE_MAJOR" -ne 20 ] && [ "$NODE_MAJOR" -ne 24 ]; then
    if [ "$AUTO" -eq 1 ]; then
      echo "[$(date '+%Y-%m-%d %H:%M')] Skipped — Node.js $NODE_VER is unsupported. Movie Chat supports Node.js 20 LTS and 24 LTS."
    else
      error "Node.js $NODE_VER is unsupported. Movie Chat supports Node.js 20 LTS and 24 LTS (24 LTS recommended)."
    fi
    exit 1
  fi

  if [ "$AUTO" -eq 0 ]; then
    info "Node.js $NODE_VER"
  fi
}

ensure_supported_node

# ── locate the install dir ────────────────────────────────────────────────────
if [ -f "$(pwd)/ecosystem.config.js" ]; then
  INSTALL_DIR="$(pwd)"
elif [ -f "$HOME/movie-chat/ecosystem.config.js" ]; then
  INSTALL_DIR="$HOME/movie-chat"
else
  error "Cannot find Movie Chat installation. Run this from inside the movie-chat folder."
  exit 1
fi

cd "$INSTALL_DIR"

# ── prevent concurrent runs (cron overlap) ──────────────────────────────────
LOCKFILE="$INSTALL_DIR/.update.lock"
if [ -f "$LOCKFILE" ]; then
  OLD_PID=$(cat "$LOCKFILE" 2>/dev/null || echo "")
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    if [ "$AUTO" -eq 1 ]; then
      echo "[$(date '+%Y-%m-%d %H:%M')] Skipped — another update is already running (PID $OLD_PID)."
    else
      warn "Another update is already running (PID $OLD_PID). Aborting."
    fi
    exit 0
  fi
  # Stale lock file — previous run crashed; clean up and continue
fi
echo $$ > "$LOCKFILE"
trap 'rm -f "$LOCKFILE"' EXIT

# ── header ───────────────────────────────────────────────────────────────────
if [ "$AUTO" -eq 0 ]; then
  echo ""
  echo -e "${BOLD}  Movie Chat — update${RESET}"
  echo "  ─────────────────────────────────────────"
fi

# ── dirty worktree check ────────────────────────────────────────────────────
if has_tracked_changes; then
  prompt_to_stash_changes "You have local tracked modifications"
fi

# ── check for updates ─────────────────────────────────────────────────────────
FETCH_OUTPUT=""
if ! FETCH_OUTPUT=$(git fetch --quiet 2>&1); then
  [ -n "$FETCH_OUTPUT" ] && echo "$FETCH_OUTPUT" >&2
  error "git fetch failed — check your network connection and remote configuration."
  exit 1
fi

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "@{u}" 2>/dev/null || echo "")

if [ -z "$REMOTE" ]; then
  warn "No remote tracking branch — cannot check for updates."
  exit 1
fi

if [ "$LOCAL" = "$REMOTE" ]; then
  info "Already up to date."
  if [ "$AUTO" -eq 0 ]; then
    echo ""
  fi
  exit 0
fi

COMMITS_BEHIND=$(git rev-list HEAD..@{u} --count)

if [ "$AUTO" -eq 0 ]; then
  echo ""
  echo "  ${COMMITS_BEHIND} update(s) available:"
  git log HEAD..@{u} --oneline --format="    • %s"
  echo ""
  ask "Install now? [Y/n]"
  read -r REPLY
  [[ "$REPLY" =~ ^[Nn]$ ]] && echo "  Cancelled." && echo "" && exit 0
  echo ""
else
  echo "[$(date '+%Y-%m-%d %H:%M')] ${COMMITS_BEHIND} update(s) found — updating..."
fi

# ── save rollback point ──────────────────────────────────────────────────────
ROLLBACK_SHA="$LOCAL"

rollback() {
  error "Update failed — rolling back to previous version..."
  git reset --hard "$ROLLBACK_SHA" 2>/dev/null || true
  # Attempt to restore a working build from the rolled-back code
  npm install --silent 2>/dev/null || true
  npm run build --silent 2>/dev/null || true
  if command -v pm2 &>/dev/null && pm2 describe movie-chat &>/dev/null 2>&1; then
    pm2 restart movie-chat --silent 2>/dev/null || true
    warn "Rolled back and restarted previous version."
  else
    warn "Rolled back to $ROLLBACK_SHA. Start manually with: npm run build && npm run start"
  fi
}

# ── pull ──────────────────────────────────────────────────────────────────────
if has_tracked_changes; then
  prompt_to_stash_changes "Tracked files changed since the update started"
fi

PULL_OUTPUT=""
if ! PULL_OUTPUT=$(git pull --quiet 2>&1); then
  if pull_failed_due_to_local_changes "$PULL_OUTPUT"; then
    warn "git pull stopped because local files would be overwritten."
    echo "$PULL_OUTPUT" >&2
    warn "Your local changes were left untouched. Commit or stash them, then run npm run update again."
    exit 1
  fi

  [ -n "$PULL_OUTPUT" ] && echo "$PULL_OUTPUT" >&2
  error "git pull failed — possible merge conflict."
  rollback
  exit 1
fi
info "Downloaded latest code"

# ── npm install ──────────────────────────────────────────────────────────────
if [ "$AUTO" -eq 0 ]; then
  echo "  Installing dependencies..."
fi
if ! npm install 2>&1 | tail -5; then
  error "npm install failed."
  rollback
  exit 1
fi
info "Dependencies ready"

# ── build ────────────────────────────────────────────────────────────────────
if [ "$AUTO" -eq 0 ]; then
  echo "  Building..."
fi
if ! npm run build 2>&1 | tail -20; then
  error "Build failed."
  rollback
  exit 1
fi
info "Build complete"

# ── restart pm2 ───────────────────────────────────────────────────────────────
if command -v pm2 &>/dev/null && pm2 describe movie-chat &>/dev/null 2>&1; then
  pm2 restart movie-chat --silent

  # Health check — wait for the server to respond
  HEALTH_OK=0
  for i in 1 2 3 4 5; do
    sleep 2
    if curl -sf -o /dev/null "http://localhost:${PORT:-3000}/api/setup/status" 2>/dev/null; then
      HEALTH_OK=1
      break
    fi
  done

  if [ "$HEALTH_OK" -eq 1 ]; then
    info "App restarted and healthy"
  else
    warn "App restarted but health check failed — check logs: pm2 logs movie-chat"
  fi
else
  warn "pm2 not running — start with:  npm run build && npm run start"
fi

# ── done ──────────────────────────────────────────────────────────────────────
if [ "$AUTO" -eq 0 ]; then
  echo ""
  echo -e "  ${BOLD}${GREEN}Movie Chat updated successfully!${RESET}"
  echo ""
else
  echo "[$(date '+%Y-%m-%d %H:%M')] Update complete."
fi
