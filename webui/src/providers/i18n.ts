import type { I18nProvider } from "@refinedev/core";
import i18n from "@/i18n";

export const i18nProvider: I18nProvider = {
  translate: (key: string, options?: unknown, defaultMessage?: string) => {
    if (typeof options === "string") {
      return i18n.t(key, { defaultValue: options });
    }
    return i18n.t(key, {
      defaultValue: defaultMessage,
      ...(options as Record<string, unknown> | undefined),
    });
  },
  changeLocale: (lang: string) => i18n.changeLanguage(lang),
  getLocale: () => i18n.language,
};
