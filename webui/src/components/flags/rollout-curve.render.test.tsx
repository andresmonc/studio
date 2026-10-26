import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { cloneElement, createElement, type ReactElement } from "react";

// jsdom has no layout, so ResponsiveContainer measures 0x0 and recharts draws
// nothing. Tests that need the chart itself flip `sized` to render it at a
// fixed size instead.
const chart = vi.hoisted(() => ({ sized: false }));
vi.mock("@/components/ui/chart", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ui/chart")>();
  return {
    ...actual,
    ChartContainer: (props: Parameters<typeof actual.ChartContainer>[0]) =>
      chart.sized
        ? cloneElement(props.children as ReactElement<{ width: number; height: number }>, {
            width: 600,
            height: 240,
          })
        : createElement(actual.ChartContainer, props),
  };
});

// Resolve real i18n keys so the status pill renders its human string
// ("live"), matching the translate-stub convention used in detail.test.tsx.
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
  const t = (key: string, params?: Record<string, unknown>) => {
    let s = resolve(key);
    if (typeof s !== "string") return key;
    if (params)
      for (const [k, v] of Object.entries(params))
        s = (s as string).replaceAll(`{{${k}}}`, String(v));
    return s as string;
  };
  return { useTranslate: () => t };
});

import { RolloutCurve, RolloutTooltip } from "./rollout-curve";

// A window that brackets "now" so rolloutStatus() resolves to "live" and the
// status pill has a deterministic label to assert on.
const DAY = 86_400_000;
const localDatetime = (ts: number) =>
  new Date(ts - new Date(ts).getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);

const renderCurve = (disabled: boolean) =>
  render(
    <RolloutCurve
      initialVariation="off"
      endVariation="on"
      initialPct={0}
      endPct={100}
      startDate={localDatetime(Date.now() - DAY)}
      endDate={localDatetime(Date.now() + DAY)}
      variationNames={["on", "off"]}
      disabled={disabled}
    />,
  );

describe("RolloutCurve serving-now status pill", () => {
  it("renders the live status pill when the flag is enabled", () => {
    renderCurve(false);
    // The "Serving now" card always renders; the status pill only when enabled.
    expect(screen.getByText("Serving now")).toBeInTheDocument();
    expect(screen.getByText("live")).toBeInTheDocument();
  });

  it("hides the status pill when the flag is disabled", () => {
    renderCurve(true);
    // Card still shows, but the live/scheduled/completed pill is suppressed.
    expect(screen.getByText("Serving now")).toBeInTheDocument();
    expect(screen.queryByText("live")).not.toBeInTheDocument();
  });

  it("shows both variation percentages summing to 100 in the serving-now card", () => {
    // Asymmetric window: now sits 1/4 into a 4-day rollout, so the end
    // variation is at ~25% and the initial variation at the complement ~75%.
    render(
      <RolloutCurve
        initialVariation="off"
        endVariation="on"
        initialPct={0}
        endPct={100}
        startDate={localDatetime(Date.now() - DAY)}
        endDate={localDatetime(Date.now() + 3 * DAY)}
        variationNames={["on", "off"]}
        disabled={false}
      />,
    );
    // Headline = end variation share; secondary line = its 100-complement.
    expect(screen.getByText("25")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
  });
});

describe("RolloutTooltip", () => {
  it("renders both variations with complementary percentages", () => {
    // recharts never fires its inline tooltip callback under jsdom, so the
    // popin is tested via the extracted pure component instead.
    render(
      <RolloutTooltip
        ts={Date.now()}
        pct={56}
        gran="minute"
        color="#0ea5e9"
        endVariation="variation3"
        initialColor="#64748b"
        initialVariation="variation8"
      />,
    );
    expect(screen.getByText("serving variation3")).toBeInTheDocument();
    expect(screen.getByText("56%")).toBeInTheDocument();
    expect(screen.getByText("serving variation8")).toBeInTheDocument();
    expect(screen.getByText("44%")).toBeInTheDocument();
  });

  it("locks the complement at the rollout boundaries", () => {
    // Fully rolled out: end variation 100%, initial variation 0%.
    const { unmount } = render(
      <RolloutTooltip
        ts={Date.now()}
        pct={100}
        gran="minute"
        color="#0ea5e9"
        endVariation="on"
        initialColor="#64748b"
        initialVariation="off"
      />,
    );
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
    unmount();

    // Not yet started: end variation 0%, initial variation 100%.
    render(
      <RolloutTooltip
        ts={Date.now()}
        pct={0}
        gran="minute"
        color="#0ea5e9"
        endVariation="on"
        initialColor="#64748b"
        initialVariation="off"
      />,
    );
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
  });
});

describe("RolloutCurve placeholders and boundaries", () => {
  afterEach(() => {
    chart.sized = false;
  });

  const curve = (startDate: string, endDate: string) =>
    render(
      <RolloutCurve
        initialVariation="off"
        endVariation="on"
        initialPct={10}
        endPct={90}
        startDate={startDate}
        endDate={endDate}
        variationNames={["on", "off"]}
      />,
    );

  const placeholderTests: { name: string; start: string; end: string; want: string }[] = [
    { name: "missing start date", start: "", end: localDatetime(Date.now()), want: "flag.wizard.rolloutCurveEmpty" },
    { name: "missing end date", start: localDatetime(Date.now()), end: "", want: "flag.wizard.rolloutCurveEmpty" },
    { name: "end before start", start: localDatetime(Date.now() + DAY), end: localDatetime(Date.now()), want: "flag.wizard.rolloutCurveInvalid" },
    { name: "zero-length window", start: localDatetime(Date.now()), end: localDatetime(Date.now()), want: "flag.wizard.rolloutCurveInvalid" },
  ];

  for (const tt of placeholderTests) {
    it(`shows a placeholder for ${tt.name}`, async () => {
      const en = (await import("@/i18n/locales/en.json")).default as {
        flag: { wizard: Record<string, string> };
      };
      curve(tt.start, tt.end);
      const key = tt.want.split(".").pop()!;
      expect(screen.getByText(en.flag.wizard[key])).toBeInTheDocument();
      expect(screen.queryByText("Serving now")).toBeNull();
    });
  }

  const boundaryTests: { name: string; start: number; end: number; wantPct: string; wantStatus: string }[] = [
    { name: "before the window serves the initial share", start: Date.now() + DAY, end: Date.now() + 2 * DAY, wantPct: "10", wantStatus: "scheduled" },
    { name: "after the window serves the end share", start: Date.now() - 2 * DAY, end: Date.now() - DAY, wantPct: "90", wantStatus: "completed" },
  ];

  for (const tt of boundaryTests) {
    it(tt.name, () => {
      curve(localDatetime(tt.start), localDatetime(tt.end));
      expect(screen.getByText(tt.wantPct)).toBeInTheDocument();
      expect(screen.getByText(tt.wantStatus)).toBeInTheDocument();
    });
  }

  it("shows the tooltip popin when hovering the plotted chart", () => {
    chart.sized = true;
    const { container } = curve(
      localDatetime(Date.now() - DAY),
      localDatetime(Date.now() + DAY),
    );
    const wrapper = container.querySelector(".recharts-wrapper");
    expect(wrapper).not.toBeNull();
    const tooltip = container.querySelector<HTMLElement>(".recharts-tooltip-wrapper")!;
    expect(tooltip.textContent).toBe("");
    fireEvent.mouseMove(wrapper!, { clientX: 300, clientY: 100 });
    // Hovering mid-window: both rows render and their shares sum to 100.
    const rows = within(tooltip);
    expect(rows.getByText("serving on")).toBeInTheDocument();
    expect(rows.getByText("serving off")).toBeInTheDocument();
    const pcts = rows.getAllByText(/^\d+%$/).map((el) => parseInt(el.textContent!, 10));
    expect(pcts).toHaveLength(2);
    expect(pcts[0] + pcts[1]).toBe(100);
  });
});
