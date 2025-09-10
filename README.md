# Rapso — Shopify Try‑On App

Rapso lets shoppers generate a private, featureless 3D body model from a single photo and their height, then preview fit and sizing on product pages. This repo contains:

- `apps/shopify`: Embedded Shopify app (Remix + Polaris) and a Theme App Extension (PDP block + small modal UI)
- `backend/`: FastAPI service for uploads, presign/commit/status, asset serving
- `worker/`: GPU/CPU service for model inference (placeholder for now)

Quick Start
- Install CLI deps (Node 20+, pnpm recommended), then: `make app-install`
- Dev the app with tunnel: `make app` (or `shopify app dev --store <dev-store>` inside `apps/shopify`)
- Add the “Rapso Try‑on” app block in Theme Editor (Product template) and test the PDP modal

What’s Implemented
- PDP modal with accessibility polish, keyboard trap, and scroll lock
- App Proxy endpoints for presign/commit/status/assets and height retrieval
- Height prefill for logged‑in customers; units toggle (cm/in) with backend persisting cm
- Privacy guards: endpoints require App Proxy HMAC and logged‑in identity; no customer IDs in the DOM

Deploy (CLI)
- From `apps/shopify`: `shopify app deploy -f` then `shopify app release`
- Keep temporary/tunnel URL for now; we’ll switch to a permanent HTTPS later

Developer docs
- See `docs/DEV.md` for detailed local startup, tunnels, testing, and troubleshooting.

Contributor conventions
- Agent output format: only use JSON when explicitly requested for machine ingestion. Otherwise, use plain text with concise headers and bullets. See `AGENTS.md` for full rules.

Security & Privacy
- No PII in markup or console; minimal JSON responses; `Cache-Control: no-store` on customer data
- Identity via App Proxy `logged_in_customer_id`; all writes/reads enforce match

Roadmap
- Backend/worker hosting + storage lifecycle (auto‑delete input photos)
- DB migration to managed Postgres; observability and alerts
- Billing plan + metered usage for completed model runs
- Hardening (CSP where safe, more endpoint audits)

See `plan.md` for a detailed, living plan and current progress checkpoint.
