#!/usr/bin/env bash
set -euo pipefail

# Simple end-to-end smoke test:
# 1) POST /uploads with a local image
# 2) Poll /jobs/{id} until completed/failed (max ~6 minutes)
# 3) If completed, GET the output_url (prefix with backend if relative) and verify 200

BACKEND_URL=${BACKEND_URL:-http://localhost:8000}
IMAGE_PATH=${IMAGE_PATH:-IMG_2083.jpg}
HEIGHT_CM=${HEIGHT_CM:-170}
POLL_SECS=${POLL_SECS:-2}
MAX_ATTEMPTS=${MAX_ATTEMPTS:-180}

echo "[smoketest] Backend: $BACKEND_URL"
echo "[smoketest] Image:   $IMAGE_PATH"

if [ ! -f "$IMAGE_PATH" ]; then
  echo "[smoketest] ERROR: image not found at $IMAGE_PATH" >&2
  exit 2
fi

echo "[smoketest] 1) Uploading image..."
UP_JSON=$(curl -sS -f -F "file=@${IMAGE_PATH};type=image/jpeg" -F "height_cm=${HEIGHT_CM}" "${BACKEND_URL}/uploads")
JOB_ID=$(printf '%s' "$UP_JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("job_id",""))')

if [ -z "$JOB_ID" ]; then
  echo "[smoketest] ERROR: failed to parse job_id from upload response: $UP_JSON" >&2
  exit 3
fi

echo "[smoketest] Created job: $JOB_ID"

attempt=0
STATUS=""
OUT_URL=""
while [ $attempt -lt $MAX_ATTEMPTS ]; do
  attempt=$((attempt+1))
  J=$(curl -sS -f "${BACKEND_URL}/jobs/${JOB_ID}") || true
  STATUS=$(printf '%s' "$J" | python3 -c 'import sys,json;\
import sys,json;\
\
\
\
\
\
j=json.load(sys.stdin); print(j.get("status",""))' 2>/dev/null || true)
  OUT_URL=$(printf '%s' "$J" | python3 -c 'import sys,json;\
import sys,json;\
\
\
\
\
\
j=json.load(sys.stdin); print(j.get("output_url","") or "")' 2>/dev/null || true)
  echo "[smoketest] Poll $attempt: status=$STATUS"
  if [ "$STATUS" = "completed" ] || [ "$STATUS" = "succeeded" ]; then
    break
  fi
  if [ "$STATUS" = "failed" ]; then
    echo "[smoketest] ERROR: job failed" >&2
    echo "$J" >&2
    exit 4
  fi
  sleep "$POLL_SECS"
done

if [ "$STATUS" != "completed" ] && [ "$STATUS" != "succeeded" ]; then
  echo "[smoketest] ERROR: job did not complete in time" >&2
  exit 5
fi

if [ -z "$OUT_URL" ]; then
  echo "[smoketest] ERROR: job completed but no output_url present" >&2
  echo "$J" >&2
  exit 6
fi

# Prefix with backend if relative
if [[ "$OUT_URL" == /* ]]; then
  FULL_URL="${BACKEND_URL}${OUT_URL}"
else
  FULL_URL="$OUT_URL"
fi

echo "[smoketest] 3) Fetching GLB: $FULL_URL"
CODE=$(curl -sS -o /dev/null -w "%{http_code}" "$FULL_URL") || true
if [ "$CODE" != "200" ]; then
  echo "[smoketest] ERROR: fetching GLB returned $CODE" >&2
  exit 7
fi

echo "[smoketest] SUCCESS: end-to-end flow OK (job=$JOB_ID)"
