#!/usr/bin/env bash
# Movie Chat — updater
# Manual:     bash update.sh  /  npm run update
# Auto (cron): bash update.sh --auto
set -e

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

# ── header ───────────────────────────────────────────────────────────────────
if [ "$AUTO" -eq 0 ]; then
  echo ""
  echo -e "${BOLD}  Movie Chat — update${RESET}"
  echo "  ─────────────────────────────────────────"
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

# ── pull ──────────────────────────────────────────────────────────────────────
git pull --quiet
info "Downloaded latest code"

# ── npm install (only if package.json changed) ────────────────────────────────
if git diff HEAD~1 HEAD --name-only 2>/dev/null | grep -q "package.json"; then
  [ "$AUTO" -eq 0 ] && echo "  package.json changed — updating dependencies..."
  npm install --silent
  info "Dependencies updated"
fi

# ── build (always required for production mode) ───────────────────────────────
[ "$AUTO" -eq 0 ] && echo "  Building..."
npm run build --silent
info "Build complete"

# ── restart pm2 ───────────────────────────────────────────────────────────────
if command -v pm2 &>/dev/null && pm2 describe movie-chat &>/dev/null 2>&1; then
  pm2 restart movie-chat --silent
  info "App restarted"
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
