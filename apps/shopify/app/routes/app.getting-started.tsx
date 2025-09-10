import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import {
  Page,
  Card,
  BlockStack,
  Text,
  List,
  Link,
} from "@shopify/polaris";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function GettingStarted() {
  return (
    <Page title="Getting started">
      <Card>
        <BlockStack gap="300">
          <Text as="p" variant="bodyMd">
            Follow these steps to get Rapso working on your storefront.
          </Text>
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

