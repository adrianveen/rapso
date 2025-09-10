import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// GET /fit/height (fallback) — returns the logged in customer's height via App Proxy
export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Require valid App Proxy signature
  await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || "";
  const loggedInId = url.searchParams.get("logged_in_customer_id");
  if (!loggedInId) return json({ error: "not_logged_in" }, { status: 401 });

  const profile = await prisma.customerProfile.findUnique({
    where: { shopDomain_shopCustomerId: { shopDomain: shop, shopCustomerId: loggedInId } },
  });

  return json(
    { height_cm: profile?.heightCentimetres ?? null },
    { headers: { "cache-control": "no-store" } },
  );
};
