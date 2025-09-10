import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Require valid App Proxy signature
  await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || "";
  const customerId = url.searchParams.get("customer_id") || "";
  const loggedInId = url.searchParams.get("logged_in_customer_id") || "";

  if (!customerId) return json({ error: "Missing customer_id" }, { status: 400 });
  if (!loggedInId) return json({ error: "not_logged_in" }, { status: 401 });
  if (customerId !== loggedInId) return json({ error: "forbidden" }, { status: 403 });

  const profile = await prisma.customerProfile.findUnique({
    where: { shopDomain_shopCustomerId: { shopDomain: shop, shopCustomerId: customerId } },
  });
  return json(
    { height_cm: profile?.heightCentimetres ?? null },
    { headers: { "cache-control": "no-store" } },
  );
};
