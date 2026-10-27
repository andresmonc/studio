import { useMemo, useState } from "react";
import { useCustom, useTranslate } from "@refinedev/core";
import { InfoIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { API_URL } from "@/providers/constants";
import { CodeBlock } from "@/components/ui/code-block";
import { CopyButton } from "@/components/ui/copy-button";
import { Segmented } from "@/components/ui/segmented";
import type { FlagsetAPIKey } from "@/types/api";
import { API_KEY_PLACEHOLDER, CODE_SAMPLES } from "./code-samples";

// canReadKeys: listing API keys needs editor+ (viewers get a 403), so viewers
// see the snippet with the key placeholder.
export function CodeSampleTab({ flagsetId, canReadKeys }: { flagsetId: string; canReadKeys: boolean }) {
  const t = useTranslate();
  const { query } = useCustom<FlagsetAPIKey[]>({
    url: `${API_URL}/flagsets/${flagsetId}/api-keys`,
    method: "get",
    queryOptions: { queryKey: ["flagset-keys", flagsetId], enabled: canReadKeys },
  });
  const keys = Array.isArray(query.data?.data) ? query.data!.data : [];

  const [langId, setLangId] = useState<string>(CODE_SAMPLES[0].id);
  const [selectedKeyId, setSelectedKeyId] = useState<string>("");

  const sample = useMemo(
    () => CODE_SAMPLES.find((s) => s.id === langId) ?? CODE_SAMPLES[0],
    [langId],
  );

  // The select always reflects the key actually embedded in the snippet: fall
  // back to the first key when nothing valid is selected (avoids an empty
  // placeholder while a key is already injected into the code).
  const effectiveKeyId = keys.some((k) => k.id === selectedKeyId)
    ? selectedKeyId
    : keys[0]?.id ?? "";
  const resolvedKey =
    keys.find((k) => k.id === effectiveKeyId)?.apiKey ?? API_KEY_PLACEHOLDER;

  // Memoized so the highlighter only re-tokenizes when the code or key changes,
  // not on unrelated re-renders (theme toggle, parent re-render). A function
  // replacement avoids `$`-sequences in a key being treated as match patterns.
  const snippet = useMemo(
    () => sample.code.replaceAll(API_KEY_PLACEHOLDER, () => resolvedKey),
    [sample.code, resolvedKey],
  );

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3">
        <div>
          <CardTitle>{t("flagset.settings.codeSample")}</CardTitle>
          <CardDescription className="mt-1.5">
            {t("flagset.settings.codeSampleDesc")}
          </CardDescription>
        </div>

        <Segmented
          value={langId}
          onChange={setLangId}
          options={CODE_SAMPLES.map((s) => ({ value: s.id, label: s.label }))}
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* Distinguish a failed key fetch from a genuinely keyless flagset — a
            collapsed "no keys" message on error would be misleading. */}
        {query.isError ? (
          <Alert variant="destructive">
            <InfoIcon className="h-4 w-4" />
            <AlertDescription>
              {t("flagset.settings.codeSampleKeysError")}
            </AlertDescription>
          </Alert>
        ) : canReadKeys && !query.isLoading && keys.length === 0 ? (
          <Alert variant="warning">
            <InfoIcon className="h-4 w-4" />
            <AlertDescription>
              {t("flagset.settings.codeSampleNoKey")}
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="overflow-hidden rounded-md border">
          {/* Editor-style toolbar: language on the left, the API key embedded
              in the sample (+ copy) on the right. */}
          <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {sample.label}
            </span>
            <div className="flex items-center gap-2">
              {keys.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">
                    {t("flagset.settings.apiKeyInSample")}
                  </span>
                  <Select value={effectiveKeyId} onValueChange={setSelectedKeyId}>
                    <SelectTrigger
                      className="h-7 w-[160px] text-xs"
                      aria-label={t("flagset.settings.apiKeyInSample")}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {keys.map((k) => (
                        <SelectItem key={k.id} value={k.id}>
                          {k.label || k.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <CopyButton value={snippet} label={t("common.copy")} />
            </div>
          </div>
          <CodeBlock code={snippet} language={sample.lang} rounded={false} />
        </div>
      </CardContent>
    </Card>
  );
}

CodeSampleTab.displayName = "CodeSampleTab";
