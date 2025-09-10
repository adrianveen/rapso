import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);
  await prisma.modelRun.deleteMany({ where: { shopDomain: shop } });
  await prisma.customerProfile.deleteMany({ where: { shopDomain: shop } });
  return json({ ok: true });
};

