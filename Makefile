cpu:
	docker compose --profile cpu up -d --build
gpu:
	docker compose --profile gpu up -d --build
down:
	docker compose down
logs:
	docker compose logs -f
smoketest:
	BACKEND_URL=$${BACKEND_URL:-http://localhost:8000} bash scripts/smoketest.sh
health:
	bash scripts/health.sh
check-no-store:
	@SHOP_DOMAIN=$${SHOP_DOMAIN} CUSTOMER_ID=$${CUSTOMER_ID} bash scripts/check_no_store.sh
app-install:
	cd apps/shopify && pnpm install
app:
	cd apps/shopify && shopify app dev
reauth:
	cd apps/shopify && shopify app dev --reset
migrate:
	pnpm --dir apps/shopify prisma migrate dev --name quick
tunnel:
	@if [ -z "$${PORT}" ]; then echo "Usage: make tunnel PORT=43339"; exit 1; fi; \
	cloudflared tunnel --url http://127.0.0.1:$${PORT}

.PHONY: cpu gpu down logs smoketest health check-no-store app app-install reauth migrate tunnel
