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

Deployment infrastructure should be managed with Terraform on AWS using profile `indieverse-root`. The intended architecture is private S3 behind CloudFront Origin Access Control, Route 53 alias DNS in the existing `deepansh.in` hosted zone, and an ACM certificate in `us-east-1`.

Terraform manages infrastructure only. Built SPA assets deploy separately from `dist/`, with immutable cache headers for hashed Vite assets, short or no-cache headers for `index.html`, and a first-version `/*` CloudFront invalidation.

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
