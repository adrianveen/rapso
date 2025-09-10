import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { env } from "../utils/env.server";
import { authenticate } from "../shopify.server";

// Fallback App Proxy passthrough: GET /jobs/:id
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await authenticate.public.appProxy(request);
  const id = params.id as string;
  const res = await fetch(`${env.BACKEND_URL}/jobs/${id}`);
  const data = await res.text();
  try {
    return json(JSON.parse(data), { headers: { "cache-control": "no-store" } });
  } catch {
    return json({ error: data || "invalid response" }, { status: 502, headers: { "cache-control": "no-store" } });
  }
};
