#!/bin/bash
set -euo pipefail

cd /mnt/server

export PORT="${SERVER_PORT:-${PORT:-8787}}"
export OPEN_SKY_POLL_MS="${OPEN_SKY_POLL_MS:-8000}"
export CELESTRAK_REFRESH_MS="${CELESTRAK_REFRESH_MS:-300000}"

if [[ -f /mnt/server/worldview.env ]]; then
  set -a
  # shellcheck disable=SC1091
  source /mnt/server/worldview.env
  set +a
fi

if [[ "${RUN_FRONTEND:-1}" == "1" ]]; then
  npm run preview -- --host 0.0.0.0 --port "${WEB_PORT:-4173}" &
fi

exec npm run server
