import { vitePlugin as remix } from "@remix-run/dev";
import { installGlobals } from "@remix-run/node";
import { defineConfig, type UserConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

installGlobals({ nativeFetch: true });

// Related: https://github.com/remix-run/remix/issues/2835#issuecomment-1144102176
// Replace the HOST env var with SHOPIFY_APP_URL so that it doesn't break the remix server. The CLI will eventually
// stop passing in HOST, so we can remove this workaround after the next major release.
if (
  process.env.HOST &&
  (!process.env.SHOPIFY_APP_URL ||
    process.env.SHOPIFY_APP_URL === process.env.HOST)
) {
  process.env.SHOPIFY_APP_URL = process.env.HOST;
  delete process.env.HOST;
}

// Determine host used for dev; default to localhost
const appHost = new URL(process.env.SHOPIFY_APP_URL || "http://localhost").hostname;
const host = appHost;
const isLocal = !!process.env.DEV_PORT || host === "localhost" || host === "127.0.0.1";

let hmrConfig;
if (isLocal) {
  hmrConfig = {
    protocol: "ws",
    host: "localhost",     // bind locally
    port: Number(process.env.HMR_PORT || 64999),
    clientPort: Number(process.env.HMR_PORT || 64999),
  } as const;
} else {
  // When using a public tunnel, bind HMR locally but tell client to reach the tunnel host.
  hmrConfig = {
    protocol: "wss",
    host: "localhost",     // DO NOT bind to remote IP
    port: Number(process.env.HMR_PORT || 64999),
    clientPort: 443,
    clientHost: appHost,
  } as const;
}

export default defineConfig({
  server: {
    // Allow Cloudflare tunnel subdomains and external access during dev
    host: true,
    allowedHosts: true,
    cors: {
      preflightContinue: true,
    },
    // Prefer CLI-provided PORT; allow fallback ports (strictPort: false)
    port: Number(process.env.PORT || process.env.DEV_PORT || 3000),
    strictPort: false,
    hmr: hmrConfig,
    fs: {
      // See https://vitejs.dev/config/server-options.html#server-fs-allow for more information
      allow: ["app", "node_modules"],
    },
  },
  plugins: [
    remix({
      ignoredRouteFiles: ["**/.*"],
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
        v3_lazyRouteDiscovery: true,
        v3_singleFetch: false,
        v3_routeConfig: true,
      },
    }),
    tsconfigPaths(),
  ],
  build: {
    assetsInlineLimit: 0,
  },
  optimizeDeps: {
    include: ["@shopify/app-bridge-react", "@shopify/polaris"],
  },
}) satisfies UserConfig;
