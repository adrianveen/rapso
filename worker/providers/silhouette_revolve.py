import io
import math
from typing import Tuple

import numpy as np
from PIL import Image
import mediapipe as mp
import trimesh
from scipy.ndimage import binary_opening, binary_closing


def _segment_person(img_rgb: np.ndarray) -> np.ndarray:
    """Return a binary mask (uint8 0/255) for the person using MediaPipe SelfieSegmentation.

    Args:
        img_rgb: HxWx3 RGB image as numpy array (uint8).
    """
    with mp.solutions.selfie_segmentation.SelfieSegmentation(model_selection=1) as seg:
        res = seg.process(img_rgb)
        mask_bool = (res.segmentation_mask >= 0.5)
    # Morphological clean up (opening then closing)
    kernel = np.ones((5, 5), dtype=bool)
    mask_bool = binary_opening(mask_bool, structure=kernel)
    mask_bool = binary_closing(mask_bool, structure=kernel)
    mask = (mask_bool.astype(np.uint8) * 255)
    return mask


def _profile_from_mask(mask: np.ndarray, num_slices: int = 96) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Compute silhouette half-width profile per row and normalize.

    Returns tuple of (ys_norm, half_widths_px, bbox) where bbox=(ymin,ymax,xmin,xmax).
    """
    h, w = mask.shape
    ys = np.linspace(0, h - 1, num_slices).astype(np.int32)
    half_widths = []
    xmin_all, xmax_all, ymin_all, ymax_all = w, 0, h, 0
    for y in ys:
        row = mask[y]
        xs = np.where(row > 0)[0]
        if xs.size:
            xmin, xmax = int(xs.min()), int(xs.max())
            xmin_all = min(xmin_all, xmin)
            xmax_all = max(xmax_all, xmax)
            ymin_all = min(ymin_all, y)
            ymax_all = max(ymax_all, y)
            half_widths.append((xmax - xmin) / 2.0)
        else:
            half_widths.append(0.0)
    half_widths = np.array(half_widths, dtype=np.float32)
    bbox = (ymin_all, ymax_all, xmin_all, xmax_all)
    # Avoid degenerate bbox
    if ymax_all <= ymin_all or xmax_all <= xmin_all:
        bbox = (0, h - 1, 0, w - 1)
    ys_norm = (ys - bbox[0]) / max(1.0, (bbox[1] - bbox[0]))
    return ys_norm, half_widths, bbox


def _mesh_from_profile(ys_norm: np.ndarray, half_widths_px: np.ndarray, bbox: Tuple[int, int, int, int],
                       image_width: int, height_cm: float | None,
                       radial_segments: int = 48) -> trimesh.Trimesh:
    """Revolve the 2D silhouette profile around the vertical axis to create a coarse body mesh.

    Height scaling: scale Y dimension to height_cm (metres). Radii are scaled so that the
    maximum observed half-width maps to roughly 0.125 * height_m (half of 25% of height).
    """
    # Height scale
    height_m = (height_cm or 170.0) / 100.0
    y_values = ys_norm * height_m
    # Reference half-width in metres
    max_half_px = max(1.0, float(half_widths_px.max()))
    ref_half_m = 0.125 * height_m
    radii_m = ref_half_m * (half_widths_px / max_half_px)

    # Build rings
    verts = []
    faces = []
    two_pi = 2.0 * math.pi
    for i, (y_m, r_m) in enumerate(zip(y_values, radii_m)):
        for j in range(radial_segments):
            theta = two_pi * j / radial_segments
            x = r_m * math.cos(theta)
            z = r_m * math.sin(theta)
            verts.append((x, y_m, z))
    # Connect rings
    def idx(i, j):
        return i * radial_segments + (j % radial_segments)
    for i in range(len(y_values) - 1):
        for j in range(radial_segments):
            a = idx(i, j)
            b = idx(i + 1, j)
            c = idx(i + 1, j + 1)
            d = idx(i, j + 1)
            faces.append((a, b, c))
            faces.append((a, c, d))
    mesh = trimesh.Trimesh(vertices=np.array(verts, dtype=np.float32), faces=np.array(faces, dtype=np.int64), process=True)
    return mesh


def generate_glb_from_image(input_image_path: str, output_glb_path: str, height_cm: float | None = None) -> None:
    """Generate a coarse body GLB from a single image via segmentation + revolution.

    This is a lightweight, dependency-free (no large DL models) demo suitable for Track A until
    we switch to a learned model (e.g., SF3D/TripoSR).
    """
    # Read image (RGB)
    img = Image.open(input_image_path).convert("RGB")
    img_rgb = np.array(img)
    h, w, _ = img_rgb.shape
    # Segment person
    mask = _segment_person(img_rgb)
    # Extract profile and build mesh
    ys_norm, half_widths_px, bbox = _profile_from_mask(mask)
    mesh = _mesh_from_profile(ys_norm, half_widths_px, bbox, w, height_cm)
    # Export GLB
    glb_bytes = trimesh.exchange.gltf.export_glb(mesh.scene())
    with open(output_glb_path, "wb") as f:
        f.write(glb_bytes)
