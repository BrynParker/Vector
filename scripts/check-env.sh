#!/usr/bin/env bash
set -euo pipefail
command -v node >/dev/null 2>&1 || { echo "[vector] Node.js 22 or 24 is required." >&2; exit 1; }
node --input-type=module -e 'const major=Number(process.versions.node.split(".")[0]); if(major<22) {console.error("[vector] Use Node.js 22 or 24 LTS.");process.exit(1)}; const port=process.env.SERVER_PORT||process.env.APP_PORT||process.env.PORT||3000;if(!/^\d+$/.test(String(port))||port<1||port>65535){console.error("[vector] Invalid server port.");process.exit(1)}'
