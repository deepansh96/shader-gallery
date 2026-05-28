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
