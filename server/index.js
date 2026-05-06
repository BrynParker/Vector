import http from 'node:http';
import { WebSocketServer } from 'ws';
import { fetchOpenSky, fetchCelestrak } from './adapters.js';
import { approximateOrbitFromTle } from './orbit.js';

const PORT = process.env.PORT || 8787;
const OPEN_SKY_POLL_MS = Number(process.env.OPEN_SKY_POLL_MS || 8000);
const CELESTRAK_REFRESH_MS = Number(process.env.CELESTRAK_REFRESH_MS || 300000);

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server, path: '/ws' });
let satellites = [];

function broadcast(obj) {
  const payload = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(payload);
  }
}

async function refreshSatellites() {
  try {
    satellites = await fetchCelestrak(180);
    console.log(`Loaded ${satellites.length} satellites from CelesTrak.`);
  } catch (err) {
    console.error('CelesTrak refresh failed:', err.message);
  }
}

async function tickOpenSky() {
  try {
    const aircraft = await fetchOpenSky(800);
    broadcast({ type: 'aircraft_batch', entities: aircraft });
  } catch (err) {
    console.error('OpenSky poll failed:', err.message);
  }
}

function tickSatellites() {
  const now = Date.now();
  const positions = satellites.map((s) => ({
    id: s.id,
    source: s.source,
    kind: s.kind,
    ts: new Date(now).toISOString(),
    position: approximateOrbitFromTle(s.tle, now),
    meta: { name: s.tle.name },
  }));
  broadcast({ type: 'satellite_batch', entities: positions });
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'hello', now: new Date().toISOString() }));
});

await refreshSatellites();
setInterval(refreshSatellites, CELESTRAK_REFRESH_MS);
setInterval(tickOpenSky, OPEN_SKY_POLL_MS);
setInterval(tickSatellites, 1000);

tickOpenSky();

server.listen(PORT, () => {
  console.log(`WorldView feed gateway listening on :${PORT}`);
});
