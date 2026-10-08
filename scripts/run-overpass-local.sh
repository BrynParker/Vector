#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/deploy/overpass/docker-compose.yml"

if ! command -v docker >/dev/null 2>&1; then
  echo "[overpass-local] docker is required." >&2
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  docker compose -f "${COMPOSE_FILE}" up -d
elif command -v docker-compose >/dev/null 2>&1; then
  docker-compose -f "${COMPOSE_FILE}" up -d
else
  echo "[overpass-local] docker compose plugin not found." >&2
  exit 1
fi

echo "[overpass-local] started. set OSM_OVERPASS_URL=http://127.0.0.1:12345/api/interpreter"
