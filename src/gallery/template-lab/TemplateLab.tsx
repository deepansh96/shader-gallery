import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  Color,
  ShaderMaterial,
  Vector2,
  type Mesh,
} from "three";
import type { GallerySceneProps } from "../types";
import fragmentShader from "./templateLab.frag.glsl";
import vertexShader from "./templateLab.vert.glsl";

function numberParam(value: unknown, fallback: number) {
  return typeof value === "number" ? value : fallback;
}

function colorParam(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

export function TemplateLab({ params }: GallerySceneProps) {
  const materialRef = useRef<ShaderMaterial>(null);
  const meshRef = useRef<Mesh>(null);
  const viewport = useThree((state) => state.viewport);
  const size = useThree((state) => state.size);
  const pointer = useThree((state) => state.pointer);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uResolution: { value: new Vector2(size.width, size.height) },
      uPointer: { value: new Vector2(0.5, 0.5) },
      uPrimary: { value: new Color(colorParam(params.primaryColor, "#7df9ff")) },
      uSecondary: { value: new Color(colorParam(params.secondaryColor, "#ff4ecd")) },
      uIntensity: { value: numberParam(params.intensity, 1.1) },
      uWarp: { value: numberParam(params.warp, 0.62) },
      uSpeed: { value: numberParam(params.speed, 0.85) },
    }),
    [],
  );

  useFrame(({ clock }) => {
    uniforms.uTime.value = clock.elapsedTime;
    uniforms.uResolution.value.set(size.width, size.height);
    uniforms.uPointer.value.set(pointer.x * 0.5 + 0.5, pointer.y * 0.5 + 0.5);
    uniforms.uPrimary.value.set(colorParam(params.primaryColor, "#7df9ff"));
    uniforms.uSecondary.value.set(colorParam(params.secondaryColor, "#ff4ecd"));
    uniforms.uIntensity.value = numberParam(params.intensity, 1.1);
    uniforms.uWarp.value = numberParam(params.warp, 0.62);
    uniforms.uSpeed.value = numberParam(params.speed, 0.85);
  });

  return (
    <mesh ref={meshRef} scale={[viewport.width, viewport.height, 1]}>
      <planeGeometry args={[1, 1, 1, 1]} />
      <shaderMaterial
        ref={materialRef}
        fragmentShader={fragmentShader}
        vertexShader={vertexShader}
        uniforms={uniforms}
      />
    </mesh>
  );
}
