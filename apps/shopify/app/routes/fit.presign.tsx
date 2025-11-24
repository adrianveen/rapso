import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { env } from "../utils/env.server";

// Rate limiting with TTL-based cleanup to prevent memory leaks
const RATE_LIMIT_WINDOW_MS = 10_000; // 10 seconds
const RATE_LIMIT_CLEANUP_INTERVAL_MS = 60_000; // Clean up every minute
const RATE_LIMIT_MAX_ENTRIES = 10_000; // Max entries before forced cleanup

const presignRate = new Map<string, number>();
let lastCleanup = Date.now();

/**
 * Clean up expired rate limit entries to prevent memory leaks.
 * Runs periodically or when the map exceeds max entries.
 */
function cleanupRateLimitMap(): void {
  const now = Date.now();
  const shouldCleanup =
    now - lastCleanup > RATE_LIMIT_CLEANUP_INTERVAL_MS ||
    presignRate.size > RATE_LIMIT_MAX_ENTRIES;

  if (!shouldCleanup) return;

  lastCleanup = now;
  const cutoff = now - RATE_LIMIT_WINDOW_MS;

  for (const [key, timestamp] of presignRate) {
    if (timestamp < cutoff) {
      presignRate.delete(key);
    }
  }
}

export const action = async ({ request }: ActionFunctionArgs) => {
  // Enforce App Proxy HMAC
  await authenticate.public.appProxy(request);
  const body = await request.json().catch(() => ({}));
  const files = Array.isArray(body?.files) ? body.files : [];
  // Basic input validation
  const MAX_BYTES = 15 * 1024 * 1024;
  if (!files.length) return json({ error: "Missing files" }, { status: 400 });
  for (const f of files) {
    const ct = String((f?.contentType ?? "")).toLowerCase();
    const size = Number(f?.size ?? 0);
    if (!ct.startsWith("image/")) return json({ error: "invalid_type" }, { status: 400 });
    if (!(size > 0 && size <= MAX_BYTES)) return json({ error: "invalid_size" }, { status: 400 });
  }
  // Simple rate limit per identity (logged-in customer or guest cookie)
  // with periodic cleanup to prevent memory leaks
  cleanupRateLimitMap();

  const url = new URL(request.url);
  const who = url.searchParams.get("logged_in_customer_id") || (request.headers.get("cookie") || "").slice(0, 40);
  const now = Date.now();
  const last = who ? presignRate.get(who) || 0 : 0;
  if (who && now - last < RATE_LIMIT_WINDOW_MS) {
    return json({ error: "rate_limited" }, { status: 429 });
  }
  if (who) presignRate.set(who, now);
  const res = await fetch(`${env.BACKEND_URL}/presign`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ files }),
  });
  const data = await res.json();
  return json(data, { headers: { "cache-control": "no-store" } });
};
