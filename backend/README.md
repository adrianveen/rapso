# backend

This directory is reserved for the Python FastAPI service.  The backend receives image uploads from the app, triggers inference jobs, and stores results.  It also implements Shopify OAuth, webhook receivers, and endpoints for retrieving avatars and fit metrics.

Suggested structure:

* `main.py` – Entry point defining FastAPI routes for uploads, webhooks, and job status.
* `tasks.py` – Functions for enqueuing and processing inference tasks (e.g. using Celery or RQ).
* `models/` – Pydantic models for request/response schemas, database ORM models, and SMPL parameters.
* `utils/` – Helper functions for authentication, storage (e.g. AWS S3), and data conversion.

You may want to use [Uvicorn](https://www.uvicorn.org/) for serving the app and [Pydantic](https://docs.pydantic.dev/) for data validation.  For asynchronous task execution, consider Celery with Redis or RQ.

## Local storage and secrets

- Storage root: The backend writes uploads and generated assets under `STATIC_DIR` (defaults to `backend/data/`). To keep user data out of your repo, either:
  - Set `STATIC_DIR` in `backend/.env` to a path outside the repository, e.g. `/var/rapso/data`, or
  - Rely on the included ignore rules: `backend/data/` is git-ignored at the repo root and in `backend/.gitignore`.

- Environment files: `.env` files are git-ignored globally (`*.env`). Do not commit API keys or secrets. Provide example files as `*.env.example` if needed.

- Object storage: In production, prefer S3/R2 by setting `USE_S3=true` and the related `S3_*` variables. This avoids persisting PII on local disks.
