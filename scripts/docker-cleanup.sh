#!/bin/bash
# Weekly cleanup — removes Docker garbage and old system logs.
# Deploy to VPS: copy to /etc/cron.weekly/docker-cleanup and chmod +x

set -euo pipefail

LOG=/var/log/docker-cleanup.log

echo "=== $(date '+%Y-%m-%d %H:%M:%S') ===" >> "$LOG"

# Stopped containers
docker container prune -f >> "$LOG" 2>&1

# Dangling images (untagged layers)
docker image prune -f >> "$LOG" 2>&1

# Build cache older than 48h
docker builder prune -f --filter "until=48h" >> "$LOG" 2>&1

# System logs older than 14 days
journalctl --vacuum-time=14d >> "$LOG" 2>&1

# APT cache
apt-get autoremove -y -qq >> "$LOG" 2>&1
apt-get clean -qq >> "$LOG" 2>&1

echo "Done." >> "$LOG"
