import { describe, expect, it } from "vitest";

import {
  atan,
  atan2,
  cos,
  ctxMath,
  exp,
  log,
  log2,
  pow,
  pow2i,
  sin,
  tan,
} from "../src/math/index.js";

/**
 * `ctx.math` must be a *correct* replacement for the platform transcendentals,
 * not merely a deterministic one — otherwise a bug looks like a design choice.
 * The bounds asserted here are the ones documented in `src/math/index.ts`.
 */

const SIN_COS_ABS = 2.3e-16;
const REL = 4.3e-16;

function relErr(actual: number, expected: number): number {
  if (expected === 0) return Math.abs(actual);
  return Math.abs(actual - expected) / Math.abs(expected);
}

describe("ctx.math trigonometry", () => {
  it("matches known values of sin", () => {
    expect(Math.abs(sin(1) - 0.8414709848078965)).toBeLessThanOrEqual(SIN_COS_ABS);
    expect(Math.abs(sin(0))).toBe(0);
    expect(Math.abs(sin(Math.PI))).toBeLessThan(1e-15);
    expect(Math.abs(sin(-2.5) - -0.5984721441039564)).toBeLessThanOrEqual(SIN_COS_ABS);
  });

  it("matches known values of cos", () => {
    expect(cos(0)).toBe(1);
    expect(Math.abs(cos(1) - 0.5403023058681398)).toBeLessThanOrEqual(SIN_COS_ABS);
    expect(Math.abs(cos(-3.7) - -0.8481000317104081)).toBeLessThanOrEqual(SIN_COS_ABS);
  });

  it("stays within 1 ulp across a wide sweep", () => {
    let worstSin = 0;
    let worstCos = 0;
    for (let i = -50000; i < 50000; i++) {
      const x = i / 97.13;
      worstSin = Math.max(worstSin, Math.abs(sin(x) - Math.sin(x)));
      worstCos = Math.max(worstCos, Math.abs(cos(x) - Math.cos(x)));
    }
    expect(worstSin).toBeLessThanOrEqual(SIN_COS_ABS);
    expect(worstCos).toBeLessThanOrEqual(SIN_COS_ABS);
  });

  it("survives large-argument range reduction up to 1e6", () => {
    for (const x of [1e5, 1e6, -1e6, 123456.789]) {
      expect(Math.abs(sin(x) - Math.sin(x))).toBeLessThanOrEqual(SIN_COS_ABS);
      expect(Math.abs(cos(x) - Math.cos(x))).toBeLessThanOrEqual(SIN_COS_ABS);
    }
  });

  it("computes tan as sin/cos", () => {
    expect(relErr(tan(0.7), 0.8422883804630794)).toBeLessThan(1e-15);
  });
});

describe("ctx.math exp / log / pow", () => {
  it("matches known values", () => {
    expect(relErr(exp(1), 2.718281828459045)).toBeLessThanOrEqual(REL);
    expect(exp(0)).toBe(1);
    expect(relErr(exp(-20), 2.061153622438558e-9)).toBeLessThanOrEqual(REL);
    expect(relErr(log(2), 0.6931471805599453)).toBeLessThanOrEqual(REL);
    expect(log(1)).toBe(0);
    expect(relErr(log2(1024), 10)).toBeLessThanOrEqual(REL);
  });

  it("stays within bounds across a sweep", () => {
    let worstExp = 0;
    for (let i = -70000; i < 70000; i += 7) {
      const x = i / 100;
      worstExp = Math.max(worstExp, relErr(exp(x), Math.exp(x)));
    }
    expect(worstExp).toBeLessThanOrEqual(REL);

    let worstLog = 0;
    for (let i = 1; i < 200000; i += 11) {
      const x = i / 1000;
      worstLog = Math.max(worstLog, relErr(log(x), Math.log(x)));
    }
    expect(worstLog).toBeLessThanOrEqual(REL);
  });

  it("handles exp / log edge cases", () => {
    expect(exp(1000)).toBe(Number.POSITIVE_INFINITY);
    expect(exp(-1000)).toBe(0);
    expect(log(0)).toBe(Number.NEGATIVE_INFINITY);
    expect(Number.isNaN(log(-1))).toBe(true);
    expect(relErr(log(1e300), 690.7755278982137)).toBeLessThanOrEqual(REL);
    // subnormal input still decomposes correctly
    expect(relErr(log(5e-320), Math.log(5e-320))).toBeLessThanOrEqual(1e-14);
  });

  it("computes integer powers exactly", () => {
    expect(pow(2, 10)).toBe(1024);
    expect(pow(3, 5)).toBe(243);
    expect(pow(2, -3)).toBe(0.125);
    expect(pow(7, 0)).toBe(1);
    expect(pow(1.5, 1)).toBe(1.5);
  });

  it("computes fractional powers", () => {
    expect(relErr(pow(2.5, 3.7), Math.pow(2.5, 3.7))).toBeLessThan(1e-14);
    expect(relErr(pow(2, 0.5), Math.SQRT2)).toBeLessThan(1e-14);
    expect(Number.isNaN(pow(-2, 0.5))).toBe(true);
  });

  it("builds exact powers of two", () => {
    expect(pow2i(0)).toBe(1);
    expect(pow2i(10)).toBe(1024);
    expect(pow2i(-53)).toBe(1.1102230246251565e-16);
    expect(pow2i(1023)).toBe(8.98846567431158e307);
    expect(pow2i(1100)).toBe(Number.POSITIVE_INFINITY);
    expect(pow2i(-1074)).toBe(5e-324);
    expect(pow2i(-2000)).toBe(0);
  });
});

describe("ctx.math atan / atan2", () => {
  it("matches known values", () => {
    expect(atan(0)).toBe(0);
    expect(Math.abs(atan(1) - 0.7853981633974483)).toBeLessThanOrEqual(SIN_COS_ABS);
    expect(Math.abs(atan(0.5) - 0.4636476090008061)).toBeLessThanOrEqual(SIN_COS_ABS);
    expect(Math.abs(atan(1000) - Math.atan(1000))).toBeLessThanOrEqual(SIN_COS_ABS);
    expect(atan(Number.POSITIVE_INFINITY)).toBe(Math.PI / 2);
  });

  it("gets every quadrant right", () => {
    const cases: Array<[number, number]> = [
      [3, 4],
      [-3, 4],
      [3, -4],
      [-3, -4],
      [1, 0],
      [-1, 0],
      [0, 1],
    ];
    for (const [y, x] of cases) {
      expect(Math.abs(atan2(y, x) - Math.atan2(y, x))).toBeLessThanOrEqual(SIN_COS_ABS);
    }
  });

  it("stays within 1 ulp across a sweep", () => {
    let worst = 0;
    for (let i = -100000; i < 100000; i += 3) {
      const x = i / 1000;
      worst = Math.max(worst, Math.abs(atan(x) - Math.atan(x)));
    }
    expect(worst).toBeLessThanOrEqual(SIN_COS_ABS);
  });
});

describe("ctx.math surface", () => {
  it("is frozen and complete", () => {
    expect(Object.isFrozen(ctxMath)).toBe(true);
    for (const name of ["sin", "cos", "tan", "atan", "atan2", "exp", "log", "pow", "sqrt"]) {
      expect(typeof (ctxMath as unknown as Record<string, unknown>)[name]).toBe("function");
    }
  });
});
