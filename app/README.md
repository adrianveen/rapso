# app

This directory contains the embedded Shopify Admin application and storefront component.  It is designed to be built with [Remix](https://remix.run/) and uses Shopify’s [Polaris](https://polaris.shopify.com/) component library for a native admin look and feel.  The app handles product and size data, shows a list of captured customer avatars, and exposes a storefront route that renders a Three.js 3D viewer on product pages.

Key responsibilities:

* Authenticate via Shopify OAuth and store session tokens.
* Provide UI for merchants to link garments to 3D assets or size metadata.
* Render a 3D viewer using glTF/GLB assets and communicate with the backend for avatar retrieval.
* Subscribe to Shopify webhooks (e.g. product updates, GDPR requests).

Start here by bootstrapping a Remix app (`remix init --template shopify` or similar) and installing Polaris and App Bridge.
