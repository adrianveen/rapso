import ipaddress
import logging
import os
import socket
import tempfile
from typing import Optional
from urllib.parse import urlparse

import httpx
from fastapi import BackgroundTasks, FastAPI
from providers.silhouette_revolve import generate_glb_from_image as gen_silhouette
from pydantic import BaseModel, HttpUrl

# --- SSRF Protection ---
# Blocklist of private/internal IP ranges and cloud metadata endpoints
_BLOCKED_HOSTS = frozenset(
    [
        "localhost",
        "127.0.0.1",
        "::1",
        "0.0.0.0",
        "169.254.169.254",  # AWS/GCP/Azure metadata
        "metadata.google.internal",
        "metadata.goog",
    ]
)


def _is_private_ip(ip_str: str) -> bool:
    """Check if an IP address is private, loopback, link-local, or reserved."""
    try:
        ip = ipaddress.ip_address(ip_str)
        return (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
        )
    except ValueError:
        return False


def validate_url_safe(url: str) -> None:
    """Validate that a URL does not point to internal/private resources (SSRF protection).

    Raises ValueError if the URL targets a blocked or private host.
    """
    parsed = urlparse(url)
    host = parsed.hostname or ""

    # Block known dangerous hosts
    if host.lower() in _BLOCKED_HOSTS:
        raise ValueError(f"Blocked host: {host}")

    # Resolve hostname and check if it resolves to a private IP
    try:
        # Get all IP addresses for the host
        addrinfo = socket.getaddrinfo(host, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
        for family, socktype, proto, canonname, sockaddr in addrinfo:
            ip_str = sockaddr[0]
            if _is_private_ip(ip_str):
                raise ValueError(
                    f"Host {host} resolves to private/internal IP: {ip_str}"
                )
    except socket.gaierror:
        # If DNS resolution fails, allow the request to proceed
        # (will fail at the HTTP level with a clearer error)
        pass


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
    provider: Optional[str] = (
        None  # e.g., 'smplx_icon' | 'tripo' | 'external_api' | 'null'
    )


def _run_job(req: ProcessRequest):
    provider = (req.provider or "silhouette").lower()
    logger.info("Processing job %s with provider=%s", req.job_id, provider)
    out_key = f"outputs/{req.job_id}.glb"
    provider_used = None
    try:
        # SSRF validation: ensure input URL is not targeting internal resources
        validate_url_safe(str(req.input_url))

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
                    logger.warning(
                        "TripoSR provider failed, falling back to silhouette: %s", e
                    )
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
                    files = {
                        "file": (os.path.basename(out_key), f, "model/gltf-binary")
                    }
                    data = {"key": out_key}
                    with httpx.Client(timeout=600.0) as client:  # allow long uploads
                        ur = client.post(upload_url, files=files, data=data)
                        ur.raise_for_status()

        # Inform backend that job completed
        if req.callback_url:
            with httpx.Client(timeout=20.0) as client:
                r = client.post(
                    str(req.callback_url),
                    json={
                        "status": "completed",
                        "output_key": out_key,
                        "provider_used": provider_used or provider,
                    },
                )
                logger.info("Callback to %s -> %s", req.callback_url, r.status_code)
    except Exception as e:
        logger.exception("Job %s failed: %s", req.job_id, e)
        if req.callback_url:
            try:
                with httpx.Client(timeout=10.0) as client:
                    client.post(
                        str(req.callback_url),
                        json={"status": "failed", "error": str(e)},
                    )
            except Exception:
                pass


@app.post("/process")
def process(req: ProcessRequest, background_tasks: BackgroundTasks):
    # Run asynchronously to avoid backend request timeouts
    background_tasks.add_task(_run_job, req)
    return {"ok": True, "job_id": req.job_id, "status": "processing"}
