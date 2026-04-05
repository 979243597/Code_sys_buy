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

find_newest_dir() {
  local pattern="$1"
  find "$ROOT_DIR" -maxdepth 1 -mindepth 1 -type d -name "$pattern" -print0 \
    | while IFS= read -r -d '' dir; do
        printf '%s\t%s\n' "$(stat -c '%Y' "$dir")" "$dir"
      done \
    | sort -nr \
    | head -n 1 \
    | cut -f2-
}

find_active_bundle_dir() {
  find "$ROOT_DIR" -maxdepth 1 -mindepth 1 -type d \( -name 'new-api-*-amd64' -o -name 'new-api-*-arm64' \) -print0 \
    | while IFS= read -r -d '' dir; do
        if [[ -f "$dir/docker-compose.artifact.yml" && ( -d "$dir/data" || -d "$dir/logs" ) ]]; then
          printf '%s\t%s\n' "$(stat -c '%Y' "$dir")" "$dir"
        fi
      done \
    | sort -nr \
    | head -n 1 \
    | cut -f2-
}

need_cmd unzip
need_cmd docker
need_cmd sha256sum
need_cmd cp

if docker compose version >/dev/null 2>&1; then
  DOCKER_COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DOCKER_COMPOSE_CMD="docker-compose"
else
  echo "Missing docker compose command (docker compose / docker-compose)." >&2
  exit 1
fi

log_step "1/10" "Working directory: $ROOT_DIR"
cd "$ROOT_DIR"

ACTIVE_DIR="$(find_active_bundle_dir || true)"

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

log_step "2/10" "Unpacking top-level artifact zips"
unzip -o "$IMAGE_ZIP" -d "$ROOT_DIR" >/dev/null
unzip -o "$BUNDLE_ZIP" -d "$ROOT_DIR" >/dev/null
unzip -o "$CHECKSUMS_ZIP" -d "$ROOT_DIR" >/dev/null

INNER_BUNDLE_ZIP="$(find_first 'new-api-*-deploy-bundle.zip')"
if [[ -n "$INNER_BUNDLE_ZIP" ]]; then
  log_step "3/10" "Unpacking inner deploy bundle"
  unzip -o "$INNER_BUNDLE_ZIP" -d "$ROOT_DIR" >/dev/null
else
  log_step "3/10" "No inner deploy bundle zip found, continuing"
fi

IMAGE_ARCHIVE="$(find_first 'new-api-artifact-*.tar.gz')"
CHECKSUM_FILE="$(find_first 'SHA256SUMS.txt')"
NEW_BUNDLE_DIR="$(find_newest_dir 'new-api-*-amd64')"
if [[ -z "$NEW_BUNDLE_DIR" ]]; then
  NEW_BUNDLE_DIR="$(find_newest_dir 'new-api-*-arm64')"
fi

if [[ -z "$IMAGE_ARCHIVE" || -z "$CHECKSUM_FILE" || -z "$NEW_BUNDLE_DIR" ]]; then
  echo "Unpacked artifacts are incomplete." >&2
  echo "IMAGE_ARCHIVE=$IMAGE_ARCHIVE" >&2
  echo "CHECKSUM_FILE=$CHECKSUM_FILE" >&2
  echo "NEW_BUNDLE_DIR=$NEW_BUNDLE_DIR" >&2
  exit 1
fi

log_step "4/10" "Verifying deployment bundle checksum (when available)"
(
  cd "$ROOT_DIR"
  BUNDLE_BASENAME="$(basename "${INNER_BUNDLE_ZIP:-}")"
  CHECKSUM_BASENAME="$(basename "$CHECKSUM_FILE")"
  if [[ -n "$BUNDLE_BASENAME" ]] && grep -q "$BUNDLE_BASENAME" "$CHECKSUM_BASENAME"; then
    grep "$BUNDLE_BASENAME" "$CHECKSUM_BASENAME" | sha256sum -c -
  else
    echo "Bundle checksum entry not found, skipped."
  fi
)

log_step "5/10" "Verifying docker image checksum (when available)"
(
  cd "$ROOT_DIR"
  IMAGE_BASENAME="$(basename "$IMAGE_ARCHIVE")"
  CHECKSUM_BASENAME="$(basename "$CHECKSUM_FILE")"

  if grep -q "image/$IMAGE_BASENAME" "$CHECKSUM_BASENAME"; then
    grep "image/$IMAGE_BASENAME" "$CHECKSUM_BASENAME" \
      | sed "s#image/$IMAGE_BASENAME#$IMAGE_BASENAME#" \
      | sha256sum -c -
  elif grep -q "^.*[[:space:]]$IMAGE_BASENAME$" "$CHECKSUM_BASENAME"; then
    grep "^.*[[:space:]]$IMAGE_BASENAME$" "$CHECKSUM_BASENAME" | sha256sum -c -
  else
    echo "Image checksum entry not found, skipped."
  fi
)

log_step "6/10" "Loading Docker image"
docker load -i "$IMAGE_ARCHIVE"

if [[ -z "$ACTIVE_DIR" ]]; then
  ACTIVE_DIR="$NEW_BUNDLE_DIR"
  log_step "7/10" "No existing active deployment found, using new bundle directly"
else
  log_step "7/10" "Updating existing deployment bundle"
  BACKUP_SUFFIX="$(date +%Y%m%d-%H%M%S)"
  cp -f "$ACTIVE_DIR/docker-compose.artifact.yml" "$ACTIVE_DIR/docker-compose.artifact.yml.bak.$BACKUP_SUFFIX"

  for file in docker-compose.artifact.yml README.deploy.txt deploy.env.example ai-deployer-client-compat.md load-image-and-start.sh load-image-and-start.ps1; do
    if [[ -f "$NEW_BUNDLE_DIR/$file" ]]; then
      cp -f "$NEW_BUNDLE_DIR/$file" "$ACTIVE_DIR/$file"
    fi
  done
fi

log_step "8/10" "Preparing runtime directories in $ACTIVE_DIR"
mkdir -p "$ACTIVE_DIR/data" "$ACTIVE_DIR/logs"

log_step "9/11" "Preparing update strategy"
cd "$ACTIVE_DIR"

if $DOCKER_COMPOSE_CMD -f docker-compose.artifact.yml config --services | grep -qx 'new-api'; then
  log_step "10/11" "Recreating new-api service only (database/cache untouched)"
  $DOCKER_COMPOSE_CMD -f docker-compose.artifact.yml up -d --force-recreate --no-deps new-api
else
  log_step "10/11" "new-api service name not found, falling back to compose update"
  $DOCKER_COMPOSE_CMD -f docker-compose.artifact.yml up -d --force-recreate
fi

log_step "11/11" "Service status"
$DOCKER_COMPOSE_CMD -f docker-compose.artifact.yml ps

echo
echo "Update completed."
echo "Active deployment directory: $ACTIVE_DIR"
echo "Source artifact bundle:      $NEW_BUNDLE_DIR"
echo "Check:"
echo "  curl http://127.0.0.1:3000/api/status"
echo "  curl http://127.0.0.1:3000/api/client_config"
