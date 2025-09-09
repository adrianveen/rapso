# AGENTS.md

## Purpose

This file instructs AI coding agents, including OpenAI Codex in VS Code, on how to operate in this repository. The agent is expected to act as the subject-matter expert, follow industry best practices, and pause to ask clarifying questions whenever requirements are ambiguous. The app lets shoppers create and manage a personal “Fit Profile” with a 3D body model and height for trying on clothes.

If anything here conflicts with a one-off user prompt, ask for confirmation and prefer the latest explicit instruction.

## Ground rules

* Do not assume unclear requirements. If you are unsure, stop and ask targeted questions before editing code.
* Minimise risk. Prefer small, reviewable PRs with tests over sweeping changes.
* Prioritise security, privacy, performance, and a modern, simple, clean UI that avoids clutter.
* Use descriptive variable and function names. Avoid single-letter identifiers unless conventional in a narrow scope.
* Avoid logging personally identifiable information.
* Follow Shopify’s recommended surfaces and patterns for customer-facing features, data storage, app proxies, and compliance. ([Shopify][1])

## Project overview

Goal

* One active model per logged-in customer.
* Store height in centimetres.
* Guests may run a one-time model in session and later migrate it to an account.
* Logged-in customers can run a new model to replace the active one and edit height with guardrails.

Primary surfaces

* Customer Account UI extension page “Fit Profile” for full management. ([Shopify][1])
* Theme App Extension block on the product page that opens a modal for quick access. ([Shopify][2], [Shopify Help Center][3])

Data placement

* Store canonical customer attributes in Shopify metafields on the Customer resource. Keep heavy assets in object storage. ([Shopify][4], [Shopify Help Center][5])

Security patterns

* All storefront calls go through a Shopify App Proxy and are HMAC-verified. ([Shopify][6])
* Upload and download via short-lived presigned S3 URLs or POST forms. Never expose bucket credentials to the browser. ([AWS Documentation][7], [Boto3][8])
* Implement mandatory GDPR webhooks and purge customer data when required. ([Shopify][9])

## Repository map

Assumed layout. If paths differ, ask for confirmation and run a project scan.

* `app/rapso-app/` Shopify Remix app including Theme and Customer Account extensions
* `backend/` FastAPI API and queue orchestration
* `worker/` ML pipeline and provider abstraction
* `backend/prisma/schema.prisma` Database schema
* `plan.md` Guidance document. Not the source of truth.

## What to build first

Use this sequence unless instructed otherwise. Create one PR per step.

1. Customer data schema

* Prisma models:

  * `CustomerProfile` with `shop_domain`, `shop_customer_id`, `height_centimetres`, `active_model_run_id`, `last_updated_at`
  * `ModelRun` with `status` \[queued|running|succeeded|failed|replaced], `model_version`, asset keys, and optional `session_id` for guests
  * `GuestSession` identifying browser sessions
  * `Asset` for photos, mesh, preview
* Indices on `(shop_domain, shop_customer_id)`.
* Migration script and rollback notes.

2. Shopify metafield

* Define a Customer metafield `rapso.fit.profile` of type JSON.
* Write atomically after a successful run with `{ model_version, height_cm, updated_at, mesh_url, preview_url }`.
* Use Customer API metafield mutation with transactional semantics. ([Shopify][10])

3. API surfaces behind App Proxy

* Base path `/api/proxy/fit/*` with server-side HMAC verification.
* `POST /run` issues presigned POSTs for photos, enqueues `ModelRun`, returns `{ job_id }`.
* `GET /status?job_id=...` returns status and optional preview URL.
* `POST /save-height` persists height for logged-in users or session for guests.
* `POST /update` replaces the active model after confirmation.
* `POST /migrate-guest` migrates a session model to a logged-in customer without duplicates.
* Validate `Content-Type` and size on presigned policies. ([Shopify][6], [Boto3][8])

4. Worker abstraction

* `ModelProvider` interface in `worker/model_provider.py` with `prepare`, `run_job`, `status`, `fetch_artifacts`.
* `NullProvider` that produces a tiny valid GLB and preview for E2E flow.
* `pipeline.run_model_run(model_run_id)` downloads inputs via presigned GET, writes outputs, updates DB.

5. UX

* Theme App Extension modal: guest first-run flow and logged-in quick actions.
* Customer Account UI extension page “Fit Profile”: canonical management, history, height edit with double confirm.
* Use supported UI components where available, including upload drop zones in Customer Account context. ([Shopify][11])

6. Compliance and deletion

* Implement `customers/data_request`, `customers/redact`, and `shop/redact`. Map to deletion of S3 objects and DB rows. Provide a manual test runbook. ([Shopify][9])

## How to run, build, and test

Setup

* Do not guess toolchains. If Node, Python, or package managers are unspecified, pause and ask for versions, package managers, and whether Docker Compose profiles should be used.

Local commands

* Install dependencies and start services as defined in the repository scripts. If missing, add `make` targets and document them in this file.

Testing

* Add `backend/tests/test_fit_profile.py` covering guest vs logged-in, model replacement, metafield write, and HMAC rejection.
* Add Playwright tests for storefront modal states on PDP and flows in Customer Account.
* Include a seed script to simulate guest creation, account login migration, and a replacement run.

CI

* Lint, type-check, run unit tests, then run Playwright smoke tests on PRs.

## Security requirements

* App Proxy only for storefront to backend. Compute SHA-256 HMAC and compare the signature, reject mismatches. Log the failure without echoing request bodies. ([Shopify][6])
* Presigned S3 usage

  * Use presigned POST for uploads and short-lived presigned GET for downloads.
  * Constrain ACL, content type, size, and key prefix in the policy conditions.
  * Expirations should be minimal and aligned with credential lifetime. Prefer minutes, not hours. ([AWS Documentation][7])
* No raw media in the database. Store only object keys, sizes, hashes, and generated URLs with expiries. ([AWS Documentation][12])
* Encrypt S3 objects at rest and enable access logging where possible. Consider checksum verification tradeoffs with presigned uploads. ([AWS re\:Inforce][13])
* Fulfil GDPR mandatory topics, configured in the Partner Dashboard or app config, and verify with test actions in Admin. ([Shopify][14], [Shopify Community][15])

## Performance guidelines

* Direct browser-to-S3 uploads avoid routing large files through the API. ([AWS Documentation][16])
* Use background jobs for model processing and avoid long-running HTTP requests.
* Serve viewer assets via short-lived links and leverage CDN where appropriate.
* Avoid N+1 queries. Add indices on hot paths.

## UX guidelines

* Modern, simple, and clear. Avoid dense forms. Default to safe, reversible actions.
* PDP modal is for quick entry and status. The Customer Account page is the canonical management surface. ([Shopify][1])
* Height edits require a confirm dialog and optional short cooldown to reduce accidental changes.

## Coding standards

* Python: type hints, `ruff` or equivalent linting, pytest.
* TypeScript: strict mode, ESLint, Prettier. Avoid implicit any.
* Commit messages: imperative mood with scope tags.

## Observability

* Structured logging with request IDs. No PII.
* Minimal metrics: run counts, durations, error rates, queue depth.

## Clarifying questions the agent must ask before coding

1. Confirm Node and Python versions, package manager choices, and whether to run via Docker Compose profiles.
2. Confirm the object storage provider and bucket naming. Are we using AWS S3, Cloudflare R2, or another provider?
3. Confirm acceptable upload size limits and allowed content types for photos and generated meshes.
4. Confirm exact Customer metafield namespace and visibility.
5. Confirm whether to keep a limited history of `ModelRun` records and how long to retain assets.

## Acceptance criteria per feature

* Exactly one active model per logged-in customer.
* Guests can create one model per browser session and migrate it after login.
* Height stored in centimetres. Logged-in writes also update the Customer metafield atomically. ([Shopify][10])
* Presigned upload and download implemented with tight expiries and constraints. ([AWS Documentation][7])
* App Proxy HMAC checks are enforced on every storefront request. ([Shopify][6])
* GDPR webhooks purge customer data and assets as required. ([Shopify][9])
* Playwright smoke flows pass for guest, login migration, and replacement runs.

## References

* Customer Account UI extensions and components. ([Shopify][1])
* Theme App Extensions and deployment. ([Shopify][2])
* App Proxy and HMAC verification. ([Shopify][6])
* Metafields on Shopify and Customer APIs. ([Shopify][4])
* Privacy law compliance and mandatory GDPR topics. ([Shopify][9])
* S3 presigned URL and POST documentation, and best practices. ([AWS Documentation][7], [Boto3][8])


[1]: https://shopify.dev/docs/api/customer-account-ui-extensions?utm_source=chatgpt.com "Customer account UI extensions"
[2]: https://shopify.dev/docs/apps/build/online-store/theme-app-extensions?utm_source=chatgpt.com "About theme app extensions"
[3]: https://help.shopify.com/en/manual/online-store/themes/customizing-themes/apps?utm_source=chatgpt.com "Extend your theme with apps"
[4]: https://shopify.dev/docs/apps/build/custom-data?utm_source=chatgpt.com "About metafields and metaobjects"
[5]: https://help.shopify.com/en/manual/custom-data/metafields?utm_source=chatgpt.com "Metafields"
[6]: https://shopify.dev/docs/apps/build/online-store/display-dynamic-data?utm_source=chatgpt.com "Display dynamic store data with app proxies"
[7]: https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html?utm_source=chatgpt.com "Download and upload objects with presigned URLs"
[8]: https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/s3/client/generate_presigned_post.html?utm_source=chatgpt.com "generate_presigned_post - Boto3 1.40.23 documentation - AWS"
[9]: https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance?utm_source=chatgpt.com "Privacy law compliance"
[10]: https://shopify.dev/docs/api/customer/2024-10/objects/Metafield?utm_source=chatgpt.com "Metafield - Customer API"
[11]: https://shopify.dev/docs/api/customer-account-ui-extensions/2025-01/components?utm_source=chatgpt.com "Customer-account-ui-extensions components"
[12]: https://docs.aws.amazon.com/AmazonS3/latest/userguide/ShareObjectPreSignedURL.html?utm_source=chatgpt.com "Sharing objects with presigned URLs - AWS Documentation"
[13]: https://reinforce.awsevents.com/content/dam/reinforce/2024/slides/IAM321_Amazon-S3-presigned-URL-security.pdf?utm_source=chatgpt.com "Amazon S3 presigned URL security"
[14]: https://shopify.dev/docs/api/webhooks?utm_source=chatgpt.com "Webhooks"
[15]: https://community.shopify.com/t/how-to-test-if-gdpr-mandatory-webhooks-are-functioning/166644?utm_source=chatgpt.com "How to test if GDPR mandatory webhooks are functioning?"
[16]: https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html?utm_source=chatgpt.com "Uploading objects with presigned URLs"
