import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { env } from "../utils/env.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  try {
    await authenticate.public.appProxy(request);
  } catch {}
  const rest = params["*"] || "";
  const upstream = `${env.BACKEND_URL}/assets/${rest}`;
  const res = await fetch(upstream);
  const buf = await res.arrayBuffer();
  const ct = res.headers.get("content-type") || "application/octet-stream";
  return new Response(buf, {
    status: res.status,
    headers: {
      "content-type": ct,
      "cache-control": "no-store",
    },
  });
};
