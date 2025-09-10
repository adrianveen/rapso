import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useFetcher, useLoaderData } from "@remix-run/react";
import { useEffect, useState } from "react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  InlineStack,
  Button,
  TextField,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";
import { env } from "../utils/env.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  let backendHealthy: "ok" | "fail" | "unknown" = "unknown";
  let worker: string | null = null;
  try {
    const r = await fetch(`${env.BACKEND_URL}/healthz`);
    if (r.ok) {
      const j = await r.json();
      backendHealthy = "ok";
      worker = j?.worker ?? null;
    } else {
      backendHealthy = "fail";
    }
  } catch {
    backendHealthy = "fail";
  }
  return json({ backendUrl: env.BACKEND_URL, backendHealthy, worker });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    await authenticate.admin(request);
    const form = await request.formData();
    const file = form.get("file");
    const height = form.get("height_cm");

    if (!(file instanceof File)) {
      return json({ error: "No file provided" }, { status: 400 });
    }

    const fd = new FormData();
    fd.append("file", file);
    if (typeof height === "string" && height.length > 0) {
      fd.append("height_cm", height);
    }

    const res = await fetch(`${env.BACKEND_URL}/uploads`, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      const text = await res.text();
      return json(
        { error: text || `Upload failed with ${res.status}` },
        { status: res.status },
      );
    }
    const data = await res.json();
    return json(data);
  } catch (err: any) {
    return json({ error: String(err?.message || err) }, { status: 500 });
  }
};

export default function ModelTest() {
  const fetcher = useFetcher<{ job_id?: string; status?: string }>();
  const { backendUrl, backendHealthy, worker } = useLoaderData<typeof loader>();
  const [jobId, setJobId] = useState<string | null>(null);
  const [height, setHeight] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [outputUrl, setOutputUrl] = useState<string | null>(null);

  // Lazy-load model-viewer once on client
  useEffect(() => {
    if (typeof window === "undefined") return;
    // @ts-ignore
    if (window.customElements && window.customElements.get("model-viewer")) return;
    const script = document.createElement("script");
    script.type = "module";
    script.src = "https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js";
    document.head.appendChild(script);
  }, []);

  function ModelViewer({ src }: { src: string }) {
    return (
      // @ts-ignore - web component
      <model-viewer
        src={src}
        style={{ width: "100%", height: 400, background: "#f6f6f7" }}
        camera-controls
        exposure="1.0"
        ar
        ar-modes="webxr scene-viewer quick-look"
        shadow-intensity="0.5"
        autoplay
      />
    );
  }

  // poll job status when a job is created
  useEffect(() => {
    if (!jobId) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const poll = async () => {
      try {
        const r = await fetch(`/api/jobs/${jobId}`);
        const j = await r.json();
        setStatus(j.status || "");
        const rawUrl: string | null = j.output_url || null;
        // Ensure absolute URL for cross-origin loads
        const abs = rawUrl && rawUrl.startsWith("/") ? `${backendUrl}${rawUrl}` : rawUrl;
        setOutputUrl(abs);
        if (j.status === "completed" || j.status === "failed") {
          if (timer) clearInterval(timer);
        }
        // eslint-disable-next-line no-console
        // Intentionally avoid console logging of job details in production
      } catch (e) {
        // eslint-disable-next-line no-console
        // Swallow polling errors to avoid noisy logs; surface via UI if needed
      }
    };
    poll();
    timer = setInterval(poll, 2000);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [jobId]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.job_id) {
      setJobId(fetcher.data.job_id);
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <Page title="Rapso model test">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack gap="200" align="start" blockAlign="center">
                <Text as="span" variant="bodyMd">Backend:</Text>
                <Text as="span" variant="bodyMd" tone={backendHealthy === "ok" ? "success" : backendHealthy === "fail" ? "critical" : undefined}>
                  {backendHealthy}
                </Text>
                {typeof worker === "string" && (
                  <>
                    <Text as="span" variant="bodyMd">Worker:</Text>
                    <Text as="span" variant="bodyMd" tone={worker === "ok" ? "success" : worker ? "critical" : undefined}>
                      {worker || "n/a"}
                    </Text>
                  </>
                )}
              </InlineStack>
              <Text as="p">Upload a single photo and optional height (cm).</Text>
              {fetcher.data && (fetcher.data as any).error && (
                <Text tone="critical" as="p">{(fetcher.data as any).error}</Text>
              )}
              <fetcher.Form method="post" encType="multipart/form-data">
                <BlockStack gap="300">
                  <input type="file" name="file" accept="image/*" required />
                  <InlineStack gap="200" align="start">
                    <TextField
                      label="Height (cm)"
                      value={height}
                      onChange={(v) => setHeight(v)}
                      name="height_cm"
                      autoComplete="off"
                    />
                    <Button
                      variant="primary"
                      submit
                      loading={fetcher.state !== "idle"}
                    >
                      Upload
                    </Button>
                  </InlineStack>
                </BlockStack>
              </fetcher.Form>
              {jobId && (
                <BlockStack gap="200">
                  <Text as="p">Job created: {jobId}. Polling status…</Text>
                  {status && <Text as="p">Status: {status}</Text>}
                  {outputUrl && (
                    <>
                      <Button url={outputUrl} target="_blank" rel="noreferrer">
                        Open output (.glb)
                      </Button>
                      <ModelViewer src={outputUrl} />
                    </>
                  )}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
