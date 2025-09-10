import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { env } from "../utils/env.server";

const presignRate = new Map<string, number>();

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
  const url = new URL(request.url);
  const who = url.searchParams.get("logged_in_customer_id") || (request.headers.get("cookie") || "").slice(0, 40);
  const now = Date.now();
  const last = who ? presignRate.get(who) || 0 : 0;
  if (who && now - last < 10_000) {
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
