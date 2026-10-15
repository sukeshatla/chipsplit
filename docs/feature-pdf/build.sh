#!/usr/bin/env bash
# Rebuilds docs/Chip-n-Split-Features.pdf: fresh screenshots from the demo app, then prints
# features.html to PDF with headless Chrome. Run from anywhere: docs/feature-pdf/build.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
TMP="$(mktemp -d)"
cleanup() { kill "${VITE:-}" "${CHR:-}" 2>/dev/null || true; wait 2>/dev/null || true; rm -rf "$TMP"; }
trap cleanup EXIT

# The capture scripts expect the demo app on :5199 and Chrome's debugger on :9333.
"$ROOT/node_modules/.bin/vite" "$ROOT" --port 5199 --strictPort >"$TMP/vite.log" 2>&1 & VITE=$!
"$CHROME" --headless=new --remote-debugging-port=9333 --user-data-dir="$TMP/chrome" \
  --no-first-run --hide-scrollbars about:blank >"$TMP/chrome.log" 2>&1 & CHR=$!
sleep 5

node "$HERE/capture.mjs"
node "$HERE/lb.mjs"

"$CHROME" --headless=new --disable-gpu --no-pdf-header-footer --user-data-dir="$TMP/chrome-pdf" \
  --print-to-pdf="$HERE/features.pdf" "file://$HERE/features.html" >/dev/null 2>&1
cp "$HERE/features.pdf" "$ROOT/docs/Chip-n-Split-Features.pdf"
echo "Wrote docs/Chip-n-Split-Features.pdf"
