#!/usr/bin/env bash
# ------------------------------------------------------------------
# PalSafar Seed Data Downloader
# ------------------------------------------------------------------
# Downloads large seed data files that are too big for git.
#
# Usage:
#   chmod +x scripts/download-seed-data.sh
#   ./scripts/download-seed-data.sh
#
# If you have the files locally (e.g. from a previous clone),
# copy them into server/prisma/seed-data/ manually.
# ------------------------------------------------------------------

set -euo pipefail

BASE_URL="https://raw.githubusercontent.com/ShivaayChelani/palsafar-production/main/server/prisma/seed-data"
SEED_DIR="server/prisma/seed-data"

mkdir -p "$SEED_DIR"

echo "=== PalSafar Seed Data Downloader ==="
echo ""

FILES=(
  "osm-places.json"
)

for FILE in "${FILES[@]}"; do
  TARGET="$SEED_DIR/$FILE"
  if [ -f "$TARGET" ]; then
    SIZE=$(wc -c < "$TARGET" 2>/dev/null | tr -d ' ')
    echo "  [OK] $FILE already exists ($SIZE bytes)"
  else
    echo "  [..] Downloading $FILE..."
    if curl -sSL "$BASE_URL/$FILE" -o "$TARGET"; then
      echo "  [OK] Downloaded $FILE"
    else
      echo "  [!!] Failed to download $FILE"
    fi
  fi
done

echo ""
echo "=== Done ==="
