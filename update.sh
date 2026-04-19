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
      echo "[$(date '+%Y-%m-%d %H:%M')] Skipped — Node.js is not installed."
    else
      error "Node.js is not installed. Install Node.js from https://nodejs.org and re-run."
    fi
    exit 1
  fi

  if [ "$AUTO" -eq 0 ]; then
    info "Node.js $(node --version | sed 's/^v//')"
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
  local ROLLBACK_LOG="$INSTALL_DIR/.update-rollback.log"
  error "Update failed — rolling back to previous version..."
  : > "$ROLLBACK_LOG"
  {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Rolling back to $ROLLBACK_SHA"
    git reset --hard "$ROLLBACK_SHA" || echo "git reset failed"
    # Use npm install (not ci) — node_modules may not match the rolled-back lockfile
    npm install || echo "npm install failed during rollback"
    npm run build || echo "npm run build failed during rollback"
  } >>"$ROLLBACK_LOG" 2>&1

  if command -v pm2 &>/dev/null && pm2 describe movie-chat &>/dev/null 2>&1; then
    pm2 restart movie-chat --update-env --silent 2>/dev/null || true
    warn "Rolled back and restarted previous version. See $ROLLBACK_LOG for details."
  else
    warn "Rolled back to $ROLLBACK_SHA. See $ROLLBACK_LOG for details, then start with: npm run build && npm run start"
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
# Use `npm ci` for reproducible installs — after git pull the lockfile matches
# package.json, and ci is faster + stricter than install. Fall back to install
# if ci fails (e.g. optional-dep platform quirk) so a bad lockfile doesn't
# brick the update.
if [ "$AUTO" -eq 0 ]; then
  echo "  Installing dependencies..."
fi
if ! npm ci 2>&1 | tail -5; then
  warn "npm ci failed — retrying with npm install..."
  if ! npm install 2>&1 | tail -5; then
    error "npm install failed."
    rollback
    exit 1
  fi
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
  # --update-env picks up any new env vars from the ecosystem file or shell;
  # plain restart reuses the previous env snapshot.
  pm2 restart movie-chat --update-env --silent

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
