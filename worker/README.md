# worker

This directory is intended for the inference service that performs the heavy lifting of 3D reconstruction and garment fitting.  It is expected to run on a machine with GPU acceleration and will be responsible for:

* Running a monocular 3D reconstruction pipeline (e.g. PIFuHD) to produce an initial mesh from a single photo.
* Fitting a parametric body model such as SMPL or SMPL‑X to the reconstructed mesh to obtain a consistent rig.
* Applying pre‑computed garment deformations to the body mesh to visualise fit and generate tightness and length metrics.
* Saving meshes and fit maps in a format consumable by the front‑end (e.g. glTF/GLB plus metadata JSON).

This service should expose a simple API (HTTP or message queue consumer) that accepts a job identifier and input data, performs inference, and returns results or stores them where the backend can retrieve them.

## Providers

- silhouette (default): lightweight demo using MediaPipe Selfie Segmentation and a surface-of-revolution to export `.glb`.
- triposr (optional): integrates a single-image→3D reconstruction model. The worker will try to run a TripoSR-style CLI if available, else it falls back to `silhouette`.

To enable TripoSR:

1) Install dependencies in the GPU worker image (optional):

```
# In worker/Dockerfile.gpu, uncomment the TripoSR install line and rebuild
# RUN python3 -m pip install --no-cache-dir git+https://github.com/VAST-AI-Research/TripoSR.git
```

2) Set environment variables:

```
# backend/.env
MODEL_PROVIDER=triposr

# worker/.env (or bake into Dockerfile)
# TRIPOSR_CMD tells the worker how to invoke your TripoSR CLI
# If you used the Dockerfile clone path:
TRIPOSR_CMD="python /opt/triposr/scripts/run.py"
```

If `TRIPOSR_CMD` is unset or the CLI cannot be found, the provider gracefully falls back to the silhouette demo.
