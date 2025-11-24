import logging
import os
import re
import shlex
import subprocess
import tempfile
from typing import Optional

import trimesh

logger = logging.getLogger("rapso-worker")


def _have_cli(cmd: list[str]) -> bool:
    try:
        subprocess.run(
            cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False
        )
        return True
    except Exception:
        return False


def generate_glb_from_image(
    input_image_path: str, output_glb_path: str, height_cm: Optional[float] = None
) -> None:
    """Attempt to run a TripoSR/SF3D-style pipeline to produce a GLB.

    Strategy:
    - If an environment variable `TRIPOSR_CMD` is set, invoke it as a CLI with -i/-o.
    - Else, try a few common entry points (python -m triposr.scripts.run, triposr)
    - If none are available, raise ImportError so the caller can fallback to a simpler provider.

    Expected CLI behaviour (examples):
      python -m scripts.run -i <img> -o <out_dir>  # TripoSR repo style
    We will write output to a temp dir and then pick a .glb result to move to `output_glb_path`.
    """
    # Figure out command
    env_cmd = os.environ.get("TRIPOSR_CMD")
    tried = []
    if env_cmd:
        # Use shlex for safe parsing; validate no shell metacharacters
        # Block common injection patterns: ; | & $ ` \ " ' < > ( ) { } [ ] ! ~
        if re.search(r'[;|&$`\\"<>(){}\[\]!~]', env_cmd):
            raise ValueError(
                f"TRIPOSR_CMD contains disallowed shell metacharacters: {env_cmd!r}"
            )
        cmd = shlex.split(env_cmd)
        if not cmd or not os.path.isabs(cmd[0]):
            raise ValueError(
                f"TRIPOSR_CMD must be an absolute path to an executable: {env_cmd!r}"
            )
        tried.append("TRIPOSR_CMD")
    else:
        # Common guesses
        candidates = [
            ["python3", "/opt/triposr/run.py"],
            ["python", "/opt/triposr/run.py"],
            ["python3", "-m", "scripts.run"],
            ["python", "-m", "scripts.run"],
            ["triposr"],
        ]
        cmd = None
        for c in candidates:
            if _have_cli(c):
                cmd = c
                break
        tried.extend(["python -m scripts.run", "triposr"])
        if cmd is None:
            raise ImportError(f"TripoSR CLI not found. Tried: {tried}")

    with tempfile.TemporaryDirectory() as td:
        out_dir = td
        # Build full command for upstream TripoSR CLI
        # TripoSR expects positional image path and flags for output dir and format.
        full = cmd + [
            input_image_path,
            "--output-dir",
            out_dir,
            "--model-save-format",
            "glb",
        ]
        logger.info("Running TripoSR: %s", " ".join(full))
        try:
            subprocess.run(full, check=True)
        except subprocess.CalledProcessError as e:
            raise RuntimeError(f"TripoSR failed: {e}")

        # Find a model file and ensure it's GLB; convert if needed.
        # TripoSR writes into subdirectories like <out_dir>/0/mesh.<ext>
        glb_path = None
        candidate_obj = None
        candidate_ply = None
        for root, dirs, files in os.walk(out_dir):
            for name in files:
                lower = name.lower()
                p = os.path.join(root, name)
                if lower.endswith(".glb"):
                    glb_path = p
                    break
                if lower.endswith(".obj") and candidate_obj is None:
                    candidate_obj = p
                if lower.endswith(".ply") and candidate_ply is None:
                    candidate_ply = p
            if glb_path:
                break
        if glb_path is None:
            src = candidate_obj or candidate_ply
            if src:
                logger.info("Converting %s to GLB via trimesh", os.path.basename(src))
                mesh = trimesh.load(src, force="mesh")
                glb_bytes = trimesh.exchange.gltf.export_glb(mesh.scene())
                with open(output_glb_path, "wb") as f:
                    f.write(glb_bytes)
                return
            raise FileNotFoundError("TripoSR produced no mesh we can convert to .glb")
        # Move to requested output path if GLB exists already
        os.replace(glb_path, output_glb_path)
