#!/usr/bin/env bash
set -euo pipefail

BACKEND_URL=${BACKEND_URL:-http://localhost:8000}

echo "Checking backend health at ${BACKEND_URL}/healthz" >&2
resp=$(curl -sS -m 5 "${BACKEND_URL}/healthz" || true)
if [ -z "${resp}" ]; then
  echo "Backend healthz unreachable" >&2
  exit 1
fi

ok=$(echo "$resp" | sed -n 's/.*"ok"\s*:\s*\(true\|false\).*/\1/p' | head -n1)
storage=$(echo "$resp" | sed -n 's/.*"storage"\s*:\s*"\([^"]*\)".*/\1/p' | head -n1)
worker=$(echo "$resp" | sed -n 's/.*"worker"\s*":\s*"\([^"]*\)".*/\1/p' | head -n1)

echo "ok=${ok:-unknown} storage=${storage:-unknown} worker=${worker:-n/a}" >&2

if [ "${ok}" != "true" ]; then
  exit 2
fi

# If worker reported, require not error
if [ -n "${worker:-}" ]; then
  case "$worker" in
    ok) exit 0 ;;
    *) echo "Worker not healthy: $worker" >&2; exit 3 ;;
  esac
fi

exit 0

