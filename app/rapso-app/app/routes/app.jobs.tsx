import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useLoaderData } from "@remix-run/react";
import { Page, Card, BlockStack, Text, Box } from "@shopify/polaris";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const runs = await prisma.modelRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      status: true,
      createdAt: true,
      shopCustomerId: true,
      sessionId: true,
      meshObjectKey: true,
    },
  });
  return json({ runs });
};

export default function JobsPage() {
  const data = useLoaderData<typeof loader>();
  return (
    <Page title="Jobs">
      <Card>
        <BlockStack gap="300">
          <Text as="p" variant="bodyMd">
            Last 50 model runs (newest first)
          </Text>
          <Box
            padding="400"
            background="bg-surface-active"
            borderWidth="025"
            borderRadius="200"
            borderColor="border"
            overflowX="scroll"
          >
            <pre style={{ margin: 0 }}>
              <code>{JSON.stringify(data, null, 2)}</code>
            </pre>
          </Box>
        </BlockStack>
      </Card>
    </Page>
  );
}
