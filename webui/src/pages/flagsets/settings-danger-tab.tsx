// DangerTab: delete a flagset, behind a confirmation dialog. Rendered at the
// bottom of the Settings tab for admins only (mirrors the flag detail page).

import { useState } from "react";
import { useCustomMutation, useTranslate } from "@refinedev/core";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDeleteDialog } from "@/components/common/confirm-delete-dialog";
import { API_URL } from "@/providers/constants";
import { errMessage } from "@/lib/errors";
import type { Flagset } from "@/types/api";

export function DangerTab({ flagset }: { flagset: Flagset }) {
  const t = useTranslate();
  const navigate = useNavigate();
  const { mutate } = useCustomMutation();
  const [open, setOpen] = useState(false);

  const onDelete = () => {
    mutate(
      {
        url: `${API_URL}/flagsets/${flagset.id}`,
        method: "delete",
        values: {},
        successNotification: false,
        errorNotification: false,
      },
      {
        onSuccess: () => {
          toast.success(t("flagset.deleted"));
          navigate("/flagsets");
        },
        onError: (err) =>
          toast.error(t("flagset.deleteError"), { description: errMessage(err) }),
      },
    );
  };

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-sm text-destructive">
          {t("flagset.settings.danger")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-medium">
            {t("flagset.settings.deleteTitle")}
          </div>
          <p className="text-sm text-muted-foreground">
            {t("flagset.settings.dangerDesc")}
          </p>
        </div>
        <Button
          variant="destructive"
          className="shrink-0"
          onClick={() => setOpen(true)}
        >
          <Trash2Icon className="h-4 w-4" />
          {t("flagset.settings.deleteCta")}
        </Button>
        <ConfirmDeleteDialog
          open={open}
          onOpenChange={setOpen}
          title={t("flagset.deleteTitle")}
          description={t("flagset.deleteDesc", {
            name: flagset.name,
            count: flagset.flagCount,
          })}
          name={flagset.name}
          confirmLabel={t("flagset.deleteConfirm")}
          onConfirm={onDelete}
        />
      </CardContent>
    </Card>
  );
}
