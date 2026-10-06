import { describe, expect, it } from "vitest";
import {
  DURATION,
  EASE,
  PRESS_DIM,
  PRESS_SCALE,
  motionCssVars,
} from "./motion";

const cssVars = motionCssVars as Record<string, string>;

describe("motion config", () => {
  it("gives CSS the same timings Framer Motion uses", () => {
    expect(cssVars["--motion-press"]).toBe(`${DURATION.press * 1000}ms`);
    expect(cssVars["--motion-fast"]).toBe(`${DURATION.fast * 1000}ms`);
    expect(cssVars["--motion-base"]).toBe(`${DURATION.base * 1000}ms`);
    expect(cssVars["--motion-slow"]).toBe(`${DURATION.slow * 1000}ms`);
  });

  it("gives CSS the same curves and press values", () => {
    expect(cssVars["--motion-ease-out"]).toBe(
      `cubic-bezier(${EASE.out.join(", ")})`,
    );
    expect(cssVars["--motion-ease-in"]).toBe(
      `cubic-bezier(${EASE.in.join(", ")})`,
    );
    expect(cssVars["--motion-press-scale"]).toBe(String(PRESS_SCALE));
    expect(cssVars["--motion-press-dim"]).toBe(String(PRESS_DIM));
  });

  it("keeps taps faster than arrivals and everything inside the 300ms budget", () => {
    expect(DURATION.press).toBeLessThan(DURATION.base);
    expect(Math.max(...Object.values(DURATION))).toBeLessThanOrEqual(0.3);
  });
});
