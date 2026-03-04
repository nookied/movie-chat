#!/usr/bin/env bash
# Movie Chat — uninstaller
# Run from inside the repo:  bash uninstall.sh
# Or remotely:  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/nookied/movie-chat/main/uninstall.sh)"
set -e

# ── colours ──────────────────────────────────────────────────────────────────
BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
RESET='\033[0m'

info()    { echo -e "  ${GREEN}✓${RESET}  $*"; }
warn()    { echo -e "  ${YELLOW}!${RESET}  $*"; }
heading() { echo -e "\n${BOLD}$*${RESET}"; }
ask()     { echo -en "  ${BOLD}?${RESET}  $* "; }

# ── header ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}  Movie Chat — uninstaller${RESET}"
echo "  ─────────────────────────────────────────"
echo ""
echo "  This will:"
echo "   • Stop and remove the pm2 process (if configured)"
echo "   • Optionally delete the app files and your config"
echo ""

ask "Are you sure you want to uninstall Movie Chat? [y/N]"
read -r REPLY
echo ""
if [[ ! "$REPLY" =~ ^[Yy]$ ]]; then
  echo "  Cancelled."
  echo ""
  exit 0
fi

# ── 1. pm2 ───────────────────────────────────────────────────────────────────
heading "Stopping pm2 process"

if command -v pm2 &>/dev/null && pm2 describe movie-chat &>/dev/null 2>&1; then
  pm2 stop movie-chat --silent 2>/dev/null || true
  pm2 delete movie-chat --silent 2>/dev/null || true
  pm2 save --silent 2>/dev/null || true
  info "pm2 process stopped and removed"
else
  warn "No pm2 process found — skipping"
fi

# ── 2. App files ──────────────────────────────────────────────────────────────
heading "Remove app files"

# Detect the install directory
if [ -f "$(pwd)/ecosystem.config.js" ]; then
  DETECTED_DIR="$(pwd)"
else
  DETECTED_DIR="$HOME/movie-chat"
fi

echo ""
ask "Delete the app folder ($DETECTED_DIR)? This removes the code AND your config. [y/N]"
read -r REPLY_DIR
echo ""

if [[ "$REPLY_DIR" =~ ^[Yy]$ ]]; then
  if [ -d "$DETECTED_DIR" ]; then
    rm -rf "$DETECTED_DIR"
    info "Deleted $DETECTED_DIR"
  else
    warn "Directory not found — nothing to delete"
  fi
else
  warn "App folder kept at $DETECTED_DIR"
  echo ""
  echo "  Your config is in:  $DETECTED_DIR/config.local.json"
  echo "  Delete it manually if you want to remove your API keys."
fi

# ── done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "  ${BOLD}${GREEN}Done.${RESET} Movie Chat has been uninstalled."
echo ""
echo "  Note: pm2 itself is still installed (it may be used by other apps)."
echo "  To remove it completely:  npm uninstall -g pm2"
echo ""
