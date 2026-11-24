import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  useCustom,
  useCustomMutation,
  useTranslate,
  useWarnAboutChange,
} from "@refinedev/core";
import { Link, Navigate, useParams } from "react-router";
import {
  ArrowUpRightIcon,
  BellIcon,
  FlagIcon,
  KeyRoundIcon,
  SaveIcon,
  SettingsIcon,
  Undo2Icon,
  ZapIcon,
} from "lucide-react";
import { toast } from "sonner";
import { ListView } from "@/components/refine-ui/views/list-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiKeysTab } from "./settings-api-keys-tab";
import { ContextTab } from "./settings-context-tab";
import { NotifiersTab } from "./settings-notifiers-tab";
import { SettingsTab } from "./settings-testing-context-tab";
import { Setting } from "./setting";
import { DangerTab } from "./settings-danger-tab";
import { DEFAULT_TESTING_CONTEXT } from "@/components/flags/evaluate-panel";
import { canEditTeam, effectiveTeamRole } from "@/providers/access-control";
import { API_URL } from "@/providers/constants";
import { cn } from "@/lib/utils";
import { errMessage } from "@/lib/errors";
import type { Flagset } from "@/types/api";
import { EmptyState } from "@/components/ui/empty-state";
import { PageBreadcrumb } from "@/components/ui/page-header";

type TabKey = "settings" | "keys" | "context" | "notifiers";

type Draft = {
  name: string;
  description: string;
  testingContext: string;
  enrichment: Record<string, unknown>;
  enrichmentValid: boolean;
  pollingInterval: string;
  startWithRetrieverError: boolean;
  enablePollingJitter: boolean;
  disableNotifierOnInit: boolean;
  environment: string;
};

// Draft fields sent as-is when they differ from the server copy.
const PLAIN_FIELDS = [
  "name",
  "description",
  "startWithRetrieverError",
  "enablePollingJitter",
  "disableNotifierOnInit",
  "environment",
] as const;

// Bounds enforced by the API (model.MinPollingInterval/MaxPollingInterval).
const MIN_POLLING_INTERVAL = 1000;
const MAX_POLLING_INTERVAL = 24 * 60 * 60 * 1000;
const POLLING_INTERVAL_DOCS =
  "https://gofeatureflag.org/docs/relay-proxy/configure-relay-proxy#flagsetpollinginterval";

// The draft matching what the server has, i.e. a clean form.
function seed(fs: Flagset): Draft {
  return {
    name: fs.name,
    description: fs.description,
    testingContext: fs.defaultTestingEvaluationContext
      ? JSON.stringify(fs.defaultTestingEvaluationContext, null, 2)
      : DEFAULT_TESTING_CONTEXT,
    enrichment: fs.evaluationContextEnrichment ?? {},
    enrichmentValid: true,
    pollingInterval: String(fs.pollingInterval),
    startWithRetrieverError: fs.startWithRetrieverError,
    enablePollingJitter: fs.enablePollingJitter,
    disableNotifierOnInit: fs.disableNotifierOnInit,
    environment: fs.environment,
  };
}

// Parse the testing context into a plain JSON object, or null when invalid.
function parseObject(text: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(text);
    if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
    return v as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function FlagsetSettingsPage() {
  const t = useTranslate();
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<TabKey>("settings");

  const { query } = useCustom<Flagset>({
    url: `${API_URL}/flagsets/${id}`,
    method: "get",
    queryOptions: { queryKey: ["flagset", id], enabled: !!id },
  });
  const flagset = query.data?.data;
  const { mutate } = useCustomMutation();
  // null = no local edits; the form mirrors the server copy.
  const [draft, setDraft] = useState<Draft | null>(null);
  // Bumped to reseed the enrichment editor (it keeps its own row state).
  const [editorKey, setEditorKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const { setWarnWhen } = useWarnAboutChange();

  const teamId = flagset?.teamId;
  // All flagset edits (general, context enrichment, API keys, delete) are
  // admin-only.
  const canManage = !!teamId && canEditTeam(teamId); // admin / super-admin
  // API keys and notifiers are secrets: listing them needs editor+, so viewers
  // don't get those tabs.
  const canReadSecrets =
    !!teamId && (canEditTeam(teamId) || effectiveTeamRole(teamId) === "editor");
  const secretTabs: TabKey[] = ["keys", "notifiers"];
  const shownTab = secretTabs.includes(tab) && !canReadSecrets ? "settings" : tab;

  const allTabs: { key: TabKey; label: string; icon: ReactNode }[] =
    [
      { key: "settings", label: t("flagset.settings.settings"), icon: <SettingsIcon className="h-4 w-4" /> },
      { key: "keys", label: t("flagset.settings.apiKeys"), icon: <KeyRoundIcon className="h-4 w-4" /> },
      { key: "context", label: t("flagset.settings.context"), icon: <ZapIcon className="h-4 w-4" /> },
      { key: "notifiers", label: t("flagset.settings.notifiers.title"), icon: <BellIcon className="h-4 w-4" /> },
    ];
  const tabs = allTabs.filter((tb) => !secretTabs.includes(tb.key) || canReadSecrets);

  const clean = flagset ? seed(flagset) : null;
  const current = draft ?? clean;
  // Editing back to the server values drops the draft, so a later refetch
  // isn't masked by a stale copy (the enrichment editor reports on mount).
  const edit = (patch: Partial<Draft>) =>
    setDraft((d) => {
      const base = d ?? clean;
      if (!base) return d;
      const next = { ...base, ...patch };
      return JSON.stringify(next) === JSON.stringify(clean) ? null : next;
    });
  const testingContext = current ? parseObject(current.testingContext) : null;
  const changes: Record<string, unknown> = {};
  if (current && clean) {
    for (const k of PLAIN_FIELDS) if (current[k] !== clean[k]) changes[k] = current[k];
    if (current.testingContext !== clean.testingContext) {
      changes.defaultTestingEvaluationContext = testingContext;
    }
    if (JSON.stringify(current.enrichment) !== JSON.stringify(clean.enrichment)) {
      changes.evaluationContextEnrichment = current.enrichment;
    }
    if (current.pollingInterval !== clean.pollingInterval) {
      changes.pollingInterval = Number(current.pollingInterval);
    }
  }
  const isDirty = canManage && Object.keys(changes).length > 0;
  // App's UnsavedChangesNotifier asks before leaving (in-app navigation or
  // closing the tab) while this is set.
  useEffect(() => {
    setWarnWhen(isDirty);
    return () => setWarnWhen(false);
  }, [isDirty, setWarnWhen]);
  const nameError = current && current.name.trim() === "" ? t("flagset.nameRequired") : undefined;
  const pollingInterval = Number(current?.pollingInterval);
  const pollingIntervalInvalid =
    !/^\d+$/.test(current?.pollingInterval ?? "") ||
    pollingInterval < MIN_POLLING_INTERVAL ||
    pollingInterval > MAX_POLLING_INTERVAL;
  const valid =
    !!current &&
    !nameError &&
    current.enrichmentValid &&
    testingContext !== null &&
    !pollingIntervalInvalid;

  const discard = () => {
    setDraft(null);
    setEditorKey((k) => k + 1);
  };
  const onSave = () => {
    setSaving(true);
    mutate(
      {
        url: `${API_URL}/flagsets/${id}`,
        method: "patch",
        values: changes,
        successNotification: false,
        errorNotification: false,
      },
      {
        onSuccess: async () => {
          toast.success(t("flagset.settings.saved"));
          await query.refetch();
          discard();
          setSaving(false);
        },
        onError: (err) => {
          toast.error(t("flagset.updateError"), { description: errMessage(err) });
          setSaving(false);
        },
      },
    );
  };

  if (!id) return <Navigate to="/flagsets" replace />;

  return (
    <ListView>
      <div className="flex flex-col gap-4">
        <PageBreadcrumb
          items={[
            { label: t("flagset.cardTitle"), to: "/flagsets" },
            { label: flagset?.name ?? t("flagset.settings.title") },
          ]}
        />

        <div className="flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
            <FlagIcon className="h-4 w-4" />
          </span>
          <h1 className="font-mono text-2xl font-bold tracking-tight">
            {flagset?.name ?? "…"}
          </h1>
          {flagset && (
            <Badge
              asChild
              className="bg-primary/10 text-primary [a&]:hover:bg-primary/20"
            >
              <Link to={`/flags?flagset=${id}`}>
                {t("flagset.settings.viewFlags", { count: flagset.flagCount })}
                <ArrowUpRightIcon />
              </Link>
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-[184px_1fr]">
          <nav className="flex flex-col gap-1 md:sticky md:top-4 md:self-start">
            {tabs.map((tb) => (
              <Button
                key={tb.key}
                variant="ghost"
                aria-current={shownTab === tb.key ? "true" : undefined}
                onClick={() => setTab(tb.key)}
                className={cn(
                  "justify-start font-normal text-muted-foreground",
                  shownTab === tb.key && "bg-muted font-medium text-foreground",
                )}
              >
                {tb.icon}
                {tb.label}
              </Button>
            ))}
          </nav>

          <div className="min-w-0">
            {!flagset || !current ? (
              <EmptyState>
                {t("common.loading")}
              </EmptyState>
            ) : (
              <>
                {shownTab === "keys" && <ApiKeysTab flagsetId={id} canManage={canManage} />}
                {/* Notifiers save on their own (PUT of the whole list), outside the save bar. */}
                {shownTab === "notifiers" && <NotifiersTab flagsetId={id} canManage={canManage} />}
                {/* Kept mounted while hidden so in-progress enrichment rows
                    (incl. invalid ones the draft can't hold) survive tab switches. */}
                <div className={cn(shownTab !== "context" && "hidden")}>
                  <ContextTab
                    flagset={flagset}
                    editorKey={editorKey}
                    canWrite={canManage}
                    onChange={(enrichment, enrichmentValid) =>
                      edit({ enrichment, enrichmentValid })
                    }
                  />
                </div>
                {shownTab === "settings" && (
                  <div className="flex flex-col gap-4">
                    <Card>
                      <CardHeader>
                        <CardTitle>{t("flagset.settings.general")}</CardTitle>
                      </CardHeader>
                      <CardContent className="flex max-w-xl flex-col gap-3">
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="flagset-name">{t("common.name")}</Label>
                          <Input
                            id="flagset-name"
                            value={current.name}
                            onChange={(e) => edit({ name: e.target.value })}
                            aria-invalid={!!nameError}
                            maxLength={120}
                            className="font-mono"
                            disabled={!canManage}
                          />
                          {nameError && <p className="text-sm text-destructive">{nameError}</p>}
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="flagset-description">{t("common.description")}</Label>
                          <Textarea
                            id="flagset-description"
                            rows={2}
                            value={current.description}
                            onChange={(e) => edit({ description: e.target.value })}
                            maxLength={500}
                            disabled={!canManage}
                          />
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader>
                        <CardTitle>{t("flagset.settings.relayProxy")}</CardTitle>
                      </CardHeader>
                      <CardContent className="flex max-w-xl flex-col gap-5">
                        <Setting
                          id="flagset-polling-interval"
                          label={t("flagset.settings.pollingInterval")}
                          hint={
                            <>
                              {t("flagset.settings.pollingIntervalHint")}{" "}
                              <a
                                href={POLLING_INTERVAL_DOCS}
                                target="_blank"
                                rel="noreferrer"
                                className="underline underline-offset-2 hover:text-foreground"
                              >
                                {t("flagset.settings.pollingIntervalDocs")}
                              </a>
                            </>
                          }
                        >
                          <Input
                            id="flagset-polling-interval"
                            type="number"
                            inputMode="numeric"
                            min={MIN_POLLING_INTERVAL}
                            max={MAX_POLLING_INTERVAL}
                            step={1000}
                            value={current.pollingInterval}
                            onChange={(e) => edit({ pollingInterval: e.target.value })}
                            aria-invalid={pollingIntervalInvalid}
                            aria-describedby="flagset-polling-interval-hint"
                            className="max-w-48 font-mono"
                            disabled={!canManage}
                          />
                          {pollingIntervalInvalid && (
                            <p className="text-xs text-destructive">
                              {t("flagset.settings.pollingIntervalInvalid")}
                            </p>
                          )}
                        </Setting>
                        {(
                          [
                            "enablePollingJitter",
                            "startWithRetrieverError",
                            "disableNotifierOnInit",
                          ] as const
                        ).map((k) => (
                          <Setting
                            key={k}
                            id={`flagset-${k}`}
                            label={t(`flagset.settings.${k}`)}
                            hint={t(`flagset.settings.${k}Hint`)}
                            inline
                          >
                            <Switch
                              id={`flagset-${k}`}
                              checked={current[k]}
                              onCheckedChange={(v) => edit({ [k]: v })}
                              aria-describedby={`flagset-${k}-hint`}
                              disabled={!canManage}
                            />
                          </Setting>
                        ))}
                        <Setting
                          id="flagset-environment"
                          label={t("flagset.settings.environment")}
                          hint={t("flagset.settings.environmentHint")}
                        >
                          <Input
                            id="flagset-environment"
                            value={current.environment}
                            onChange={(e) => edit({ environment: e.target.value })}
                            aria-describedby="flagset-environment-hint"
                            maxLength={120}
                            className="font-mono"
                            disabled={!canManage}
                          />
                        </Setting>
                      </CardContent>
                    </Card>
                    <SettingsTab
                      value={current.testingContext}
                      invalid={testingContext === null}
                      canWrite={canManage}
                      onChange={(testingContext) => edit({ testingContext })}
                    />
                    {/* Danger zone (delete flagset) is admin-only. */}
                    {canManage && <DangerTab flagset={flagset} />}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {isDirty && (
          <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 shadow-lg">
            <span className="text-sm font-medium">
              {t("flagset.settings.unsavedChanges")}
            </span>
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" size="sm" onClick={discard} disabled={saving}>
                <Undo2Icon className="h-4 w-4" />
                {t("flagset.settings.discard")}
              </Button>
              <Button size="sm" onClick={onSave} disabled={saving || !valid}>
                <SaveIcon className="h-4 w-4" />
                {t("flagset.settings.saveChanges")}
              </Button>
            </div>
            {!valid && (
              <span className="w-full text-xs text-destructive">
                {t("flagset.settings.invalid")}
              </span>
            )}
          </div>
        )}
      </div>
    </ListView>
  );
}

FlagsetSettingsPage.displayName = "FlagsetSettingsPage";
