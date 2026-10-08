# Vector

Real-time geospatial intelligence in a browser. Vector combines an interactive 3D Earth, live operational layers, proximity analysis, an investigation workspace, and risk and market charts.

## Application

- Realistic and high-visibility Earth surfaces, local 16K NASA imagery, and streamed close-range imagery.
- Aircraft, propagated satellite orbits, maritime positions, seismic events, roads, public cameras, news, weather alerts, and service disruptions.
- Smooth marker interpolation, bounded prediction, selection details, layer controls, and 2D/3D viewing.
- Global and location-scoped intelligence, category scores, market trends, and a two-hour in-memory replay.
- Optional OSINT integrations for domains, IPs, email breaches, reputation, and public URL metadata.

Provider availability, credentials, quotas, coverage, and network access determine which layers are populated. Road geometry is not a live vehicle-position feed. Imagery and illustrative assets are documented in [asset credits](docs/ASSETS.md). Risk scores are heuristics, not authoritative threat assessments.

## Run locally

Use a maintained Node.js 22 or 24 LTS release. No frontend compilation is required.

```sh
npm ci --omit=dev --ignore-scripts
npm start
```

Open `http://localhost:3000`. To customize providers, copy `.env.example` to `.env.production` and set the required values privately. Environment variables take priority over files. No API credentials are required just to start the server. The application creates a private persistent session-encryption key in `data/.session-key` when `JWT_SECRET` is unset. Keep that file across restarts.

```sh
npm test
npm run build
npm audit --omit=dev
```

## Pterodactyl deployment

See [the complete deployment guide](docs/DEPLOYMENT.md). Upload and extract the release ZIP **directly into `/home/container`**, select the supplied Vector Node.js egg (or a compatible Node.js egg), and use:

```sh
bash ./run.sh
```

The archive includes production JavaScript dependencies. The launcher installs from the lockfile only if dependencies are missing. `SERVER_PORT` from the primary allocation takes priority over `APP_PORT` and `PORT`; bind to `0.0.0.0` inside the container.

**An Nginx-only egg cannot run the full application.** Nginx should proxy to the Node.js allocation, including `/api/` and `/ws`. Serving only `public/` loses API feeds, live updates, investigation tools, and visitor state. A Node.js egg and an example Nginx HTTPS proxy configuration are included under `pterodactyl/` and `deploy/nginx/`.

## Configuration

`.env.example` lists common settings and all server-only credential names. `src/config.js` documents every supported option and default. Useful settings:

| Variable | Purpose |
| --- | --- |
| `SERVER_PORT` | Pterodactyl primary allocation; highest priority |
| `APP_PORT` / `PORT` | Local fallback port; default 3000 |
| `APP_HOST` | Bind address; default `0.0.0.0` |
| `PUBLIC_ORIGIN` | Canonical HTTPS origin, e.g. `https://vector.example.com` |
| `TRUST_PROXY` | Actual proxy address/subnet; default `loopback` |
| `JWT_SECRET` | Optional persistent secret of at least 32 characters |
| `DATA_CACHE_PATH` | Private last-known-good cache path |
| `CLIENT_LOGGING` | Opt-in client diagnostics; default false |
| `GOOGLE_MAPS_API_KEY` / `CESIUM_ION_TOKEN` | Browser-visible provider credentials; restrict origin and permissions |
| `ENABLE_*` | Enable or disable individual providers |

OpenSky can run without authentication at lower quotas. AISStream, commercial OSINT, regional 511 feeds, and optional disruption providers require their own credentials. Additional imagery, fonts, CDN libraries, geocoding, and data providers require outbound HTTPS; AISStream requires outbound WSS. Google/Cesium browser credentials are intentionally delivered to the browser and cannot be treated as server secrets.

## Security and privacy

See [SECURITY.md](SECURITY.md) for protections, deployment requirements, and limitations. Keep TLS enabled at the proxy and restrict the allocation to the proxy where possible. This is a public situational-awareness application; it does not implement operator accounts or an access-control system. Use a VPN or authentication gateway if deploying for a private audience.

Production secrets, logs, personal location caches, dependencies, archives, and design working files are excluded from Git. Release archives contain no production `.env` or session keys. Configure integrations in the Panel or a private `.env.production`; never commit these files.

## Project structure

- `public/`: browser UI, globe, markers, charts, and runtime assets
- `src/`: HTTP/WebSocket service and provider integrations
- `tests/`: security and visitor-isolation integration tests
- `scripts/`: launcher, validation, and motion checks
- `deploy/`: reverse proxy and optional local Overpass example
- `pterodactyl/`: importable Node.js egg
- `docs/`: deployment and third-party asset attribution

Third-party dependencies retain their own licenses. See `public/vendor/satellite.LICENSE.md` and [asset credits](docs/ASSETS.md).

## Build an upload archive

After installing production dependencies, use Python 3 (standard library only):

```sh
python scripts/package-release.py /path/outside/project/Vector-Pterodactyl.zip
```

The packager uses an explicit file allowlist, includes installed production dependencies, preserves Linux shell permissions/line endings, and writes a per-file SHA-256 manifest plus an archive checksum. It excludes local secrets, cache, logs, Git history, and design working files. Scan the finished release before publishing it.

Rendering optimizations and reproducible measurements are documented in [performance notes](docs/PERFORMANCE.md). Run `npm run benchmark` for the isolated marker sampling benchmark.
