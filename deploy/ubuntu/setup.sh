#!/usr/bin/env bash
set -euo pipefail

# Ubuntu 24.04+ bootstrap script for WorldViewerDupe
if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/ubuntu/setup.sh"
  exit 1
fi

APP_USER="worldview"
APP_DIR="/opt/worldviewer"
NODE_MAJOR="22"

apt-get update
apt-get install -y curl git build-essential nginx ufw

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi

id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash "$APP_USER"
mkdir -p "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm missing after node install" >&2
  exit 1
fi

npm install -g pm2

cp deploy/ubuntu/worldviewer-feed.service /etc/systemd/system/worldviewer-feed.service
cp deploy/ubuntu/worldviewer-web.service /etc/systemd/system/worldviewer-web.service
cp deploy/ubuntu/worldviewer-nginx.conf /etc/nginx/sites-available/worldviewer
ln -sf /etc/nginx/sites-available/worldviewer /etc/nginx/sites-enabled/worldviewer
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl daemon-reload
systemctl enable nginx worldviewer-feed.service worldviewer-web.service

ufw allow OpenSSH || true
ufw allow 'Nginx Full' || true

echo "Bootstrap complete."
echo "Next: clone repo to $APP_DIR, create /etc/worldviewer.env, then start services."
