# backend

This directory is reserved for the Python FastAPI service.  The backend receives image uploads from the app, triggers inference jobs, and stores results.  It also implements Shopify OAuth, webhook receivers, and endpoints for retrieving avatars and fit metrics.

Suggested structure:

* `main.py` – Entry point defining FastAPI routes for uploads, webhooks, and job status.
* `tasks.py` – Functions for enqueuing and processing inference tasks (e.g. using Celery or RQ).
* `models/` – Pydantic models for request/response schemas, database ORM models, and SMPL parameters.
* `utils/` – Helper functions for authentication, storage (e.g. AWS S3), and data conversion.

You may want to use [Uvicorn](https://www.uvicorn.org/) for serving the app and [Pydantic](https://docs.pydantic.dev/) for data validation.  For asynchronous task execution, consider Celery with Redis or RQ.
