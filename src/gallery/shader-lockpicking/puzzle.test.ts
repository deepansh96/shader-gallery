import { describe, expect, it } from "vitest";
import { angularDistance, integrate, normalizeAngle } from "./puzzle";

const TWO_PI = Math.PI * 2;

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
