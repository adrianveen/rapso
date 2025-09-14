# Rapso: Build Plan

Progress Checkpoint — current status

- Completed
  - Theme App Extension PDP modal with a11y, focus trap, and scroll lock.
  - Height prefill via App Proxy endpoint (`/apps/rapso/fit/height`).
  - Privacy hardening: endpoints now require App Proxy HMAC and logged-in customer ID; removed customer ID from DOM.
  - Save-height writes to `CustomerProfile` with identity enforcement.
  - Units toggle (cm/in) in PDP; backend remains centimetres.
  - Login UX: remembers last shop domain and improved autocomplete for password managers.
  - Theme extension checks: added `locales/en.default.json` and changed JS include to `defer`.
  - Security headers: Referrer-Policy and CSP `frame-ancestors` for embedded app.
  - Admin pages: Getting Started (`/app/getting-started`), Jobs (`/app/jobs`) listing last runs, Billing placeholder (`/app/billing`).
  - Proxy enforcement on assets/jobs/tryon/ping and `no-store` caching for customer data.
  - Basic anti‑abuse: rate limiting on commit (1/120s per identity) and presign (1/10s per identity) + server‑side image type/size validation.
  - Tests: Vitest unit tests for `fit.height` and `fit.presign` (no network/external services).
  - Backend: FastAPI service with `POST /uploads`, `POST /enqueue`, `GET /jobs/{id}`, `POST /jobs/{id}/callback`, `POST /presign`, and `POST /dev/upload` implemented (`backend/main.py:1`).
  - Backend storage: S3/R2 optional, local dev fallback mounted at `/assets` with presigned-style URLs in dev.
  - Backend DB: SQLite with `jobs` and `assets` tables via SQLAlchemy; idempotent asset insert in callback and fixed DetachedInstanceError by `expire_on_commit=False`.
  - Worker: FastAPI stub with `/healthz` and `/process` routes; accepts `provider` and posts callback to backend (`worker/main.py:1`).
  - Worker demo provider: Silhouette segmentation + surface‑of‑revolution to output `.glb` (`worker/providers/silhouette_revolve.py:1`), wired as the default provider path in `/process` (`worker/main.py:1`).
  - Admin model viewer: Added HTTPS asset proxy and routed `/assets/*` to `/api/assets/*` to avoid mixed content; in‑page `<model-viewer>` now renders the output (`apps/shopify/app/routes/api.assets.$.tsx:1`, `apps/shopify/app/routes/app.model.tsx:1`).
  - Callback wiring: Backend forwards job completion to app when `APP_CALLBACK_URL` + `MODEL_CALLBACK_SECRET` are set (`backend/main.py:357`).
  - Worker job handling: `/process` now runs jobs asynchronously via FastAPI BackgroundTasks to avoid request timeouts; backend enqueue returns quickly (`worker/main.py:91`).

- Next Steps
  - Implement actual model generation in the worker (free tools where possible):
    - Option A (general 3D): integrate TripoSR/SF3D single-image→3D to output `.glb` for the person photo (fast demo path; mesh is not measurement-accurate).
    - Option B (body model): integrate SMPL/SMPL-X estimation (e.g., via MMHuman3D or PIXIE) to produce a featureless body mesh scaled by user height (requires SMPL assets/licence acceptance).
  - Delete input photos after successful model generation; retain only mesh and minimal metadata. [IN PROGRESS]
  - Track A provider: Add TripoSR/SF3D dependency to the GPU worker image and set `MODEL_PROVIDER=triposr`; fallback remains silhouette if unavailable. Provide `TRIPOSR_CMD` for CLI integration. [IN PROGRESS]
  - Backend/worker hosting and `BACKEND_URL` wiring for deployed environments.
  - Storage CORS + lifecycle policies.
  - Evaluate DB: keep SQLite for dev, plan managed Postgres for prod; add migrations.
  - Add Billing (plan + metered usage) and observability (metrics, alerts).
  - Expand tests: backend route tests (enqueue/status/callback), worker e2e in CPU profile with a tiny sample.
  - Merchant UX: inline help for PDP block and admin onboarding.
  - Analytics: basic funnel metrics (try-on click → upload → model ready) behind a toggle.

================== CURRENT PROGRESS BREAK ==================

## Overview
**Goal:** Single-photo → featureless, proportionate 3D body model → try-on.  
**Stack in repo:** Shopify Remix app (`apps/shopify`), FastAPI backend (`backend`), GPU/CPU worker (`worker`), Prisma (session storage), Docker Compose with profiles (cpu, gpu).  
**Integration points present:** Shopify auth, webhooks, Prisma session storage, env validation for `BACKEND_URL` in `apps/shopify/app/utils/env.server.ts:1`.

## Architecture
- **Admin UI (Remix):** Merchant setup, testing, jobs view, billing.  
- **Storefront extension (Theme App Extension):** Product page block + script inject → upload UI, viewer modal.  
- **Backend (FastAPI):** Uploads, job orchestration, status, asset delivery, webhook sink.  
- **Worker (FastAPI GPU):** ML pipeline to estimate body shape, output `.glb` mesh.  
- **Storage:** Object storage (S3/R2) for inputs/outputs; signed URLs for access.  
- **Queue:** Start with DB-backed job table + polling; upgrade to Redis later.  
- **Viewer:** three.js (via react-three-fiber) to render `.glb`.

## Phased Plan

### Baseline Plumbing
- Shopify Admin shell: Confirm login + Polaris scaffold works (`/app` loads).  
- Backend health checks: Wire `BACKEND_URL` (`apps/shopify/app/utils/env.server.ts:1`) to backend service (`/healthz`).  
- Minimal upload API: `POST /uploads` → store file to S3/R2 → create Job record (queued).  
- Job API: `POST /jobs` (create), `GET /jobs/:id` (status), `GET /assets/:id` (serve signed URL).  
- Admin test page: Upload image, see job status, view placeholder mesh.  

### Data Model + Queue
- **Prisma:** Add tables in `apps/shopify/prisma/schema.prisma:1`:  
  Merchant, Customer, ModelAsset, Job (status: queued/processing/completed/failed).  
- **Backend:** Persist Jobs/Assets; worker callback `POST /jobs/:id/callback`.  
- **Worker:** `POST /process` → starts inference, returns job id; callback on completion.  

### ML Pipeline POC (Worker)
- Track A — General Single-image→3D (fastest demo)
  - Use a free model like TripoSR/SF3D to reconstruct a 3D mesh from a single photo; export `.glb`.
  - Pros: quick to integrate; no SMPL asset licensing; visually compelling. Cons: not anthropometrically accurate.
  - Output: clothed mesh, acceptable for a visual demo; size guidance remains heuristic.

- Track B — Body Model (featureless)
  - Single-image → SMPL/SMPL-X parameters; produce featureless, proportionate body `.glb`, scaled by user height.
  - Steps: segmentation → keypoints → parametric fit → mesh export → height scaling.
  - Libraries: MMHuman3D orchestration; or PIXIE/SMPLify-X. Requires SMPL(-X) model files and licence acceptance.
  - Pros: better for sizing. Cons: more setup, model assets required.

### Admin Experience
- **Screens:**  
  - Getting Started (keys, storage config, GPU plan).  
  - Model Tests (upload photo, height input).  
  - Jobs & Assets (list, statuses, retry).  
  - Billing (plan/subscription via Shopify).  
- **Secure calls** to backend using app auth; wire Remix loaders/actions.  
- Viewer page: render `.glb` with react-three-fiber.  

### Storefront Extension
- Theme App Extension (block on product template): “Try-on with Rapso”.  
- **Widget flow:**  
  - If logged-in customer has model: show viewer with garment try-on.  
  - Else: ask for height + photo upload; create job; email/push when ready.  
- Asset access via signed URLs; ensure CORS and origin controls.  

Note (UX)
- Mobile camera uploads verified working.
- Units toggle added for height input (cm/in); backend persists cm only.

### Garment Try-on (MVP)
- **Phase 1:** Show body model next to product images with size suggestions based on inferred measurements (no cloth sim).  
- **Phase 2:** 3D garment drape on mesh using simplified cloth or pre-fit proxies for your catalog’s top SKUs.  
- Prioritize correctness for sizing before advanced cloth physics.  

### Privacy, Compliance, Security
- **PII tightness:** Store minimal user data, encrypt-at-rest, signed URLs time-limited.  
- **Retention policy:** Auto-delete input photos after model produced.  
- **Merchant controls:** Export/delete customer models; clear data if app uninstalled (`apps/shopify/app/routes/webhooks.app.uninstalled.tsx:1` hook).  

TODOs

- [ ] Frontend data hygiene: don't inject PII (customer IDs, height) into HTML/JS-visible DOM; rely on App Proxy `logged_in_customer_id` on the server. Remove `data-customer-id` from the PDP block once endpoints derive identity server-side.
- [ ] Ensure no PII is printed in browser console/network errors; audit and strip `console.*`.
- [ ] Set `Cache-Control: no-store` on responses that include customer data (height, profile). Keep payloads minimal JSON.
- [ ] Add CSP and Referrer-Policy to Admin responses where possible.

### Repository & Licensing
- License: switch to a Non-Commercial license to prevent monetization while public.
- TODO: privatize this repository before GA and revisit licensing.

### Billing & Usage
- Shopify Billing API: Monthly plan + metered usage per completed model.  
- Track cost metrics per job; show analytics to merchant.  

### Observability & Ops
- Structured logs, request IDs in backend/worker.  
- **Metrics:** jobs counts, durations, success rates, GPU utilization.  
- **SLOs:** queue latency and job turnaround targets; alerting.  

### Launch Readiness
- QA: Device/browser checks, throttling, large image handling, fallbacks.  
- Security review: AuthZ boundaries between merchant/customer data.  
- Docs, merchant onboarding, support workflows.  

## Concrete Tasks Against Your Repo

### Admin → Backend wiring
- Add `.env` values for `BACKEND_URL`, `ASSET_BUCKET`, `ASSET_REGION`.  
- Add backend routes in `backend/main.py:1`: `POST /uploads`, `POST /jobs`, `GET /jobs/:id`.  
- Extend admin UI in `apps/shopify/app/routes/app._index.tsx:1` with upload + status panel.  

### DB schema
- Extend `apps/shopify/prisma/schema.prisma:1` with Job/Asset/Customer tables.  
- Run `pnpm prisma migrate dev` inside `apps/shopify`.  

### Worker
- Build GPU image (`worker/Dockerfile.gpu`) with CUDA + Python libs.
  - Track A (TripoSR/SF3D): `torch`, `xformers`, `trimesh`, and the model code/checkpoints.
  - Track B (SMPL/SMPL-X): `mmhuman3d`, `smplx`, `trimesh`; place SMPL assets via volume/secret.
- Extend `POST /process` in `worker/main.py:1` to download input image, run chosen provider, write `.glb` to storage, then callback.
- Handle retries/idempotency: if output already exists, short‑circuit.

### Storefront
- Scaffold theme app extension under `apps/shopify/extensions/theme-app-extension` with a product block.  
- Inject a modal viewer and upload trigger; call backend endpoints via a storefront-safe proxy.  

## Key Decisions (please confirm)
- **Input flow:** Single photo + declared user height for scale? Or require two photos (front/back) for improved accuracy?  
  *Recommendation:* single photo + height (fastest to ship).  
- **Compute:** Use your own GPU instances (AWS/GCP) vs third-party API?  
  *Recommendation:* own GPU (g5/g6) with autoscaling later.  
- **Storage:** S3 vs Cloudflare R2.  
  *Recommendation:* R2 (cost-effective egress, good for media).  
- **MVP try-on:** Start with sizing suggestions and body viewer, defer cloth simulation to Phase 2?  
  *Recommendation:* yes, ship sizing first.  
- **Customer identity:** Require logged-in Shopify customer to link models to customer ID on the storefront?  
  *Recommendation:* yes for persistence and privacy.  
