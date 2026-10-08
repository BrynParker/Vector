import { redact } from "./redact.js";
import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { installSecurity, allowedOrigin, boundedResponseText } from "./security.js";
import { VisitorStore } from "./visitor-state.js";
import { WebSocketServer } from "ws";
import { config } from "./config.js";
import { ReplayBuffer } from "./replay-buffer.js";
import { loadCache, saveCache } from "./cache-store.js";
import { catalogs, categoryList } from "./catalogs.js";
import {
  buildPowerSignals,
  buildIntelSummary,
  fetchDownDetectorSignals,
  fetchCryptoMarkets,
  fetchCyberKev,
  fetchGlobalNews,
  fetchMaritime,
  fetchWeatherAlerts,
  groupCctvByRegion,
  osintLookupTypes,
  runOsintLookup
} from "./intel-engine.js";
import {
  fetchAdsb,
  fetchAdsbLolAll,
  fetchAdsbLolMilitary,
  fetchCctv,
  fetchOpenSky,
  fetchSatellites,
  fetchSeismic,
  fetchTraffic
} from "./feeds.js";
import { appendLog, getLogFilePath, logError, logInfo, logWarn } from "./logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "..", "public");

const app = express();
installSecurity(app, { publicOrigin: process.env.PUBLIC_ORIGIN || "", trustProxy: process.env.TRUST_PROXY || "loopback" });
const visitorStore = new VisitorStore(config.auth.jwtSecret);
app.use('/api', visitorStore.middleware());
app.use(express.json({ limit: "128kb" }));
app.use(
  express.static(publicDir, {
    dotfiles: "deny",
    index: "index.html",
    etag: true,
    lastModified: true,
    maxAge: 0,
    setHeaders: (res, filePath) => {
      if (filePath.startsWith(path.join(publicDir, "assets") + path.sep)) {
        res.setHeader("Cache-Control", "public, max-age=3600");
        return;
      }
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.setHeader("Surrogate-Control", "no-store");
    }
  })
);

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 16384, perMessageDeflate: false,
  verifyClient: (info, done) => {
    const trusted = app.get('trust proxy fn')(info.req.socket.remoteAddress, 0);
    const protocol = info.secure || (trusted && info.req.headers['x-forwarded-proto'] === 'https') ? 'https' : 'http';
    const request = { protocol, get: name => info.req.headers[name] };
    const originOkay = !info.origin || allowedOrigin(request, info.origin, process.env.PUBLIC_ORIGIN || '');
    const visitor = visitorStore.fromRequest(info.req);
    if (!originOkay || !visitor || connected.size >= 200) return done(false, 403, 'Connection not permitted');
    info.req.visitor = visitor; done(true);
  }
});

const replay = new ReplayBuffer(config.app.replayHours * 60 * 60 * 1000);
const latest = {
  aircraft: [],
  satellites: [],
  seismic: [],
  traffic: [],
  cctv: [],
  maritime: [],
  downdetector: [],
  news: [],
  cyber: [],
  financeMarkets: [],
  weatherAlerts: [],
  power: []
};
const layerMeta = {
  aircraft: { updatedAt: null, stale: true },
  satellites: { updatedAt: null, stale: true },
  seismic: { updatedAt: null, stale: true },
  traffic: { updatedAt: null, stale: true },
  cctv: { updatedAt: null, stale: true },
  maritime: { updatedAt: null, stale: true },
  downdetector: { updatedAt: null, stale: true },
  news: { updatedAt: null, stale: true },
  cyber: { updatedAt: null, stale: true },
  financeMarkets: { updatedAt: null, stale: true },
  weatherAlerts: { updatedAt: null, stale: true },
  power: { updatedAt: null, stale: true }
};
let intelSummary = null;
const intelHistory = [];

const sceneState = {
  defaultMode: "crt",
  modes: ["default", "crt", "nvg", "flir", "anime"],
  categories: categoryList
};

const connected = new Set();
let markerLocation =
  Number.isFinite(config.map.markerLat) && Number.isFinite(config.map.markerLon)
    ? { lat: config.map.markerLat, lon: config.map.markerLon }
    : null;
let cachePersistTimer = null;
let aircraftBackoffUntilMs = 0;
let aircraftBackoffMs = 15000;
let lastAircraftWarnEmptyTs = 0;
function looksPlaceholder(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return true;
  return raw.startsWith("replace-with") || raw.includes("your-") || raw.includes("example");
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function haversineMiles(lat1, lon1, lat2, lon2) {
  const earthMiles = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthMiles * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeLocation(value) {
  const lat = Number(value?.lat);
  const lon = Number(value?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  const accuracyM = Number(value?.accuracyM);
  return {
    lat: Number(lat.toFixed(6)),
    lon: Number(lon.toFixed(6)),
    accuracyM: Number.isFinite(accuracyM)
      ? Math.max(0, Math.min(50000, Number(accuracyM.toFixed(1))))
      : null,
    source: value?.source || "browser",
    capturedAt: Number.isFinite(Number(value?.capturedAt))
      ? Number(value.capturedAt)
      : Date.now()
  };
}

function near(items, lat, lon, radiusMiles, mapper = (x) => x) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      const itemLat = Number(item.lat);
      const itemLon = Number(item.lon);
      if (!Number.isFinite(itemLat) || !Number.isFinite(itemLon)) return null;
      const distanceMiles = haversineMiles(lat, lon, itemLat, itemLon);
      if (distanceMiles > radiusMiles) return null;
      return {
        ...mapper(item),
        lat: itemLat,
        lon: itemLon,
        distanceMiles: Number(distanceMiles.toFixed(1))
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distanceMiles - b.distanceMiles);
}

function buildNearbyContext(lat, lon, radiusMiles, category) {
  const normalizedCategory = categoryList.includes(category) ? category : "geopolitical";
  const geo = catalogs.geopolitical;
  const fin = catalogs.finance;
  const infra = catalogs.infrastructure;
  const env = catalogs.environmental;

  const result = {
    category: normalizedCategory,
    radiusMiles,
    center: { lat, lon },
    geopolitics: {
      conflicts: near(geo.protests, lat, lon, radiusMiles, (x) => ({ id: x.id, title: x.title, type: "protest" })),
      sanctions: near(geo.sanctions, lat, lon, radiusMiles, (x) => ({ id: x.id, title: x.title, type: "sanction" })),
      cyberIocs: near(geo.cyberIocs, lat, lon, radiusMiles, (x) => ({ id: x.id, title: x.title, type: "cyber_ioc" })),
      militaryBases: near(geo.militaryBases, lat, lon, radiusMiles, (x) => ({ id: x.id, name: x.name, country: x.country })),
      nuclearSites: near(geo.nuclearSites, lat, lon, radiusMiles, (x) => ({ id: x.id, name: x.name, country: x.country })),
      chokepoints: near(geo.navalChokepoints, lat, lon, radiusMiles, (x) => ({ id: x.id, name: x.name, risk: x.risk })),
      news: near(latest.news, lat, lon, radiusMiles, (x) => ({ id: x.id, title: x.title, source: x.source || x.sourceTag || "news" })),
      flights: near(latest.aircraft, lat, lon, radiusMiles, (x) => ({ id: x.id, callsign: x.callsign || "UNKNOWN" })),
      satellites: near(latest.satellites, lat, lon, radiusMiles, (x) => ({ id: x.id, name: x.name || x.id })),
      navalVessels: near(latest.maritime, lat, lon, radiusMiles, (x) => ({ id: x.id, name: x.name, mmsi: x.mmsi || "" })),
      cyberKev: (latest.cyber || []).slice(0, 12).map((x) => ({ id: x.id, cve: x.cve, vendor: x.vendor }))
    },
    finance: {
      exchanges: near(fin.stockExchanges, lat, lon, radiusMiles, (x) => ({ id: x.id, name: x.name, city: x.city })),
      crypto: near(fin.cryptoHubs, lat, lon, radiusMiles, (x) => ({ id: x.id, name: x.name })),
      centralBanks: near(fin.centralBanks, lat, lon, radiusMiles, (x) => ({ id: x.id, name: x.name })),
      markets: (latest.financeMarkets || []).slice(0, 25)
    },
    infrastructure: {
      datacenters: near(infra.datacenters, lat, lon, radiusMiles, (x) => ({ id: x.id, name: x.name })),
      supplyChains: near(infra.supplyChains, lat, lon, radiusMiles, (x) => ({ id: x.id, name: x.name })),
      energy: near(infra.energySites, lat, lon, radiusMiles, (x) => ({ id: x.id, name: x.name })),
      submarineCables: near(infra.submarineCables, lat, lon, radiusMiles, (x) => ({ id: x.id, name: x.name })),
      outages: near(infra.outages, lat, lon, radiusMiles, (x) => ({ id: x.id, name: x.name, severity: x.severity })),
      downdetector: near(latest.downdetector, lat, lon, radiusMiles, (x) => ({
        id: x.id,
        service: x.service,
        reportCount: x.reportCount,
        outageStatus: x.outageStatus
      })),
      power: latest.power || []
    },
    environmental: {
      earthquakes: near(latest.seismic, lat, lon, radiusMiles, (x) => ({ id: x.id, mag: x.mag, place: x.place })),
      fires: near(env.fires, lat, lon, radiusMiles, (x) => ({ id: x.id, name: x.name })),
      volcanoes: near(env.volcanoes, lat, lon, radiusMiles, (x) => ({ id: x.id, name: x.name })),
      weather: near(latest.weatherAlerts, lat, lon, radiusMiles, (x) => ({ id: x.id, name: x.event || "Weather Alert", severity: x.severity })),
      faultLines: near(env.earthquakeFaults, lat, lon, radiusMiles, (x) => ({ id: x.id, name: x.name }))
    }
  };

  return result;
}

function broadcast(topic, payload) {
  const msg = JSON.stringify({ topic, payload, ts: Date.now() });
  replay.add(topic, payload);
  for (const ws of connected) {
    if (ws.bufferedAmount > 8*1024*1024) { ws.terminate(); continue; }
    if (ws.readyState === ws.OPEN) ws.send(msg);
  }
}

function sendVisitor(state, topic, payload) {
  const message = JSON.stringify({ topic, payload, ts: Date.now() });
  for (const ws of connected) if (ws.visitorId === state.id && ws.readyState === ws.OPEN) {
    if (ws.bufferedAmount > 8*1024*1024) ws.terminate(); else ws.send(message);
  }
}

function sampleLayer(items, maxCount) {
  const rows = Array.isArray(items) ? items : [];
  const limit = Math.max(1, Number(maxCount) || rows.length);
  if (rows.length <= limit) return rows;
  const bins = Array.from({ length: 36 }, () => []);
  for (const row of rows) {
    const lon = Number(row?.lon);
    if (!Number.isFinite(lon)) continue;
    const idx = Math.max(0, Math.min(35, Math.floor((lon + 180) / 10)));
    bins[idx].push(row);
  }
  const out = [];
  let cursor = 0;
  while (out.length < limit) {
    let progressed = false;
    for (let i = 0; i < bins.length; i += 1) {
      if (bins[i][cursor]) {
        out.push(bins[i][cursor]);
        progressed = true;
        if (out.length >= limit) break;
      }
    }
    if (!progressed) break;
    cursor += 1;
  }
  return out;
}

function trimOrbitPath(points, maxPoints) {
  const rows = Array.isArray(points) ? points : [];
  const limit = Math.max(8, Number(maxPoints) || rows.length);
  if (rows.length <= limit) return rows;
  const step = Math.ceil(rows.length / limit);
  const out = [];
  for (let i = 0; i < rows.length; i += step) out.push(rows[i]);
  const last = rows[rows.length - 1];
  if (last && out[out.length - 1] !== last) out.push(last);
  return out;
}

function serializeLayerForClient(layer, entities) {
  const rows = Array.isArray(entities) ? entities : [];
  if (layer === "aircraft") {
    return sampleLayer(rows, config.app.maxWsAircraft);
  }
  if (layer === "satellites") {
    const sampled = sampleLayer(rows, config.app.maxWsSatellites);
    return sampled.map((s) => ({
      ...s,
      orbitPath: trimOrbitPath(s.orbitPath, config.app.satelliteOrbitPathPoints)
    }));
  }
  if (layer === "maritime") {
    return sampleLayer(rows, config.app.maxWsMaritime);
  }
  return rows;
}

function clientLayersSnapshot() {
  const layers = {};
  const totals = {};
  for (const [layer, entities] of Object.entries(latest)) {
    layers[layer] = serializeLayerForClient(layer, entities);
    totals[layer] = Array.isArray(entities) ? entities.length : 0;
  }
  return { layers, totals };
}

function logFeedError(feed, error) {
  const detail = error?.cause?.message ? ` | cause=${error.cause.message}` : "";
  void logError(`[feed:${feed}] ${error.message}${detail}`);
}

function schedulePersistCache() {
  if (cachePersistTimer) return;
  cachePersistTimer = setTimeout(async () => {
    cachePersistTimer = null;
    try {
      await saveCache(config.app.cacheFilePath, {
        savedAt: Date.now(),
        encryptedVisitorSessions: visitorStore.encryptedSnapshot(),
        latest,
        layerMeta,
        intelSummary,
        intelHistory
      });
    } catch (error) {
      void logWarn(`[cache] failed to persist cache: ${error.message}`);
    }
  }, 300);
}

function updateLayer(layer, entities, options = {}) {
  const allowEmpty = options.allowEmpty ?? false;
  if (!Array.isArray(entities)) return false;
  if (!allowEmpty && entities.length === 0) return false;
  latest[layer] = entities;
  layerMeta[layer] = { updatedAt: Date.now(), stale: false };
  const clientEntities = serializeLayerForClient(layer, entities);
  broadcast("entity_updates", { layer, entities: clientEntities, total: entities.length });
  if (["seismic", "weatherAlerts", "traffic", "cctv", "downdetector"].includes(layer)) {
    recomputePowerSignals();
  }
  updateIntelSummaryState();
  schedulePersistCache();
  return true;
}

function markLayerStale(layer) {
  if (!layerMeta[layer]) return;
  layerMeta[layer].stale = true;
}

function updateIntelSummaryState() {
  intelSummary = buildIntelSummary(latest, catalogs, null, intelHistory);
  const maxPoints = Math.max(20, config.feeds.intel.metricsHistoryPoints);
  while (intelHistory.length > maxPoints) intelHistory.shift();
  broadcast("intel_summary", {
    summary: intelSummary,
    history: intelHistory
  });
  schedulePersistCache();
}

async function hydrateFromCache() {
  const cached = await loadCache(config.app.cacheFilePath);
  if (!cached) return;

  const cachedLatest = cached.latest || {};
  for (const key of Object.keys(latest)) {
    if (Array.isArray(cachedLatest[key]) && cachedLatest[key].length > 0) {
      latest[key] = cachedLatest[key];
    }
  }

  const cachedMeta = cached.layerMeta || {};
  for (const key of Object.keys(layerMeta)) {
    if (cachedMeta[key]) {
      layerMeta[key] = {
        updatedAt: cachedMeta[key].updatedAt ?? null,
        stale: true
      };
    }
  }

  if (cached.intelSummary && typeof cached.intelSummary === "object") {
    intelSummary = { ...cached.intelSummary, markerLocation: null };
  }
  if (Array.isArray(cached.intelHistory)) {
    intelHistory.length = 0;
    for (const point of cached.intelHistory.slice(-Math.max(20, config.feeds.intel.metricsHistoryPoints))) {
      intelHistory.push(point);
    }
  }

  // Legacy shared locations cannot be assigned to a specific visitor safely.
  visitorStore.restore(cached.encryptedVisitorSessions);

  void logInfo("[cache] hydrated last-known-good layer snapshots from disk.");
}

async function pollAircraft() {
  const now = Date.now();
  if (now < aircraftBackoffUntilMs) {
    return;
  }
  const combined = [];
  if (config.feeds.opensky.enabled) {
    try {
      combined.push(...(await fetchOpenSky(config.feeds.opensky)));
      aircraftBackoffMs = 15000;
    } catch (error) {
      const msg = String(error?.message || "");
      if (msg.includes("429")) {
        aircraftBackoffUntilMs = Date.now() + aircraftBackoffMs;
        aircraftBackoffMs = Math.min(5 * 60 * 1000, Math.round(aircraftBackoffMs * 1.6));
        void logWarn(`[feed:opensky] rate-limited. Backing off for ${Math.round((aircraftBackoffUntilMs - Date.now()) / 1000)}s`);
      }
      logFeedError("opensky", error);
    }
  }
  if (config.feeds.adsb.enabled) {
    try {
      combined.push(...(await fetchAdsb(config.feeds.adsb)));
    } catch (error) {
      logFeedError("adsb", error);
    }
    try {
      combined.push(...(await fetchAdsbLolMilitary(config.feeds.adsb)));
    } catch (error) {
      logFeedError("adsb-lol-military", error);
    }
  }
  if (combined.length === 0 && config.feeds.adsb.enabled) {
    try {
      combined.push(...(await fetchAdsbLolAll(config.feeds.adsb)));
    } catch (error) {
      logFeedError("adsb-lol-all", error);
    }
  }
  if (combined.length > 0) {
    const deduped = new Map();
    for (const item of combined) {
      const lat = Number(item?.lat);
      const lon = Number(item?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const idCandidate = String(item?.id || "").trim();
      const callsignCandidate = String(item?.callsign || "").trim();
      const key =
        idCandidate ||
        `${callsignCandidate || "unknown"}|${lat.toFixed(3)}|${lon.toFixed(3)}`;
      deduped.set(key, { ...item, id: key, lat, lon });
    }
    const normalized = Array.from(deduped.values()).sort((a, b) =>
      String(a.id).localeCompare(String(b.id))
    );
    updateLayer("aircraft", normalized);
    void logInfo(`[feed:aircraft] updated ${normalized.length} entities`);
  } else {
    markLayerStale("aircraft");
    if (Date.now() - lastAircraftWarnEmptyTs > 60000) {
      lastAircraftWarnEmptyTs = Date.now();
      void logWarn("[feed:aircraft] returned 0 entities");
    }
  }
}

async function pollSatellites() {
  if (!config.feeds.celestrak.enabled) return;
  try {
    const data = await fetchSatellites(config.feeds.celestrak, {
      count: config.feeds.celestrak.maxSatellites
    });
    updateLayer("satellites", data);
    void logInfo(`[feed:satellites] updated ${data.length} entities`);
    if (data.length === 0) {
      void logWarn("[feed:satellites] returned 0 entities");
    }
  } catch (error) {
    markLayerStale("satellites");
    logFeedError("satellites", error);
  }
}

async function pollSeismic() {
  if (!config.feeds.seismic.enabled) return;
  try {
    const data = await fetchSeismic(config.feeds.seismic);
    updateLayer("seismic", data);
  } catch (error) {
    markLayerStale("seismic");
    logFeedError("seismic", error);
  }
}

async function pollTraffic() {
  if (!config.feeds.traffic.enabled) return;
  try {
    const trafficConfig = {
      ...config.feeds.traffic,
      centerLat: markerLocation?.lat ?? config.feeds.traffic.centerLat,
      centerLon: markerLocation?.lon ?? config.feeds.traffic.centerLon
    };
    const data = await fetchTraffic(trafficConfig);
    updateLayer("traffic", data);
  } catch (error) {
    markLayerStale("traffic");
    logFeedError("traffic", error);
  }
}

async function pollCctv() {
  if (!config.feeds.cctv.enabled) return;
  try {
    const data = await fetchCctv(config.feeds.cctv);
    updateLayer("cctv", data);
  } catch (error) {
    markLayerStale("cctv");
    logFeedError("cctv", error);
  }
}

async function pollMaritime() {
  if (!config.feeds.intel.enabled) return;
  try {
    const data = await fetchMaritime(config.feeds.intel);
    if (data.length > 0) {
      updateLayer("maritime", data);
    } else {
      markLayerStale("maritime");
    }
  } catch (error) {
    markLayerStale("maritime");
    logFeedError("maritime", error);
  }
}

async function pollDownDetector() {
  if (!config.feeds.intel.enabled || !config.feeds.intel.downDetectorEnabled) return;
  try {
    const signals = await fetchDownDetectorSignals(config.feeds.intel);
    updateLayer("downdetector", signals, { allowEmpty: true });
  } catch (error) {
    markLayerStale("downdetector");
    logFeedError("downdetector", error);
  }
}

async function pollIntelNewsAndThreats() {
  if (!config.feeds.intel.enabled) return;
  try {
    const news = await fetchGlobalNews(config.feeds.intel);
    updateLayer("news", news, { allowEmpty: true });
  } catch (error) {
    markLayerStale("news");
    logFeedError("news", error);
  }

  try {
    const cyber = await fetchCyberKev(config.feeds.intel);
    updateLayer("cyber", cyber, { allowEmpty: true });
  } catch (error) {
    markLayerStale("cyber");
    logFeedError("cyber", error);
  }
}

async function pollFinanceMarkets() {
  if (!config.feeds.intel.enabled) return;
  try {
    const markets = await fetchCryptoMarkets(config.feeds.intel);
    updateLayer("financeMarkets", markets, { allowEmpty: true });
  } catch (error) {
    markLayerStale("financeMarkets");
    logFeedError("finance", error);
  }
}

async function pollWeatherAlerts() {
  if (!config.feeds.intel.enabled) return;
  try {
    const alerts = await fetchWeatherAlerts(config.feeds.intel);
    updateLayer("weatherAlerts", alerts, { allowEmpty: true });
  } catch (error) {
    markLayerStale("weatherAlerts");
    logFeedError("weather-alerts", error);
  }
}

function recomputePowerSignals() {
  try {
    const signal = buildPowerSignals(latest, catalogs);
    const power = [{ id: "power-global", ...signal }];
    updateLayer("power", power, { allowEmpty: true });
  } catch (error) {
    markLayerStale("power");
    logFeedError("power", error);
  }
}

function startPolling() {
  pollAircraft();
  pollSatellites();
  pollSeismic();
  pollTraffic();
  pollCctv();
  pollMaritime();
  pollDownDetector();
  pollIntelNewsAndThreats();
  pollFinanceMarkets();
  pollWeatherAlerts();
  recomputePowerSignals();
  updateIntelSummaryState();

  setInterval(pollAircraft, config.feeds.opensky.pollMs);
  setInterval(pollSatellites, config.feeds.celestrak.pollMs);
  setInterval(pollSeismic, config.feeds.seismic.pollMs);
  setInterval(pollTraffic, config.feeds.traffic.pollMs);
  setInterval(pollCctv, config.feeds.cctv.pollMs);
  setInterval(pollMaritime, config.feeds.intel.maritimePollMs);
  setInterval(pollDownDetector, config.feeds.intel.downDetectorPollMs);
  setInterval(pollIntelNewsAndThreats, config.feeds.intel.intelPollMs);
  setInterval(pollFinanceMarkets, config.feeds.intel.intelPollMs);
  setInterval(pollWeatherAlerts, config.feeds.intel.intelPollMs);
  setInterval(recomputePowerSignals, config.feeds.intel.analyticsPollMs);
  setInterval(updateIntelSummaryState, config.feeds.intel.analyticsPollMs);
}

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, uptimeS: process.uptime() });
});

app.get("/readyz", (_req, res) => {
  const ready = Boolean(config.auth.jwtSecret);
  res.status(ready ? 200 : 503).json({
    ready,
    hasJwtSecret: Boolean(config.auth.jwtSecret),
    hasGoogleMapsApiKey: Boolean(config.map.googleMapsApiKey)
  });
});

app.post("/api/client-log", async (req, res) => {
  if (process.env.CLIENT_LOGGING !== "true") return res.json({ ok: true });
  const scope = String(req.body?.scope || "client").replace(/[^a-z0-9_-]/gi, "").slice(0, 32);
  const line = String(req.body?.line || "").trim();
  if (!line) {
    res.status(400).json({ ok: false, error: "line required" });
    return;
  }
  await appendLog("CLIENT", `[${scope}] ${line.slice(0, 800)}`);
  res.json({ ok: true });
});

app.get("/api/config", (req, res) => {
  res.json({
    app: {
      name: "Vector"
    },
    map: {
      googleMapsApiKey: config.map.googleMapsApiKey,
      cesiumIonToken: config.map.cesiumIonToken
    },
    feeds: {
      satelliteProvider: config.feeds.celestrak.provider,

      maritimeProvider: config.feeds.intel.maritimeProvider,
      maritimeFeedConfigured: Boolean(config.feeds.intel.maritimeFeedUrl),
      downDetectorEnabled: config.feeds.intel.downDetectorEnabled,
      downDetectorServices: config.feeds.intel.downDetectorServices
    },
    scene: {
      ...sceneState,
      marker: req.visitor.marker,
      layerMeta
    },
    location: {
      hasUserLocation: Boolean(req.visitor.location),
      markerSource: req.visitor.location ? req.visitor.location.source : req.visitor.marker ? "manual" : null
    },
    osint: {
      lookupTypes: osintLookupTypes()
    }
  });
});

app.get("/api/catalogs", (_req, res) => {
  res.json({ catalogs, categories: categoryList });
});

app.get("/api/context", (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  const radiusMiles = Number(req.query.radiusMiles ?? 500);
  const category = String(req.query.category ?? "geopolitical");

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    res.status(400).json({ error: "lat and lon are required." });
    return;
  }

  const context = buildNearbyContext(lat, lon, radiusMiles, category);
  res.json(context);
});

app.get("/api/satellite-config", (_req, res) => {
  res.json({
    satelliteProvider: config.feeds.celestrak.provider
  });
});

app.get("/api/celestrak-url", (_req, res) => {
  res.json({
    satelliteProvider: config.feeds.celestrak.provider
  });
});

app.get("/api/intel/summary", (_req, res) => {
  if (!intelSummary) {
    updateIntelSummaryState();
  }
  res.json({
    summary: intelSummary,
    history: intelHistory
  });
});

app.get("/api/cctv/regions", (_req, res) => {
  res.json({
    regions: groupCctvByRegion(latest.cctv)
  });
});

app.get("/api/osint/types", (_req, res) => {
  res.json({
    types: osintLookupTypes()
  });
});

app.post("/api/osint/lookup", async (req, res) => {
  try {
    const result = await runOsintLookup(req.body || {}, {
      latest,
      catalogs,
      overpassUrl: config.feeds.traffic.overpassUrl,
      intelConfig: config.feeds.intel
    });
    res.json({
      ok: true,
      result
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: redact(error.message)
    });
  }
});

app.post("/api/overpass/query", async (req, res) => {
  const query = String(req.body?.query || "").trim();
  if (!query || query.length > 16384) {
    res.status(400).json({ ok: false, error: "query is required" });
    return;
  }
  const endpoints = [
    config.feeds.traffic.overpassUrl,
    ...String(config.feeds.traffic.overpassFallbackUrls || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  ];

  const attempts = [];
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Accept: "application/json"
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(25000)
      });
      if (!response.ok) {
        const sample = (await response.text()).slice(0, 150).replace(/\s+/g, " ");
        attempts.push(`${endpoint} -> HTTP ${response.status} ${sample}`);
        continue;
      }
      const data = JSON.parse(await boundedResponseText(response));
      res.json({ ok: true, data });
      return;
    } catch (error) {
      attempts.push(`${endpoint} -> ${error.message}`);
    }
  }

  res.status(502).json({
    ok: false,
    error: "Overpass query failed. Please retry later."
  });
});

app.get("/api/location", (req, res) => {
  res.json({ hasLocation: Boolean(req.visitor.location), location: req.visitor.location });
});

app.post("/api/location", async (req, res) => {
  const normalized = normalizeLocation({ ...req.body, source: "browser" });
  if (!normalized) return res.status(400).json({ error: "Invalid location coordinates." });
  req.visitor.location = normalized;
  req.visitor.marker = { lat: normalized.lat, lon: normalized.lon };
  // Browser location stays private; shared feeds retain their configured focus.
  sendVisitor(req.visitor, "location_update", { hasLocation: true, location: normalized });
  sendVisitor(req.visitor, "marker_update", req.visitor.marker);
  schedulePersistCache();
  await Promise.allSettled([pollSatellites(), pollTraffic()]);
  res.json({ ok: true, location: normalized, satellitesLoaded: latest.satellites.length });
});

app.delete("/api/location", (req, res) => {
  req.visitor.location = null; req.visitor.marker = null;
  sendVisitor(req.visitor, "location_update", { hasLocation: false, location: null });
  sendVisitor(req.visitor, "marker_update", null);
  schedulePersistCache(); res.json({ ok: true });
});

app.post("/api/marker", async (req, res) => {
  const lat = Number(req.body?.lat), lon = Number(req.body?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return res.status(400).json({ error: "Invalid marker coordinates." });
  req.visitor.marker = { lat, lon }; markerLocation = req.visitor.marker;
  sendVisitor(req.visitor, "marker_update", req.visitor.marker);
  schedulePersistCache();
  await Promise.allSettled([pollSatellites(), pollTraffic()]);
  res.json({ ok: true, marker: req.visitor.marker, satellitesLoaded: latest.satellites.length });
});

app.get("/api/marker", (req, res) => res.json({ marker: req.visitor.marker }));

app.get("/api/replay", (req, res) => {
  const from = Number.parseInt(String(req.query.from ?? ""), 10);
  const to = Number.parseInt(String(req.query.to ?? ""), 10);
  res.json({
    events: replay.query(from, to)
  });
});

wss.on("connection", (ws, req) => {
  ws.visitorId = req.visitor.id;
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });
  ws.on("error", () => ws.terminate());
  connected.add(ws);
  const snapshot = clientLayersSnapshot();
  ws.send(
    JSON.stringify({
      topic: "scene_state",
      payload: {
        ...sceneState,
        marker: req.visitor.marker,
        userLocation: req.visitor.location,
        layerMeta,
        layers: snapshot.layers,
        layerTotals: snapshot.totals,
        intelSummary,
        intelHistory
      },
      ts: Date.now()
    })
  );

  ws.on("close", () => connected.delete(ws));
});

const heartbeat = setInterval(() => {
  for (const ws of connected) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); }
}, 30000);
heartbeat.unref();
app.use((error, _req, res, _next) => {
  const status = error.status === 413 ? 413 : error instanceof SyntaxError ? 400 : 500;
  res.status(status).json({ error: status === 413 ? "Request is too large." : status === 400 ? "Invalid request body." : "Request could not be completed." });
});
server.requestTimeout = 30000;
server.headersTimeout = 15000;
server.keepAliveTimeout = 5000;

async function startServer() {
  await logInfo(`[boot] logging to ${getLogFilePath()}`);
  if (config.feeds.adsb.enabled && looksPlaceholder(config.feeds.adsb.url)) {
    if (config.feeds.adsb.adsbLolEnabled) {
      await logInfo("[config] ADSB_FEED_URL unset; using adsb.lol endpoints.");
    } else {
      await logWarn("[config] ADS-B feed enabled but ADSB_FEED_URL appears unset/placeholder.");
    }
  }
  if (config.feeds.opensky.enabled && (config.feeds.opensky.authMode || "none").toLowerCase() === "none") {
    await logWarn("[config] OpenSky running unauthenticated mode; rate limits may prevent global aircraft coverage.");
  }
  await hydrateFromCache();
  server.listen(config.app.port, config.app.host, () => {
    void logInfo(
      `[vector] running on http://${config.app.host}:${server.address().port} (env=${config.app.nodeEnv})`
    );
    if (process.env.NODE_ENV !== "test") startPolling();
  });
}

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(heartbeat);
  clearTimeout(cachePersistTimer);
  server.close();
  for (const ws of connected) ws.close(1001, "Server restarting");
  const deadline = setTimeout(() => process.exit(0), 5000);
  try {
    await saveCache(config.app.cacheFilePath, { savedAt: Date.now(), encryptedVisitorSessions: visitorStore.encryptedSnapshot(), latest, layerMeta, intelSummary, intelHistory });
  } catch (error) { await logWarn(`[shutdown] cache: ${error.message}`); }
  clearTimeout(deadline);
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

startServer().catch((error) => {
  void logError(`[startup] failed: ${error.message}`);
  process.exit(1);
});
