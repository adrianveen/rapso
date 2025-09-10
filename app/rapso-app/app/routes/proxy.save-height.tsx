import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || "";
  const form = await request.formData();
  const heightStr = form.get("height_cm");
  const customerIdRaw = form.get("customer_id");
  const loggedInId = url.searchParams.get("logged_in_customer_id") || "";
  const customerId = typeof customerIdRaw === "string" && customerIdRaw ? customerIdRaw : loggedInId;

  if (!customerId) {
    return json({ error: "not_logged_in" }, { status: 401 });
  }
  if (typeof customerIdRaw === "string" && customerIdRaw && customerIdRaw !== loggedInId) {
    return json({ error: "forbidden" }, { status: 403 });
  }
  const heightCm = typeof heightStr === "string" && heightStr.length > 0 ? Number(heightStr) : undefined;

  try {
    await prisma.customerProfile.upsert({
      where: { shopDomain_shopCustomerId: { shopDomain: shop, shopCustomerId: customerId } },
      update: { heightCentimetres: heightCm },
      create: { shopDomain: shop, shopCustomerId: customerId, heightCentimetres: heightCm },
    });
    return json(
      { ok: true, heightCm: heightCm ?? null },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e: any) {
    return json({ error: String(e?.message || e) }, { status: 500 });
  }
};
