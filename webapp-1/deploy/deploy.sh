#!/usr/bin/env bash
# Build the static export and rsync it to the target host.
# Usage: ./deploy/deploy.sh [ssh-host] [remote-dir]
#   defaults: oracle-2  /srv/lindentar/out
#
# Relies on the `oracle-2` alias in ~/.ssh/config. Does NOT touch DNS or TLS —
# see DEPLOY.md for the one-time server/web-server/DNS setup.
set -euo pipefail

HOST="${1:-oracle-2}"
REMOTE_DIR="${2:-/srv/lindentar/out}"

cd "$(dirname "$0")/.."

echo "▶ Building static export…"
npm run build

echo "▶ Syncing out/ → ${HOST}:${REMOTE_DIR}"
ssh "$HOST" "mkdir -p '${REMOTE_DIR}'"
rsync -az --delete out/ "${HOST}:${REMOTE_DIR}/"

echo "✓ Deployed. If using Caddy: 'sudo systemctl reload caddy'. nginx: 'sudo nginx -s reload'."
