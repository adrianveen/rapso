# worker

This directory is intended for the inference service that performs the heavy lifting of 3D reconstruction and garment fitting.  It is expected to run on a machine with GPU acceleration and will be responsible for:

* Running a monocular 3D reconstruction pipeline (e.g. PIFuHD) to produce an initial mesh from a single photo.
* Fitting a parametric body model such as SMPL or SMPL‑X to the reconstructed mesh to obtain a consistent rig.
* Applying pre‑computed garment deformations to the body mesh to visualise fit and generate tightness and length metrics.
* Saving meshes and fit maps in a format consumable by the front‑end (e.g. glTF/GLB plus metadata JSON).

This service should expose a simple API (HTTP or message queue consumer) that accepts a job identifier and input data, performs inference, and returns results or stores them where the backend can retrieve them.
