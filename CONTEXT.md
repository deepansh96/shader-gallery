# Shader Gallery Context

## Purpose

Shader Gallery is a Vite single-page app for collecting high-end realtime shader demos. Each demo should feel like a polished, interactive graphics piece rather than a static shader snippet.

## Glossary

### Shader Template

The shared runtime, layout, scene shell, debug tooling, and performance instrumentation used by Gallery Items. Template improvements should benefit Gallery Items without copying code into each item.

### Gallery Item

A routed shader demo in the gallery. A Gallery Item owns its visual concept and shader implementation while using the Shader Template for common app, rendering, debug, and performance behavior.

## Decisions

### Gallery Items Use Composition Instead of Copying

Gallery Items inherit Shader Template improvements through a shared shell and registry. Each item exports a definition with metadata, default parameters, and a scene component. The router mounts the selected item inside the shared Shader Template rather than generating a copied folder per item.

### Renderer Strategy Is WebGL2-First and TSL-Ready

The Shader Template optimizes for the broadly supported WebGL2 path first. Gallery Items can use GLSL `ShaderMaterial` by default. The template should remain TSL-ready for future Three.js node and WebGPU experiments, but the default gallery runtime should not depend on WebGPU-only features.

### The First Gallery Item Is Template Lab

The initial Gallery Item is `/gallery/template-lab`. It proves the Shader Template with a simple fullscreen GLSL shader using time, resolution, pointer, and tweakable visual parameters. It should also leave a small TSL-ready path in the codebase without making WebGPU required.

### Debug Tooling Is Query-Gated

Debug tooling is visible only when the current URL includes `debug=true`. When enabled, the Shader Template shows a compact performance overlay and Tweakpane controls for shared and Gallery Item parameters. Memory reporting should use available Three.js renderer memory counters, such as geometries, textures, and shader programs, and should not be described as true GPU VRAM usage.

### Gallery Thumbnails Are Static by Default

The home gallery uses static, metadata-driven thumbnail cards by default. Gallery Items may provide richer thumbnail assets later, but the default page should not run multiple live shader canvases in the background.

### Deployment Uses AWS Static Hosting for shaders.deepansh.in

Shader Gallery deploys as a static SPA at `shaders.deepansh.in`. Terraform should own the app-specific AWS resources and the single `shaders.deepansh.in` Route 53 record. The existing `deepansh.in` hosted zone is external infrastructure and should be referenced, not imported or broadly managed by this project.

### Terraform State Is Remote

Deployment infrastructure should use remote Terraform state in AWS with locking. The state should be scoped to this project and environment, for example `shader-gallery/prod/terraform.tfstate`, rather than using local state files.

### CloudFront Serves a Private S3 Origin

The production SPA should be uploaded to a private S3 bucket and served through CloudFront using Origin Access Control. CloudFront should provide SPA deep-link support by mapping origin 403/404 responses to `/index.html` with HTTP 200.

### TLS Uses a CloudFront-Compatible ACM Certificate

Terraform should request and manage an ACM certificate for `shaders.deepansh.in` in `us-east-1`, validate it through DNS records in the existing `deepansh.in` Route 53 hosted zone, and attach it to the CloudFront distribution.

### Terraform Does Not Manage Built Assets

Terraform should manage infrastructure only. Built SPA assets should be deployed through a separate command or CI workflow that runs the build, syncs `dist/` to the deployment bucket, and invalidates the CloudFront distribution. Terraform should output the bucket name and CloudFront distribution ID for that workflow.

### Production Deploy Is Manual-First

The first deployment workflow should support manual deploys from a local machine using the `indieverse-root` AWS profile. Infrastructure outputs and scripts should remain CI-ready so GitHub Actions can be added later without redesigning the deployment stack.

### Deployment Starts With a Single Production Environment

The first Terraform deployment target is `prod` only. Resource naming and variables should leave room for future preview or staging environments, but the initial scope should not create multiple domains, certificates, or CloudFront distributions.

### CloudFront Cache Policy Favors Fast App Updates

Hashed Vite assets should receive long immutable cache headers. The SPA entrypoint should receive short or no-cache headers so route shell updates propagate quickly. The first deploy workflow can invalidate `/*` after each deploy for simplicity, with narrower invalidations left for later optimization.
