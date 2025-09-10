import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useEffect, useState } from "react";
import { authenticate } from "../shopify.server";
import { Page, Card, BlockStack, Text, List, Link, InlineStack, Badge } from "@shopify/polaris";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  // Shop domain for storefront proxy checks
  return json({ shop: session?.shop });
};

export default function GettingStarted() {
  const [proxyOk, setProxyOk] = useState<"unknown" | "ok" | "fail">("unknown");
  const [details, setDetails] = useState<string>("");
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ld: any = (window as any).__remixContext?.state?.loaderData;
    const shop = ld?.["routes/app.getting-started"]?.shop;
    if (!shop) return;
    const url = `https://${shop}/apps/rapso/ping`;
    fetch(url)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then((j) => { if (j?.ok) { setProxyOk("ok"); setDetails(""); } else { setProxyOk("fail"); setDetails("Unexpected response"); } })
      .catch((e) => { setProxyOk("fail"); setDetails(String(e?.message || e)); });
  }, []);
  return (
    <Page title="Getting started">
      <Card>
        <BlockStack gap="300">
          <Text as="p" variant="bodyMd">
            Follow these steps to get Rapso working on your storefront.
          </Text>
          <InlineStack gap="300" align="start" blockAlign="center">
            <Text as="span" variant="bodyMd">App Proxy health:</Text>
            {proxyOk === "ok" && <Badge tone="success">OK</Badge>}
            {proxyOk === "fail" && <Badge tone="critical">Fail</Badge>}
            {proxyOk === "unknown" && <Badge tone="attention">Checking…</Badge>}
            {details && <Text as="span" variant="bodySm" tone="subdued">{details}</Text>}
          </InlineStack>
          <List type="number">
            <List.Item>
              Add the Rapso app block in your theme’s Product template: Online Store → Themes → Customize → Product → Add block → “Rapso Try‑on”.
            </List.Item>
            <List.Item>
              Keep this app running (or deploy your host) so App Proxy endpoints respond. Test: <Link url="/apps/rapso/ping" target="_blank">/apps/rapso/ping</Link>
            </List.Item>
            <List.Item>
              Try the PDP modal: upload a sample photo and enter height. You should see status updates and a viewer when complete.
            </List.Item>
          </List>
        </BlockStack>
      </Card>
    </Page>
  );
}
