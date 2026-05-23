#!/usr/bin/env bash
set -euo pipefail

# Brings up Valhalla and waits for tile build + server readiness.
#
# Defaults to the Atlanta-area Georgia OSM extract — the same behavior the
# script has had since the first commit. Set the VALHALLA_* env vars below
# (or invoke ./scripts/build-valhalla-tiles-us.sh) to switch modes.
#
# First run for a given mode: downloads the OSM PBF and builds tiles in
# $VALHALLA_TILES_DIR. Subsequent runs: detect existing tiles and start
# the server quickly.

cd "$(dirname "$0")/.."

TILE_URLS="${VALHALLA_TILE_URLS:-https://download.geofabrik.de/north-america/us/georgia-latest.osm.pbf}"
TILES_DIR="${VALHALLA_TILES_DIR:-./valhalla_tiles}"
CONTAINER_NAME="${VALHALLA_CONTAINER_NAME:-flock-avoid-valhalla}"
WAIT_LOOPS="${VALHALLA_WAIT_LOOPS:-180}"

mkdir -p "$TILES_DIR"

printf 'Starting Valhalla container %s (tiles will be built on first run)...\n' "$CONTAINER_NAME"
printf '  tile_urls : %s\n' "$TILE_URLS"
printf '  tiles_dir : %s\n' "$TILES_DIR"
docker compose up -d

WAIT_MINUTES=$(( WAIT_LOOPS * 10 / 60 ))
printf 'Waiting for Valhalla to be ready on http://localhost:8002 (up to %s minutes) ...\n' "$WAIT_MINUTES"
printf '(First run downloads the OSM PBF and builds tiles — this can take a long time for large extracts.)\n'
printf 'Tail logs in another terminal with: docker logs -f %s\n\n' "$CONTAINER_NAME"

for i in $(seq 1 "$WAIT_LOOPS"); do
  if curl -sf -o /dev/null http://localhost:8002/status; then
    echo "Valhalla is ready."
    curl -s http://localhost:8002/status
    echo ""
    exit 0
  fi
  printf "."
  sleep 10
done

printf '\nTimed out waiting for Valhalla after %s minutes. Check "docker logs %s".\n' "$WAIT_MINUTES" "$CONTAINER_NAME"
exit 1
