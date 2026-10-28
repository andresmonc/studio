// RolloutCurve visualizes a progressive rollout as a line/area chart: the share
// of traffic served the *end* variation ramps linearly from initialPct to endPct
// between the start and end dates — mirroring go-feature-flag's linear
// interpolation (modules/core/flag/rule.go). A dashed "now" marker shows today's
// interpolated percentage when today falls inside the window.

import { useTranslate } from "@refinedev/core";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import { variationColor } from "../display/variation-colors";
import { EmptyState } from "@/components/ui/empty-state";

type Gran = "day" | "minute" | "second";

// fmtDate formats a timestamp at a granularity chosen from the rollout span, so a
// multi-week rollout shows dates while a sub-hour one shows the time of day.
function fmtDate(ts: number, gran: Gran = "day"): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (gran !== "day") {
    opts.hour = "2-digit";
    opts.minute = "2-digit";
  }
  if (gran === "second") opts.second = "2-digit";
  return new Date(ts).toLocaleString(undefined, opts);
}

// RolloutTooltip renders the hover popin: the date plus one row per variation,
// the end variation at its served share `pct` and the initial variation at the
// complement `100 - pct`. Extracted as a pure component so both rows are
// unit-testable — recharts never invokes its inline `content` callback under
// jsdom (no layout, no hover), so the inline form was untestable.
export function RolloutTooltip({
  ts,
  pct,
  gran,
  color,
  endVariation,
  initialColor,
  initialVariation,
}: {
  ts: number;
  pct: number;
  gran: Gran;
  color: string;
  endVariation: string;
  initialColor: string;
  initialVariation: string;
}) {
  const t = useTranslate();
  return (
    <div className="rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium">{fmtDate(ts, gran)}</div>
      <div className="mt-1 flex items-center gap-1.5 text-muted-foreground">
        <span className="h-2 w-2 rounded-[2px]" style={{ background: color }} />
        {t("flag.wizard.servingVariation", { variation: endVariation })}
        <span className="ml-1 font-mono font-medium text-foreground">
          {pct}%
        </span>
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-muted-foreground">
        <span
          className="h-2 w-2 rounded-[2px]"
          style={{ background: initialColor }}
        />
        {t("flag.wizard.servingVariation", { variation: initialVariation })}
        <span className="ml-1 font-mono font-medium text-foreground">
          {100 - pct}%
        </span>
      </div>
    </div>
  );
}

export type RolloutStatus = "scheduled" | "live" | "completed";

// rolloutStatus reports where "now" sits relative to the rollout window.
export function rolloutStatus(
  nowTs: number,
  startTs: number,
  endTs: number,
): RolloutStatus {
  if (nowTs < startTs) return "scheduled";
  if (nowTs > endTs) return "completed";
  return "live";
}

// relativeTime renders a human, locale-aware "in 6 days" / "4 days ago" string,
// picking the largest unit that fits the magnitude (down to seconds).
export function relativeTime(targetTs: number, nowTs: number): string {
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const diff = targetTs - nowTs; // > 0 => future
  const abs = Math.abs(diff);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
  ];
  const [unit, ms] = units.find(([, ms]) => abs >= ms) ?? ["second", 1000];
  return rtf.format(Math.round(diff / ms), unit);
}

// ServingNowCard recaps the current rollout state beside the chart: status,
// the share served right now, a progress bar, and start/complete/end stats.
function ServingNowCard({
  nowTs,
  startTs,
  endTs,
  nowPct,
  color,
  endVariation,
  initialColor,
  initialVariation,
  gran,
  disabled,
}: {
  nowTs: number;
  startTs: number;
  endTs: number;
  nowPct: number;
  color: string;
  endVariation: string;
  initialColor: string;
  initialVariation: string;
  gran: Gran;
  disabled: boolean;
}) {
  const t = useTranslate();
  const status = rolloutStatus(nowTs, startTs, endTs);
  const pillClass: Record<RolloutStatus, string> = {
    live: "bg-warning/15 text-warning",
    scheduled: "bg-muted text-muted-foreground",
    completed: "bg-success/15 text-success",
  };
  const dotClass: Record<RolloutStatus, string> = {
    live: "bg-warning",
    scheduled: "bg-muted-foreground",
    completed: "bg-success",
  };
  const statusLabel: Record<RolloutStatus, string> = {
    live: t("flag.wizard.statusLive"),
    scheduled: t("flag.wizard.statusScheduled"),
    completed: t("flag.wizard.statusCompleted"),
  };

  return (
    <div className="flex shrink-0 flex-col rounded-md border border-border md:w-64">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-semibold text-foreground">
          {t("flag.wizard.servingNow")}
        </span>
        {!disabled && (
          <Badge
            className={cn("gap-1.5 rounded-full border-transparent text-2xs", pillClass[status])}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", dotClass[status])} />
            {statusLabel[status]}
          </Badge>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-3">
        <div className="flex items-center gap-2">
          <span className="text-4xl font-bold leading-none text-foreground">
            {nowPct}
          </span>
          <span className="text-lg font-medium text-muted-foreground">%</span>
          <span
            className="ml-1 h-3 w-3 rounded-[3px]"
            style={{ background: color }}
          />
          <span className="font-mono text-sm text-foreground">
            {endVariation}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="font-mono font-medium">{100 - nowPct}%</span>
          <span
            className="h-2 w-2 rounded-[2px]"
            style={{ background: initialColor }}
          />
          <span className="font-mono">{initialVariation}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full"
            style={{ width: `${nowPct}%`, background: color }}
          />
        </div>
        <div className="grid grid-cols-3 gap-2 text-2xs">
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">
              {t("flag.wizard.started")}
            </span>
            <span className="font-medium text-foreground">
              {relativeTime(startTs, nowTs)}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">
              {t("flag.wizard.completes")}
            </span>
            <span className="font-medium text-foreground">
              {relativeTime(endTs, nowTs)}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">
              {t("flag.wizard.endDateLabel")}
            </span>
            <span className="font-medium text-foreground">
              {fmtDate(endTs, gran)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RolloutCurve({
  initialVariation,
  endVariation,
  initialPct,
  endPct,
  startDate,
  endDate,
  variationNames,
  disabled = false,
}: {
  initialVariation: string;
  endVariation: string;
  initialPct: number;
  endPct: number;
  startDate: string; // local datetime-local string (YYYY-MM-DDTHH:mm)
  endDate: string; // local datetime-local string (YYYY-MM-DDTHH:mm)
  variationNames: string[];
  disabled?: boolean;
}) {
  const t = useTranslate();

  // Without both dates there is no time axis to plot — show a hint instead.
  if (!startDate || !endDate) {
    return (
      <EmptyState variant="inline">{t("flag.wizard.rolloutCurveEmpty")}</EmptyState>
    );
  }

  const startTs = new Date(startDate).getTime();
  const endTs = new Date(endDate).getTime();
  const span = endTs - startTs;

  // An inverted or zero-length window (end ≤ start) can't be plotted as a ramp —
  // tell the user the real cause instead of drawing a broken vertical step.
  if (span <= 0) {
    return (
      <EmptyState variant="inline">{t("flag.wizard.rolloutCurveInvalid")}</EmptyState>
    );
  }

  const nowTs = Date.now();
  const nowPct = Math.round(
    nowTs <= startTs
      ? initialPct
      : nowTs >= endTs
        ? endPct
        : initialPct + ((endPct - initialPct) * (nowTs - startTs)) / span,
  );

  const color = variationColor(
    endVariation,
    Math.max(0, variationNames.indexOf(endVariation)),
  );
  const initialColor = variationColor(
    initialVariation,
    Math.max(0, variationNames.indexOf(initialVariation)),
  );

  // Tick/label granularity adapts to the timeframe: dates for long rollouts,
  // time-of-day for short ones, seconds for very short ones.
  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  const gran: Gran = span < 5 * MIN ? "second" : span < 3 * DAY ? "minute" : "day";
  // Pad the chart proportionally to the window so the flat pre/post-rollout
  // shoulders are visible at any scale (minutes → small pad, weeks → larger).
  const SHOULDER_PAD_RATIO = 0.12;
  const pad = span * SHOULDER_PAD_RATIO;
  // Evenly divide the window regardless of unit; minTickGap drops crowded labels.
  const steps = 6;
  const ramp = Array.from({ length: steps + 1 }, (_, i) => {
    const ts = startTs + (span * i) / steps;
    return {
      ts,
      pct: initialPct + ((endPct - initialPct) * (ts - startTs)) / span,
    };
  });
  // Flat shoulders extend the line before the start and after the end.
  const data = [
    { ts: startTs - pad, pct: initialPct },
    ...ramp,
    { ts: endTs + pad, pct: endPct },
  ];
  const nowVisible = nowTs >= startTs - pad && nowTs <= endTs + pad;

  const config: ChartConfig = {
    pct: { label: t("flag.wizard.servingVariation", { variation: endVariation }), color },
  };

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-stretch">
      <div className="flex min-w-0 flex-1 flex-col gap-3 rounded-md border border-border p-3">
        <div>
          <p className="text-xs font-semibold text-foreground">
            {t("flag.wizard.rolloutCurve")}
          </p>
          <p className="text-2xs text-muted-foreground">
            {t("flag.wizard.rolloutCurveSubtitle")}
          </p>
        </div>

        <ChartContainer config={config} className="aspect-auto h-56 w-full">
        <AreaChart data={data} margin={{ top: 16, right: 12, bottom: 4, left: 0 }}>
          <defs>
            <linearGradient id="rollout-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="ts"
            type="number"
            scale="time"
            domain={[startTs - pad, endTs + pad]}
            ticks={ramp.map((d) => d.ts)}
            tickFormatter={(ts) => fmtDate(ts, gran)}
            tickLine={true}
            axisLine={false}
            tickMargin={8}
            minTickGap={16}
          />
          <YAxis
            type="number"
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickFormatter={(v) => `${v}`}
            tickLine={false}
            axisLine={false}
            width={32}
          />
          <ChartTooltip
            cursor={{
              stroke: "var(--muted-foreground)",
              strokeDasharray: "4 4",
            }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0];
              const ts = (point.payload as { ts: number }).ts;
              const pct = Math.round(point.value as number);
              return (
                <RolloutTooltip
                  ts={ts}
                  pct={pct}
                  gran={gran}
                  color={color}
                  endVariation={endVariation}
                  initialColor={initialColor}
                  initialVariation={initialVariation}
                />
              );
            }}
          />
          <Area
            type="linear"
            dataKey="pct"
            stroke={color}
            strokeWidth={2}
            fill="url(#rollout-fill)"
            isAnimationActive={false}
            dot={{ r: 3, fill: color, stroke: "var(--background)", strokeWidth: 1 }}
            activeDot={{ r: 5, fill: color, stroke: "var(--background)", strokeWidth: 2 }}
          />
          {nowVisible && (
            <>
              <ReferenceLine
                x={nowTs}
                stroke="var(--muted-foreground)"
                strokeDasharray="4 4"
                label={{
                  value: `${t("flag.wizard.now")} · ${nowPct}%`,
                  position: "top",
                  fill: "var(--foreground)",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              />
              <ReferenceDot
                x={nowTs}
                y={nowPct}
                r={4}
                fill={color}
                stroke="var(--background)"
                strokeWidth={2}
              />
            </>
          )}
        </AreaChart>
      </ChartContainer>

      <div className="flex flex-wrap items-center justify-between gap-2 text-2xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-[2px]"
              style={{ background: color }}
            />
            {t("flag.wizard.servingVariation", { variation: endVariation })}
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-[2px]"
              style={{ background: initialColor }}
            />
            {t("flag.wizard.servingVariation", { variation: initialVariation })}
          </span>
        </div>
        {nowVisible && (
          <span className="font-mono">
            {t("flag.wizard.todayPct", { pct: nowPct })}
          </span>
        )}
        </div>
      </div>
      <ServingNowCard
        nowTs={nowTs}
        startTs={startTs}
        endTs={endTs}
        nowPct={nowPct}
        color={color}
        endVariation={endVariation}
        initialColor={initialColor}
        initialVariation={initialVariation}
        gran={gran}
        disabled={disabled}
      />
    </div>
  );
}

RolloutCurve.displayName = "RolloutCurve";
