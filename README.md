# WorldViewerDupe — Ubuntu 26.04 Pterodactyl Egg Install Guide

This document intentionally contains **only** the full install/setup process for running this project inside a **Pterodactyl egg** on **Ubuntu 26.04**, starting immediately after first VM boot.

---

## 1) First boot (root shell on fresh Ubuntu 26.04 VM)

```bash
sudo -i
apt-get update
apt-get -y upgrade
apt-get -y dist-upgrade
apt-get -y autoremove --purge
apt-get -y autoclean
reboot
```

Reconnect after reboot and become root again:

```bash
sudo -i
```

---

## 2) Install every package used by this setup (explicitly)

```bash
apt-get update
apt-get install -y \
  ca-certificates \
  curl \
  wget \
  gnupg \
  lsb-release \
  software-properties-common \
  apt-transport-https \
  unzip \
  zip \
  tar \
  xz-utils \
  jq \
  git \
  nano \
  vim \
  htop \
  tree \
  net-tools \
  dnsutils \
  iproute2 \
  iputils-ping \
  traceroute \
  ufw \
  openssl \
  build-essential \
  make \
  gcc \
  g++ \
  python3 \
  python3-pip \
  rsync \
  nginx
```

---

## 3) Install Node.js 22.x and npm

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
node -v
npm -v
```

---

## 4) Install PM2 globally

```bash
npm install -g pm2
pm2 -v
```

---

## 5) Create dedicated runtime user + app directory

```bash
id -u worldview >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash worldview
mkdir -p /opt/worldviewer
chown -R worldview:worldview /opt/worldviewer
```

---

## 6) Clone repository and install dependencies

Replace `<YOUR_GIT_URL>` with your repo URL.

```bash
sudo -u worldview -H bash -lc 'cd /opt && git clone <YOUR_GIT_URL> worldviewer'
sudo -u worldview -H bash -lc 'cd /opt/worldviewer && npm install'
sudo -u worldview -H bash -lc 'cd /opt/worldviewer && npm run build'
```

---

## 7) Create runtime environment file

```bash
cat >/etc/worldviewer.env <<'EOF_ENV'
PORT=8787
OPEN_SKY_POLL_MS=8000
CELESTRAK_REFRESH_MS=300000
NODE_ENV=production
EOF_ENV
chmod 600 /etc/worldviewer.env
```

---

## 8) Install systemd service files

### Feed gateway service

```bash
cat >/etc/systemd/system/worldviewer-feed.service <<'EOF_SVC'
[Unit]
Description=WorldViewer Feed Gateway
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=worldview
Group=worldview
WorkingDirectory=/opt/worldviewer
EnvironmentFile=/etc/worldviewer.env
ExecStart=/usr/bin/npm run server
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=/opt/worldviewer

[Install]
WantedBy=multi-user.target
EOF_SVC
```

### Frontend preview service

```bash
cat >/etc/systemd/system/worldviewer-web.service <<'EOF_SVC'
[Unit]
Description=WorldViewer Vite Preview Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=worldview
Group=worldview
WorkingDirectory=/opt/worldviewer
EnvironmentFile=/etc/worldviewer.env
ExecStart=/usr/bin/npm run preview -- --host 127.0.0.1 --port 4173
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=/opt/worldviewer

[Install]
WantedBy=multi-user.target
EOF_SVC
```

---

## 9) Install Nginx site configuration

```bash
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
```

---

## 10) Enable firewall rules

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
ufw status
```

---

## 11) Start services and verify

```bash
systemctl daemon-reload
systemctl enable worldviewer-feed worldviewer-web nginx
systemctl restart worldviewer-feed worldviewer-web nginx

systemctl status worldviewer-feed --no-pager
systemctl status worldviewer-web --no-pager
systemctl status nginx --no-pager
```

Check health endpoint:

```bash
curl -sS http://127.0.0.1:8787/health
curl -sS http://127.0.0.1/health
```

---

## 12) Pterodactyl egg startup command

Inside the Pterodactyl egg/server startup command, use:

```bash
npm run server
```

If you run the web frontend in the same egg process model, use a process manager/split strategy; otherwise keep web serving on host systemd+nginx and use the egg for feed service only.

---

## 13) Upgrade procedure (same Ubuntu 26.04 VM)

```bash
sudo -i
sudo -u worldview -H bash -lc 'cd /opt/worldviewer && git pull && npm install && npm run build'
systemctl restart worldviewer-feed worldviewer-web nginx
```
