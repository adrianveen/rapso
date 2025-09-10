import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, Form, useNavigation } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { Page, Card, BlockStack, Text, TextField, InlineStack, Button } from "@shopify/polaris";
import { useEffect, useState } from "react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session!.shop;
  const rules = await prisma.sizingRules.findUnique({ where: { shopDomain: shop } });
  return json({ shop, rules });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session!.shop;
  const form = await request.formData();
  const smallMaxCm = Number(form.get("smallMaxCm") || 165);
  const mediumMaxCm = Number(form.get("mediumMaxCm") || 180);
  const labelsCsv = String(form.get("labelsCsv") || "S,M,L").trim();
  await prisma.sizingRules.upsert({
    where: { shopDomain: shop },
    update: { smallMaxCm, mediumMaxCm, labelsCsv },
    create: { shopDomain: shop, smallMaxCm, mediumMaxCm, labelsCsv },
  });
  return redirect("/app/sizing");
};

export default function SizingPage() {
  const { rules } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const [small, setSmall] = useState(String(rules?.smallMaxCm ?? 165));
  const [medium, setMedium] = useState(String(rules?.mediumMaxCm ?? 180));
  const [labels, setLabels] = useState(String(rules?.labelsCsv ?? "S,M,L"));
  const busy = nav.state !== "idle";

  useEffect(() => {
    setSmall(String(rules?.smallMaxCm ?? 165));
    setMedium(String(rules?.mediumMaxCm ?? 180));
    setLabels(String(rules?.labelsCsv ?? "S,M,L"));
  }, [rules]);

  return (
    <Page title="Sizing rules">
      <Card>
        <BlockStack gap="300">
          <Text as="p" variant="bodyMd">
            Configure default size suggestions for your storefront PDP modal. Labels should be comma‑separated (e.g., "S,M,L" or "XS,S,M,L").
          </Text>
          <Form method="post">
            <BlockStack gap="300">
              <InlineStack gap="300">
                <TextField label="Small max (cm)" name="smallMaxCm" type="number" value={small} onChange={setSmall} autoComplete="off" />
                <TextField label="Medium max (cm)" name="mediumMaxCm" type="number" value={medium} onChange={setMedium} autoComplete="off" />
              </InlineStack>
              <TextField label="Labels (CSV)" name="labelsCsv" value={labels} onChange={setLabels} autoComplete="off" />
              <InlineStack gap="300">
                <Button submit loading={busy}>
                  Save
                </Button>
              </InlineStack>
            </BlockStack>
          </Form>
        </BlockStack>
      </Card>
    </Page>
  );
}

