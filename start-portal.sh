#!/bin/bash
# Prefer PM2 so a crash does not leave nginx with nothing on :3850.
set +e
SITE=/var/www/projecttrack_usr/data/www/projecttracker.jaffer.com
cd "$SITE" || exit 1
export PORT=3850
export NODE_ENV=production

if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe projecttracker >/dev/null 2>&1; then
    pm2 restart projecttracker --update-env
  else
    pm2 start "$SITE/ecosystem.config.cjs"
    pm2 save 2>/dev/null || true
  fi
  sleep 1
  pm2 describe projecttracker 2>/dev/null | head -25
  exit 0
fi

# Fallback if PM2 is unavailable
mkdir -p "$HOME/logs"
pkill -u "$(id -u)" -f "$SITE/server/index.js" 2>/dev/null || true
sleep 1
nohup node ./server/index.js >>"$HOME/logs/projecttracker-node.log" 2>&1 </dev/null &
echo $! > "$HOME/logs/projecttracker.pid"
echo STARTED:$(cat "$HOME/logs/projecttracker.pid") PORT=3850
