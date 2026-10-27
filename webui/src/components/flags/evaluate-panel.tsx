import { useId, useState } from "react";
import { useCustomMutation, useTranslate } from "@refinedev/core";
import { toast } from "sonner";
import { AlertTriangleIcon, PlayIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

// Mirror of server/management/model/evaluation.go's EvaluationResult.
type EvaluationResult = {
  value: unknown;
  variationType: string;
  reason: string;
  errorCode?: string;
  errorDetails?: string;
  failed: boolean;
  trackEvents: boolean;
  version?: string;
  cacheable: boolean;
  metadata?: Record<string, unknown>;
  flagType?: string;
};

type Props = {
  flagId: string;
  // Whether the surrounding flag form has unsaved edits. The evaluate endpoint
  // only ever sees the *saved* payload, so we warn before testing while dirty.
  isDirty: boolean;
  saving: boolean;
  // Save the current form, then invoke the callback once the save succeeds.
  saveAndThen: (cb: () => void) => void;
  // JSON string the context textarea is seeded with (the flagset's configured
  // default testing context, or DEFAULT_TESTING_CONTEXT when none is set).
  defaultContext: string;
};

// Render an evaluation value: pretty-print objects, show primitives verbatim.
function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

// Fallback testing context proposed when a flagset hasn't configured its own.
// Shared with the flagset Settings tab so both seed from the same value.
export const DEFAULT_TESTING_CONTEXT = `{
  "targetingKey": "1155ac57-b931-41e2-8e2f-54a459089ae7",
  "email": "thomas@gofeatureflag.org"
}`;

export function EvaluatePanel({
  flagId,
  isDirty,
  saving,
  saveAndThen,
  defaultContext,
}: Props) {
  const t = useTranslate();
  const contextId = useId();
  const [context, setContext] = useState(defaultContext);
  const [jsonError, setJsonError] = useState(false);
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [running, setRunning] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { mutate } = useCustomMutation();

  // Parse the JSON context into the endpoint's { targetingKey, attributes }
  // shape. `targetingKey` is a top-level reserved key; everything else is an
  // attribute. Returns null (and flags the error) when the input isn't an object.
  const parseContext = (): {
    targetingKey: string;
    attributes: Record<string, unknown>;
  } | null => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(context);
    } catch {
      return null;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    const { targetingKey, ...attributes } = parsed as Record<string, unknown>;
    return {
      targetingKey: targetingKey == null ? "" : String(targetingKey),
      attributes,
    };
  };

  const evaluate = () => {
    const ctx = parseContext();
    if (!ctx) {
      setJsonError(true);
      return;
    }
    setJsonError(false);
    setRunning(true);
    mutate(
      {
        url: `${API_URL}/flags/${flagId}/evaluate`,
        method: "post",
        values: { evaluationContext: ctx },
        successNotification: false,
        errorNotification: false,
      },
      {
        onSuccess: (data) => {
          setResult((data?.data as EvaluationResult) ?? null);
          setRunning(false);
        },
        onError: (err) => {
          toast.error(t("flag.detail.evaluate.error"), {
            description: errMessage(err),
          });
          setRunning(false);
        },
      },
    );
  };

  const onRun = () => {
    if (isDirty) {
      setConfirmOpen(true);
      return;
    }
    evaluate();
  };

  const busy = running || saving;

  return (
    <div className="flex flex-col gap-4 pt-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {t("flag.detail.evaluate.title")}
          </CardTitle>
          <CardDescription>
            {t("flag.detail.evaluate.subtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={contextId}>{t("flag.detail.evaluate.context")}</Label>
            <Textarea
              id={contextId}
              value={context}
              onChange={(e) => {
                setContext(e.target.value);
                if (jsonError) setJsonError(false);
              }}
              spellCheck={false}
              rows={8}
              aria-invalid={jsonError}
              className="bg-muted font-mono text-sm"
            />
            {jsonError ? (
              <span className="text-xs text-destructive">
                {t("flag.detail.evaluate.invalidJson")}
              </span>
            ) : (
              <span className="text-2xs text-muted-foreground">
                {t("flag.detail.evaluate.contextHint")}
              </span>
            )}
          </div>

          <div>
            <Button onClick={onRun} disabled={busy}>
              <PlayIcon className="h-4 w-4" />
              {running
                ? t("flag.detail.evaluate.running")
                : t("flag.detail.evaluate.run")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {t("flag.detail.evaluate.resultTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!result ? (
            <p className="text-sm text-muted-foreground">
              {t("flag.detail.evaluate.empty")}
            </p>
          ) : result.failed || result.errorCode ? (
            <Alert variant="destructive">
              <AlertTriangleIcon />
              <AlertTitle className="flex items-center gap-2">
                {t("flag.detail.evaluate.failed")}
                {result.errorCode && (
                  <Badge variant="destructive" className="font-mono">
                    {result.errorCode}
                  </Badge>
                )}
              </AlertTitle>
              <AlertDescription className="gap-2">
                {result.errorDetails && (
                  <p className="text-muted-foreground">{result.errorDetails}</p>
                )}
                <ResultMeta t={t} result={result} />
              </AlertDescription>
            </Alert>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("flag.detail.evaluate.value")}
                </span>
                <CodeBlock code={formatValue(result.value)} language="json" />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="font-mono">
                  {t("flag.detail.evaluate.variation")}: {result.variationType}
                </Badge>
                <Badge variant="outline" className="font-mono">
                  {t("flag.detail.evaluate.reason")}: {result.reason}
                </Badge>
              </div>
              <ResultMeta t={t} result={result} />
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => !open && setConfirmOpen(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("flag.detail.evaluate.unsavedTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("flag.detail.evaluate.unsavedDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmOpen(false);
                evaluate();
              }}
            >
              {t("flag.detail.evaluate.evaluateSaved")}
            </Button>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                saveAndThen(evaluate);
              }}
            >
              {t("flag.detail.evaluate.saveAndEvaluate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

EvaluatePanel.displayName = "EvaluatePanel";

function ResultMeta({
  t,
  result,
}: {
  t: ReturnType<typeof useTranslate>;
  result: EvaluationResult;
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {result.flagType && (
        <span>
          {t("flag.detail.evaluate.flagType")}:{" "}
          <span className="font-mono">{result.flagType}</span>
        </span>
      )}
      <span>
        {t("flag.detail.evaluate.trackEvents")}:{" "}
        <span className="font-mono">{String(result.trackEvents)}</span>
      </span>
      <span>
        {t("flag.detail.evaluate.cacheable")}:{" "}
        <span className="font-mono">{String(result.cacheable)}</span>
      </span>
      {result.version && (
        <span>
          {t("flag.detail.evaluate.version")}:{" "}
          <span className="font-mono">{result.version}</span>
        </span>
      )}
    </div>
  );
}
