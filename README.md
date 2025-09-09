# Shopify 3D Try‑On App

This repository contains the scaffolding for a Shopify application that allows customers to upload a photo and generate a personalised 3D avatar for virtual try‑ons.  The goal is to provide retailers and merchants with a ready‑to‑use framework for integrating a "photo to 3D model" workflow into their product pages.  The project is organised into three services:

* **app/** – An embedded Shopify Admin app built with Remix and Polaris for managing products, sizes, and customer avatars.  This front‑end also exposes a Storefront endpoint to display a Three.js viewer on product detail pages.
* **backend/** – A Python FastAPI service that handles uploads, Shopify OAuth, webhooks, and orchestrates model inference.  It interfaces with a task queue and storage system to persist images, meshes, and fit metrics.
* **worker/** – A GPU‑enabled inference service that fits a parametric human body model (e.g. SMPL/SMPL‑X) to the customer’s photo, combines it with pre‑computed garment deformations, and produces a personalised mesh and tightness map.

The repository also includes a `docker-compose.yml` file for local development, a `.gitignore` file for common Node/Python artefacts, and per‑service README files describing the intended purpose of each folder.

**Note:** This scaffold does not yet implement any 3D reconstruction or garment simulation logic.  It provides a starting point for developers to build upon.
