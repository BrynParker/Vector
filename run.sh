#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
export NODE_ENV="${NODE_ENV:-production}"
# dotenv loads private files without overriding Panel environment variables.
# SERVER_PORT is read first by the application, so allocations always win.
bash scripts/check-env.sh
if [[ ! -f node_modules/express/package.json ]]; then
  bash scripts/install-node-egg.sh
fi
exec node src/server.js
