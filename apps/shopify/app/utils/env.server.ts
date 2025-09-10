import { z } from "zod";

const isProd = process.env.NODE_ENV === "production";

const Env = z.object({
  SHOPIFY_API_KEY: z.string().min(1),
  SHOPIFY_APP_URL: z.string().url(),
  BACKEND_URL: isProd
    ? z.string().url()
    : z.string().url().default("http://localhost:8000"),
});

export const env = Env.parse({
  SHOPIFY_API_KEY: process.env.SHOPIFY_API_KEY,
  SHOPIFY_APP_URL: process.env.SHOPIFY_APP_URL,
  BACKEND_URL: process.env.BACKEND_URL,
});
