import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { env } from "../utils/env.server";
import prisma from "../db.server";
import crypto from "node:crypto";

function getOrCreateGuestId(headers: Headers): { id: string; setCookie?: string } {
  const cookie = headers.get("cookie") || "";
  const m = /rapso_session=([^;]+)/.exec(cookie);
  if (m) return { id: m[1] };
  const raw = crypto.randomBytes(16).toString("hex");
  const setCookie = `rapso_session=${raw}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`;
  return { id: raw, setCookie };
}

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.public.appProxy(request);
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || "";
  const body = await request.json().catch(() => ({}));
  const objectKeys: string[] = Array.isArray(body.object_keys) ? body.object_keys : [];
  const heightCm: number | undefined = typeof body.height_cm === "number" ? body.height_cm : undefined;
  const customerId: string | undefined = typeof body.customer_id === "string" ? body.customer_id : undefined;
  if (!objectKeys.length) return json({ error: "Missing object_keys" }, { status: 400 });

  const { id: guestId, setCookie } = getOrCreateGuestId(request.headers);
  const jobId = crypto.randomUUID();

  // Create ModelRun row
  await prisma.modelRun.create({
    data: {
      id: jobId,
      shopDomain: shop,
      shopCustomerId: customerId,
      sessionId: customerId ? null : crypto.createHash("sha256").update(guestId).digest("hex"),
      status: "queued",
      modelVersion: 1,
    },
  });

  // Last-one-wins: mark any previous runs for this identity as replaced by this job
  try {
    const identityWhere = customerId
      ? { shopDomain: shop, shopCustomerId: customerId }
      : { shopDomain: shop, sessionId: crypto.createHash("sha256").update(guestId).digest("hex") };

    await prisma.modelRun.updateMany({
      where: {
        ...identityWhere,
        id: { not: jobId },
        // any unfinished or even previously-completed runs should be marked replaced
        status: { in: ["queued", "running", "succeeded", "completed"] },
        replacedByRunId: null,
      },
      data: { status: "replaced", replacedByRunId: jobId },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("mark-previous-runs-replaced failed", e);
  }

  // Enqueue backend job
  const res = await fetch(`${env.BACKEND_URL}/enqueue`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ job_id: jobId, input_key: objectKeys[0], height_cm: heightCm }),
  });
  if (!res.ok) {
    const t = await res.text();
    return json({ error: t || "enqueue failed" }, { status: 502 });
  }

  const payload = json({ job_id: jobId, status: "queued" });
  if (setCookie) payload.headers.append("Set-Cookie", setCookie);
  return payload;
};
