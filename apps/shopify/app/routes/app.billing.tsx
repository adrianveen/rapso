import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { Page, Card, BlockStack, Text, List } from "@shopify/polaris";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function Billing() {
  return (
    <Page title="Billing (coming soon)">
      <Card>
        <BlockStack gap="300">
          <Text as="p" variant="bodyMd">
            Planned tiers:
          </Text>
          <List>
            <List.Item>
              Starter: $29/mo, includes 100 completed models, $0.20 overage.
            </List.Item>
            <List.Item>
              Pro: $99/mo, includes 600 models, $0.15 overage, email notifications.
            </List.Item>
            <List.Item>
              Enterprise: custom SLA and volume pricing.
            </List.Item>
          </List>
          <Text as="p" variant="bodySm" tone="subdued">
            This is a placeholder UI; billing mutation wiring will be added later.
          </Text>
        </BlockStack>
      </Card>
    </Page>
  );
}

