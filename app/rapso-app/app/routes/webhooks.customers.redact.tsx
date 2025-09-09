import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);
  // Delete customer-specific data
  const body = await request.json();
  const customer = body?.customer || body?.customer_id;
  if (customer) {
    const cid = String(customer);
    await prisma.modelRun.deleteMany({ where: { shopDomain: shop, shopCustomerId: cid } });
    await prisma.customerProfile.deleteMany({ where: { shopDomain: shop, shopCustomerId: cid } });
  }
  return json({ ok: true });
};

