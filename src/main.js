const MODES = ['Normal', 'CRT', 'NVG', 'FLIR', 'Anime'];
const modeBar = document.getElementById('modeBar');
const modeLabel = document.getElementById('modeLabel');
const locationLabel = document.getElementById('locationLabel');
const clockEl = document.getElementById('clock');
const airCountEl = document.getElementById('airCount');
const satCountEl = document.getElementById('satCount');

const Cesium = window.Cesium;
if (!Cesium) throw new Error('Cesium failed to load.');

let mode = 'CRT';
let viewer;
let aircraftLayer;
let satelliteLayer;
let aircraftMap = new Map();
let satelliteMap = new Map();

function setMode(m) {
  mode = m;
  modeLabel.textContent = `MODE: ${m.toUpperCase()}`;
  document.body.dataset.mode = m.toLowerCase();
}

MODES.forEach((m) => {
  const btn = document.createElement('button');
  btn.textContent = m;
  if (m === mode) btn.classList.add('active');
  btn.onclick = () => {
    setMode(m);
    document.querySelectorAll('.mode-bar button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
  };
  modeBar.appendChild(btn);
});

setMode(mode);
setInterval(() => {
  clockEl.textContent = new Date().toISOString().replace('T', ' ').slice(0, 19) + 'Z';
}, 500);

async function initCesium() {
  viewer = new Cesium.Viewer('cesiumContainer', {
    baseLayerPicker: false,
    timeline: false,
    animation: false,
    geocoder: false,
    terrain: Cesium.Terrain.fromWorldTerrain(),
    infoBox: false,
    selectionIndicator: true,
  });

  const googleMapsApiKey = window.WORLDVIEW_CONFIG?.googleMapsApiKey;
  if (!googleMapsApiKey || googleMapsApiKey.includes('REPLACE')) {
    console.warn('Set WORLDVIEW_CONFIG.googleMapsApiKey to enable Photorealistic 3D Tiles.');
  } else {
    const tileset = await Cesium.createGooglePhotorealistic3DTileset({ key: googleMapsApiKey });
    viewer.scene.primitives.add(tileset);
  }

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(-0.1276, 51.5072, 14000),
    duration: 0,
  });

  aircraftLayer = new Cesium.CustomDataSource('aircraft');
  satelliteLayer = new Cesium.CustomDataSource('satellites');
  viewer.dataSources.add(aircraftLayer);
  viewer.dataSources.add(satelliteLayer);

  connectFeed();
}

function upsertAircraft(entity) {
  const { id, position, meta } = entity;
  let e = aircraftMap.get(id);
  if (!e) {
    e = aircraftLayer.entities.add({
      id,
      point: { pixelSize: 5, color: Cesium.Color.CYAN.withAlpha(0.85) },
      label: { text: meta?.callsign || id.slice(-6), font: '10px monospace', fillColor: Cesium.Color.YELLOW, pixelOffset: new Cesium.Cartesian2(10, -8) },
    });
    aircraftMap.set(id, e);
  }
  e.position = Cesium.Cartesian3.fromDegrees(position.lon, position.lat, position.alt_m || 0);
}

function upsertSatellite(entity) {
  const { id, position, meta } = entity;
  let e = satelliteMap.get(id);
  if (!e) {
    e = satelliteLayer.entities.add({
      id,
      billboard: { image: Cesium.buildModuleUrl('Assets/Textures/maki/rocket.png'), scale: 0.7 },
      label: { text: meta?.name || id.slice(0, 12), font: '10px monospace', fillColor: Cesium.Color.LIME, pixelOffset: new Cesium.Cartesian2(8, -12) },
    });
    satelliteMap.set(id, e);
  }
  e.position = Cesium.Cartesian3.fromDegrees(position.lon, position.lat, position.alt_m || 0);
}

function connectFeed() {
  const wsUrl = window.WORLDVIEW_CONFIG?.wsUrl || `ws://${location.hostname}:8787/ws`;
  const ws = new WebSocket(wsUrl);

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);

    if (msg.type === 'aircraft_batch') {
      msg.entities.forEach(upsertAircraft);
      airCountEl.textContent = String(aircraftMap.size);
    }

    if (msg.type === 'satellite_batch') {
      msg.entities.forEach(upsertSatellite);
      satCountEl.textContent = String(satelliteMap.size);
    }
  };

  ws.onopen = () => {
    locationLabel.textContent = 'SECTOR: LIVE FEED CONNECTED';
  };

  ws.onclose = () => {
    locationLabel.textContent = 'SECTOR: FEED DISCONNECTED (RETRY IN 2S)';
    setTimeout(connectFeed, 2000);
  };
}

initCesium();
