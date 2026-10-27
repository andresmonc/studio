import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const h = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  isError: false,
  url: "",
  copyToClipboard: vi.fn(),
}));

vi.mock("@refinedev/core", () => ({
  useTranslate: () => (key: string) => key,
  useCustom: (args: { url: string }) => {
    h.url = args.url;
    return { query: { data: { data: h.data }, isLoading: h.isLoading, isError: h.isError } };
  },
}));
vi.mock("@/lib/clipboard", () => ({
  copyToClipboard: (v: string) => h.copyToClipboard(v),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CompanyRelayProxyCard } from "./relay-proxy-card";

const companyId = "11111111-aaaa-bbbb-cccc-000000000001";
const yaml = 'server:\n  mode: http\nflagSets:\n  - name: "fs-1"\n';

beforeEach(() => {
  h.data = yaml;
  h.isLoading = false;
  h.isError = false;
  h.copyToClipboard.mockReset();
  h.copyToClipboard.mockResolvedValue(true);
});

describe("CompanyRelayProxyCard", () => {
  it("fetches the company's config and copies it", async () => {
    render(<CompanyRelayProxyCard companyId={companyId} />);
    expect(h.url).toBe(`/api/v1/companies/${companyId}/relay-proxy-config`);
    expect(screen.getByText("goff-proxy.yaml")).toBeInTheDocument();
    expect(screen.getByText(/"fs-1"/)).toBeInTheDocument();
    expect(screen.getByText("company.relayProxy.tip")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "common.copy" }));
    await waitFor(() => expect(h.copyToClipboard).toHaveBeenCalledWith(yaml));
  });

  const states = [
    { name: "loading", isLoading: true, isError: false, want: "common.loading" },
    { name: "error", isLoading: false, isError: true, want: "company.relayProxy.error" },
  ];
  for (const tt of states) {
    it(`shows the ${tt.name} state instead of the config`, () => {
      h.isLoading = tt.isLoading;
      h.isError = tt.isError;
      render(<CompanyRelayProxyCard companyId={companyId} />);
      expect(screen.getByText(tt.want)).toBeInTheDocument();
      expect(screen.queryByText("goff-proxy.yaml")).not.toBeInTheDocument();
      expect(screen.queryByText("company.relayProxy.tip")).not.toBeInTheDocument();
    });
  }
});
