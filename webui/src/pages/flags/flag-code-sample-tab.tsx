import { useMemo, useState } from "react";
import { useCustom, useTranslate } from "@refinedev/core";
import { CopyIcon, InfoIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { inferFlagType } from "@/components/flags/payload";
import { API_URL } from "@/providers/constants";
import { copyToClipboard } from "@/lib/clipboard";
import { CodeBlock } from "@/components/ui/code-block";
import { Segmented } from "@/components/ui/segmented";
import type { Flag, FlagsetAPIKey, FlagType } from "@/types/api";
import {
  API_KEY_PLACEHOLDER,
  FLAG_SAMPLE_LANGUAGES,
  buildFlagSample,
  evalType,
} from "./flag-code-samples";

// canReadKeys: listing API keys needs editor+ (viewers get a 403), so viewers
// see the snippet with the key placeholder.
export function FlagCodeSampleTab({ flag, canReadKeys }: { flag: Flag; canReadKeys: boolean }) {
  const t = useTranslate();
  const { query } = useCustom<FlagsetAPIKey[]>({
    url: `${API_URL}/flagsets/${flag.flagsetId}/api-keys`,
    method: "get",
    queryOptions: {
      queryKey: ["flagset-keys", flag.flagsetId],
      enabled: !!flag.flagsetId && canReadKeys,
    },
  });
  const keys = Array.isArray(query.data?.data) ? query.data!.data : [];

  // The example demonstrates the type the sample actually evaluates: a flag with
  // no variations infers as "unknown" but the snippet falls back to a boolean
  // example, so show "boolean" rather than a mismatched "unknown" badge.
  const type = inferFlagType(flag.payload) as FlagType;
  const sampleType = evalType(type);

  const [langId, setLangId] = useState<string>(FLAG_SAMPLE_LANGUAGES[0].id);
  const [selectedKeyId, setSelectedKeyId] = useState<string>("");

  // The full sample (provider init + a type-correct evaluation of this flag).
  const sample = useMemo(
    () => buildFlagSample(langId, flag.name, type),
    [langId, flag.name, type],
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
  // not on unrelated re-renders. A function replacement avoids `$`-sequences in
  // a key being treated as match patterns.
  const snippet = useMemo(
    () => sample.code.replaceAll(API_KEY_PLACEHOLDER, () => resolvedKey),
    [sample.code, resolvedKey],
  );

  const copy = async () => {
    const ok = await copyToClipboard(snippet);
    if (ok) toast.success(t("flagset.settings.copied"));
    else toast.error(t("flagset.settings.copyError"));
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            {t("flag.detail.codeSample.title")}
            <Badge variant="outline" className="font-mono text-2xs">
              {sampleType}
            </Badge>
          </CardTitle>
          <CardDescription className="mt-1.5">
            {t("flag.detail.codeSample.desc")}
          </CardDescription>
        </div>

        <Segmented
          value={langId}
          onChange={setLangId}
          options={FLAG_SAMPLE_LANGUAGES.map((s) => ({ value: s.id, label: s.label }))}
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
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label={t("flagset.settings.copy")}
                onClick={copy}
              >
                <CopyIcon className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <CodeBlock code={snippet} language={sample.lang} rounded={false} />
        </div>
      </CardContent>
    </Card>
  );
}

FlagCodeSampleTab.displayName = "FlagCodeSampleTab";
