import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "@remix-run/react";
import type { HeadersFunction } from "@remix-run/node";

export default function App() {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export const headers: HeadersFunction = () => {
  const baseCsp = "frame-ancestors https://admin.shopify.com https://*.myshopify.com;";
  const strict = process.env.RAPSO_STRICT_CSP === "1";
  const csp = strict
    ? [
        baseCsp,
        "default-src 'self';",
        "img-src 'self' data: https:;",
        "script-src 'self' 'unsafe-inline' https://cdn.shopify.com https://unpkg.com;",
        "style-src 'self' 'unsafe-inline' https://cdn.shopify.com;",
        "connect-src 'self' https://admin.shopify.com https://*.myshopify.com;",
      ].join(" ")
    : baseCsp;
  return {
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Content-Security-Policy": csp,
    "X-Content-Type-Options": "nosniff",
  };
};
