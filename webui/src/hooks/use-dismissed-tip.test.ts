import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDismissedTip } from "./use-dismissed-tip";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("useDismissedTip", () => {
  it("remembers a dismissal across mounts", () => {
    const first = renderHook(() => useDismissedTip("welcome"));
    expect(first.result.current[0]).toBe(false);
    act(() => first.result.current[1]());
    expect(first.result.current[0]).toBe(true);

    expect(renderHook(() => useDismissedTip("welcome")).result.current[0]).toBe(true);
    expect(renderHook(() => useDismissedTip("other")).result.current[0]).toBe(false);
  });

  it("still hides the tip for this visit when storage is unavailable", () => {
    const denied = () => {
      throw new Error("denied");
    };
    vi.stubGlobal("localStorage", { getItem: denied, setItem: denied });
    const { result } = renderHook(() => useDismissedTip("welcome"));
    expect(result.current[0]).toBe(false);
    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
  });
});
