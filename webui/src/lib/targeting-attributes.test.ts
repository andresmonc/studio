import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PREDEFINED_ATTRIBUTES,
  getRememberedAttributes,
  rememberAttribute,
} from "./targeting-attributes";

// Deterministic in-memory localStorage so the unit tests exercise the util's
// logic regardless of the jsdom storage implementation.
beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("targeting-attributes", () => {
  it("returns [] when nothing is stored", () => {
    expect(getRememberedAttributes()).toEqual([]);
  });

  it("remembers a typed attribute (trimmed)", () => {
    rememberAttribute("  plan  ");
    expect(getRememberedAttributes()).toEqual(["plan"]);
  });

  it("skips predefined attributes and empty values", () => {
    rememberAttribute(PREDEFINED_ATTRIBUTES[0]);
    rememberAttribute("   ");
    expect(getRememberedAttributes()).toEqual([]);
  });

  it("dedupes and orders most-recent-first", () => {
    rememberAttribute("plan");
    rememberAttribute("region");
    rememberAttribute("plan");
    expect(getRememberedAttributes()).toEqual(["plan", "region"]);
  });

  it("caps at 50, keeping the most recent", () => {
    for (let i = 0; i < 60; i++) rememberAttribute(`attr${i}`);
    const list = getRememberedAttributes();
    expect(list).toHaveLength(50);
    expect(list[0]).toBe("attr59");
    expect(list).not.toContain("attr0");
  });

  it("returns [] for corrupt storage", () => {
    localStorage.setItem("goff:targeting-attributes", "not json");
    expect(getRememberedAttributes()).toEqual([]);
  });
});
