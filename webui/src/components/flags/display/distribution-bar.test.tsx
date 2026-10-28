import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { DistributionBar } from "./distribution-bar";

describe("DistributionBar", () => {
  it("renders a distribution bar segment per non-zero variation", () => {
    const { container } = render(
      <DistributionBar
        variations={["on", "off"]}
        percentages={{ on: 40, off: 60 }}
      />,
    );
    // outer bar + 2 segments
    expect(container.querySelectorAll("div").length).toBeGreaterThanOrEqual(3);
  });

  it("sizes segments against a full 100% bar, leaving blank space below 100%", () => {
    // Sum is 60, not 100 — segments keep their raw widths so the unallocated
    // 40% shows the muted background instead of stretching to fill the bar.
    const { container } = render(
      <DistributionBar
        variations={["on", "off"]}
        percentages={{ on: 40, off: 20 }}
      />,
    );
    const bar = container.firstElementChild as HTMLElement;
    const segments = Array.from(bar.children) as HTMLElement[];
    expect(segments.map((el) => el.style.width)).toEqual(["40%", "20%"]);
    // shrink-0 keeps the widths literal so the bar stays a 0-100 scale.
    expect(segments.every((el) => el.className.includes("shrink-0"))).toBe(true);
  });

  it("keeps segment widths literal even when weights sum past 100", () => {
    // Legacy/unnormalized data can sum > 100; widths stay the raw values
    // (shrink-0 + overflow-hidden clip the excess) rather than rescaling.
    const { container } = render(
      <DistributionBar
        variations={["on", "off"]}
        percentages={{ on: 80, off: 80 }}
      />,
    );
    const bar = container.firstElementChild as HTMLElement;
    const widths = Array.from(bar.children).map(
      (el) => (el as HTMLElement).style.width,
    );
    expect(widths).toEqual(["80%", "80%"]);
  });

  it("shows decimal weights in the segment tooltip without rounding", () => {
    const { container } = render(
      <DistributionBar variations={["on"]} percentages={{ on: 42.56 }} />,
    );
    const seg = (container.firstElementChild as HTMLElement)
      .firstElementChild as HTMLElement;
    expect(seg.title).toBe("on · 42.56%");
  });
});
