import { afterEach, describe, expect, it, vi } from "vitest";
import { copyToClipboard } from "./clipboard";

// Helpers to (re)define the environment bits the util branches on.
function setSecureContext(value: boolean) {
  Object.defineProperty(window, "isSecureContext", {
    configurable: true,
    value,
  });
}
function setClipboard(clipboard: unknown) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: clipboard,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  setClipboard(undefined);
  setSecureContext(false);
});

describe("copyToClipboard", () => {
  it("uses navigator.clipboard in a secure context", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    setSecureContext(true);

    const ok = await copyToClipboard("my-flag-key");

    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith("my-flag-key");
  });

  it("falls back to execCommand when clipboard is unavailable", async () => {
    setClipboard(undefined); // non-secure / unsupported context
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand as typeof document.execCommand;

    const ok = await copyToClipboard("fallback-key");

    expect(ok).toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
    // the textarea is created, used, then cleaned up
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("falls back to execCommand when clipboard.writeText rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    setClipboard({ writeText });
    setSecureContext(true);
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand as typeof document.execCommand;

    const ok = await copyToClipboard("key");

    expect(ok).toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("returns false when every strategy fails", async () => {
    setClipboard(undefined);
    const execCommand = vi.fn().mockReturnValue(false);
    document.execCommand = execCommand as typeof document.execCommand;

    const ok = await copyToClipboard("key");

    expect(ok).toBe(false);
  });
});
