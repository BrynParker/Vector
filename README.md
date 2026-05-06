# WorldViewerDupe One-File Setup

Run everything with one command on Ubuntu 26.04:

```bash
sudo bash autorun.sh
```

## Optional environment variables

```bash
sudo REPO_URL="https://github.com/<you>/<repo>.git" \
     REPO_BRANCH="main" \
     APP_DIR="/opt/worldviewer" \
     APP_USER="worldview" \
     NODE_MAJOR="22" \
     INSTALL_NGINX="1" \
     INSTALL_SYSTEMD="1" \
     bash autorun.sh
```

## Pterodactyl VPS Egg compatibility

For the `ysdragon/Pterodactyl-VPS-Egg` flow, this script auto-detects if `systemctl` is unavailable and skips host-only service wiring. In that case, use this startup command in the egg:

```bash
cd /opt/worldviewer && npm run server
```
