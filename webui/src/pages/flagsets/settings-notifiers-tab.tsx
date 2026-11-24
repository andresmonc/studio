// NotifiersTab: one card per notifier kind to add a notifier, then the
// flagset's notifiers, switched on and off in place and edited or removed
// through NotifierDialog. Every change saves the whole list.

import { useState } from "react";
import { useCustom, useCustomMutation, useTranslate } from "@refinedev/core";
import { toast } from "sonner";
import { BellIcon, InfoIcon, PencilIcon, PlusIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CodeChip } from "@/components/ui/code-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { API_URL } from "@/providers/constants";
import { errMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import type { Notifier, NotifierKind } from "@/types/api";
import { NotifierDialog, NotifierLogo } from "./notifier-dialog";

const NOTIFIER_KINDS: NotifierKind[] = ["slack", "discord", "microsoftteams", "webhook"];

// dialog: null when closed; index null when adding a notifier of `kind`.
type DialogState = { index: number; kind?: never } | { index: null; kind: NotifierKind } | null;

export function NotifiersTab({ flagsetId, canManage }: { flagsetId: string; canManage: boolean }) {
  const t = useTranslate();
  const url = `${API_URL}/flagsets/${flagsetId}/notifiers`;
  const { query } = useCustom<Notifier[]>({
    url,
    method: "get",
    queryOptions: { queryKey: ["flagset-notifiers", flagsetId] },
  });
  const notifiers = Array.isArray(query.data?.data) ? query.data!.data : [];
  const { mutate, mutation } = useCustomMutation();
  const [dialog, setDialog] = useState<DialogState>(null);

  const save = (next: Notifier[]) =>
    mutate(
      { url, method: "put", values: { notifiers: next }, successNotification: false, errorNotification: false },
      {
        onSuccess: () => {
          toast.success(t("flagset.settings.notifiers.saved"));
          setDialog(null);
          query.refetch();
        },
        onError: (err) =>
          toast.error(t("flagset.settings.notifiers.saveError"), { description: errMessage(err) }),
      },
    );

  const label = (k: NotifierKind) => t(`flagset.settings.notifiers.${k}.label`);
  const defaultName = (kind: NotifierKind) => {
    const same = notifiers.filter((n) => n.kind === kind).length;
    return same ? `${label(kind)} ${same + 1}` : label(kind);
  };
  const on = notifiers.filter((n) => n.enabled).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("flagset.settings.notifiers.title")}</CardTitle>
        <CardDescription>{t("flagset.settings.notifiers.subtitle")}</CardDescription>
        {notifiers.length > 0 && (
          <p className="text-xs font-medium text-muted-foreground">
            {t("flagset.settings.notifiers.summary", { count: notifiers.length, on, off: notifiers.length - on })}
          </p>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!canManage && (
          <Alert variant="warning">
            <InfoIcon className="h-4 w-4" />
            <AlertDescription>{t("flagset.settings.notifiers.readOnly")}</AlertDescription>
          </Alert>
        )}

        {canManage && (
          <section aria-labelledby="notifier-kinds" className="flex flex-col gap-2">
            <h3 id="notifier-kinds" className="text-xs font-medium text-muted-foreground">
              {t("flagset.settings.notifiers.addHeading")}
            </h3>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2">
              {NOTIFIER_KINDS.map((k) => (
                <Button
                  key={k}
                  variant="outline"
                  className="h-14 justify-start gap-3 px-3.5"
                  aria-label={t("flagset.settings.notifiers.addKind", { kind: label(k) })}
                  onClick={() => setDialog({ index: null, kind: k })}
                >
                  <NotifierLogo kind={k} className="size-6" />
                  <span className="flex-1 text-left">{label(k)}</span>
                  <PlusIcon className="text-muted-foreground" />
                </Button>
              ))}
            </div>
          </section>
        )}

        {query.isLoading ? (
          <div
            className="flex flex-col gap-2"
            role="status"
            aria-busy="true"
            aria-label={t("common.loading")}
          >
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : notifiers.length === 0 ? (
          <EmptyState variant="inline" className="flex flex-col items-center gap-3 py-10 text-sm">
            <BellIcon className="size-5" />
            <div className="flex flex-col gap-1">
              <span className="font-medium text-foreground">{t("flagset.settings.notifiers.emptyTitle")}</span>
              <span>
                {canManage ? t("flagset.settings.notifiers.emptyDesc") : t("flagset.settings.notifiers.emptyReadOnly")}
              </span>
            </div>
          </EmptyState>
        ) : (
          <ul className="divide-y overflow-hidden rounded-lg border bg-background">
            {notifiers.map((n, i) => {
              const target = n.kind === "webhook" ? n.endpointUrl : n.webhookUrl;
              return (
                <li key={i} className="flex items-center gap-3 py-3 pr-3 pl-4">
                  <span
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-md border bg-card",
                      !n.enabled && "opacity-55 grayscale",
                    )}
                  >
                    <NotifierLogo kind={n.kind} className="size-5" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-medium">{n.name}</span>
                      <Badge variant="secondary">{label(n.kind)}</Badge>
                    </div>
                    {target ? (
                      <CodeChip size="sm" className="max-w-full self-start truncate text-muted-foreground">
                        {target}
                      </CodeChip>
                    ) : (
                      <span className="text-xs text-warning">{t("flagset.settings.notifiers.noUrl")}</span>
                    )}
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">
                    {n.enabled ? t("flagset.settings.notifiers.on") : t("flagset.settings.notifiers.off")}
                  </span>
                  <Switch
                    checked={n.enabled}
                    disabled={!canManage || mutation.isPending}
                    aria-label={t("flagset.settings.notifiers.toggle", { name: n.name })}
                    onCheckedChange={(enabled) =>
                      save(notifiers.map((x, j) => (j === i ? { ...x, enabled } : x)))
                    }
                  />
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground"
                      aria-label={t("flagset.settings.notifiers.edit", { name: n.name })}
                      onClick={() => setDialog({ index: i })}
                    >
                      <PencilIcon />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      {dialog && (
        <NotifierDialog
          isNew={dialog.index === null}
          initial={
            dialog.index === null
              ? { name: defaultName(dialog.kind), kind: dialog.kind, enabled: true }
              : notifiers[dialog.index]
          }
          saving={mutation.isPending}
          onClose={() => setDialog(null)}
          onRemove={() => save(notifiers.filter((_, j) => j !== dialog.index))}
          onSave={(n) =>
            save(dialog.index === null ? [...notifiers, n] : notifiers.map((x, j) => (j === dialog.index ? n : x)))
          }
        />
      )}
    </Card>
  );
}
