# Vector

Vector is a real-time 3D world visualization application built with **CesiumJS** and **Google Photorealistic 3D Tiles**. It combines live global data feeds with an interactive 3D globe, allowing aircraft, satellites, and eventually other real-time information sources to be viewed together in a single spatial interface.

The application currently tracks live aircraft using **OpenSky** and satellites using **CelesTrak**. A Node.js backend retrieves and normalizes these feeds before streaming updates to connected clients through WebSockets.

Vector is designed as the foundation for a broader real-time global visualization platform, with future support planned for additional ADS-B feeds, traffic information, CCTV streams, accurate orbital propagation, and specialized visualization modes.

---

## Features

### Interactive 3D World

- CesiumJS-powered globe
- Google Photorealistic 3D Tiles
- Smooth global navigation
- Real-time entity rendering
- Support for multiple simultaneous data layers

### Live Aircraft Tracking

Aircraft positions are retrieved from the OpenSky network and continuously displayed on the globe.

The backend handles:

- OpenSky API polling
- Aircraft data normalization
- Position updates
- WebSocket broadcasting
- Frontend entity updates

### Satellite Tracking

Satellite information is retrieved from CelesTrak and rendered alongside aircraft.

Current functionality includes:

- CelesTrak TLE retrieval
- Automatic satellite dataset refreshes
- Live satellite position updates
- Satellite visualization on the Cesium globe

Satellite positioning currently uses a temporary orbital approximation system. Full **SGP4 propagation** is planned using `satellite.js`.

### Real-Time Feed Gateway

Vector includes a Node.js backend responsible for collecting and distributing live information.

The gateway provides:

- External API polling
- Data normalization
- WebSocket broadcasting
- Aircraft batch updates
- Satellite batch updates
- Application health monitoring

WebSocket endpoint:

```text
/ws
```

Health endpoint:

```text
/health
```

---

## Architecture

```text
                    DATA SOURCES
                         │
             ┌───────────┴───────────┐
             │                       │
         OpenSky                 CelesTrak
        Aircraft                 Satellites
             │                       │
             └───────────┬───────────┘
                         │
                         ▼
                NODE.JS FEED GATEWAY
                         │
              ┌──────────┼──────────┐
              │          │          │
           Polling   Normalization  Tracking
              │          │          │
              └──────────┴──────────┘
                         │
                         ▼
                     WebSocket
                         │
                         ▼
                  CESIUM FRONTEND
                         │
             ┌───────────┴───────────┐
             │                       │
          Aircraft                Satellites
             │                       │
             └───────────┬───────────┘
                         │
                         ▼
                INTERACTIVE 3D WORLD
```

---

## Project Structure

The primary application components are:

```text
server/index.js
```

Runs the WebSocket gateway and backend polling loops.

```text
server/adapters.js
```

Contains the OpenSky and CelesTrak adapters and normalizes incoming data.

```text
server/orbit.js
```

Handles the current temporary satellite orbit approximation.

```text
src/main.js
```

Creates the Cesium viewer and manages real-time aircraft and satellite entities.

```text
index.html
```

Contains the browser configuration and frontend entry point.

---

## Current Data Sources

| Source | Purpose | Status |
|---|---|---|
| OpenSky | Live aircraft positions | Implemented |
| CelesTrak | Satellite TLE data | Implemented |
| ADS-B Exchange | Additional aircraft data | Planned |
| Traffic Sources | Ground traffic visualization | Planned |
| CCTV Sources | Camera locations and streams | Planned |

---

## Current Status

### Implemented

- CesiumJS 3D globe
- Google Photorealistic 3D Tiles
- OpenSky aircraft polling
- CelesTrak satellite retrieval
- Backend feed normalization
- Continuous WebSocket communication
- `aircraft_batch` messages
- `satellite_batch` messages
- Live aircraft entity updates
- Live satellite entity updates
- Backend health endpoint
- Ubuntu deployment support
- Nginx reverse proxy support
- systemd services
- Custom Pterodactyl egg

### Planned

- ADS-B Exchange integration
- SGP4 orbital propagation
- Additional aircraft feeds
- Ground traffic visualization
- CCTV catalog integration
- CCTV stream projection
- Additional geographic data sources
- CRT visualization
- Night vision visualization
- FLIR visualization
- Additional post-processing shaders

---

# Installation

## Quick Installation

Vector includes an automated setup script for Ubuntu.

Run:

```bash
sudo bash autorun.sh
```

The script handles the primary application installation and deployment process.

### Optional Environment Variables

Installation behavior can be customized using environment variables:

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

---

# Local Development

Install Node.js dependencies:

```bash
npm install
```

Start the backend feed gateway:

```bash
npm run server
```

Start the development frontend:

```bash
npm run dev
```

---

# Configuration

Frontend configuration is located in `index.html`.

```html
window.WORLDVIEW_CONFIG = {
  googleMapsApiKey: "YOUR_GOOGLE_MAPS_API_KEY",
  wsUrl: "ws://localhost:8787/ws"
};
```

Replace:

```text
YOUR_GOOGLE_MAPS_API_KEY
```

with a valid Google Maps API key if Photorealistic 3D Tiles are being used.

---

## Backend Environment

Example backend configuration:

```env
PORT=8787
OPEN_SKY_POLL_MS=8000
CELESTRAK_REFRESH_MS=300000
NODE_ENV=production
```

---

# Pterodactyl Deployment

Vector includes a custom Pterodactyl egg designed around the `ysdragon/Pterodactyl-VPS-Egg` environment.

Included files:

```text
pterodactyl/egg/worldviewer_vps_egg.json
pterodactyl/scripts/install.sh
pterodactyl/scripts/run.sh
```

## What the Egg Does

The custom egg:

- Installs required system packages
- Installs Node.js
- Clones the repository
- Installs Node.js dependencies
- Builds the frontend
- Writes runtime environment values
- Starts the backend feed gateway
- Can optionally run the frontend preview server

---

## Importing the Egg

In Pterodactyl:

1. Navigate to **Nests → Import Egg**.
2. Upload:

```text
pterodactyl/egg/worldviewer_vps_egg.json
```

3. Create a new server using the imported egg.
4. Configure the required environment variables.

Required:

```text
REPO_URL
REPO_BRANCH
SERVER_PORT
```

Defaults:

```text
REPO_BRANCH=main
SERVER_PORT=8787
```

Optional:

```text
RUN_FRONTEND=1
WEB_PORT=4173
GOOGLE_MAPS_API_KEY
```

---

## Pterodactyl Runtime

When running inside an environment where `systemctl` is unavailable, the installer automatically skips host-level service configuration.

The backend can be started with:

```bash
cd /opt/worldviewer && npm run server
```

The custom Pterodactyl egg normally uses:

```bash
./run.sh
```

---

# Manual Ubuntu Deployment

The automated installer is recommended, but the application can also be configured manually.

## 1. Update Ubuntu

```bash
sudo -i

apt-get update
apt-get -y upgrade
apt-get -y dist-upgrade
apt-get -y autoremove --purge
apt-get -y autoclean

reboot
```

Reconnect after reboot:

```bash
sudo -i
```

---

## 2. Install Required Packages

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

## 3. Install Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -

apt-get install -y nodejs

node -v
npm -v
```

---

## 4. Install PM2

```bash
npm install -g pm2

pm2 -v
```

---

## 5. Create the Application User

```bash
id -u worldview >/dev/null 2>&1 || \
useradd --system --create-home --shell /bin/bash worldview

mkdir -p /opt/worldviewer

chown -R worldview:worldview /opt/worldviewer
```

---

## 6. Clone and Build Vector

Replace `<YOUR_GIT_URL>` with the repository URL.

```bash
sudo -u worldview -H bash -lc \
'cd /opt && git clone <YOUR_GIT_URL> worldviewer'
```

Install dependencies:

```bash
sudo -u worldview -H bash -lc \
'cd /opt/worldviewer && npm install'
```

Build the frontend:

```bash
sudo -u worldview -H bash -lc \
'cd /opt/worldviewer && npm run build'
```

The included deployment script can also be used:

```bash
sudo bash deploy/ubuntu/setup.sh
```

---

## 7. Create the Runtime Environment

Copy the included example:

```bash
sudo cp \
/opt/worldviewer/deploy/ubuntu/worldviewer.env.example \
/etc/worldviewer.env
```

Edit the configuration:

```bash
sudo nano /etc/worldviewer.env
```

Alternatively:

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

# systemd Configuration

## Feed Gateway

Create:

```text
/etc/systemd/system/worldviewer-feed.service
```

with:

```ini
[Unit]
Description=Vector Feed Gateway
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
```

---

## Frontend

Create:

```text
/etc/systemd/system/worldviewer-web.service
```

with:

```ini
[Unit]
Description=Vector Vite Preview Server
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
```

---

# Nginx Configuration

Create:

```text
/etc/nginx/sites-available/worldviewer
```

with:

```nginx
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
```

Enable the configuration:

```bash
ln -sf \
/etc/nginx/sites-available/worldviewer \
/etc/nginx/sites-enabled/worldviewer

rm -f /etc/nginx/sites-enabled/default

nginx -t
```

---

# Firewall Configuration

Allow SSH and web traffic:

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
```

Check the firewall:

```bash
ufw status
```

---

# Starting Vector

Reload systemd:

```bash
systemctl daemon-reload
```

Enable the services:

```bash
systemctl enable \
worldviewer-feed \
worldviewer-web \
nginx
```

Start the services:

```bash
systemctl restart \
worldviewer-feed \
worldviewer-web \
nginx
```

---

## Verify Services

Backend:

```bash
systemctl status worldviewer-feed --no-pager
```

Frontend:

```bash
systemctl status worldviewer-web --no-pager
```

Nginx:

```bash
systemctl status nginx --no-pager
```

---

## Health Check

Directly test the backend:

```bash
curl -sS http://127.0.0.1:8787/health
```

Test through Nginx:

```bash
curl -sS http://127.0.0.1/health
```

---

# Updating Vector

To update an existing installation:

```bash
sudo -i
```

Pull the latest code, reinstall dependencies, and rebuild:

```bash
sudo -u worldview -H bash -lc \
'cd /opt/worldviewer && git pull && npm install && npm run build'
```

Restart the application:

```bash
systemctl restart \
worldviewer-feed \
worldviewer-web \
nginx
```

---

# Ubuntu Version

Ubuntu **26.04 LTS** is the recommended default deployment platform for the project.

Ubuntu 24.04 LTS can also be used when:

- A hosting provider has not yet validated Ubuntu 26.04
- Internal infrastructure requires Ubuntu 24.04
- Required software explicitly supports 24.04 but not 26.04

An LTS release is recommended for production deployments instead of an interim Ubuntu release.

---

# Roadmap

Vector is intended to expand beyond aircraft and satellite tracking into a broader real-time world visualization platform.

Planned development includes:

### Aircraft

- Additional ADS-B providers
- ADS-B Exchange integration
- Improved aircraft metadata
- Additional tracking information

### Satellites

- Full SGP4 orbital propagation
- `satellite.js` integration
- Improved orbital paths
- Additional satellite metadata

### Ground Data

- Traffic visualization
- OpenStreetMap-based layers
- Additional geographic information
- Ground-based object tracking

### Cameras

- CCTV location catalogs
- Live stream integration
- Stream projection into the 3D environment

### Visualization

- CRT rendering
- Night vision
- FLIR / thermal visualization
- Custom Cesium post-processing
- Additional shader effects

### Data Platform

The long-term goal is to allow multiple independent real-time data sources to be ingested by the backend, normalized into a common format, and displayed as interactive layers within the same global 3D environment.
