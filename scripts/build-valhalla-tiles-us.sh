#!/usr/bin/env bash
set -euo pipefail

# Full-US Valhalla tile build wrapper. See docs/VALHALLA.md for the resource
# budget and the operator workflow. This script just sets the env vars the
# main build script honors and execs into it.

cd "$(dirname "$0")/.."

cat <<'WARN'
============================================================
Full-US Valhalla tile build
============================================================
This will download ~9 GB (us-latest.osm.pbf from Geofabrik)
and build a continental US tile graph.

Plan for:
  - 80-120 GB free disk during build
  - 8-16 GB Docker memory limit
  - 4-10 hours wall clock on a typical workstation
  - First-run only; subsequent boots start in minutes.

Press Ctrl-C in the next 10 seconds to abort.
See docs/VALHALLA.md for full operator notes.
============================================================
WARN

sleep 10

export VALHALLA_TILE_URLS="https://download.geofabrik.de/north-america/us-latest.osm.pbf"
export VALHALLA_TILES_DIR="./valhalla_tiles_us"
export VALHALLA_CONTAINER_NAME="flock-avoid-valhalla-us"
# 1080 loops * 10s = 3 hours of polling; for slow boxes use `docker logs -f`
# in another terminal to follow progress past the script's wait window.
export VALHALLA_WAIT_LOOPS="${VALHALLA_WAIT_LOOPS:-1080}"

exec ./scripts/build-valhalla-tiles.sh
