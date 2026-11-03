import { describe, expect, it } from "vitest";

import { retryLabelFor, retryModeFor } from "@/lib/status";

// Regression tests for execution retry mode safety: a retry must never switch
// modes silently — live stays live, simulation stays simulation, and the UI
// label must always match the mode that actually runs.
describe("retry mode safety", () => {
  it("reruns simulations as simulations", () => {
    expect(retryModeFor("simulation")).toBe("simulation");
  });

  it("reruns live executions as live — never silently downgraded", () => {
    expect(retryModeFor("live")).toBe("live");
    expect(retryModeFor(retryModeFor("live"))).toBe("live");
    expect(retryModeFor(retryModeFor("simulation"))).toBe("simulation");
  });

  it("treats unknown or missing modes as the safe default (simulation)", () => {
    expect(retryModeFor(undefined)).toBe("simulation");
    expect(retryModeFor(null)).toBe("simulation");
    expect(retryModeFor("")).toBe("simulation");
    expect(retryModeFor("garbage")).toBe("simulation");
  });

  it("labels retries honestly — a live retry is never called a simulation", () => {
    expect(retryLabelFor("simulation")).toBe("Retry simulation");
    expect(retryLabelFor("live")).toBe("Retry live execution");
    expect(retryLabelFor(retryModeFor("live"))).not.toMatch(/simulation/i);
    expect(retryLabelFor(retryModeFor("simulation"))).not.toMatch(/live/i);
  });
});
