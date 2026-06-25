// Pure, framework-free puzzle math for Shader Lockpicking. No React or Three
// imports — this is the load-bearing interaction logic, deterministic given its
// inputs so it can be unit-tested in isolation.

const TWO_PI = Math.PI * 2;

/** Normalize an arbitrary angle (radians) into the half-open range [0, 2π). */
export function normalizeAngle(angle: number): number {
  const wrapped = angle % TWO_PI;
  return wrapped < 0 ? wrapped + TWO_PI : wrapped;
}

/**
 * Shortest-arc distance between two angles (radians). Symmetric, always in
 * [0, π], and continuous across the 0/2π wrap.
 */
export function angularDistance(a: number, b: number): number {
  const delta = normalizeAngle(a - b);
  return delta > Math.PI ? TWO_PI - delta : delta;
}

/**
 * Normalized alignment cue in [0, 1] for the Caustic Seam: 1 when `angle`
 * equals `target`, falling linearly to 0 at the opposite side (shortest-arc
 * distance π). Increases monotonically as `angle` approaches `target` and is
 * wrap-safe because it is built on `angularDistance`. Pure — the scene reads it
 * each frame to drive seam sharpness/brightness; the Solve check stays a
 * separate scalar test, never 2D pattern matching.
 */
export function proximity(angle: number, target: number): number {
  return 1 - angularDistance(angle, target) / Math.PI;
}

/**
 * Signed shortest-arc delta to rotate `from` toward `to` (radians), in the
 * half-open range (−π, π]. Positive means rotating `from` upward (increasing
 * angle) reaches `to` by the shortest path; negative means downward. Wrap-safe
 * because it is built on `normalizeAngle`.
 */
function signedAngularDelta(from: number, to: number): number {
  const delta = normalizeAngle(to - from);
  return delta > Math.PI ? delta - TWO_PI : delta;
}

/** Tuning for the magnetic-easing alignment assist. */
export type MagneticEaseConfig = {
  /**
   * Assist strength: the fraction of the remaining shortest-arc distance the
   * correction closes at the band center (where the pull is strongest). `0`
   * disables the assist. Values are clamped so the correction never overshoots.
   */
  strength: number;
  /**
   * Influence band (radians, shortest-arc) around the target within which the
   * pull engages. Outside the band the correction is `0`, leaving the drag fully
   * free.
   */
  band: number;
};

/**
 * Magnetic-easing assist for the Lock Tumbler: an angular correction (radians)
 * that gently pulls the rotation `angle` toward the Target Zone `target` so
 * landing a Solve feels satisfying rather than fiddly. The pull engages only
 * within `band` of the target and ramps up from `0` at the band edge to its
 * strongest at the target, scaling with `strength`. Outside the band it returns
 * `0`, so dragging far from the target is unobstructed.
 *
 * The correction is directed toward the target (same sign as the shortest-arc
 * delta) and its magnitude is bounded by the remaining distance, so applying it
 * (`angle + correction`) can never overshoot past the target into oscillation.
 * Pure and wrap-safe across the 0/2π boundary; the scene composes it with the
 * rotation integrator each frame, reading the live (re-randomized) target.
 */
export function magneticEase(angle: number, target: number, config: MagneticEaseConfig): number {
  const { strength, band } = config;
  if (band <= 0 || strength <= 0) return 0;

  const delta = signedAngularDelta(angle, target);
  const distance = Math.abs(delta);
  if (distance >= band) return 0;

  // Ramp from 0 at the band edge to 1 at the target, scaled by strength and
  // clamped to [0, 1] so the correction is at most the full remaining distance —
  // it can reach the target but never cross it.
  const ramp = 1 - distance / band;
  const factor = Math.min(strength * ramp, 1);
  return factor * delta;
}

/**
 * The Solve condition for Shader Lockpicking: `true` exactly when the Lock
 * Tumbler's rotation `angle` is within `tolerance` of the Target Zone `target`,
 * measured by shortest-arc distance (so it is wrap-safe across 0/2π). This is
 * the single cheap scalar check that defines a Solve — never 2D pattern
 * matching against the keyhole silhouette.
 */
export function isSolved(angle: number, target: number, tolerance: number): boolean {
  return angularDistance(angle, target) < tolerance;
}

/**
 * Re-arm the puzzle with a fresh Target Zone angle that is guaranteed to be at
 * least `minSeparation` (shortest-arc, radians) away from `currentAngle`, so the
 * new round is never trivially already solved. `rng` is injected (a `() =>
 * number` in `[0, 1)`) so the choice is deterministic under test.
 *
 * The angles within `minSeparation` on either side of `currentAngle` are
 * forbidden; the allowed offsets run from `minSeparation` to `2π −
 * minSeparation`. Mapping `rng()` linearly onto that band keeps the shortest-arc
 * distance ≥ `minSeparation` for every value of `rng()` (requires
 * `minSeparation ≤ π`). The result is normalized into `[0, 2π)`.
 */
export function pickNewTarget(
  currentAngle: number,
  rng: () => number,
  minSeparation: number,
): number {
  const allowedSpan = TWO_PI - 2 * minSeparation;
  const offset = minSeparation + rng() * allowedSpan;
  return normalizeAngle(currentAngle + offset);
}

/** Live rotation state for the Lock Tumbler: current angle and angular velocity. */
export type RotationState = {
  angle: number;
  velocity: number;
};

/** Per-frame input to the rotation integrator. */
export type RotationInput = {
  /** Angular delta (radians) contributed by the user's drag this frame. */
  dragDelta: number;
  /** Frame time in seconds (e.g. R3F's useFrame delta). */
  dt: number;
};

/** Tuning for the rotation integrator. */
export type RotationConfig = {
  /** Velocity decay rate per second applied once the drag is released. */
  damping: number;
  /** Upper bound on `dt`, guarding against a large post-tab-away jump. */
  maxDt: number;
};

/**
 * Advance the Lock Tumbler's rotation by one frame. While the user is dragging
 * the drag delta rotates the tumbler directly and seeds angular velocity for
 * release inertia; once released the tumbler coasts on that velocity and the
 * velocity decays via damping. Oversized `dt` is clamped to `config.maxDt` so a
 * backgrounded tab does not cause a large rotation jump. Deterministic given
 * fixed inputs.
 */
export function integrate(
  state: RotationState,
  input: RotationInput,
  config: RotationConfig,
): RotationState {
  const dt = Math.min(input.dt, config.maxDt);

  if (input.dragDelta !== 0) {
    // Active drag: rotate directly and track the drag rate as the live velocity
    // so releasing the pointer carries inertia.
    const velocity = dt > 0 ? input.dragDelta / dt : state.velocity;
    return {
      angle: normalizeAngle(state.angle + input.dragDelta),
      velocity,
    };
  }

  // Released: coast on inertia, then decay the velocity. Exponential damping is
  // frame-rate independent so the feel is consistent across delta sizes.
  return {
    angle: normalizeAngle(state.angle + state.velocity * dt),
    velocity: state.velocity * Math.exp(-config.damping * dt),
  };
}
