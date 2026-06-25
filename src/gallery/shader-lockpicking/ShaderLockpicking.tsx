import { PerspectiveCamera } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, Color, DoubleSide, type ShaderMaterial } from "three";
import type { GalleryParamValue, GallerySceneProps } from "../types";
import { integrate, normalizeAngle, proximity } from "./puzzle";
import planeFragment from "./receivingPlane.frag.glsl";
import planeVertex from "./receivingPlane.vert.glsl";
import tumblerFragment from "./tumbler.frag.glsl";
import tumblerVertex from "./tumbler.vert.glsl";

// Seeded framing: a starting angle and a backplate large enough to fill the
// fixed-camera view. The live angle now comes from drag interaction.
const INITIAL_ANGLE = 0.4;
// Fallback Target Zone angle (radians) when the param is absent; the registry
// param seeds the live target in practice.
const INITIAL_TARGET_ANGLE = 2.4;
const SEAM_OFFSET = 0.5;
const PLANE_WIDTH = 6;
const PLANE_HEIGHT = 4;

// Drag tuning: horizontal pointer travel in pixels → radians of tumbler spin.
const DRAG_SENSITIVITY = 0.01;
// Rotation integrator config: velocity decay per second once the drag releases,
// and the per-frame delta clamp that guards against a post-tab-away jump.
const ROTATION_DAMPING = 4;
const MAX_FRAME_DELTA = 0.05;

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

// `type` alias (not `interface`) so the object is assignable to the
// shaderMaterial `uniforms` prop's index signature. These objects seed the
// material's initial uniforms; live per-frame writes go through the material
// refs below so the actual material uniforms are mutated directly.
type ShellUniforms = {
  uGlassTint: { value: Color };
  uFresnelStrength: { value: number };
  uShellOpacity: { value: number };
  uAngle: { value: number };
};

function numberParam(value: GalleryParamValue | undefined, fallback: number) {
  return typeof value === "number" ? value : fallback;
}

function colorParam(value: GalleryParamValue | undefined, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function TumblerShell({
  config,
  uniforms,
  materialRef,
}: {
  config: ShellConfig;
  uniforms: ShellUniforms;
  materialRef: (material: ShaderMaterial | null) => void;
}) {
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[config.radius, config.radius, 0.9, 96, 1, true]} />
      <shaderMaterial
        ref={materialRef}
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
  const causticSharpness = numberParam(params.causticSharpness, 1.0);
  // Target Zone angle (radians) seeded from the debug param.
  const targetAngleParam = numberParam(params.targetAngle, INITIAL_TARGET_ANGLE);

  const gl = useThree((state) => state.gl);

  // Live material handles for per-frame uniform writes.
  const planeMaterialRef = useRef<ShaderMaterial>(null);
  const shellMaterialsRef = useRef<Array<ShaderMaterial | null>>([]);

  // Live puzzle state in refs, mutated in useFrame — never in registry params.
  const angleRef = useRef(INITIAL_ANGLE);
  const velocityRef = useRef(0);
  // Live Target Zone angle. Seeded from the param; re-randomization on Solve is a
  // later slice. Held in a ref (read in useFrame), not in registry params.
  const targetRef = useRef(normalizeAngle(targetAngleParam));
  // Drag movement accumulated by pointer handlers, drained each frame.
  const dragDeltaRef = useRef(0);

  // Tweakpane edits to `targetAngle` immediately move the live target so a
  // debugger can force a known Target Zone and watch the seam's "sharp" angle shift.
  useEffect(() => {
    targetRef.current = normalizeAngle(targetAngleParam);
  }, [targetAngleParam]);

  const shellUniforms = useMemo<ShellUniforms[]>(
    () =>
      SHELLS.map((shell) => ({
        uGlassTint: { value: new Color(glassTint).multiplyScalar(shell.tint) },
        uFresnelStrength: { value: fresnelStrength },
        uShellOpacity: { value: shell.opacity },
        uAngle: { value: angleRef.current },
      })),
    // Created once; live values are written every frame in useFrame.
    [],
  );

  const planeUniforms = useMemo(
    () => ({
      uSeamAngle: { value: angleRef.current },
      uSeamOffset: { value: SEAM_OFFSET },
      uAspect: { value: PLANE_WIDTH / PLANE_HEIGHT },
      uTargetAngle: { value: targetRef.current },
      uProximity: { value: proximity(angleRef.current, targetRef.current) },
      uCausticSharpness: { value: causticSharpness },
    }),
    // Created once; live values are written every frame in useFrame.
    [],
  );

  // Item-local: suppress page scroll during touch-drag by setting
  // `touch-action: none` on the canvas for our lifetime only, restoring the
  // prior inline value on unmount. No Template-level CSS change.
  useEffect(() => {
    const canvas = gl.domElement;
    const previousTouchAction = canvas.style.touchAction;
    canvas.style.touchAction = "none";
    return () => {
      canvas.style.touchAction = previousTouchAction;
    };
  }, [gl]);

  // Pointer-drag rotation with pointer capture and a single active pointer id,
  // so a drag continues off-canvas and multi-touch does not corrupt rotation.
  useEffect(() => {
    const canvas = gl.domElement;
    let activePointerId: number | null = null;
    let lastClientX = 0;

    const onPointerDown = (event: PointerEvent) => {
      if (activePointerId !== null) return;
      activePointerId = event.pointerId;
      lastClientX = event.clientX;
      canvas.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== activePointerId) return;
      dragDeltaRef.current += (event.clientX - lastClientX) * DRAG_SENSITIVITY;
      lastClientX = event.clientX;
    };

    const endDrag = (event: PointerEvent) => {
      if (event.pointerId !== activePointerId) return;
      activePointerId = null;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    canvas.addEventListener("lostpointercapture", endDrag);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endDrag);
      canvas.removeEventListener("pointercancel", endDrag);
      canvas.removeEventListener("lostpointercapture", endDrag);
    };
  }, [gl]);

  useFrame((_, delta) => {
    const next = integrate(
      { angle: angleRef.current, velocity: velocityRef.current },
      { dragDelta: dragDeltaRef.current, dt: delta },
      { damping: ROTATION_DAMPING, maxDt: MAX_FRAME_DELTA },
    );
    angleRef.current = next.angle;
    velocityRef.current = next.velocity;
    dragDeltaRef.current = 0;

    // Feed the live angle into the seam + tumbler uniforms each frame; also pull
    // the current debug-tuned glass tint and Fresnel. All mutations are in-place
    // (no per-frame allocation).
    const planeMaterial = planeMaterialRef.current;
    if (planeMaterial) {
      planeMaterial.uniforms.uSeamAngle.value = next.angle;
      // Proximity cue: the Caustic Seam sharpens/brightens as the live rotation
      // nears the Target Zone. The Solve check stays a separate scalar test.
      planeMaterial.uniforms.uTargetAngle.value = targetRef.current;
      planeMaterial.uniforms.uProximity.value = proximity(next.angle, targetRef.current);
      planeMaterial.uniforms.uCausticSharpness.value = causticSharpness;
    }
    for (let i = 0; i < SHELLS.length; i++) {
      const shellMaterial = shellMaterialsRef.current[i];
      if (!shellMaterial) continue;
      shellMaterial.uniforms.uAngle.value = next.angle;
      shellMaterial.uniforms.uGlassTint.value.set(glassTint).multiplyScalar(SHELLS[i].tint);
      shellMaterial.uniforms.uFresnelStrength.value = fresnelStrength;
    }
  });

  return (
    <>
      {/* Item-owned fixed-framing camera; overrides the Template's shared
          fullscreen-plane camera without touching the Template. No orbit. */}
      <PerspectiveCamera makeDefault position={[0, 0, 4.4]} fov={42} near={0.1} far={50} />

      <mesh position={[0, 0, -1.6]} scale={[PLANE_WIDTH, PLANE_HEIGHT, 1]}>
        <planeGeometry args={[1, 1, 1, 1]} />
        <shaderMaterial
          ref={planeMaterialRef}
          vertexShader={planeVertex}
          fragmentShader={planeFragment}
          uniforms={planeUniforms}
        />
      </mesh>

      {SHELLS.map((config, i) => (
        <TumblerShell
          key={config.radius}
          config={config}
          uniforms={shellUniforms[i]}
          materialRef={(material) => {
            shellMaterialsRef.current[i] = material;
          }}
        />
      ))}
    </>
  );
}
