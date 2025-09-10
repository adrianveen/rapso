#!/usr/bin/env bash
set -euo pipefail

if [ -z "${SHOP_DOMAIN:-}" ] || [ -z "${CUSTOMER_ID:-}" ]; then
  echo "Usage: SHOP_DOMAIN=<shop.myshopify.com> CUSTOMER_ID=<id> bash scripts/check_no_store.sh" >&2
  exit 64
fi

SHOP=${SHOP:-$SHOP_DOMAIN}
HEIGHT_CM=${HEIGHT_CM:-170}

URL="https://${SHOP_DOMAIN}/apps/rapso/save-height?shop=${SHOP}&logged_in_customer_id=${CUSTOMER_ID}"
echo "POST ${URL}" >&2

out=$(curl -si -X POST -F "height_cm=${HEIGHT_CM}" -F "customer_id=${CUSTOMER_ID}" "$URL" || true)
code=$(printf "%s" "$out" | sed -n '1s#HTTP/[0-9.]* \([0-9][0-9][0-9]\).*#\1#p')
cc=$(printf "%s" "$out" | awk -F': ' 'BEGIN{IGNORECASE=1} tolower($1)=="cache-control"{print $2; exit}')

echo "HTTP ${code}" >&2
echo "Cache-Control: ${cc:-<none>}" >&2

if printf "%s" "$cc" | grep -qi "no-store"; then
  echo "PASS: no-store present"
  exit 0
else
  echo "FAIL: no-store missing" >&2
  exit 1
fi

