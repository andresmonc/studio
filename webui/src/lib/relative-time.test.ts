import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { formatExactDateTime, formatRelativeTime } from "./relative-time";

const NOW = new Date("2026-06-15T12:00:00Z");

beforeAll(() => vi.useFakeTimers({ now: NOW }));
afterAll(() => vi.useRealTimers());

describe("formatRelativeTime", () => {
  const tests = [
    { name: "empty", iso: "", want: "" },
    { name: "invalid", iso: "not a date", want: "" },
    { name: "seconds ago", iso: "2026-06-15T11:59:30Z", want: "30 seconds ago" },
    { name: "uses the coarsest unit", iso: "2026-06-15T09:00:00Z", want: "3 hours ago" },
    { name: "future", iso: "2026-06-18T12:00:00Z", want: "in 3 days" },
    { name: "months ago", iso: "2026-02-15T12:00:00Z", want: "4 months ago" },
    { name: "years ago", iso: "2023-06-15T12:00:00Z", want: "3 years ago" },
  ];
  for (const tt of tests) {
    it(tt.name, () => expect(formatRelativeTime(tt.iso, "en")).toBe(tt.want));
  }
});

describe("formatExactDateTime", () => {
  const tests = [
    { name: "empty", iso: "", want: "" },
    { name: "invalid", iso: "not a date", want: "" },
    { name: "valid", iso: NOW.toISOString(), want: NOW.toLocaleString("en") },
  ];
  for (const tt of tests) {
    it(tt.name, () => expect(formatExactDateTime(tt.iso, "en")).toBe(tt.want));
  }
});
