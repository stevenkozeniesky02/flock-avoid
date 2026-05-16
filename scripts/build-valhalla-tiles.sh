#!/usr/bin/env bash
set -euo pipefail

# One-time build of Valhalla tiles for Georgia OSM extract.
# Downloads ~250MB PBF, builds tiles into ./valhalla_tiles/ (~5-15 min first run).
# Run this before `npm run valhalla:up` on a fresh checkout.

mkdir -p valhalla_tiles
docker run --rm -t \
  -v "$(pwd)/valhalla_tiles:/custom_files" \
  -e tile_urls=https://download.geofabrik.de/north-america/us/georgia-latest.osm.pbf \
  -e use_tiles_ignore_pbf=False \
  -e force_rebuild=True \
  ghcr.io/valhalla/valhalla:latest

echo "Valhalla tiles built. Run 'npm run valhalla:up' to start the server."
