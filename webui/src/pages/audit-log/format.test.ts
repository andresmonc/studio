import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuditEntry } from "@/types/api";
import {
  actorName,
  dayKey,
  dayLabel,
  hash,
  initials,
  isPrimitive,
} from "./format";

const mk = (actorEmail: string | null): AuditEntry => ({
  id: 1,
  occurredAt: new Date().toISOString(),
  action: "update",
  targetType: "flag",
  targetId: "t1",
  actorEmail,
});

const tStub = (k: string) => k;

describe("actorName / initials", () => {
  it("uses the email local part and first two letters", () => {
    expect(actorName(mk("maya@acme.io"))).toBe("maya");
    expect(initials(mk("maya@acme.io"))).toBe("MA");
  });

  it("falls back to system / SY when there is no actor", () => {
    expect(actorName(mk(null))).toBe("system");
    expect(initials(mk(null))).toBe("SY");
  });
});

describe("dayKey", () => {
  it("is equal within a calendar day and differs across days", () => {
    expect(dayKey(new Date(2026, 5, 22, 9, 0))).toBe(
      dayKey(new Date(2026, 5, 22, 23, 59)),
    );
    expect(dayKey(new Date(2026, 5, 22))).not.toBe(dayKey(new Date(2026, 5, 23)));
  });
});

describe("dayLabel", () => {
  // Freeze the clock so the relative-day assertions can't drift at a real
  // midnight boundary.
  afterEach(() => vi.useRealTimers());

  it("labels today and yesterday relative to now", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 22, 12, 0, 0));
    const today = new Date(2026, 5, 22, 8, 30);
    const yesterday = new Date(2026, 5, 21, 23, 0);
    expect(dayLabel(today, tStub)).toBe("auditLog.today");
    expect(dayLabel(yesterday, tStub)).toBe("auditLog.yesterday");
  });

  it("formats older dates instead of using a relative label", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 22, 12, 0, 0));
    const label = dayLabel(new Date(2020, 0, 15), tStub);
    expect(label).not.toBe("auditLog.today");
    expect(label).not.toBe("auditLog.yesterday");
    expect(label).toContain("2020");
  });
});

describe("isPrimitive", () => {
  it("is true for string / number / boolean", () => {
    expect(isPrimitive("x")).toBe(true);
    expect(isPrimitive(3)).toBe(true);
    expect(isPrimitive(false)).toBe(true);
  });

  it("is false for object / array / null / undefined", () => {
    expect(isPrimitive({})).toBe(false);
    expect(isPrimitive([1])).toBe(false);
    expect(isPrimitive(null)).toBe(false);
    expect(isPrimitive(undefined)).toBe(false);
  });
});

describe("hash", () => {
  it("is deterministic, non-negative, and varies by input", () => {
    expect(hash("abc")).toBe(hash("abc"));
    expect(hash("abc")).toBeGreaterThanOrEqual(0);
    expect(hash("different")).not.toBe(hash("abc"));
  });
});
