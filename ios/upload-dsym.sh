#!/usr/bin/env bash
# Optional Xcode Run Script build phase for Sentry dSYM upload (Release only).
# Add in Xcode: Target → Build Phases → + New Run Script Phase
# Shell: /bin/sh
# Script path: "${PROJECT_DIR}/upload-dsym.sh"
set -euo pipefail

if [ "${CONFIGURATION}" != "Release" ]; then
  echo "[Sentry] Skipping dSYM upload for ${CONFIGURATION}"
  exit 0
fi

export SENTRY_PROPERTIES="${PROJECT_DIR}/../sentry.properties"
CLI="${PROJECT_DIR}/../node_modules/@sentry/cli/bin/sentry-cli"

if [ ! -x "$CLI" ] && [ ! -f "$CLI" ]; then
  echo "[Sentry] sentry-cli not found — skip upload"
  exit 0
fi

if ! grep -q 'auth.token=.\+' "${SENTRY_PROPERTIES}" 2>/dev/null; then
  echo "[Sentry] auth.token empty in sentry.properties — skip upload"
  exit 0
fi

"$CLI" debug-files upload --include-sources "${DWARF_DSYM_FOLDER_PATH}"
