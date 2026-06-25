import { describe, expect, it } from "vitest";
import {
  angularDistance,
  integrate,
  isSolved,
  magneticEase,
  normalizeAngle,
  pickNewTarget,
  proximity,
} from "./puzzle";

const TWO_PI = Math.PI * 2;

// Signed shortest-arc residual from `angle` to `target`, in (−π, π]. A test-side
// helper to assert the easing pulls toward the target without crossing it.
function signedDelta(angle: number, target: number): number {
  const delta = normalizeAngle(target - angle);
  return delta > Math.PI ? delta - TWO_PI : delta;
}

describe("normalizeAngle", () => {
  it("leaves an angle already in [0, 2π) unchanged", () => {
    expect(normalizeAngle(1.2)).toBeCloseTo(1.2, 10);
  });

  it("wraps negative angles into [0, 2π)", () => {
    expect(normalizeAngle(-0.5)).toBeCloseTo(TWO_PI - 0.5, 10);
    expect(normalizeAngle(-TWO_PI - 0.5)).toBeCloseTo(TWO_PI - 0.5, 10);
  });

  it("wraps angles greater than 2π into [0, 2π)", () => {
    expect(normalizeAngle(TWO_PI + 0.5)).toBeCloseTo(0.5, 10);
    expect(normalizeAngle(3 * TWO_PI + 0.5)).toBeCloseTo(0.5, 10);
  });

  it("maps exact multiples of 2π to 0", () => {
    expect(normalizeAngle(TWO_PI)).toBeCloseTo(0, 10);
    expect(normalizeAngle(-TWO_PI)).toBeCloseTo(0, 10);
  });
});

describe("angularDistance", () => {
  it("returns the direct gap for angles within the same half-turn", () => {
    expect(angularDistance(1.0, 1.5)).toBeCloseTo(0.5, 10);
  });

  it("is symmetric in its arguments", () => {
    expect(angularDistance(0.3, 2.1)).toBeCloseTo(angularDistance(2.1, 0.3), 10);
  });

  it("never exceeds π — it takes the shortest arc", () => {
    // 0 and 1.5π are 1.5π apart the long way, but only 0.5π the short way.
    expect(angularDistance(0, 1.5 * Math.PI)).toBeCloseTo(0.5 * Math.PI, 10);
  });

  it("is continuous across the 0/2π wrap", () => {
    // A target just past the wrap should be a tiny distance from just before it.
    expect(angularDistance(0.05, TWO_PI - 0.05)).toBeCloseTo(0.1, 10);
  });

  it("is zero for identical angles, including across the wrap", () => {
    expect(angularDistance(1.7, 1.7)).toBeCloseTo(0, 10);
    expect(angularDistance(0, TWO_PI)).toBeCloseTo(0, 10);
  });
});

describe("proximity", () => {
  it("is maximal (1) when the angle equals the target", () => {
    expect(proximity(1.0, 1.0)).toBeCloseTo(1, 10);
  });

  it("is maximal (1) at the target across the 0/2π wrap", () => {
    expect(proximity(0, TWO_PI)).toBeCloseTo(1, 10);
  });

  it("is minimal (0) at the opposite side of the target", () => {
    expect(proximity(0, Math.PI)).toBeCloseTo(0, 10);
  });

  it("increases monotonically as the angle approaches the target", () => {
    const target = 1.0;
    let previous = -Infinity;
    // Sweep from the far side (distance π) inward to the target.
    for (let d = Math.PI; d >= -1e-9; d -= Math.PI / 12) {
      const value = proximity(target + d, target);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it("is wrap-safe: an angle just before 2π is near a target just after 0", () => {
    // 0.1 rad apart across the wrap → proximity reads as that small distance.
    expect(proximity(TWO_PI - 0.05, 0.05)).toBeCloseTo(1 - 0.1 / Math.PI, 10);
  });
});

describe("isSolved", () => {
  it("is true just inside the tolerance boundary", () => {
    // Shortest-arc distance 0.09 < tolerance 0.1 → solved.
    expect(isSolved(1.0, 1.09, 0.1)).toBe(true);
  });

  it("is false just outside the tolerance boundary", () => {
    // Shortest-arc distance 0.11 > tolerance 0.1 → not solved.
    expect(isSolved(1.0, 1.11, 0.1)).toBe(false);
  });

  it("is symmetric in angle and target around the boundary", () => {
    expect(isSolved(1.09, 1.0, 0.1)).toBe(true);
    expect(isSolved(1.11, 1.0, 0.1)).toBe(false);
  });

  it("is wrap-safe just inside the boundary across the 0/2π seam", () => {
    // angle just before 2π, target just after 0 → distance 0.04 < 0.1.
    expect(isSolved(TWO_PI - 0.02, 0.02, 0.1)).toBe(true);
  });

  it("is wrap-safe just outside the boundary across the 0/2π seam", () => {
    // distance 0.4 across the wrap → outside tolerance 0.1.
    expect(isSolved(TWO_PI - 0.2, 0.2, 0.1)).toBe(false);
  });
});

describe("pickNewTarget", () => {
  const minSeparation = 0.9;

  it("returns a target at least minSeparation from the current angle across an rng sweep", () => {
    const current = 1.3;
    for (let i = 0; i <= 20; i++) {
      const r = i / 20; // 0, 0.05, … , 1.0 — but rng is [0,1); use i/21-style guard below
      const rng = () => Math.min(r, 0.999999);
      const target = pickNewTarget(current, rng, minSeparation);
      expect(angularDistance(target, current)).toBeGreaterThanOrEqual(minSeparation - 1e-9);
    }
  });

  it("keeps the new target within [0, 2π) across an rng sweep", () => {
    const current = 5.9; // near the wrap, so an unwrapped target would exceed 2π
    for (let i = 0; i <= 20; i++) {
      const rng = () => Math.min(i / 20, 0.999999);
      const target = pickNewTarget(current, rng, minSeparation);
      expect(target).toBeGreaterThanOrEqual(0);
      expect(target).toBeLessThan(TWO_PI);
    }
  });

  it("honors minSeparation when rng is near 0", () => {
    const current = 0.5;
    const target = pickNewTarget(current, () => 0, minSeparation);
    expect(angularDistance(target, current)).toBeGreaterThanOrEqual(minSeparation - 1e-9);
    expect(target).toBeGreaterThanOrEqual(0);
    expect(target).toBeLessThan(TWO_PI);
  });

  it("honors minSeparation when rng is near 1", () => {
    const current = 0.5;
    const target = pickNewTarget(current, () => 0.999999, minSeparation);
    expect(angularDistance(target, current)).toBeGreaterThanOrEqual(minSeparation - 1e-9);
    expect(target).toBeGreaterThanOrEqual(0);
    expect(target).toBeLessThan(TWO_PI);
  });

  it("is deterministic given the same injected rng", () => {
    const rng = () => 0.42;
    expect(pickNewTarget(2.0, rng, minSeparation)).toBeCloseTo(
      pickNewTarget(2.0, rng, minSeparation),
      10,
    );
  });
});

describe("magneticEase", () => {
  it("returns a correction directed toward the target when inside the band", () => {
    // angle 1.0, target 1.3 → the assist should nudge the angle forward (+).
    const correction = magneticEase(1.0, 1.3, { strength: 0.2, band: 0.6 });
    expect(correction).toBeGreaterThan(0);
  });

  it("returns zero correction outside the influence band (far from target)", () => {
    // Shortest-arc distance π ≫ band → no pull at all.
    expect(magneticEase(0, Math.PI, { strength: 0.5, band: 0.6 })).toBe(0);
    // Just outside the band edge also yields no pull.
    expect(magneticEase(1.0, 1.7, { strength: 0.5, band: 0.6 })).toBe(0);
  });

  it("pulls toward a target that is behind the current angle (negative direction)", () => {
    // angle 1.3, target 1.0 → the assist should nudge the angle backward (−).
    const correction = magneticEase(1.3, 1.0, { strength: 0.2, band: 0.6 });
    expect(correction).toBeLessThan(0);
  });

  it("scales the correction with strength", () => {
    // Below the no-overshoot clamp, the correction is linear in strength, so
    // doubling the strength doubles the pull at the same angle/target.
    const weak = magneticEase(1.0, 1.3, { strength: 0.1, band: 0.6 });
    const strong = magneticEase(1.0, 1.3, { strength: 0.2, band: 0.6 });
    expect(strong).toBeCloseTo(2 * weak, 10);
  });

  it("never overshoots past the target across a sweep of offsets inside the band", () => {
    // Even at an aggressive strength, applying the correction must move toward
    // the target without crossing it: the residual distance stays the same sign
    // (no oscillation) and never grows. Swept on both sides of the target.
    const target = 2.0;
    const band = 0.6;
    for (let offset = -band + 0.01; offset < band; offset += 0.02) {
      const angle = target + offset;
      const before = signedDelta(angle, target);
      const correction = magneticEase(angle, target, { strength: 0.95, band });
      const after = signedDelta(angle + correction, target);
      // Same sign (or landed exactly): no flip across the target.
      expect(Math.sign(after) === Math.sign(before) || after === 0).toBe(true);
      // Monotone: never further from the target than before.
      expect(Math.abs(after)).toBeLessThanOrEqual(Math.abs(before) + 1e-9);
    }
  });

  it("is wrap-safe across the 0/2π boundary", () => {
    // angle just before 2π, target just after 0 → shortest arc is a tiny forward
    // step across the seam, so the pull is small, positive, and crosses the wrap.
    const angle = TWO_PI - 0.05;
    const target = 0.05;
    const correction = magneticEase(angle, target, { strength: 0.3, band: 0.6 });
    expect(correction).toBeGreaterThan(0);
    // It must not overshoot the 0.1-rad shortest-arc gap.
    expect(correction).toBeLessThanOrEqual(0.1 + 1e-9);

    // A target just *before* the seam from an angle just after it pulls backward
    // across the wrap (negative), still bounded by the shortest-arc gap.
    const back = magneticEase(0.05, TWO_PI - 0.05, { strength: 0.3, band: 0.6 });
    expect(back).toBeLessThan(0);
    expect(Math.abs(back)).toBeLessThanOrEqual(0.1 + 1e-9);
  });

  it("returns zero when strength or band is non-positive", () => {
    expect(magneticEase(1.0, 1.1, { strength: 0, band: 0.6 })).toBe(0);
    expect(magneticEase(1.0, 1.1, { strength: 0.3, band: 0 })).toBe(0);
  });
});

describe("integrate", () => {
  const config = { damping: 4, maxDt: 0.05 };

  it("rotates the angle by the active drag delta", () => {
    const next = integrate(
      { angle: 1.0, velocity: 0 },
      { dragDelta: 0.2, dt: 0.016 },
      config,
    );
    expect(next.angle).toBeCloseTo(1.2, 10);
  });

  it("seeds angular velocity from the drag rate so a release keeps inertia", () => {
    const next = integrate(
      { angle: 0, velocity: 0 },
      { dragDelta: 0.2, dt: 0.02 },
      config,
    );
    expect(next.velocity).toBeCloseTo(0.2 / 0.02, 10);
  });

  it("coasts on velocity and damps it once the drag is released", () => {
    const next = integrate(
      { angle: 0, velocity: 2 },
      { dragDelta: 0, dt: 0.02 },
      config,
    );
    // Coasts: the angle advances by the carried velocity over the frame.
    expect(next.angle).toBeCloseTo(0.04, 10);
    // Damps: velocity decays toward zero without reversing sign.
    expect(next.velocity).toBeGreaterThan(0);
    expect(next.velocity).toBeLessThan(2);
  });

  it("is deterministic for identical inputs", () => {
    const args = [
      { angle: 0.7, velocity: 1.3 },
      { dragDelta: 0, dt: 0.02 },
      config,
    ] as const;
    expect(integrate(...args)).toEqual(integrate(...args));
  });

  it("clamps an oversized dt to the configured max (post-tab-away guard)", () => {
    // A multi-second delta after a backgrounded tab must not produce a large
    // rotation jump: it advances as if only maxDt elapsed.
    const afterTabAway = integrate(
      { angle: 0, velocity: 2 },
      { dragDelta: 0, dt: 5 },
      config,
    );
    const atMaxDt = integrate(
      { angle: 0, velocity: 2 },
      { dragDelta: 0, dt: config.maxDt },
      config,
    );
    expect(afterTabAway.angle).toBeCloseTo(atMaxDt.angle, 10);
    expect(afterTabAway.velocity).toBeCloseTo(atMaxDt.velocity, 10);
    expect(afterTabAway.angle).toBeCloseTo(2 * config.maxDt, 10);
  });
});
