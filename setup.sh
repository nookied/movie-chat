#!/usr/bin/env bash
# Movie Chat — one-shot setup script
# Run: bash setup.sh
set -euo pipefail

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
heading "1 / 5  Checking prerequisites"

if ! command -v node &>/dev/null; then
  error "Node.js is not installed."
  echo "       Install Node.js 24 LTS (recommended) or 20 LTS from https://nodejs.org."
  exit 1
fi

NODE_VER=$(node -e "process.stdout.write(process.version.slice(1))")
NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
NODE_OK=0
if [ "$NODE_MAJOR" -eq 20 ] || [ "$NODE_MAJOR" -eq 24 ]; then NODE_OK=1; fi

if [ "$NODE_OK" -eq 0 ]; then
  error "Node.js $NODE_VER found — Movie Chat supports Node.js 20 LTS and 24 LTS (24 LTS recommended)."
  echo "       Download an LTS release from https://nodejs.org"
  exit 1
fi

info "Node.js $NODE_VER"

# ── 2. npm install ────────────────────────────────────────────────────────────
heading "2 / 5  Installing dependencies"

npm install --silent
info "Dependencies installed"

# ── 3. Build ─────────────────────────────────────────────────────────────────
heading "3 / 5  Building"

npm run build --silent
info "Build complete"

# ── 4. pm2 (optional) ────────────────────────────────────────────────────────
heading "4 / 5  Auto-start with pm2 (optional)"
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

  # register pm2 with the OS so it starts on reboot
  # pm2 startup prints a sudo command we can capture and run directly
  STARTUP_OUTPUT=$(pm2 startup 2>&1 || true)
  STARTUP_CMD=$(printf '%s\n' "$STARTUP_OUTPUT" | grep -m 1 "^sudo.*pm2" || true)
  if [ -n "$STARTUP_CMD" ]; then
    echo "       Registering pm2 with system startup"
    echo "       Running: $STARTUP_CMD"
    echo "       (you may be prompted for your password)..."
    eval "$STARTUP_CMD"
    info "pm2 registered — will start automatically on reboot"
  else
    [ -n "$STARTUP_OUTPUT" ] && echo "$STARTUP_OUTPUT"
    warn "Could not auto-register pm2 startup."
    warn "Run 'pm2 startup' manually and follow the instructions to survive reboots."
  fi
  echo ""
else
  info "Skipped — start manually with:  npm run start"
fi

# ── 5. auto-update cron (optional) ───────────────────────────────────────────
heading "5 / 5  Automatic updates (optional)"
echo "       Schedules a nightly check at 3 AM — pulls updates and restarts"
echo "       the app silently if a new version is available."
echo ""

ask "Set up automatic nightly updates?"
read -r REPLY_UPDATE
echo ""

INSTALL_DIR="$(pwd)"

if [[ "$REPLY_UPDATE" =~ ^[Yy]$ ]]; then
  CRON_CMD="0 3 * * * cd \"$INSTALL_DIR\" && bash update.sh --auto >> \"$HOME/.movie-chat-update.log\" 2>&1"
  # Add only if not already present
  if crontab -l 2>/dev/null | grep -qF "update.sh --auto"; then
    warn "A Movie Chat cron job already exists — skipping"
  else
    (crontab -l 2>/dev/null; echo "$CRON_CMD") | crontab -
    info "Cron job added (runs daily at 3:00 AM)"
    info "Update log:  $HOME/.movie-chat-update.log"
  fi
else
  info "Skipped — update manually any time with:  npm run update"
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
