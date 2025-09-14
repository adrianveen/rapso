# Rapso — Local Development Guide

This guide walks you through running the app locally end‑to‑end without any paid services.

## Conventions

- Agent output format: only use JSON when explicitly requested for machine ingestion. Otherwise, use plain text with concise headers and bullets. See `AGENTS.md` for the canonical rules.

## Prerequisites

- Node 18/20 + pnpm
- Shopify CLI ≥ 3.59 (`npm i -g @shopify/cli`)
- Docker (for backend + worker)
- Optional tunnel: trycloudflared (`cloudflared`) or use the Shopify CLI tunnel

## One‑time setup

1) Install app dependencies

```
make app-install
```

2) Apply Prisma migrations (SQLite)

```
# from repo root
make migrate

# If Prisma reports drift (dev DB out of sync), reset then migrate:
cd apps/shopify \
  && pnpm prisma migrate reset --skip-seed --force \
  && pnpm prisma migrate dev
```

## Start services

1) Backend + worker (Docker)

```
docker compose --profile cpu up -d --build backend worker
curl http://localhost:8000/healthz  # → {"ok": true}
```

Notes:
- Backend stores files under `backend/data/` and jobs in `backend/data/dev.sqlite`.
- No S3/R2 needed in dev; presigned responses map to `/assets/*` locally.

GPU + TripoSR (optional):

```
# Build GPU worker
docker compose --profile gpu up -d --build backend worker-gpu

# Enable TripoSR provider
# In backend/.env, set:
#   MODEL_PROVIDER=triposr
# Optionally set in worker/.env (or Dockerfile.gpu):
#   TRIPOSR_CMD="python -m scripts.run"
# If installing TripoSR from source, uncomment the pip install line in worker/Dockerfile.gpu and rebuild.
```

2) Run the Shopify app (Admin + App Proxy + Theme preview)

```
make app
```

Tunnel options:
- CLI tunnel (default): the command above will create a public URL and usually prompt to update URLs.
- trycloudflared: in another terminal, run `make tunnel PORT=3000`, then start dev with:

```
cd apps/shopify \
  && shopify app dev --store <your-dev-store> \
       --tunnel-url https://<your-tunnel>.trycloudflare.com
```

If URLs don’t update, run with `--reset` or update in the Partner Dashboard (App URL, Redirect URLs, and App Proxy).

## Quick verification

- Admin opens without error (Polaris context works)
- Proxy health on storefront:

```
https://<your-store>.myshopify.com/apps/rapso/ping  # → { ok: true }
```

- PDP: add “Rapso Try‑on” app block in Theme Editor (Product template) and test the modal
- Sizing rules: in Admin, visit `/app/sizing`, set thresholds/labels; PDP suggestions should reflect them

## Theme extension deploy (when you want changes live on a theme)

```
cd apps/shopify
shopify app deploy -f
shopify app release
```

## Tests

```
cd apps/shopify && pnpm test
```

## Troubleshooting

- No prompt to update URLs:
  - Run `shopify app dev --store <store> --tunnel-url <url> --reset`, or update in Partner Dashboard.

- Prisma drift (SQLite):
  - `cd apps/shopify && pnpm prisma migrate reset --skip-seed --force && pnpm prisma migrate dev`

- PDP shows “Translation missing”: 
  - Re‑deploy theme extension (deploy + release). Ensure `extensions/rapso-theme/locales/en.default.json` contains `rapso.pdp.button`.

- Admin Polaris error (MediaQueryProvider):
  - Ensure the app is wrapped in `<PolarisAppProvider i18n={…}>` (already done in `app/routes/app.tsx`).

- Tunnel expired:
  - Restart `cloudflared` (`make tunnel PORT=3000`) or rely on the CLI tunnel and re‑run `shopify app dev`.

## Makefile shortcuts

```
make app-install   # pnpm install in apps/shopify
make migrate       # prisma migrate dev in apps/shopify
make app           # shopify app dev from apps/shopify
make tunnel PORT=3000  # trycloudflared to expose the app
make cpu           # docker compose up backend + worker (profile cpu)
make logs          # docker compose logs -f
make down          # docker compose down
```
