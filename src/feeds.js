import * as satellite from "satellite.js";

const toNumber = (value, fallback = null) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const authHeader = (name, value) => (value ? { [name]: value } : {});
const looksPlaceholder = (v) =>
  !v || /^replace-with/i.test(String(v).trim()) || /your[-_ ]?(url|key)/i.test(String(v));

const openskyTokenState = {
  accessToken: null,
  expiresAtEpochMs: 0,
  tokenScopeKey: null
};

const nowMs = () => Date.now();

async function fetchOpenSkyToken(config) {
  const scopeKey = `${config.tokenUrl}|${config.clientId}`;
  const refreshSkewMs = 30_000;
  if (
    openskyTokenState.accessToken &&
    openskyTokenState.tokenScopeKey === scopeKey &&
    openskyTokenState.expiresAtEpochMs - refreshSkewMs > nowMs()
  ) {
    return openskyTokenState.accessToken;
  }

  if (!config.clientId || !config.clientSecret) {
    throw new Error(
      "OpenSky OAuth2 requires OPENSKY_CLIENT_ID and OPENSKY_CLIENT_SECRET."
    );
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.clientId,
    client_secret: config.clientSecret
  });

  const tokenResponse = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });

  if (!tokenResponse.ok) {
    throw new Error(`OpenSky token HTTP ${tokenResponse.status}`);
  }

  const tokenData = await tokenResponse.json();
  const accessToken = tokenData?.access_token;
  const expiresInSec = Number(tokenData?.expires_in ?? 1800);
  if (!accessToken) throw new Error("OpenSky token response missing access_token.");

  openskyTokenState.accessToken = accessToken;
  openskyTokenState.expiresAtEpochMs = nowMs() + expiresInSec * 1000;
  openskyTokenState.tokenScopeKey = scopeKey;
  return accessToken;
}

export async function fetchOpenSky(config) {
  const headers = {};

  const authMode = (config.authMode || "oauth2").toLowerCase();
  const hasOauthCreds =
    config.clientId &&
    config.clientSecret &&
    !looksPlaceholder(config.clientId) &&
    !looksPlaceholder(config.clientSecret);

  if ((authMode === "oauth2" && hasOauthCreds) || (hasOauthCreds && authMode !== "none")) {
    const bearer = await fetchOpenSkyToken(config);
    headers.Authorization = `Bearer ${bearer}`;
  } else if (config.username && config.password) {
    const token = Buffer.from(`${config.username}:${config.password}`).toString("base64");
    headers.Authorization = `Basic ${token}`;
  }

  const response = await fetch(config.url, { headers });
  if (!response.ok) throw new Error(`OpenSky HTTP ${response.status}`);

  const data = await response.json();
  const states = Array.isArray(data.states) ? data.states : [];
  return states
    .map((row) => {
      const callsign = (row[1] || "").trim();
      const lat = toNumber(row[6]);
      const lon = toNumber(row[5]);
      const fallbackId =
        row[0] ||
        `${callsign || "unknown"}|${(lat ?? 0).toFixed(3)}|${(lon ?? 0).toFixed(3)}`;
      return {
      id: fallbackId,
      callsign: (row[1] || "").trim(),
      originCountry: row[2] || "Unknown",
      lon,
      lat,
      altitudeM: toNumber(row[7]),
      onGround: Boolean(row[8]),
      velocityMps: toNumber(row[9]),
      headingDeg: toNumber(row[10]),
      verticalRate: toNumber(row[11]),
      source: "opensky",
      timestamp: Date.now()
    };
    })
    .filter((item) => item.lon !== null && item.lat !== null);
}

export async function fetchAdsb(config) {
  if (looksPlaceholder(config.url) || looksPlaceholder(config.apiKey)) return [];
  const response = await fetch(config.url, {
    headers: authHeader(config.authHeader, config.apiKey)
  });
  if (!response.ok) throw new Error(`ADSB HTTP ${response.status}`);

  const data = await response.json();
  const candidates = Array.isArray(data?.ac) ? data.ac : Array.isArray(data) ? data : [];
  return normalizeAdsbCandidates(candidates, "adsb");
}

function normalizeAdsbCandidates(candidates, sourceName = "adsb", forceMilitary = false) {
  return (Array.isArray(candidates) ? candidates : [])
    .map((a) => {
      const lat = toNumber(a.lat ?? a.latitude ?? a?.position?.lat);
      const lon = toNumber(a.lon ?? a.longitude ?? a?.position?.lon);
      const callsign = (a.flight || a.callsign || a.call || "").trim();
      const fallbackId =
        a.hex ||
        a.icao ||
        a.icao24 ||
        `${(callsign || sourceName).trim()}|${(lat ?? 0).toFixed(3)}|${(lon ?? 0).toFixed(3)}`;
      const altFeet =
        a.alt_geom !== undefined
          ? toNumber(a.alt_geom)
          : a.alt_baro !== undefined
            ? toNumber(a.alt_baro)
            : toNumber(a.altitude);
      return {
        id: fallbackId,
        callsign,
        lon,
        lat,
        altitudeM: Number.isFinite(altFeet) ? altFeet * 0.3048 : toNumber(a.altitudeM),
        headingDeg: toNumber(a.track ?? a.heading),
        velocityMps:
          a.gs !== undefined ? toNumber(a.gs) * 0.514444 : toNumber(a.speed),
        category: a.category || "unknown",
        military: Boolean(forceMilitary || a.mil || a.category === "A3"),
        source: sourceName,
        timestamp: Date.now()
      };
    })
    .filter((item) => item.lon !== null && item.lat !== null);
}

function buildUrl(base, pathPart) {
  const root = String(base || "").replace(/\/+$/, "");
  const path = String(pathPart || "").trim();
  if (!root || !path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${root}${path.startsWith("/") ? "" : "/"}${path}`;
}

async function fetchAdsbLolPath(config, pathPart, sourceName, forceMilitary = false) {
  const url = buildUrl(config.adsbLolBaseUrl, pathPart);
  if (!url) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(`timeout ${config.adsbLolTimeoutMs || 15000}ms`), config.adsbLolTimeoutMs || 15000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`ADSB.lol HTTP ${response.status} (${sourceName})`);
    const data = await response.json();
    const rows =
      Array.isArray(data?.ac) ? data.ac :
      Array.isArray(data?.aircraft) ? data.aircraft :
      Array.isArray(data) ? data :
      [];
    return normalizeAdsbCandidates(rows, sourceName, forceMilitary);
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchAdsbLolMilitary(config) {
  if (!config.adsbLolEnabled) return [];
  return fetchAdsbLolPath(config, config.adsbLolMilitaryPath, "adsb.lol-mil", true);
}

export async function fetchAdsbLolAll(config) {
  if (!config.adsbLolEnabled) return [];
  return fetchAdsbLolPath(config, config.adsbLolAllPath, "adsb.lol-all", false);
}

const tleTriplets = (text) => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const sats = [];
  for (let i = 0; i < lines.length - 2; i += 3) {
    const name = lines[i];
    const l1 = lines[i + 1];
    const l2 = lines[i + 2];
    if (l1.startsWith("1 ") && l2.startsWith("2 ")) sats.push({ name, l1, l2 });
  }
  return sats;
};

function satPosition(tle, when = new Date()) {
  const satrec = tle.satrec || satellite.twoline2satrec(tle.l1, tle.l2);
  const pv = satellite.propagate(satrec, when);
  if (!pv.position) return null;
  const gmst = satellite.gstime(when);
  const geo = satellite.eciToGeodetic(pv.position, gmst);
  return {
    lon: satellite.degreesLong(geo.longitude),
    lat: satellite.degreesLat(geo.latitude),
    altitudeM: geo.height * 1000
  };
}

function satOrbitPath(tle, minutes = 90, stepMin = 5) {
  const points = [];
  const now = Date.now();
  for (let m = 0; m <= minutes; m += stepMin) {
    const p = satPosition(tle, new Date(now + m * 60000));
    if (p) points.push(p);
  }
  return points;
}

function closeOrbitPath(points) {
  if (!Array.isArray(points) || points.length < 2) return points || [];
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return points;
  const dLon = Math.abs(Number(first.lon) - Number(last.lon));
  const dLat = Math.abs(Number(first.lat) - Number(last.lat));
  if (dLon < 0.001 && dLat < 0.001) return points;
  return [...points, { ...first }];
}

function parseFallbackUrls(raw) {
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeN2yoBaseUrl(config) {
  return String(
    config.n2yoBaseUrl || "https://api.n2yo.com/rest/v1/satellite"
  ).replace(/\/+$/, "");
}

async function fetchUrlWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(`timeout ${timeoutMs}ms`), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJsonWithTimeout(url, timeoutMs) {
  const response = await fetchUrlWithTimeout(url, timeoutMs);
  if (!response.ok) {
    const sample = (await response.text()).slice(0, 180).replace(/\s+/g, " ");
    throw new Error(`HTTP ${response.status} ${sample}`);
  }
  return response.json();
}

async function mapLimit(items, limit, worker) {
  const out = new Array(items.length);
  let nextIdx = 0;
  const concurrency = Math.max(1, Math.min(limit, items.length));
  const runners = Array.from({ length: concurrency }, async () => {
    while (true) {
      const idx = nextIdx;
      nextIdx += 1;
      if (idx >= items.length) return;
      out[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return out;
}

async function fetchCelestrakRaw(config) {
  const urls = [config.url, ...parseFallbackUrls(config.fallbackUrls)];
  const attempts = [];

  for (const url of urls) {
    try {
      const response = await fetchUrlWithTimeout(url, config.timeoutMs || 20000);
      if (!response.ok) {
        const sample = (await response.text()).slice(0, 180).replace(/\s+/g, " ");
        attempts.push(`${url} -> HTTP ${response.status} ${sample}`);
        continue;
      }
      const contentType = response.headers.get("content-type") || "";
      const text = await response.text();
      return { url, contentType, text };
    } catch (error) {
      const message =
        error?.cause?.message || error?.message || String(error);
      attempts.push(`${url} -> network error: ${message}`);
    }
  }

  throw new Error(`CelesTrak fetch failed. Attempts: ${attempts.join(" | ")}`);
}

function splitTleString(rawTle) {
  const lines = String(rawTle || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return { tle1: "", tle2: "" };
  return { tle1: lines[0], tle2: lines[1] };
}

function toOrbitPathFromN2yoPositions(positions) {
  if (!Array.isArray(positions)) return [];
  return positions
    .map((p) => ({
      lon: toNumber(p?.satlongitude),
      lat: toNumber(p?.satlatitude),
      altitudeM: (toNumber(p?.sataltitude, 0) || 0) * 1000
    }))
    .filter((p) => p.lon !== null && p.lat !== null);
}

function normalizeN2yoSummary(summary, target, source = "n2yo") {
  const lat = toNumber(summary?.satlat ?? summary?.satlatitude);
  const lon = toNumber(summary?.satlng ?? summary?.satlongitude);
  const altitudeM = (toNumber(summary?.satalt ?? summary?.sataltitude, 0) || 0) * 1000;
  return {
    id: String(summary?.satid ?? summary?.id ?? "unknown"),
    name: summary?.satname || summary?.name || `NORAD ${summary?.satid ?? summary?.id ?? "unknown"}`,
    noradId: String(summary?.satid ?? summary?.id ?? ""),
    lon,
    lat,
    altitudeM,
    distanceKm:
      target && lat !== null && lon !== null
        ? haversineKm(target.lat, target.lon, lat, lon)
        : null,
    orbitPath: lat !== null && lon !== null ? [{ lon, lat, altitudeM }] : [],
    tle1: "",
    tle2: "",
    intDesignator: summary?.intDesignator || "",
    launchDate: summary?.launchDate || "",
    source,
    timestamp: Date.now()
  };
}

async function fetchN2yoAbove(config, target) {
  const baseUrl = normalizeN2yoBaseUrl(config);
  const observerAlt = toNumber(config.n2yoObserverAltM, 0) ?? 0;
  const searchRadius = Math.max(1, Math.min(90, toNumber(config.n2yoAboveRadiusDeg, 70) ?? 70));
  const categoryId = Math.max(0, Math.floor(toNumber(config.n2yoCategoryId, 0) ?? 0));
  const url =
    `${baseUrl}/above/${target.lat.toFixed(6)}/${target.lon.toFixed(6)}/${observerAlt}/${searchRadius}/${categoryId}/` +
    `&apiKey=${encodeURIComponent(config.n2yoApiKey)}`;
  const payload = await fetchJsonWithTimeout(url, config.timeoutMs || 20000);
  return Array.isArray(payload?.above) ? payload.above : [];
}

async function fetchN2yoSatelliteDetails(config, target, satSummary) {
  const baseUrl = normalizeN2yoBaseUrl(config);
  const observerAlt = toNumber(config.n2yoObserverAltM, 0) ?? 0;
  const seconds = Math.max(1, Math.min(300, Number(config.n2yoOrbitSeconds || config.n2yoSeconds || 120)));
  const satId = encodeURIComponent(String(satSummary.satid));
  const positionsUrl =
    `${baseUrl}/positions/${satId}/${target.lat.toFixed(6)}/${target.lon.toFixed(6)}/${observerAlt}/${seconds}/` +
    `&apiKey=${encodeURIComponent(config.n2yoApiKey)}`;

  const positionsPayload = await fetchJsonWithTimeout(positionsUrl, config.timeoutMs || 20000);
  const positions = Array.isArray(positionsPayload?.positions) ? positionsPayload.positions : [];
  const orbitPath = toOrbitPathFromN2yoPositions(positions);
  const first = positions[0] || {};

  const basic = normalizeN2yoSummary(
    {
      satid: satSummary.satid,
      satname: satSummary.satname,
      satlat: first?.satlatitude ?? satSummary.satlat,
      satlng: first?.satlongitude ?? satSummary.satlng,
      satalt: first?.sataltitude ?? satSummary.satalt,
      intDesignator: satSummary.intDesignator,
      launchDate: satSummary.launchDate
    },
    target
  );

  const out = {
    ...basic,
    orbitPath: orbitPath.length > 0 ? orbitPath : basic.orbitPath,
    azimuthDeg: toNumber(first?.azimuth),
    elevationDeg: toNumber(first?.elevation),
    rightAscensionDeg: toNumber(first?.ra),
    declinationDeg: toNumber(first?.dec),
    n2yoTimestamp: toNumber(first?.timestamp),
    source: "n2yo"
  };

  if (config.n2yoIncludeTle !== false) {
    try {
      const tleUrl = `${baseUrl}/tle/${satId}&apiKey=${encodeURIComponent(config.n2yoApiKey)}`;
      const tlePayload = await fetchJsonWithTimeout(tleUrl, config.timeoutMs || 20000);
      const split = splitTleString(tlePayload?.tle || "");
      out.tle1 = split.tle1;
      out.tle2 = split.tle2;
      if (out.tle1 && out.tle2) {
        const fullOrbit = satOrbitPath({ l1: out.tle1, l2: out.tle2 }, 120, 2);
        if (fullOrbit.length > 6) {
          out.orbitPath = closeOrbitPath(fullOrbit);
        }
      }
    } catch {
      // Best effort; orbit path already computed from position track.
    }
  }

  return out;
}

async function fetchN2yoSatellites(config, target, limit) {
  if (!config.n2yoApiKey) {
    throw new Error("N2YO provider requires N2YO_API_KEY.");
  }
  const defaultGlobalObservers = [
    { lat: 40.7128, lon: -74.006 },   // North America
    { lat: -23.5505, lon: -46.6333 }, // South America
    { lat: 51.5072, lon: -0.1276 },   // Europe
    { lat: 30.0444, lon: 31.2357 },   // Africa
    { lat: 28.6139, lon: 77.209 },    // South Asia
    { lat: 35.6762, lon: 139.6503 },  // East Asia
    { lat: -33.8688, lon: 151.2093 }  // Oceania
  ];

  let above = [];
  if (target) {
    above = await fetchN2yoAbove(config, target);
  } else {
    const perObserverLimit = Math.max(20, Math.ceil(limit / defaultGlobalObservers.length) + 8);
    const batches = await mapLimit(defaultGlobalObservers, 3, async (observer) => {
      try {
        const rows = await fetchN2yoAbove({ ...config, n2yoDetailedSatellites: 0 }, observer);
        return rows
          .slice(0, perObserverLimit)
          .map((row) => ({ ...row, _observer: observer }));
      } catch {
        return [];
      }
    });
    const deduped = new Map();
    for (const batch of batches) {
      for (const sat of batch) {
        const key = String(sat?.satid || sat?.id || "");
        if (!key) continue;
        if (!deduped.has(key)) deduped.set(key, sat);
      }
    }
    above = Array.from(deduped.values());
  }

  const clipped = above.slice(0, Math.max(1, limit));
  const detailBudget = Math.max(
    1,
    Math.min(clipped.length, Number(config.n2yoDetailedSatellites || clipped.length))
  );
  const detailConcurrency = Math.max(
    1,
    Math.min(6, Number(config.n2yoDetailConcurrency || 4))
  );

  const detailed = await mapLimit(
    clipped.slice(0, detailBudget),
    detailConcurrency,
    async (satSummary) => {
      const observer = satSummary?._observer || target || null;
      try {
        if (observer) {
          return await fetchN2yoSatelliteDetails(config, observer, satSummary);
        }
        return normalizeN2yoSummary(satSummary, null, "n2yo-summary");
      } catch {
        return normalizeN2yoSummary(satSummary, target || null, "n2yo-partial");
      }
    }
  );

  const fallback = clipped
    .slice(detailBudget)
    .map((satSummary) => normalizeN2yoSummary(satSummary, target || null, "n2yo-summary"));

  return [...detailed, ...fallback]
    .filter((s) => s.lon !== null && s.lat !== null)
    .sort((a, b) => {
      const aDist = a.distanceKm ?? Number.POSITIVE_INFINITY;
      const bDist = b.distanceKm ?? Number.POSITIVE_INFINITY;
      if (Number.isFinite(aDist) || Number.isFinite(bDist)) return aDist - bDist;
      return String(a.name || a.id).localeCompare(String(b.name || b.id));
    })
    .slice(0, limit);
}

async function fetchN2yoFallback(config, target, count) {
  if (!config.enableN2yoFallback || !config.n2yoApiKey) return [];
  const ids = String(config.n2yoSatIds || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, Math.max(1, Math.min(count, 60)));
  if (ids.length === 0) return [];
  if (!target) return [];

  const out = [];
  const baseUrl = normalizeN2yoBaseUrl(config);
  for (const id of ids) {
    const seconds = Math.max(1, Math.min(300, Number(config.n2yoSeconds || 2)));
    const url =
      `${baseUrl}/positions/${encodeURIComponent(id)}` +
      `/${target.lat}/${target.lon}/${config.n2yoObserverAltM}/${seconds}/&apiKey=${encodeURIComponent(config.n2yoApiKey)}`;
    try {
      const payload = await fetchJsonWithTimeout(url, config.timeoutMs || 20000);
      const positions = Array.isArray(payload?.positions) ? payload.positions : [];
      const first = positions[0] || null;
      if (!first) continue;
      const orbitPath = toOrbitPathFromN2yoPositions(positions);
      out.push({
        id: String(payload?.info?.satid ?? id),
        name: payload?.info?.satname || `NORAD ${id}`,
        noradId: String(payload?.info?.satid ?? id),
        lon: toNumber(first.satlongitude),
        lat: toNumber(first.satlatitude),
        altitudeM: (toNumber(first.sataltitude, 0) || 0) * 1000,
        distanceKm: haversineKm(target.lat, target.lon, first.satlatitude, first.satlongitude),
        orbitPath,
        tle1: "",
        tle2: "",
        azimuthDeg: toNumber(first?.azimuth),
        elevationDeg: toNumber(first?.elevation),
        rightAscensionDeg: toNumber(first?.ra),
        declinationDeg: toNumber(first?.dec),
        source: "n2yo-fallback",
        timestamp: Date.now()
      });
    } catch {
      // best effort fallback
    }
  }
  return out.filter((s) => s.lon !== null && s.lat !== null).slice(0, count);
}

function normalizeSatFromTle(tle, target) {
  const pos = satPosition(tle);
  if (!pos) return null;
  const catnr = String(tle?.l1 || "").slice(2, 7).trim();
  const satId = catnr || tle.name;
  const distanceKm = target
    ? haversineKm(target.lat, target.lon, pos.lat, pos.lon)
    : null;
  return {
    id: satId,
    name: tle.name,
    noradId: catnr,
    lon: pos.lon,
    lat: pos.lat,
    altitudeM: pos.altitudeM,
    distanceKm,
    orbitPath: closeOrbitPath(satOrbitPath(tle, 120, 2)),
    tle1: tle.l1,
    tle2: tle.l2,
    source: "celestrak",
    timestamp: Date.now()
  };
}

function normalizeSatFromOmm(omm, target) {
  if (typeof satellite.json2satrec !== "function") return null;
  let satrec;
  try {
    satrec = satellite.json2satrec(omm);
  } catch {
    return null;
  }
  const name = omm.OBJECT_NAME || String(omm.NORAD_CAT_ID || "UNKNOWN");
  const pos = satPosition({ satrec });
  if (!pos) return null;
  const distanceKm = target
    ? haversineKm(target.lat, target.lon, pos.lat, pos.lon)
    : null;
  return {
    id: String(omm.NORAD_CAT_ID || name),
    name,
    noradId: String(omm.NORAD_CAT_ID || ""),
    lon: pos.lon,
    lat: pos.lat,
    altitudeM: pos.altitudeM,
    distanceKm,
    orbitPath: closeOrbitPath(satOrbitPath({ satrec }, 120, 2)),
    tle1: omm.TLE_LINE1 || "",
    tle2: omm.TLE_LINE2 || "",
    source: "celestrak",
    timestamp: Date.now()
  };
}

function parseCelestrakSatellites(raw, target) {
  const text = String(raw?.text || "");
  const out = [];

  if (raw?.contentType?.includes("json") || text.trim().startsWith("[") || text.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(text);
      const rows = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.data)
          ? parsed.data
          : [];
      for (const row of rows) {
        const sat = normalizeSatFromOmm(row, target);
        if (sat) out.push(sat);
      }
      if (out.length > 0) return out;
    } catch {
      // Fall through to TLE parse.
    }
  }

  const triples = tleTriplets(text);
  for (const tle of triples) {
    const sat = normalizeSatFromTle(tle, target);
    if (sat) out.push(sat);
  }
  return out;
}

async function fetchCelestrakSatellites(config, target, limit) {
  const raw = await fetchCelestrakRaw(config);
  const sats = parseCelestrakSatellites(raw, target)
    .filter((s) => s && s.lon !== null && s.lat !== null)
    .sort((a, b) => {
      const aDist = a.distanceKm ?? Number.POSITIVE_INFINITY;
      const bDist = b.distanceKm ?? Number.POSITIVE_INFINITY;
      if (Number.isFinite(aDist) || Number.isFinite(bDist)) return aDist - bDist;
      return String(a.id || "").localeCompare(String(b.id || ""));
    });
  return sats.slice(0, Math.max(1, limit));
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function inCityBounds(lat, lon, city) {
  const c = city.toLowerCase();
  if (c === "baton_rouge") {
    return lat >= 30.34 && lat <= 30.58 && lon >= -91.30 && lon <= -90.98;
  }
  if (c === "new_orleans") {
    return lat >= 29.85 && lat <= 30.10 && lon >= -90.20 && lon <= -89.90;
  }
  return false;
}

export async function fetchSatellites(config, options = {}) {
  const target =
    options.target &&
    Number.isFinite(options.target.lat) &&
    Number.isFinite(options.target.lon)
      ? options.target
      : null;
  const limit = Number.isFinite(options.count)
    ? Math.max(1, Math.floor(options.count))
    : config.maxSatellites;
  const provider = String(config.provider || "n2yo").toLowerCase();

  if (provider === "celestrak" || provider === "celestrak_sgp4" || provider === "sgp4" || provider === "tle") {
    try {
      return await fetchCelestrakSatellites(config, target, limit);
    } catch (error) {
      if (config.n2yoApiKey && !looksPlaceholder(config.n2yoApiKey)) {
        return await fetchN2yoSatellites(config, target, limit);
      }
      throw error;
    }
  }

  if (provider === "hybrid") {
    try {
      return await fetchN2yoSatellites(config, target, limit);
    } catch {
      return await fetchCelestrakSatellites(config, target, limit);
    }
  }

  try {
    return await fetchN2yoSatellites(config, target, limit);
  } catch (error) {
    const fallback = await fetchN2yoFallback(config, target, limit);
    if (fallback.length > 0) return fallback;
    if (config.url) {
      try {
        return await fetchCelestrakSatellites(config, target, limit);
      } catch {
        // Keep original error if CelesTrak fallback also fails.
      }
    }
    throw error;
  }
}

export async function fetchSeismic(config) {
  const response = await fetch(config.url);
  if (!response.ok) throw new Error(`Seismic HTTP ${response.status}`);
  const data = await response.json();
  const features = Array.isArray(data.features) ? data.features : [];
  return features
    .map((feature) => {
      const coords = feature?.geometry?.coordinates || [];
      return {
        id: feature.id || `quake-${Math.random().toString(16).slice(2, 8)}`,
        mag: toNumber(feature?.properties?.mag, 0),
        place: feature?.properties?.place || "Unknown",
        time: feature?.properties?.time || Date.now(),
        lon: toNumber(coords[0]),
        lat: toNumber(coords[1]),
        depthKm: toNumber(coords[2]),
        source: "seismic",
        timestamp: Date.now()
      };
    })
    .filter((q) => q.lon !== null && q.lat !== null);
}

export async function fetchTraffic(config) {
  if ((config.provider || "").toLowerCase() === "osm_overpass") {
    const lat = toNumber(config.centerLat, 30.4515);
    const lon = toNumber(config.centerLon, -91.1871);
    const radiusM = Math.max(1000, toNumber(config.radiusM, 25000));
    const maxWays = Math.max(1, toNumber(config.maxWays, 250));
    const query = `
[out:json][timeout:25];
(
  way(around:${radiusM},${lat},${lon})["highway"~"motorway|trunk|primary|secondary|tertiary"];
);
out geom;
`;
    const endpoints = [
      config.overpassUrl,
      ...parseFallbackUrls(config.overpassFallbackUrls)
    ];
    let data = null;
    const attempts = [];
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            Accept: "application/json",
            "User-Agent": "Vector/1.0 (+https://pterodactyl.io)"
          },
          body: `data=${encodeURIComponent(query)}`
        });
        if (!response.ok) {
          const sample = (await response.text()).slice(0, 180).replace(/\s+/g, " ");
          attempts.push(`${endpoint} -> HTTP ${response.status} ${sample}`);
          continue;
        }
        data = await response.json();
        break;
      } catch (error) {
        attempts.push(`${endpoint} -> network error: ${error.message}`);
      }
    }
    if (!data) {
      throw new Error(`OSM Overpass fetch failed. Attempts: ${attempts.join(" | ")}`);
    }
    const ways = (Array.isArray(data?.elements) ? data.elements : [])
      .filter((el) => el.type === "way" && Array.isArray(el.geometry) && el.geometry.length > 1)
      .slice(0, maxWays);

    return ways.map((way) => {
      const coordinates = way.geometry.map((p) => [p.lon, p.lat, 4]);
      const tagSpeed = Number.parseInt(String(way?.tags?.maxspeed ?? ""), 10);
      const speed = Number.isFinite(tagSpeed) ? tagSpeed * 0.44704 : 10 + Math.random() * 20;
      const lanes = Number.parseInt(String(way?.tags?.lanes ?? "2"), 10);
      const density = Number.isFinite(lanes) ? Math.min(1, 2 / Math.max(1, lanes)) : 0.6;
      return {
        id: `osm-${way.id}`,
        coordinates,
        speed,
        density,
        source: "osm_overpass",
        timestamp: Date.now()
      };
    });
  }

  if (!config.url) return [];
  const response = await fetch(config.url);
  if (!response.ok) throw new Error(`Traffic HTTP ${response.status}`);
  const data = await response.json();
  const segments = Array.isArray(data?.segments)
    ? data.segments
    : Array.isArray(data)
      ? data
      : [];
  return segments.map((segment, idx) => ({
    id: segment.id || `traffic-${idx}`,
    coordinates: segment.coordinates || [],
    speed: toNumber(segment.speed, null),
    density: toNumber(segment.density, null),
    source: "traffic",
    timestamp: Date.now()
  }));
}

function parseCsvLike(input) {
  return String(input || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function toRegionKey(value, fallback = "other") {
  const clean = String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return clean || fallback;
}

function normalizeCctvRow(row, idx, source, regionName = "Other", regionKey = "other") {
  const view = Array.isArray(row?.Views)
    ? row.Views.find((v) => v?.VideoUrl || v?.Url) || row.Views[0]
    : null;
  const lon = toNumber(
    row?.lon ??
      row?.longitude ??
      row?.Longitude ??
      row?.LON ??
      row?.Long
  );
  const lat = toNumber(
    row?.lat ??
      row?.latitude ??
      row?.Latitude ??
      row?.LAT
  );
  return {
    id: `${source}-${row?.id ?? row?.Id ?? row?.SourceId ?? idx}`,
    label:
      row?.label ||
      row?.name ||
      row?.Location ||
      row?.Roadway ||
      row?.Name ||
      `${regionName} Camera ${idx + 1}`,
    lon,
    lat,
    altitudeM: toNumber(row?.altitudeM ?? row?.AltitudeM, 10),
    streamUrl:
      row?.streamUrl ||
      row?.VideoUrl ||
      row?.url ||
      row?.Url ||
      view?.VideoUrl ||
      "",
    previewUrl:
      row?.previewUrl ||
      row?.snapshotUrl ||
      row?.SnapshotUrl ||
      row?.imageUrl ||
      row?.ImageUrl ||
      view?.ImageUrl ||
      view?.Url ||
      "",
    detailsUrl: row?.detailsUrl || row?.Url || view?.Url || "",
    source,
    regionName,
    regionKey,
    timestamp: Date.now()
  };
}

async function fetchJsonMaybe(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`CCTV HTTP ${response.status}`);
  return response.json();
}

async function fetch511Cameras(endpoint, apiKey, sourceLabel, regionName, regionKey) {
  if (!endpoint) return [];
  const hasQuery = endpoint.includes("?");
  const keyPart = apiKey ? `${hasQuery ? "&" : "?"}key=${encodeURIComponent(apiKey)}` : "";
  const formatPart = endpoint.toLowerCase().includes("format=") ? "" : `${hasQuery || keyPart ? "&" : "?"}format=json`;
  const url = `${endpoint}${keyPart}${formatPart}`;
  const payload = await fetchJsonMaybe(url);
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
  return rows.map((row, idx) => normalizeCctvRow(row, idx, sourceLabel, regionName, regionKey));
}

function caltransDistrictUrls(baseUrl, districtsRaw) {
  return parseCsvLike(districtsRaw).map((district) => {
    const n = String(district).padStart(2, "0");
    return `${String(baseUrl).replace(/\/+$/, "")}/data/d${Number(district)}/cctv/cctvStatusD${n}.json`;
  });
}

function buildStaticCctvCatalog(config) {
  return [
    {
      id: "weatherbug-baton-rouge",
      label: "WeatherBug Baton Rouge Traffic Cams",
      lon: -91.1402,
      lat: 30.4583,
      altitudeM: 14,
      streamUrl: config.weatherbugBatonRougeUrl,
      detailsUrl: config.weatherbugBatonRougeUrl,
      source: "weatherbug-poi",
      regionName: "Baton Rouge",
      regionKey: "baton_rouge",
      timestamp: Date.now()
    },
    {
      id: "weatherbug-new-orleans",
      label: "WeatherBug New Orleans Traffic Cams",
      lon: -90.0715,
      lat: 29.9511,
      altitudeM: 14,
      streamUrl: config.weatherbugNewOrleansUrl,
      detailsUrl: config.weatherbugNewOrleansUrl,
      source: "weatherbug-poi",
      regionName: "New Orleans",
      regionKey: "new_orleans",
      timestamp: Date.now()
    },
    {
      id: "caltrans-statewide-map",
      label: "Caltrans CCTV Statewide Map",
      lon: -119.4179,
      lat: 36.7783,
      altitudeM: 15,
      streamUrl: "https://cwwp2.dot.ca.gov/vm/iframemap.htm",
      detailsUrl: "https://cwwp2.dot.ca.gov/documentation/cctv/cctv.htm",
      source: "caltrans-map",
      regionName: "California",
      regionKey: "california",
      timestamp: Date.now()
    },
    {
      id: "ny511-camera-portal",
      label: "511NY Camera Portal",
      lon: -74.006,
      lat: 40.7128,
      altitudeM: 15,
      streamUrl: "https://511ny.org/cctv",
      detailsUrl: "https://511ny.org/help/endpoint/cameras",
      source: "511ny-portal",
      regionName: "New York",
      regionKey: "new_york",
      timestamp: Date.now()
    },
    {
      id: "ga511-camera-portal",
      label: "511GA Camera Portal",
      lon: -84.388,
      lat: 33.749,
      altitudeM: 15,
      streamUrl: "https://511ga.org/cctv",
      detailsUrl: "https://511ga.org/help/endpoint/cameras",
      source: "511ga-portal",
      regionName: "Georgia",
      regionKey: "georgia",
      timestamp: Date.now()
    }
  ];
}

function dedupeCctv(items) {
  const out = [];
  const seen = new Set();
  for (const cam of items) {
    const key = `${cam.source}|${cam.label}|${cam.lat}|${cam.lon}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cam);
  }
  return out;
}

export async function fetchCctv(config) {
  const weatherbugPoi = [
    {
      id: "weatherbug-baton-rouge",
      label: "WeatherBug Baton Rouge Traffic Cams",
      lon: -91.1402,
      lat: 30.4583,
      altitudeM: 14,
      streamUrl: config.weatherbugBatonRougeUrl,
      detailsUrl: config.weatherbugBatonRougeUrl,
      source: "weatherbug-poi",
      regionName: "Baton Rouge",
      regionKey: "baton_rouge",
      timestamp: Date.now()
    },
    {
      id: "weatherbug-new-orleans",
      label: "WeatherBug New Orleans Traffic Cams",
      lon: -90.0715,
      lat: 29.9511,
      altitudeM: 14,
      streamUrl: config.weatherbugNewOrleansUrl,
      detailsUrl: config.weatherbugNewOrleansUrl,
      source: "weatherbug-poi",
      regionName: "New Orleans",
      regionKey: "new_orleans",
      timestamp: Date.now()
    }
  ];

  if ((config.provider || "").toLowerCase() === "federated_511") {
    const sources = [
      {
        endpoint: config.la511CamerasUrl,
        key: config.la511ApiKey,
        source: "la511",
        regionName: "Louisiana",
        regionKey: "louisiana",
        requiredKey: true
      },
      {
        endpoint: config.ga511CamerasUrl,
        key: config.ga511ApiKey,
        source: "ga511",
        regionName: "Georgia",
        regionKey: "georgia",
        requiredKey: true
      },
      {
        endpoint: config.ny511CamerasUrl,
        key: config.ny511ApiKey,
        source: "ny511",
        regionName: "New York",
        regionKey: "new_york",
        requiredKey: true
      },
      {
        endpoint: config.az511CamerasUrl,
        key: config.az511ApiKey,
        source: "az511",
        regionName: "Arizona",
        regionKey: "arizona",
        requiredKey: true
      },
      {
        endpoint: config.wi511CamerasUrl,
        key: config.wi511ApiKey,
        source: "wi511",
        regionName: "Wisconsin",
        regionKey: "wisconsin",
        requiredKey: true
      },
      {
        endpoint: config.on511CamerasUrl,
        key: "",
        source: "on511",
        regionName: "Ontario",
        regionKey: "ontario",
        requiredKey: false
      }
    ];

    const out = [];
    for (const src of sources) {
      if (src.requiredKey && !src.key) continue;
      try {
        const rows = await fetch511Cameras(
          src.endpoint,
          src.key,
          src.source,
          src.regionName,
          src.regionKey
        );
        out.push(...rows.slice(0, Math.max(1, config.maxPerSource || 300)));
      } catch {
        // keep moving through sources
      }
    }

    if (config.caltransEnabled) {
      const districtUrls = caltransDistrictUrls(
        config.caltransBaseUrl,
        config.caltransDistricts
      );
      for (const url of districtUrls) {
        try {
          const payload = await fetchJsonMaybe(url);
          const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
          const mapped = rows
            .map((row, idx) =>
              normalizeCctvRow(row, idx, "caltrans", "California", "california")
            )
            .slice(0, Math.max(1, config.maxPerSource || 300));
          out.push(...mapped);
        } catch {
          // best effort
        }
      }
    }

    if (config.includeWeatherbugPoi) out.push(...weatherbugPoi);
    if (config.includeStaticCatalog) out.push(...buildStaticCctvCatalog(config));

    return dedupeCctv(out).filter((f) => f.lon !== null && f.lat !== null);
  }

  if ((config.provider || "").toLowerCase() === "la511") {
    if (!config.la511ApiKey) {
      return config.includeWeatherbugPoi ? weatherbugPoi : [];
    }
    const endpoint = `${config.la511CamerasUrl}?key=${encodeURIComponent(config.la511ApiKey)}&format=json`;
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error(`511LA CCTV HTTP ${response.status}`);
    const data = await response.json();
    const cameras = Array.isArray(data) ? data : [];
    const selected = cameras.filter((camera) => {
      const lat = toNumber(camera?.Latitude);
      const lon = toNumber(camera?.Longitude);
      if (lat === null || lon === null) return false;
      return inCityBounds(lat, lon, "baton_rouge") || inCityBounds(lat, lon, "new_orleans");
    });

    const mapped = selected.map((camera, idx) => {
      const view = Array.isArray(camera.Views) ? camera.Views.find((v) => v?.VideoUrl) || camera.Views[0] : null;
      return {
        id: `la511-${camera.Id ?? idx}`,
        label: camera.Location || camera.Roadway || `LA Camera ${idx + 1}`,
        lon: toNumber(camera.Longitude),
        lat: toNumber(camera.Latitude),
        altitudeM: 12,
      streamUrl: view?.VideoUrl || view?.Url || "",
      previewUrl: view?.ImageUrl || view?.Url || "",
      detailsUrl: view?.Url || "",
        source: "la511",
        regionName: "Louisiana",
        regionKey: "louisiana",
        timestamp: Date.now()
      };
    });

    if (!config.includeWeatherbugPoi) return mapped.filter((f) => f.lon !== null && f.lat !== null);

    return [...mapped, ...weatherbugPoi].filter((f) => f.lon !== null && f.lat !== null);
  }

  if ((config.provider || "").toLowerCase() === "multi_url_json") {
    const urls = parseCsvLike(config.feedUrls);
    const out = [];
    for (const url of urls) {
      try {
        const payload = await fetchJsonMaybe(url);
        const feeds = Array.isArray(payload?.feeds)
          ? payload.feeds
          : Array.isArray(payload)
            ? payload
            : [];
        const source = toRegionKey(new URL(url).hostname, "cctv");
        const mapped = feeds.map((feed, idx) =>
          normalizeCctvRow(feed, idx, source, source, source)
        );
        out.push(...mapped.slice(0, Math.max(1, config.maxPerSource || 300)));
      } catch {
        // keep going
      }
    }
    if (config.includeStaticCatalog) out.push(...buildStaticCctvCatalog(config));
    return dedupeCctv(out).filter((f) => f.lon !== null && f.lat !== null);
  }

  if (!config.url) return [];
  const response = await fetch(config.url);
  if (!response.ok) throw new Error(`CCTV HTTP ${response.status}`);
  const data = await response.json();
  const feeds = Array.isArray(data?.feeds) ? data.feeds : Array.isArray(data) ? data : [];
  return feeds
    .map((feed, idx) => ({
      id: feed.id || `cctv-${idx}`,
      label: feed.label || feed.name || `Camera ${idx + 1}`,
      lon: toNumber(feed.lon),
      lat: toNumber(feed.lat),
      altitudeM: toNumber(feed.altitudeM, 10),
      streamUrl: feed.streamUrl || feed.url || "",
      previewUrl: feed.previewUrl || feed.imageUrl || feed.url || "",
      detailsUrl: feed.url || "",
      source: "cctv",
      regionName: feed.regionName || feed.region || "Other",
      regionKey: toRegionKey(feed.regionKey || feed.region || "other", "other"),
      timestamp: Date.now()
    }))
    .filter((f) => f.lon !== null && f.lat !== null);
}
