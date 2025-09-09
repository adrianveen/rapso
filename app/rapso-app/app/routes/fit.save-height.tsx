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
  const customerId = form.get("customer_id");
  if (typeof customerId !== "string" || !customerId) return json({ error: "Missing customer_id" }, { status: 400 });
  const heightCm = typeof heightStr === "string" && heightStr.length > 0 ? Number(heightStr) : undefined;
  await prisma.customerProfile.upsert({
    where: { shopDomain_shopCustomerId: { shopDomain: shop, shopCustomerId: customerId } },
    update: { heightCentimetres: heightCm },
    create: { shopDomain: shop, shopCustomerId: customerId, heightCentimetres: heightCm },
  });
  return json({ ok: true, heightCm: heightCm ?? null });
};
