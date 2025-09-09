import time
from typing import Optional

from fastapi import FastAPI
from pydantic import BaseModel, HttpUrl
import httpx
import logging

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


@app.post("/process")
def process(req: ProcessRequest):
    # Simulate compute
    time.sleep(2)
    # Inform backend that job completed (if callback provided)
    if req.callback_url:
        try:
            r = httpx.post(
                str(req.callback_url),
                json={
                    "status": "completed",
                    "output_key": f"outputs/{req.job_id}.glb",
                },
                timeout=10.0,
            )
            logger.info("Callback to %s -> %s", req.callback_url, r.status_code)
        except Exception as e:
            logger.warning("Callback failed: %s", e)
    return {"ok": True, "job_id": req.job_id, "status": "processing"}
