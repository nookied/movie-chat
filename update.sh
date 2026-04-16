#!/usr/bin/env bash
# Movie Chat — updater
# Manual:     bash update.sh  /  npm run update
# Auto (cron): bash update.sh --auto
set -euo pipefail

AUTO=0
[[ "${1:-}" == "--auto" ]] && AUTO=1

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
    [ "$AUTO" -eq 1 ] && echo "[$(date '+%Y-%m-%d %H:%M')] Skipped — another update is already running (PID $OLD_PID)."
    [ "$AUTO" -eq 0 ] && warn "Another update is already running (PID $OLD_PID). Aborting."
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
if ! git diff --quiet HEAD 2>/dev/null; then
  if [ "$AUTO" -eq 1 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M')] Skipped — local modifications detected. Run manually to resolve."
    exit 1
  fi
  warn "You have local modifications:"
  git diff --stat
  echo ""
  ask "Stash them and continue? [Y/n]"
  read -r REPLY
  if [[ "$REPLY" =~ ^[Nn]$ ]]; then
    echo "  Cancelled." && echo ""
    exit 0
  fi
  git stash push -m "update.sh auto-stash $(date '+%Y-%m-%d %H:%M')"
  info "Changes stashed (restore later with: git stash pop)"
fi

# ── check for updates ─────────────────────────────────────────────────────────
git fetch --quiet

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "@{u}" 2>/dev/null || echo "")

if [ -z "$REMOTE" ]; then
  warn "No remote tracking branch — cannot check for updates."
  exit 1
fi

if [ "$LOCAL" = "$REMOTE" ]; then
  info "Already up to date."
  [ "$AUTO" -eq 0 ] && echo ""
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
if ! git pull --quiet; then
  error "git pull failed — possible merge conflict."
  rollback
  exit 1
fi
info "Downloaded latest code"

# ── npm install ──────────────────────────────────────────────────────────────
[ "$AUTO" -eq 0 ] && echo "  Installing dependencies..."
if ! npm install 2>&1 | tail -5; then
  error "npm install failed."
  rollback
  exit 1
fi
info "Dependencies ready"

# ── build ────────────────────────────────────────────────────────────────────
[ "$AUTO" -eq 0 ] && echo "  Building..."
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
