import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { env } from "../utils/env.server";
import { authenticate } from "../shopify.server";

// Fallback App Proxy endpoint: POST /tryon
export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.public.appProxy(request);

  const form = await request.formData();
  const file = form.get("file");
  const height = form.get("height_cm");
  if (!(file instanceof File)) {
    return json({ error: "No file" }, { status: 400 });
  }
  const fd = new FormData();
  fd.append("file", file);
  if (typeof height === "string" && height.length > 0) fd.append("height_cm", height);

  const res = await fetch(`${env.BACKEND_URL}/uploads`, { method: "POST", body: fd });
  const text = await res.text();
  if (!res.ok) return json({ error: text || "upload failed" }, { status: res.status, headers: { "cache-control": "no-store" } });
  try {
    return json(JSON.parse(text), { headers: { "cache-control": "no-store" } });
  } catch {
    return json({ error: text || "invalid response" }, { status: 502, headers: { "cache-control": "no-store" } });
  }
};
