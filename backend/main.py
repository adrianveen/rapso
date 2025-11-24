import logging
import os
import secrets
import time
import uuid
from datetime import datetime, timezone
from typing import Optional

# Optional S3 (R2-compatible) client
import boto3
import httpx
from botocore.client import Config
from dotenv import load_dotenv
from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, field_validator
from sqlalchemy import Column, DateTime, Float, String, Text, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("rapso-backend")

app = FastAPI()

# --- API Key Authentication ---
# Set BACKEND_API_KEY env var to enable authentication. In production, this should always be set.
BACKEND_API_KEY = os.getenv("BACKEND_API_KEY")
# Endpoints that don't require API key auth (health checks, asset serving)
_PUBLIC_PATHS = frozenset(["/healthz", "/assets"])


def _path_is_public(path: str) -> bool:
    """Check if a request path is public (no auth required)."""
    if path in _PUBLIC_PATHS:
        return True
    # Allow asset paths under /assets/*
    if path.startswith("/assets/"):
        return True
    return False


async def verify_api_key(request: Request):
    """Dependency that verifies API key for protected endpoints."""
    if not BACKEND_API_KEY:
        # Auth disabled (dev mode warning)
        return

    if _path_is_public(request.url.path):
        return

    api_key = request.headers.get("x-api-key") or request.headers.get("X-API-Key")
    if not api_key:
        raise HTTPException(status_code=401, detail="Missing API key")

    # Timing-safe comparison
    if not secrets.compare_digest(api_key, BACKEND_API_KEY):
        raise HTTPException(status_code=401, detail="Invalid API key")


# CORS: allow app origin in dev
allowed_origins = [
    os.getenv("APP_ORIGIN", "http://localhost:3000"),
    os.getenv("SHOPIFY_APP_URL", "http://localhost:3000"),
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins + ["http://127.0.0.1:3000", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-API-Key", "X-Callback-Secret"],
)


@app.get("/healthz")
def healthz():
    worker_status = None
    if WORKER_URL:
        try:
            with httpx.Client(timeout=5.0) as client:
                r = client.get(f"{WORKER_URL}/healthz")
                if r.status_code == 200 and r.json().get("worker") == "ok":
                    worker_status = "ok"
                else:
                    worker_status = f"bad:{r.status_code}"
        except Exception as e:
            worker_status = f"error:{type(e).__name__}"
    return {
        "ok": True,
        "storage": "s3" if _s3 else "local",
        "worker": worker_status,
    }


# --- Storage setup (R2 / S3 or local fallback) ---
USE_S3 = os.getenv("USE_S3", "false").lower() in ("1", "true", "yes")
S3_BUCKET = os.getenv("S3_BUCKET")
S3_ENDPOINT = os.getenv("S3_ENDPOINT")
S3_ACCESS_KEY = os.getenv("S3_ACCESS_KEY")
S3_SECRET_KEY = os.getenv("S3_SECRET_KEY")
S3_REGION = os.getenv("S3_REGION", "auto")
WORKER_URL = os.getenv("WORKER_URL")
MODEL_PROVIDER = os.getenv("MODEL_PROVIDER", "smplx_icon")
BACKEND_INTERNAL_URL = os.getenv("BACKEND_INTERNAL_URL", "http://backend:8000")
APP_CALLBACK_URL = os.getenv("APP_CALLBACK_URL")
MODEL_CALLBACK_SECRET = os.getenv("MODEL_CALLBACK_SECRET")
DELETE_INPUTS_ON_SUCCESS = os.getenv("DELETE_INPUTS_ON_SUCCESS", "false").lower() in (
    "1",
    "true",
    "yes",
)
# Fail-safe completion delay (seconds). Set to 0 to disable.
# Default: if WORKER_URL is set, disable fail-safe; else use 12s for dev simulator.
JOB_FAILSAFE_SECONDS = int(
    os.getenv("JOB_FAILSAFE_SECONDS", "0" if WORKER_URL else "12")
)
STATIC_DIR = os.getenv("STATIC_DIR", os.path.join(os.getcwd(), "data"))
os.makedirs(STATIC_DIR, exist_ok=True)

_s3 = None
if USE_S3 and S3_BUCKET and S3_ACCESS_KEY and S3_SECRET_KEY and S3_ENDPOINT:
    _s3 = boto3.client(
        "s3",
        endpoint_url=S3_ENDPOINT,
        aws_access_key_id=S3_ACCESS_KEY,
        aws_secret_access_key=S3_SECRET_KEY,
        region_name=S3_REGION,
        config=Config(signature_version="s3v4"),
    )


def _make_key(*parts: str) -> str:
    return "/".join([p.strip("/") for p in parts])


def put_object(key: str, data: bytes, content_type: str) -> str:
    if _s3:
        try:
            _s3.put_object(
                Bucket=S3_BUCKET, Key=key, Body=data, ContentType=content_type
            )
            return f"s3://{S3_BUCKET}/{key}"
        except Exception as e:
            logger.warning("S3 put_object failed, falling back to local storage: %s", e)
    # local fallback
    path = os.path.join(STATIC_DIR, key)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)
    return f"local://{path}"


def delete_object(key: str) -> None:
    """Delete an object by key from storage (S3/R2 or local)."""
    if not key:
        return
    if _s3:
        try:
            _s3.delete_object(Bucket=S3_BUCKET, Key=key)
            return
        except Exception as e:
            logger.warning(
                "S3 delete_object failed, falling back to local delete: %s", e
            )
    # local fallback
    path = os.path.join(STATIC_DIR, key)
    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception as e:
        logger.warning("Local delete failed for %s: %s", path, e)


def presign_url(key: str, expires: int = 3600) -> Optional[str]:
    if _s3:
        try:
            return _s3.generate_presigned_url(
                ClientMethod="get_object",
                Params={"Bucket": S3_BUCKET, "Key": key},
                ExpiresIn=expires,
            )
        except Exception as e:
            logger.warning("S3 presign failed, falling back to local assets: %s", e)
    # Local fallback: expose via a simple assets path
    path = os.path.join(STATIC_DIR, key)
    if os.path.exists(path):
        # This is a dev-only URL; in prod, serve from a CDN or file server
        return f"/assets/{key}"
    return None


# --- SQLite persistence (no-cost) ---
DB_PATH = os.getenv("SQLITE_PATH", os.path.join(STATIC_DIR, "dev.sqlite"))
engine = create_engine(
    f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False}
)
# Keep attributes available after commit to avoid DetachedInstanceError when accessed
# outside the session context (e.g., after a `with SessionLocal()` block).
SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)
Base = declarative_base()


class JobORM(Base):
    __tablename__ = "jobs"
    id = Column(String, primary_key=True)
    status = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False)
    input_key = Column(String)
    output_key = Column(String)
    height_cm = Column(Float)
    error = Column(Text)


class AssetORM(Base):
    __tablename__ = "assets"
    object_key = Column(String, primary_key=True)
    kind = Column(String)  # photo | mesh
    created_at = Column(DateTime, nullable=False)


Base.metadata.create_all(engine)


def _simulate_worker(job_id: str):
    # Simulate processing delay
    time.sleep(2)
    # Mark as completed; real worker would write output to storage
    with SessionLocal() as db:
        job = db.get(JobORM, job_id)
        if not job:
            return
        job.status = "completed"
        job.output_key = _make_key("outputs", f"{job_id}.glb")
        db.add(job)
        db.commit()
    if not _s3:
        _ensure_placeholder_glb(job.output_key)
    # Best-effort cleanup of input on success
    if DELETE_INPUTS_ON_SUCCESS:
        try:
            if job.input_key:
                delete_object(job.input_key)
        except Exception:
            pass
    _forward_app_callback(job_id, job.output_key)


def _ensure_placeholder_glb(key: str):
    """Ensure a valid .glb exists at the given storage key in local mode.

    Tries a bundled file, then downloads a small sample glb from trusted sources.
    """
    path = os.path.join(STATIC_DIR, key)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.exists(path):
        return
    # Try local asset (if provided)
    here = os.path.dirname(os.path.abspath(__file__))
    local_asset = os.path.join(here, "assets", "placeholder.glb")
    try:
        if os.path.exists(local_asset):
            with open(local_asset, "rb") as f:
                data = f.read()
            put_object(key, data, content_type="model/gltf-binary")
            return
    except Exception:
        pass
    # Try remote small sample models
    candidates = [
        "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Box/glTF-Binary/Box.glb",
        "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/BoxTextured/glTF-Binary/BoxTextured.glb",
        "https://modelviewer.dev/shared-assets/models/Astronaut.glb",
    ]
    for url in candidates:
        try:
            with httpx.Client(timeout=20.0) as client:
                r = client.get(url)
                if r.status_code == 200 and r.content:
                    put_object(key, r.content, content_type="model/gltf-binary")
                    return
        except Exception:
            continue
    # Ultimate fallback: write a file header-like bytes (may not render)
    try:
        put_object(key, b"glTF", content_type="model/gltf-binary")
    except Exception:
        pass


def _enqueue_worker(job_id: str, input_key: str, height_cm: Optional[float]):
    if not WORKER_URL:
        logger.info("WORKER_URL not set; using simulator")
        _simulate_worker(job_id)
        return
    # Build input URL accessible from the worker container
    if _s3:
        input_url = presign_url(input_key)
    else:
        input_url = f"{BACKEND_INTERNAL_URL}/assets/{input_key}"
    callback_url = f"{BACKEND_INTERNAL_URL}/jobs/{job_id}/callback"
    try:
        with httpx.Client(timeout=30.0) as client:
            client.post(
                f"{WORKER_URL}/process",
                json={
                    "job_id": job_id,
                    "input_url": input_url,
                    "height_cm": height_cm,
                    "callback_url": callback_url,
                    "provider": MODEL_PROVIDER,
                },
            )
        # Mark as processing while worker runs
        with SessionLocal() as db:
            job = db.get(JobORM, job_id)
            if job:
                job.status = "processing"
                db.add(job)
                db.commit()
    except Exception as e:
        logger.warning("Failed to enqueue worker; fallback to simulator: %s", e)
        _simulate_worker(job_id)


def _fail_safe(job_id: str, delay_seconds: int = 12):
    """If the job is stuck in queued/processing past a short delay, finalize it.

    Dev convenience to avoid dangling jobs if callback fails.
    """
    time.sleep(delay_seconds)
    with SessionLocal() as db:
        job = db.get(JobORM, job_id)
        if not job:
            return
        if job.status in {"queued", "processing"}:
            logger.warning("Fail-safe completing job %s due to timeout", job_id)
            job.status = "completed"
            if not job.output_key:
                job.output_key = _make_key("outputs", f"{job.id}.glb")
                if not _s3:
                    placeholder = b"placeholder glb content (replace with real .glb)"
                    put_object(
                        job.output_key, placeholder, content_type="model/gltf-binary"
                    )
            db.add(job)
            db.commit()


def _maybe_delete_input(input_key: Optional[str]):
    """Delete input object if configured to do so."""
    if not DELETE_INPUTS_ON_SUCCESS:
        return
    if input_key:
        delete_object(input_key)


# Height validation constants
HEIGHT_MIN_CM = 50.0
HEIGHT_MAX_CM = 300.0


def validate_height_cm(height_cm: Optional[float]) -> Optional[float]:
    """Validate height is within acceptable range (50-300 cm)."""
    if height_cm is None:
        return None
    if not (HEIGHT_MIN_CM <= height_cm <= HEIGHT_MAX_CM):
        raise ValueError(
            f"Height must be between {HEIGHT_MIN_CM} and {HEIGHT_MAX_CM} cm"
        )
    return height_cm


@app.post("/uploads", dependencies=[Depends(verify_api_key)])
async def create_upload(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    height_cm: Optional[float] = Form(default=None),
    customer_id: Optional[str] = Form(default=None),
):
    # Validate height
    try:
        height_cm = validate_height_cm(height_cm)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)

    # Save input
    raw = await file.read()
    job_id = str(uuid.uuid4())
    input_key = _make_key("inputs", f"{job_id}_{file.filename}")
    put_object(
        input_key, raw, content_type=file.content_type or "application/octet-stream"
    )

    # Create job
    with SessionLocal() as db:
        db.add(
            AssetORM(
                object_key=input_key,
                kind="photo",
                created_at=datetime.now(timezone.utc),
            )
        )
        db.add(
            JobORM(
                id=job_id,
                status="queued",
                created_at=datetime.now(timezone.utc),
                input_key=input_key,
                height_cm=height_cm,
            )
        )
        db.commit()

    # Simulate processing (replace with call to worker service)
    # Dispatch to worker if configured; else simulate
    background_tasks.add_task(_enqueue_worker, job_id, input_key, height_cm)
    # Optional fail-safe (disabled by default when worker is configured)
    if JOB_FAILSAFE_SECONDS > 0:
        background_tasks.add_task(_fail_safe, job_id, JOB_FAILSAFE_SECONDS)

    return JSONResponse({"job_id": job_id, "status": "queued"})


@app.get("/jobs/{job_id}", dependencies=[Depends(verify_api_key)])
def get_job(job_id: str):
    with SessionLocal() as db:
        job = db.get(JobORM, job_id)
        if not job:
            return JSONResponse({"error": "not_found"}, status_code=404)
    # In local mode, ensure a placeholder exists for completed jobs
    if job.output_key and not _s3 and job.status == "completed":
        path = os.path.join(STATIC_DIR, job.output_key)
        if not os.path.exists(path):
            placeholder = b"placeholder glb content (replace with real .glb)"
            put_object(job.output_key, placeholder, content_type="model/gltf-binary")
    output_url = None
    if job.output_key:
        output_url = presign_url(job.output_key)
    return {
        "id": job.id,
        "status": job.status,
        "created_at": job.created_at.isoformat(),
        "output_url": output_url,
    }


@app.post("/jobs/{job_id}/callback", dependencies=[Depends(verify_api_key)])
def job_callback(job_id: str, payload: dict):
    with SessionLocal() as db:
        job = db.get(JobORM, job_id)
        if not job:
            return JSONResponse({"error": "not_found"}, status_code=404)
        status = payload.get("status")
        job.status = status or job.status
        job.error = payload.get("error")
        output_key = payload.get("output_key")
        if output_key:
            job.output_key = output_key
            # Idempotent insert: only add asset if it doesn't already exist
            if not db.get(AssetORM, output_key):
                db.add(
                    AssetORM(
                        object_key=output_key,
                        kind="mesh",
                        created_at=datetime.now(timezone.utc),
                    )
                )
        db.add(job)
        db.commit()
    if job.status == "completed":
        if not job.output_key:
            job.output_key = _make_key("outputs", f"{job.id}.glb")
        if not _s3:
            _ensure_placeholder_glb(job.output_key)
        # Best-effort cleanup of input on success
        try:
            _maybe_delete_input(job.input_key)
        except Exception:
            pass
    _forward_app_callback(job_id, job.output_key)
    return {"ok": True}


def _forward_app_callback(job_id: str, output_key: Optional[str]):
    if not APP_CALLBACK_URL or not MODEL_CALLBACK_SECRET:
        return
    try:
        with httpx.Client(timeout=20.0) as client:
            client.post(
                f"{APP_CALLBACK_URL.rstrip('/')}/internal/model-run-callback",
                json={
                    "job_id": job_id,
                    "status": "completed",
                    "output_key": output_key,
                },
                headers={"X-Callback-Secret": MODEL_CALLBACK_SECRET},
            )
    except Exception as e:
        logger.warning("Failed to forward app callback: %s", e)


class PresignRequest(BaseModel):
    files: list[dict]


@app.post("/presign", dependencies=[Depends(verify_api_key)])
def presign(req: PresignRequest):
    uploads = []
    for f in req.files:
        name = f.get("name") or "file"
        key = _make_key("inputs", f"{uuid.uuid4()}_{name}")
        if _s3 and USE_S3:
            try:
                post = _s3.generate_presigned_post(
                    Bucket=S3_BUCKET,
                    Key=key,
                    Fields={
                        "Content-Type": f.get("contentType")
                        or "application/octet-stream"
                    },
                    Conditions=[
                        ["content-length-range", 1, int(f.get("size") or 10_000_000)]
                    ],
                    ExpiresIn=3600,
                )
                uploads.append(
                    {
                        "object_key": key,
                        "url": post["url"],
                        "fields": post["fields"],
                    }
                )
                continue
            except Exception as e:
                logger.warning("S3 presign failed, falling back to dev upload: %s", e)
        # Dev/local fallback: upload via backend
        uploads.append(
            {
                "object_key": key,
                "dev": True,
                "url": "/dev/upload",
                "fields": {"key": key},
            }
        )
    return {"uploads": uploads}


@app.post("/dev/upload", dependencies=[Depends(verify_api_key)])
async def dev_upload(file: UploadFile = File(...), key: str = Form(...)):
    raw = await file.read()
    put_object(key, raw, content_type=file.content_type or "application/octet-stream")
    try:
        with SessionLocal() as db:
            db.add(
                AssetORM(
                    object_key=key, kind="photo", created_at=datetime.now(timezone.utc)
                )
            )
            db.commit()
    except Exception:
        pass
    return {"ok": True, "object_key": key}


class EnqueueRequest(BaseModel):
    job_id: str
    input_key: str
    height_cm: Optional[float] = None

    @field_validator("height_cm")
    @classmethod
    def validate_height(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and not (HEIGHT_MIN_CM <= v <= HEIGHT_MAX_CM):
            raise ValueError(
                f"height_cm must be between {HEIGHT_MIN_CM} and {HEIGHT_MAX_CM}"
            )
        return v


@app.post("/enqueue", dependencies=[Depends(verify_api_key)])
def enqueue_job(req: EnqueueRequest, background_tasks: BackgroundTasks):
    # Idempotent create-or-update behaviour
    dispatch = False
    with SessionLocal() as db:
        job = db.get(JobORM, req.job_id)
        if job:
            # Update mutable fields if provided
            changed = False
            if req.input_key and job.input_key != req.input_key:
                job.input_key = req.input_key
                changed = True
            if req.height_cm is not None and job.height_cm != req.height_cm:
                job.height_cm = req.height_cm
                changed = True
            # Decide whether to (re)dispatch
            if job.status in {"failed"}:
                job.status = "queued"
                changed = True
                dispatch = True
            elif job.status in {"queued"}:
                # Already queued; no duplicate dispatch
                dispatch = False
            elif job.status in {"processing"}:
                dispatch = False
            elif job.status in {"completed"}:
                dispatch = False
            if changed:
                db.add(job)
                db.commit()
        else:
            job = JobORM(
                id=req.job_id,
                status="queued",
                created_at=datetime.now(timezone.utc),
                input_key=req.input_key,
                height_cm=req.height_cm,
            )
            db.add(job)
            db.commit()
            dispatch = True
    if dispatch:
        background_tasks.add_task(
            _enqueue_worker, req.job_id, req.input_key, req.height_cm
        )
        if JOB_FAILSAFE_SECONDS > 0:
            background_tasks.add_task(_fail_safe, req.job_id, JOB_FAILSAFE_SECONDS)
    return {"job_id": req.job_id, "status": job.status}


# Dev-only static file serving for local storage
from fastapi.staticfiles import StaticFiles

assets_root = os.path.join(STATIC_DIR)
os.makedirs(assets_root, exist_ok=True)
app.mount("/assets", StaticFiles(directory=assets_root), name="assets")
