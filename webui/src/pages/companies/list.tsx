import { useState } from "react";
import { useList, useDelete, useNavigation, useTranslate } from "@refinedev/core";
import { toast } from "sonner";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { ListView, ListViewHeader } from "@/components/refine-ui/views/list-view";
import type { Company } from "@/types/api";
import { HttpError } from "@/providers/http";
import { isMonoCompany } from "@/providers/ui-config";

export function CompanyListPage() {
  const t = useTranslate();
  const { result, query } = useList<Company>({ resource: "companies" });
  const isLoading = query.isLoading;
  const companies = result.data ?? [];
  const { edit } = useNavigation();
  const { mutate: deleteCompany, mutation } = useDelete();
  const [pendingDelete, setPendingDelete] = useState<Company | null>(null);

  const onConfirmDelete = () => {
    if (!pendingDelete) return;
    deleteCompany(
      { resource: "companies", id: pendingDelete.id },
      {
        onSuccess: () => {
          toast.success(t("companies.list.deleted"));
          setPendingDelete(null);
        },
        onError: (err) => {
          const msg =
            err instanceof HttpError
              ? err.message
              : t("companies.list.deleteError");
          toast.error(msg);
          setPendingDelete(null);
        },
      }
    );
  };

  return (
    <ListView>
      <ListViewHeader
        title={t("companies.list.title")}
        canCreate={!isMonoCompany()}
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-28">{t("common.uuid")}</TableHead>
            <TableHead>{t("common.displayName")}</TableHead>
            <TableHead>{t("common.description")}</TableHead>
            <TableHead>{t("common.created")}</TableHead>
            <TableHead className="w-32 text-right">
              {t("common.actions")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={5}>{t("common.loading")}</TableCell>
            </TableRow>
          )}
          {!isLoading && companies.length === 0 && (
            <TableRow>
              <TableCell colSpan={5}>{t("companies.list.empty")}</TableCell>
            </TableRow>
          )}
          {companies.map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="font-mono text-xs cursor-help">
                      {c.id.slice(0, 8)}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <span className="font-mono text-xs">{c.id}</span>
                  </TooltipContent>
                </Tooltip>
              </TableCell>
              <TableCell className="font-medium">{c.displayName}</TableCell>
              <TableCell>{c.description}</TableCell>
              <TableCell>
                {c.createdAt ? new Date(c.createdAt).toLocaleString() : ""}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("companies.list.editAria")}
                    onClick={() => edit("companies", c.id)}
                  >
                    <PencilIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("companies.list.deleteAria")}
                    onClick={() => setPendingDelete(c)}
                  >
                    <Trash2Icon className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("companies.list.deleteTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("companies.list.deleteDesc", {
                name: pendingDelete?.displayName,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmDelete}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? t("common.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ListView>
  );
}

CompanyListPage.displayName = "CompanyListPage";
