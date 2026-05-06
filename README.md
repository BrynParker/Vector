# WorldViewerDupe

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

## Ubuntu VM Deployment (Ubuntu 24.04+)

1. Bootstrap machine dependencies and service templates:

```bash
sudo bash deploy/ubuntu/setup.sh
```

2. Clone repo and install app dependencies:

```bash
sudo -u worldview -H bash -lc 'cd /opt && git clone <YOUR_REPO_URL> worldviewer'
sudo -u worldview -H bash -lc 'cd /opt/worldviewer && npm install && npm run build'
```

3. Create environment file:

```bash
sudo cp /opt/worldviewer/deploy/ubuntu/worldviewer.env.example /etc/worldviewer.env
sudo nano /etc/worldviewer.env
```

4. Start services:

```bash
sudo systemctl daemon-reload
sudo systemctl restart worldviewer-feed worldviewer-web nginx
sudo systemctl status worldviewer-feed worldviewer-web nginx
```

The app is served through Nginx on port `80`, with `/ws` proxied to the WebSocket feed gateway on port `8787`.

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
