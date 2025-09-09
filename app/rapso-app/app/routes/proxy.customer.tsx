import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    await authenticate.public.appProxy(request);
  } catch {}
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || "";
  const customerId = url.searchParams.get("customer_id") || "";
  if (!customerId) return json({ error: "Missing customer_id" }, { status: 400 });
  const customer = await prisma.customer.findFirst({ where: { shop, shopCustomerId: customerId } });
  return json({ customer });
};
