#!/bin/bash
set -euo pipefail

cd /mnt/server

echo "[WorldView Egg] Installing prerequisites"
apt-get update
apt-get install -y \
  ca-certificates curl wget gnupg lsb-release software-properties-common apt-transport-https \
  unzip zip tar xz-utils jq git nano vim htop tree net-tools dnsutils iproute2 iputils-ping traceroute \
  ufw openssl build-essential make gcc g++ python3 python3-pip rsync nginx

NODE_MAJOR="${NODE_MAJOR:-22}"
if ! command -v node >/dev/null 2>&1 || ! node -v | grep -q "^v${NODE_MAJOR}"; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi

if [ ! -d .git ]; then
  rm -rf /mnt/server/* /mnt/server/.[!.]* /mnt/server/..?* || true
  git clone --branch "${REPO_BRANCH:-main}" "${REPO_URL}" /mnt/server
else
  git fetch --all
  git checkout "${REPO_BRANCH:-main}"
  git pull --ff-only
fi

npm install
npm run build

cat > /mnt/server/worldview.env <<EOF_ENV
PORT=${SERVER_PORT:-8787}
OPEN_SKY_POLL_MS=${OPEN_SKY_POLL_MS:-8000}
CELESTRAK_REFRESH_MS=${CELESTRAK_REFRESH_MS:-300000}
NODE_ENV=production
GOOGLE_MAPS_API_KEY=${GOOGLE_MAPS_API_KEY:-}
EOF_ENV

echo "[WorldView Egg] Installation complete"
