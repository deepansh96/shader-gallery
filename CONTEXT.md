# Shader Gallery Context

## Purpose

Shader Gallery is a Vite single-page app for collecting high-end realtime shader demos. Each demo should feel like a polished, interactive graphics piece rather than a static shader snippet.

## Language

**Shader Gallery**:
A Vite single-page app that collects polished realtime shader demos.
_Avoid_: shader repo, examples site, snippets page

**Shader Template**:
The shared runtime, scene shell, debug tooling, and performance instrumentation used by Gallery Items.
_Avoid_: copied starter, demo shell, runtime fork

**Gallery Item**:
A routed shader demo with its own visual concept, metadata, parameters, and scene component.
_Avoid_: snippet, example, shader page

**Template Lab**:
The first Gallery Item that proves the Shader Template with a simple fullscreen GLSL shader.
_Avoid_: starter page, placeholder demo

**Debug Tooling**:
Query-gated controls and renderer statistics used while developing or inspecting a Gallery Item.
_Avoid_: admin panel, dev mode, GPU VRAM monitor

**Gallery Thumbnail**:
A static, metadata-driven preview card for a Gallery Item on the home route.
_Avoid_: live canvas, background shader, preview renderer

**Production Domain**:
The public hostname `shaders.deepansh.in` where Shader Gallery is served.
_Avoid_: root domain, apex domain, staging URL

**Deployment Stack**:
The AWS infrastructure that serves Shader Gallery as a static SPA.
_Avoid_: hosting script, CI pipeline, app server

**App Origin**:
The private S3 bucket that stores built SPA assets for CloudFront.
_Avoid_: public bucket, website bucket, artifact store

**Edge Distribution**:
The CloudFront distribution that serves the App Origin over HTTPS and handles SPA fallbacks.
_Avoid_: CDN config, proxy, web server

**Deploy Artifact**:
The built `dist/` output uploaded to the App Origin.
_Avoid_: Terraform asset, source bundle, release archive

**Terraform State**:
The remote AWS-backed state file for the Deployment Stack.
_Avoid_: local state, app database, deploy log

## Relationships

- The **Shader Gallery** contains one or more **Gallery Items**.
- A **Gallery Item** mounts inside exactly one **Shader Template**.
- The **Shader Template** provides **Debug Tooling** to every **Gallery Item** when `debug=true` is present.
- A **Gallery Item** has exactly one **Gallery Thumbnail** on the home route.
- **Template Lab** is exactly one **Gallery Item**.
- The **Production Domain** points to exactly one **Edge Distribution**.
- The **Edge Distribution** reads from exactly one **App Origin**.
- The **App Origin** stores one active **Deploy Artifact** at a time.
- The **Deployment Stack** manages the **App Origin**, **Edge Distribution**, certificate, and **Production Domain** record.
- The **Deployment Stack** is recorded in exactly one **Terraform State** for the `prod` environment.

## Example dialogue

> **Dev:** "When a new **Gallery Item** is added, should it copy the current **Shader Template** files?"
> **Domain expert:** "No. Register the **Gallery Item** and mount it inside the shared **Shader Template** so template improvements apply everywhere."
>
> **Dev:** "Can the home page use live shader canvases for each **Gallery Thumbnail**?"
> **Domain expert:** "Not by default. A **Gallery Thumbnail** is static unless a specific item justifies a richer preview."
>
> **Dev:** "Does Terraform upload the **Deploy Artifact** to the **App Origin**?"
> **Domain expert:** "No. Terraform owns the **Deployment Stack**; a separate deploy command uploads `dist/` and invalidates the **Edge Distribution**."

## Flagged ambiguities

- "demo", "example", and "shader page" all refer to a **Gallery Item** when discussing routed shader experiences.
- "template" means **Shader Template**, not a copied starter folder for each new item.
- "thumbnail" means **Gallery Thumbnail**, a static metadata card by default rather than a live shader canvas.
- "memory monitor" in **Debug Tooling** means renderer-reported counts, not true GPU VRAM telemetry.
- "deployment" can mean either **Deployment Stack** infrastructure or **Deploy Artifact** upload; this project keeps those separate.
- "bucket" means **App Origin** when discussing production hosting, and it must remain private behind the **Edge Distribution**.

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

Shader Gallery deploys as a static SPA at `shaders.deepansh.in`. Terraform should own the app-specific AWS resources and the single `shaders.deepansh.in` Route 53 record. The existing `deepansh.in` hosted zone is external infrastructure and should be referenced, not imported or broadly managed by this project. Production operations target AWS account `339097327659` and hosted zone `Z07945021SWCUENBCS47G`.

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

Hashed Vite assets should receive long immutable cache headers. The SPA entrypoint `index.html` receives `Cache-Control: no-cache` so route shell updates propagate quickly. The deploy workflow uploads immutable assets before `index.html`, retains old hashed assets during the same deploy for already-loaded clients, and invalidates `/*` after each deploy for simplicity, with narrower invalidations left for later optimization.
