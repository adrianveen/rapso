import os
import time
from typing import Optional

from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel, HttpUrl
import httpx
import logging
import tempfile
from urllib.parse import urlparse

from providers.silhouette_revolve import generate_glb_from_image as gen_silhouette
try:
    from providers.triposr import generate_glb_from_image as gen_triposr
except Exception:  # ImportError or other
    gen_triposr = None  # optional

app = FastAPI()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("rapso-worker")


@app.get("/healthz")
def healthz():
    return {"worker": "ok"}


class ProcessRequest(BaseModel):
    job_id: str
    input_url: HttpUrl
    height_cm: Optional[float] = None
    callback_url: Optional[HttpUrl] = None
    provider: Optional[str] = None  # e.g., 'smplx_icon' | 'tripo' | 'external_api' | 'null'


def _run_job(req: ProcessRequest):
    provider = (req.provider or "silhouette").lower()
    logger.info("Processing job %s with provider=%s", req.job_id, provider)
    out_key = f"outputs/{req.job_id}.glb"
    provider_used = None
    try:
        with tempfile.TemporaryDirectory() as td:
            in_path = os.path.join(td, "input.jpg")
            out_path = os.path.join(td, "output.glb")
            with httpx.Client(timeout=300.0) as client:  # allow long input downloads
                r = client.get(str(req.input_url))
                r.raise_for_status()
                with open(in_path, "wb") as f:
                    f.write(r.content)

            # Run provider (prefer TripoSR if requested and available)
            if provider in {"triposr", "sf3d"} and gen_triposr is not None:
                try:
                    gen_triposr(in_path, out_path, req.height_cm)
                    provider_used = "triposr"
                except Exception as e:
                    logger.warning("TripoSR provider failed, falling back to silhouette: %s", e)
                    gen_silhouette(in_path, out_path, req.height_cm)
                    provider_used = "silhouette"
            else:
                gen_silhouette(in_path, out_path, req.height_cm)
                provider_used = "silhouette"

            # Upload GLB to backend dev endpoint (derive from callback_url base)
            if req.callback_url:
                cb = urlparse(str(req.callback_url))
                base = f"{cb.scheme}://{cb.netloc}"
                upload_url = f"{base}/dev/upload"
                with open(out_path, "rb") as f:
                    files = {"file": (os.path.basename(out_key), f, "model/gltf-binary")}
                    data = {"key": out_key}
                    with httpx.Client(timeout=600.0) as client:  # allow long uploads
                        ur = client.post(upload_url, files=files, data=data)
                        ur.raise_for_status()

        # Inform backend that job completed
        if req.callback_url:
            with httpx.Client(timeout=20.0) as client:
                r = client.post(
                    str(req.callback_url),
                    json={"status": "completed", "output_key": out_key, "provider_used": provider_used or provider},
                )
                logger.info("Callback to %s -> %s", req.callback_url, r.status_code)
    except Exception as e:
        logger.exception("Job %s failed: %s", req.job_id, e)
        if req.callback_url:
            try:
                with httpx.Client(timeout=10.0) as client:
                    client.post(str(req.callback_url), json={"status": "failed", "error": str(e)})
            except Exception:
                pass


@app.post("/process")
def process(req: ProcessRequest, background_tasks: BackgroundTasks):
    # Run asynchronously to avoid backend request timeouts
    background_tasks.add_task(_run_job, req)
    return {"ok": True, "job_id": req.job_id, "status": "processing"}
