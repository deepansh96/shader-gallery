import type { ComponentType } from "react";

export type GalleryParamValue = boolean | number | string;

export type GalleryParamDefinition = {
  key: string;
  label: string;
  value: GalleryParamValue;
  min?: number;
  max?: number;
  step?: number;
  input?: "color" | "checkbox" | "number";
};

export type GallerySceneProps = {
  params: Record<string, GalleryParamValue>;
  debug: boolean;
};

export type GalleryItemDefinition = {
  slug: string;
  title: string;
  description: string;
  status: string;
  thumbnailClass: string;
  params: GalleryParamDefinition[];
  component: ComponentType<GallerySceneProps>;
};
