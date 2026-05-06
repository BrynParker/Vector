# WorldViewerDupe

## One-File Setup

Run everything with one command on Ubuntu 26.04:

```bash
sudo bash autorun.sh
```

### Optional environment variables

```bash
sudo REPO_URL="https://github.com/<you>/<repo>.git" \
     REPO_BRANCH="main" \
     APP_DIR="/opt/worldviewer" \
     APP_USER="worldview" \
     NODE_MAJOR="22" \
     INSTALL_NGINX="1" \
     INSTALL_SYSTEMD="1" \
     bash autorun.sh
```

### Pterodactyl VPS Egg compatibility

For the `ysdragon/Pterodactyl-VPS-Egg` flow, this script auto-detects if `systemctl` is unavailable and skips host-only service wiring. In that case, use this startup command in the egg:

```bash
cd /opt/worldviewer && npm run server
```

Cesium + Google Photorealistic 3D Tiles base app with a real server-side feed gateway for:

- OpenSky aircraft positions.
- CelesTrak satellite set + live position updates.

## Architecture (current)

- `server/index.js`: WebSocket gateway (`/ws`) and polling loops.
- `server/adapters.js`: OpenSky + CelesTrak adapters and normalization.
- `server/orbit.js`: temporary orbit approximation from TLE identity.
- `src/main.js`: Cesium viewer + real-time WebSocket layer updates.

## Configure

In `index.html`:

```html
window.WORLDVIEW_CONFIG = {
  googleMapsApiKey: "YOUR_GOOGLE_MAPS_API_KEY",
  wsUrl: "ws://localhost:8787/ws"
};
```

## Local Run

```bash
npm install
npm run server
npm run dev
```

## Ubuntu 26.04 Pterodactyl Egg — Full Install Guide

Step-by-step setup for running this project inside a **Pterodactyl egg** on **Ubuntu 26.04**, starting immediately after first VM boot.

---

### 1) First boot (root shell on fresh Ubuntu 26.04 VM)

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

### 2) Install every package used by this setup (explicitly)

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

### 3) Install Node.js 22.x and npm

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
node -v
npm -v
```

---

### 4) Install PM2 globally

```bash
npm install -g pm2
pm2 -v
```

---

### 5) Create dedicated runtime user + app directory

```bash
id -u worldview >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash worldview
mkdir -p /opt/worldviewer
chown -R worldview:worldview /opt/worldviewer
```

---

### 6) Clone repository and install dependencies

Replace `<YOUR_GIT_URL>` with your repo URL.

```bash
sudo -u worldview -H bash -lc 'cd /opt && git clone <YOUR_GIT_URL> worldviewer'
sudo -u worldview -H bash -lc 'cd /opt/worldviewer && npm install'
sudo -u worldview -H bash -lc 'cd /opt/worldviewer && npm run build'
```

Alternatively, use the provided bootstrap script:

```bash
sudo bash deploy/ubuntu/setup.sh
```

---

### 7) Create runtime environment file

```bash
sudo cp /opt/worldviewer/deploy/ubuntu/worldviewer.env.example /etc/worldviewer.env
sudo nano /etc/worldviewer.env
```

Or create it manually:

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

### 8) Install systemd service files

#### Feed gateway service

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

#### Frontend preview service

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

### 9) Install Nginx site configuration

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

### 10) Enable firewall rules

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
ufw status
```

---

### 11) Start services and verify

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

### 12) Pterodactyl egg startup command

Inside the Pterodactyl egg/server startup command, use:

```bash
npm run server
```

If you run the web frontend in the same egg process model, use a process manager/split strategy; otherwise keep web serving on host systemd+nginx and use the egg for feed service only.

---

### 13) Upgrade procedure

```bash
sudo -i
sudo -u worldview -H bash -lc 'cd /opt/worldviewer && git pull && npm install && npm run build'
systemctl restart worldviewer-feed worldviewer-web nginx
```

---

## Implemented now

- Real backend polling of OpenSky.
- Real backend refresh of CelesTrak TLE set.
- Continuous WebSocket push (`aircraft_batch`, `satellite_batch`).
- Frontend upsert of live aircraft/satellite entities on Cesium globe.

## Next integrations

- ADS-B Exchange adapter (server-side).
- SGP4 propagation (`satellite.js`) replacing approximation logic.
- OSM traffic particle layer.
- Austin CCTV catalog + stream projection layer.
- Post-process shader chain (CRT/NVG/FLIR/Anime as true shader passes).

## Ubuntu Version Recommendation (as of 2026-05-06)

If choosing from:

1. Ubuntu 22.04 LTS (Jammy)
2. Ubuntu 24.04 LTS (Noble)
3. Ubuntu 25.10 (Questing Quokka)
4. Ubuntu 26.04 LTS (Resolute Raccoon)

**Best default choice for this project: Ubuntu 26.04 LTS.**

Why:

- It is the latest LTS release (released April 23, 2026), so you get the newest stable kernel/userspace with long-term support.
- It avoids interim-release churn from 25.10 while being newer than 24.04.
- It gives the longest forward maintenance runway for a new deployment.

When to choose 24.04 instead:

- If your cloud provider image catalog or internal compliance baseline has not yet fully validated 26.04.
- If a vendor driver/toolchain you require explicitly certifies 24.04 but not yet 26.04.

Avoid 25.10 for production unless you specifically need an interim-only feature.
