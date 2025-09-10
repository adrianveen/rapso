import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { env } from "../utils/env.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.public.appProxy(request);
  const url = new URL(request.url);
  const jobId = url.searchParams.get("job_id");
  if (!jobId) return json({ error: "Missing job_id" }, { status: 400 });
  const mr = await prisma.modelRun.findUnique({ where: { id: jobId } });
  if (!mr) return json({ error: "not_found" }, { status: 404 });
  let status = mr.status;
  let outputKey = mr.meshObjectKey;
  // Fallback: if DB not updated yet, check backend job and reconcile
  if ((status === "queued" || status === "running") && env.BACKEND_URL) {
    try {
      const r = await fetch(`${env.BACKEND_URL}/jobs/${jobId}`);
      if (r.ok) {
        const j = await r.json();
        if (j.status === "completed" && j.output_url) {
          const keyFromUrl = (j.output_url || "").replace(/^.*\/assets\//, "");
          outputKey = keyFromUrl || outputKey;
          status = "succeeded";
          await prisma.modelRun.update({ where: { id: jobId }, data: { status, meshObjectKey: outputKey || undefined } });
        }
      }
    } catch {}
  }
  const outputUrl = outputKey ? `/apps/rapso/assets/${outputKey}` : null;
  return json(
    { status, output_url: outputUrl },
    { headers: { "cache-control": "no-store" } },
  );
};
