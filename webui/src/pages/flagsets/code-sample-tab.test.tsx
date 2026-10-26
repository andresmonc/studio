import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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
  CodeBlock: ({ code }: { code: string }) => <pre data-testid="snippet">{code}</pre>,
}));

import { CodeSampleTab } from "./code-sample-tab";

const snippet = () => screen.getByTestId("snippet").textContent ?? "";

beforeEach(() => {
  h.keys = [];
  h.isLoading = false;
  h.isError = false;
  h.copyToClipboard.mockReset().mockResolvedValue(true);
  h.toastSuccess.mockReset();
  h.toastError.mockReset();
});

describe("CodeSampleTab", () => {
  it("for a viewer: skips the key fetch (editor+ only) and shows only the placeholder", () => {
    render(<CodeSampleTab flagsetId="fs-1" canReadKeys={false} />);

    expect(h.enabled).toBe(false);
    expect(snippet()).toContain("<your-api-key>");
    expect(screen.queryByText(/no API key yet/i)).toBeNull();
  });

  it("with no keys: shows the no-key hint, the placeholder, and no key picker", () => {
    h.keys = [];
    render(<CodeSampleTab flagsetId="fs-1" canReadKeys />);

    expect(screen.getByText(/no API key yet/i)).toBeTruthy();
    expect(snippet()).toContain("<your-api-key>");
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("on a failed key fetch: shows the error hint, not the misleading no-key hint", () => {
    h.keys = [];
    h.isError = true;
    render(<CodeSampleTab flagsetId="fs-1" canReadKeys />);

    expect(screen.getByText(/Couldn't load API keys/i)).toBeTruthy();
    expect(screen.queryByText(/no API key yet/i)).toBeNull();
    expect(snippet()).toContain("<your-api-key>");
  });

  it("while loading: shows neither hint", () => {
    h.keys = [];
    h.isLoading = true;
    render(<CodeSampleTab flagsetId="fs-1" canReadKeys />);

    expect(screen.queryByText(/no API key yet/i)).toBeNull();
    expect(screen.queryByText(/Couldn't load API keys/i)).toBeNull();
  });

  it("with one key: embeds that key, hides the hint, and shows the picker", () => {
    h.keys = [{ id: "k1", label: "Prod", apiKey: "goff_abc" }];
    render(<CodeSampleTab flagsetId="fs-1" canReadKeys />);

    expect(snippet()).toContain("goff_abc");
    expect(snippet()).not.toContain("<your-api-key>");
    expect(screen.queryByText(/no API key yet/i)).toBeNull();
    expect(screen.getByRole("combobox")).toBeTruthy();
  });

  it("with multiple keys: defaults to the first key in the snippet", () => {
    h.keys = [
      { id: "k1", label: "First", apiKey: "goff_first" },
      { id: "k2", label: "Second", apiKey: "goff_second" },
    ];
    render(<CodeSampleTab flagsetId="fs-1" canReadKeys />);

    expect(snippet()).toContain("goff_first");
    expect(snippet()).not.toContain("goff_second");
  });

  it("selecting a different key embeds that key in the snippet", async () => {
    const user = userEvent.setup();
    h.keys = [
      { id: "k1", label: "First", apiKey: "goff_first" },
      { id: "k2", label: "Second", apiKey: "goff_second" },
    ];
    render(<CodeSampleTab flagsetId="fs-1" canReadKeys />);
    expect(snippet()).toContain("goff_first");

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Second" }));

    await waitFor(() => expect(snippet()).toContain("goff_second"));
    expect(snippet()).not.toContain("goff_first");
  });

  it("switching language replaces the snippet body", () => {
    h.keys = [];
    render(<CodeSampleTab flagsetId="fs-1" canReadKeys />);

    // Default is Go.
    expect(snippet()).toContain("gofeatureflag.NewProviderWithContext");

    fireEvent.click(screen.getByRole("button", { name: "Python" }));
    expect(snippet()).toContain("gofeatureflag_python_provider");
  });

  it("copy: success path copies the resolved snippet and toasts success", async () => {
    h.keys = [{ id: "k1", label: "Prod", apiKey: "goff_abc" }];
    render(<CodeSampleTab flagsetId="fs-1" canReadKeys />);

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
    render(<CodeSampleTab flagsetId="fs-1" canReadKeys />);

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => expect(h.toastError).toHaveBeenCalled());
    expect(h.toastSuccess).not.toHaveBeenCalled();
  });
});
