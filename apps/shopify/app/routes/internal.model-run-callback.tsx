import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";
import shopify, { sessionStorage } from "../shopify.server";

async function updateCustomerMetafield(shop: string, customerId: string, payload: any) {
  // Try to find an offline access token from Prisma Session table
  const sess = await prisma.session.findFirst({ where: { shop, isOnline: false } });
  const token = sess?.accessToken;
  if (!token) return { ok: false, error: "No offline session found" };
  const endpoint = `https://${shop}/admin/api/${shopify.api.config.apiVersion}/graphql.json`;
  const ownerId = `gid://shopify/Customer/${customerId}`;
  const q = `#graphql
    mutation SetMetafield($ownerId: ID!, $namespace: String!, $key: String!, $type: String!, $value: String!) {
      metafieldsSet(metafields: [{ ownerId: $ownerId, namespace: $namespace, key: $key, type: $type, value: $value }]) {
        metafields { id }
        userErrors { field message }
      }
    }
  `;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({
      query: q,
      variables: {
        ownerId,
        namespace: "rapso.fit",
        key: "profile",
        type: "json",
        value: JSON.stringify(payload),
      },
    }),
  });
  const txt = await res.text();
  try { return { ok: true, data: JSON.parse(txt) }; } catch { return { ok: false, error: txt }; }
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const secret = request.headers.get("x-callback-secret") || request.headers.get("X-Callback-Secret");
  if (!secret || secret !== process.env.MODEL_CALLBACK_SECRET) {
    return json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const jobId: string | undefined = body?.job_id;
  const status: string | undefined = body?.status;
  const outputKey: string | undefined = body?.output_key;
  if (!jobId) return json({ error: "Missing job_id" }, { status: 400 });

  const mr = await prisma.modelRun.findUnique({ where: { id: jobId } });
  if (!mr) return json({ error: "not_found" }, { status: 404 });

  // If this run has already been superseded by a newer run, record its state but do not
  // allow it to take over as the active model later.
  const isReplaced = !!mr.replacedByRunId && mr.replacedByRunId.length > 0;

  await prisma.modelRun.update({
    where: { id: jobId },
    data: { status: status || mr.status, meshObjectKey: outputKey || mr.meshObjectKey },
  });

  if (((status || mr.status) === "completed" || (status || mr.status) === "succeeded") && !isReplaced) {
    const customerId = mr.shopCustomerId;
    if (customerId) {
      // Mark active model and update CustomerProfile
      // Only promote this run to active if there isn't a newer active run already
      const existingProfile = await prisma.customerProfile.findUnique({
        where: { shopDomain_shopCustomerId: { shopDomain: mr.shopDomain, shopCustomerId: customerId } },
      });

      let shouldPromote = true;
      if (existingProfile?.activeModelRunId && existingProfile.activeModelRunId !== jobId) {
        try {
          const active = await prisma.modelRun.findUnique({ where: { id: existingProfile.activeModelRunId } });
          if (active && active.createdAt && mr.createdAt && active.createdAt > mr.createdAt) {
            shouldPromote = false; // a newer run is already active
          }
          // If the currently active run is older or missing, allow promotion
        } catch {}
      }

      let profile = existingProfile;
      if (shouldPromote) {
        profile = await prisma.customerProfile.upsert({
          where: { shopDomain_shopCustomerId: { shopDomain: mr.shopDomain, shopCustomerId: customerId } },
          update: { activeModelRunId: jobId },
          create: { shopDomain: mr.shopDomain, shopCustomerId: customerId, activeModelRunId: jobId },
        });
      }
      // Compose metafield payload
      const meshUrl = outputKey ? `/apps/rapso/assets/${outputKey}` : null;
      const metafield = {
        model_version: mr.modelVersion,
        height_cm: profile.heightCentimetres ?? null,
        updated_at: new Date().toISOString(),
        mesh_url: meshUrl,
        preview_url: null,
      };
      if (shouldPromote) {
        await updateCustomerMetafield(mr.shopDomain, customerId, metafield);
      }
    }
  }

  return json({ ok: true });
};
