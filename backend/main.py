import os
import uuid
import time
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from dotenv import load_dotenv

# Optional S3 (R2-compatible) client
import boto3
from botocore.client import Config
from sqlalchemy import create_engine, Column, String, DateTime, Float, Text
from sqlalchemy.orm import sessionmaker, declarative_base
import logging
import httpx

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("rapso-backend")

app = FastAPI()

# CORS: allow app origin in dev
allowed_origins = [
    os.getenv("APP_ORIGIN", "http://localhost:3000"),
    os.getenv("SHOPIFY_APP_URL", "http://localhost:3000"),
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins + ["http://127.0.0.1:3000", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
            _s3.put_object(Bucket=S3_BUCKET, Key=key, Body=data, ContentType=content_type)
            return f"s3://{S3_BUCKET}/{key}"
        except Exception as e:
            logger.warning("S3 put_object failed, falling back to local storage: %s", e)
    # local fallback
    path = os.path.join(STATIC_DIR, key)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)
    return f"local://{path}"


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
engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
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
                    put_object(job.output_key, placeholder, content_type="model/gltf-binary")
            db.add(job)
            db.commit()


@app.post("/uploads")
async def create_upload(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    height_cm: Optional[float] = Form(default=None),
    customer_id: Optional[str] = Form(default=None),
):
    # Save input
    raw = await file.read()
    job_id = str(uuid.uuid4())
    input_key = _make_key("inputs", f"{job_id}_{file.filename}")
    put_object(input_key, raw, content_type=file.content_type or "application/octet-stream")

    # Create job
    with SessionLocal() as db:
        db.add(AssetORM(object_key=input_key, kind="photo", created_at=datetime.now(timezone.utc)))
        db.add(JobORM(id=job_id, status="queued", created_at=datetime.now(timezone.utc), input_key=input_key, height_cm=height_cm))
        db.commit()

    # Simulate processing (replace with call to worker service)
    # Dispatch to worker if configured; else simulate
    background_tasks.add_task(_enqueue_worker, job_id, input_key, height_cm)
    # Add a small fail-safe so dev never hangs
    background_tasks.add_task(_fail_safe, job_id)

    return JSONResponse({"job_id": job_id, "status": job.status})


@app.get("/jobs/{job_id}")
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


@app.post("/jobs/{job_id}/callback")
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
            db.add(AssetORM(object_key=output_key, kind="mesh", created_at=datetime.now(timezone.utc)))
        db.add(job)
        db.commit()
    if job.status == "completed":
        if not job.output_key:
            job.output_key = _make_key("outputs", f"{job.id}.glb")
        if not _s3:
            _ensure_placeholder_glb(job.output_key)
    _forward_app_callback(job_id, job.output_key)
    return {"ok": True}


def _forward_app_callback(job_id: str, output_key: Optional[str]):
    if not APP_CALLBACK_URL or not MODEL_CALLBACK_SECRET:
        return
    try:
        with httpx.Client(timeout=20.0) as client:
            client.post(
                f"{APP_CALLBACK_URL.rstrip('/')}/internal/model-run-callback",
                json={"job_id": job_id, "status": "completed", "output_key": output_key},
                headers={"X-Callback-Secret": MODEL_CALLBACK_SECRET},
            )
    except Exception as e:
        logger.warning("Failed to forward app callback: %s", e)


class PresignRequest(BaseModel):
    files: list[dict]


@app.post("/presign")
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
                    Fields={"Content-Type": f.get("contentType") or "application/octet-stream"},
                    Conditions=[["content-length-range", 1, int(f.get("size") or 10_000_000)]],
                    ExpiresIn=3600,
                )
                uploads.append({
                    "object_key": key,
                    "url": post["url"],
                    "fields": post["fields"],
                })
                continue
            except Exception as e:
                logger.warning("S3 presign failed, falling back to dev upload: %s", e)
        # Dev/local fallback: upload via backend
        uploads.append({
            "object_key": key,
            "dev": True,
            "url": "/dev/upload",
            "fields": {"key": key},
        })
    return {"uploads": uploads}


@app.post("/dev/upload")
async def dev_upload(file: UploadFile = File(...), key: str = Form(...)):
    raw = await file.read()
    put_object(key, raw, content_type=file.content_type or "application/octet-stream")
    try:
        with SessionLocal() as db:
            db.add(AssetORM(object_key=key, kind="photo", created_at=datetime.now(timezone.utc)))
            db.commit()
    except Exception:
        pass
    return {"ok": True, "object_key": key}


class EnqueueRequest(BaseModel):
    job_id: str
    input_key: str
    height_cm: Optional[float] = None


@app.post("/enqueue")
def enqueue_job(req: EnqueueRequest, background_tasks: BackgroundTasks):
    with SessionLocal() as db:
        db.add(JobORM(id=req.job_id, status="queued", created_at=datetime.now(timezone.utc), input_key=req.input_key, height_cm=req.height_cm))
        db.commit()
    background_tasks.add_task(_enqueue_worker, req.job_id, req.input_key, req.height_cm)
    background_tasks.add_task(_fail_safe, req.job_id)
    return {"job_id": req.job_id, "status": "queued"}


# Dev-only static file serving for local storage
from fastapi.staticfiles import StaticFiles

assets_root = os.path.join(STATIC_DIR)
os.makedirs(assets_root, exist_ok=True)
app.mount("/assets", StaticFiles(directory=assets_root), name="assets")
