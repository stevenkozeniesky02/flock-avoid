#!/usr/bin/env bash
set -euo pipefail

# Brings up Valhalla and waits for tile build + server readiness.
# First run: downloads ~250MB Georgia OSM PBF and builds tiles in ./valhalla_tiles/ (~5-15 min).
# Subsequent runs: detects existing tiles and starts the server quickly.

cd "$(dirname "$0")/.."
mkdir -p valhalla_tiles

echo "Starting Valhalla container (tiles will be built on first run)..."
docker compose up -d

echo "Waiting for Valhalla to be ready on http://localhost:8002 ..."
echo "(First run downloads ~250MB and builds tiles — this can take 10+ minutes.)"
echo "Tail logs in another terminal with: docker logs -f flock-avoid-valhalla"
echo ""

for i in $(seq 1 180); do
  if curl -sf -o /dev/null http://localhost:8002/status; then
    echo "Valhalla is ready."
    curl -s http://localhost:8002/status
    echo ""
    exit 0
  fi
  printf "."
  sleep 10
done

echo ""
echo "Timed out waiting for Valhalla after 30 minutes. Check 'docker logs flock-avoid-valhalla'."
exit 1
