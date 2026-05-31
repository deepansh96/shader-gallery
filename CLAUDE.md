# Shader Gallery Agent Guide

## Project

Shader Gallery is a Vite + React + Three.js single-page app for polished realtime shader demos. Treat each routed shader demo as a Gallery Item that composes with the shared Shader Template instead of copying runtime code.

Read `CONTEXT.md` before planning or implementing feature work. Use its terms for project concepts and update it when durable domain decisions change.

## Stack

- Vite SPA with React and TypeScript.
- Three.js via React Three Fiber for scene orchestration.
- GLSL `ShaderMaterial` is the default shader path.
- Keep the codebase TSL-ready, but do not make WebGPU required for the default runtime.
- Debug UI uses Tweakpane and renderer statistics.

## Commands

Run these from the project root:

```bash
npm run dev
npm run build
npm run preview
```

Use `npm run build` as the baseline quality check before committing code changes. For frontend changes, also smoke test the relevant route in a browser and verify the canvas renders non-blank.

## Routing And Gallery Items

- Home route lists Gallery Items as metadata-driven thumbnails.
- Gallery routes use `/gallery/<slug>`.
- The initial item is `/gallery/template-lab`.
- Register Gallery Items in `src/gallery/items.ts`.
- Put item-specific visual code under `src/gallery/<slug>/`.
- Shared runtime, layout, debug tooling, and renderer behavior belong under `src/template/` or `src/rendering/`.

## Debug Tooling

Debug controls must be gated by the URL query parameter `debug=true`.

When debug is enabled, expose useful tweakable parameters and renderer stats. Do not describe Three.js renderer memory counters as true GPU VRAM usage; they are renderer-reported counts such as geometries, textures, and programs.

## Deployment

Production target is `https://shaders.deepansh.in`.

Deployment infrastructure is managed with Terraform on AWS in account `339097327659`. Use `AWS_PROFILE=indieverse-root` for local Terraform operations. The architecture is private S3 behind CloudFront Origin Access Control, Route 53 alias DNS in the existing `deepansh.in` hosted zone `Z07945021SWCUENBCS47G`, and an ACM certificate in `us-east-1`.

Terraform paths:

```bash
terraform -chdir=infra/bootstrap init
terraform -chdir=infra/bootstrap fmt -check
terraform -chdir=infra/bootstrap validate
terraform -chdir=infra/bootstrap plan
terraform -chdir=infra/bootstrap apply

AWS_PROFILE=indieverse-root terraform -chdir=infra/prod init
npm run check:prod-domain-dns
AWS_PROFILE=indieverse-root terraform -chdir=infra/prod fmt -check
AWS_PROFILE=indieverse-root terraform -chdir=infra/prod validate
AWS_PROFILE=indieverse-root terraform -chdir=infra/prod plan
AWS_PROFILE=indieverse-root terraform -chdir=infra/prod apply
```

Terraform manages infrastructure only. Built SPA assets deploy separately from `dist/`, with immutable cache headers for hashed Vite assets, short or no-cache headers for `index.html`, and a first-version `/*` CloudFront invalidation. GitHub Actions deploys production from `main` through `.github/workflows/deploy-prod.yml` using OIDC role `arn:aws:iam::339097327659:role/shader-gallery-prod-github-deploy`; the role is created by `infra/prod`.

Deploy commands:

```bash
npm run build
npm run deploy:prod -- --preflight
npm run deploy:prod
```

The deploy script reads `app_origin_bucket_name`, `edge_distribution_id`, and `aws_region` from `infra/prod` Terraform outputs, uploads retained hashed assets before `index.html`, and does not delete old hashed assets during the same deploy.

Production verification commands:

```bash
APP_BUCKET=$(terraform -chdir=infra/prod output -raw app_origin_bucket_name)
HASHED_ASSET=$(find dist/assets -type f | head -n 1 | sed 's#dist/##')

curl -I https://shaders.deepansh.in
curl -I http://shaders.deepansh.in
curl -I https://shaders.deepansh.in/index.html
curl -I "https://shaders.deepansh.in/${HASHED_ASSET}"
curl -I https://shaders.deepansh.in/missing-asset.js
curl -I https://shaders.deepansh.in/gallery/template-lab
curl -I https://shaders.deepansh.in/gallery/not-a-real-item
curl -I "https://${APP_BUCKET}.s3.us-east-1.amazonaws.com/index.html"
```

Verify HTTPS serving, HTTP-to-HTTPS redirect, Template Lab deep-link refresh, invalid Gallery Item client redirect home, accepted v1 HTML fallback for missing assets, direct S3 AccessDenied behavior, cache headers, and `?debug=true` showing Tweakpane controls only when present.

## Ralph Workflow

Ralph is cloned locally at `.ralph/` and is ignored by git. Run Ralph commands from the project root, not from inside `.ralph/`.

For issue-driven work:

```bash
.ralph/ralph.sh status --issue <number>
.ralph/ralph.sh --issue <number>
.ralph/ralph.sh logs --issue <number>
```

Do not pipe Ralph commands through `head`, `tail`, or similar commands. Ralph state lives in `.ralph/workspaces/<issue>/state.json`. Set `baseBranch` explicitly before preflight; for deployment issue #6 it should use `grill/deploy-personal-domain`.

## Git

- Keep feature work on a branch.
- Do not revert unrelated local changes.
- Commit generated implementation changes only after relevant checks pass.
- Keep `.ralph/`, `.vite/`, `dist/`, and other generated local output out of tracked source unless intentionally changing project policy.
