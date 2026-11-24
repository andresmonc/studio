import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TipCallout } from "./tip-callout";

describe("TipCallout dismiss", () => {
  afterEach(() => vi.restoreAllMocks());

  const tests = [
    { name: "fades out, then dismisses", reducedMotion: false, wantBeforeEnd: 0 },
    { name: "dismisses right away with reduced motion", reducedMotion: true, wantBeforeEnd: 1 },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      vi.spyOn(window, "matchMedia").mockReturnValue({ matches: tt.reducedMotion } as MediaQueryList);
      const onDismiss = vi.fn();
      render(
        <TipCallout title="Tips" inline onDismiss={onDismiss} dismissLabel="Hide">
          body
        </TipCallout>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Hide" }));
      expect(onDismiss).toHaveBeenCalledTimes(tt.wantBeforeEnd);

      fireEvent.animationEnd(screen.getByText("body").closest("div")!);
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });
  }
});
