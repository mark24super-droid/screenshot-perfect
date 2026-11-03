import { describe, expect, it } from "vitest";

import { openDuringOnboarding } from "@/lib/onboarding-gate";

// Regression tests for the onboarding redirect-loop fix: the _authenticated
// gate must allow exactly the routes onboarding links to, and never more.
describe("onboarding gate allowlist", () => {
  it("keeps ordinary protected pages behind the setup gate", () => {
    expect(openDuringOnboarding("/dashboard")).toBe(false);
    expect(openDuringOnboarding("/automations")).toBe(false);
    expect(openDuringOnboarding("/automations/123")).toBe(false);
    expect(openDuringOnboarding("/templates")).toBe(false);
    expect(openDuringOnboarding("/history")).toBe(false);
    expect(openDuringOnboarding("/billing")).toBe(false);
    expect(openDuringOnboarding("/profile")).toBe(false);
    expect(openDuringOnboarding("/help")).toBe(false);
  });

  it("allows the routes onboarding itself links to", () => {
    expect(openDuringOnboarding("/integrations")).toBe(true);
    expect(openDuringOnboarding("/integrations/")).toBe(true);
    expect(openDuringOnboarding("/integrations/sub")).toBe(true);
    expect(openDuringOnboarding("/settings")).toBe(true);
    expect(openDuringOnboarding("/settings/")).toBe(true);
  });

  it("does not allow prefix look-alikes outside the allowlist", () => {
    expect(openDuringOnboarding("/integrations-other")).toBe(false);
    expect(openDuringOnboarding("/settingsx")).toBe(false);
  });

  it("does not open the root or non-routed paths", () => {
    expect(openDuringOnboarding("")).toBe(false);
    expect(openDuringOnboarding("/")).toBe(false);
    expect(openDuringOnboarding("//evil.example")).toBe(false);
  });
});
