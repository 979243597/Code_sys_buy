#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${1:-$(pwd)}"
ROOT_DIR="$(cd "$ROOT_DIR" && pwd)"

echo "[1/8] Working directory: $ROOT_DIR"
cd "$ROOT_DIR"

need_cmd() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "Missing required command: $name" >&2
    exit 1
  fi
}

need_cmd unzip
need_cmd docker
need_cmd sha256sum

DOCKER_COMPOSE_CMD=""
if docker compose version >/dev/null 2>&1; then
  DOCKER_COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DOCKER_COMPOSE_CMD="docker-compose"
else
  echo "Missing docker compose command (docker compose / docker-compose)." >&2
  exit 1
fi

IMAGE_ZIP="$(find "$ROOT_DIR" -maxdepth 1 -type f -name 'docker-image-*.zip' | head -n 1)"
BUNDLE_ZIP="$(find "$ROOT_DIR" -maxdepth 1 -type f -name 'deploy-bundle-*.zip' | head -n 1)"
CHECKSUMS_ZIP="$(find "$ROOT_DIR" -maxdepth 1 -type f -name 'checksums-*.zip' | head -n 1)"

if [[ -z "$IMAGE_ZIP" || -z "$BUNDLE_ZIP" || -z "$CHECKSUMS_ZIP" ]]; then
  echo "Required artifact zip files are missing in $ROOT_DIR" >&2
  echo "Need files matching:" >&2
  echo "  docker-image-*.zip" >&2
  echo "  deploy-bundle-*.zip" >&2
  echo "  checksums-*.zip" >&2
  exit 1
fi

echo "[2/8] Unpacking artifact zips"
unzip -o "$IMAGE_ZIP" -d "$ROOT_DIR" >/dev/null
unzip -o "$BUNDLE_ZIP" -d "$ROOT_DIR" >/dev/null
unzip -o "$CHECKSUMS_ZIP" -d "$ROOT_DIR" >/dev/null

IMAGE_ARCHIVE="$(find "$ROOT_DIR" -maxdepth 1 -type f -name 'new-api-artifact-*.tar.gz' | head -n 1)"
CHECKSUM_FILE="$(find "$ROOT_DIR" -maxdepth 1 -type f -name 'SHA256SUMS.txt' | head -n 1)"
BUNDLE_DIR="$(find "$ROOT_DIR" -maxdepth 1 -mindepth 1 \( -type d -name 'new-api-*-amd64' -o -type d -name 'new-api-*-arm64' \) | head -n 1)"

if [[ -z "$IMAGE_ARCHIVE" || -z "$CHECKSUM_FILE" || -z "$BUNDLE_DIR" ]]; then
  echo "Unpacked artifacts are incomplete." >&2
  exit 1
fi

echo "[3/8] Verifying checksums"
(cd "$ROOT_DIR" && sha256sum -c "$(basename "$CHECKSUM_FILE")")

echo "[4/8] Loading Docker image"
docker load -i "$IMAGE_ARCHIVE"

echo "[5/8] Preparing runtime directories"
mkdir -p "$BUNDLE_DIR/data" "$BUNDLE_DIR/logs"

echo "[6/8] Entering deploy bundle"
cd "$BUNDLE_DIR"

if [[ ! -f docker-compose.artifact.yml ]]; then
  echo "docker-compose.artifact.yml not found in $BUNDLE_DIR" >&2
  exit 1
fi

echo "[7/8] Starting services"
$DOCKER_COMPOSE_CMD -f docker-compose.artifact.yml up -d

echo "[8/8] Service status"
$DOCKER_COMPOSE_CMD -f docker-compose.artifact.yml ps

echo
echo "Done."
echo "Try:"
echo "  curl http://127.0.0.1:3000/api/status"
echo "  curl http://127.0.0.1:3000/api/client_config"
