#!/usr/bin/env bash
# One-time setup on the server:  cd ~/Trenches128LIVE && git pull && bash tools/install-autodeploy.sh
# Installs two systemd timers: updates every 5 minutes (when main changes and nobody is playing) and a backup at 04:30.
# Undo:  systemctl disable --now trench128-deploy.timer trench128-backup.timer
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Run this as root."; exit 1; }
REPO="$(cd "$(dirname "$0")/.." && pwd)"
chmod +x "$REPO/tools/autodeploy.sh" "$REPO/tools/backup.sh"
cat > /etc/systemd/system/trench128-deploy.service <<UNIT
[Unit]
Description=Trench 128: update from GitHub when nobody is playing
After=docker.service network-online.target
[Service]
Type=oneshot
ExecStart=$REPO/tools/autodeploy.sh
UNIT
cat > /etc/systemd/system/trench128-deploy.timer <<UNIT
[Unit]
Description=Trench 128: check for updates every 5 minutes
[Timer]
OnBootSec=3min
OnUnitActiveSec=5min
[Install]
WantedBy=timers.target
UNIT
cat > /etc/systemd/system/trench128-backup.service <<UNIT
[Unit]
Description=Trench 128: back up accounts and XP
After=docker.service
[Service]
Type=oneshot
ExecStart=$REPO/tools/backup.sh
UNIT
cat > /etc/systemd/system/trench128-backup.timer <<UNIT
[Unit]
Description=Trench 128: nightly backup
[Timer]
OnCalendar=*-*-* 04:30:00
Persistent=true
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now trench128-deploy.timer trench128-backup.timer
systemctl start trench128-backup.service || true
echo
echo "Done. Merged pull requests now go live by themselves within about 5 minutes once nobody is playing"
echo "(after 6 hours of waiting they go live anyway). Nightly backups go to /var/backups/trench128."
echo "See what happened:   journalctl -u trench128-deploy -n 20"
echo "Backups so far:      ls /var/backups/trench128"
