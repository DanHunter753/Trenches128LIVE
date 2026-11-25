#!/usr/bin/env bash
# Trench 128 hands-free updates (run every 5 minutes by trench128-deploy.timer; see tools/install-autodeploy.sh).
# When main on GitHub has something new: wait until nobody is playing (at most 6 hours, then update anyway),
# then pull and rebuild. If the build fails, the running game is left as it was.
set -uo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"; cd "$REPO" || exit 1
STATE=${T128_STATE:-/var/lib/trench128}; mkdir -p "$STATE"
exec 9>"$STATE/deploy.lock"; flock -n 9 || exit 0          # never two at once
log() { echo "[deploy] $*"; }

git fetch -q origin main || { log "can't reach GitHub; trying again later"; exit 0; }
TARGET=$(git rev-parse origin/main)
[ -f "$STATE/built" ] || git rev-parse HEAD > "$STATE/built"       # first run: what's checked out is what's running
BUILT=$(cat "$STATE/built"); FAILED=$(cat "$STATE/failed" 2>/dev/null || true)
if [ "$TARGET" = "$BUILT" ]; then rm -f "$STATE/pending"; exit 0; fi
[ "$TARGET" = "$FAILED" ] && exit 0                                 # this version failed to build: wait for a newer one

[ -f "$STATE/pending" ] || { date +%s > "$STATE/pending"; log "update found: $(git log -1 --format=%s origin/main)"; }
waited=$(( $(date +%s) - $(cat "$STATE/pending") ))
players=$(docker compose exec -T game node -e "fetch('http://localhost:8080/health').then(r=>r.json()).then(j=>console.log(j.players|0)).catch(()=>console.log(0))" 2>/dev/null | tr -dc 0-9)
players=${players:-0}
if [ "$players" -gt 0 ] && [ "$waited" -lt 21600 ]; then log "$players playing; update waits (${waited}s so far)"; exit 0; fi

log "updating ${BUILT:0:7} -> ${TARGET:0:7} ($players playing)"
if [ "$(git rev-parse HEAD)" != "$TARGET" ]; then git merge -q --ff-only origin/main || { log "local changes block the update: run 'git status' in $REPO"; exit 1; }; fi
rm -f "$STATE/pending"
if docker compose up -d --build; then echo "$TARGET" > "$STATE/built"; rm -f "$STATE/failed"; log "updated to $(git log -1 --format='%h %s')";
else echo "$TARGET" > "$STATE/failed"; log "build failed; the game keeps running ${BUILT:0:7}. Merge a fix and it is tried again"; exit 1; fi
