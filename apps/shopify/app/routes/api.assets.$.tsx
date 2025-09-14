import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { env } from "../utils/env.server";

// Admin-only proxy for backend assets, to avoid mixed content in HTTPS admin.
// GET /api/assets/* -> streams from `${BACKEND_URL}/assets/*`
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const rest = params["*"] || "";
  const upstream = `${env.BACKEND_URL}/assets/${rest}`;
  const res = await fetch(upstream);
  const buf = await res.arrayBuffer();
  const ct = res.headers.get("content-type") || "application/octet-stream";
  const disp = res.headers.get("content-disposition");
  const headers: Record<string, string> = {
    "content-type": ct,
    "cache-control": "no-store",
  };
  if (disp) headers["content-disposition"] = disp;
  return new Response(buf, { status: res.status, headers });
};

