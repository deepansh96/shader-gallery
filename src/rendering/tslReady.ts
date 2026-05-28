import { color, float, uv } from "three/tsl";

export const tslReadyNotes = {
  module: "three/tsl",
  defaultRuntime: "webgl2",
  intent:
    "Keep GLSL ShaderMaterial as the public baseline while reserving a clear place for future Three.js TSL/WebGPU gallery items.",
};

export function createTslPreviewNodes() {
  return {
    uv: uv(),
    tint: color("#7df9ff"),
    intensity: float(1),
  };
}
