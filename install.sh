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
heading "1 / 4  Checking prerequisites"

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
  if [ "$NODE_MAJOR" -lt 18 ]; then
    error "Node.js $NODE_VER found — v18 or later required. Download from https://nodejs.org"
    MISSING=1
  else
    info "Node.js $NODE_VER"
  fi
fi

[ "$MISSING" -eq 1 ] && exit 1

# ── 2. Install location ───────────────────────────────────────────────────────
heading "2 / 4  Choose install location"

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
heading "3 / 4  Installing dependencies"

npm install --silent
info "Dependencies installed"

# ── 4. pm2 (optional) ────────────────────────────────────────────────────────
heading "4 / 4  Auto-start with pm2 (optional)"
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

  echo ""
  warn "Almost done — run the command below once to make pm2 survive reboots"
  warn "(copy-paste the command it outputs and run it):"
  echo ""
  echo "       pm2 startup"
  echo ""
else
  echo "       Start the app manually at any time:"
  echo ""
  echo "       cd $INSTALL_DIR && npm run dev"
  echo ""
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
