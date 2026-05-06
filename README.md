# Custom Pterodactyl Egg (WorldViewer)

This repo now includes a **custom egg from scratch** based on `ysdragon/Pterodactyl-VPS-Egg`:

- Egg JSON: `pterodactyl/egg/worldviewer_vps_egg.json`
- Install script: `pterodactyl/scripts/install.sh`
- Runtime script: `pterodactyl/scripts/run.sh`

## What it does

- Installs all required packages explicitly.
- Installs Node.js (configurable major version).
- Clones your repository and builds it.
- Writes runtime env values.
- Starts feed gateway (`npm run server`) and optionally frontend (`npm run preview`).

## Import into Pterodactyl

1. In panel, go to **Nests -> Import Egg**.
2. Upload `pterodactyl/egg/worldviewer_vps_egg.json`.
3. Create a server with this egg.
4. Set required variables:
   - `REPO_URL`
   - `REPO_BRANCH` (default `main`)
   - `SERVER_PORT` (default `8787`)
5. Optional:
   - `RUN_FRONTEND=1` and `WEB_PORT=4173` to run web preview.
   - `GOOGLE_MAPS_API_KEY` for Photorealistic 3D tiles in browser.

## Notes on VPS Egg compatibility

- Uses the same base image pattern (`quay.io/ydrag0n/pterodactyl-vps-egg:latest`).
- Startup remains `./run.sh` (egg-compatible convention).
- Installer copies runtime script to `/mnt/server/run.sh` so Wings starts it directly.
