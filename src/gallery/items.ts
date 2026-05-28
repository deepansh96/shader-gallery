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
];

export function getGalleryItem(slug: string | undefined) {
  return galleryItems.find((item) => item.slug === slug);
}
