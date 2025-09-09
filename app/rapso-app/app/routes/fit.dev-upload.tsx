import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { env } from "../utils/env.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.public.appProxy(request);
  const form = await request.formData();
  const res = await fetch(`${env.BACKEND_URL}/dev/upload`, {
    method: "POST",
    body: form,
  });
  const text = await res.text();
  try { return json(JSON.parse(text)); } catch { return json({ error: text || "upload failed"}, { status: res.status }); }
};
