import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Flag } from "@/types/api";

// Shared, hoisted mock state the module mocks below read from.
const h = vi.hoisted(() => ({
  enabled: undefined as boolean | undefined,
  keys: [] as Array<{ id: string; label?: string; apiKey: string }>,
  isLoading: false,
  isError: false,
  copyToClipboard: vi.fn().mockResolvedValue(true),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@refinedev/core", async () => {
  const en = (await import("@/i18n/locales/en.json")).default as Record<
    string,
    unknown
  >;
  const resolve = (key: string): unknown =>
    key.split(".").reduce<unknown>(
      (o, p) => (o && typeof o === "object" ? (o as never)[p] : undefined),
      en,
    );
  const t = (key: string) => {
    const s = resolve(key);
    return typeof s === "string" ? s : key;
  };
  return {
    useTranslate: () => t,
    useCustom: (args: { queryOptions?: { enabled?: boolean } }) => {
      h.enabled = args.queryOptions?.enabled ?? true;
      return {
        query: {
          data: { data: h.keys },
          isLoading: h.isLoading,
          isError: h.isError,
          refetch: vi.fn(),
        },
      };
    },
  };
});

vi.mock("@/lib/clipboard", () => ({
  copyToClipboard: (v: string) => h.copyToClipboard(v),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => h.toastSuccess(...a),
    error: (...a: unknown[]) => h.toastError(...a),
  },
}));

// Isolate the heavy syntax highlighter — assert on the raw snippet text instead.
vi.mock("@/components/ui/code-block", () => ({
  CodeBlock: ({ code }: { code: string }) => (
    <pre data-testid="snippet">{code}</pre>
  ),
}));

import { FlagCodeSampleTab } from "./flag-code-sample-tab";

const snippet = () => screen.getByTestId("snippet").textContent ?? "";

function makeFlag(overrides: Partial<Flag> = {}): Flag {
  return {
    id: "flag-1",
    flagsetId: "fs-1",
    name: "checkout-redesign",
    disabled: false,
    payload: { variations: { enabled: true, disabled: false } },
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

beforeEach(() => {
  h.keys = [];
  h.isLoading = false;
  h.isError = false;
  h.copyToClipboard.mockReset().mockResolvedValue(true);
  h.toastSuccess.mockReset();
  h.toastError.mockReset();
});

describe("FlagCodeSampleTab", () => {
  it("for a viewer: skips the key fetch (editor+ only) and shows only the placeholder", () => {
    render(<FlagCodeSampleTab flag={makeFlag()} canReadKeys={false} />);

    expect(h.enabled).toBe(false);
    expect(snippet()).toContain("<your-api-key>");
    expect(screen.queryByText(/no API key yet/i)).toBeNull();
  });

  it("shows provider setup + a typed evaluation that embeds the flag name", () => {
    render(<FlagCodeSampleTab flag={makeFlag()} canReadKeys />);

    // Default language is Go.
    expect(snippet()).toContain("gofeatureflag.NewProviderWithContext");
    expect(snippet()).toContain("BooleanValue");
    expect(snippet()).toContain("checkout-redesign");
  });

  it("uses the evaluation method matching the flag's inferred type", () => {
    render(
      <FlagCodeSampleTab
        canReadKeys
        flag={makeFlag({
          name: "welcome-banner",
          payload: { variations: { a: "hello", b: "world" } },
        })}
      />,
    );

    // A string flag must call StringValue, not BooleanValue.
    expect(snippet()).toContain("StringValue");
    expect(snippet()).not.toContain("BooleanValue");
    expect(snippet()).toContain("welcome-banner");
  });

  it("with no keys: shows the no-key hint, the placeholder, and no key picker", () => {
    h.keys = [];
    render(<FlagCodeSampleTab flag={makeFlag()} canReadKeys />);

    expect(screen.getByText(/no API key yet/i)).toBeTruthy();
    expect(snippet()).toContain("<your-api-key>");
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("on a failed key fetch: shows the error hint, not the no-key hint", () => {
    h.isError = true;
    render(<FlagCodeSampleTab flag={makeFlag()} canReadKeys />);

    expect(screen.getByText(/Couldn't load API keys/i)).toBeTruthy();
    expect(screen.queryByText(/no API key yet/i)).toBeNull();
    expect(snippet()).toContain("<your-api-key>");
  });

  it("while keys are loading: shows neither the no-key nor the error hint", () => {
    h.isLoading = true;
    h.keys = [];
    render(<FlagCodeSampleTab flag={makeFlag()} canReadKeys />);

    // The no-key hint is gated on `!isLoading` to avoid flashing it mid-fetch.
    expect(screen.queryByText(/no API key yet/i)).toBeNull();
    expect(screen.queryByText(/Couldn't load API keys/i)).toBeNull();
    expect(snippet()).toContain("<your-api-key>");
  });

  it("with one key: embeds that key, hides the hint, and shows the picker", () => {
    h.keys = [{ id: "k1", label: "Prod", apiKey: "goff_abc" }];
    render(<FlagCodeSampleTab flag={makeFlag()} canReadKeys />);

    expect(snippet()).toContain("goff_abc");
    expect(snippet()).not.toContain("<your-api-key>");
    expect(screen.queryByText(/no API key yet/i)).toBeNull();
    expect(screen.getByRole("combobox")).toBeTruthy();
  });

  it("selecting a different key embeds that key in the snippet", async () => {
    const user = userEvent.setup();
    h.keys = [
      { id: "k1", label: "First", apiKey: "goff_first" },
      { id: "k2", label: "Second", apiKey: "goff_second" },
    ];
    render(<FlagCodeSampleTab flag={makeFlag()} canReadKeys />);
    expect(snippet()).toContain("goff_first");

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Second" }));

    await waitFor(() => expect(snippet()).toContain("goff_second"));
    expect(snippet()).not.toContain("goff_first");
  });

  it("falls back to the key id in the picker when a key has no label", async () => {
    const user = userEvent.setup();
    h.keys = [{ id: "key-no-label", apiKey: "goff_abc" }];
    render(<FlagCodeSampleTab flag={makeFlag()} canReadKeys />);

    await user.click(screen.getByRole("combobox"));
    expect(
      await screen.findByRole("option", { name: "key-no-label" }),
    ).toBeTruthy();
  });

  it("switching language replaces the snippet body but keeps the flag", () => {
    render(<FlagCodeSampleTab flag={makeFlag()} canReadKeys />);
    expect(snippet()).toContain("gofeatureflag.NewProviderWithContext");

    fireEvent.click(screen.getByRole("button", { name: "Python" }));
    expect(snippet()).toContain("gofeatureflag_python_provider");
    expect(snippet()).toContain("get_boolean_value");
    expect(snippet()).toContain("checkout-redesign");
  });

  it("copy: success path copies the resolved snippet and toasts success", async () => {
    h.keys = [{ id: "k1", label: "Prod", apiKey: "goff_abc" }];
    render(<FlagCodeSampleTab flag={makeFlag()} canReadKeys />);

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() =>
      expect(h.copyToClipboard).toHaveBeenCalledWith(
        expect.stringContaining("goff_abc"),
      ),
    );
    expect(h.toastSuccess).toHaveBeenCalled();
    expect(h.toastError).not.toHaveBeenCalled();
  });

  it("copy: failure path toasts an error", async () => {
    h.copyToClipboard.mockResolvedValue(false);
    h.keys = [{ id: "k1", label: "Prod", apiKey: "goff_abc" }];
    render(<FlagCodeSampleTab flag={makeFlag()} canReadKeys />);

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => expect(h.toastError).toHaveBeenCalled());
    expect(h.toastSuccess).not.toHaveBeenCalled();
  });

  it("embeds a key containing $ sequences verbatim (function-replacement guard)", () => {
    // The string form of replaceAll would treat `$2`/`$$` as replacement
    // patterns and mangle the key; the function form must keep it verbatim.
    h.keys = [{ id: "k1", label: "Prod", apiKey: "goff_$2_$$secret" }];
    render(<FlagCodeSampleTab flag={makeFlag()} canReadKeys />);

    expect(snippet()).toContain("goff_$2_$$secret");
  });

  it("falls back to the placeholder when the keys payload is not an array", () => {
    // Defends the Array.isArray guard: a non-array (or undefined) response must
    // degrade to the keyless state, not throw.
    h.keys = undefined as never;
    render(<FlagCodeSampleTab flag={makeFlag()} canReadKeys />);

    expect(snippet()).toContain("<your-api-key>");
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("drops a stale selection and falls back to the first key when keys change", async () => {
    const user = userEvent.setup();
    h.keys = [
      { id: "k1", label: "First", apiKey: "goff_first" },
      { id: "k2", label: "Second", apiKey: "goff_second" },
    ];
    const { rerender } = render(<FlagCodeSampleTab flag={makeFlag()} canReadKeys />);

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Second" }));
    await waitFor(() => expect(snippet()).toContain("goff_second"));

    // The selected key disappears from the list — effectiveKeyId must fall back
    // to the first available key rather than the placeholder or the stale key.
    h.keys = [{ id: "k1", label: "First", apiKey: "goff_first" }];
    rerender(<FlagCodeSampleTab flag={makeFlag()} canReadKeys />);

    await waitFor(() => expect(snippet()).toContain("goff_first"));
    expect(snippet()).not.toContain("goff_second");
  });

  it("shows a boolean badge for a variation-less (unknown) flag", () => {
    // inferFlagType returns "unknown" with no variations; the sample defaults to
    // boolean, so the badge must read "boolean", not a mismatched "unknown".
    render(<FlagCodeSampleTab flag={makeFlag({ payload: { variations: {} } })} canReadKeys />);

    expect(screen.getByText("boolean")).toBeTruthy();
    expect(screen.queryByText("unknown")).toBeNull();
    expect(snippet()).toContain("BooleanValue");
  });
});
