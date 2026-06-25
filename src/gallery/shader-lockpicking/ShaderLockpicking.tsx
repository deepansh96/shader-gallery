import { PerspectiveCamera } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, Color, DoubleSide, type ShaderMaterial } from "three";
import type { GalleryParamValue, GallerySceneProps } from "../types";
import { integrate, isSolved, normalizeAngle, pickNewTarget, proximity } from "./puzzle";
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

// Solve loop tuning. On Solve the puzzle holds briefly (success pulse plays),
// then re-arms with a fresh Target Zone kept at least MIN_SEPARATION away from
// the current angle so it is never trivially already solved. MIN_SEPARATION sits
// above the largest selectable solveTolerance for the same reason.
const MIN_SEPARATION = 0.9; // radians (~51°)
const SOLVE_HOLD_SECONDS = 1.1; // brief hold before re-arming
// Transient bloom flare: a success-pulse envelope (1 → 0) that decays over this
// many seconds and boosts bloom intensity at its peak.
const PULSE_DECAY_SECONDS = 0.85;
const BLOOM_PULSE_BOOST = 2.6;
// Smoothing rate for the held solve glow that drives the shader glint/rim hue, so
// it ramps in on Solve and out on re-arm rather than popping.
const SOLVE_GLOW_EASE = 10;

// Item-local bloom (ADR-0001): a single half-resolution blur pass with a low
// luminance threshold, so the additive glass shells and the bright Caustic Seam
// read as luminous glowing glass against the dark backplate. Mounted only inside
// this item's subtree — the Shader Template and Template Lab gain no composer.
const BLOOM_RESOLUTION_SCALE = 0.5; // half-resolution render target (perf budget)
const BLOOM_LUMINANCE_THRESHOLD = 0.2; // low → the glowing glass + seam bloom
const BLOOM_LUMINANCE_SMOOTHING = 0.3;

// Minimal handle onto the bloom effect: just the per-frame intensity write. Kept
// structural so the item does not couple to the postprocessing effect type.
type BloomHandle = { intensity: number };

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
  uSolved: { value: number };
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
  const bloomStrength = numberParam(params.bloomStrength, 1.4);
  // Target Zone angle (radians) seeded from the debug param.
  const targetAngleParam = numberParam(params.targetAngle, INITIAL_TARGET_ANGLE);
  // Solve tolerance (radians), read live each frame so debug tuning of difficulty
  // takes effect immediately.
  const solveTolerance = numberParam(params.solveTolerance, 0.18);

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

  // Solve loop state — all in refs, mutated in useFrame, never in registry params.
  // `solvedRef` suppresses re-triggering the pulse while still inside tolerance;
  // `holdTimerRef` counts down the brief success hold before re-arm; `pulseRef`
  // is the transient bloom-flare envelope; `glowRef` is the smoothed held glow
  // that drives the shader key-silhouette glint and solved rim hue.
  const solvedRef = useRef(false);
  const holdTimerRef = useRef(0);
  const pulseRef = useRef(0);
  const glowRef = useRef(0);

  // Bloom effect handle plus the readable intensity ref. The intensity is driven
  // each frame from this ref (base = bloomStrength now); a later slice adds a
  // transient success-pulse boost on top before it reaches the effect.
  const bloomEffectRef = useRef<BloomHandle | null>(null);
  const bloomIntensityRef = useRef(bloomStrength);
  // Stable callback ref: a function-valued ref is skipped by the postprocessing
  // wrapper's JSON.stringify(props) memo, so live param changes neither crash nor
  // reconstruct the effect (an object ref would do both under React 19).
  const setBloomEffect = useCallback((effect: BloomHandle | null) => {
    bloomEffectRef.current = effect;
  }, []);

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
        uSolved: { value: 0 },
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
      uSolved: { value: 0 },
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
    const dt = Math.min(delta, MAX_FRAME_DELTA);

    const next = integrate(
      { angle: angleRef.current, velocity: velocityRef.current },
      { dragDelta: dragDeltaRef.current, dt: delta },
      { damping: ROTATION_DAMPING, maxDt: MAX_FRAME_DELTA },
    );
    angleRef.current = next.angle;
    velocityRef.current = next.velocity;
    dragDeltaRef.current = 0;

    // Solve loop: a single cheap scalar angle check (isSolved) each frame — never
    // 2D pattern matching. On a transition into Solve, fire the success pulse once
    // and start the brief hold; further Solves are suppressed (solvedRef stays
    // true) until re-arm, so the pulse is not retriggered every frame while the
    // angle remains within tolerance. solveTolerance is read live so debug tuning
    // of difficulty is immediate.
    if (solvedRef.current) {
      holdTimerRef.current -= dt;
      if (holdTimerRef.current <= 0) {
        // Re-arm: a fresh Target Zone at least MIN_SEPARATION from the current
        // angle (never trivially solved), then the seam returns to searching.
        targetRef.current = pickNewTarget(next.angle, Math.random, MIN_SEPARATION);
        solvedRef.current = false;
      }
    } else if (isSolved(next.angle, targetRef.current, solveTolerance)) {
      solvedRef.current = true;
      holdTimerRef.current = SOLVE_HOLD_SECONDS;
      pulseRef.current = 1;
    }

    // Transient bloom-flare envelope decays toward 0; the held solve glow eases
    // toward 1 while solved and back to 0 on re-arm, driving the shader glint/hue.
    if (pulseRef.current > 0) {
      pulseRef.current = Math.max(0, pulseRef.current - dt / PULSE_DECAY_SECONDS);
    }
    const glowTarget = solvedRef.current ? 1 : 0;
    glowRef.current += (glowTarget - glowRef.current) * Math.min(1, dt * SOLVE_GLOW_EASE);

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
      planeMaterial.uniforms.uSolved.value = glowRef.current;
    }
    for (let i = 0; i < SHELLS.length; i++) {
      const shellMaterial = shellMaterialsRef.current[i];
      if (!shellMaterial) continue;
      shellMaterial.uniforms.uAngle.value = next.angle;
      shellMaterial.uniforms.uGlassTint.value.set(glassTint).multiplyScalar(SHELLS[i].tint);
      shellMaterial.uniforms.uFresnelStrength.value = fresnelStrength;
      shellMaterial.uniforms.uSolved.value = glowRef.current;
    }

    // Drive bloom intensity from the readable ref each frame (no per-frame alloc):
    // the debug param read live (immediate tuning) plus the transient success-pulse
    // boost, so a Solve fires a bloom flare that decays over the brief hold.
    bloomIntensityRef.current = bloomStrength + pulseRef.current * BLOOM_PULSE_BOOST;
    const bloom = bloomEffectRef.current;
    if (bloom) {
      bloom.intensity = bloomIntensityRef.current;
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

      {/* Item-local postprocessing (ADR-0001): a single half-resolution bloom
          pass lives inside this item's subtree only. Template Lab mounts no
          composer, so the shared render path is unchanged. Intensity is mutated
          per frame through the callback ref — no `intensity` prop, so live param
          tuning never reconstructs the effect. */}
      <EffectComposer>
        <Bloom
          ref={setBloomEffect}
          mipmapBlur={false}
          luminanceThreshold={BLOOM_LUMINANCE_THRESHOLD}
          luminanceSmoothing={BLOOM_LUMINANCE_SMOOTHING}
          resolutionScale={BLOOM_RESOLUTION_SCALE}
        />
      </EffectComposer>
    </>
  );
}
