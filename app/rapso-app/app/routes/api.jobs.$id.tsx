import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { env } from "../utils/env.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const id = params.id as string;
  const res = await fetch(`${env.BACKEND_URL}/jobs/${id}`);
  const data = await res.json();
  return json(data);
};
