import { describe, expect, it } from "vitest";

import { monthStartUtc } from "@/lib/usage.server";

// Usage counters only make sense if the TypeScript counter window agrees with
// the database one (migration 0001 uses date_trunc('month', now()) which is
// UTC on Supabase). These tests pin the shared semantics.
describe("monthStartUtc", () => {
  it("truncates to the first day of the current UTC month", () => {
    expect(monthStartUtc(new Date(Date.UTC(2026, 0, 15, 10, 30, 45)))).toEqual(new Date(Date.UTC(2026, 0, 1)));
    expect(monthStartUtc(new Date(Date.UTC(2026, 10, 3, 23, 58)))).toEqual(new Date(Date.UTC(2026, 10, 1)));
  });

  it("is already midnight on the first day", () => {
    expect(monthStartUtc(new Date(Date.UTC(2026, 1, 1, 0, 0, 0)))).toEqual(new Date(Date.UTC(2026, 1, 1)));
  });

  it("rolls across months and years like date_trunc('month', now())", () => {
    expect(monthStartUtc(new Date(Date.UTC(2025, 11, 31, 23, 59, 59)))).toEqual(new Date(Date.UTC(2025, 11, 1)));
    expect(monthStartUtc(new Date(Date.UTC(2027, 0, 1, 0, 0, 1)))).toEqual(new Date(Date.UTC(2027, 0, 1)));
  });

  it("does not mutate the passed date", () => {
    const input = new Date(Date.UTC(2026, 5, 20, 8, 0, 0));
    const before = input.getTime();
    monthStartUtc(input);
    expect(input.getTime()).toBe(before);
  });
});
