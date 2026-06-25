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
npm run test       # Vitest: src/** unit tests (TS, Vite-native)
npm run test:deploy # node --test: scripts/*.test.mjs deploy tooling
```

Use `npm run build` as the baseline quality check before committing code changes. For frontend changes, also smoke test the relevant route in a browser and verify the canvas renders non-blank.

There are two separate test runners, by design: Vitest owns app TypeScript under `src/**` (scoped via `vitest.config.ts` `include: ["src/**/*.test.ts"]`), and `node --test` owns the `scripts/*.test.mjs` deploy tooling. Keep them distinct — do not let Vitest pick up the deploy scripts. Extract a Gallery Item's load-bearing, framework-free logic (e.g. puzzle/Solve math) into a pure module with no React/Three imports and unit-test it with Vitest; React/R3F rendering, shaders, and DOM drag wiring are validated by `npm run build` plus a manual browser smoke test, not unit tests.

## Routing And Gallery Items

- Home route lists Gallery Items as metadata-driven thumbnails.
- Gallery routes use `/gallery/<slug>`.
- The initial item is `/gallery/template-lab`.
- Register Gallery Items in `src/gallery/items.ts`.
- Put item-specific visual code under `src/gallery/<slug>/`.
- Shared runtime, layout, debug tooling, and renderer behavior belong under `src/template/` or `src/rendering/`.

## Gallery Item Implementation Patterns

These conventions emerged building interactive items and apply to any item with live runtime state or postprocessing:

- **Live shader uniforms via material refs.** For per-frame updates, mutate `materialRef.current.uniforms.X.value` in place inside `useFrame`. Treat the `uniforms` object passed to `<shaderMaterial>` as initial seeding only — live writes must go through the material ref to reliably reach the GPU. Reuse existing objects (`color.set(...).multiplyScalar(...)`); do not allocate geometry or new uniform objects per frame.
- **Item-local bloom with `@react-three/postprocessing` (React 19).** Hold the `<Bloom>` effect through a function (callback) ref and mutate `.intensity` per frame; do NOT pass a changing `intensity` prop. The wrapper memoizes on `JSON.stringify(props)`, so a live-changing prop reconstructs (or crashes) the effect — a function-valued ref is skipped by that memo. Mount `<EffectComposer>` only inside the item's own subtree (ADR-0001), never in the shared Template.
- **Item-local touch handling.** To suppress page scroll during touch-drag, set `touch-action: none` on `gl.domElement` for the item's lifetime in a `useEffect` and restore the prior inline value on unmount — no Template-level CSS. Use pointer events with `setPointerCapture` and a single active pointer id so drags continue off-canvas and multi-touch does not corrupt state.
- **Runtime state in refs, tuning in params.** Live puzzle/interaction state (angle, velocity, timers, solved flag, live target) lives in refs mutated in `useFrame`, never in registry `params`. The `params` surface is the static, debug-gated Tweakpane tuning path; read params live in `useFrame` when a control must take effect immediately.

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
