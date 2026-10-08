import { fetchPublicMetadata } from "./safe-url.js";
import { promises as dns } from "node:dns";
import WebSocket from "ws";

const USER_AGENT = "Vector/1.0 (+https://pterodactyl.io)";

const toNumber = (value, fallback = null) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function round(value, places = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Number(n.toFixed(places));
}

function parseCsv(input) {
  return String(input || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseJsonOrDefault(value, fallback) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(String(value));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

export function haversineKm(lat1, lon1, lat2, lon2) {
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchJson(url, timeoutMs = 20000, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(`timeout ${timeoutMs}ms`), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        ...(init.headers || {})
      }
    });
    if (!response.ok) {
      const sample = (await response.text()).slice(0, 200).replace(/\s+/g, " ");
      throw new Error(`HTTP ${response.status} ${sample}`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchGlobalNews(config) {
  const params = new URLSearchParams({
    format: "json",
    mode: "ArtList",
    maxrecords: String(clamp(config.gdeltMaxRecords || 50, 5, 250)),
    timespan: config.gdeltTimespan || "6h",
    query: config.gdeltQuery || "(conflict OR protest OR sanctions OR cyber OR power OR military)"
  });
  const url = `${config.gdeltDocUrl}?${params.toString()}`;
  const payload = await fetchJson(url);
  const articles = Array.isArray(payload?.articles) ? payload.articles : [];
  return articles
    .map((a, idx) => {
      const lat = toNumber(a?.sourcecountry === "US" ? 39 : null);
      const lon = toNumber(a?.sourcecountry === "US" ? -98 : null);
      return {
        id: `gdelt-${idx}-${a?.url || a?.title || "unknown"}`,
        title: a?.title || "Untitled",
        url: a?.url || "",
        source: a?.domain || a?.sourcecountry || "GDELT",
        seendate: a?.seendate || "",
        socialimage: a?.socialimage || "",
        lat,
        lon,
        sourceTag: "gdelt",
        timestamp: Date.now()
      };
    })
    .filter((a) => a.title);
}

export async function fetchCyberKev(config) {
  const payload = await fetchJson(config.kevFeedUrl, 25000);
  const vulns = Array.isArray(payload?.vulnerabilities) ? payload.vulnerabilities : [];
  const now = Date.now();
  return vulns.slice(0, 150).map((v, idx) => ({
    id: v.cveID || `kev-${idx}`,
    cve: v.cveID || "",
    vendor: v.vendorProject || "Unknown",
    product: v.product || "Unknown",
    dueDate: v.dueDate || "",
    dateAdded: v.dateAdded || "",
    shortDescription: v.shortDescription || "",
    knownRansomwareCampaignUse: String(v.knownRansomwareCampaignUse || "Unknown"),
    source: "cisa-kev",
    timestamp: now
  }));
}

export async function fetchCryptoMarkets(config) {
  const params = new URLSearchParams({
    vs_currency: "usd",
    order: "market_cap_desc",
    per_page: "40",
    page: "1",
    sparkline: "true",
    price_change_percentage: "1h,24h,7d"
  });
  const url = `${config.coingeckoMarketsUrl}?${params.toString()}`;
  const coins = await fetchJson(url, 20000);
  const now = Date.now();
  return (Array.isArray(coins) ? coins : []).map((coin) => ({
    id: coin.id,
    symbol: coin.symbol,
    name: coin.name,
    currentPrice: toNumber(coin.current_price, 0),
    marketCap: toNumber(coin.market_cap, 0),
    volume: toNumber(coin.total_volume, 0),
    change24hPct: toNumber(coin.price_change_percentage_24h, 0),
    priceHistory7d: (coin.sparkline_in_7d?.price || []).filter(value => typeof value === "number" && Number.isFinite(value)),
    source: "coingecko",
    timestamp: now
  }));
}

export async function fetchWeatherAlerts(config) {
  const payload = await fetchJson(config.weatherAlertsUrl, 25000, {
    headers: {
      Accept: "application/geo+json, application/json"
    }
  });
  const features = Array.isArray(payload?.features) ? payload.features : [];
  return features
    .slice(0, 200)
    .map((f, idx) => {
      const coords = f?.geometry?.coordinates;
      let lon = null;
      let lat = null;
      if (Array.isArray(coords) && coords.length > 0) {
        const first = Array.isArray(coords[0]) ? coords[0][0] : coords[0];
        if (Array.isArray(first) && first.length >= 2) {
          lon = toNumber(first[0]);
          lat = toNumber(first[1]);
        }
      }
      return {
        id: f?.id || `wx-${idx}`,
        event: f?.properties?.event || "Weather Alert",
        severity: f?.properties?.severity || "Unknown",
        urgency: f?.properties?.urgency || "Unknown",
        areaDesc: f?.properties?.areaDesc || "",
        headline: f?.properties?.headline || "",
        sent: f?.properties?.sent || "",
        lat,
        lon,
        source: "weather.gov",
        timestamp: Date.now()
      };
    })
    .filter((x) => x.event);
}

export async function fetchMaritime(config) {
  const provider = String(config.maritimeProvider || "").toLowerCase();
  if (provider === "aisstream") {
    return fetchMaritimeFromAisStream(config);
  }
  if (!config.maritimeFeedUrl) return [];
  const payload = await fetchJson(config.maritimeFeedUrl, 20000);
  const rows = Array.isArray(payload?.vessels)
    ? payload.vessels
    : Array.isArray(payload)
      ? payload
      : [];
  return rows
    .slice(0, 1000)
    .map((v, idx) => ({
      id: String(v.id || v.mmsi || `vessel-${idx}`),
      name: v.name || v.callsign || `Vessel ${idx + 1}`,
      mmsi: v.mmsi || "",
      lon: toNumber(v.lon ?? v.longitude),
      lat: toNumber(v.lat ?? v.latitude),
      sog: toNumber(v.sog ?? v.speed, 0),
      cog: toNumber(v.cog ?? v.heading, 0),
      vesselType: v.type || v.vesselType || "unknown",
      source: "maritime",
      timestamp: Date.now()
    }))
    .filter((v) => v.lon !== null && v.lat !== null);
}

const AIS_POSITION_TYPES = new Set([
  "PositionReport",
  "StandardClassBPositionReport",
  "ExtendedClassBPositionReport",
  "BaseStationReport"
]);

const aisstreamState = {
  ws: null,
  lastConnectAttemptMs: 0,
  positions: new Map(),
  staticData: new Map(),
  lastError: "",
  connectedAtMs: 0
};

function parseAisMessage(raw) {
  const msg = raw?.Message || {};
  const messageType = String(raw?.MessageType || "").trim();
  const payload = messageType && msg[messageType] ? msg[messageType] : {};
  const meta = raw?.MetaData || {};
  const mmsiRaw = meta?.MMSI ?? payload?.UserID ?? payload?.MMSI;
  const mmsi = mmsiRaw !== undefined && mmsiRaw !== null ? String(mmsiRaw) : "";
  return { messageType, payload, meta, mmsi };
}

function decodeAisShipType(typeValue) {
  const code = Number(typeValue);
  if (!Number.isFinite(code)) return String(typeValue || "");
  if (code >= 20 && code < 30) return `WIG (${code})`;
  if (code >= 30 && code < 40) return `Fishing/Towing (${code})`;
  if (code >= 40 && code < 50) return `High-speed craft (${code})`;
  if (code >= 50 && code < 60) return `Pilot/Tug/Port vessel (${code})`;
  if (code >= 60 && code < 70) return `Passenger (${code})`;
  if (code >= 70 && code < 80) return `Cargo (${code})`;
  if (code >= 80 && code < 90) return `Tanker (${code})`;
  if (code >= 90 && code < 100) return `Other (${code})`;
  return `Type ${code}`;
}

function parseAisBoundingBoxes(config) {
  const parsed = parseJsonOrDefault(config.aisstreamBoundingBoxes, null);
  if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  return [[[-90, -180], [90, 180]]];
}

function parseAisMessageTypes(config) {
  const types = parseCsv(config.aisstreamMessageTypes);
  if (types.length > 0) return types;
  return [
    "PositionReport",
    "StandardClassBPositionReport",
    "ExtendedClassBPositionReport",
    "ShipStaticData"
  ];
}

function upsertAisStaticData(mmsi, payload = {}, meta = {}) {
  if (!mmsi) return;
  const existing = aisstreamState.staticData.get(mmsi) || {};
  aisstreamState.staticData.set(mmsi, {
    mmsi,
    name: payload?.Name || payload?.ShipName || meta?.ShipName || existing.name || "",
    callSign: payload?.CallSign || existing.callSign || "",
    imoNumber: payload?.ImoNumber || existing.imoNumber || "",
    shipType:
      decodeAisShipType(payload?.Type ?? payload?.ShipType) ||
      existing.shipType ||
      "",
    destination: payload?.Destination || existing.destination || "",
    eta: payload?.Eta || payload?.ETA || existing.eta || "",
    navStatus: payload?.NavigationalStatus || existing.navStatus || "",
    lastSeenMs: Date.now()
  });
}

function upsertAisPosition(mmsi, payload = {}, meta = {}) {
  if (!mmsi) return;
  const lat = toNumber(payload?.Latitude ?? payload?.Lat ?? meta?.latitude);
  const lon = toNumber(payload?.Longitude ?? payload?.Lon ?? meta?.longitude);
  if (lat === null || lon === null) return;

  const sogKnots = toNumber(payload?.Sog ?? payload?.SpeedOverGround);
  const cogDeg = toNumber(payload?.Cog ?? payload?.CourseOverGround);
  const trueHeading = toNumber(payload?.TrueHeading ?? payload?.Heading);
  const navStatus = payload?.NavigationalStatus || "";

  const existing = aisstreamState.positions.get(mmsi) || {};
  aisstreamState.positions.set(mmsi, {
    ...existing,
    mmsi,
    lat,
    lon,
    sogKnots,
    cogDeg,
    headingDeg: trueHeading,
    navStatus: navStatus || existing.navStatus || "",
    timestamp: Date.now(),
    source: "aisstream"
  });
}

function cleanupAisState(config) {
  const staleMs = Math.max(60_000, Number(config.aisstreamStaleMs || 1_800_000));
  const cutoff = Date.now() - staleMs;
  for (const [mmsi, row] of aisstreamState.positions.entries()) {
    if (Number(row.timestamp || 0) < cutoff) {
      aisstreamState.positions.delete(mmsi);
    }
  }
  for (const [mmsi, row] of aisstreamState.staticData.entries()) {
    if (Number(row.lastSeenMs || 0) < cutoff) {
      aisstreamState.staticData.delete(mmsi);
    }
  }
}

function aisSnapshot(config) {
  cleanupAisState(config);
  const maxVessels = Math.max(50, Number(config.aisstreamMaxVessels || 2000));
  const rows = [];
  for (const [mmsi, pos] of aisstreamState.positions.entries()) {
    const stat = aisstreamState.staticData.get(mmsi) || {};
    rows.push({
      id: String(mmsi),
      name: stat.name || `Vessel ${mmsi}`,
      mmsi: String(mmsi),
      imoNumber: stat.imoNumber || "",
      callsign: stat.callSign || "",
      destination: stat.destination || "",
      vesselType: stat.shipType || "unknown",
      navStatus: pos.navStatus || stat.navStatus || "unknown",
      lon: pos.lon,
      lat: pos.lat,
      sog: pos.sogKnots ?? 0,
      cog: pos.cogDeg ?? 0,
      heading: pos.headingDeg ?? null,
      source: "aisstream",
      timestamp: pos.timestamp || Date.now()
    });
  }
  rows.sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
  return rows.slice(0, maxVessels);
}

function ensureAisConnection(config) {
  if (aisstreamState.ws && (aisstreamState.ws.readyState === WebSocket.OPEN || aisstreamState.ws.readyState === WebSocket.CONNECTING)) {
    return;
  }
  const now = Date.now();
  const reconnectMs = Math.max(5000, Number(config.aisstreamReconnectMs || 10000));
  if (now - aisstreamState.lastConnectAttemptMs < reconnectMs) return;
  aisstreamState.lastConnectAttemptMs = now;

  const apiKey = String(config.aisstreamApiKey || "").trim();
  if (!apiKey) {
    aisstreamState.lastError = "AISSTREAM_API_KEY missing";
    return;
  }

  const wsUrl = String(config.aisstreamUrl || "wss://stream.aisstream.io/v0/stream");
  const ws = new WebSocket(wsUrl);
  aisstreamState.ws = ws;

  ws.on("open", () => {
    aisstreamState.connectedAtMs = Date.now();
    const subscription = {
      APIKey: apiKey,
      BoundingBoxes: parseAisBoundingBoxes(config),
      FiltersMessageTypes: parseAisMessageTypes(config)
    };
    const vesselMmsi = parseCsv(config.aisstreamVesselMmsi).map((x) => Number(x)).filter(Number.isFinite);
    if (vesselMmsi.length > 0) {
      subscription.FiltersShipMMSI = vesselMmsi;
    }
    ws.send(JSON.stringify(subscription));
  });

  ws.on("message", (buf) => {
    try {
      const text = typeof buf === "string" ? buf : buf.toString("utf8");
      const raw = JSON.parse(text);
      const { messageType, payload, meta, mmsi } = parseAisMessage(raw);
      if (!messageType || !mmsi) return;
      if (messageType === "ShipStaticData") upsertAisStaticData(mmsi, payload, meta);
      if (AIS_POSITION_TYPES.has(messageType)) upsertAisPosition(mmsi, payload, meta);
    } catch (error) {
      aisstreamState.lastError = error.message;
    }
  });

  ws.on("error", (error) => {
    aisstreamState.lastError = error.message;
  });

  ws.on("close", () => {
    aisstreamState.ws = null;
  });
}

async function fetchMaritimeFromAisStream(config) {
  ensureAisConnection(config);
  const snapshot = aisSnapshot(config);
  return snapshot;
}

function parseArrayPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function parseCoordinates(input) {
  if (!input || typeof input !== "object") return { lat: null, lon: null };
  const lat = toNumber(
    input.lat ??
      input.latitude ??
      input.location_lat ??
      input.locationLat ??
      input?.location?.lat ??
      input?.location?.latitude
  );
  const lon = toNumber(
    input.lon ??
      input.lng ??
      input.long ??
      input.longitude ??
      input.location_lon ??
      input.locationLon ??
      input?.location?.lon ??
      input?.location?.lng ??
      input?.location?.longitude
  );
  return { lat, lon };
}

function computeOutageStatus(latestReports, peakReports) {
  if (latestReports >= 500 || peakReports >= 1000) return "critical";
  if (latestReports >= 200 || peakReports >= 500) return "elevated";
  if (latestReports >= 50 || peakReports >= 150) return "watch";
  return "stable";
}

async function fetchDownDetectorJson(baseUrl, path, token, timeoutMs = 25000) {
  const url = `${String(baseUrl).replace(/\/+$/, "")}${path}`;
  return fetchJson(url, timeoutMs, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

function aggregateLocationReports(rows, precision, cap, fallbackMeta) {
  const maxPoints = clamp(Number(cap || 200), 10, 1000);
  const rounded = clamp(Number(precision || 2), 1, 4);
  const buckets = new Map();
  for (const row of rows) {
    const { lat, lon } = parseCoordinates(row);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const keyLat = Number(lat.toFixed(rounded));
    const keyLon = Number(lon.toFixed(rounded));
    const key = `${keyLat}:${keyLon}`;
    const count =
      toNumber(row.count ?? row.report_count ?? row.reports ?? row.total, 1) || 1;
    const tsRaw =
      row.reported_at ??
      row.created_at ??
      row.updated_at ??
      row.timestamp ??
      row.time ??
      null;
    const ts =
      tsRaw && Number.isFinite(Date.parse(String(tsRaw)))
        ? Date.parse(String(tsRaw))
        : Date.now();
    if (!buckets.has(key)) {
      buckets.set(key, {
        lat: keyLat,
        lon: keyLon,
        reportCount: 0,
        samples: 0,
        newestTs: ts
      });
    }
    const bucket = buckets.get(key);
    bucket.reportCount += count;
    bucket.samples += 1;
    if (ts > bucket.newestTs) bucket.newestTs = ts;
  }

  const points = [...buckets.values()]
    .sort((a, b) => b.reportCount - a.reportCount)
    .slice(0, maxPoints)
    .map((point, idx) => ({
      id: `dd-${fallbackMeta.slug}-${idx}`,
      lat: point.lat,
      lon: point.lon,
      altitudeM: 12000 + clamp(point.reportCount * 16, 0, 42000),
      reportCount: point.reportCount,
      samples: point.samples,
      latestReportTs: point.newestTs,
      ...fallbackMeta
    }));

  if (points.length > 0) return points;

  if (
    Number.isFinite(fallbackMeta?.companyLat) &&
    Number.isFinite(fallbackMeta?.companyLon)
  ) {
    return [
      {
        id: `dd-${fallbackMeta.slug}-fallback`,
        lat: fallbackMeta.companyLat,
        lon: fallbackMeta.companyLon,
        altitudeM: 14000,
        reportCount: Math.max(1, toNumber(fallbackMeta.latestReports, 1) || 1),
        samples: 1,
        latestReportTs: Date.now(),
        ...fallbackMeta
      }
    ];
  }

  return [];
}

export async function fetchDownDetectorSignals(config) {
  if (!config?.downDetectorEnabled) return [];
  if (!config?.downDetectorApiToken) {
    throw new Error("DOWNDETECTOR_API_TOKEN is required when ENABLE_DOWNDETECTOR=true");
  }

  const baseUrl = config.downDetectorBaseUrl || "https://downdetectorapi.com/v2";
  const serviceQueries = parseCsv(config.downDetectorServices);
  const countryIsoFilter = String(config.downDetectorCountryIso || "")
    .trim()
    .toUpperCase();
  const allPoints = [];

  for (const query of serviceQueries.slice(0, 20)) {
    const searchPath =
      `/companies/search?query=${encodeURIComponent(query)}` +
      `&page=1&page_size=25`;
    let companyRows = [];
    try {
      const searchPayload = await fetchDownDetectorJson(
        baseUrl,
        searchPath,
        config.downDetectorApiToken
      );
      companyRows = parseArrayPayload(searchPayload);
    } catch (error) {
      console.warn(`[downdetector] company search failed for "${query}": ${error.message}`);
      continue;
    }
    if (companyRows.length === 0) continue;

    const ranked = companyRows
      .filter((row) => {
        if (!countryIsoFilter) return true;
        return String(row.country_iso || row.countryIso || "").toUpperCase() === countryIsoFilter;
      })
      .sort((a, b) => {
        const aName = String(a.name || a.slug || "").toLowerCase();
        const bName = String(b.name || b.slug || "").toLowerCase();
        const q = query.toLowerCase();
        const aExact = aName.includes(q) ? 1 : 0;
        const bExact = bName.includes(q) ? 1 : 0;
        return bExact - aExact;
      });
    const company = ranked[0] || companyRows[0];
    const companyId = toNumber(company.id);
    const countryId = toNumber(company.country_id ?? company.countryId);
    const slug = String(company.slug || "").trim();
    if (!companyId || !countryId || !slug) continue;

    let reports = [];
    try {
      const reportsPayload = await fetchDownDetectorJson(
        baseUrl,
        `/slugs/${encodeURIComponent(slug)}/reports?countries=${countryId}&companies=${companyId}`,
        config.downDetectorApiToken
      );
      reports = parseArrayPayload(reportsPayload);
    } catch {
      try {
        const reportsPayload = await fetchDownDetectorJson(
          baseUrl,
          `/slugs/${encodeURIComponent(slug)}/reports?companies=${companyId}`,
          config.downDetectorApiToken
        );
        reports = parseArrayPayload(reportsPayload);
      } catch (error) {
        console.warn(`[downdetector] reports unavailable for "${slug}": ${error.message}`);
      }
    }

    const reportCounts = reports
      .map((r) => toNumber(r.count ?? r.report_count ?? r.reports ?? r.total, null))
      .filter(Number.isFinite);
    const latestReports =
      reportCounts.length > 0 ? Number(reportCounts[reportCounts.length - 1]) : 0;
    const peakReports =
      reportCounts.length > 0 ? Math.max(...reportCounts) : latestReports;

    let locations = [];
    try {
      const pageSize = clamp(Number(config.downDetectorPageSize || 1000), 100, 5000);
      const locationPayload = await fetchDownDetectorJson(
        baseUrl,
        `/slugs/${encodeURIComponent(slug)}/locations?countries=${countryId}` +
          `&companies=${companyId}&page=1&page_size=${pageSize}`,
        config.downDetectorApiToken
      );
      locations = parseArrayPayload(locationPayload);
    } catch {
      try {
        const pageSize = clamp(Number(config.downDetectorPageSize || 1000), 100, 5000);
        const locationPayload = await fetchDownDetectorJson(
          baseUrl,
          `/slugs/${encodeURIComponent(slug)}/locations?companies=${companyId}&page=1&page_size=${pageSize}`,
          config.downDetectorApiToken
        );
        locations = parseArrayPayload(locationPayload);
      } catch (error) {
        console.warn(`[downdetector] locations unavailable for "${slug}": ${error.message}`);
      }
    }

    const companyLat = toNumber(company.lat ?? company.latitude);
    const companyLon = toNumber(company.lon ?? company.lng ?? company.longitude);
    const points = aggregateLocationReports(
      locations,
      config.downDetectorGeoPrecision,
      Math.ceil((config.downDetectorMaxMarkers || 200) / Math.max(serviceQueries.length, 1)),
      {
        source: "downdetector",
        service: company.name || query,
        slug,
        companyId,
        countryId,
        countryIso: company.country_iso || company.countryIso || "",
        latestReports,
        peakReports,
        outageStatus: computeOutageStatus(latestReports, peakReports),
        companyLat,
        companyLon,
        details: {
          service: company.name || query,
          slug,
          countryIso: company.country_iso || company.countryIso || "",
          latestReports,
          peakReports,
          samples: locations.length
        }
      }
    );
    allPoints.push(...points);
  }

  const maxMarkers = clamp(Number(config.downDetectorMaxMarkers || 200), 10, 1000);
  return allPoints
    .sort((a, b) => Number(b.reportCount || 0) - Number(a.reportCount || 0))
    .slice(0, maxMarkers)
    .map((item, idx) => ({
      ...item,
      id: item.id || `dd-${idx}`,
      timestamp: Date.now()
    }));
}

export function buildPowerSignals(latest, catalogs) {
  const outages = Array.isArray(catalogs?.infrastructure?.outages)
    ? catalogs.infrastructure.outages
    : [];
  const quakes = Array.isArray(latest?.seismic) ? latest.seismic : [];
  const alerts = Array.isArray(latest?.weatherAlerts) ? latest.weatherAlerts : [];
  const downSignals = Array.isArray(latest?.downdetector) ? latest.downdetector : [];
  const outageReports = downSignals.reduce(
    (sum, row) => sum + Math.max(0, Number(row.reportCount || 0)),
    0
  );
  const severeAlerts = alerts.filter((a) =>
    ["Severe", "Extreme"].includes(String(a.severity || "").trim())
  );
  const stressScore = clamp(
    outages.length * 8 +
      quakes.length * 0.9 +
      severeAlerts.length * 0.7 +
      Math.min(35, outageReports / 100),
    0,
    100
  );
  return {
    timestamp: Date.now(),
    outages: outages.length,
    severeWeatherAlerts: severeAlerts.length,
    downDetectorReports: outageReports,
    nearbyQuakes: quakes.length,
    stressScore: round(stressScore, 1),
    status:
      stressScore > 75
        ? "critical"
        : stressScore > 45
          ? "degraded"
          : stressScore > 20
            ? "elevated"
            : "nominal"
  };
}

export function buildClimateSignals(latest) {
  const quakes = Array.isArray(latest?.seismic) ? latest.seismic : [];
  const weatherAlerts = Array.isArray(latest?.weatherAlerts) ? latest.weatherAlerts : [];
  const avgMag =
    quakes.length > 0
      ? quakes.reduce((sum, q) => sum + Number(q.mag || 0), 0) / quakes.length
      : 0;
  const climateScore = clamp(avgMag * 10 + weatherAlerts.length * 0.5, 0, 100);
  return {
    timestamp: Date.now(),
    quakeCount: quakes.length,
    avgMagnitude: round(avgMag, 2),
    alertCount: weatherAlerts.length,
    climateRiskScore: round(climateScore, 1)
  };
}

export function buildGeoPoliticalSignals(latest, catalogs) {
  const geo = catalogs?.geopolitical || {};
  const flights = Array.isArray(latest?.aircraft) ? latest.aircraft.length : 0;
  const satellites = Array.isArray(latest?.satellites) ? latest.satellites.length : 0;
  const cyber = Array.isArray(latest?.cyber) ? latest.cyber.length : 0;
  const protests = Array.isArray(geo.protests) ? geo.protests.length : 0;
  const sanctions = Array.isArray(geo.sanctions) ? geo.sanctions.length : 0;
  const score = clamp(
    protests * 5 + sanctions * 6 + cyber * 0.12 + flights * 0.03 + satellites * 0.01,
    0,
    100
  );
  return {
    timestamp: Date.now(),
    flights,
    satellites,
    cyberKevItems: cyber,
    protests,
    sanctions,
    geopoliticsScore: round(score, 1)
  };
}

export function buildFinanceSignals(latest) {
  const markets = Array.isArray(latest?.financeMarkets) ? latest.financeMarkets : [];
  const changes = markets.map((m) => Number(m.change24hPct || 0)).filter(Number.isFinite);
  const avg24h = changes.length > 0 ? changes.reduce((a, b) => a + b, 0) / changes.length : 0;
  const volatility = clamp(Math.abs(avg24h) * 6, 0, 100);
  return {
    timestamp: Date.now(),
    trackedAssets: markets.length,
    average24hChangePct: round(avg24h, 3),
    volatilityScore: round(volatility, 1)
  };
}

export function buildIntelSummary(latest, catalogs, markerLocation, history = []) {
  const geopolitical = buildGeoPoliticalSignals(latest, catalogs);
  const finance = buildFinanceSignals(latest);
  const power = buildPowerSignals(latest, catalogs);
  const climate = buildClimateSignals(latest);

  const composite = round(
    clamp(
      geopolitical.geopoliticsScore * 0.35 +
        finance.volatilityScore * 0.2 +
        power.stressScore * 0.25 +
        climate.climateRiskScore * 0.2,
      0,
      100
    ),
    1
  );

  const point = {
    ts: Date.now(),
    compositeRisk: composite,
    geopolitical: geopolitical.geopoliticsScore,
    finance: finance.volatilityScore,
    infrastructure: power.stressScore,
    environmental: climate.climateRiskScore
  };
  history.push(point);
  return {
    timestamp: point.ts,
    markerLocation,
    score: {
      compositeRisk: composite,
      posture:
        composite > 75 ? "critical" : composite > 50 ? "elevated" : composite > 25 ? "guarded" : "stable"
    },
    categories: {
      geopolitical,
      finance,
      infrastructure: power,
      environmental: climate
    }
  };
}

function inferCctvRegion(label = "", lat, lon) {
  const l = String(label).toLowerCase();
  if (l.includes("baton rouge")) return "baton_rouge";
  if (l.includes("new orleans")) return "new_orleans";
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    if (lat >= 30.34 && lat <= 30.58 && lon >= -91.3 && lon <= -90.98) return "baton_rouge";
    if (lat >= 29.85 && lat <= 30.1 && lon >= -90.2 && lon <= -89.9) return "new_orleans";
  }
  return "other";
}

export function groupCctvByRegion(cctv = []) {
  const grouped = {};
  for (const cam of cctv) {
    const region =
      cam?.regionKey ||
      inferCctvRegion(cam?.label || "", Number(cam?.lat), Number(cam?.lon));
    if (!grouped[region]) grouped[region] = [];
    grouped[region].push(cam);
  }
  if (!grouped.other) grouped.other = [];
  return grouped;
}

async function lookupNearbyOverpass(lat, lon, radiusM, overpassUrl) {
  const radius = clamp(Number(radiusM || 5000), 250, 50000);
  const query = `
[out:json][timeout:25];
(
  node(around:${radius},${lat},${lon})["amenity"];
  node(around:${radius},${lat},${lon})["shop"];
  node(around:${radius},${lat},${lon})["office"];
);
out body 150;
`;
  const payload = await fetchJson(overpassUrl, 25000, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
    },
    body: `data=${encodeURIComponent(query)}`
  });
  const rows = Array.isArray(payload?.elements) ? payload.elements : [];
  return rows.slice(0, 150).map((el) => ({
    id: `${el.type}-${el.id}`,
    lat: toNumber(el.lat),
    lon: toNumber(el.lon),
    tags: el.tags || {},
    type: el.type
  }));
}

async function lookupDomainDns(domain) {
  const target = String(domain || "").trim().toLowerCase();
  if (!target) throw new Error("domain is required");
  const [a, aaaa, mx, ns, txt] = await Promise.allSettled([
    dns.resolve4(target),
    dns.resolve6(target),
    dns.resolveMx(target),
    dns.resolveNs(target),
    dns.resolveTxt(target)
  ]);
  return {
    domain: target,
    A: a.status === "fulfilled" ? a.value : [],
    AAAA: aaaa.status === "fulfilled" ? aaaa.value : [],
    MX: mx.status === "fulfilled" ? mx.value : [],
    NS: ns.status === "fulfilled" ? ns.value : [],
    TXT: txt.status === "fulfilled" ? txt.value.flat() : []
  };
}

async function lookupIp(ip) {
  const target = String(ip || "").trim();
  if (!target) throw new Error("ip is required");
  const data = await fetchJson(`https://ipapi.co/${encodeURIComponent(target)}/json/`, 15000);
  return {
    ip: data.ip || target,
    city: data.city || "",
    region: data.region || "",
    country: data.country_name || "",
    org: data.org || data.asn || "",
    latitude: toNumber(data.latitude),
    longitude: toNumber(data.longitude),
    timezone: data.timezone || ""
  };
}

async function lookupReverseGeocode(lat, lon) {
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
    `&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}`;
  const data = await fetchJson(url, 15000, {
    headers: {
      "User-Agent": USER_AGENT
    }
  });
  return {
    displayName: data.display_name || "",
    address: data.address || {},
    lat: toNumber(data.lat),
    lon: toNumber(data.lon)
  };
}

async function lookupDomainRdap(domain) {
  const target = String(domain || "").trim().toLowerCase();
  if (!target) throw new Error("domain is required");
  const data = await fetchJson(`https://rdap.org/domain/${encodeURIComponent(target)}`, 20000);
  const nameservers = Array.isArray(data?.nameservers)
    ? data.nameservers.map((n) => n?.ldhName).filter(Boolean)
    : [];
  const events = Array.isArray(data?.events) ? data.events : [];
  return {
    domain: target,
    handle: data?.handle || "",
    status: data?.status || [],
    nameservers,
    entities: Array.isArray(data?.entities) ? data.entities.length : 0,
    events: events.map((e) => ({ action: e?.eventAction || "", date: e?.eventDate || "" }))
  };
}

async function lookupEmailBreaches(email, apiKey) {
  const target = String(email || "").trim().toLowerCase();
  if (!target) throw new Error("email is required");
  if (!apiKey) throw new Error("HIBP_API_KEY is required for breach lookup.");
  const url =
    `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(target)}` +
    `?truncateResponse=false`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout 20000ms"), 20000);
  let response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "hibp-api-key": apiKey,
        "User-Agent": USER_AGENT
      }
    });
  } finally {
    clearTimeout(timeout);
  }
  if (response.status === 404) {
    return {
      email: target,
      breachCount: 0,
      breaches: []
    };
  }
  if (!response.ok) {
    const sample = (await response.text()).slice(0, 180).replace(/\s+/g, " ");
    throw new Error(`HIBP HTTP ${response.status} ${sample}`);
  }
  const data = await response.json();
  const breaches = Array.isArray(data) ? data : [];
  return {
    email: target,
    breachCount: breaches.length,
    breaches: breaches.map((b) => ({
      name: b?.Name || "",
      domain: b?.Domain || "",
      breachDate: b?.BreachDate || "",
      pwnCount: b?.PwnCount || 0,
      dataClasses: b?.DataClasses || []
    }))
  };
}

async function lookupVirusTotalDomain(domain, apiKey) {
  const target = String(domain || "").trim().toLowerCase();
  if (!target) throw new Error("domain is required");
  if (!apiKey) throw new Error("VIRUSTOTAL_API_KEY is required for domain reputation.");
  const data = await fetchJson(`https://www.virustotal.com/api/v3/domains/${encodeURIComponent(target)}`, 25000, {
    headers: {
      "x-apikey": apiKey
    }
  });
  const attrs = data?.data?.attributes || {};
  return {
    domain: target,
    reputation: attrs.reputation ?? 0,
    lastAnalysisStats: attrs.last_analysis_stats || {},
    categories: attrs.categories || {},
    lastDnsRecords: Array.isArray(attrs.last_dns_records) ? attrs.last_dns_records.slice(0, 20) : []
  };
}

async function lookupAbuseIpDb(ip, apiKey) {
  const target = String(ip || "").trim();
  if (!target) throw new Error("ip is required");
  if (!apiKey) throw new Error("ABUSEIPDB_API_KEY is required for abuse reputation.");
  const params = new URLSearchParams({
    ipAddress: target,
    maxAgeInDays: "90",
    verbose: "true"
  });
  const data = await fetchJson(`https://api.abuseipdb.com/api/v2/check?${params.toString()}`, 20000, {
    headers: {
      Key: apiKey,
      Accept: "application/json"
    }
  });
  return data?.data || data;
}

async function lookupHunterDomain(domain, apiKey) {
  const target = String(domain || "").trim().toLowerCase();
  if (!target) throw new Error("domain is required");
  if (!apiKey) throw new Error("HUNTER_API_KEY is required for Hunter domain search.");
  const params = new URLSearchParams({
    domain: target,
    api_key: apiKey
  });
  const data = await fetchJson(`https://api.hunter.io/v2/domain-search?${params.toString()}`, 20000);
  const domainData = data?.data || {};
  return {
    domain: target,
    organization: domainData.organization || "",
    pattern: domainData.pattern || "",
    emailCount: Array.isArray(domainData.emails) ? domainData.emails.length : 0,
    emails: Array.isArray(domainData.emails) ? domainData.emails.slice(0, 20) : []
  };
}

async function lookupShodanInternetDb(ip) {
  const target = String(ip || "").trim();
  if (!target) throw new Error("ip is required");
  return fetchJson(`https://internetdb.shodan.io/${encodeURIComponent(target)}`, 15000);
}

async function lookupShodanHost(ip, apiKey) {
  const target = String(ip || "").trim();
  if (!target) throw new Error("ip is required");
  if (!apiKey) return lookupShodanInternetDb(target);
  const url = `https://api.shodan.io/shodan/host/${encodeURIComponent(target)}?key=${encodeURIComponent(apiKey)}`;
  return fetchJson(url, 20000);
}

async function lookupUrlMetadata(urlInput) {
  const target = String(urlInput || "").trim();
  if (!target) throw new Error("url is required");
  return fetchPublicMetadata(target);
}

function nearWithDistance(items, lat, lon, radiusKm, mapRow = (x) => x) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const itemLat = Number(item.lat);
      const itemLon = Number(item.lon);
      if (!Number.isFinite(itemLat) || !Number.isFinite(itemLon)) return null;
      const distanceKm = haversineKm(lat, lon, itemLat, itemLon);
      if (distanceKm > radiusKm) return null;
      return {
        ...mapRow(item),
        distanceKm: round(distanceKm, 2)
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

function locationBrief(lat, lon, radiusKm, latest, catalogs) {
  return {
    aircraft: nearWithDistance(latest.aircraft, lat, lon, radiusKm, (x) => ({
      id: x.id,
      callsign: x.callsign || "UNKNOWN"
    })),
    satellites: nearWithDistance(latest.satellites, lat, lon, radiusKm, (x) => ({
      id: x.id,
      name: x.name || x.id
    })),
    maritime: nearWithDistance(latest.maritime, lat, lon, radiusKm, (x) => ({
      id: x.id,
      name: x.name
    })),
    cctv: nearWithDistance(latest.cctv, lat, lon, radiusKm, (x) => ({
      id: x.id,
      label: x.label
    })),
    conflicts: nearWithDistance(catalogs?.geopolitical?.protests, lat, lon, radiusKm, (x) => ({
      id: x.id,
      title: x.title
    })),
    outages: nearWithDistance(catalogs?.infrastructure?.outages, lat, lon, radiusKm, (x) => ({
      id: x.id,
      name: x.name,
      severity: x.severity || "unknown"
    })),
    quakes: nearWithDistance(latest.seismic, lat, lon, radiusKm, (x) => ({
      id: x.id,
      mag: x.mag,
      place: x.place || "Unknown"
    }))
  };
}

export function osintLookupTypes() {
  return [
    { id: "location_brief", label: "Location Brief", description: "Nearby flight/satellite/maritime/CCTV/conflict summary" },
    { id: "nearby_overpass", label: "Nearby OSM POI", description: "Active Overpass query for nearby amenities/shops/offices" },
    { id: "reverse_geocode", label: "Reverse Geocode", description: "Address and place metadata for coordinates" },
    { id: "domain_dns", label: "Domain DNS", description: "Live DNS resolution (A/AAAA/MX/NS/TXT)" },
    { id: "ip_lookup", label: "IP Intelligence", description: "IP geolocation and ASN/org context" },
    { id: "domain_rdap", label: "Domain RDAP", description: "Domain registration metadata via RDAP" },
    { id: "email_breaches_hibp", label: "Email Breach Check (HIBP)", description: "Checks breached accounts using HIBP v3 API key" },
    { id: "domain_reputation_vt", label: "Domain Reputation (VirusTotal)", description: "Domain reputation and detections via VirusTotal" },
    { id: "ip_reputation_abuseipdb", label: "IP Reputation (AbuseIPDB)", description: "IP abuse confidence and report history" },
    { id: "domain_hunter", label: "Domain Email Enrichment (Hunter)", description: "Domain email patterns and public contacts" },
    { id: "ip_exposure_shodan", label: "IP Exposure (Shodan InternetDB)", description: "Open ports/vulns/tags from InternetDB" },
    { id: "url_metadata", label: "URL Metadata", description: "Fetches page title, headers and response metadata" }
  ];
}

export async function runOsintLookup(input, ctx) {
  const type = String(input?.type || "").trim();
  const lat = Number(input?.lat);
  const lon = Number(input?.lon);
  const radiusKm = clamp(Number(input?.radiusKm || 150), 1, 1500);

  if (!type) throw new Error("type is required");

  if (type === "location_brief") {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error("lat and lon are required");
    return {
      type,
      lat,
      lon,
      radiusKm,
      results: locationBrief(lat, lon, radiusKm, ctx.latest, ctx.catalogs)
    };
  }

  if (type === "nearby_overpass") {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error("lat and lon are required");
    const points = await lookupNearbyOverpass(
      lat,
      lon,
      Number(input?.radiusM || 5000),
      ctx.overpassUrl
    );
    return { type, lat, lon, count: points.length, results: points };
  }

  if (type === "reverse_geocode") {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error("lat and lon are required");
    const result = await lookupReverseGeocode(lat, lon);
    return { type, lat, lon, result };
  }

  if (type === "domain_dns") {
    const result = await lookupDomainDns(input?.domain);
    return { type, result };
  }

  if (type === "ip_lookup") {
    const result = await lookupIp(input?.ip);
    return { type, result };
  }

  if (type === "domain_rdap") {
    const result = await lookupDomainRdap(input?.domain);
    return { type, result };
  }

  if (type === "email_breaches_hibp") {
    const result = await lookupEmailBreaches(
      input?.email,
      ctx?.intelConfig?.hibpApiKey
    );
    return { type, result };
  }

  if (type === "domain_reputation_vt") {
    const result = await lookupVirusTotalDomain(
      input?.domain,
      ctx?.intelConfig?.virusTotalApiKey
    );
    return { type, result };
  }

  if (type === "ip_reputation_abuseipdb") {
    const result = await lookupAbuseIpDb(
      input?.ip,
      ctx?.intelConfig?.abuseIpDbApiKey
    );
    return { type, result };
  }

  if (type === "domain_hunter") {
    const result = await lookupHunterDomain(
      input?.domain,
      ctx?.intelConfig?.hunterApiKey
    );
    return { type, result };
  }

  if (type === "ip_exposure_shodan") {
    const result = await lookupShodanHost(
      input?.ip,
      ctx?.intelConfig?.shodanApiKey
    );
    return { type, result };
  }

  if (type === "url_metadata") {
    const result = await lookupUrlMetadata(input?.url);
    return { type, result };
  }

  throw new Error(`unsupported lookup type: ${type}`);
}
