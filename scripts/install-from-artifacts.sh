#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${1:-$(pwd)}"
ROOT_DIR="$(cd "$ROOT_DIR" && pwd)"

need_cmd() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "Missing required command: $name" >&2
    exit 1
  fi
}

log_step() {
  echo
  echo "[$1] $2"
}

find_first() {
  local pattern="$1"
  find "$ROOT_DIR" -maxdepth 2 -type f -name "$pattern" | sort | head -n 1
}

need_cmd unzip
need_cmd docker
need_cmd sha256sum

if docker compose version >/dev/null 2>&1; then
  DOCKER_COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DOCKER_COMPOSE_CMD="docker-compose"
else
  echo "Missing docker compose command (docker compose / docker-compose)." >&2
  exit 1
fi

log_step "1/9" "Working directory: $ROOT_DIR"
cd "$ROOT_DIR"

IMAGE_ZIP="$(find_first 'docker-image-*.zip')"
BUNDLE_ZIP="$(find_first 'deploy-bundle-*.zip')"
CHECKSUMS_ZIP="$(find_first 'checksums-*.zip')"

if [[ -z "$IMAGE_ZIP" || -z "$BUNDLE_ZIP" || -z "$CHECKSUMS_ZIP" ]]; then
  echo "Required artifact zip files are missing in $ROOT_DIR" >&2
  echo "Need files matching:" >&2
  echo "  docker-image-*.zip" >&2
  echo "  deploy-bundle-*.zip" >&2
  echo "  checksums-*.zip" >&2
  exit 1
fi

log_step "2/9" "Unpacking top-level artifact zips"
unzip -o "$IMAGE_ZIP" -d "$ROOT_DIR" >/dev/null
unzip -o "$BUNDLE_ZIP" -d "$ROOT_DIR" >/dev/null
unzip -o "$CHECKSUMS_ZIP" -d "$ROOT_DIR" >/dev/null

INNER_BUNDLE_ZIP="$(find_first 'new-api-*-deploy-bundle.zip')"
if [[ -n "$INNER_BUNDLE_ZIP" ]]; then
  log_step "3/9" "Unpacking inner deploy bundle"
  unzip -o "$INNER_BUNDLE_ZIP" -d "$ROOT_DIR" >/dev/null
else
  log_step "3/9" "No inner deploy bundle zip found, continuing"
fi

IMAGE_ARCHIVE="$(find_first 'new-api-artifact-*.tar.gz')"
CHECKSUM_FILE="$(find_first 'SHA256SUMS.txt')"
BUNDLE_DIR="$(find "$ROOT_DIR" -maxdepth 2 -mindepth 1 -type d \( -name 'new-api-*-amd64' -o -name 'new-api-*-arm64' \) | sort | head -n 1)"

if [[ -z "$IMAGE_ARCHIVE" || -z "$CHECKSUM_FILE" || -z "$BUNDLE_DIR" ]]; then
  echo "Unpacked artifacts are incomplete." >&2
  echo "IMAGE_ARCHIVE=$IMAGE_ARCHIVE" >&2
  echo "CHECKSUM_FILE=$CHECKSUM_FILE" >&2
  echo "BUNDLE_DIR=$BUNDLE_DIR" >&2
  exit 1
fi

log_step "4/9" "Verifying deployment bundle checksum (when available)"
(
  cd "$ROOT_DIR"
  BUNDLE_BASENAME="$(basename "${INNER_BUNDLE_ZIP:-}")"
  if [[ -n "$BUNDLE_BASENAME" ]] && grep -q "$BUNDLE_BASENAME" "$(basename "$CHECKSUM_FILE")"; then
    grep "$BUNDLE_BASENAME" "$(basename "$CHECKSUM_FILE")" | sha256sum -c -
  else
    echo "Bundle checksum entry not found, skipped."
  fi
)

log_step "5/9" "Verifying docker image checksum (when available)"
(
  cd "$ROOT_DIR"
  IMAGE_BASENAME="$(basename "$IMAGE_ARCHIVE")"
  if grep -q "$IMAGE_BASENAME" "$(basename "$CHECKSUM_FILE")"; then
    grep "$IMAGE_BASENAME" "$(basename "$CHECKSUM_FILE")" | sha256sum -c -
  elif grep -q "image/$IMAGE_BASENAME" "$(basename "$CHECKSUM_FILE")"; then
    grep "image/$IMAGE_BASENAME" "$(basename "$CHECKSUM_FILE")" | sed "s#image/$IMAGE_BASENAME#$IMAGE_BASENAME#" | sha256sum -c -
  else
    echo "Image checksum entry not found, skipped."
  fi
)

log_step "6/9" "Loading Docker image"
docker load -i "$IMAGE_ARCHIVE"

log_step "7/9" "Preparing runtime directories"
mkdir -p "$BUNDLE_DIR/data" "$BUNDLE_DIR/logs"

log_step "8/9" "Starting services from $BUNDLE_DIR"
cd "$BUNDLE_DIR"
if [[ ! -f docker-compose.artifact.yml ]]; then
  echo "docker-compose.artifact.yml not found in $BUNDLE_DIR" >&2
  exit 1
fi
$DOCKER_COMPOSE_CMD -f docker-compose.artifact.yml up -d

log_step "9/9" "Service status"
$DOCKER_COMPOSE_CMD -f docker-compose.artifact.yml ps

echo
echo "Deployment completed."
echo "Check:"
echo "  curl http://127.0.0.1:3000/api/status"
echo "  curl http://127.0.0.1:3000/api/client_config"
