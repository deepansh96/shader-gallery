import { ShaderLockpicking } from "./shader-lockpicking/ShaderLockpicking";
import { TemplateLab } from "./template-lab/TemplateLab";
import type { GalleryItemDefinition } from "./types";

export const galleryItems: GalleryItemDefinition[] = [
  {
    slug: "template-lab",
    title: "Template Lab",
    description: "Starter GLSL scene with shared uniforms, pointer input, Tweakpane, and renderer stats.",
    status: "Template",
    thumbnailClass: "thumbnail-template-lab",
    params: [
      { key: "primaryColor", label: "Primary", value: "#7df9ff", input: "color" },
      { key: "secondaryColor", label: "Secondary", value: "#ff4ecd", input: "color" },
      { key: "intensity", label: "Intensity", value: 1.1, min: 0, max: 2.5, step: 0.01 },
      { key: "warp", label: "Warp", value: 0.62, min: 0, max: 1.5, step: 0.01 },
      { key: "speed", label: "Speed", value: 0.85, min: 0, max: 2, step: 0.01 },
    ],
    component: TemplateLab,
  },
  {
    slug: "shader-lockpicking",
    title: "Shader Lockpicking",
    description:
      "A luminous glass Lock Tumbler suspended in darkness, casting a Caustic Seam across a keyhole-marked Receiving Plane.",
    status: "Interactive",
    thumbnailClass: "thumbnail-shader-lockpicking",
    params: [
      { key: "glassTint", label: "Glass Tint", value: "#8fd6ff", input: "color" },
      { key: "fresnelStrength", label: "Fresnel", value: 1.6, min: 0, max: 4, step: 0.01 },
      { key: "causticSharpness", label: "Caustic Sharpness", value: 1.0, min: 0.2, max: 3, step: 0.01 },
      // Item-local bloom intensity. Drives the glow of the glass Lock Tumbler and
      // Caustic Seam each frame; a later slice boosts it transiently on Solve.
      { key: "bloomStrength", label: "Bloom", value: 1.4, min: 0, max: 4, step: 0.01 },
      // Target Zone angle in radians, [0, 2π). Seeds the live target; changing it
      // in Tweakpane immediately moves where the Caustic Seam reads as aligned.
      { key: "targetAngle", label: "Target Angle", value: 2.4, min: 0, max: 6.28, step: 0.01 },
      // Solve tolerance in radians: how close the rotation must get to the Target
      // Zone to Solve. Read live each frame, so tuning difficulty is immediate.
      { key: "solveTolerance", label: "Solve Tolerance", value: 0.18, min: 0.02, max: 0.6, step: 0.005 },
    ],
    component: ShaderLockpicking,
  },
];

export function getGalleryItem(slug: string | undefined) {
  return galleryItems.find((item) => item.slug === slug);
}
