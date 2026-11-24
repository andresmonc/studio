// SettingsTab: edit a flagset's default testing evaluation context (the JSON
// context seeded into the flag Evaluate panel). Controlled by the settings
// page, which owns the draft and the single save bar.

import { useTranslate } from "@refinedev/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

export function SettingsTab({
  value,
  invalid,
  canWrite,
  onChange,
}: {
  value: string;
  invalid: boolean;
  canWrite: boolean;
  onChange: (value: string) => void;
}) {
  const t = useTranslate();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("flagset.settings.defaultTestingContext")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Textarea
          aria-label={t("flagset.settings.defaultTestingContext")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          rows={8}
          readOnly={!canWrite}
          aria-invalid={invalid}
          className="bg-muted font-mono text-sm"
        />
        {invalid ? (
          <p className="mt-2 text-xs text-destructive">
            {t("flagset.settings.defaultTestingContextInvalid")}
          </p>
        ) : (
          <p className="mt-2 text-2xs text-muted-foreground">
            {t("flagset.settings.defaultTestingContextHint")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
