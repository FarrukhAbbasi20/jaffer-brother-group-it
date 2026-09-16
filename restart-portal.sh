#!/bin/bash
# Idempotent production restart via PM2 (single instance on :3850).
set +e
SITE=/var/www/projecttrack_usr/data/www/projecttracker.jaffer.com
LOGDIR=/var/www/projecttrack_usr/data/logs
mkdir -p "$LOGDIR"
cd "$SITE" || exit 1

export PORT=3850
export NODE_ENV=production

# Stop leftover bare nohup processes from older deploys (do not touch other users' node apps).
if [ -f "$LOGDIR/projecttracker.pid" ]; then
  kill "$(cat "$LOGDIR/projecttracker.pid")" 2>/dev/null || true
  rm -f "$LOGDIR/projecttracker.pid"
fi
pkill -u "$(id -u)" -f "$SITE/server/index.js" 2>/dev/null || true
# Free the port if something else in this account still holds it.
fuser -k 3850/tcp 2>/dev/null || true
sleep 1

if command -v pm2 >/dev/null 2>&1; then
  pm2 delete projecttracker 2>/dev/null || true
  pm2 start "$SITE/ecosystem.config.cjs"
  pm2 save 2>/dev/null || true
  sleep 2
  pm2 describe projecttracker 2>/dev/null | head -40
else
  nohup node ./server/index.js >>"$LOGDIR/projecttracker-node.log" 2>&1 </dev/null &
  echo $! > "$LOGDIR/projecttracker.pid"
  sleep 2
  echo "PID=$(cat "$LOGDIR/projecttracker.pid") (nohup fallback)"
fi

curl -s -m 5 -o /dev/null -w "login=%{http_code}\n" http://127.0.0.1:3850/login
curl -s -m 5 -o /dev/null -w "health=%{http_code}\n" http://127.0.0.1:3850/api/health
ss -lntp 2>/dev/null | grep 3850 || netstat -lntp 2>/dev/null | grep 3850 || true
