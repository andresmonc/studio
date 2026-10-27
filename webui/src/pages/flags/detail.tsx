import { useMemo, useState, type ReactNode } from "react";
import { useCustom, useCustomMutation, useTranslate } from "@refinedev/core";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import {
  CodeIcon,
  CrosshairIcon,
  FlaskConicalIcon,
  GitBranchIcon,
  HistoryIcon,
  Home,
  SaveIcon,
  SettingsIcon,
  TagsIcon,
  Trash2Icon,
  Undo2Icon,
  FlagOffIcon,
  FlagIcon,
} from "lucide-react";
import { ListView } from "@/components/refine-ui/views/list-view";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { TipCallout } from "@/components/ui/tip-callout";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  EvaluatePanel,
  DEFAULT_TESTING_CONTEXT,
} from "@/components/flags/evaluate-panel";
import { inferFlagType, variationNames } from "@/components/flags/payload";
import {
  Field,
  RESERVED_META_KEYS,
  RulesEditor,
  TagInput,
  VariationsEditor,
  useFlagForm,
} from "@/components/flags/flag-form";
import {
  EnrichmentEditor,
  type EnrichType,
} from "@/pages/flagsets/enrichment-editor";
import { FlagCodeSampleTab } from "@/pages/flags/flag-code-sample-tab";
import {
  CopyKeyButton,
  DefaultRuleCard,
  FlagsetLink,
  SettingsCard,
  TargetingCard,
  VariationsCard,
} from "@/pages/flags/flag-detail-cards";
import { HistoryTab } from "@/pages/flags/flag-detail-history-tab";
import { useActiveTeam } from "@/hooks/use-active-team";
import { useInvalidateRecentlyEditedFlags } from "@/hooks/use-recently-edited-flags";
import { canEditTeam, effectiveTeamRole } from "@/providers/access-control";
import { API_URL } from "@/providers/constants";
import { errMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import type {
  Flag,
  Flagset,
  FlagVersion,
  PaginatedResponse,
} from "@/types/api";

type SectionKey =
  | "targeting"
  | "variations"
  | "metadata"
  | "settings"
  | "history"
  | "evaluate"
  | "codeSample";

// Flag metadata supports the same typed attributes as flagset enrichment, but
// with split int/float numeric types and no `json` type.
const METADATA_TYPES: EnrichType[] = ["string", "float", "int", "boolean"];

export function FlagDetailPage() {
  const t = useTranslate();
  const { id } = useParams();
  const navigate = useNavigate();
  const { activeTeamId } = useActiveTeam();

  const { query } = useCustom<Flag>({
    url: `${API_URL}/flags/${id}`,
    method: "get",
    queryOptions: { queryKey: ["flag", id], enabled: !!id },
  });
  const flag = query.data?.data;

  // Team tag registry — powers the TagInput autocomplete. Suggesting any existing
  // team tag while authoring is never a dead-end, so this uses the (uncapped)
  // endpoint. Shares the ["team-tags", teamId] cache with the flags list page.
  const { query: teamTagsQuery } = useCustom<string[]>({
    url: `${API_URL}/teams/${activeTeamId}/tags`,
    method: "get",
    queryOptions: {
      queryKey: ["team-tags", activeTeamId],
      enabled: !!activeTeamId,
    },
  });
  const tagSuggestions = Array.isArray(teamTagsQuery.data?.data)
    ? teamTagsQuery.data!.data
    : [];

  const { query: flagsetQuery } = useCustom<Flagset>({
    url: `${API_URL}/flagsets/${flag?.flagsetId}`,
    method: "get",
    queryOptions: {
      queryKey: ["flagset", flag?.flagsetId],
      enabled: !!flag?.flagsetId,
    },
  });
  const flagset = flagsetQuery.data?.data;
  const flagsetName = flagset?.name ?? "";

  // The flag's creator is the author of its first version. Shares React Query's
  // cache with the History tab (same queryKey) so this adds no extra request.
  const { query: versionsQuery } = useCustom<PaginatedResponse<FlagVersion>>({
    url: `${API_URL}/flags/${flag?.id}/versions`,
    method: "get",
    queryOptions: {
      queryKey: ["flag-versions", flag?.id],
      enabled: !!flag?.id,
    },
  });
  const createdByName = useMemo(() => {
    const list = versionsQuery.data?.data?.data ?? [];
    if (!list.length) return "";
    const first = [...list].sort(
      (a, b) => a.versionNumber - b.versionNumber,
    )[0];
    return first?.createdByName ?? "";
  }, [versionsQuery.data]);

  const payload = flag?.payload;
  const names = variationNames(payload);
  const type = inferFlagType(payload);
  const owner =
    payload?.metadata && typeof payload.metadata.owner === "string"
      ? payload.metadata.owner
      : null;
  const description =
    payload?.metadata && typeof payload.metadata.description === "string"
      ? payload.metadata.description
      : "";
  const rulesCount = Array.isArray(payload?.targeting)
    ? payload.targeting.length
    : 0;
  // Count only custom metadata keys (owner/description live in the Settings tab).
  const metadataCount = payload?.metadata
    ? Object.keys(payload.metadata).filter((k) => !RESERVED_META_KEYS.has(k))
        .length
    : 0;

  const canEdit =
    !!activeTeamId &&
    (canEditTeam(activeTeamId) || effectiveTeamRole(activeTeamId) === "editor");
  // Anyone who can edit a flag may also delete it.
  const canDelete = canEdit;

  const { mutate } = useCustomMutation();
  const invalidateRecentlyEdited = useInvalidateRecentlyEditedFlags();
  const [pendingToggle, setPendingToggle] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);

  // Inline editing (authorized users only): a single form across all tabs,
  // hydrated from the flag payload, saved as one new version.
  const form = useFlagForm(payload);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState<SectionKey>("targeting");
  // Custom metadata = the non-reserved keys (owner/description live in Settings).
  const customMetadataInitial = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(payload?.metadata ?? {}).filter(
          ([k]) => !RESERVED_META_KEYS.has(k),
        ),
      ),
    [payload],
  );
  // The metadata editor is uncontrolled (owns its rows). Key it on the *content*
  // of the fetched metadata so it reseeds only when fresh server data arrives
  // (e.g. after a save's refetch lands), not before — otherwise a remount keyed on
  // the save event would race ahead of the refetch and reseed from stale data,
  // making a just-added field briefly disappear. While the user edits, the payload
  // is unchanged so the key is stable and their in-progress rows are preserved.
  const metaEditorKey = useMemo(
    () => JSON.stringify(customMetadataInitial),
    [customMetadataInitial],
  );

  const menu: {
    key: SectionKey;
    label: string;
    icon: ReactNode;
    badge?: number;
  }[] = [
    {
      key: "targeting",
      label: t("flag.detail.tabs.targeting"),
      icon: <CrosshairIcon className="h-4 w-4" />,
      badge: rulesCount || undefined,
    },
    {
      key: "variations",
      label: t("flag.detail.tabs.variations"),
      icon: <GitBranchIcon className="h-4 w-4" />,
      badge: names.length,
    },
    {
      key: "metadata",
      label: t("flag.detail.tabs.metadata"),
      icon: <TagsIcon className="h-4 w-4" />,
      badge: metadataCount || undefined,
    },
    {
      key: "settings",
      label: t("flag.detail.tabs.settings"),
      icon: <SettingsIcon className="h-4 w-4" />,
    },
    {
      key: "history",
      label: t("flag.detail.tabs.history"),
      icon: <HistoryIcon className="h-4 w-4" />,
    },
    {
      key: "evaluate",
      label: t("flag.detail.tabs.evaluate"),
      icon: <FlaskConicalIcon className="h-4 w-4" />,
    },
    {
      key: "codeSample",
      label: t("flag.detail.tabs.codeSample"),
      icon: <CodeIcon className="h-4 w-4" />,
    },
  ];

  // Save the current form as a new version. `onSaved` runs after the save
  // succeeds (used by the Evaluate section to test the just-saved payload).
  const saveFlag = (onSaved?: () => void) => {
    if (!flag) return;
    setSaving(true);
    mutate(
      {
        url: `${API_URL}/flags/${flag.id}`,
        method: "put",
        values: { comment: comment.trim(), payload: form.buildPayload() },
        successNotification: false,
        errorNotification: false,
      },
      {
        onSuccess: () => {
          toast.success(t("flag.detail.edit.saved"));
          setComment("");
          setSaving(false);
          query.refetch(); // re-hydrates the form + reseeds the metadata editor
          invalidateRecentlyEdited();
          onSaved?.();
        },
        onError: (err) => {
          toast.error(t("flag.detail.edit.saveError"), {
            description: errMessage(err),
          });
          setSaving(false);
        },
      },
    );
  };
  const onSave = () => saveFlag();

  const confirmToggle = () => {
    if (!flag) return;
    mutate(
      {
        url: `${API_URL}/flags/${flag.id}/disable`,
        method: "post",
        values: { disabled: !flag.disabled },
        successNotification: false,
        errorNotification: false,
      },
      {
        onSuccess: () => {
          toast.success(flag.disabled ? t("flag.enabled") : t("flag.disabled"));
          query.refetch();
          invalidateRecentlyEdited();
          setPendingToggle(false);
        },
        onError: (err) => {
          toast.error(t("flag.toggleError"), { description: errMessage(err) });
          setPendingToggle(false);
        },
      },
    );
  };

  const confirmDelete = () => {
    if (!flag) return;
    mutate(
      {
        url: `${API_URL}/flags/${flag.id}`,
        method: "delete",
        values: {},
        successNotification: false,
        errorNotification: false,
      },
      {
        onSuccess: () => {
          toast.success(t("flag.detail.deleted"));
          navigate("/flags");
        },
        onError: (err) => {
          toast.error(t("flag.detail.deleteError"), {
            description: errMessage(err),
          });
          setPendingDelete(false);
        },
      },
    );
  };

  return (
    <ListView>
      <div className="flex flex-col gap-4">
        <div className="relative flex items-center gap-2">
          <div className="z-[2] bg-background pr-4">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to="/">
                      <Home className="h-4 w-4" />
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to="/flags">{t("flag.title")}</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage className="font-mono">
                    {flag?.name ?? id}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <Separator className="absolute left-0 right-0 z-[1]" />
        </div>

        {query.isLoading && (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              {t("common.loading")}
            </CardContent>
          </Card>
        )}

        {!query.isLoading && !flag && (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              {t("flag.detail.notFound")}
            </CardContent>
          </Card>
        )}

        {flag && (
          <>
            {/* header */}
            <div className="flex flex-wrap items-start gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="font-mono text-xl font-semibold tracking-tight">
                    {flag.name}
                  </h1>
                  <CopyKeyButton t={t} value={flag.name} />
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {type}
                  </Badge>
                  {flagsetName && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="secondary" className="cursor-default">
                          {flagsetName}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        {t("flag.detail.flagsetBadgeTooltip")}
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {flag.disabled && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="destructive" className="cursor-default">
                          {t("flag.detail.disabled")}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        {t("flag.detail.disabledBadgeTooltip")}
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {owner && (
                    <span className="text-xs text-muted-foreground">
                      {t("flag.owner")} · {owner}
                    </span>
                  )}
                </div>
                {description && (
                  <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
                    {description}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-2 grid grid-cols-1 gap-6 md:grid-cols-[184px_1fr]">
              <nav className="flex flex-col gap-1 md:sticky md:top-4 md:self-start">
                {menu.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setSection(m.key)}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
                      section === m.key
                        ? "bg-muted font-medium text-foreground"
                        : "text-muted-foreground hover:bg-muted/60",
                    )}
                  >
                    {m.icon}
                    <span className="flex-1 text-left">{m.label}</span>
                    {m.badge != null && (
                      <Badge variant="secondary">{m.badge}</Badge>
                    )}
                  </button>
                ))}
              </nav>

              <div className="min-w-0">
                {section === "targeting" && (
                  <div className="flex flex-col gap-4">
                    {canEdit ? (
                      <>
                        <TipCallout title={t("flag.detail.targetingTipsTitle")}>
                          {t("flag.detail.targetingTips")}
                        </TipCallout>
                        <RulesEditor
                          t={t}
                          variationNames={form.variationNames}
                          rules={form.rules}
                          setRules={form.setRules}
                          defaultOutcome={form.defaultOutcome}
                          setDefaultOutcome={form.setDefaultOutcome}
                          disabled={flag.disabled}
                        />
                      </>
                    ) : (
                      <>
                        <TargetingCard
                          t={t}
                          rules={payload?.targeting ?? []}
                          names={names}
                        />
                        <DefaultRuleCard
                          t={t}
                          rule={payload?.defaultRule}
                          names={names}
                        />
                      </>
                    )}
                  </div>
                )}

                {section === "variations" && (
                  <div>
                    {canEdit ? (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-sm">
                            {t("flag.detail.variationsTitle")}
                          </CardTitle>
                          <CardDescription>
                            {t("flag.detail.variationsSubtitle")}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4">
                          <Field label={t("flag.wizard.type")}>
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className="font-mono text-[10px]"
                              >
                                {form.type}
                              </Badge>
                              <span className="text-[11px] text-muted-foreground">
                                {t("flag.detail.typeImmutable")}
                              </span>
                            </div>
                          </Field>
                          <Field
                            label={t("flag.wizard.variations")}
                            hint={t("flag.wizard.variationsHint")}
                          >
                            <VariationsEditor
                              t={t}
                              type={form.type}
                              variations={form.variations}
                              setVariations={form.setVariations}
                            />
                          </Field>
                        </CardContent>
                      </Card>
                    ) : (
                      <VariationsCard t={t} payload={payload} names={names} />
                    )}
                  </div>
                )}

                {/* The metadata pane stays mounted (only hidden) so the
                    uncontrolled enrichment editor keeps in-progress rows when
                    switching to another section. */}
                <div className={cn(section !== "metadata" && "hidden")}>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">
                        {t("flag.detail.metadataTitle")}
                      </CardTitle>
                      <CardDescription>
                        {t("flag.detail.metadataSubtitle")}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-5">
                      <EnrichmentEditor
                        key={metaEditorKey}
                        initial={customMetadataInitial}
                        types={METADATA_TYPES}
                        reservedKeys={RESERVED_META_KEYS}
                        hideChrome
                        readOnly={!canEdit}
                        onChange={form.setCustomMetadata}
                      />
                    </CardContent>
                  </Card>
                </div>

                {section === "settings" && (
                  <div className="flex flex-col gap-4">
                    {canEdit ? (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-sm">
                            {t("flag.detail.settingsTitle")}
                          </CardTitle>
                          <CardDescription>
                            {t("flag.detail.settingsSubtitle")}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="flex max-w-md flex-col gap-4">
                          <Field label={t("flag.detail.flagsetLabel")}>
                            <FlagsetLink
                              flagsetId={flag.flagsetId}
                              flagsetName={flagsetName}
                            />
                          </Field>
                          <Field label={t("flag.detail.edit.description")}>
                            <Input
                              value={form.description}
                              onChange={(e) =>
                                form.setDescription(e.target.value)
                              }
                            />
                          </Field>
                          <Field
                            label={t("flag.tags")}
                            hint={t("flag.detail.tagsHint")}
                          >
                            <TagInput
                              value={form.tags}
                              onChange={form.setTags}
                              suggestions={tagSuggestions}
                              readOnly={!canEdit}
                              placeholder={t("flag.tagsPlaceholder")}
                            />
                          </Field>
                          <Field
                            label={t("flag.detail.edit.trackEvents")}
                            hint={t("flag.detail.edit.trackEventsHint")}
                          >
                            <Switch
                              checked={form.trackEvents}
                              onCheckedChange={form.setTrackEvents}
                            />
                          </Field>
                          <Field label={t("flag.detail.createdBy")}>
                            <span className="text-sm">
                              {createdByName || "—"}
                            </span>
                          </Field>
                        </CardContent>
                      </Card>
                    ) : (
                      <SettingsCard
                        t={t}
                        metadata={payload?.metadata}
                        trackEvents={payload?.trackEvents ?? true}
                        flagsetId={flag.flagsetId}
                        flagsetName={flagsetName}
                        createdByName={createdByName}
                      />
                    )}

                    {(canEdit || canDelete) && (
                      <Card className="border-destructive/40">
                        <CardHeader>
                          <CardTitle className="text-sm text-destructive">
                            {t("flag.detail.danger.title")}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4">
                          {canEdit && (
                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <div className="text-sm font-medium">
                                  {flag.disabled
                                    ? t("flag.detail.danger.enableTitle")
                                    : t("flag.detail.danger.disableTitle")}
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {flag.disabled
                                    ? t("flag.detail.danger.enableDesc")
                                    : t("flag.detail.danger.disableDesc")}
                                </p>
                              </div>
                              <Button
                                variant={
                                  flag.disabled ? "default" : "destructive"
                                }
                                className="shrink-0 min-w-32"
                                onClick={() => setPendingToggle(true)}
                              >
                                {flag.disabled ? (
                                  <>
                                    <FlagIcon className="h-4 w-4" />
                                    {t("flag.detail.danger.enableCta")}
                                  </>
                                ) : (
                                  <>
                                    <FlagOffIcon className="h-4 w-4" />
                                    {t("flag.detail.danger.disableCta")}
                                  </>
                                )}
                              </Button>
                            </div>
                          )}
                          {canEdit && canDelete && <Separator />}
                          {canDelete && (
                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <div className="text-sm font-medium">
                                  {t("flag.detail.danger.deleteTitle")}
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {t("flag.detail.danger.deleteDesc")}
                                </p>
                              </div>
                              <Button
                                variant="destructive"
                                className="shrink-0 min-w-32"
                                onClick={() => setPendingDelete(true)}
                              >
                                <Trash2Icon className="h-4 w-4" />
                                {t("flag.detail.danger.deleteCta")}
                              </Button>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}

                {section === "history" && (
                  <div>
                    <HistoryTab
                      t={t}
                      flagId={flag.id}
                      currentVersion={flag.currentVersion ?? undefined}
                      canEdit={canEdit}
                      onReverted={() => query.refetch()}
                    />
                  </div>
                )}

                {section === "evaluate" && (
                  <div>
                    <EvaluatePanel
                      flagId={flag.id}
                      isDirty={canEdit && form.isDirty}
                      saving={saving}
                      saveAndThen={saveFlag}
                      defaultContext={
                        flagset?.defaultTestingEvaluationContext
                          ? JSON.stringify(
                              flagset.defaultTestingEvaluationContext,
                              null,
                              2,
                            )
                          : DEFAULT_TESTING_CONTEXT
                      }
                    />
                  </div>
                )}

                {section === "codeSample" && (
                  <div>
                    <FlagCodeSampleTab flag={flag} canReadKeys={canEdit} />
                  </div>
                )}
              </div>
            </div>

            {canEdit && form.isDirty && (
              <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 shadow-lg">
                <span className="text-sm font-medium">
                  {t("flag.detail.edit.unsavedChanges")}
                </span>
                <Input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={t("flag.detail.edit.commentPlaceholder")}
                  className="h-8 max-w-xs flex-1"
                />
                <div className="ml-auto flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={form.reset}
                    disabled={saving}
                  >
                    <Undo2Icon className="h-4 w-4" />
                    {t("flag.detail.edit.discard")}
                  </Button>
                  <Button
                    size="sm"
                    onClick={onSave}
                    disabled={saving || !form.valid}
                  >
                    <SaveIcon className="h-4 w-4" />
                    {t("flag.detail.edit.save")}
                  </Button>
                </div>
                {!form.valid && (
                  <span className="w-full text-xs text-destructive">
                    {t("flag.detail.edit.invalid")}
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <AlertDialog
        open={pendingToggle}
        onOpenChange={(open) => !open && setPendingToggle(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {flag?.disabled
                ? t("flag.confirmToggle.enableTitle")
                : t("flag.confirmToggle.disableTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {flag?.disabled
                ? t("flag.confirmToggle.enableDesc", { name: flag?.name })
                : t("flag.confirmToggle.disableDesc", { name: flag?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className={
                flag && !flag.disabled
                  ? buttonVariants({ variant: "destructive" })
                  : undefined
              }
              onClick={confirmToggle}
            >
              {t("flag.confirmToggle.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConfirmDeleteDialog
        open={pendingDelete}
        onOpenChange={setPendingDelete}
        title={t("flag.detail.deleteTitle")}
        description={t("flag.detail.deleteDesc", { name: flag?.name })}
        name={flag?.name ?? ""}
        confirmLabel={t("flag.detail.deleteConfirm")}
        onConfirm={confirmDelete}
      />
    </ListView>
  );
}

FlagDetailPage.displayName = "FlagDetailPage";
