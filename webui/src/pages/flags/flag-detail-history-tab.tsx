// HistoryTab: the version-history list + diff viewer for the flag detail page,
// with rollback. Extracted from detail.tsx; fetches its own version data.

import { useMemo, useState } from "react";
import { useCustom, useCustomMutation } from "@refinedev/core";
import { toast } from "sonner";
import { RotateCcwIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { diffLines } from "@/components/flags/diff";
import { type Tr } from "@/components/flags/flag-form";
import { API_URL } from "@/providers/constants";
import { errMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import type { FlagVersion, PaginatedResponse } from "@/types/api";
import { EmptyState } from "@/components/ui/empty-state";

export function HistoryTab({
  t,
  flagId,
  currentVersion,
  canEdit,
  onReverted,
}: {
  t: Tr;
  flagId: string;
  currentVersion?: number;
  canEdit: boolean;
  onReverted: () => void;
}) {
  const { query } = useCustom<PaginatedResponse<FlagVersion>>({
    url: `${API_URL}/flags/${flagId}/versions`,
    method: "get",
    queryOptions: { queryKey: ["flag-versions", flagId] },
  });
  const versions = useMemo(() => {
    const list = query.data?.data?.data ?? [];
    return [...list].sort((a, b) => b.versionNumber - a.versionNumber);
  }, [query.data]);

  const [selected, setSelected] = useState<number | null>(null);
  const selectedVersion =
    versions.find((v) => v.versionNumber === selected) ?? versions[0];

  const { mutate } = useCustomMutation();
  const [reverting, setReverting] = useState<number | null>(null);

  const revert = (n: number) => {
    setReverting(n);
    mutate(
      {
        url: `${API_URL}/flags/${flagId}/versions/${n}/rollback`,
        method: "post",
        values: {},
        successNotification: false,
        errorNotification: false,
      },
      {
        onSuccess: () => {
          toast.success(t("flag.detail.history.reverted", { n }));
          setReverting(null);
          query.refetch();
          onReverted();
        },
        onError: (err) => {
          toast.error(t("flag.detail.history.revertError"), {
            description: errMessage(err),
          });
          setReverting(null);
        },
      },
    );
  };

  if (!query.isLoading && versions.length === 0) {
    return (
      <EmptyState>
        {t("flag.detail.history.empty")}
      </EmptyState>
    );
  }

  const prev = selectedVersion
    ? versions.find((v) => v.versionNumber === selectedVersion.versionNumber - 1)
    : undefined;
  const diff = selectedVersion
    ? diffLines(
        prev ? JSON.stringify(prev.payload, null, 2) : "",
        JSON.stringify(selectedVersion.payload, null, 2),
      )
    : [];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {t("flag.detail.history.title")}
          </CardTitle>
          <CardDescription>{t("flag.detail.history.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {versions.map((v) => {
            const isCurrent = v.versionNumber === currentVersion;
            const active = selectedVersion?.versionNumber === v.versionNumber;
            // Select and revert are sibling buttons: a button nested in a
            // button is invalid HTML and breaks keyboard/screen-reader access.
            return (
              <div
                key={v.id}
                className={cn(
                  "flex items-start border-b last:border-b-0 hover:bg-muted/50",
                  active && "bg-muted/60",
                )}
              >
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelected(v.versionNumber)}
                  className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3 text-left"
                >
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border bg-card font-mono text-2xs font-semibold text-muted-foreground">
                    {v.versionNumber}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">
                        {v.comment?.trim() ||
                          t("flag.detail.history.version", {
                            n: v.versionNumber,
                          })}
                      </span>
                      {isCurrent && (
                        <Badge className="text-2xs">
                          {t("flag.detail.history.current")}
                        </Badge>
                      )}
                      {v.versionNumber === 1 && (
                        <Badge variant="outline" className="text-2xs">
                          {t("flag.detail.history.initial")}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {t("flag.detail.history.updatedBy", {
                        who: v.createdByName || "—",
                        when: new Date(v.createdAt).toLocaleString(),
                      })}
                    </div>
                  </div>
                </button>
                {canEdit && !isCurrent && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mr-4 mt-3"
                    disabled={reverting === v.versionNumber}
                    onClick={() => revert(v.versionNumber)}
                  >
                    <RotateCcwIcon className="h-3.5 w-3.5" />
                    {t("flag.detail.history.revert")}
                  </Button>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="lg:sticky lg:top-4">
        <CardHeader>
          <CardTitle className="text-sm">
            {selectedVersion
              ? t("flag.detail.history.diffTitle", {
                  n: selectedVersion.versionNumber,
                })
              : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!prev && (
            <p className="mb-2 text-xs text-muted-foreground">
              {t("flag.detail.history.noPrev")}
            </p>
          )}
          <pre className="max-h-[60vh] overflow-auto rounded-md border bg-muted/30 p-3 font-mono text-2xs leading-relaxed">
            {diff.map((line, i) => (
              <div
                key={i}
                className={cn(
                  "whitespace-pre-wrap px-1",
                  line.type === "add" && "bg-success/10 text-success",
                  line.type === "del" &&
                    "bg-destructive/10 text-destructive line-through",
                )}
              >
                <span className="select-none pr-2 text-muted-foreground">
                  {line.type === "add" ? "+" : line.type === "del" ? "-" : " "}
                </span>
                {line.text || " "}
              </div>
            ))}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
