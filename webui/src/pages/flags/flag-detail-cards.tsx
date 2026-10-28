// Read-only display cards for the flag detail page: the copy-key button, the
// rule/default outcome view, and the targeting / default-rule / variations /
// settings cards. Extracted from detail.tsx; these are presentational and take
// all data via props.

import { Link } from "react-router";
import {
  RocketIcon,
  SettingsIcon,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DistributionBar } from "@/components/flags/display/distribution-bar";
import { variationColor } from "@/components/flags/display/variation-colors";
import { VariationPill } from "@/components/flags/display/variation-pill";
import { RuleDisplay } from "@/components/flags/display/rule-display";
import { TagInput } from "@/components/flags/form/tag-input";
import {
  formatVariationValue,
  ruleOutcome,
  type RuleOutcome,
} from "@/components/flags/payload";
import { RESERVED_META_KEYS, type Tr } from "@/components/flags/form/flag-form";
import type { Flag, FlagRule } from "@/types/api";
import { CodeChip } from "@/components/ui/code-chip";
import { EmptyState } from "@/components/ui/empty-state";

// OutcomeView renders the served result of a rule or the default rule.
function OutcomeView({
  t,
  outcome,
  names,
  size = "default",
}: {
  t: Tr;
  outcome: RuleOutcome;
  names: string[];
  size?: "default" | "lg";
}) {
  if (outcome.kind === "single") {
    const idx = Math.max(0, names.indexOf(outcome.variation));
    return <VariationPill name={outcome.variation} index={idx} />;
  }
  if (outcome.kind === "percentage") {
    return (
      <div className="flex flex-1 flex-col gap-2.5">
        <DistributionBar
          variations={names}
          percentages={outcome.percentages}
          size={size}
        />
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {names.map((n, i) => (
            <span
              key={n}
              className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground"
            >
              <span
                className="h-2 w-2 shrink-0 rounded-[2px]"
                style={{ background: variationColor(n, i) }}
              />
              {n} <b className="text-foreground">{outcome.percentages[n] ?? 0}%</b>
            </span>
          ))}
        </div>
      </div>
    );
  }
  if (outcome.kind === "progressive") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <RocketIcon className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{t("flag.detail.progressive")}</span>
        {outcome.initialVariation && (
          <VariationPill
            name={outcome.initialVariation}
            index={Math.max(0, names.indexOf(outcome.initialVariation))}
          />
        )}
        <span className="text-muted-foreground">→</span>
        {outcome.endVariation && (
          <VariationPill
            name={outcome.endVariation}
            index={Math.max(0, names.indexOf(outcome.endVariation))}
          />
        )}
        <span className="font-mono text-muted-foreground">
          {t("flag.detail.progressiveRange", {
            from: outcome.from,
            to: outcome.to,
          })}
        </span>
      </div>
    );
  }
  return <span className="text-xs text-muted-foreground">—</span>;
}

export function TargetingCard({
  t,
  rules,
  names,
}: {
  t: Tr;
  rules: FlagRule[];
  names: string[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{t("flag.detail.targetingTitle")}</CardTitle>
        <CardDescription>{t("flag.detail.targetingSubtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5">
        {rules.length === 0 ? (
          <EmptyState variant="inline">{t("flag.detail.noRules")}</EmptyState>
        ) : (
          rules.map((rule, i) => (
            <RuleDisplay key={i} index={i} name={rule.name} query={rule.query}>
              <OutcomeView t={t} outcome={ruleOutcome(rule)} names={names} />
            </RuleDisplay>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export function DefaultRuleCard({
  t,
  rule,
  names,
}: {
  t: Tr;
  rule: FlagRule | undefined;
  names: string[];
}) {
  const outcome = ruleOutcome(rule);
  const label =
    outcome.kind === "percentage"
      ? t("flag.detail.split")
      : t("flag.detail.serve");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">
          {t("flag.detail.defaultRuleTitle")}
        </CardTitle>
        <CardDescription>
          {t("flag.detail.defaultRuleSubtitle")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-3">
          {outcome.kind !== "none" && (
            <span className="mt-1 shrink-0 font-mono text-2xs text-muted-foreground">
              {label}
            </span>
          )}
          <OutcomeView t={t} outcome={outcome} names={names} size="lg" />
        </div>
      </CardContent>
    </Card>
  );
}

export function VariationsCard({
  t,
  payload,
  names,
}: {
  t: Tr;
  payload: Flag["payload"];
  names: string[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">
          {t("flag.detail.variationsTitle")}
        </CardTitle>
        <CardDescription>
          {t("flag.detail.variationsSubtitle")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col">
        {names.map((name, i) => (
          <div
            key={name}
            className="grid grid-cols-[180px_1fr] items-center gap-3 border-t border-dashed py-2.5 first:border-t-0"
          >
            <VariationPill name={name} index={i} />
            <CodeChip className="overflow-x-auto">
              {formatVariationValue(payload?.variations?.[name])}
            </CodeChip>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// FlagsetLink renders a link to the flagset configuration page, labelled with
// the flagset name (falling back to its id while the name loads).
export function FlagsetLink({
  flagsetId,
  flagsetName,
}: {
  flagsetId: string;
  flagsetName: string;
}) {
  return (
    <Link
      to={`/flagsets/${flagsetId}`}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
    >
      <SettingsIcon className="h-3.5 w-3.5" />
      {flagsetName || flagsetId}
    </Link>
  );
}

export function SettingsCard({
  t,
  metadata,
  trackEvents,
  flagsetId,
  flagsetName,
  createdByName,
}: {
  t: Tr;
  metadata: Record<string, unknown> | undefined;
  trackEvents: boolean;
  flagsetId: string;
  flagsetName: string;
  createdByName: string;
}) {
  // Only the reserved owner/description keys belong here; custom typed properties
  // are shown in the Metadata tab. Tags is reserved too but gets its own row
  // below (rendered as chips), so it's excluded from the generic list here.
  const entries = metadata
    ? Object.entries(metadata).filter(
        ([k]) => RESERVED_META_KEYS.has(k) && k !== "tags",
      )
    : [];
  const tags = Array.isArray(metadata?.tags)
    ? (metadata.tags as string[])
    : [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">
          {t("flag.detail.settingsTitle")}
        </CardTitle>
        <CardDescription>{t("flag.detail.settingsSubtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col gap-2.5">
          <div className="grid grid-cols-[180px_1fr] items-center gap-3">
            <dt className="font-mono text-xs text-muted-foreground">
              {t("flag.detail.flagsetLabel")}
            </dt>
            <dd>
              <FlagsetLink flagsetId={flagsetId} flagsetName={flagsetName} />
            </dd>
          </div>
          <div className="grid grid-cols-[180px_1fr] items-center gap-3">
            <dt className="font-mono text-xs text-muted-foreground">
              {t("flag.detail.createdBy")}
            </dt>
            <dd className="text-sm">{createdByName || "—"}</dd>
          </div>
          <div className="grid grid-cols-[180px_1fr] items-center gap-3">
            <dt className="font-mono text-xs text-muted-foreground">
              {t("flag.detail.edit.trackEvents")}
            </dt>
            <dd className="text-sm">
              {trackEvents
                ? t("flag.detail.enabled")
                : t("flag.detail.disabled")}
            </dd>
          </div>
          <div className="grid grid-cols-[180px_1fr] items-center gap-3">
            <dt className="font-mono text-xs text-muted-foreground">
              {t("flag.tags")}
            </dt>
            <dd>
              {tags.length === 0 ? (
                <span className="text-sm text-muted-foreground">—</span>
              ) : (
                <TagInput value={tags} onChange={() => {}} readOnly />
              )}
            </dd>
          </div>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("flag.detail.metadataEmpty")}
            </p>
          ) : (
            entries.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[180px_1fr] gap-3">
                <dt className="font-mono text-xs text-muted-foreground">{k}</dt>
                <dd className="font-mono text-xs">{formatVariationValue(v)}</dd>
              </div>
            ))
          )}
        </dl>
      </CardContent>
    </Card>
  );
}
