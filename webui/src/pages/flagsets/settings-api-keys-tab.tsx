// ApiKeysTab: list, generate, and revoke a flagset's API keys, including the
// generate dialog and revoke confirmation. Extracted from settings.tsx.

import { useId, useState } from "react";
import { useCustom, useCustomMutation, useTranslate } from "@refinedev/core";
import { toast } from "sonner";
import { CopyIcon, InfoIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { API_URL } from "@/providers/constants";
import { errMessage } from "@/lib/errors";
import { copyToClipboard } from "@/lib/clipboard";
import type { FlagsetAPIKey } from "@/types/api";

export function ApiKeysTab({
  flagsetId,
  canManage,
}: {
  flagsetId: string;
  canManage: boolean;
}) {
  const t = useTranslate();
  const { mutate } = useCustomMutation();
  const keysUrl = `${API_URL}/flagsets/${flagsetId}/api-keys`;
  const { query } = useCustom<FlagsetAPIKey[]>({
    url: keysUrl,
    method: "get",
    queryOptions: { queryKey: ["flagset-keys", flagsetId] },
  });
  const keys = Array.isArray(query.data?.data) ? query.data!.data : [];

  const [genOpen, setGenOpen] = useState(false);
  const labelId = useId();
  const [label, setLabel] = useState("");
  const [pendingRevoke, setPendingRevoke] = useState<FlagsetAPIKey | null>(null);

  const copy = async (value: string) => {
    const ok = await copyToClipboard(value);
    if (ok) toast.success(t("flagset.settings.copied"));
    else toast.error(t("flagset.settings.copyError"));
  };

  const onGenerate = () => {
    if (!label.trim()) return;
    mutate(
      {
        url: keysUrl,
        method: "post",
        values: { label: label.trim() },
        successNotification: false,
        errorNotification: false,
      },
      {
        onSuccess: () => {
          toast.success(t("flagset.settings.keyCreated"));
          setLabel("");
          setGenOpen(false);
          query.refetch();
        },
        onError: (err) =>
          toast.error(t("flagset.settings.keyCreateError"), {
            description: errMessage(err),
          }),
      },
    );
  };

  const onRevoke = () => {
    if (!pendingRevoke) return;
    mutate(
      {
        url: `${keysUrl}/${pendingRevoke.id}`,
        method: "delete",
        values: {},
        successNotification: false,
        errorNotification: false,
      },
      {
        onSuccess: () => {
          toast.success(t("flagset.settings.revoked"));
          setPendingRevoke(null);
          query.refetch();
        },
        onError: (err) =>
          toast.error(t("flagset.settings.revokeError"), {
            description: errMessage(err),
          }),
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("flagset.settings.apiKeys")}</CardTitle>
          <CardDescription>{t("flagset.settings.keysSubtitle")}</CardDescription>
          {canManage && (
            <CardAction>
              <Dialog open={genOpen} onOpenChange={setGenOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <PlusIcon className="h-4 w-4" />
                    {t("flagset.settings.generate")}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("flagset.settings.generateTitle")}</DialogTitle>
                  </DialogHeader>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor={labelId}>{t("flagset.settings.labelField")}</Label>
                    <Input
                      id={labelId}
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder={t("flagset.settings.labelPlaceholder")}
                      onKeyDown={(e) => e.key === "Enter" && onGenerate()}
                    />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setGenOpen(false)}>
                      {t("common.cancel")}
                    </Button>
                    <Button onClick={onGenerate} disabled={!label.trim()}>
                      {t("flagset.settings.generate")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          {!canManage && (
            <Alert variant="warning" className="mb-4">
              <InfoIcon className="h-4 w-4" />
              <AlertDescription>
                {t("flagset.settings.keysReadOnly")}
              </AlertDescription>
            </Alert>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("flagset.settings.keyLabel")}</TableHead>
                <TableHead>{t("flagset.settings.key")}</TableHead>
                <TableHead className="w-44">{t("common.created")}</TableHead>
                {canManage && <TableHead className="w-16" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isLoading && (
                <TableRow>
                  <TableCell colSpan={canManage ? 4 : 3}>
                    {t("common.loading")}
                  </TableCell>
                </TableRow>
              )}
              {!query.isLoading && keys.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canManage ? 4 : 3} className="text-muted-foreground">
                    {t("flagset.settings.keysEmpty")}
                  </TableCell>
                </TableRow>
              )}
              {keys.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-medium">{k.label || "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <code className="block max-w-[220px] truncate rounded bg-muted px-2 py-1 font-mono text-xs">
                        {k.apiKey}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label={t("flagset.settings.copy")}
                        onClick={() => copy(k.apiKey)}
                      >
                        <CopyIcon className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {k.createdAt ? new Date(k.createdAt).toLocaleDateString() : ""}
                    {k.createdByName ? ` · ${k.createdByName}` : ""}
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("flagset.settings.revokeTitle")}
                        onClick={() => setPendingRevoke(k)}
                      >
                        <Trash2Icon className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog
        open={pendingRevoke !== null}
        onOpenChange={(open) => !open && setPendingRevoke(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("flagset.settings.revokeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("flagset.settings.revokeDesc", { label: pendingRevoke?.label })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={onRevoke}>
              {t("flagset.settings.revoke")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
