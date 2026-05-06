#!/usr/bin/env bash
set -euo pipefail

# WorldViewer one-file installer for Ubuntu 26.04
# Supports host VM and Pterodactyl VPS egg environments.

APP_DIR="${APP_DIR:-/opt/worldviewer}"
APP_USER="${APP_USER:-worldview}"
REPO_URL="${REPO_URL:-}"
REPO_BRANCH="${REPO_BRANCH:-main}"
NODE_MAJOR="${NODE_MAJOR:-22}"
ENV_FILE="${ENV_FILE:-/etc/worldviewer.env}"
INSTALL_NGINX="${INSTALL_NGINX:-1}"
INSTALL_SYSTEMD="${INSTALL_SYSTEMD:-1}"

log(){ printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }
warn(){ printf '\033[1;33m[warn]\033[0m %s\n' "$1"; }
err(){ printf '\033[1;31m[err]\033[0m %s\n' "$1"; }

require_root() {
  if [[ ${EUID} -ne 0 ]]; then
    err "Run as root: sudo bash autorun.sh"
    exit 1
  fi
}

install_packages() {
  log "Installing Ubuntu packages"
  apt-get update
  apt-get install -y \
    ca-certificates curl wget gnupg lsb-release software-properties-common apt-transport-https \
    unzip zip tar xz-utils jq git nano vim htop tree net-tools dnsutils iproute2 iputils-ping traceroute \
    ufw openssl build-essential make gcc g++ python3 python3-pip rsync

  if [[ "$INSTALL_NGINX" == "1" ]]; then
    apt-get install -y nginx
  fi
}

install_node() {
  if ! command -v node >/dev/null 2>&1 || ! node -v | grep -q "^v${NODE_MAJOR}"; then
    log "Installing Node.js ${NODE_MAJOR}.x"
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
    apt-get install -y nodejs
  fi
  node -v
  npm -v
}

prepare_user_and_code() {
  log "Preparing runtime user + application directory"
  id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash "$APP_USER"
  mkdir -p "$APP_DIR"
  chown -R "$APP_USER:$APP_USER" "$APP_DIR"

  if [[ -n "$REPO_URL" ]]; then
    log "Cloning/updating repository from REPO_URL"
    if [[ -d "$APP_DIR/.git" ]]; then
      sudo -u "$APP_USER" -H bash -lc "cd '$APP_DIR' && git fetch --all && git checkout '$REPO_BRANCH' && git pull --ff-only"
    else
      rm -rf "$APP_DIR"
      sudo -u "$APP_USER" -H bash -lc "git clone --branch '$REPO_BRANCH' '$REPO_URL' '$APP_DIR'"
    fi
  else
    log "Using current repository checkout"
    cp -a . "$APP_DIR" || true
    chown -R "$APP_USER:$APP_USER" "$APP_DIR"
  fi

  log "Installing Node dependencies + build"
  sudo -u "$APP_USER" -H bash -lc "cd '$APP_DIR' && npm install && npm run build"
}

write_env() {
  log "Writing runtime environment file: $ENV_FILE"
  cat > "$ENV_FILE" <<'EOF_ENV'
PORT=8787
OPEN_SKY_POLL_MS=8000
CELESTRAK_REFRESH_MS=300000
NODE_ENV=production
EOF_ENV
  chmod 600 "$ENV_FILE"
}

write_services() {
  if [[ "$INSTALL_SYSTEMD" != "1" ]]; then
    warn "INSTALL_SYSTEMD=0, skipping systemd service setup"
    return
  fi

  if ! command -v systemctl >/dev/null 2>&1; then
    warn "systemctl not available (likely containerized egg). Skipping systemd files."
    return
  fi

  log "Installing systemd services"
  cat >/etc/systemd/system/worldviewer-feed.service <<EOF_SVC
[Unit]
Description=WorldViewer Feed Gateway
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/npm run server
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=${APP_DIR}

[Install]
WantedBy=multi-user.target
EOF_SVC

  cat >/etc/systemd/system/worldviewer-web.service <<EOF_SVC
[Unit]
Description=WorldViewer Web Preview
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/npm run preview -- --host 127.0.0.1 --port 4173
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=${APP_DIR}

[Install]
WantedBy=multi-user.target
EOF_SVC

  systemctl daemon-reload
  systemctl enable worldviewer-feed worldviewer-web
}

write_nginx() {
  if [[ "$INSTALL_NGINX" != "1" ]]; then
    warn "INSTALL_NGINX=0, skipping nginx setup"
    return
  fi

  if ! command -v nginx >/dev/null 2>&1; then
    warn "nginx not installed; skipping"
    return
  fi

  log "Configuring nginx reverse proxy"
  cat >/etc/nginx/sites-available/worldviewer <<'EOF_NGX'
server {
  listen 80;
  listen [::]:80;
  server_name _;

  location / {
    proxy_pass http://127.0.0.1:4173;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /ws {
    proxy_pass http://127.0.0.1:8787/ws;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
  }

  location /health {
    proxy_pass http://127.0.0.1:8787/health;
    proxy_set_header Host $host;
  }
}
EOF_NGX
  ln -sf /etc/nginx/sites-available/worldviewer /etc/nginx/sites-enabled/worldviewer
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
}

start_services() {
  if command -v systemctl >/dev/null 2>&1; then
    log "Starting services"
    [[ "$INSTALL_NGINX" == "1" ]] && systemctl enable nginx && systemctl restart nginx
    systemctl restart worldviewer-feed || true
    systemctl restart worldviewer-web || true
    systemctl status worldviewer-feed --no-pager || true
    systemctl status worldviewer-web --no-pager || true
  else
    warn "No systemctl detected (Pterodactyl container likely)."
    warn "Use egg startup command: cd ${APP_DIR} && npm run server"
  fi
}

main() {
  require_root
  install_packages
  install_node
  prepare_user_and_code
  write_env
  write_services
  write_nginx
  start_services

  log "Done"
  echo "For Pterodactyl egg startup command use: cd ${APP_DIR} && npm run server"
}

main "$@"
