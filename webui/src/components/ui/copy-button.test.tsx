import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  copy: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/clipboard", () => ({
  copyToClipboard: (v: string) => h.copy(v),
}));
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => h.toastSuccess(...a),
    error: (...a: unknown[]) => h.toastError(...a),
  },
}));
vi.mock("@refinedev/core", () => ({
  useTranslate: () => (key: string) => key,
}));

import { CopyButton } from "./copy-button";

const button = () => screen.getByRole("button", { name: "Copy key" });
const checkIcon = () => button().querySelector(".text-success");

beforeEach(() => {
  h.copy.mockReset().mockResolvedValue(true);
  h.toastSuccess.mockReset();
  h.toastError.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CopyButton", () => {
  it("copies, toasts success, and shows a checkmark that reverts", async () => {
    vi.useFakeTimers();
    render(<CopyButton value="my-flag" label="Copy key" />);

    await act(async () => {
      fireEvent.click(button());
    });
    expect(h.copy).toHaveBeenCalledWith("my-flag");
    expect(h.toastSuccess).toHaveBeenCalledWith("common.copied");
    expect(checkIcon()).not.toBeNull();

    // A second copy restarts the revert timer instead of stacking another.
    await act(async () => {
      fireEvent.click(button());
    });
    act(() => vi.advanceTimersByTime(1499));
    expect(checkIcon()).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(checkIcon()).toBeNull();
  });

  it("toasts an error and keeps the copy icon when the clipboard write fails", async () => {
    h.copy.mockResolvedValue(false);
    render(<CopyButton value="my-flag" label="Copy key" />);

    await act(async () => {
      fireEvent.click(button());
    });
    expect(h.toastError).toHaveBeenCalledWith("common.copyError");
    expect(h.toastSuccess).not.toHaveBeenCalled();
    expect(checkIcon()).toBeNull();
  });
});
