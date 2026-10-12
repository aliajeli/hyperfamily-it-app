#!/usr/bin/env bash
set -euo pipefail
node scripts/serve-export.js > browser-server.log 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null || true' EXIT
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:3000/ >/dev/null; then break; fi
  sleep 1
done
curl -fsS http://127.0.0.1:3000/store-update/ >/dev/null
node tests/typing-after-delete.playwright.mjs
node tests/settings-about.playwright.mjs
node tests/store-agent.playwright.mjs
