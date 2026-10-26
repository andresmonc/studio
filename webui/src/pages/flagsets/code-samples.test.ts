import { describe, it, expect } from "vitest";
import { API_KEY_PLACEHOLDER, CODE_SAMPLES } from "./code-samples";
import { REGISTERED_LANGUAGES } from "@/components/ui/code-block";

describe("CODE_SAMPLES", () => {
  it("is non-empty", () => {
    expect(CODE_SAMPLES.length).toBeGreaterThan(0);
  });

  it("every sample embeds the API key placeholder so a key can be injected", () => {
    for (const s of CODE_SAMPLES) {
      expect(s.code, `sample "${s.id}" must contain ${API_KEY_PLACEHOLDER}`).toContain(
        API_KEY_PLACEHOLDER,
      );
    }
  });

  it("has unique ids and non-empty labels", () => {
    const ids = CODE_SAMPLES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of CODE_SAMPLES) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.lang.length).toBeGreaterThan(0);
    }
  });

  it("every sample uses a language registered with the highlighter", () => {
    const registered = new Set(REGISTERED_LANGUAGES);
    for (const s of CODE_SAMPLES) {
      expect(
        registered.has(s.lang),
        `sample "${s.id}" uses unregistered lang "${s.lang}"`,
      ).toBe(true);
    }
  });
});
