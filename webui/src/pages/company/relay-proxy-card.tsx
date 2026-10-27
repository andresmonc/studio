import { useCustom, useTranslate } from "@refinedev/core";
import { InfoIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CodeBlock } from "@/components/ui/code-block";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/empty-state";
import { TipCallout } from "@/components/ui/tip-callout";
import { API_URL } from "@/providers/constants";

// The server renders the file; it holds every API key of the company, so the
// endpoint (like the company page) is company admin only.
export function CompanyRelayProxyCard({ companyId }: { companyId: string }) {
  const t = useTranslate();
  // No type argument: useCustom only accepts object payloads, this one is a string.
  const { query } = useCustom({
    url: `${API_URL}/companies/${companyId}/relay-proxy-config`,
    method: "get",
    queryOptions: { queryKey: ["relay-proxy-config", companyId] },
  });
  const data: unknown = query.data?.data;
  const config = typeof data === "string" ? data : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("company.relayProxy.title")}</CardTitle>
        <CardDescription className="mt-1.5">
          {t("company.relayProxy.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {query.isError ? (
          <Alert variant="destructive">
            <InfoIcon className="h-4 w-4" />
            <AlertDescription>{t("company.relayProxy.error")}</AlertDescription>
          </Alert>
        ) : query.isLoading ? (
          <EmptyState variant="inline">{t("common.loading")}</EmptyState>
        ) : (
          <div className="flex flex-col gap-3">
            <TipCallout title={t("company.relayProxy.tipTitle")}>
              {t("company.relayProxy.tip")}
            </TipCallout>
            <div className="overflow-hidden rounded-md border">
              <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-1.5">
                <span className="font-mono text-xs font-medium text-muted-foreground">
                  goff-proxy.yaml
                </span>
                <CopyButton value={config} label={t("common.copy")} />
              </div>
              <CodeBlock code={config} language="yaml" rounded={false} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

CompanyRelayProxyCard.displayName = "CompanyRelayProxyCard";
