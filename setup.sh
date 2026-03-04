#!/usr/bin/env bash
# Movie Chat — one-shot setup script
# Run: bash setup.sh
set -e

# ── colours ──────────────────────────────────────────────────────────────────
BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
RESET='\033[0m'

info()    { echo -e "  ${GREEN}✓${RESET}  $*"; }
warn()    { echo -e "  ${YELLOW}!${RESET}  $*"; }
error()   { echo -e "  ${RED}✗${RESET}  $*"; }
heading() { echo -e "\n${BOLD}$*${RESET}"; }
ask()     { echo -en "  ${BOLD}?${RESET}  $* [y/N] "; }

# ── header ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}  Movie Chat — setup${RESET}"
echo "  ─────────────────────────────────────────"

# ── 1. Node.js check ─────────────────────────────────────────────────────────
heading "1 / 3  Checking prerequisites"

if ! command -v node &>/dev/null; then
  error "Node.js is not installed."
  echo "       Install it from https://nodejs.org (v18 or later required)."
  exit 1
fi

NODE_VER=$(node -e "process.stdout.write(process.version.slice(1))")
NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)

if [ "$NODE_MAJOR" -lt 18 ]; then
  error "Node.js $NODE_VER found — v18 or later is required."
  echo "       Download a newer version from https://nodejs.org"
  exit 1
fi

info "Node.js $NODE_VER"

# ── 2. npm install ────────────────────────────────────────────────────────────
heading "2 / 3  Installing dependencies"

npm install --silent
info "Dependencies installed"

# ── 3. pm2 (optional) ────────────────────────────────────────────────────────
heading "3 / 3  Auto-start with pm2 (optional)"
echo "       pm2 keeps the app running and restarts it after crashes or reboots."
echo ""

ask "Set up pm2 auto-start?"
read -r REPLY
echo ""

if [[ "$REPLY" =~ ^[Yy]$ ]]; then
  # install pm2 if missing
  if ! command -v pm2 &>/dev/null; then
    echo "       Installing pm2 globally..."
    npm install -g pm2 --silent
    info "pm2 installed"
  else
    info "pm2 already installed ($(pm2 --version))"
  fi

  # start / restart
  if pm2 describe movie-chat &>/dev/null; then
    pm2 restart movie-chat --silent
    info "pm2 process restarted"
  else
    pm2 start ecosystem.config.js --silent
    info "pm2 process started"
  fi

  # save process list
  pm2 save --silent
  info "pm2 process list saved"

  echo ""
  warn "One more step — run the command below to register pm2 as a system service"
  warn "so it survives a reboot (copy-paste the output and run it):"
  echo ""
  echo "       pm2 startup"
  echo ""
else
  info "Skipped — start manually with:  npm run dev"
fi

# ── done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "  ${BOLD}${GREEN}All done!${RESET}"
echo ""
echo "  Next steps:"
echo "  ┌──────────────────────────────────────────────────────────────────┐"
echo "  │  1. Open  http://localhost:3000/settings                         │"
echo "  │  2. Add your API keys (OpenRouter, TMDB, OMDB)                   │"
echo "  │  3. Enter your Plex URL + token                                  │"
echo "  │  4. Set your Transmission URL and download/library directories   │"
echo "  │  5. Click Save and check the green status indicators             │"
echo "  └──────────────────────────────────────────────────────────────────┘"
echo ""
echo "  The app is available at  http://localhost:3000"
echo "  Full docs:               README.md"
echo ""
