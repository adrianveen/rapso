import type { LoaderFunctionArgs } from "@remix-run/node";
import path from "node:path";
import { authenticate } from "../shopify.server";
import { env } from "../utils/env.server";

/**
 * Validate and sanitize asset path to prevent directory traversal attacks.
 * Returns null if the path is invalid/malicious.
 */
function sanitizeAssetPath(rawPath: string): string | null {
  // Reject empty paths
  if (!rawPath) return null;

  // Normalize the path to resolve . and .. sequences
  const normalized = path.posix.normalize(rawPath);

  // Reject if normalization results in escaping the root
  if (normalized.startsWith("..") || normalized.startsWith("/")) {
    return null;
  }

  // Reject if original path contained suspicious patterns
  // (even if normalize removed them, the intent was malicious)
  if (rawPath.includes("..") || rawPath.includes("//")) {
    return null;
  }

  // Reject null bytes and other control characters
  if (/[\x00-\x1f]/.test(rawPath)) {
    return null;
  }

  return normalized;
}

// Fallback (when App Proxy URL points to app root instead of /proxy)
// Handles GET /assets/* and streams from backend /assets/*
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await authenticate.public.appProxy(request);
  const rawPath = params["*"] || "";
  const safePath = sanitizeAssetPath(rawPath);

  if (!safePath) {
    return new Response("Invalid path", { status: 400 });
  }

  const upstream = `${env.BACKEND_URL}/assets/${safePath}`;
  const res = await fetch(upstream);
  const buf = await res.arrayBuffer();
  const ct = res.headers.get("content-type") || "application/octet-stream";
  return new Response(buf, {
    status: res.status,
    headers: {
      "content-type": ct,
      "cache-control": "no-store",
    },
  });
};
