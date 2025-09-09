import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Fallback when App Proxy URL points to app root (no /proxy)
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    await authenticate.public.appProxy(request);
  } catch {}

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || "";
  const form = await request.formData();
  const heightStr = form.get("height_cm");
  const customerId = form.get("customer_id");

  if (typeof customerId !== "string" || !customerId) {
    return json({ error: "Missing customer_id" }, { status: 400 });
  }
  const heightCm = typeof heightStr === "string" && heightStr.length > 0 ? Number(heightStr) : undefined;

  try {
    const existing = await prisma.customer.findFirst({ where: { shop, shopCustomerId: customerId } });
    if (existing) {
      await prisma.customer.update({ where: { id: existing.id }, data: { heightCm } });
    } else {
      await prisma.customer.create({ data: { shop, shopCustomerId: customerId, heightCm } });
    }
    return json({ ok: true, heightCm: heightCm ?? null });
  } catch (e: any) {
    return json({ error: String(e?.message || e) }, { status: 500 });
  }
};
