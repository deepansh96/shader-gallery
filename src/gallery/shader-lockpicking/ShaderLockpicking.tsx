import { PerspectiveCamera } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import { AdditiveBlending, Color, DoubleSide } from "three";
import type { GalleryParamValue, GallerySceneProps } from "../types";
import planeFragment from "./receivingPlane.frag.glsl";
import planeVertex from "./receivingPlane.vert.glsl";
import tumblerFragment from "./tumbler.frag.glsl";
import tumblerVertex from "./tumbler.vert.glsl";

// Seeded framing for the foundation slice: a fixed seam angle and a backplate
// large enough to fill the fixed-camera view. Interaction wires the live angle
// in a later slice.
const SEAM_ANGLE = 0.4;
const SEAM_OFFSET = 0.5;
const PLANE_WIDTH = 6;
const PLANE_HEIGHT = 4;

type ShellConfig = {
  radius: number;
  opacity: number;
  tint: number;
};

// Four nested transparent shells form the Lock Tumbler barrel, brighter and
// tighter toward the core. Geometry args are constant, so each cylinder is
// created once and never reallocated per frame.
const SHELLS: ShellConfig[] = [
  { radius: 1.1, opacity: 0.18, tint: 1.0 },
  { radius: 0.85, opacity: 0.24, tint: 1.15 },
  { radius: 0.6, opacity: 0.32, tint: 1.3 },
  { radius: 0.36, opacity: 0.42, tint: 1.5 },
];

function numberParam(value: GalleryParamValue | undefined, fallback: number) {
  return typeof value === "number" ? value : fallback;
}

function colorParam(value: GalleryParamValue | undefined, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function TumblerShell({
  config,
  glassTint,
  fresnelStrength,
}: {
  config: ShellConfig;
  glassTint: string;
  fresnelStrength: number;
}) {
  const uniforms = useMemo(
    () => ({
      uGlassTint: { value: new Color(glassTint).multiplyScalar(config.tint) },
      uFresnelStrength: { value: fresnelStrength },
      uShellOpacity: { value: config.opacity },
    }),
    // Created once; live debug edits are applied through the effect below.
    [],
  );

  useEffect(() => {
    uniforms.uGlassTint.value.set(glassTint).multiplyScalar(config.tint);
    uniforms.uFresnelStrength.value = fresnelStrength;
  }, [uniforms, glassTint, fresnelStrength, config.tint]);

  return (
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[config.radius, config.radius, 0.9, 96, 1, true]} />
      <shaderMaterial
        vertexShader={tumblerVertex}
        fragmentShader={tumblerFragment}
        uniforms={uniforms}
        transparent
        blending={AdditiveBlending}
        depthWrite={false}
        side={DoubleSide}
      />
    </mesh>
  );
}

export function ShaderLockpicking({ params }: GallerySceneProps) {
  const glassTint = colorParam(params.glassTint, "#8fd6ff");
  const fresnelStrength = numberParam(params.fresnelStrength, 1.6);

  const planeUniforms = useMemo(
    () => ({
      uSeamAngle: { value: SEAM_ANGLE },
      uSeamOffset: { value: SEAM_OFFSET },
      uAspect: { value: PLANE_WIDTH / PLANE_HEIGHT },
    }),
    [],
  );

  return (
    <>
      {/* Item-owned fixed-framing camera; overrides the Template's shared
          fullscreen-plane camera without touching the Template. No orbit. */}
      <PerspectiveCamera makeDefault position={[0, 0, 4.4]} fov={42} near={0.1} far={50} />

      <mesh position={[0, 0, -1.6]} scale={[PLANE_WIDTH, PLANE_HEIGHT, 1]}>
        <planeGeometry args={[1, 1, 1, 1]} />
        <shaderMaterial
          vertexShader={planeVertex}
          fragmentShader={planeFragment}
          uniforms={planeUniforms}
        />
      </mesh>

      {SHELLS.map((config) => (
        <TumblerShell
          key={config.radius}
          config={config}
          glassTint={glassTint}
          fresnelStrength={fresnelStrength}
        />
      ))}
    </>
  );
}
