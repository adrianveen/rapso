cpu:
	docker compose --profile cpu up -d --build
gpu:
	docker compose --profile gpu up -d --build
down:
	docker compose down
logs:
	docker compose logs -f
app-install:
	cd app/rapso-app && pnpm install
app:
	cd app/rapso-app && shopify app dev
reauth:
	cd app/rapso-app && shopify app dev --reset
migrate:
	pnpm --dir app/rapso-app prisma migrate dev --name quick
tunnel:
	@if [ -z "$${PORT}" ]; then echo "Usage: make tunnel PORT=43339"; exit 1; fi; \
	cloudflared tunnel --url http://127.0.0.1:$${PORT}

.PHONY: cpu gpu down logs app app-install reauth migrate tunnel
