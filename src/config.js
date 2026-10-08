import dotenv from "dotenv";
import { runtimeSecret } from "./runtime-secret.js";

dotenv.config({ path: process.env.ENV_FILE || ".env.production", quiet: true });
dotenv.config({ quiet: true });

const int = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const bool = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  const v = String(value).toLowerCase();
  return v === "1" || v === "true" || v === "yes";
};

const nullableFloat = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
};

const float = (value, fallback) => {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  app: {
    nodeEnv: process.env.NODE_ENV ?? "production",
    host: process.env.APP_HOST ?? "0.0.0.0",
    port: int(process.env.SERVER_PORT ?? process.env.APP_PORT ?? process.env.PORT, 3000),
    replayHours: int(process.env.REPLAY_HOURS, 2),
    corsOrigin: process.env.CORS_ORIGIN ?? "*",
    cacheFilePath:
      process.env.DATA_CACHE_PATH ?? "./data/last-known-good.json",
    maxWsAircraft: int(process.env.MAX_WS_AIRCRAFT, 2500),
    maxWsSatellites: int(process.env.MAX_WS_SATELLITES, 260),
    maxWsMaritime: int(process.env.MAX_WS_MARITIME, 1200),
    satelliteOrbitPathPoints: int(process.env.SATELLITE_ORBIT_PATH_POINTS, 80)
  },
  auth: {
    jwtSecret: runtimeSecret(process.env.JWT_SECRET, process.env.DATA_CACHE_PATH ?? "./data/last-known-good.json")
  },
  map: {
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? "",
    cesiumIonToken: process.env.CESIUM_ION_TOKEN ?? "",
    markerLat: nullableFloat(process.env.MARKER_LAT),
    markerLon: nullableFloat(process.env.MARKER_LON)
  },
  feeds: {
    opensky: {
      enabled: bool(process.env.ENABLE_OPENSKY, true),
      url:
        process.env.OPENSKY_FEED_URL ??
        "https://opensky-network.org/api/states/all",
      authMode: process.env.OPENSKY_AUTH_MODE ?? "none",
      tokenUrl:
        process.env.OPENSKY_TOKEN_URL ??
        "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token",
      clientId: process.env.OPENSKY_CLIENT_ID ?? "",
      clientSecret: process.env.OPENSKY_CLIENT_SECRET ?? "",
      // Legacy mode support for older OpenSky accounts only.
      username: process.env.OPENSKY_USERNAME ?? "",
      password: process.env.OPENSKY_PASSWORD ?? "",
      pollMs: int(process.env.OPENSKY_POLL_MS, 60000),
      renderRadiusMiles: int(process.env.FLIGHT_RENDER_RADIUS_MILES, 9000),
      maxVisible: int(process.env.MAX_VISIBLE_FLIGHTS, 600)
    },
    adsb: {
      enabled: bool(process.env.ENABLE_ADSB, true),
      url: process.env.ADSB_FEED_URL ?? "",
      apiKey: process.env.ADSB_EXCHANGE_API_KEY ?? "",
      authHeader: process.env.ADSB_AUTH_HEADER ?? "api-auth",
      pollMs: int(process.env.ADSB_POLL_MS, 15000),
      adsbLolEnabled: bool(process.env.ENABLE_ADSB_LOL, true),
      adsbLolBaseUrl: process.env.ADSB_LOL_BASE_URL ?? "https://api.adsb.lol",
      adsbLolMilitaryPath: process.env.ADSB_LOL_MIL_PATH ?? "/v2/mil",
      adsbLolAllPath: process.env.ADSB_LOL_ALL_PATH ?? "/v2/all",
      adsbLolTimeoutMs: int(process.env.ADSB_LOL_TIMEOUT_MS, 15000)
    },
    celestrak: {
      enabled: bool(process.env.ENABLE_SATELLITES ?? process.env.ENABLE_CELESTRAK, true),
      provider: (process.env.SATELLITE_PROVIDER ?? "celestrak_sgp4").toLowerCase(),
      url:
        process.env.CELESTRAK_FEED_URL ??
        "https://celestrak.com/NORAD/elements/gp.php?GROUP=ACTIVE&FORMAT=TLE",
      fallbackUrls:
        process.env.CELESTRAK_FALLBACK_URLS ??
        "https://www.celestrak.com/NORAD/elements/gp.php?GROUP=ACTIVE&FORMAT=TLE,https://celestrak.org/NORAD/elements/gp.php?GROUP=ACTIVE&FORMAT=TLE,https://www.celestrak.org/NORAD/elements/gp.php?GROUP=ACTIVE&FORMAT=TLE,https://celestrak.com/NORAD/elements/active.txt",
      timeoutMs: int(process.env.CELESTRAK_TIMEOUT_MS, 35000),
      pollMs: int(process.env.CELESTRAK_POLL_MS, 300000),
      maxSatellites: int(process.env.CELESTRAK_MAX_SATELLITES, 200),
      enableN2yoFallback: bool(process.env.CELESTRAK_ENABLE_N2YO_FALLBACK, false),
      n2yoBaseUrl:
        process.env.N2YO_BASE_URL ??
        "https://api.n2yo.com/rest/v1/satellite",
      n2yoApiKey: process.env.N2YO_API_KEY ?? "",
      n2yoAboveRadiusDeg: int(process.env.N2YO_ABOVE_RADIUS_DEG, 70),
      n2yoCategoryId: int(process.env.N2YO_CATEGORY_ID, 0),
      n2yoOrbitSeconds: int(process.env.N2YO_ORBIT_SECONDS, 45),
      n2yoDetailedSatellites: int(process.env.N2YO_DETAILED_SATELLITES, 24),
      n2yoDetailConcurrency: int(process.env.N2YO_DETAIL_CONCURRENCY, 2),
      n2yoIncludeTle: bool(process.env.N2YO_INCLUDE_TLE, true),
      n2yoSatIds:
        process.env.N2YO_SAT_IDS ??
        "25544,33591,43013,43226,20580,28654,27424,39084,39227,40069",
      n2yoObserverAltM: float(process.env.N2YO_OBSERVER_ALT_M, 0),
      n2yoSeconds: int(process.env.N2YO_SECONDS, 2)
    },
    seismic: {
      enabled: bool(process.env.ENABLE_SEISMIC, true),
      url:
        process.env.SEISMIC_FEED_URL ??
        "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson",
      pollMs: int(process.env.SEISMIC_POLL_MS, 60000)
    },
    traffic: {
      enabled: bool(process.env.ENABLE_TRAFFIC, true),
      provider: process.env.TRAFFIC_PROVIDER ?? "osm_overpass",
      url: process.env.TRAFFIC_FEED_URL ?? "",
      overpassUrl:
        process.env.OSM_OVERPASS_URL ?? "https://overpass-api.de/api/interpreter",
      overpassFallbackUrls:
        process.env.OSM_OVERPASS_FALLBACK_URLS ??
        "https://overpass.kumi.systems/api/interpreter,https://overpass.openstreetmap.fr/api/interpreter",
      centerLat: float(process.env.OSM_CENTER_LAT, 30.4515),
      centerLon: float(process.env.OSM_CENTER_LON, -91.1871),
      radiusM: int(process.env.OSM_RADIUS_M, 25000),
      maxWays: int(process.env.OSM_MAX_WAYS, 250),
      pollMs: int(process.env.TRAFFIC_POLL_MS, 30000)
    },
    cctv: {
      enabled: bool(process.env.ENABLE_CCTV, true),
      provider: process.env.CCTV_PROVIDER ?? "federated_511",
      url: process.env.CCTV_FEED_URL ?? "",
      feedUrls: process.env.CCTV_FEED_URLS ?? "",
      la511ApiKey: process.env.LA511_API_KEY ?? "",
      ga511ApiKey: process.env.GA511_API_KEY ?? "",
      ny511ApiKey: process.env.NY511_API_KEY ?? "",
      az511ApiKey: process.env.AZ511_API_KEY ?? "",
      wi511ApiKey: process.env.WI511_API_KEY ?? "",
      la511CamerasUrl:
        process.env.LA511_CAMERAS_URL ?? "https://511la.org/api/v2/get/cameras",
      ga511CamerasUrl:
        process.env.GA511_CAMERAS_URL ?? "https://511ga.org/api/v2/get/cameras",
      ny511CamerasUrl:
        process.env.NY511_CAMERAS_URL ?? "https://511ny.org/api/v2/get/cameras",
      az511CamerasUrl:
        process.env.AZ511_CAMERAS_URL ?? "https://az511.com/api/v2/get/cameras",
      wi511CamerasUrl:
        process.env.WI511_CAMERAS_URL ?? "https://511wi.gov/api/v2/get/cameras",
      on511CamerasUrl:
        process.env.ON511_CAMERAS_URL ?? "https://511on.ca/api/v2/get/cameras?format=json&lang=en",
      caltransEnabled: bool(process.env.CALTRANS_CCTV_ENABLED, true),
      caltransBaseUrl: process.env.CALTRANS_CCTV_BASE_URL ?? "https://cwwp2.dot.ca.gov",
      caltransDistricts: process.env.CALTRANS_CCTV_DISTRICTS ?? "07,11,12,04",
      includeStaticCatalog: bool(process.env.CCTV_INCLUDE_STATIC_CATALOG, true),
      maxPerSource: int(process.env.CCTV_MAX_PER_SOURCE, 300),
      includeWeatherbugPoi: bool(process.env.CCTV_INCLUDE_WEATHERBUG_POI, true),
      weatherbugBatonRougeUrl:
        process.env.CCTV_WEATHERBUG_BATON_ROUGE_URL ??
        "https://www.weatherbug.com/traffic-cam/baton-rouge-la-70806",
      weatherbugNewOrleansUrl:
        process.env.CCTV_WEATHERBUG_NEW_ORLEANS_URL ??
        "https://www.weatherbug.com/traffic-cam/new-orleans-la-70116",
      pollMs: int(process.env.CCTV_POLL_MS, 60000)
    },
    intel: {
      enabled: bool(process.env.ENABLE_INTEL, true),
      gdeltDocUrl:
        process.env.GDELT_DOC_URL ??
        "https://api.gdeltproject.org/api/v2/doc/doc",
      gdeltQuery:
        process.env.GDELT_QUERY ??
        "(conflict OR protest OR sanctions OR cyber OR power OR military)",
      gdeltTimespan: process.env.GDELT_TIMESPAN ?? "6h",
      gdeltMaxRecords: int(process.env.GDELT_MAX_RECORDS, 50),
      kevFeedUrl:
        process.env.KEV_FEED_URL ??
        "https://raw.githubusercontent.com/cisagov/kev-data/develop/known_exploited_vulnerabilities.json",
      coingeckoMarketsUrl:
        process.env.COINGECKO_MARKETS_URL ??
        "https://api.coingecko.com/api/v3/coins/markets",
      weatherAlertsUrl:
        process.env.WEATHER_ALERTS_URL ??
        "https://api.weather.gov/alerts/active",
      downDetectorEnabled: bool(process.env.ENABLE_DOWNDETECTOR, false),
      downDetectorBaseUrl:
        process.env.DOWNDETECTOR_BASE_URL ??
        "https://downdetectorapi.com/v2",
      downDetectorApiToken: process.env.DOWNDETECTOR_API_TOKEN ?? "",
      downDetectorServices:
        process.env.DOWNDETECTOR_SERVICE_QUERIES ??
        "google,cloudflare,aws,microsoft 365,discord",
      downDetectorCountryIso:
        process.env.DOWNDETECTOR_COUNTRY_ISO ?? "",
      downDetectorPageSize: int(process.env.DOWNDETECTOR_PAGE_SIZE, 1000),
      downDetectorMaxMarkers: int(process.env.DOWNDETECTOR_MAX_MARKERS, 200),
      downDetectorGeoPrecision: int(process.env.DOWNDETECTOR_GEO_PRECISION, 2),
      downDetectorPollMs: int(process.env.DOWNDETECTOR_POLL_MS, 180000),
      hibpApiKey: process.env.HIBP_API_KEY ?? "",
      virusTotalApiKey: process.env.VIRUSTOTAL_API_KEY ?? "",
      abuseIpDbApiKey: process.env.ABUSEIPDB_API_KEY ?? "",
      hunterApiKey: process.env.HUNTER_API_KEY ?? "",
      shodanApiKey: process.env.SHODAN_API_KEY ?? "",
      maritimeProvider: (process.env.MARITIME_PROVIDER ?? "aisstream").toLowerCase(),
      maritimeFeedUrl: process.env.MARITIME_FEED_URL ?? "",
      aisstreamUrl:
        process.env.AISSTREAM_URL ?? "wss://stream.aisstream.io/v0/stream",
      aisstreamApiKey: process.env.AISSTREAM_API_KEY ?? "",
      aisstreamBoundingBoxes:
        process.env.AISSTREAM_BOUNDING_BOXES ??
        "[[[-90,-180],[90,180]]]",
      aisstreamMessageTypes:
        process.env.AISSTREAM_MESSAGE_TYPES ??
        "PositionReport,StandardClassBPositionReport,ExtendedClassBPositionReport,ShipStaticData",
      aisstreamVesselMmsi:
        process.env.AISSTREAM_VESSEL_MMSI ?? "",
      aisstreamMaxVessels: int(process.env.AISSTREAM_MAX_VESSELS, 2000),
      aisstreamStaleMs: int(process.env.AISSTREAM_STALE_MS, 1800000),
      aisstreamReconnectMs: int(process.env.AISSTREAM_RECONNECT_MS, 10000),
      maritimePollMs: int(process.env.MARITIME_POLL_MS, 30000),
      intelPollMs: int(process.env.INTEL_POLL_MS, 120000),
      analyticsPollMs: int(process.env.ANALYTICS_POLL_MS, 30000),
      metricsHistoryPoints: int(process.env.METRICS_HISTORY_POINTS, 240)
    }
  }
};

export const requiredForRuntime = [];
