// SettingsTab: edit a flagset's default testing evaluation context (the JSON
// context seeded into the flag Evaluate panel). Extracted from settings.tsx.

import { useState } from "react";
import { useCustomMutation, useTranslate } from "@refinedev/core";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_TESTING_CONTEXT } from "@/components/flags/evaluate-panel";
import { API_URL } from "@/providers/constants";
import { errMessage } from "@/lib/errors";
import type { Flagset } from "@/types/api";

export function SettingsTab({
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
  // Seed from the flagset's configured value, or the shared default when unset.
  const seed = flagset.defaultTestingEvaluationContext
    ? JSON.stringify(flagset.defaultTestingEvaluationContext, null, 2)
    : DEFAULT_TESTING_CONTEXT;
  const [value, setValue] = useState(seed);
  const [jsonError, setJsonError] = useState(false);

  // Parse the textarea into a plain JSON object, or null when invalid.
  const parsed = (): Record<string, unknown> | null => {
    try {
      const v = JSON.parse(value);
      if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
      return v as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  const onSave = () => {
    const obj = parsed();
    if (!obj) {
      setJsonError(true);
      return;
    }
    setJsonError(false);
    mutate(
      {
        url: `${API_URL}/flagsets/${flagset.id}`,
        method: "patch",
        values: { defaultTestingEvaluationContext: obj },
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
        <CardTitle>{t("flagset.settings.defaultTestingContext")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Textarea
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (jsonError) setJsonError(false);
          }}
          spellCheck={false}
          rows={8}
          readOnly={!canWrite}
          aria-invalid={jsonError}
          className="bg-muted font-mono text-sm"
        />
        {jsonError ? (
          <p className="mt-2 text-xs text-destructive">
            {t("flagset.settings.defaultTestingContextInvalid")}
          </p>
        ) : (
          <p className="mt-2 text-2xs text-muted-foreground">
            {t("flagset.settings.defaultTestingContextHint")}
          </p>
        )}
        {canWrite && (
          <div className="mt-4 flex gap-2">
            <Button onClick={onSave}>{t("common.save")}</Button>
            <Button
              variant="ghost"
              onClick={() => {
                setValue(seed);
                setJsonError(false);
              }}
            >
              {t("common.cancel")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
