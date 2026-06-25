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
