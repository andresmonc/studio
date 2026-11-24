import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useIsMobile } from "./use-mobile";

const originalWidth = window.innerWidth;

afterEach(() => {
  vi.restoreAllMocks();
  window.innerWidth = originalWidth;
});

describe("useIsMobile", () => {
  it("follows the viewport across the breakpoint", () => {
    let onChange = () => {};
    const removeEventListener = vi.fn();
    vi.spyOn(window, "matchMedia").mockReturnValue({
      addEventListener: (_: string, cb: () => void) => (onChange = cb),
      removeEventListener,
    } as unknown as MediaQueryList);

    window.innerWidth = 1024;
    const { result, unmount } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    window.innerWidth = 500;
    act(() => onChange());
    expect(result.current).toBe(true);

    unmount();
    expect(removeEventListener).toHaveBeenCalledWith("change", onChange);
  });
});
