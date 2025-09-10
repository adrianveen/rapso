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
  const rules = shop ? await prisma.sizingRules.findUnique({ where: { shopDomain: shop } }) : null;
  const payload = {
    small_max_cm: rules?.smallMaxCm ?? 165,
    medium_max_cm: rules?.mediumMaxCm ?? 180,
    labels_csv: rules?.labelsCsv ?? "S,M,L",
  };
  return json(payload, { headers: { "cache-control": "no-store" } });
};

