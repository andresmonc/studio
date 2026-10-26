import { useCallback, useMemo, useState } from "react";
import { useCustom, useCustomMutation, useTranslate } from "@refinedev/core";
import { useForm } from "@refinedev/react-hook-form";
import type { BaseRecord, HttpError as RefineHttpError } from "@refinedev/core";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Link } from "react-router";
import { CheckIcon, FlagIcon, Home, PlusIcon, ZapIcon } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { FlagsetCard } from "./flagset-card";
import { EnrichmentEditor } from "./enrichment-editor";
import { useActiveTeam } from "@/hooks/use-active-team";
import { canEditTeam, effectiveTeamRole } from "@/providers/access-control";
import { API_URL } from "@/providers/constants";
import { errMessage } from "@/lib/errors";
import type { Flagset } from "@/types/api";

type FlagsetValues = {
  name: string;
  description?: string | null;
};

export function FlagsetsPage() {
  const t = useTranslate();
  const { activeTeamId, memberships } = useActiveTeam();
  const teamName = memberships.find((m) => m.teamId === activeTeamId)?.teamName;

  const canCreate =
    !!activeTeamId &&
    (canEditTeam(activeTeamId) || effectiveTeamRole(activeTeamId) === "editor");
  const canDelete = !!activeTeamId && canEditTeam(activeTeamId);

  const flagsetsUrl = `${API_URL}/teams/${activeTeamId}/flagsets`;
  const { query } = useCustom<Flagset[]>({
    url: flagsetsUrl,
    method: "get",
    queryOptions: { queryKey: ["team-flagsets", activeTeamId], enabled: !!activeTeamId },
  });
  const flagsets: Flagset[] = Array.isArray(query.data?.data)
    ? query.data!.data
    : [];

  const { mutate: customMutate } = useCustomMutation();

  const flagsTotal = flagsets.reduce((sum, fs) => sum + (fs.flagCount ?? 0), 0);
  const apiKeysTotal = flagsets.reduce((sum, fs) => sum + (fs.apiKeyCount ?? 0), 0);

  const schema = useMemo(
    () =>
      z.object({
        name: z.string().min(1, t("flagset.nameRequired")).max(120),
        description: z
          .string()
          .nullish()
          .transform((v) => v ?? "")
          .refine((v) => v.length <= 500, { message: t("common.maxChars") }),
      }),
    [t],
  );

  const form = useForm<BaseRecord, RefineHttpError, FlagsetValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", description: "" },
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Flagset | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Enrichment editor manages its own rows; it reports the built object + validity.
  // `editorKey` is bumped to remount (reset) the editor after a successful create.
  const [enrichment, setEnrichment] = useState<Record<string, unknown>>({});
  const [enrichmentValid, setEnrichmentValid] = useState(true);
  const [editorKey, setEditorKey] = useState(0);
  const onEnrichmentChange = useCallback(
    (obj: Record<string, unknown>, valid: boolean) => {
      setEnrichment(obj);
      setEnrichmentValid(valid);
    },
    [],
  );

  const onCreate = form.handleSubmit((values) => {
    if (!enrichmentValid) return;
    const hasEnrichment = Object.keys(enrichment).length > 0;
    customMutate(
      {
        url: flagsetsUrl,
        method: "post",
        values: {
          name: values.name,
          description: values.description ?? "",
          ...(hasEnrichment
            ? { evaluationContextEnrichment: enrichment }
            : {}),
        },
        successNotification: false,
        errorNotification: false,
      },
      {
        onSuccess: () => {
          toast.success(t("flagset.created"));
          form.reset({ name: "", description: "" });
          setEnrichment({});
          setEnrichmentValid(true);
          setEditorKey((k) => k + 1);
          setCreateOpen(false);
          query.refetch();
        },
        onError: (err) => {
          toast.error(t("flagset.createError"), { description: errMessage(err) });
        },
      },
    );
  });

  const onConfirmDelete = () => {
    if (!pendingDelete) return;
    setDeleting(true);
    customMutate(
      {
        url: `${API_URL}/flagsets/${pendingDelete.id}`,
        method: "delete",
        values: {},
        successNotification: false,
        errorNotification: false,
      },
      {
        onSuccess: () => {
          toast.success(t("flagset.deleted"));
          setPendingDelete(null);
          setDeleting(false);
          query.refetch();
        },
        onError: (err) => {
          toast.error(t("flagset.deleteError"), { description: errMessage(err) });
          setDeleting(false);
        },
      },
    );
  };

  return (
    <ListView>
      <div className="flex flex-col gap-4">
        <div className="flex items-center relative gap-2">
          <div className="bg-background z-[2] pr-4">
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
                  <BreadcrumbPage>{t("flagset.cardTitle")}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <Separator className="absolute left-0 right-0 z-[1]" />
        </div>

        <div className="flex items-end gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {t("flagset.cardTitle")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("flagset.subtitle", {
                count: flagsets.length,
                team: teamName ?? "—",
              })}
            </p>
          </div>
          {canCreate && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button className="ml-auto">
                  <PlusIcon className="h-4 w-4" />
                  {t("flagset.newFlagset")}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[720px]">
                <DialogHeader>
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                      <FlagIcon className="h-4 w-4" />
                    </span>
                    <div>
                      <DialogTitle>{t("flagset.newFlagset")}</DialogTitle>
                      <DialogDescription>
                        {t("flagset.modalSubtitle")}
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={onCreate} className="flex flex-col gap-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("common.name")}</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              className="font-mono"
                              placeholder="checkout-team"
                            />
                          </FormControl>
                          <p className="text-[11px] text-muted-foreground">
                            {t("flagset.nameHint")}
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {t("common.description")}{" "}
                            <span className="font-normal text-muted-foreground">
                              · {t("common.optional")}
                            </span>
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              rows={2}
                              placeholder={t("flagset.descPlaceholder")}
                              value={field.value ?? ""}
                              onChange={field.onChange}
                              onBlur={field.onBlur}
                              name={field.name}
                              ref={field.ref}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <EnrichmentEditor
                      key={editorKey}
                      onChange={onEnrichmentChange}
                    />
                    <DialogFooter className="items-center sm:justify-between">
                      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <ZapIcon className="h-3.5 w-3.5" />
                        {t("flagset.footerNote")}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setCreateOpen(false)}
                        >
                          {t("common.cancel")}
                        </Button>
                        <Button type="submit" disabled={!enrichmentValid}>
                          <CheckIcon className="h-4 w-4" />
                          {t("flagset.createCta")}
                        </Button>
                      </div>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {!activeTeamId ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              {t("flagset.noTeam")}
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Stats strip */}
            <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
              <StatCard label={t("flagset.cardTitle")} value={String(flagsets.length)} />
              <StatCard label={t("flagset.statFlags")} value={String(flagsTotal)} />
              <StatCard label={t("flagset.statEvals")} value="—" muted />
              <StatCard label={t("flagset.apiKeys")} value={String(apiKeysTotal)} />
            </div>

            {query.isLoading ? (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  {t("common.loading")}
                </CardContent>
              </Card>
            ) : flagsets.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  {t("flagset.empty")}
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                {flagsets.map((fs) => (
                  <FlagsetCard
                    key={fs.id}
                    fs={fs}
                    editable={canDelete}
                    onDelete={setPendingDelete}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmDeleteDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={t("flagset.deleteTitle")}
        description={t("flagset.deleteDesc", {
          name: pendingDelete?.name,
          count: pendingDelete?.flagCount ?? 0,
        })}
        name={pendingDelete?.name ?? ""}
        confirmLabel={
          deleting ? t("common.deleting") : t("flagset.deleteConfirm")
        }
        onConfirm={onConfirmDelete}
        pending={deleting}
      />
    </ListView>
  );
}

function StatCard({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={
          muted
            ? "mt-1 text-2xl font-semibold tabular-nums text-muted-foreground"
            : "mt-1 text-2xl font-semibold tabular-nums tracking-tight"
        }
      >
        {value}
      </div>
    </Card>
  );
}

FlagsetsPage.displayName = "FlagsetsPage";
