import { initRenderBudget } from "./render-budget.js";
import { sampleCachedMotion, updateStemPositions, oncePerFrame, sampleOrbitSegment } from "./render-performance.js";
import { renderPrecision, renderAssetSummary, renderNearbySummary, styleRiskChart, initPrecision, updatePrecisionTimeline } from "./precision.js";
import { initWorkspace } from "./workspace.js";
import { tacticalGlyph, headingBetween, registerTacticalMarker, initTacticalInteraction } from "./tactical-markers.js";
import { initTacticalGlobe } from "./tactical-globe.js";
import * as satellite from "./vendor/satellite.es.js";
import { initGlobeAppearance } from "./globe-appearance.js";
const config = await fetch("/api/config").then((r) => r.json());
const catalogPayload = await fetch("/api/catalogs").then((r) => r.json());
const APP_BUILD_ID = "vector-2";
let displayPaused = false;
let pausedAnimationTime = null;
let overviewDeclutter = true;
let gatewayLatency = null;

if (config?.map?.cesiumIonToken) Cesium.Ion.defaultAccessToken = config.map.cesiumIonToken;
if (config?.map?.googleMapsApiKey) Cesium.GoogleMaps.defaultApiKey = config.map.googleMapsApiKey;

let mapNotice = "";
const naturalEarth = await Cesium.TileMapServiceImageryProvider.fromUrl(Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII"));
const viewer = new Cesium.Viewer("cesiumContainer", {
  timeline: false, animation: false, geocoder: false, homeButton: false,
  sceneModePicker: false, navigationHelpButton: false, fullscreenButton: false,
  baseLayerPicker: false, terrainProvider: new Cesium.EllipsoidTerrainProvider(),
  baseLayer: new Cesium.ImageryLayer(naturalEarth), infoBox: false, selectionIndicator: false
});
const tacticalInteraction = initTacticalInteraction(viewer);
let photorealTileset = null;
const baseImageryLayerRefs = [viewer.imageryLayers.get(0)];
baseImageryLayerRefs[0].brightness = 0.8;
baseImageryLayerRefs[0].saturation = 0.55;
baseImageryLayerRefs[0].contrast = 1.25;

try {
  const nightProvider = new Cesium.UrlTemplateImageryProvider({
    url: '/assets/earth-realistic/{z}/{x}/{y}.jpg',
    tilingScheme: new Cesium.GeographicTilingScheme(),
    tileWidth: 512, tileHeight: 512, maximumLevel: 4,
    credit: 'NASA · Blue Marble / Black Marble 2016 · Vector cartographic grade'
  });
  const nightLayer = viewer.imageryLayers.addImageryProvider(nightProvider);
  nightLayer.brightness = 1.0; nightLayer.contrast = 1.04; nightLayer.saturation = 1.0; nightLayer.alpha=1.0;
  baseImageryLayerRefs.push(nightLayer);
} catch(error) { console.warn('Night basemap unavailable; using Natural Earth imagery.', error.message); }

let worldTerrainProvider = new Cesium.EllipsoidTerrainProvider();
const ellipsoidTerrainProvider = new Cesium.EllipsoidTerrainProvider();
if (config?.map?.cesiumIonToken) {
  Cesium.createWorldTerrainAsync().then(provider => {
    worldTerrainProvider = provider;
    if (!photorealTileset) viewer.terrainProvider = provider;
  }).catch(() => { mapNotice = "Standard globe · terrain service unavailable"; });
}
if (config?.map?.googleMapsApiKey) {
  try {
    photorealTileset = await Cesium.createGooglePhotorealistic3DTileset();
    viewer.scene.primitives.add(photorealTileset);
  } catch { mapNotice = "Standard globe · Google 3D tiles unavailable"; }
} else { mapNotice = "Standard globe · Google 3D tiles not configured"; }
viewer.scene.globe.enableLighting = false;
viewer.scene.globe.depthTestAgainstTerrain = false;
viewer.scene.fxaa = true;
viewer.scene.skyAtmosphere.brightnessShift = 0.25;
viewer.scene.skyAtmosphere.saturationShift = 0.2;
viewer.scene.postProcessStages.fxaa.enabled = true;
const globeAppearance = initGlobeAppearance(viewer);
initRenderBudget(viewer);
const syncEarthMode = initTacticalGlobe(viewer, mode => setGlobeRenderMode(mode));
viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(-42, 37, 14500000), orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 } });
const modeSelect = document.getElementById("modeSelect");
const liveBtn = document.getElementById("liveBtn");
const replayBtn = document.getElementById("replayBtn");
const replayPlayBtn = document.getElementById("replayPlayBtn");
const replayPauseBtn = document.getElementById("replayPauseBtn");
const speedSelect = document.getElementById("speedSelect");
const scrubber = document.getElementById("replayScrubber");
const replayStatus = document.getElementById("replayStatus");
const graphDock = document.getElementById("graphDock");
const graphScopeMeta = document.getElementById("graphScopeMeta");
const markerInfo = document.getElementById("markerInfo");
const filterContainer = document.getElementById("datasetFilters");
const categorySwitch = document.getElementById("categorySwitch");
const viewRadiusSlider = document.getElementById("viewRadiusSlider");
const viewRadiusLabel = document.getElementById("viewRadiusLabel");
const toggleLeftPanelBtn = document.getElementById("toggleLeftPanelBtn");
const toggleRightPanelBtn = document.getElementById("toggleRightPanelBtn");
const leftPanel = document.getElementById("hud");
const rightPanel = document.getElementById("contextPanel");
const contextMeta = document.getElementById("contextMeta");
const contextContent = document.getElementById("contextContent");
const locationStatus = document.getElementById("locationStatus");
const shareLocationBtn = document.getElementById("shareLocationBtn");
const refreshLocationBtn = document.getElementById("refreshLocationBtn");
const clearLocationBtn = document.getElementById("clearLocationBtn");
const satelliteMeta = document.getElementById("satelliteMeta");
const satelliteDetails = document.getElementById("satelliteDetails");
const entityDetailMeta = document.getElementById("entityDetailMeta");
const entityDetails = document.getElementById("entityDetails");
const tabButtons = Array.from(document.querySelectorAll(".tab-btn"));
const tabBodies = Array.from(document.querySelectorAll(".tab-body"));
const cctvRegionSelect = document.getElementById("cctvRegionSelect");
const cctvRegionSummary = document.getElementById("cctvRegionSummary");
const cctvRegionList = document.getElementById("cctvRegionList");
const osintTypeSelect = document.getElementById("osintTypeSelect");
const osintDomainInput = document.getElementById("osintDomainInput");
const osintIpInput = document.getElementById("osintIpInput");
const osintEmailInput = document.getElementById("osintEmailInput");
const osintUrlInput = document.getElementById("osintUrlInput");
const osintRadiusInput = document.getElementById("osintRadiusInput");
const osintRunBtn = document.getElementById("osintRunBtn");
const osintUseMarkerBtn = document.getElementById("osintUseMarkerBtn");
const osintOutput = document.getElementById("osintOutput");
const feedNewsList = document.getElementById("feedNewsList");
const feedCyberList = document.getElementById("feedCyberList");
const kpiComposite = document.getElementById("kpiComposite");
const kpiFlights = document.getElementById("kpiFlights");
const kpiSatellites = document.getElementById("kpiSatellites");
const kpiCyber = document.getElementById("kpiCyber");
const kpiPower = document.getElementById("kpiPower");
const riskChartCanvas = document.getElementById("riskChart");
const categoryChartCanvas = document.getElementById("categoryChart");
const marketChartCanvas = document.getElementById("marketChart");
const satOrbitToggle = document.getElementById("satOrbitToggle");
const satStemToggle = document.getElementById("satStemToggle");
const labelDensitySelect = document.getElementById("labelDensitySelect");
const markerOpacitySlider = document.getElementById("markerOpacitySlider");
const markerOpacityLabel = document.getElementById("markerOpacityLabel");
const markerScaleGlobal = document.getElementById("markerScaleGlobal");
const markerScaleGlobalLabel = document.getElementById("markerScaleGlobalLabel");
const markerScaleAircraft = document.getElementById("markerScaleAircraft");
const markerScaleAircraftLabel = document.getElementById("markerScaleAircraftLabel");
const markerScaleSatellites = document.getElementById("markerScaleSatellites");
const markerScaleSatellitesLabel = document.getElementById("markerScaleSatellitesLabel");
const markerScaleMaritime = document.getElementById("markerScaleMaritime");
const markerScaleMaritimeLabel = document.getElementById("markerScaleMaritimeLabel");
const markerScaleInfrastructure = document.getElementById("markerScaleInfrastructure");
const markerScaleInfrastructureLabel = document.getElementById("markerScaleInfrastructureLabel");
const markerScaleEnvironmental = document.getElementById("markerScaleEnvironmental");
const markerScaleEnvironmentalLabel = document.getElementById("markerScaleEnvironmentalLabel");
const camHomeBtn = document.getElementById("camHomeBtn");
const camNorthBtn = document.getElementById("camNorthBtn");
const zoomInBtn = document.getElementById("zoomInBtn");
const zoomOutBtn = document.getElementById("zoomOutBtn");
const scene3dBtn = document.getElementById("scene3dBtn");
const scene2dBtn = document.getElementById("scene2dBtn");
const globeRealBtn = document.getElementById("globeRealBtn");
const globeFlatBtn = document.getElementById("globeFlatBtn");
const quickSearchInput = document.getElementById("quickSearchInput");

const entityMaps = {
  aircraft: new Map(),
  satellites: new Map(),
  seismic: new Map(),
  cctv: new Map(),
  maritime: new Map(),
  downdetector: new Map(),
  news: new Map(),
  weatherAlerts: new Map()
};

const trafficLayer = {
  polylines: new Map(),
  particles: []
};

const categoryCatalogLayer = new Map();
const catalogs = catalogPayload?.catalogs || {};
const satelliteProvider = config?.feeds?.satelliteProvider || "n2yo";

const layerVisibility = {
  aircraft: true,
  satellites: true,
  seismic: true,
  traffic: true,
  cctv: true,
  maritime: true,
  downdetector: true,
  news: true,
  weatherAlerts: true
};

const liveSnapshot = {
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
const liveTotals = {
  aircraft: 0,
  satellites: 0,
  maritime: 0
};
const satelliteDataById = new Map();
const downDetectorDataById = new Map();
const aircraftDataById = new Map();
const maritimeDataById = new Map();
let cctvRegions = { other: [] };
let intelSummary = null;
let intelHistory = [];
const chartState = {
  risk: null,
  category: null,
  market: null
};
const localChartHistory = [];
const GRAPH_RADIUS_MILES = 5000;
let graphFocus = null;
const LOCATION_CONSENT_KEY = "vector_location_consent_v1";
const legacyConsent = localStorage.getItem("sentinel_location_consent_v1");
if (legacyConsent && !localStorage.getItem(LOCATION_CONSENT_KEY)) localStorage.setItem(LOCATION_CONSENT_KEY, legacyConsent);
const LOCATION_PROMPTED_KEY = "vector_location_prompted_v1";
if (localStorage.getItem("sentinel_location_prompted_v1") && !localStorage.getItem(LOCATION_PROMPTED_KEY)) localStorage.setItem(LOCATION_PROMPTED_KEY, "1");

let markerEntity = null;
let currentMarker = null;
let currentCategory = "geopolitical";
let selectedSatelliteId = null;
let userLocation = null;
let aircraftDisplayLimit = 90;
const MOTION_BLEND_MS = {
  aircraft: 12000,
  maritime: 18000,
  satellite: 6000
};
let lastClientLogTs = 0;
let lastRenderLogTs = 0;
const uiState = {
  showSatelliteArcs: false,
  showSatelliteStems: false,
  labelDensity: "minimal",
  markerOpacity: 1,
  layerScale: {
    global: 1,
    aircraft: 1,
    satellites: 1.2,
    maritime: 1,
    infrastructure: 1,
    environmental: 1
  }
};

let liveMode = true;
let replayEvents = [];
let replayTimer = null;
let replayCursor = 0;
let replayCurrentTime = Date.now();
let replayStartTime = Date.now();
let replayEndTime = Date.now();
let replayIsPlaying = false;
let globeRenderMode = "real";

const stages = {};
stages.flatSurface = viewer.scene.postProcessStages.add(
  new Cesium.PostProcessStage({
    fragmentShader: `
    uniform sampler2D colorTexture;
    in vec2 v_textureCoordinates;
    void main() {
      vec4 c = texture(colorTexture, v_textureCoordinates);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      vec3 tint = vec3(0.18, 0.28, 0.45);
      vec3 outColor = mix(vec3(l), tint + vec3(l) * 0.35, 0.65);
      out_FragColor = vec4(outColor, 1.0);
    }`
  })
);
stages.crt = viewer.scene.postProcessStages.add(
  new Cesium.PostProcessStage({
    fragmentShader: `
    uniform sampler2D colorTexture;
    in vec2 v_textureCoordinates;
    void main() {
      vec4 color = texture(colorTexture, v_textureCoordinates);
      float scan = sin(v_textureCoordinates.y * 900.0) * 0.07;
      color.rgb += scan;
      color.rgb *= vec3(0.88, 1.02, 0.93);
      out_FragColor = color;
    }`
  })
);
stages.nvg = viewer.scene.postProcessStages.add(
  new Cesium.PostProcessStage({
    fragmentShader: `
    uniform sampler2D colorTexture;
    in vec2 v_textureCoordinates;
    void main() {
      vec4 c = texture(colorTexture, v_textureCoordinates);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      out_FragColor = vec4(vec3(0.1, 1.0, 0.2) * l * 1.2, 1.0);
    }`
  })
);
stages.flir = viewer.scene.postProcessStages.add(
  new Cesium.PostProcessStage({
    fragmentShader: `
    uniform sampler2D colorTexture;
    in vec2 v_textureCoordinates;
    vec3 thermal(float t) { return mix(vec3(0.0,0.0,0.1), vec3(1.0,0.2,0.0), t); }
    void main() {
      vec4 c = texture(colorTexture, v_textureCoordinates);
      float l = dot(c.rgb, vec3(0.3, 0.59, 0.11));
      out_FragColor = vec4(thermal(l), 1.0);
    }`
  })
);
stages.anime = viewer.scene.postProcessStages.add(
  new Cesium.PostProcessStage({
    fragmentShader: `
    uniform sampler2D colorTexture;
    in vec2 v_textureCoordinates;
    void main() {
      vec4 c = texture(colorTexture, v_textureCoordinates);
      c.rgb = floor(c.rgb * 4.0) / 4.0;
      out_FragColor = c;
    }`
  })
);

function setMode(mode) {
  for (const stage of Object.values(stages)) stage.enabled = false;
  // Visibility is rendered only on the Earth surface, never on markers.
  if (mode !== "default" && stages[mode]) stages[mode].enabled = true;
}
setMode("default");
modeSelect.value = "default";
modeSelect.addEventListener("change", () => setMode(modeSelect.value));
viewer.camera.percentageChanged = 0.01;

function setGlobeRenderButtons() {
  if (globeRealBtn) globeRealBtn.classList.toggle("active", globeRenderMode === "real");
  if (globeFlatBtn) globeFlatBtn.classList.toggle("active", globeRenderMode === "flat");
}

function setSurfaceComposition(flat) {
  const realWithPhotoreal = !flat && Boolean(photorealTileset);

  // Real mode with Google photorealistic tiles:
  // keep only one globe surface source to prevent overlap artifacts.
  if (realWithPhotoreal) {
    if (photorealTileset) photorealTileset.show = true;
    viewer.scene.globe.show = false;
    viewer.scene.globe.depthTestAgainstTerrain = false;
    if (viewer.terrainProvider !== ellipsoidTerrainProvider) {
      viewer.terrainProvider = ellipsoidTerrainProvider;
    }
    for (const layer of baseImageryLayerRefs) {
      if (layer) layer.show = false;
    }
    return;
  }

  // Flat mode or no photorealistic tiles: use Cesium globe stack.
  if (photorealTileset) photorealTileset.show = false;
  viewer.scene.globe.show = true;
  viewer.scene.globe.depthTestAgainstTerrain = true;
  if (viewer.terrainProvider !== worldTerrainProvider) {
    viewer.terrainProvider = worldTerrainProvider;
  }
  for (const layer of baseImageryLayerRefs) {
    if (layer) layer.show = true;
  }
}

function setGlobeRenderMode(mode) {
  globeRenderMode = mode === "flat" ? "flat" : "real";
  const flat = globeRenderMode === "flat";
  if(flat && viewer.scene.mode===Cesium.SceneMode.SCENE2D) viewer.scene.morphTo3D(.5);
  setSurfaceComposition(flat);
  globeAppearance.visibilityMode = flat;
  syncEarthMode(globeRenderMode);
  viewer.scene.globe.baseColor = flat
    ? Cesium.Color.fromCssColorString("#1a2438")
    : Cesium.Color.fromCssColorString("#0a1221");
  viewer.scene.globe.showGroundAtmosphere = false;
  setMode(modeSelect?.value || "default");
  setGlobeRenderButtons();
  pushDebug(
    `globe render mode=${globeRenderMode} photoreal=${Boolean(photorealTileset)} globeShow=${viewer.scene.globe.show}`
  );
}

function setMarkerInfo(marker, loadedCount = null) {
  if (!marker) {
    markerInfo.textContent = "Marker: click map to set analysis focus";
    return;
  }
  const countText = loadedCount === null ? "" : ` | nearest loaded: ${loadedCount}`;
  markerInfo.textContent = `Marker: ${marker.lat.toFixed(4)}, ${marker.lon.toFixed(4)}${countText}`;
}

function pushDebug(line, { force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastClientLogTs < 1500) return;
  lastClientLogTs = now;
  fetch("/api/client-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope: "frontend", line })
  }).catch(() => {});
}

function countVisibleRecords(layer, map) {
  let total = 0;
  let visible = 0;
  for (const record of map.values()) {
    total += 1;
    if (layer === "satellites") {
      if (record.point?.show !== false || record.path?.show !== false || record.stem?.show !== false) {
        visible += 1;
      }
      continue;
    }
    if (record.cap || record.stem || record.halo) {
      const shown =
        (record.cap && record.cap.show !== false) ||
        (record.stem && record.stem.show !== false) ||
        (record.halo && record.halo.show !== false);
      if (shown) visible += 1;
      continue;
    }
    if (record?.show !== false) visible += 1;
  }
  return { total, visible };
}

function logRenderStats(reason = "tick", { force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastRenderLogTs < 5000) return;
  lastRenderLogTs = now;
  const ac = countVisibleRecords("aircraft", entityMaps.aircraft);
  const sat = countVisibleRecords("satellites", entityMaps.satellites);
  const ship = countVisibleRecords("maritime", entityMaps.maritime);
  pushDebug(
    `render ${reason} | aircraft ${ac.visible}/${ac.total} | sat ${sat.visible}/${sat.total} | ship ${ship.visible}/${ship.total}` +
      ` | live totals a=${Number(liveTotals.aircraft || 0)} s=${Number(liveTotals.satellites || 0)} m=${Number(liveTotals.maritime || 0)}`,
    { force }
  );
}

function setMarkerEntity(marker) {
  if (!marker) {
    if (markerEntity) viewer.entities.remove(markerEntity);
    markerEntity = null; currentMarker = null;
    return;
  }
  currentMarker = marker;
  if (!markerEntity) {
    markerEntity = viewer.entities.add({
      id: "selected-marker",
      position: Cesium.Cartesian3.fromDegrees(marker.lon, marker.lat, 25),
      billboard: { image: tacticalGlyph("•", "#84e7ff", true), scale: .44 },
      label: {
        text: "LOCATION",
        font: "11px monospace",
        fillColor: Cesium.Color.fromCssColorString("#b9efff"),
        pixelOffset: new Cesium.Cartesian2(0, -18)
      }
    });
  } else {
    markerEntity.position = Cesium.Cartesian3.fromDegrees(marker.lon, marker.lat, 25);
  }
  applyLayerVisibility();
}

function setLocationStatus(text) {
  locationStatus.textContent = text;
}

function flyCameraTo(lat, lon, height = 2200000) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(lon, lat, height),
    duration: 1.1
  });
}

function collectSearchCandidates() {
  const out = [];
  for (const row of liveSnapshot.aircraft || []) {
    if (!Number.isFinite(Number(row?.lat)) || !Number.isFinite(Number(row?.lon))) continue;
    out.push({
      type: "aircraft",
      id: String(row?.id || row?.icao24 || row?.callsign || ""),
      label: `${row?.callsign || "AIR"} ${row?.icao24 || row?.id || ""}`.trim(),
      lat: Number(row.lat),
      lon: Number(row.lon),
      raw: row
    });
  }
  for (const row of liveSnapshot.satellites || []) {
    if (!Number.isFinite(Number(row?.lat)) || !Number.isFinite(Number(row?.lon))) continue;
    out.push({
      type: "satellite",
      id: String(row?.id || row?.noradId || row?.name || ""),
      label: `${row?.name || "SAT"} ${row?.noradId || row?.id || ""}`.trim(),
      lat: Number(row.lat),
      lon: Number(row.lon),
      raw: row
    });
  }
  for (const row of liveSnapshot.maritime || []) {
    if (!Number.isFinite(Number(row?.lat)) || !Number.isFinite(Number(row?.lon))) continue;
    out.push({
      type: "maritime",
      id: String(row?.id || row?.mmsi || row?.name || ""),
      label: `${row?.name || "SHIP"} ${row?.mmsi || row?.id || ""}`.trim(),
      lat: Number(row.lat),
      lon: Number(row.lon),
      raw: row
    });
  }
  return out;
}

function scoreSearchCandidate(candidate, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return -1;
  const haystack = `${candidate.label} ${candidate.id} ${candidate.type}`.toLowerCase();
  if (haystack === q) return 200;
  if (haystack.startsWith(q)) return 120;
  if (haystack.includes(q)) return 60;
  return -1;
}

async function runQuickSearch(query) {
  const q = String(query || "").trim();
  if (!q) return;
  const candidates = collectSearchCandidates();
  let best = null;
  let bestScore = -1;
  for (const c of candidates) {
    const score = scoreSearchCandidate(c, q);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  if (!best || bestScore < 0) {
    markerInfo.textContent = `Search: no match for "${q}"`;
    showWorkspaceNotice(`No matching callsign or asset for "${q}".`);
    return;
  }

  const marker = { lat: best.lat, lon: best.lon };
  setMarkerEntity(marker);
  setMarkerInfo(marker);
  activateGraphsAt(best.lat, best.lon, `search:${best.type}`);
  flyCameraTo(best.lat, best.lon, best.type === "satellite" ? 2800000 : 2100000);
  updateContextForMarker(marker);

  if (best.type === "satellite") {
    selectSatelliteById(best.id);
  } else if (best.type === "aircraft") {
    showAircraftDetails(best.raw);
  } else if (best.type === "maritime") {
    showMaritimeDetails(best.raw);
  }
  markerInfo.textContent = `Search lock: ${best.label}`;
  showWorkspaceNotice(`Focused ${best.label}`);
  pushDebug(`search hit type=${best.type} id=${best.id}`);
}

let uiMotionInitialized = false;
function initUiMotion() {
  if (uiMotionInitialized) return;
  uiMotionInitialized = true;
  document.body.classList.add("ready");
}

function setActiveTab(tab) {
  for (const btn of tabButtons) {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  }
  for (const body of tabBodies) {
    body.classList.toggle("active", body.dataset.tabBody === tab);
  }
}

function renderListCards(target, items, titleFn, subFn) {
  target.innerHTML = "";
  if (!items || items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "tiny";
    empty.textContent = "No data available.";
    target.appendChild(empty);
    return;
  }
  for (const item of items) {
    const card = document.createElement("div");
    card.className = "list-card";
    const title = document.createElement("div");
    title.className = "list-card-title";
    title.textContent = titleFn(item);
    const sub = document.createElement("div");
    sub.className = "list-card-sub";
    sub.textContent = subFn(item);
    card.appendChild(title);
    card.appendChild(sub);
    target.appendChild(card);
  }
}

function isLikelyImage(url) {
  return /\.(png|jpe?g|webp|gif)(\?|$)/i.test(String(url || ""));
}

function isLikelyVideo(url) {
  return /\.(mp4|m3u8|webm)(\?|$)/i.test(String(url || ""));
}

function publicMediaUrl(value) {
  try { const url = new URL(String(value)); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; }
  catch { return ''; }
}

function cctvPreviewUrl(cam) {
  return (
    cam?.previewUrl ||
    cam?.snapshotUrl ||
    cam?.imageUrl ||
    cam?.thumbUrl ||
    cam?.streamUrl ||
    cam?.detailsUrl ||
    ""
  );
}

function renderCctvPreviewCard(cam) {
  const card = document.createElement("div");
  card.className = "cctv-card";

  const media = document.createElement("div");
  media.className = "cctv-card-media";
  const preview = publicMediaUrl(cctvPreviewUrl(cam));
  if (preview && isLikelyImage(preview)) {
    const img = document.createElement("img");
    img.src = preview;
    img.alt = cam.label || cam.id || "CCTV";
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => {
      media.innerHTML = "";
      const fallback = document.createElement("div");
      fallback.className = "cctv-card-fallback";
      fallback.textContent = "Preview blocked";
      media.appendChild(fallback);
    });
    media.appendChild(img);
  } else if (preview && isLikelyVideo(preview)) {
    const video = document.createElement("video");
    video.src = preview;
    video.muted = true;
    video.playsInline = true;
    video.loop = true;
    video.autoplay = true;
    video.addEventListener("error", () => {
      media.innerHTML = "";
      const fallback = document.createElement("div");
      fallback.className = "cctv-card-fallback";
      fallback.textContent = "Preview blocked";
      media.appendChild(fallback);
    });
    media.appendChild(video);
  } else {
    const fallback = document.createElement("div");
    fallback.className = "cctv-card-fallback";
    fallback.textContent = "Preview unavailable";
    media.appendChild(fallback);
  }
  card.appendChild(media);

  const body = document.createElement("div");
  body.className = "cctv-card-body";
  const title = document.createElement("div");
  title.className = "cctv-card-title";
  title.textContent = cam.label || cam.id || "Camera";
  const sub = document.createElement("div");
  sub.className = "cctv-card-sub";
  sub.textContent = `${formatNumber(cam.lat, 4)}, ${formatNumber(cam.lon, 4)} | ${cam.source || "source"}`;
  body.appendChild(title);
  body.appendChild(sub);
  if (publicMediaUrl(cam.streamUrl || cam.detailsUrl)) {
    const link = document.createElement("a");
    link.className = "cctv-card-link";
    link.href = publicMediaUrl(cam.streamUrl || cam.detailsUrl);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Open Feed";
    body.appendChild(link);
  }
  card.appendChild(body);
  return card;
}

function renderCctvRegion() {
  const keys = Object.keys(cctvRegions);
  if (keys.length === 0) {
    cctvRegionSelect.innerHTML = "";
    cctvRegionSummary.textContent = "No camera regions loaded.";
    cctvRegionList.innerHTML = "";
    return;
  }

  const current = cctvRegionSelect.value;
  cctvRegionSelect.innerHTML = "";
  for (const key of keys) {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = key.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
    cctvRegionSelect.appendChild(option);
  }
  const key = keys.includes(current) ? current : keys[0];
  cctvRegionSelect.value = key;
  const items = cctvRegions[key] || [];
  cctvRegionSummary.textContent = `${key.replace(/_/g, " ")} cameras: ${items.length}`;
  cctvRegionList.innerHTML = "";
  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "tiny";
    empty.textContent = "No cameras available for this region.";
    cctvRegionList.appendChild(empty);
    return;
  }
  for (const cam of items.slice(0, 120)) {
    cctvRegionList.appendChild(renderCctvPreviewCard(cam));
  }
}

function renderFeedPanels() {
  renderListCards(
    feedNewsList,
    (liveSnapshot.news || []).slice(0, 30),
    (n) => n.title || "News item",
    (n) => `${n.source || "source"} ${n.seendate ? `| ${n.seendate}` : ""}`
  );
  renderListCards(
    feedCyberList,
    (liveSnapshot.cyber || []).slice(0, 30),
    (c) => c.cve || c.id,
    (c) => `${c.vendor || "vendor"} / ${c.product || "product"}`
  );
}

function ensureCharts() {
  if (!window.Chart) return;
  if (!chartState.risk && riskChartCanvas) {
    const ctx = riskChartCanvas.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 0, 170);
    grad.addColorStop(0, "rgba(120,214,255,0.38)");
    grad.addColorStop(1, "rgba(120,214,255,0.01)");
    chartState.risk = new Chart(riskChartCanvas.getContext("2d"), {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "Local Risk",
            data: [],
            borderColor: "#72d7ff",
            backgroundColor: grad,
            fill: true,
            borderWidth: 2,
            tension: 0.38,
            pointRadius: 0,
            pointHoverRadius: 3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: "#6f8fb8", maxTicksLimit: 6 }, grid: { color: "rgba(92,130,178,0.15)" } },
          y: { min: 0, max: 100, ticks: { color: "#90abc8", font: { size: 10 } }, grid: { color: "rgba(92,130,178,0.15)" } }
        }
      }
    });
  }
  if (!chartState.category && categoryChartCanvas) {
    chartState.category = new Chart(categoryChartCanvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: ["Geopolitical", "Finance", "Infrastructure", "Environmental"],
        datasets: [{ data: [0, 0, 0, 0], backgroundColor: ["#ff845e", "#62bcff", "#70e0ad", "#d0c75f"] }]
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { ticks: { color: "#90abc8", font: { size: 10 } } }, x: { min: 0, max: 100, ticks: { color: "#90abc8", font: { size: 10 } } } }
      }
    });
  }
  if (!chartState.market && marketChartCanvas) {
    chartState.market = new Chart(marketChartCanvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: [],
        datasets: [{ label: "Count", data: [], backgroundColor: [] }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { ticks: { color: "#90abc8", font: { size: 10 } }, grid: { color: "rgba(92,130,178,0.15)" } },
          x: { ticks: { color: "#90abc8", font: { size: 10 } }, grid: { color: "rgba(92,130,178,0.12)" } }
        }
      }
    });
  }
}

const scheduleKpiRefresh = oncePerFrame(() => renderKpisAndCharts());
function updateKpisAndCharts() { scheduleKpiRefresh(); }

function renderKpisAndCharts() {
  updateAircraftLimitLabel();
  kpiFlights.textContent = String(liveTotals.aircraft || liveSnapshot.aircraft.length || 0);
  kpiSatellites.textContent = String(liveTotals.satellites || liveSnapshot.satellites.length || 0);
  kpiCyber.textContent = String(liveSnapshot.cyber.length || 0);
  const infra = intelSummary?.categories?.infrastructure;
  kpiPower.textContent = infra ? `${formatNumber(infra.stressScore, 1)} (${infra.status || "n/a"})` : "--";
  kpiComposite.textContent = intelSummary?.score?.compositeRisk !== undefined
    ? `${formatNumber(intelSummary.score.compositeRisk, 1)} (${intelSummary.score.posture || ""})`
    : "--";

  renderWorkspaceData();
  if (!graphFocus) { renderGlobalCharts(); return; }
  sampleLocalGraphHistory();

  ensureCharts();
  if (chartState.risk) {
    const points = localChartHistory.slice(-90);
    const values = points.map((p) => p.localRisk || 0);
    chartState.risk.data.labels = points.map((p) => new Date(p.ts).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',hour12:false}));
    chartState.risk.data.datasets[0].data = values;
    styleRiskChart(chartState.risk,graphFocus,points.map(p=>p.ts));
  }
  if (chartState.category) {
    const latestLocal = localChartHistory[localChartHistory.length - 1] || buildLocalGraphSnapshot();
    chartState.category.data.datasets[0].data = [
      latestLocal.categoryScores.geo || 0,
      latestLocal.categoryScores.finance || 0,
      latestLocal.categoryScores.infra || 0,
      latestLocal.categoryScores.env || 0
    ];
    chartState.category.update("none");
  }
  if (chartState.market) {
    const latestLocal = localChartHistory[localChartHistory.length - 1] || buildLocalGraphSnapshot();
    const locCounts = latestLocal.counts || {};
    const metrics = [
      ["FLTS", (locCounts.flights || []).length],
      ["SAT", (locCounts.satellites || []).length],
      ["SHIP", (locCounts.maritime || []).length],
      ["QUAKE", (locCounts.seismic || []).length],
      ["WX", (locCounts.weather || []).length],
      ["CCTV", (locCounts.cctv || []).length],
      ["OUT", (locCounts.outages || []).length],
      ["NEWS", (locCounts.news || []).length]
    ];
    chartState.market.data.labels = metrics.map((m) => m[0]);
    chartState.market.data.datasets[0].data = metrics.map((m) => m[1]);
    chartState.market.data.datasets[0].backgroundColor = metrics.map((m) =>
      m[1] > 0 ? "#70d6ff" : "#24385f"
    );
    chartState.market.update("none");
  }
}

function formatNumber(value, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : "n/a";
}

function movingAverage(values, windowSize) {
  const w = Math.max(1, Math.floor(windowSize || 1));
  if (w <= 1) return values.slice();
  const out = [];
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += Number(values[i] || 0);
    if (i >= w) sum -= Number(values[i - w] || 0);
    const denom = i + 1 < w ? i + 1 : w;
    out.push(sum / Math.max(1, denom));
  }
  return out;
}

function stripStemSuffix(value) {
  return String(value || "").endsWith("-stem")
    ? String(value).slice(0, -5)
    : String(value || "");
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

function getFocusPoint() {
  if (currentMarker && Number.isFinite(currentMarker.lat) && Number.isFinite(currentMarker.lon)) {
    return currentMarker;
  }
  if (userLocation && Number.isFinite(userLocation.lat) && Number.isFinite(userLocation.lon)) {
    return userLocation;
  }
  return null;
}

function normalizeLonDelta(delta) {
  let d = Number(delta);
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

let animationFrameTime;
viewer.scene.preUpdate.addEventListener(() => { animationFrameTime = getAnimationClockMs(); });
function getRecordMotionPoint(record, now = animationFrameTime ?? getAnimationClockMs()) { return sampleCachedMotion(record, now); }

function seedMotion(record, item, altitudeM) {
  const lon = Number(item.lon);
  const lat = Number(item.lat);
  const alt = Number(altitudeM);
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || !Number.isFinite(alt)) return;
  const now = getAnimationClockMs();
  record.motion = {
    from: { lon, lat, altitudeM: alt },
    to: { lon, lat, altitudeM: alt },
    fromTs: now,
    toTs: now + 1
  };
  record.lat = lat;
  record.lon = lon;
}

function updateMotion(record, item, altitudeM, blendMs) {
  const lon = Number(item.lon);
  const lat = Number(item.lat);
  const alt = Number(altitudeM);
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || !Number.isFinite(alt)) return;
  const now = getAnimationClockMs();
  const observed=item.timestamp;
  if(record.observationTimestamp===observed && record.motion?.to.lon===lon && record.motion?.to.lat===lat && record.motion?.to.altitudeM===alt) return;
  record.observationTimestamp=observed;
  const elapsed = now - (record.receivedAt || now);
  record.receivedAt = now;
  const speed = Number(item.velocityMps ?? item.speedMps ?? item.speedMs ?? (item.sog == null ? NaN : Number(item.sog)*.514444));
  const headingValue = item.headingDeg ?? item.heading ?? item.cog;
  const heading = headingValue == null ? NaN : Number(headingValue);
  const observationTime=typeof item.timestamp === "number" ? item.timestamp : Date.parse(item.timestamp);
  const fresh=!Number.isFinite(observationTime) || Math.abs(now-observationTime)<60000;
  const nextVelocity = fresh && Number.isFinite(speed) && Number.isFinite(heading) ? { speed: Math.max(0,speed), heading } : null;
  const current = getRecordMotionPoint(record, now) || {
    lon: Number(record.lon),
    lat: Number(record.lat),
    altitudeM: alt
  };
  record.velocity=nextVelocity;
  const stationary=current.lon===lon && current.lat===lat;
  record.motion = {
    from: {
      lon: Number.isFinite(current.lon) ? current.lon : lon,
      lat: Number.isFinite(current.lat) ? current.lat : lat,
      altitudeM: Number.isFinite(current.altitudeM) ? current.altitudeM : alt
    },
    to: { lon, lat, altitudeM: alt },
    fromTs: now,
    toTs: stationary ? now+1 : now + Math.max(1200, Math.min(20000, elapsed > 1000 ? elapsed*.85 : Number(blendMs) || 8000))
  };
  record.lat = lat;
  record.lon = lon;
  if (record.history && (record.layer === "aircraft" || record.layer === "maritime")) {
    const previous=record.history.at(-1);
    if (!previous || previous.lon!==lon || previous.lat!==lat) record.history.push({lon,lat,altitudeM:alt});
    if(record.history.length>12) record.history.shift();
  }
}

function sliderToAircraftLimit(value, totalAvailable = 0) {
  const v = Number(value);
  if (!Number.isFinite(v) || v >= 100) return null;
  const t = Math.max(0, Math.min(1, v / 100));
  const curved = t * t;
  const hardMin = 25;
  const dynamicMax = Math.max(120, Math.min(10000, Number(totalAvailable) || 120));
  return Math.max(hardMin, Math.round(hardMin + (dynamicMax - hardMin) * curved));
}

function updateAircraftLimitLabel() {
  if (!viewRadiusLabel) return;
  const total = Number(liveTotals.aircraft || liveSnapshot.aircraft.length || 0);
  if (aircraftDisplayLimit === null) {
    viewRadiusLabel.textContent = `ALL AIRCRAFT (${total.toLocaleString()})`;
  } else {
    viewRadiusLabel.textContent = `Showing ${Math.min(aircraftDisplayLimit, total).toLocaleString()} of ${total.toLocaleString()}`;
  }
}

function getAircraftRenderSubset(items = []) {
  const rows = Array.isArray(items) ? items : [];
  if (aircraftDisplayLimit === null) return rows;
  const limit = Math.max(0, aircraftDisplayLimit);
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

function activateGraphsAt(lat, lon, sourceLabel = "marker") {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  if (!graphFocus || Math.abs(graphFocus.lat-lat)>0.001 || Math.abs(graphFocus.lon-lon)>0.001) localChartHistory.length=0;
  graphFocus = { lat, lon, sourceLabel, ts: Date.now() };
  if (graphDock) graphDock.classList.remove("hidden");
  if (graphScopeMeta) {
    graphScopeMeta.textContent = `Graphs scoped to ${GRAPH_RADIUS_MILES.toLocaleString()} mi around ${sourceLabel} (${lat.toFixed(2)}, ${lon.toFixed(2)})`;
  }
  updateKpisAndCharts();
}

function pointsWithinRadius(items, focus, radiusMiles) {
  const rows = Array.isArray(items) ? items : [];
  if (!focus) return rows;
  return rows.filter((x) => {
    const lat = Number(x?.lat);
    const lon = Number(x?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return haversineMiles(focus.lat, focus.lon, lat, lon) <= radiusMiles;
  });
}

function buildLocalGraphSnapshot() {
  const focus = graphFocus || getFocusPoint();
  const radius = GRAPH_RADIUS_MILES;
  const local = {
    flights: pointsWithinRadius(liveSnapshot.aircraft, focus, radius),
    satellites: pointsWithinRadius(liveSnapshot.satellites, focus, radius),
    maritime: pointsWithinRadius(liveSnapshot.maritime, focus, radius),
    seismic: pointsWithinRadius(liveSnapshot.seismic, focus, radius),
    cctv: pointsWithinRadius(liveSnapshot.cctv, focus, radius),
    weather: pointsWithinRadius(liveSnapshot.weatherAlerts, focus, radius),
    outages: pointsWithinRadius(liveSnapshot.downdetector, focus, radius),
    news: pointsWithinRadius(liveSnapshot.news, focus, radius),
    traffic: pointsWithinRadius(liveSnapshot.traffic, focus, radius)
  };
  const geo = local.flights.length + local.satellites.length + local.maritime.length + local.news.length;
  const infra = local.outages.length + local.cctv.length + local.traffic.length;
  const env = local.seismic.length + local.weather.length;
  const finance = pointsWithinRadius(catalogs?.finance?.stockExchanges || [], focus, radius).length +
    pointsWithinRadius(catalogs?.finance?.cryptoHubs || [], focus, radius).length;
  const localRisk = Math.min(
    100,
    geo * 0.08 + infra * 0.32 + env * 0.24 + finance * 0.18
  );

  return {
    ts: Date.now(),
    focus,
    counts: local,
    categoryScores: {
      geo: Math.min(100, geo),
      finance: Math.min(100, finance * 3),
      infra: Math.min(100, infra * 6),
      env: Math.min(100, env * 8)
    },
    localRisk
  };
}

function sampleLocalGraphHistory() {
  if (!graphFocus) return;
  const snap = buildLocalGraphSnapshot();
  localChartHistory.push(snap);
  while (localChartHistory.length > 180) localChartHistory.shift();
}

function inferCctvRegionKey(cam) {
  const label = String(cam?.label || "").toLowerCase();
  const lat = Number(cam?.lat);
  const lon = Number(cam?.lon);
  if (label.includes("baton rouge")) return "baton_rouge";
  if (label.includes("new orleans")) return "new_orleans";
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    if (lat >= 30.34 && lat <= 30.58 && lon >= -91.3 && lon <= -90.98) return "baton_rouge";
    if (lat >= 29.85 && lat <= 30.1 && lon >= -90.2 && lon <= -89.9) return "new_orleans";
  }
  return "other";
}

function satelliteInfoRows(record) {
  if (!record) return [];
  return [
    ["Name", record.name || "Unknown"],
    ["NORAD", record.noradId || record.id || "Unknown"],
    ["Source", record.source || "Unknown"],
    ["Lat", formatNumber(record.lat, 4)],
    ["Lon", formatNumber(record.lon, 4)],
    ["Alt (km)", formatNumber((record.altitudeM || 0) / 1000, 2)],
    ["Distance (km)", formatNumber(record.distanceKm, 1)],
    ["Azimuth", formatNumber(record.azimuthDeg, 1)],
    ["Elevation", formatNumber(record.elevationDeg, 1)],
    ["RA", formatNumber(record.rightAscensionDeg, 2)],
    ["DEC", formatNumber(record.declinationDeg, 2)],
    ["Launch", record.launchDate || "n/a"],
    ["Designator", record.intDesignator || "n/a"],
    ["Orbit Points", String(Array.isArray(record.orbitPath) ? record.orbitPath.length : 0)]
  ];
}

function renderSatelliteDetails(record) {
  renderAssetSummary(record);
  satelliteDetails.innerHTML = "";
  document.getElementById("selectedAssetName").textContent = record?.name || "Orbital overview";
  document.getElementById("selectedAssetStatus").textContent = record ? `${record.source || "Satellite"} · tracked` : "Select a satellite on the globe";
  if (!record) {
    satelliteMeta.textContent = "Click a satellite to inspect details.";
    return;
  }
  satelliteMeta.textContent = `Satellite: ${record.name || record.id}`;
  for (const [key, value] of satelliteInfoRows(record)) {
    const row = document.createElement("div");
    row.className = "sat-kv";
    const k = document.createElement("span");
    k.className = "k";
    k.textContent = key;
    const v = document.createElement("span");
    v.className = "v";
    v.textContent = String(value);
    row.appendChild(k);
    row.appendChild(v);
    satelliteDetails.appendChild(row);
  }
  if (record.tle1 || record.tle2) {
    const tle = document.createElement("div");
    tle.className = "context-item tiny";
    tle.textContent = `TLE: ${record.tle1 || ""} ${record.tle2 || ""}`.trim();
    satelliteDetails.appendChild(tle);
  }
}

function selectSatelliteById(id) {
  selectedSatelliteId = id || null;
  const record = selectedSatelliteId ? satelliteDataById.get(selectedSatelliteId) : null;
  renderSatelliteDetails(record || null);
  if(record && Number.isFinite(Number(record.lat)) && Number.isFinite(Number(record.lon))) updateContextForMarker({lat:Number(record.lat),lon:Number(record.lon)});
  applyLayerVisibility();
  tacticalInteraction.select(selectedSatelliteId ? entityMaps.satellites.get(selectedSatelliteId)?.point : null);
}

async function postUserLocation(coords) {
  const payload = {
    lat: coords.latitude,
    lon: coords.longitude,
    accuracyM: coords.accuracy || null,
    capturedAt: Date.now()
  };
  const resp = await fetch("/api/location", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error || "Failed to store location.");
  userLocation = data.location || null;
  if (data.location) {
    setMarkerEntity({ lat: data.location.lat, lon: data.location.lon });
    setMarkerInfo({ lat: data.location.lat, lon: data.location.lon }, data.satellitesLoaded ?? null);
    updateContextForMarker({ lat: data.location.lat, lon: data.location.lon });
    setLocationStatus(
      `Location shared (${formatNumber(data.location.lat, 4)}, ${formatNumber(data.location.lon, 4)})`
    );
  }
}

async function requestBrowserLocation() {
  if (!("geolocation" in navigator)) {
    setLocationStatus("Geolocation is not supported in this browser.");
    return;
  }
  setLocationStatus("Requesting location permission...");
  await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          await postUserLocation(position.coords);
          localStorage.setItem(LOCATION_CONSENT_KEY, "granted");
          resolve();
        } catch (error) {
          reject(error);
        }
      },
      (error) => {
        reject(new Error(error.message || "Location permission denied."));
      },
      {
        enableHighAccuracy: false,
        timeout: 12000,
        maximumAge: 5 * 60 * 1000
      }
    );
  });
}

async function loadStoredLocation() {
  try {
    const payload = await fetch("/api/location").then((r) => r.json());
    if (payload?.location) {
      userLocation = payload.location;
      setLocationStatus(
        `Location active (${formatNumber(payload.location.lat, 4)}, ${formatNumber(payload.location.lon, 4)})`
      );
      return payload.location;
    }
  } catch {
    // no-op
  }
  if (satelliteProvider === "n2yo" || satelliteProvider === "hybrid") {
    setLocationStatus("Location not shared yet. Share to improve satellite targeting.");
  } else {
    setLocationStatus("Location not shared yet.");
  }
  return null;
}

async function maybePromptForLocation() {
  const alreadyPrompted = localStorage.getItem(LOCATION_PROMPTED_KEY) === "true";
  if (alreadyPrompted) return;
  localStorage.setItem(LOCATION_PROMPTED_KEY, "true");

  const consent = window.confirm(
    "Vector can use your location to track nearby satellites and improve API targeting. Share location now?"
  );
  if (!consent) {
    localStorage.setItem(LOCATION_CONSENT_KEY, "denied");
    setLocationStatus("Location sharing skipped. Click Share Location anytime.");
    return;
  }

  try {
    await requestBrowserLocation();
  } catch (error) {
    setLocationStatus(`Location failed: ${error.message}`);
  }
}

function getAnimationClockMs() {
  return displayPaused && pausedAnimationTime ? pausedAnimationTime : liveMode ? Date.now() : replayCurrentTime;
}

function hashString(value) {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (h << 5) - h + value.charCodeAt(i);
  return Math.abs(h);
}

function orbitPoint(track, phase) {
  const n = track.length;
  if (n === 0) return null;
  if (n === 1) return track[0];
  const scaled = ((phase % 1) + 1) % 1 * n;
  const i = Math.floor(scaled) % n;
  const j = (i + 1) % n;
  const frac = scaled - Math.floor(scaled);
  const a = track[i];
  const b = track[j];
  return {
    lon: a.lon + (b.lon - a.lon) * frac,
    lat: a.lat + (b.lat - a.lat) * frac,
    altitudeM: (a.altitudeM || 1000) + ((b.altitudeM || 1000) - (a.altitudeM || 1000)) * frac
  };
}

function removeEntityRecord(layer, record) {
  if (!record) return;
  if (layer === "satellites") {
    if (record.point) viewer.entities.remove(record.point);
    if (record.path) viewer.entities.remove(record.path);
    if (record.stem) viewer.entities.remove(record.stem);
    return;
  }
  if (record.cap || record.stem) {
    if (record.cap) viewer.entities.remove(record.cap);
    if (record.stem) viewer.entities.remove(record.stem);
    if (record.halo) viewer.entities.remove(record.halo);
    if (record.trail) viewer.entities.remove(record.trail);
    return;
  }
  viewer.entities.remove(record);
}

function clearEntityMap(layer, map) {
  for (const record of map.values()) removeEntityRecord(layer, record);
  map.clear();
}

function clearTrafficLayer() {
  for (const entity of trafficLayer.polylines.values()) viewer.entities.remove(entity);
  for (const particle of trafficLayer.particles) viewer.entities.remove(particle.entity);
  trafficLayer.polylines.clear();
  trafficLayer.particles = [];
}

function clearCategoryCatalogLayer() {
  for (const entity of categoryCatalogLayer.values()) {
    if (entity?.cap || entity?.stem) {
      if (entity.cap) viewer.entities.remove(entity.cap);
      if (entity.stem) viewer.entities.remove(entity.stem);
    } else {
      viewer.entities.remove(entity);
    }
  }
  categoryCatalogLayer.clear();
}

function applyLayerVisibility() {
  const denseAircraft = Number(liveTotals.aircraft || 0) > 2200;
  const opacity = getLayerOpacity();
  const overview=overviewDeclutter && viewer.camera.positionCartographic.height > 6000000;
  for (const [layer, map] of Object.entries(entityMaps)) {
    const visible = Boolean(layerVisibility[layer]);
    for (const record of map.values()) {
      if (layer === "satellites") {
        if (record.point) {
          record.point.show = visible && (!overview || record.point.id === `sat-${selectedSatelliteId}` || hashString(record.point.id)%13===0);
          if (record.point.point) {
            record.point.point.pixelSize = 5 * getLayerScale("satellites");
            record.point.point.color = Cesium.Color.fromCssColorString("#a3d9f2").withAlpha(Math.max(0.35, 0.95 * opacity));
            record.point.point.show = false;
          }
          if (record.point.billboard) {
            record.point.billboard.scale = (record.point.id === `sat-${selectedSatelliteId}` ? 0.54 : 0.44) * getLayerScale("satellites");
            record.point.billboard.color = Cesium.Color.WHITE.withAlpha(opacity);
          }
          if (record.point.label) {
            record.point.label.show = record.point.id === `sat-${selectedSatelliteId}` || shouldShowLabels("satellites", denseAircraft);
            record.point.label.fillColor = Cesium.Color.fromCssColorString("#d4efff").withAlpha(Math.max(0.45, opacity));
          }
        }
        if (record.path) {
          record.path.show = visible && (uiState.showSatelliteArcs || record.point.id === `sat-${selectedSatelliteId}`);
          if (record.path.polyline) {
            record.path.polyline.width = 1 * getLayerScale("satellites");
            record.path.polyline.material = Cesium.Color.fromCssColorString("#8bd8ff").withAlpha(Math.max(0.2, 0.5 * opacity));
          }
        }
        if (record.stem) {
          record.stem.show = visible && uiState.showSatelliteStems;
          if (record.stem.polyline) {
            record.stem.polyline.material = Cesium.Color.YELLOW.withAlpha(Math.max(0.18, 0.35 * opacity));
          }
        }
        continue;
      }
      if (record.cap || record.stem) {
        if (record.cap) record.cap.show = visible && (!overview || hashString(record.cap.id)%(layer==="maritime"?180:layer==="aircraft"?9:layer==="weatherAlerts"?8:1)===0);
        if (record.stem) record.stem.show = visible && layer !== "seismic" && uiState.labelDensity === "full";
        if (record.halo) record.halo.show = visible;
        if (record.trail) record.trail.show = visible && record.cap.show;
        if (record.cap?.billboard) {
          const scale = getLayerScale(layer);
          const base = Number(record.baseCapScale || record.cap.billboard.scale || 0.34);
          record.cap.billboard.scale = base * scale;
          record.cap.billboard.color = Cesium.Color.WHITE.withAlpha(opacity);
        }
        if (record.cap?.label) {
          record.cap.label.show = visible && shouldShowLabels(layer, denseAircraft);
          if (record.cap.label.fillColor) {
            record.cap.label.fillColor = (record.cap.label.fillColor.getValue?.(viewer.clock.currentTime) || Cesium.Color.CYAN).withAlpha(Math.max(0.3, opacity));
          }
        }
        if (record.stem?.polyline?.material?.withAlpha) {
          const baseAlpha = Number(record.baseStemAlpha || 0.35);
          record.stem.polyline.material = record.stem.polyline.material.withAlpha(Math.max(0.16, baseAlpha * opacity));
        }
      } else {
        record.show = visible;
      }
    }
  }
  for (const entity of trafficLayer.polylines.values()) entity.show = layerVisibility.traffic;
  for (const particle of trafficLayer.particles) particle.entity.show = layerVisibility.traffic;
  logRenderStats("visibility");
}

function syncFilterButtons() {
  for (const btn of filterContainer.querySelectorAll(".filter-btn")) {
    const layer = btn.dataset.layer;
    btn.classList.toggle("active", layerVisibility[layer]);
    btn.setAttribute("aria-pressed", String(layerVisibility[layer]));
  }
}

function upsertEntity(map, id, factory, updater) {
  if (!map.has(id)) {
    const created = factory();
    map.set(id, created);
  }
  updater(map.get(id));
}

function removeEntityById(id) {
  if (!id) return;
  const existing = viewer.entities.getById(id);
  if (existing) viewer.entities.remove(existing);
}

function pctToScale(value, fallback = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0.4, Math.min(2.6, n / 100));
}

function layerBucketForUI(layer) {
  if (layer === "aircraft") return "aircraft";
  if (layer === "satellites") return "satellites";
  if (layer === "maritime") return "maritime";
  if (layer === "seismic" || layer === "weatherAlerts") return "environmental";
  return "infrastructure";
}

function getLayerScale(layer) {
  const bucket = layerBucketForUI(layer);
  const globalScale = Number(uiState.layerScale.global || 1);
  const layerScale = Number(uiState.layerScale[bucket] || 1);
  return globalScale * layerScale;
}

function getLayerOpacity() {
  return Math.max(0.2, Math.min(1, Number(uiState.markerOpacity || 1)));
}

function shouldShowLabels(layer, denseAircraft) {
  if (uiState.labelDensity === "minimal") return false;
  if (uiState.labelDensity === "full") return true;
  // Normal density reserves labels for selection and hover. Full remains available.
  return false;
}

function syncDisplayTuningUI() {
  if (markerOpacityLabel) markerOpacityLabel.textContent = `${Math.round(getLayerOpacity() * 100)}%`;
  if (markerScaleGlobalLabel) markerScaleGlobalLabel.textContent = `${Math.round(uiState.layerScale.global * 100)}%`;
  if (markerScaleAircraftLabel) markerScaleAircraftLabel.textContent = `${Math.round((uiState.layerScale.aircraft || 1) * 100)}%`;
  if (markerScaleSatellitesLabel) markerScaleSatellitesLabel.textContent = `${Math.round((uiState.layerScale.satellites || 1) * 100)}%`;
  if (markerScaleMaritimeLabel) markerScaleMaritimeLabel.textContent = `${Math.round((uiState.layerScale.maritime || 1) * 100)}%`;
  if (markerScaleInfrastructureLabel) markerScaleInfrastructureLabel.textContent = `${Math.round((uiState.layerScale.infrastructure || 1) * 100)}%`;
  if (markerScaleEnvironmentalLabel) markerScaleEnvironmentalLabel.textContent = `${Math.round((uiState.layerScale.environmental || 1) * 100)}%`;
}

function setSceneModeButtons() {
  if (!scene2dBtn || !scene3dBtn) return;
  const in2d = viewer.scene.mode === Cesium.SceneMode.SCENE2D;
  scene2dBtn.classList.toggle("active", in2d);
  scene3dBtn.classList.toggle("active", !in2d);
}

function buildGlyphSvg(glyph, colorHex = "#a8dcf3") { return tacticalGlyph(glyph, colorHex); }

function markerStyleForLayer(layer, item = {}) {
  const scale = getLayerScale(layer);
  const opacity = getLayerOpacity();
  if (layer === "aircraft") {
    const isMil = Boolean(item?.military);
    return {
      color: Cesium.Color.fromCssColorString(isMil ? "#b4e8ff" : "#77e8ff"),
      glyph: isMil ? "M" : "A",
      altitudeM: Math.max(100, Number(item?.altitudeM || 0)),
      stemAlpha: (isMil ? 0.62 : 0.46) * opacity,
      capScale: (isMil ? 0.55 : 0.50) * scale
    };
  }
  const byLayer = {
    cctv: { color: Cesium.Color.fromCssColorString("#8ce4ff"), glyph: "C", altitudeM: 100, stemAlpha: 0.35, capScale: 0.44 },
    maritime: { color: Cesium.Color.fromCssColorString("#78e6c2"), glyph: "S", altitudeM: 100, stemAlpha: 0.42, capScale: 0.46 },
    news: { color: Cesium.Color.fromCssColorString("#b39fff"), glyph: "N", altitudeM: 100, stemAlpha: 0.32, capScale: 0.44 },
    weatherAlerts: { color: Cesium.Color.fromCssColorString("#8abfff"), glyph: "W", altitudeM: 100, stemAlpha: 0.34, capScale: 0.46 },
    downdetector: { color: Cesium.Color.fromCssColorString("#ffb25f"), glyph: "D", altitudeM: 100, stemAlpha: 0.56, capScale: 0.48 }
  };
  const base = byLayer[layer] || { color: Cesium.Color.WHITE, glyph: "•", altitudeM: 3000, stemAlpha: 0.2, capScale: 0.16 };
  const altitudeFromTelemetry =
    layer === "aircraft" && Number.isFinite(Number(item.altitudeM))
      ? Math.max(60000, Number(item.altitudeM) * 6 + 22000)
      : base.altitudeM;
  const densityBump =
    layer === "downdetector"
      ? 0
      : 0;
  const altitudeM = Number(altitudeFromTelemetry || item.altitudeM || base.altitudeM + densityBump);
  return {
    ...base,
    altitudeM,
    stemAlpha: base.stemAlpha * opacity,
    capScale: base.capScale * scale
  };
}

function createLiftedMarkerEntity(layer, item, idPrefix, labelText) {
  const style = markerStyleForLayer(layer, item);
  const strokeColor = style.color.withAlpha(style.stemAlpha);
  const denseAircraft = layer === "aircraft" && Number(liveTotals.aircraft || 0) > 2200;
  const label = String(labelText || "").trim();
  const billboardColorHex = style.color.toCssColorString();
  const rootId = `${idPrefix}-${item.id}`;
  removeEntityById(`${rootId}-stem`);
  removeEntityById(rootId);
  const moving = layer === "aircraft" || layer === "maritime";
  const record = {
    moving,
    lat: Number(item.lat),
    lon: Number(item.lon),
    layer,
    baseCapScale: style.capScale / Math.max(0.01, getLayerScale(layer)),
    baseStemAlpha: style.stemAlpha / Math.max(0.01, getLayerOpacity()),
    motion: null,
    history: [],
    trailPositions: [],
    trailUpdated: 0,
    cartesian: new Cesium.Cartesian3(),
    stem: null,
    cap: null
  };
  seedMotion(record, item, style.altitudeM);
  record.stem = viewer.entities.add({
      id: `${rootId}-stem`,
      polyline: {
        positions: moving ? new Cesium.CallbackProperty(() => {
          const point = getRecordMotionPoint(record);
          return point ? updateStemPositions(record, point, Cesium) : [];
        }, false) : Cesium.Cartesian3.fromDegreesArrayHeights([Number(item.lon), Number(item.lat), 0, Number(item.lon), Number(item.lat), style.altitudeM]),
        width: (layer === "downdetector" ? 2.25 : 1.4) * Math.max(0.75, getLayerScale(layer)),
        material: strokeColor
      }
    });
  record.cap = viewer.entities.add({
      id: rootId,
      position: moving ? new Cesium.CallbackProperty(() => {
        const point = getRecordMotionPoint(record);
        return Cesium.Cartesian3.fromDegrees(point.lon, point.lat, point.altitudeM, Cesium.Ellipsoid.WGS84, record.cartesian);
      }, false) : Cesium.Cartesian3.fromDegrees(Number(item.lon), Number(item.lat), style.altitudeM),
      billboard: {
        image: buildGlyphSvg(style.glyph, billboardColorHex),
        rotation: 0,
        alignedAxis: layer === "aircraft" ? Cesium.Cartesian3.UNIT_Z : Cesium.Cartesian3.ZERO,
        scale: style.capScale,
        color: Cesium.Color.WHITE.withAlpha(getLayerOpacity()),
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        scaleByDistance: new Cesium.NearFarScalar(5e5, 1.1, 1.2e7, 0.72)
      },
      label: label
        ? {
            text: label,
            font: "12px 'IBM Plex Mono', monospace",
            fillColor: Cesium.Color.fromCssColorString("#dceaf5"),
            outlineColor: Cesium.Color.BLACK.withAlpha(0.7),
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, -20),
            scaleByDistance: new Cesium.NearFarScalar(5e5, 1.0, 3.2e7, 0.72)
          }
        : undefined,
      description: item.streamUrl || item.detailsUrl || item.description || ""
    });
  registerTacticalMarker(record.cap, style.glyph, billboardColorHex, item.timestamp);
  if(layer === "aircraft" || layer === "maritime") {
    record.trail = viewer.entities.add({ id: `${rootId}-trail`, polyline: {
      positions: new Cesium.CallbackProperty(() => {
        const now=getAnimationClockMs();
        if(Math.abs(now-record.trailUpdated)>180) {
          const current=getRecordMotionPoint(record); const from=record.motion?.from;
          const samples=record.history.slice(-5,-1);
          if(from) samples.push(from); if(current) samples.push(current);
          record.trailPositions=samples.map(p => Cesium.Cartesian3.fromDegrees(p.lon,p.lat,p.altitudeM)); record.trailUpdated=now;
        }
        return record.trailPositions;
      },false), width: 1.3,
      material: new Cesium.PolylineDashMaterialProperty({color:style.color.withAlpha(.58),dashLength:12})
    }});
  }
  return record;
}

function setLiftedMarkerPosition(record, layer, item, labelText) {
  const style = markerStyleForLayer(layer, item);
  const blendMs =
    layer === "aircraft"
      ? MOTION_BLEND_MS.aircraft
      : layer === "maritime"
        ? MOTION_BLEND_MS.maritime
        : MOTION_BLEND_MS.aircraft;
  updateMotion(record, item, style.altitudeM, blendMs);
  if (!record.moving) {
    record.cap.position.setValue(Cesium.Cartesian3.fromDegrees(Number(item.lon), Number(item.lat), style.altitudeM, Cesium.Ellipsoid.WGS84, record.cartesian));
    record.stem.polyline.positions.setValue(Cesium.Cartesian3.fromDegreesArrayHeights([Number(item.lon), Number(item.lat), 0, Number(item.lon), Number(item.lat), style.altitudeM]));
  }
  if (layer === "aircraft") {
    const heading = record.velocity?.heading;
    record.cap.billboard.rotation = -(Number.isFinite(heading) ? heading * Math.PI / 180 : headingBetween(record.motion.from, record.motion.to));
  }
  registerTacticalMarker(record.cap, style.glyph, style.color.toCssColorString(), item.timestamp);
  if (record.cap?.label) {
    const denseAircraft = layer === "aircraft" && Number(liveTotals.aircraft || 0) > 2200;
    record.cap.label.show = shouldShowLabels(layer, denseAircraft);
    if (record.cap.label.show && labelText) record.cap.label.text = labelText;
  }
  if (record.cap?.billboard) {
    record.cap.billboard.scale = style.capScale;
    record.cap.billboard.color = Cesium.Color.WHITE.withAlpha(getLayerOpacity());
  }
}

function setEntityDetails(title, fields = []) {
  entityDetails.innerHTML = "";
  entityDetailMeta.textContent = title || "Selected entity details";
  if (!Array.isArray(fields) || fields.length === 0) {
    const empty = document.createElement("div");
    empty.className = "tiny";
    empty.textContent = "No detail available.";
    entityDetails.appendChild(empty);
    return;
  }
  entityDetails.closest("details").open = true;
  rightPanel.classList.remove("collapsed");setActiveTab("context");
  for (const [key, value] of fields) {
    const row = document.createElement("div");
    row.className = "sat-kv";
    const k = document.createElement("span");
    k.className = "k";
    k.textContent = key;
    const v = document.createElement("span");
    v.className = "v";
    v.textContent = String(value ?? "n/a");
    row.appendChild(k);
    row.appendChild(v);
    entityDetails.appendChild(row);
  }
}

function showAircraftDetails(record) {
  if (!record) return;
  const speedKts = Number(record.velocityMps || 0) * 1.94384;
  const altFt = Number(record.altitudeM || 0) * 3.28084;
  setEntityDetails(`Aircraft | ${record.callsign || record.id}`, [
    ["Source", record.source || "Unknown"],
    ["Callsign", record.callsign || "UNKNOWN"],
    ["Country", record.originCountry || "Unknown"],
    ["Altitude", `${formatNumber(altFt, 0)} ft`],
    ["Speed", `${formatNumber(speedKts, 1)} kts`],
    ["Heading", `${formatNumber(record.headingDeg, 1)} deg`],
    ["Latitude", formatNumber(record.lat, 4)],
    ["Longitude", formatNumber(record.lon, 4)]
  ]);
}

function showMaritimeDetails(record) {
  if (!record) return;
  setEntityDetails(`Maritime | ${record.name || record.mmsi || record.id}`, [
    ["MMSI", record.mmsi || "n/a"],
    ["IMO", record.imoNumber || "n/a"],
    ["Callsign", record.callsign || "n/a"],
    ["Type", record.vesselType || "unknown"],
    ["Destination", record.destination || "n/a"],
    ["Status", record.navStatus || "n/a"],
    ["Speed", `${formatNumber(record.sog, 1)} kn`],
    ["Course", `${formatNumber(record.cog, 1)} deg`],
    ["Latitude", formatNumber(record.lat, 4)],
    ["Longitude", formatNumber(record.lon, 4)]
  ]);
}

function showDownDetectorDetails(record) {
  if (!record) {
    setEntityDetails("Selected entity details", []);
    return;
  }
  setEntityDetails(`Downdetector | ${record.service || record.slug || record.id}`, [
    ["Service", record.service || "Unknown"],
    ["Slug", record.slug || "n/a"],
    ["Country", record.countryIso || "n/a"],
    ["Latest Reports", record.latestReports ?? record.reportCount ?? 0],
    ["Peak Reports", record.peakReports ?? record.reportCount ?? 0],
    ["Local Reports", record.reportCount ?? 0],
    ["Samples", record.samples ?? 0],
    ["Status", record.outageStatus || "unknown"],
    ["Latitude", formatNumber(record.lat, 4)],
    ["Longitude", formatNumber(record.lon, 4)]
  ]);
}

function resolveEntityId(layer, item, fallbackLabel = "") {
  const raw = String(item?.id || item?.icao24 || item?.mmsi || item?.noradId || "").trim();
  if (raw) return raw;
  const lat = Number(item?.lat);
  const lon = Number(item?.lon);
  const label = String(
    item?.name || item?.callsign || item?.service || item?.slug || fallbackLabel || layer
  )
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    return `${layer}-${label}-${lat.toFixed(4)}-${lon.toFixed(4)}`;
  }
  return `${layer}-${label}-${Date.now()}`;
}

function updateAircraft(items = []) {
  const rows = getAircraftRenderSubset(items);
  const seen = new Set();
  for (const item of rows) {
    if (!Number.isFinite(Number(item?.lat)) || !Number.isFinite(Number(item?.lon))) continue;
    const entityId = resolveEntityId("aircraft", item, "air");
    const normalizedItem = { ...item, id: entityId };
    seen.add(entityId);
    aircraftDataById.set(entityId, normalizedItem);
    upsertEntity(
      entityMaps.aircraft,
      entityId,
      () => createLiftedMarkerEntity("aircraft", normalizedItem, "aircraft", normalizedItem.callsign || "AIR"),
      (record) => {
        setLiftedMarkerPosition(record, "aircraft", normalizedItem, normalizedItem.callsign || "AIR");
        record.lat = Number(normalizedItem.lat);
        record.lon = Number(normalizedItem.lon);
      }
    );
  }
  for (const [id, record] of entityMaps.aircraft.entries()) {
    if (!seen.has(id)) {
      removeEntityRecord("aircraft", record);
      entityMaps.aircraft.delete(id);
      aircraftDataById.delete(id);
    }
  }
}

function updateSatellites(items = []) {
  const seen = new Set();
  for (const item of items) {
    if (!Number.isFinite(Number(item?.lat)) || !Number.isFinite(Number(item?.lon))) continue;
    const entityId = resolveEntityId("sat", item, "sat");
    const normalizedItem = { ...item, id: entityId };
    seen.add(entityId);
    satelliteDataById.set(entityId, normalizedItem);
    const orbitTrack = Array.isArray(normalizedItem.orbitPath) && normalizedItem.orbitPath.length > 1
      ? normalizedItem.orbitPath
      : [{ lon: normalizedItem.lon, lat: normalizedItem.lat, altitudeM: Math.max(300000, normalizedItem.altitudeM || 420000) }];
    const closedTrack = orbitTrack;
    upsertEntity(
      entityMaps.satellites,
      entityId,
      () => {
        const record = { layer: "satellites", samplePhase: hashString(entityId) % 1000, orbitTrack: closedTrack, cartesian: new Cesium.Cartesian3(), point: null, path: null, stem: null };
        removeEntityById(`sat-${entityId}`);
        removeEntityById(`sat-path-${entityId}`);
        removeEntityById(`sat-stem-${entityId}`);
        record.point = viewer.entities.add({
          id: `sat-${entityId}`,
          point: {
            pixelSize: 5,
            color: Cesium.Color.YELLOW.withAlpha(0.95),
            outlineColor: Cesium.Color.BLACK.withAlpha(0.65),
            outlineWidth: 2,
            disableDepthTestDistance: 0
          },
          label: {
            text: normalizedItem.name || "SAT",
            font: "13px 'IBM Plex Mono', monospace",
            fillColor: Cesium.Color.YELLOW,
            outlineColor: Cesium.Color.BLACK.withAlpha(0.75),
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, -24),
            scaleByDistance: new Cesium.NearFarScalar(5e5, 1.08, 4.2e7, 0.6)
          },
          billboard: {
            image: buildGlyphSvg("SAT", "#b9e7ff"),
            scale: 0.18,
            scaleByDistance: new Cesium.NearFarScalar(5e5, 1.12, 1.2e7, 0.8)
          },
          position: new Cesium.CallbackProperty(() => {
            const clock = getAnimationClockMs();
            if (record.satrec) {
              record.sampleOrbit ||= time => {
                const date = new Date(time);
                const pv = satellite.propagate(record.satrec, date);
                if (!pv.position) return null;
                const geo = satellite.eciToGeodetic(pv.position, satellite.gstime(date));
                return Cesium.Cartesian3.fromRadians(geo.longitude, geo.latitude, geo.height * 1000);
              };
              const segment = sampleOrbitSegment(record, clock, record.sampleOrbit);
              if (segment.a && segment.b) return Cesium.Cartesian3.lerp(segment.a, segment.b, segment.t, record.cartesian);
            }
            const point=getRecordMotionPoint(record) || normalizedItem;
            return Cesium.Cartesian3.fromDegrees(point.lon,point.lat,point.altitudeM || 420000,Cesium.Ellipsoid.WGS84,record.cartesian);
          }, false)
        });
        registerTacticalMarker(record.point, "SAT", "#b9e7ff", normalizedItem.timestamp);
        const pathHeights = closedTrack.flatMap((p) => [p.lon, p.lat, Math.max(260000, p.altitudeM || 420000)]);
        record.path = viewer.entities.add({
          id: `sat-path-${entityId}`,
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArrayHeights(pathHeights),
            width: 2.8,
            material: Cesium.Color.YELLOW.withAlpha(0.72)
          }
        });
        record.stem = viewer.entities.add({
          id: `sat-stem-${entityId}`,
          polyline: {
            positions: new Cesium.CallbackProperty(() => {
              const cart = record.point.position.getValue(Cesium.JulianDate.now());
              if (!cart) return [];
              const carto = Cesium.Cartographic.fromCartesian(cart);
              const lon = Cesium.Math.toDegrees(carto.longitude);
              const lat = Cesium.Math.toDegrees(carto.latitude);
              const alt = Math.max(260000, carto.height || 420000);
              return Cesium.Cartesian3.fromDegreesArrayHeights([lon, lat, 0, lon, lat, alt]);
            }, false),
            width: 1.05,
            material: Cesium.Color.YELLOW.withAlpha(0.35)
          }
        });
        return record;
      },
      (record) => {
        record.orbitTrack = closedTrack;
        registerTacticalMarker(record.point,"SAT","#b9e7ff",normalizedItem.timestamp);
        record.altitudeM = Number(normalizedItem.altitudeM || 420000);
        if(!record.motion) seedMotion(record,normalizedItem,record.altitudeM);
        else updateMotion(record,normalizedItem,record.altitudeM,MOTION_BLEND_MS.satellite);
        if (normalizedItem.tle1 && normalizedItem.tle2 && record.tle !== normalizedItem.tle1+normalizedItem.tle2) {
          record.satrec = satellite.twoline2satrec(normalizedItem.tle1, normalizedItem.tle2);
          record.tle = normalizedItem.tle1+normalizedItem.tle2; record.sampleSecond = null;
        }
        record.lat = Number(normalizedItem.lat);
        record.lon = Number(normalizedItem.lon);
        const pathHeights = closedTrack.flatMap((p) => [p.lon, p.lat, Math.max(260000, p.altitudeM || 420000)]);
        record.path.polyline.positions = Cesium.Cartesian3.fromDegreesArrayHeights(pathHeights);
        if (record.point.label) record.point.label.text = normalizedItem.name || "SAT";
      }
    );
  }
  for (const [id, record] of entityMaps.satellites.entries()) {
    if (!seen.has(id)) {
      removeEntityRecord("satellites", record);
      entityMaps.satellites.delete(id);
      satelliteDataById.delete(id);
      if (selectedSatelliteId === id) selectSatelliteById(null);
    }
  }
  if (!selectedSatelliteId && satelliteDataById.size) {
    const initial = [...satelliteDataById.values()].find(item => /ISS|ZARYA|STARLINK|IDSCS|INTELSAT|INMARSAT/i.test(item.name || "")) || satelliteDataById.values().next().value;
    selectSatelliteById(initial.id);
  }
  if (selectedSatelliteId && satelliteDataById.has(selectedSatelliteId)) {
    renderSatelliteDetails(satelliteDataById.get(selectedSatelliteId));
  }
}

function updateSeismic(items = []) {
  const seen = new Set();
  for (const item of items) {
    seen.add(item.id);
    const mag = Number(item.mag || 0);
    const length = 3500 + Math.max(0, mag) * 5200;
    upsertEntity(
      entityMaps.seismic,
      item.id,
      () => {
        const col = viewer.entities.add({
          id: `seismic-${item.id}`,
          position: Cesium.Cartesian3.fromDegrees(item.lon, item.lat, length / 2),
          cylinder: {
            length,
            topRadius: 1400 + Math.max(0, mag) * 950,
            bottomRadius: 220 + Math.max(0, mag) * 220,
            material: Cesium.Color.RED.withAlpha(0.38)
          }
        });
        const icon = viewer.entities.add({
          id: `seismic-icon-${item.id}`,
          position: Cesium.Cartesian3.fromDegrees(item.lon, item.lat, length + 4000),
          billboard: {
            image: buildGlyphSvg("Q", "#ffb25f"),
            scale: 0.5
          },
          label: {
            text: `M${formatNumber(mag, 1)}`,
            font: "12px 'IBM Plex Mono', monospace",
            fillColor: Cesium.Color.fromCssColorString("#ffb25f"),
            outlineColor: Cesium.Color.BLACK.withAlpha(0.7),
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, -20)
          }
        });
        registerTacticalMarker(icon,"Q","#ffb25f");
        col.show=false;
        return { cap: icon, stem: col };
      },
      (record) => {
        if (record.stem) {
          record.stem.position = Cesium.Cartesian3.fromDegrees(item.lon, item.lat, length / 2);
          record.stem.cylinder.length = length;
        }
        if (record.cap) {
          record.cap.position = Cesium.Cartesian3.fromDegrees(item.lon, item.lat, length + 4000);
          if (record.cap.label) record.cap.label.text = `M${formatNumber(mag, 1)}`;
        }
        record.lat = Number(item.lat);
        record.lon = Number(item.lon);
      }
    );
  }
  for (const [id, record] of entityMaps.seismic.entries()) {
    if (!seen.has(id)) {
      removeEntityRecord("seismic", record);
      entityMaps.seismic.delete(id);
    }
  }
}

function updateCctv(items = []) {
  const seen = new Set();
  for (const item of items) {
    const entityId = resolveEntityId("cctv", item, "cam");
    const normalizedItem = { ...item, id: entityId };
    seen.add(entityId);
    upsertEntity(
      entityMaps.cctv,
      entityId,
      () => createLiftedMarkerEntity("cctv", normalizedItem, "cctv", ""),
      (record) => {
        setLiftedMarkerPosition(record, "cctv", normalizedItem, "");
        record.lat = Number(normalizedItem.lat);
        record.lon = Number(normalizedItem.lon);
        if (record.cap) {
          record.cap.description = normalizedItem.streamUrl || normalizedItem.detailsUrl || "No stream URL provided";
        }
      }
    );
  }
  for (const [id, record] of entityMaps.cctv.entries()) {
    if (!seen.has(id)) {
      removeEntityRecord("cctv", record);
      entityMaps.cctv.delete(id);
    }
  }
  cctvRegions = { baton_rouge: [], new_orleans: [], other: [] };
  for (const cam of items) {
    const key = cam.regionKey || inferCctvRegionKey(cam);
    if (!cctvRegions[key]) cctvRegions[key] = [];
    cctvRegions[key].push(cam);
  }
  renderCctvRegion();
}

function updateMaritime(items = []) {
  const seen = new Set();
  for (const item of items) {
    if (!Number.isFinite(Number(item?.lat)) || !Number.isFinite(Number(item?.lon))) continue;
    const entityId = resolveEntityId("ship", item, "vessel");
    const normalizedItem = { ...item, id: entityId };
    seen.add(entityId);
    maritimeDataById.set(entityId, normalizedItem);
    upsertEntity(
      entityMaps.maritime,
      entityId,
      () => createLiftedMarkerEntity("maritime", normalizedItem, "maritime", normalizedItem.name || "VESSEL"),
      (record) => {
        setLiftedMarkerPosition(record, "maritime", normalizedItem, normalizedItem.name || "VESSEL");
        record.lat = Number(normalizedItem.lat);
        record.lon = Number(normalizedItem.lon);
      }
    );
  }
  for (const [id, record] of entityMaps.maritime.entries()) {
    if (!seen.has(id)) {
      removeEntityRecord("maritime", record);
      entityMaps.maritime.delete(id);
      maritimeDataById.delete(id);
    }
  }
}

function updateDownDetector(items = []) {
  const seen = new Set();
  for (const item of items) {
    if (!Number.isFinite(Number(item.lat)) || !Number.isFinite(Number(item.lon))) continue;
    const entityId = resolveEntityId("outage", item, "outage");
    const normalizedItem = { ...item, id: entityId };
    seen.add(entityId);
    downDetectorDataById.set(entityId, normalizedItem);
    upsertEntity(
      entityMaps.downdetector,
      entityId,
      () => createLiftedMarkerEntity("downdetector", normalizedItem, "downdetector", normalizedItem.service || "Outage"),
      (record) => {
        setLiftedMarkerPosition(record, "downdetector", normalizedItem, normalizedItem.service || "Outage");
        record.lat = Number(normalizedItem.lat);
        record.lon = Number(normalizedItem.lon);
        if (record.cap) {
          record.cap.description = `${normalizedItem.service || "Service"} reports: ${normalizedItem.reportCount || 0}`;
        }
      }
    );
  }
  for (const [id, record] of entityMaps.downdetector.entries()) {
    if (!seen.has(id)) {
      removeEntityRecord("downdetector", record);
      entityMaps.downdetector.delete(id);
      downDetectorDataById.delete(id);
    }
  }
}

function updateNews(items = []) {
  const seen = new Set();
  for (const item of items) {
    if (!Number.isFinite(Number(item.lat)) || !Number.isFinite(Number(item.lon))) continue;
    const entityId = resolveEntityId("news", item, "news");
    const normalizedItem = { ...item, id: entityId };
    seen.add(entityId);
    upsertEntity(
      entityMaps.news,
      entityId,
      () => createLiftedMarkerEntity("news", normalizedItem, "news", ""),
      (record) => {
        setLiftedMarkerPosition(record, "news", normalizedItem, "");
        record.lat = Number(normalizedItem.lat);
        record.lon = Number(normalizedItem.lon);
        if (record.cap) {
          record.cap.description = normalizedItem.url || "";
        }
      }
    );
  }
  for (const [id, record] of entityMaps.news.entries()) {
    if (!seen.has(id)) {
      removeEntityRecord("news", record);
      entityMaps.news.delete(id);
    }
  }
  renderFeedPanels();
}

function updateWeatherAlerts(items = []) {
  const seen = new Set();
  for (const item of items) {
    if (!Number.isFinite(Number(item.lat)) || !Number.isFinite(Number(item.lon))) continue;
    const entityId = resolveEntityId("weather", item, "wx");
    const normalizedItem = { ...item, id: entityId };
    seen.add(entityId);
    const color =
      String(normalizedItem.severity).toLowerCase() === "extreme"
        ? Cesium.Color.RED
        : String(normalizedItem.severity).toLowerCase() === "severe"
          ? Cesium.Color.ORANGE
          : Cesium.Color.GOLD;
    upsertEntity(
      entityMaps.weatherAlerts,
      entityId,
      () => {
        const lifted = createLiftedMarkerEntity("weatherAlerts", normalizedItem, "weather", normalizedItem.event || "WX");
        removeEntityById(`weather-halo-${entityId}`);
        lifted.halo = viewer.entities.add({
          id: `weather-halo-${entityId}`,
          position: Cesium.Cartesian3.fromDegrees(normalizedItem.lon, normalizedItem.lat, 0),
          ellipse: {
            height: 0,
            semiMajorAxis: 12000,
            semiMinorAxis: 12000,
            material: Cesium.Color.fromCssColorString("#3f9eff").withAlpha(0.16),
            outline:true, outlineColor:Cesium.Color.fromCssColorString("#76c7ff").withAlpha(.65)
          }
        });
        return lifted;
      },
      (record) => {
        setLiftedMarkerPosition(record, "weatherAlerts", normalizedItem, normalizedItem.event || "WX");
        record.lat = Number(normalizedItem.lat);
        record.lon = Number(normalizedItem.lon);
        if (record.halo) {
          record.halo.position = Cesium.Cartesian3.fromDegrees(normalizedItem.lon, normalizedItem.lat, 0);
          record.halo.ellipse.material = Cesium.Color.fromCssColorString("#3f9eff").withAlpha(.16);
        }
      }
    );
  }
  for (const [id, record] of entityMaps.weatherAlerts.entries()) {
    if (!seen.has(id)) {
      if (record.halo) viewer.entities.remove(record.halo);
    if (record.trail) viewer.entities.remove(record.trail);
      removeEntityRecord("weatherAlerts", record);
      entityMaps.weatherAlerts.delete(id);
    }
  }
}

function interpolatePoint(coords, t, result = []) {
  const n = coords.length;
  if (n === 1) return coords[0];
  const scaled = Math.min(n - 1, Math.max(0, t * (n - 1)));
  const i = Math.floor(scaled);
  const frac = scaled - i;
  const a = coords[i];
  const b = coords[Math.min(i + 1, n - 1)];
  result[0] = a[0] + (b[0] - a[0]) * frac; result[1] = a[1] + (b[1] - a[1]) * frac; result[2] = (a[2] || 5) + ((b[2] || 5) - (a[2] || 5)) * frac;
  return result;
}

function updateTraffic(items = []) {
  const seen=new Set();
  for (const seg of items) {
    const coords=Array.isArray(seg.coordinates)?seg.coordinates:[];
    if(coords.length<2) continue; seen.add(seg.id);
    const color=(seg.density ?? .6)>.8 ? "#ff856f" : (seg.density ?? .6)>.65 ? "#ffd378" : "#78e6c2";
    let line=trafficLayer.polylines.get(seg.id);
    if(!line) {
      line=viewer.entities.add({id:`traffic-line-${seg.id}`,polyline:{positions:Cesium.Cartesian3.fromDegreesArrayHeights(coords.flatMap(c=>[c[0],c[1],c[2]||5])),width:1.5,material:Cesium.Color.fromCssColorString(color).withAlpha(.3)}});
      trafficLayer.polylines.set(seg.id,line);
      const count=Math.min(4,Math.max(1,Math.round((seg.density ?? .6)*4)));
      for(let i=0;i<count;i++) {
        const entity=viewer.entities.add({id:`traffic-particle-${seg.id}-${i}`,billboard:{image:buildGlyphSvg("T",color),scale:.18},position:Cesium.Cartesian3.fromDegrees(coords[0][0],coords[0][1],5)});
        trafficLayer.particles.push({segmentId:seg.id,entity,coordinates:coords,phase:(hashString(`${seg.id}-${i}`)%1000)/1000,speedNorm:.06,cartesian:new Cesium.Cartesian3()});
      }
    }
    line.polyline.material=Cesium.Color.fromCssColorString(color).withAlpha(.3);
    for(const particle of trafficLayer.particles) if(particle.segmentId===seg.id) {
      particle.coordinates=coords; particle.speedNorm=Math.max(.02,Math.min(.3,(seg.speed ?? 12)/200));
      particle.entity.billboard.image=buildGlyphSvg("T",color);
    }
  }
  for(const [id,entity] of trafficLayer.polylines) if(!seen.has(id)){viewer.entities.remove(entity);trafficLayer.polylines.delete(id);}
  trafficLayer.particles=trafficLayer.particles.filter(p=>{if(seen.has(p.segmentId))return true;viewer.entities.remove(p.entity);return false;});
}

function animateTraffic() {
  const t = getAnimationClockMs() * 0.00015;
  if (displayPaused || !layerVisibility.traffic || document.hidden) return;
  for (const p of trafficLayer.particles) {
    const phase = (p.phase + t * p.speedNorm) % 1;
    const pos = interpolatePoint(p.coordinates, phase, p.positionScratch ||= []);
    Cesium.Cartesian3.fromDegrees(pos[0],pos[1],pos[2]||5,Cesium.Ellipsoid.WGS84,p.cartesian);
    p.entity.position.setValue(p.cartesian);
    const ahead=interpolatePoint(p.coordinates,Math.min(.9999,phase+.002), p.aheadScratch ||= []);
    p.entity.billboard.rotation=-headingBetween({lon:pos[0],lat:pos[1]},{lon:ahead[0],lat:ahead[1]})+Math.PI/2;
    p.entity.billboard.alignedAxis=Cesium.Cartesian3.UNIT_Z;
    p.entity.show = layerVisibility.traffic;
  }
}
viewer.scene.preUpdate.addEventListener(animateTraffic);

function renderCategoryCatalog(category) {
  clearCategoryCatalogLayer();
  const palette = {
    geopolitical: Cesium.Color.ORANGERED,
    finance: Cesium.Color.CYAN,
    infrastructure: Cesium.Color.AQUA,
    environmental: Cesium.Color.LAWNGREEN
  };
  const color = palette[category] || Cesium.Color.WHITE;
  const catData = catalogs[category] || {};
  const flattened = [];
  for (const [group, items] of Object.entries(catData)) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!Number.isFinite(Number(item.lat)) || !Number.isFinite(Number(item.lon))) continue;
      flattened.push({ ...item, group });
    }
  }
  for (const item of flattened) {
    const id = `catalog-${category}-${item.group}-${item.id}`;
    const baseAltitudeByGroup = {
      militaryBases: 15000,
      nuclearSites: 13000,
      sanctions: 10000,
      protests: 8500,
      cyberIocs: 9000,
      navalChokepoints: 8200,
      stockExchanges: 9000,
      datacenters: 12000,
      supplyChains: 7600,
      submarineCables: 7200,
      outages: 13000,
      fires: 7400,
      volcanoes: 10500
    };
    const markerAltitude = baseAltitudeByGroup[item.group] || 6200;
    const symbolByGroup = {
      militaryBases: "B",
      nuclearSites: "N",
      sanctions: "S",
      protests: "P",
      cyberIocs: "C",
      navalChokepoints: "K",
      stockExchanges: "X",
      cryptoHubs: "Y",
      centralBanks: "F",
      datacenters: "D",
      supplyChains: "L",
      energySites: "E",
      submarineCables: "U",
      outages: "O",
      volcanoes: "V",
      fires: "R",
      weather: "W",
      earthquakeFaults: "Q"
    };
    const stem = viewer.entities.add({
      id: `${id}-stem`,
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArrayHeights([
          Number(item.lon),
          Number(item.lat),
          0,
          Number(item.lon),
          Number(item.lat),
          markerAltitude
        ]),
        width: 1.05,
        material: color.withAlpha(0.35)
      }
    });
    const cap = viewer.entities.add({
      id,
      position: Cesium.Cartesian3.fromDegrees(Number(item.lon), Number(item.lat), markerAltitude),
      billboard: {
        image: buildGlyphSvg(symbolByGroup[item.group] || (item.group || "•").slice(0, 1).toUpperCase(), color.toCssColorString()),
        scale: 0.19,
        scaleByDistance: new Cesium.NearFarScalar(5e5, 1.0, 2.8e7, 0.42)
      }
    });
    registerTacticalMarker(cap,symbolByGroup[item.group] || "•",color.toCssColorString());
    stem.show=false;
    categoryCatalogLayer.set(id, {
      stem,
      cap,
      lat: Number(item.lat),
      lon: Number(item.lon),
      altitudeM: markerAltitude
    });
  }
}

function applyCategoryPreset(category) {
  currentCategory = category;
  const presets = {
    geopolitical: { aircraft: true, satellites: true, seismic: false, traffic: false, cctv: true, maritime: true, downdetector: false, news: true, weatherAlerts: false },
    finance: { aircraft: false, satellites: true, seismic: false, traffic: false, cctv: false, maritime: false, downdetector: true, news: true, weatherAlerts: false },
    infrastructure: { aircraft: false, satellites: true, seismic: false, traffic: true, cctv: true, maritime: true, downdetector: true, news: false, weatherAlerts: true },
    environmental: { aircraft: false, satellites: true, seismic: true, traffic: false, cctv: false, maritime: false, downdetector: false, news: false, weatherAlerts: true }
  };
  const next = presets[category] || presets.geopolitical;
  Object.assign(layerVisibility, next);
  syncFilterButtons();
  applyLayerVisibility();
  renderCategoryCatalog(category);
  if (currentMarker) updateContextForMarker(currentMarker);
}

function applyLayerUpdate(layer, entities, deferRefresh = false) {
  if (!deferRefresh) viewer.entities.suspendEvents();
  try {
    if (layer === "aircraft") updateAircraft(entities);
    if (layer === "satellites") updateSatellites(entities);
    if (layer === "seismic") updateSeismic(entities);
    if (layer === "traffic") updateTraffic(entities);
    if (layer === "cctv") updateCctv(entities);
    if (layer === "maritime") updateMaritime(entities);
    if (layer === "downdetector") updateDownDetector(entities);
    if (layer === "news") updateNews(entities);
    if (layer === "weatherAlerts") updateWeatherAlerts(entities);
    if (layer === "cyber") {
      liveSnapshot.cyber = entities || [];
      renderFeedPanels();
    }
    if (layer === "financeMarkets") {
      liveSnapshot.financeMarkets = entities || [];
    }
    if (layer === "power") {
      liveSnapshot.power = entities || [];
    }
    if (!deferRefresh) {
      applyLayerVisibility();
      updateKpisAndCharts();
      logRenderStats(`layer:${layer}`);
    }
  } catch (error) {
    pushDebug(`error applyLayerUpdate(${layer}) ${error?.message || error}`, { force: true });
  } finally {
    if (!deferRefresh) viewer.entities.resumeEvents();
  }
}

function applySnapshot(snapshot) {
  viewer.entities.suspendEvents();
  try {
    for (const layer of ["aircraft", "satellites", "seismic", "traffic", "cctv", "maritime", "downdetector", "news", "weatherAlerts", "cyber", "financeMarkets", "power"]) {
      applyLayerUpdate(layer, snapshot[layer] || [], true);
    }
    applyLayerVisibility();
    updateKpisAndCharts();
  } finally {
    viewer.entities.resumeEvents();
  }
  logRenderStats("snapshot");
}

function clearAllDynamicLayers() {
  clearEntityMap("aircraft", entityMaps.aircraft);
  clearEntityMap("satellites", entityMaps.satellites);
  clearEntityMap("seismic", entityMaps.seismic);
  clearEntityMap("cctv", entityMaps.cctv);
  clearEntityMap("maritime", entityMaps.maritime);
  clearEntityMap("downdetector", entityMaps.downdetector);
  clearEntityMap("news", entityMaps.news);
  clearEntityMap("weatherAlerts", entityMaps.weatherAlerts);
  clearTrafficLayer();
  satelliteDataById.clear();
  downDetectorDataById.clear();
  aircraftDataById.clear();
  maritimeDataById.clear();
}

function setModeButtons() {
  liveBtn.classList.toggle("active", liveMode);
  replayBtn.classList.toggle("active", !liveMode);
  replayPlayBtn.disabled = liveMode;
  replayPauseBtn.disabled = liveMode;
}

function stopReplayTimer() {
  if (replayTimer) {
    clearInterval(replayTimer);
    replayTimer = null;
  }
  replayIsPlaying = false;
}

function applyEvent(event) {
  if (event.topic === "entity_updates") applyLayerUpdate(event.payload.layer, event.payload.entities);
  if (event.topic === "marker_update") {
    setMarkerEntity(event.payload);
    setMarkerInfo(event.payload);
  }
}

function rehydrateToTime(targetTime) {
  clearAllDynamicLayers();
  replayCursor = 0;
  while (replayCursor < replayEvents.length && replayEvents[replayCursor].ts <= targetTime) {
    applyEvent(replayEvents[replayCursor]);
    replayCursor += 1;
  }
}

function updateScrubberFromTime() {
  if (replayEndTime <= replayStartTime) {
    scrubber.value = "0";
    return;
  }
  const ratio = (replayCurrentTime - replayStartTime) / (replayEndTime - replayStartTime);
  scrubber.value = String(Math.max(0, Math.min(1000, Math.round(ratio * 1000))));
}

function startReplayPlayback() {
  if (liveMode || replayEvents.length === 0) return;
  stopReplayTimer();
  replayIsPlaying = true;
  const speed = Number.parseFloat(speedSelect.value || "1");
  replayStatus.textContent = `Replay running at ${speed}x`;
  replayTimer = setInterval(() => {
    const stepMs = 250 * speed;
    replayCurrentTime += stepMs;
    while (replayCursor < replayEvents.length && replayEvents[replayCursor].ts <= replayCurrentTime) {
      applyEvent(replayEvents[replayCursor]);
      replayCursor += 1;
    }
    updateScrubberFromTime();
    if (replayCurrentTime >= replayEndTime || replayCursor >= replayEvents.length) {
      stopReplayTimer();
      replayCurrentTime = replayEndTime;
      replayStatus.textContent = "Replay reached end. Scrub back or press Live.";
    }
  }, 250);
}

function pauseReplayPlayback() {
  if (liveMode) return;
  stopReplayTimer();
  replayStatus.textContent = "Replay paused";
}

async function enterReplayMode() {
  const now = Date.now();
  const from = now - 2 * 60 * 60 * 1000;
  const replay = await fetch(`/api/replay?from=${from}&to=${now}`).then((r) => r.json());
  replayEvents = (replay.events || []).sort((a, b) => a.ts - b.ts);
  replayStartTime = replayEvents.length > 0 ? replayEvents[0].ts : from;
  replayEndTime = replayEvents.length > 0 ? replayEvents[replayEvents.length - 1].ts : now;
  replayCurrentTime = replayStartTime;
  liveMode = false;
  setModeButtons();
  replayStatus.textContent = `Replay loaded: ${replayEvents.length} events`;
  rehydrateToTime(replayCurrentTime);
  updateScrubberFromTime();
  pauseReplayPlayback();
}

function switchToLiveMode() {
  displayPaused = false;pausedAnimationTime=null;
  liveMode = true;
  stopReplayTimer();
  setModeButtons();
  replayStatus.textContent = "Live stream";
  scrubber.value = "1000";
  applySnapshot(liveSnapshot);
  if (currentMarker) setMarkerInfo(currentMarker, liveSnapshot.satellites.length);
}

function renderContextGroup(title, items, labeler) {
  const group = document.createElement("div");
  group.className = "context-group";
  const heading = document.createElement("div");
  heading.className = "context-group-title";
  heading.textContent = title;
  group.appendChild(heading);
  if (!items || items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "context-item tiny";
    empty.textContent = "No nearby items";
    group.appendChild(empty);
    return group;
  }
  for (const item of items.slice(0, 8)) {
    const line = document.createElement("div");
    line.className = "context-item";
    line.textContent = labeler(item);
    group.appendChild(line);
  }
  return group;
}

function renderContext(context) {
  renderNearbySummary(context);
  contextContent.innerHTML = "";
  if (!context) return;
  const block = (title, items, formatter) =>
    contextContent.appendChild(renderContextGroup(title, items, formatter));

  if (context.category === "geopolitical") {
    block("News", context.geopolitics.news, (x) => `${x.title} (${x.distanceMiles} mi)`);
    block("Conflicts/Protests", context.geopolitics.conflicts, (x) => `${x.title} (${x.distanceMiles} mi)`);
    block("Sanctions", context.geopolitics.sanctions, (x) => `${x.title} (${x.distanceMiles} mi)`);
    block("Cyber IOCs", context.geopolitics.cyberIocs, (x) => `${x.title} (${x.distanceMiles} mi)`);
    block("Chokepoints", context.geopolitics.chokepoints, (x) => `${x.name} (${x.distanceMiles} mi)`);
    block("Military Bases", context.geopolitics.militaryBases, (x) => `${x.name} (${x.distanceMiles} mi)`);
    block("Nuclear Sites", context.geopolitics.nuclearSites, (x) => `${x.name} (${x.distanceMiles} mi)`);
    block("Flights (ADS-B/OpenSky)", context.geopolitics.flights, (x) => `${x.callsign} (${x.distanceMiles} mi)`);
    block("Satellites", context.geopolitics.satellites, (x) => `${x.name} (${x.distanceMiles} mi)`);
    block("Naval Vessels", context.geopolitics.navalVessels, (x) => `${x.name} (${x.distanceMiles} mi)`);
    block("Cyber KEV", context.geopolitics.cyberKev, (x) => `${x.cve} (${x.vendor})`);
  } else if (context.category === "finance") {
    block("Stock Exchanges", context.finance.exchanges, (x) => `${x.name} (${x.distanceMiles} mi)`);
    block("Crypto Hubs", context.finance.crypto, (x) => `${x.name} (${x.distanceMiles} mi)`);
    block("Central Banks", context.finance.centralBanks, (x) => `${x.name} (${x.distanceMiles} mi)`);
    block("Market Movers", context.finance.markets, (x) => `${String(x.symbol || "").toUpperCase()} ${formatNumber(x.change24hPct, 2)}%`);
  } else if (context.category === "infrastructure") {
    block("Datacenters", context.infrastructure.datacenters, (x) => `${x.name} (${x.distanceMiles} mi)`);
    block("Supply Chains", context.infrastructure.supplyChains, (x) => `${x.name} (${x.distanceMiles} mi)`);
    block("Energy", context.infrastructure.energy, (x) => `${x.name} (${x.distanceMiles} mi)`);
    block("Submarine Cables", context.infrastructure.submarineCables, (x) => `${x.name} (${x.distanceMiles} mi)`);
    block("Outages", context.infrastructure.outages, (x) => `${x.name} (${x.distanceMiles} mi)`);
    block("Downdetector", context.infrastructure.downdetector, (x) => `${x.service} ${x.reportCount} (${x.outageStatus})`);
    block("Power Signal", context.infrastructure.power, (x) => `${x.status} stress ${x.stressScore}`);
  } else if (context.category === "environmental") {
    block("Earthquakes", context.environmental.earthquakes, (x) => `${x.place || "Earthquake"} M${x.mag ?? "?"} (${x.distanceMiles} mi)`);
    block("Fires", context.environmental.fires, (x) => `${x.name} (${x.distanceMiles} mi)`);
    block("Volcanoes", context.environmental.volcanoes, (x) => `${x.name} (${x.distanceMiles} mi)`);
    block("Weather", context.environmental.weather, (x) => `${x.name} (${x.distanceMiles} mi)`);
    block("Fault Lines", context.environmental.faultLines, (x) => `${x.name} (${x.distanceMiles} mi)`);
  }
}

async function updateContextForMarker(marker) {
  if (!marker) return;
  contextMeta.textContent = `Loading ${currentCategory} context near ${marker.lat.toFixed(2)}, ${marker.lon.toFixed(2)}...`;
  try {
    const qs = new URLSearchParams({
      lat: String(marker.lat),
      lon: String(marker.lon),
      radiusMiles: "500",
      category: currentCategory
    });
    const context = await fetch(`/api/context?${qs.toString()}`).then((r) => r.json());
    contextMeta.textContent = `${currentCategory.toUpperCase()} | 500 mi radius`;
    renderContext(context);
  } catch (error) {
    contextMeta.textContent = `Context unavailable: ${error.message}`;
  }
}

async function refreshIntelSummary() {
  try {
    const payload = await fetch("/api/intel/summary").then((r) => r.json());
    intelSummary = payload?.summary || intelSummary;
    intelHistory = payload?.history || intelHistory;
    updateKpisAndCharts();
  } catch {
    // keep last state
  }
}

async function loadOsintTypes() {
  try {
    const payload = await fetch("/api/osint/types").then((r) => r.json());
    const types = Array.isArray(payload?.types) ? payload.types : [];
    osintTypeSelect.innerHTML = "";
    for (const t of types) {
      const option = document.createElement("option");
      option.value = t.id;
      option.textContent = `${t.label}`;
      osintTypeSelect.appendChild(option);
    }
  } catch {
    osintTypeSelect.innerHTML = '<option value="location_brief">Location Brief</option>';
  }
}

function inferLookupCoords() {
  if (currentMarker) return { lat: currentMarker.lat, lon: currentMarker.lon };
  if (userLocation) return { lat: userLocation.lat, lon: userLocation.lon };
  return null;
}

async function runOsintLookup() {
  const type = osintTypeSelect.value || "location_brief";
  const coords = inferLookupCoords();
  const body = {
    type,
    radiusKm: Number(osintRadiusInput.value || 150)
  };
  if (coords) {
    body.lat = coords.lat;
    body.lon = coords.lon;
  }
  if (type === "domain_dns") body.domain = osintDomainInput.value.trim();
  if (type === "domain_rdap" || type === "domain_reputation_vt" || type === "domain_hunter") {
    body.domain = osintDomainInput.value.trim();
  }
  if (type === "ip_lookup" || type === "ip_reputation_abuseipdb" || type === "ip_exposure_shodan") {
    body.ip = osintIpInput.value.trim();
  }
  if (type === "email_breaches_hibp") body.email = osintEmailInput.value.trim();
  if (type === "url_metadata") body.url = osintUrlInput.value.trim();

  osintOutput.textContent = "Running lookup...";
  try {
    const payload = await fetch("/api/osint/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then((r) => r.json());
    if (!payload?.ok) throw new Error(payload?.error || "Lookup failed.");
    osintOutput.textContent = JSON.stringify(payload.result, null, 2);
  } catch (error) {
    osintOutput.textContent = `Lookup failed: ${error.message}`;
  }
}

liveBtn.addEventListener("click", switchToLiveMode);
replayBtn.addEventListener("click", () => {
  enterReplayMode().catch((error) => {
    console.warn("Replay load failed", error);
    replayStatus.textContent = "Replay failed to load";
  });
});
replayPlayBtn.addEventListener("click", startReplayPlayback);
replayPauseBtn.addEventListener("click", pauseReplayPlayback);

speedSelect.addEventListener("change", () => {
  if (!liveMode && replayIsPlaying) startReplayPlayback();
});

scrubber.addEventListener("input", () => {
  if (liveMode) return;
  const ratio = Number(scrubber.value) / 1000;
  const target = replayStartTime + ratio * (replayEndTime - replayStartTime);
  replayCurrentTime = target;
  rehydrateToTime(replayCurrentTime);
  replayStatus.textContent = `Replay scrub: ${Math.round(ratio * 100)}%`;
});

for (const btn of tabButtons) {
  btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
}

cctvRegionSelect.addEventListener("change", renderCctvRegion);
osintRunBtn.addEventListener("click", runOsintLookup);
osintUseMarkerBtn.addEventListener("click", () => {
  const coords = inferLookupCoords();
  if (!coords) {
    osintOutput.textContent = "No marker or user location available.";
    return;
  }
  osintOutput.textContent = `Using coordinates: ${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)}`;
});

if (quickSearchInput) {
  quickSearchInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    runQuickSearch(quickSearchInput.value).catch((error) => {
      markerInfo.textContent = `Search failed: ${error.message}`;
      showWorkspaceNotice(`Search failed: ${error.message}`);
    });
  });
}

shareLocationBtn.addEventListener("click", () => {
  requestBrowserLocation().catch((error) => {
    setLocationStatus(`Location failed: ${error.message}`);
  });
});

refreshLocationBtn.addEventListener("click", () => {
  requestBrowserLocation().catch((error) => {
    setLocationStatus(`Location failed: ${error.message}`);
  });
});

clearLocationBtn.addEventListener("click", async () => {
  try {
    await fetch("/api/location", { method: "DELETE" });
    userLocation = null;
    setLocationStatus("Stored location cleared.");
  } catch (error) {
    setLocationStatus(`Failed to clear location: ${error.message}`);
  }
});

function rerenderDynamicLayers(reason = "ui-tune") {
  if (liveMode) {
    applySnapshot(liveSnapshot);
  } else {
    rehydrateToTime(replayCurrentTime);
  }
  applyLayerVisibility();
  updateKpisAndCharts();
  logRenderStats(reason, { force: true });
}

if (markerOpacitySlider) {
  uiState.markerOpacity = pctToScale(markerOpacitySlider.value, 1);
  markerOpacitySlider.addEventListener("input", () => {
    uiState.markerOpacity = pctToScale(markerOpacitySlider.value, 1);
    syncDisplayTuningUI();
    applyLayerVisibility();
  });
}
if (markerScaleGlobal) {
  uiState.layerScale.global = pctToScale(markerScaleGlobal.value, 1);
  markerScaleGlobal.addEventListener("input", () => {
    uiState.layerScale.global = pctToScale(markerScaleGlobal.value, 1);
    syncDisplayTuningUI();
    rerenderDynamicLayers("scale-global");
  });
}
if (markerScaleAircraft) {
  uiState.layerScale.aircraft = pctToScale(markerScaleAircraft.value, 1);
  markerScaleAircraft.addEventListener("input", () => {
    uiState.layerScale.aircraft = pctToScale(markerScaleAircraft.value, 1);
    syncDisplayTuningUI();
    rerenderDynamicLayers("scale-aircraft");
  });
}
if (markerScaleSatellites) {
  uiState.layerScale.satellites = pctToScale(markerScaleSatellites.value, 1.2);
  markerScaleSatellites.addEventListener("input", () => {
    uiState.layerScale.satellites = pctToScale(markerScaleSatellites.value, 1.2);
    syncDisplayTuningUI();
    rerenderDynamicLayers("scale-sat");
  });
}
if (markerScaleMaritime) {
  uiState.layerScale.maritime = pctToScale(markerScaleMaritime.value, 1);
  markerScaleMaritime.addEventListener("input", () => {
    uiState.layerScale.maritime = pctToScale(markerScaleMaritime.value, 1);
    syncDisplayTuningUI();
    rerenderDynamicLayers("scale-maritime");
  });
}
if (markerScaleInfrastructure) {
  uiState.layerScale.infrastructure = pctToScale(markerScaleInfrastructure.value, 1);
  markerScaleInfrastructure.addEventListener("input", () => {
    uiState.layerScale.infrastructure = pctToScale(markerScaleInfrastructure.value, 1);
    syncDisplayTuningUI();
    rerenderDynamicLayers("scale-infra");
  });
}
if (markerScaleEnvironmental) {
  uiState.layerScale.environmental = pctToScale(markerScaleEnvironmental.value, 1);
  markerScaleEnvironmental.addEventListener("input", () => {
    uiState.layerScale.environmental = pctToScale(markerScaleEnvironmental.value, 1);
    syncDisplayTuningUI();
    rerenderDynamicLayers("scale-env");
  });
}
if (satOrbitToggle) {
  uiState.showSatelliteArcs = satOrbitToggle.checked;
  satOrbitToggle.addEventListener("change", () => {
    uiState.showSatelliteArcs = satOrbitToggle.checked;
    applyLayerVisibility();
  });
}
if (satStemToggle) {
  uiState.showSatelliteStems = satStemToggle.checked;
  satStemToggle.addEventListener("change", () => {
    uiState.showSatelliteStems = satStemToggle.checked;
    applyLayerVisibility();
  });
}
if (labelDensitySelect) {
  uiState.labelDensity = labelDensitySelect.value || "auto";
  labelDensitySelect.addEventListener("change", () => {
    uiState.labelDensity = labelDensitySelect.value || "auto";
    applyLayerVisibility();
  });
}

if (camHomeBtn) {
  camHomeBtn.addEventListener("click", () => viewer.camera.flyTo({destination:Cesium.Cartesian3.fromDegrees(-42,37,14500000),orientation:{heading:0,pitch:-Math.PI/2,roll:0},duration:1}));
}
if (camNorthBtn) {
  camNorthBtn.addEventListener("click", () => {
    const current = viewer.camera.positionCartographic;
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromRadians(
        current.longitude,
        current.latitude,
        current.height
      ),
      orientation: {
        heading: 0,
        pitch: viewer.camera.pitch,
        roll: 0
      }
    });
  });
}
if (zoomInBtn) zoomInBtn.addEventListener("click", () => viewer.camera.zoomIn(viewer.camera.positionCartographic.height*.4));
if (zoomOutBtn) zoomOutBtn.addEventListener("click", () => viewer.camera.zoomOut(viewer.camera.positionCartographic.height*.65));
if (scene2dBtn) {
  scene2dBtn.addEventListener("click", () => {
    viewer.scene.morphTo2D(0.8);
    setSceneModeButtons();
  });
}
if (scene3dBtn) {
  scene3dBtn.addEventListener("click", () => {
    viewer.scene.morphTo3D(0.8);
    setSceneModeButtons();
  });
}
if (globeRealBtn) {
  globeRealBtn.addEventListener("click", () => setGlobeRenderMode("real"));
}
if (globeFlatBtn) {
  globeFlatBtn.addEventListener("click", () => setGlobeRenderMode("flat"));
}
if (viewer.scene?.morphComplete?.addEventListener) {
  viewer.scene.morphComplete.addEventListener(() => setSceneModeButtons());
}
syncDisplayTuningUI();
setSceneModeButtons();
setGlobeRenderMode("real");

if (viewRadiusSlider) {
  aircraftDisplayLimit = sliderToAircraftLimit(viewRadiusSlider.value, liveSnapshot.aircraft.length || liveTotals.aircraft || 10000);
  updateAircraftLimitLabel();
  viewRadiusSlider.addEventListener("input", () => {
    aircraftDisplayLimit = sliderToAircraftLimit(viewRadiusSlider.value, liveSnapshot.aircraft.length || liveTotals.aircraft || 10000);
    updateAircraftLimitLabel();
    if (liveMode) {
      updateAircraft(liveSnapshot.aircraft);
      applyLayerVisibility();
    } else {
      rehydrateToTime(replayCurrentTime);
    }
  });
}

if (toggleLeftPanelBtn && leftPanel) {
  toggleLeftPanelBtn.addEventListener("click", () => {
    leftPanel.classList.toggle("collapsed");
    toggleLeftPanelBtn.textContent = leftPanel.classList.contains("collapsed") ? "Expand" : "Collapse";
  });
}
if (toggleRightPanelBtn && rightPanel) {
  toggleRightPanelBtn.addEventListener("click", () => {
    rightPanel.classList.toggle("collapsed");
    toggleRightPanelBtn.textContent = rightPanel.classList.contains("collapsed") ? "Expand" : "Collapse";
  });
}

for (const btn of filterContainer.querySelectorAll(".filter-btn")) {
  btn.addEventListener("click", () => {
    const layer = btn.dataset.layer;
    layerVisibility[layer] = !layerVisibility[layer];
    btn.classList.toggle("active", layerVisibility[layer]);
    btn.setAttribute("aria-pressed", String(layerVisibility[layer]));
    applyLayerVisibility();
  });
}

for (const btn of categorySwitch.querySelectorAll(".filter-btn")) {
  btn.addEventListener("click", () => {
    for (const b of categorySwitch.querySelectorAll(".filter-btn")) b.classList.remove("active");
    btn.classList.add("active");
    applyCategoryPreset(btn.dataset.category);
  });
}

const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
const ws = new WebSocket(`${wsProtocol}://${window.location.host}/ws`);
ws.onmessage = (event) => {
  let msg;
  try {
    msg = JSON.parse(event.data);
  } catch (error) {
    pushDebug(`error ws parse ${error?.message || error}`, { force: true });
    return;
  }
  if (msg.topic === "scene_state") {
    userLocation = msg.payload?.userLocation || userLocation;
    intelSummary = msg.payload?.intelSummary || intelSummary;
    intelHistory = msg.payload?.intelHistory || intelHistory;
    if (userLocation) {
      setLocationStatus(
        `Location active (${formatNumber(userLocation.lat, 4)}, ${formatNumber(userLocation.lon, 4)})`
      );
    }
    if (msg.payload?.marker) {
      setMarkerEntity(msg.payload.marker);
      setMarkerInfo(msg.payload.marker, msg.payload?.layers?.satellites?.length ?? null);
      updateContextForMarker(msg.payload.marker);
    } else {
      currentMarker = null;
      setMarkerInfo(null);
    }
    liveSnapshot.aircraft = msg.payload?.layers?.aircraft || liveSnapshot.aircraft;
    liveSnapshot.satellites = msg.payload?.layers?.satellites || liveSnapshot.satellites;
    liveSnapshot.seismic = msg.payload?.layers?.seismic || liveSnapshot.seismic;
    liveSnapshot.traffic = msg.payload?.layers?.traffic || liveSnapshot.traffic;
    liveSnapshot.cctv = msg.payload?.layers?.cctv || liveSnapshot.cctv;
    liveSnapshot.maritime = msg.payload?.layers?.maritime || liveSnapshot.maritime;
    liveSnapshot.downdetector = msg.payload?.layers?.downdetector || liveSnapshot.downdetector;
    liveSnapshot.news = msg.payload?.layers?.news || liveSnapshot.news;
    liveSnapshot.cyber = msg.payload?.layers?.cyber || liveSnapshot.cyber;
    liveSnapshot.financeMarkets = msg.payload?.layers?.financeMarkets || liveSnapshot.financeMarkets;
    liveSnapshot.weatherAlerts = msg.payload?.layers?.weatherAlerts || liveSnapshot.weatherAlerts;
    liveSnapshot.power = msg.payload?.layers?.power || liveSnapshot.power;
    liveTotals.aircraft = Number(msg.payload?.layerTotals?.aircraft ?? liveSnapshot.aircraft.length ?? 0);
    liveTotals.satellites = Number(msg.payload?.layerTotals?.satellites ?? liveSnapshot.satellites.length ?? 0);
    liveTotals.maritime = Number(msg.payload?.layerTotals?.maritime ?? liveSnapshot.maritime.length ?? 0);
    if (liveMode && !displayPaused) applySnapshot(liveSnapshot);
    updateKpisAndCharts();
    renderFeedPanels();
    pushDebug(
      `scene aircraft=${liveSnapshot.aircraft.length} sat=${liveSnapshot.satellites.length} maritime=${liveSnapshot.maritime.length}`
    );
    logRenderStats("scene_state", { force: true });
    return;
  }

  if (msg.topic === "entity_updates") {
    liveSnapshot[msg.payload.layer] = msg.payload.entities || [];
    if (msg.payload?.total !== undefined && msg.payload?.total !== null) {
      liveTotals[msg.payload.layer] = Number(msg.payload.total);
    } else if (Array.isArray(msg.payload.entities)) {
      liveTotals[msg.payload.layer] = msg.payload.entities.length;
    }
    if (liveMode && !displayPaused) {
      applyLayerUpdate(msg.payload.layer, msg.payload.entities);
      if (msg.payload.layer === "satellites") setMarkerInfo(currentMarker, msg.payload.entities.length);
    }
    if (msg.payload.layer === "cctv") renderCctvRegion();
    if (msg.payload.layer === "news" || msg.payload.layer === "cyber") renderFeedPanels();
    updateKpisAndCharts();
    pushDebug(`update ${msg.payload.layer}: ${Array.isArray(msg.payload.entities) ? msg.payload.entities.length : 0}`);
    logRenderStats(`update:${msg.payload.layer}`);
    return;
  }

  if (msg.topic === "marker_update") {
    setMarkerEntity(msg.payload);
    if (liveMode) setMarkerInfo(msg.payload, liveSnapshot.satellites.length);
    updateContextForMarker(msg.payload);
    return;
  }

  if (msg.topic === "location_update") {
    userLocation = msg.payload?.location || null;
    if (userLocation) {
      setLocationStatus(
        `Location active (${formatNumber(userLocation.lat, 4)}, ${formatNumber(userLocation.lon, 4)})`
      );
    } else {
      setLocationStatus("Location not shared yet.");
    }
    return;
  }

  if (msg.topic === "intel_summary") {
    intelSummary = msg.payload?.summary || intelSummary;
    intelHistory = msg.payload?.history || intelHistory;
    updateKpisAndCharts();
  }
};
ws.onopen = () => setConnectionStatus("Connected");
ws.onerror = () => {
  setConnectionStatus("Connection error");
  pushDebug("error websocket error event", { force: true });
};
ws.onclose = (event) => {
  setConnectionStatus("Disconnected · reload to reconnect");
  pushDebug(`warn websocket closed code=${event.code} reason=${event.reason || "n/a"}`, { force: true });
};

const clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
clickHandler.setInputAction(async (movement) => {
  const picked = viewer.scene.pick(movement.position);
  const pickedId = picked?.id?.id;
  if (typeof pickedId === "string") {
    if (pickedId.startsWith("sat-path-")) {
      const sat = satelliteDataById.get(pickedId.slice("sat-path-".length));
      if (sat) activateGraphsAt(Number(sat.lat), Number(sat.lon), "satellite");
      selectSatelliteById(pickedId.slice("sat-path-".length));
      return;
    }
    if (pickedId.startsWith("sat-")) {
      const sat = satelliteDataById.get(pickedId.slice("sat-".length));
      if (sat) activateGraphsAt(Number(sat.lat), Number(sat.lon), "satellite");
      selectSatelliteById(pickedId.slice("sat-".length));
      return;
    }
    if (pickedId.startsWith("aircraft-")) {
      const row = aircraftDataById.get(stripStemSuffix(pickedId.slice("aircraft-".length)));
      if (row) {
        activateGraphsAt(Number(row.lat), Number(row.lon), "aircraft");
        showAircraftDetails(row);
      }
      return;
    }
    if (pickedId.startsWith("maritime-")) {
      const row = maritimeDataById.get(stripStemSuffix(pickedId.slice("maritime-".length)));
      if (row) {
        activateGraphsAt(Number(row.lat), Number(row.lon), "maritime");
        showMaritimeDetails(row);
      }
      return;
    }
    if (pickedId.startsWith("downdetector-")) {
      const row = downDetectorDataById.get(stripStemSuffix(pickedId.slice("downdetector-".length)));
      if (row) activateGraphsAt(Number(row.lat), Number(row.lon), "downdetector");
      showDownDetectorDetails(row || null);
      return;
    }
    if (pickedId.startsWith("cctv-")) {
      const normalized = stripStemSuffix(pickedId);
      const cam = liveSnapshot.cctv.find((x) => `cctv-${x.id}` === normalized);
      if (cam) {
        activateGraphsAt(Number(cam.lat), Number(cam.lon), "cctv");
        setEntityDetails(`CCTV | ${cam.label || cam.id}`, [
          ["Region", cam.regionName || cam.regionKey || "Unknown"],
          ["Source", cam.source || "Unknown"],
          ["Latitude", formatNumber(cam.lat, 4)],
          ["Longitude", formatNumber(cam.lon, 4)],
          ["Feed", cam.streamUrl || cam.detailsUrl || "n/a"]
        ]);
      }
      return;
    }
  }

  const cartesian = viewer.camera.pickEllipsoid(movement.position, viewer.scene.globe.ellipsoid);
  if (!cartesian) return;
  const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
  const marker = {
    lat: Cesium.Math.toDegrees(cartographic.latitude),
    lon: Cesium.Math.toDegrees(cartographic.longitude)
  };
  activateGraphsAt(marker.lat, marker.lon, "marker");
  setEntityDetails("Selected entity details", []);
  setMarkerEntity(marker);
  setMarkerInfo(marker);
  updateContextForMarker(marker);
  try {
    const resp = await fetch("/api/marker", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(marker)
    });
    const data = await resp.json();
    if (data?.marker) {
      setMarkerEntity(data.marker);
      setMarkerInfo(data.marker, data.satellitesLoaded ?? null);
      updateContextForMarker(data.marker);
    }
  } catch (error) {
    console.warn("Failed to update marker", error);
  }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

applyCategoryPreset("geopolitical");
setModeButtons();
renderSatelliteDetails(null);
setEntityDetails("Selected entity details", []);
setActiveTab("context");
initUiMotion();
loadOsintTypes();
refreshIntelSummary();
pushDebug(`init build=${APP_BUILD_ID} provider=${satelliteProvider} globe=google3d`);
logRenderStats("init", { force: true });
setInterval(refreshIntelSummary, 60000);
fetch("/api/cctv/regions")
  .then((r) => r.json())
  .then((payload) => {
    cctvRegions = payload?.regions || cctvRegions;
    renderCctvRegion();
  })
  .catch(() => {});
loadStoredLocation()
  .then(() => maybePromptForLocation())
  .catch(() => maybePromptForLocation());


function setConnectionStatus(text) {
  const el = document.getElementById("connectionStatus");
  el.textContent = text;
  el.style.color = text === "Connected" ? "#68dfb4" : "#f1ba68";
}
function renderWorkspaceData() {
  for (const el of document.querySelectorAll("[data-count]")) {
    const key = el.dataset.count;
    el.textContent = Number(liveTotals[key] ?? liveSnapshot[key]?.length ?? 0).toLocaleString();
  }
  for (const button of filterContainer.querySelectorAll("[data-layer]")) button.setAttribute("aria-pressed", String(Boolean(layerVisibility[button.dataset.layer])));
  document.getElementById("threatStatus").textContent = intelSummary?.score?.posture || "Awaiting data";
  document.getElementById("dataFreshness").textContent = gatewayLatency === null ? "Measuring latency…" : `${Math.round(gatewayLatency)} ms`;
  document.getElementById("dataFreshness").title = `Gateway HTTP response time. ${mapNotice}`;
  renderPrecision({summary:intelSummary,history:intelHistory,snapshot:liveSnapshot,totals:liveTotals,
    localScores:graphFocus ? Object.values(buildLocalGraphSnapshot().categoryScores) : null,scope:graphFocus});
}

function renderGlobalCharts() {
  ensureCharts();
  if (graphScopeMeta) graphScopeMeta.textContent = "Global intelligence · select a marker to scope analysis";
  if (chartState.risk) {
    const points = intelHistory.slice(-90);
    chartState.risk.data.labels = points.map(point => new Date(point.ts || point.timestamp || Date.now()).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",hour12:false}));
    chartState.risk.data.datasets[0].label = "Global composite risk";
    chartState.risk.data.datasets[0].data = points.map(point => Number(point.compositeRisk ?? point.score?.compositeRisk ?? point.risk ?? 0));
    styleRiskChart(chartState.risk,graphFocus,points.map(p=>p.ts || p.timestamp));
  }
  if (chartState.category) {
    chartState.category.data.datasets[0].data = ["geopolitical","finance","infrastructure","environmental"].map(key => Number(intelSummary?.categories?.[key]?.[{geopolitical:"geopoliticsScore",finance:"volatilityScore",infrastructure:"stressScore",environmental:"climateRiskScore"}[key]] ?? 0));
    chartState.category.update("none");
  }
}
let noticeTimer;
function showWorkspaceNotice(text) {
  const el = document.getElementById("workspaceNotice"); el.textContent = text; el.hidden = false;
  clearTimeout(noticeTimer);noticeTimer = setTimeout(() => { el.hidden = true; }, 6000);
}
initWorkspace({
  onGlobalScope: () => { graphFocus = null; updateKpisAndCharts(); },
  onNavigate: view => {
    if (["intel","data","firewall","alerts","attacks"].includes(view)) {
      rightPanel.classList.remove("collapsed");
      setActiveTab(view === "firewall" ? "investigator" : "feeds");
      if (view === "data") showWorkspaceNotice("Feed sources and update state are shown in the inspector. Layer totals appear on the left.");
      if (["alerts","attacks"].includes(view)) showWorkspaceNotice("News and known exploited vulnerabilities. Vector does not infer live cyber attacks.");
    } else if (view === "operations") {
      document.getElementById("displaySettings").showModal();
    } else {
      setActiveTab("context");
      leftPanel.classList.remove("collapsed");rightPanel.classList.remove("collapsed");
      if (view === "tactical") { applyCategoryPreset("geopolitical");showWorkspaceNotice("Geopolitical layers enabled"); }
    }
  }
});
satOrbitToggle.checked = uiState.showSatelliteArcs;
satStemToggle.checked = uiState.showSatelliteStems;
labelDensitySelect.value = uiState.labelDensity;
ensureCharts();renderWorkspaceData();renderGlobalCharts();
setGlobeRenderMode("real");

initPrecision({
  onVisual:setMode,
  onSpeed:()=>{ if(!liveMode && replayIsPlaying) startReplayPlayback(); },
  onPause:()=>{
    if (!liveMode) { if(replayTimer){ pauseReplayPlayback();return true; } startReplayPlayback();return false; }
    displayPaused=!displayPaused;pausedAnimationTime=displayPaused?Date.now():null; if(!displayPaused) applySnapshot(liveSnapshot);return displayPaused;
  },
  onLocate:location=>{
    const marker={lat:location.lat,lon:location.lon};setMarkerEntity(marker);setMarkerInfo(marker);
    setLocationStatus(`Lat ${location.lat.toFixed(4)}   Lon ${location.lon.toFixed(4)} · Focused`);
    viewer.camera.flyTo({destination:Cesium.Cartesian3.fromDegrees(location.lon,location.lat,2500000),duration:1.4});
    activateGraphsAt(marker.lat,marker.lon,'location');updateContextForMarker(marker);
  },
  onFocusAsset:()=>{const asset=selectedSatelliteId && entityMaps.satellites.get(selectedSatelliteId);if(asset?.point)viewer.flyTo(asset.point,{duration:1.3,offset:new Cesium.HeadingPitchRange(0,-0.8,2000000)});else showWorkspaceNotice('Select a satellite first.');},
  onIntel:()=>{rightPanel.classList.remove('collapsed');setActiveTab('feeds');},
  onCameras:()=>{rightPanel.classList.remove('collapsed');setActiveTab('cctv');},
  onNotice:showWorkspaceNotice,
  onGlobal:()=>{graphFocus=null;updateKpisAndCharts();},
  onScope:scope=>{if(scope==='global'){graphFocus=null;updateKpisAndCharts();}else if(currentMarker){activateGraphsAt(Number(currentMarker.lat),Number(currentMarker.lon),'selected location');}else{showWorkspaceNotice('Select a location on the globe first.');updateKpisAndCharts();}}
});
setInterval(()=>updatePrecisionTimeline({live:liveMode,time:replayCurrentTime,start:replayStartTime,end:replayEndTime,paused:displayPaused}),1000);
updatePrecisionTimeline({live:true});

viewer.scene.skyBox = new Cesium.SkyBox({sources:Object.fromEntries(['positiveX','negativeX','positiveY','negativeY','positiveZ','negativeZ'].map(side=>[side,'/assets/starfield.png']))});
viewer.camera.moveEnd.addEventListener(applyLayerVisibility);
document.getElementById('overviewDeclutter').addEventListener('change',event=>{overviewDeclutter=event.target.checked;applyLayerVisibility();});
for (const [name,lon,lat] of [['Canada',-106,57],['United States',-100,37],['North Atlantic Ocean',-43,37],['Kyiv',30.5234,50.4501],['Moscow',37.6173,55.7558]]) {
  viewer.entities.add({id:`cartography-${name}`,position:Cesium.Cartesian3.fromDegrees(lon,lat,20000),
    point:/Kyiv|Moscow/.test(name)?{pixelSize:5,color:Cesium.Color.fromCssColorString('#bfd9ed'),outlineWidth:2,outlineColor:Cesium.Color.fromCssColorString('#304d62')}:undefined,
    label:{text:name==='North Atlantic Ocean'?'N o r t h\nA t l a n t i c\nO c e a n':name,font:name==='North Atlantic Ocean'?"italic 15px 'DM Sans'":"11px 'DM Sans'",fillColor:Cesium.Color.fromCssColorString(name==='North Atlantic Ocean'?'#39accf':'#b9cbd6'),outlineWidth:2,outlineColor:Cesium.Color.fromCssColorString('#06151b').withAlpha(0.6),style:Cesium.LabelStyle.FILL_AND_OUTLINE,pixelOffset:new Cesium.Cartesian2(0,name==='Kyiv'||name==='Moscow'?-12:0),distanceDisplayCondition:new Cesium.DistanceDisplayCondition(2500000,30000000)}});
}

document.getElementById('surfaceRealBtn').addEventListener('click',()=>setGlobeRenderMode('real'));

async function measureGatewayLatency(){
  const start=performance.now();try{const response=await fetch('/healthz',{cache:'no-store'});if(response.ok){await response.text();gatewayLatency=performance.now()-start;document.getElementById('dataFreshness').textContent=`${Math.round(gatewayLatency)} ms`;}}catch{gatewayLatency=null;}
}
measureGatewayLatency();setInterval(measureGatewayLatency,30000);


// The dotted Earth is a 3D globe appearance; keep the existing 2D imagery map intact.
viewer.scene.morphComplete.addEventListener(()=>{if(viewer.scene.mode===Cesium.SceneMode.SCENE2D && globeRenderMode==="flat") setGlobeRenderMode("real");});
