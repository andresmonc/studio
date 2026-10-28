// ContextTab: edit a flagset's evaluation-context enrichment via the shared
// EnrichmentEditor. Extracted from settings.tsx.

import { useCallback, useState } from "react";
import { useCustomMutation, useTranslate } from "@refinedev/core";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EnrichmentEditor } from "@/components/flagsets/enrichment-editor";
import { API_URL } from "@/providers/constants";
import { errMessage } from "@/lib/errors";
import type { Flagset } from "@/types/api";

export function ContextTab({
  flagset,
  canWrite,
  onSaved,
}: {
  flagset: Flagset;
  canWrite: boolean;
  onSaved: () => void;
}) {
  const t = useTranslate();
  const { mutate } = useCustomMutation();
  const [obj, setObj] = useState<Record<string, unknown>>(
    flagset.evaluationContextEnrichment ?? {},
  );
  const [valid, setValid] = useState(true);
  const [editorKey, setEditorKey] = useState(0);
  const onChange = useCallback(
    (o: Record<string, unknown>, v: boolean) => {
      setObj(o);
      setValid(v);
    },
    [],
  );

  const onSave = () => {
    mutate(
      {
        url: `${API_URL}/flagsets/${flagset.id}`,
        method: "patch",
        values: { evaluationContextEnrichment: obj },
        successNotification: false,
        errorNotification: false,
      },
      {
        onSuccess: () => {
          toast.success(t("flagset.settings.saved"));
          onSaved();
        },
        onError: (err) =>
          toast.error(t("flagset.updateError"), { description: errMessage(err) }),
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("flagset.settings.context")}</CardTitle>
      </CardHeader>
      <CardContent>
        <EnrichmentEditor
          key={editorKey}
          initial={flagset.evaluationContextEnrichment ?? undefined}
          onChange={onChange}
          readOnly={!canWrite}
        />
        {canWrite && (
          <div className="mt-4 flex gap-2">
            <Button onClick={onSave} disabled={!valid}>
              {t("common.save")}
            </Button>
            <Button variant="ghost" onClick={() => setEditorKey((k) => k + 1)}>
              {t("common.cancel")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
