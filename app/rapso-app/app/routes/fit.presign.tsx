import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { env } from "../utils/env.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  // Enforce App Proxy HMAC
  await authenticate.public.appProxy(request);
  const body = await request.json().catch(() => ({}));
  const files = Array.isArray(body?.files) ? body.files : [{ name: "photo.jpg" }];
  const res = await fetch(`${env.BACKEND_URL}/presign`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ files }),
  });
  const data = await res.json();
  return json(data);
};
