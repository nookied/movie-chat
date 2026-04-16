#!/usr/bin/env bash
# Movie Chat — remote installer
# Usage: /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/nookied/movie-chat/main/install.sh)"
set -e

REPO_URL="https://github.com/nookied/movie-chat.git"
DEFAULT_DIR="$HOME/movie-chat"

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

# ── header ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}  Movie Chat — installer${RESET}"
echo "  ─────────────────────────────────────────"

# ── 1. Prerequisites ──────────────────────────────────────────────────────────
heading "1 / 6  Checking prerequisites"

MISSING=0

if ! command -v git &>/dev/null; then
  error "git is not installed. Install it from https://git-scm.com and try again."
  MISSING=1
fi

if ! command -v node &>/dev/null; then
  error "Node.js is not installed. Install it from https://nodejs.org (v18+) and try again."
  MISSING=1
else
  NODE_VER=$(node -e "process.stdout.write(process.version.slice(1))")
  NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
  NODE_MINOR=$(echo "$NODE_VER" | cut -d. -f2)
  # Next.js 15 requires ^18.18.0 || ^19.8.0 || >=20.0.0
  NODE_OK=0
  if   [ "$NODE_MAJOR" -ge 20 ]; then NODE_OK=1
  elif [ "$NODE_MAJOR" -eq 19 ] && [ "$NODE_MINOR" -ge 8  ]; then NODE_OK=1
  elif [ "$NODE_MAJOR" -eq 18 ] && [ "$NODE_MINOR" -ge 18 ]; then NODE_OK=1
  fi
  if [ "$NODE_OK" -eq 0 ]; then
    error "Node.js $NODE_VER found — v18.18 or later required (v20+ recommended). Download from https://nodejs.org"
    MISSING=1
  else
    info "Node.js $NODE_VER"
  fi
fi

[ "$MISSING" -eq 1 ] && exit 1

# ── 2. Install location ───────────────────────────────────────────────────────
heading "2 / 6  Choose install location"

ask "Where should Movie Chat be installed? [${DEFAULT_DIR}]"
read -r INSTALL_DIR
INSTALL_DIR="${INSTALL_DIR:-$DEFAULT_DIR}"
# expand ~ manually in case the user typed it
INSTALL_DIR="${INSTALL_DIR/#\~/$HOME}"

if [ -d "$INSTALL_DIR/.git" ]; then
  warn "Directory already contains a git repo — pulling latest changes instead of cloning"
  git -C "$INSTALL_DIR" pull --quiet
  info "Updated to latest version"
elif [ -d "$INSTALL_DIR" ] && [ "$(ls -A "$INSTALL_DIR")" ]; then
  error "Directory $INSTALL_DIR already exists and is not empty."
  echo "       Choose a different location or remove it and try again."
  exit 1
else
  echo ""
  echo "       Cloning into $INSTALL_DIR ..."
  git clone --quiet "$REPO_URL" "$INSTALL_DIR"
  info "Cloned to $INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# ── 3. npm install ────────────────────────────────────────────────────────────
heading "3 / 6  Installing dependencies"

npm install --silent
info "Dependencies installed"

# ── 4. Build ──────────────────────────────────────────────────────────────────
heading "4 / 6  Building"

npm run build --silent
info "Build complete"

# ── 5. pm2 (optional) ────────────────────────────────────────────────────────
heading "5 / 6  Auto-start with pm2 (optional)"
echo "       pm2 keeps the app running and restarts it after crashes or reboots."
echo ""

ask "Set up pm2 auto-start? [y/N]"
read -r REPLY
echo ""

if [[ "$REPLY" =~ ^[Yy]$ ]]; then
  if ! command -v pm2 &>/dev/null; then
    echo "       Installing pm2 globally..."
    npm install -g pm2 --silent
    info "pm2 installed"
  else
    info "pm2 already installed ($(pm2 --version))"
  fi

  if pm2 describe movie-chat &>/dev/null; then
    pm2 restart movie-chat --silent
    info "pm2 process restarted"
  else
    pm2 start ecosystem.config.js --silent
    info "pm2 process started"
  fi

  pm2 save --silent
  info "pm2 process list saved"

  # register pm2 with the OS so it starts on reboot
  STARTUP_CMD=$(pm2 startup 2>&1 | grep "^sudo.*pm2")
  if [ -n "$STARTUP_CMD" ]; then
    echo "       Registering pm2 with system startup"
    echo "       Running: $STARTUP_CMD"
    echo "       (you may be prompted for your password)..."
    eval "$STARTUP_CMD"
    info "pm2 registered — will start automatically on reboot"
  else
    warn "Could not auto-register pm2 startup."
    warn "Run 'pm2 startup' manually and follow the instructions to survive reboots."
  fi
  echo ""
else
  echo "       Start the app manually at any time:"
  echo ""
  echo "       cd $INSTALL_DIR && npm run build && npm run start"
  echo ""
fi

# ── 6. auto-update cron (optional) ───────────────────────────────────────────
heading "6 / 6  Automatic updates (optional)"
echo "       Schedules a nightly check at 3 AM — pulls updates and restarts"
echo "       the app silently if a new version is available."
echo ""

ask "Set up automatic nightly updates? [y/N]"
read -r REPLY_UPDATE
echo ""

if [[ "$REPLY_UPDATE" =~ ^[Yy]$ ]]; then
  CRON_CMD="0 3 * * * cd \"$INSTALL_DIR\" && bash update.sh --auto >> \"$HOME/.movie-chat-update.log\" 2>&1"
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
echo "  Installed at:            $INSTALL_DIR"
echo "  Full docs:               $INSTALL_DIR/README.md"
echo ""
