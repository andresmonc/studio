import { afterEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { i18nProvider } from "./i18n";

afterEach(() => vi.restoreAllMocks());

describe("i18nProvider", () => {
  const tests = [
    { name: "known key", key: "header.logout", options: undefined, fallback: undefined, want: "Logout" },
    { name: "string option is the default", key: "missing.key", options: "Fallback", fallback: undefined, want: "Fallback" },
    { name: "default message", key: "missing.key", options: undefined, fallback: "Default", want: "Default" },
  ];
  for (const tt of tests) {
    it(`translates a ${tt.name}`, () => {
      expect(i18nProvider.translate(tt.key, tt.options, tt.fallback)).toBe(tt.want);
    });
  }

  it("delegates the locale to i18next", async () => {
    const changeLanguage = vi.spyOn(i18n, "changeLanguage");
    await i18nProvider.changeLocale("en");
    expect(changeLanguage).toHaveBeenCalledWith("en");
    expect(i18nProvider.getLocale()).toBe(i18n.language);
  });
});
