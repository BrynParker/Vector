# Deployment

## Upload to Pterodactyl

1. Import `pterodactyl/egg-vector-nodejs.json` through the Panel's administration interface. It uses the community Pterodactyl-compatible image `ghcr.io/parkervcp/yolks:nodejs_24`. A compatible Node.js 22/24 egg also works.
2. Assign a primary allocation and select the Node.js 24 image. Start with 1 GB RAM and 1 CPU; increase for large feeds. Allow outbound HTTPS/WSS and DNS. Disk usage grows with cache and bounded logs.
3. Upload the application ZIP in the File Manager and extract it into `/home/container`. The root must contain `package.json`, `run.sh`, `src/`, `public/`, and `node_modules/`, not a second enclosing directory. Delete the uploaded ZIP afterward to save disk space.
4. Startup command: `bash ./run.sh`. Keep `APP_HOST=0.0.0.0`. The Panel's `SERVER_PORT` allocation overrides port settings in private files.
5. Set `PUBLIC_ORIGIN` to the final HTTPS origin. Set `TRUST_PROXY` to the actual IP/subnet that connects from Nginx to the container; Docker setups may use the Wings bridge gateway. Do not trust all addresses.
6. Add optional provider keys via Panel environment variables or copy `.env.example` to `.env.production` and edit privately. Never upload a private file to GitHub. A normal keyless start is supported; providers needing credentials remain unavailable.
7. Start the server. The console should show `[vector] running ...`. Confirm `/healthz`, `/readyz`, the globe, and `Live / WebSocket: CONNECTED` through the public origin.

The release includes all production dependencies, which currently contain no native binaries. Source checkouts install them with `npm ci --omit=dev --ignore-scripts`. Keep the lockfile. A missing `node_modules/` triggers that same install at first boot, requiring registry access and writable disk. Reinstall dependencies after changing the lockfile.

The egg installation step creates the upload directory only; it does not clone a repository or prompt for Git credentials. Upload the release before first start. Use `bash ./run.sh` even when ZIP extraction does not preserve executable bits. Shell scripts use Linux line endings.

## Nginx

Nginx-only images do not provide the Node.js runtime required by this application. Use the supplied Node.js egg with Nginx on the host or in a separate proxy container, or use an existing combined Node/Nginx egg with a maintained Node.js runtime. Do not serve the project root as a static directory.

Adapt `deploy/nginx/vector.conf.example`: replace the public hostname, certificate paths, and upstream allocation address. Validate with `nginx -t` before reload. For a proxy on another host, use a private network or TLS between proxy and upstream. Firewall the allocation so clients reach it through the HTTPS proxy. Do not enable public directory listings or expose Panel environment files, cache, or logs.

The example preserves WebSocket upgrades and forwards the original host and scheme. Node adds CSP and other security headers; HSTS and Secure cookies are enabled for HTTPS requests from a trusted proxy. Keep the canonical host consistent with `PUBLIC_ORIGIN`. If WebSocket connects fail with 403, verify the proxy address is trusted, cookies are forwarded, and the origin matches.

## Persistent state

Keep `data/` private and persistent. Location/session snapshots are encrypted with the configured secret or `data/.session-key`. Rotating/removing the key discards existing private sessions. Other visitors cannot read a visitor's stored location or analysis marker through the API, WebSocket snapshot, or public replay. Clearing location removes its private saved marker. Browser geolocation does not recenter the shared traffic feed; manual map focus can refresh shared public feed coverage.

Replay history is held in memory and resets on restart. Last-known-good public feeds are cached locally; never include this cache in public releases. Logs rotate at approximately 5 MB with three previous files; client diagnostics are disabled by default. SIGINT/SIGTERM saves state before exit. Back up persistent data privately.

## Optional local Overpass

`deploy/overpass/docker-compose.yml` and `scripts/run-overpass-local.sh` are an optional host-side service, not a requirement and not something to run inside the app egg. Review its download size and region first. Its port binds to loopback. Set `OSM_OVERPASS_URL` to an address reachable from the app container if using it. The public-provider fallback remains available.

## Verification and troubleshooting

- `/healthz` returns 200 when the process is running; `/readyz` checks runtime readiness, not provider availability.
- Blank layer: check the Feeds view, provider credentials, outbound access, and quotas. Free endpoints may rate-limit or be unavailable.
- Missing globe libraries/fonts/detail: ensure the browser can access the CDN and imagery endpoints. Local NASA imagery remains bundled.
- Offline server: ensure the primary allocation matches the proxy upstream, the image has Node.js 22+, and startup is `bash ./run.sh`.
- Browser location sharing requires HTTPS (localhost is allowed for development).

The release is locally tested by extracting a fresh ZIP, booting without credentials, exercising API/WebSocket isolation and headers, and verifying asset hashes. No remote Pterodactyl installation is implied by these local checks.
