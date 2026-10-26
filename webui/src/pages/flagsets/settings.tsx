import { Fragment, useState } from "react";
import type { ReactNode } from "react";
import { useCustom, useTranslate } from "@refinedev/core";
import { Link, Navigate, useParams } from "react-router";
import {
  ArrowUpRightIcon,
  Code2Icon,
  FlagIcon,
  FlaskConicalIcon,
  Home,
  KeyRoundIcon,
  ListIcon,
  SettingsIcon,
  ZapIcon,
} from "lucide-react";
import { ListView } from "@/components/refine-ui/views/list-view";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CodeSampleTab } from "./code-sample-tab";
import { GeneralTab } from "./settings-general-tab";
import { ApiKeysTab } from "./settings-api-keys-tab";
import { ContextTab } from "./settings-context-tab";
import { SettingsTab } from "./settings-testing-context-tab";
import { DangerTab } from "./settings-danger-tab";
import { canEditTeam, effectiveTeamRole } from "@/providers/access-control";
import { API_URL } from "@/providers/constants";
import { cn } from "@/lib/utils";
import type { Flagset } from "@/types/api";

type TabKey =
  | "general"
  | "keys"
  | "codeSample"
  | "context"
  | "settings";

export function FlagsetSettingsPage() {
  const t = useTranslate();
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<TabKey>("keys");

  const { query } = useCustom<Flagset>({
    url: `${API_URL}/flagsets/${id}`,
    method: "get",
    queryOptions: { queryKey: ["flagset", id], enabled: !!id },
  });
  const flagset = query.data?.data;

  if (!id) return <Navigate to="/flagsets" replace />;

  const teamId = flagset?.teamId;
  // All flagset edits (general, context enrichment, API keys, delete) are
  // admin-only.
  const canManage = !!teamId && canEditTeam(teamId); // admin / super-admin
  // Listing API keys needs editor+; viewers don't get the Keys tab.
  const canReadKeys =
    !!teamId && (canEditTeam(teamId) || effectiveTeamRole(teamId) === "editor");
  const shownTab = tab === "keys" && !canReadKeys ? "general" : tab;

  const allTabs: { key: TabKey; label: string; icon: ReactNode }[] =
    [
      { key: "general", label: t("flagset.settings.general"), icon: <SettingsIcon className="h-4 w-4" /> },
      { key: "keys", label: t("flagset.settings.apiKeys"), icon: <KeyRoundIcon className="h-4 w-4" /> },
      { key: "codeSample", label: t("flagset.settings.codeSample"), icon: <Code2Icon className="h-4 w-4" /> },
      { key: "context", label: t("flagset.settings.context"), icon: <ZapIcon className="h-4 w-4" /> },
      { key: "settings", label: t("flagset.settings.settings"), icon: <FlaskConicalIcon className="h-4 w-4" /> },
    ];
  const tabs = allTabs.filter((tb) => tb.key !== "keys" || canReadKeys);

  return (
    <ListView>
      <div className="flex flex-col gap-4">
        <div className="flex items-center relative gap-2">
          <div className="bg-background z-[2] pr-4">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to="/">
                      <Home className="h-4 w-4" />
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to="/flagsets">{t("flagset.cardTitle")}</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>
                    {flagset?.name ?? t("flagset.settings.title")}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <Separator className="absolute left-0 right-0 z-[1]" />
        </div>

        <div className="flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
            <FlagIcon className="h-4 w-4" />
          </span>
          <h1 className="font-mono text-2xl font-bold tracking-tight">
            {flagset?.name ?? "…"}
          </h1>
          <Badge variant="secondary">{t("flagset.settings.active")}</Badge>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-[184px_1fr]">
          <nav className="flex flex-col gap-1 md:sticky md:top-4 md:self-start">
            {tabs.map((tb) => (
              <Fragment key={tb.key}>
                <button
                  onClick={() => setTab(tb.key)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
                    shownTab === tb.key
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/60",
                  )}
                >
                  {tb.icon}
                  {tb.label}
                </button>
                {tb.key === "general" && (
                  <Link
                    to={`/flags?flagset=${id}`}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted/60"
                  >
                    <ListIcon className="h-4 w-4" />
                    {t("flagset.settings.viewFlags")}
                    <ArrowUpRightIcon className="ml-auto h-3.5 w-3.5" />
                  </Link>
                )}
              </Fragment>
            ))}
          </nav>

          <div className="min-w-0">
            {!flagset ? (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  {t("common.loading")}
                </CardContent>
              </Card>
            ) : shownTab === "general" ? (
              <GeneralTab flagset={flagset} canWrite={canManage} onSaved={() => query.refetch()} />
            ) : shownTab === "keys" ? (
              <ApiKeysTab flagsetId={id} canManage={canManage} />
            ) : shownTab === "codeSample" ? (
              <CodeSampleTab flagsetId={id} canReadKeys={canReadKeys} />
            ) : shownTab === "context" ? (
              <ContextTab flagset={flagset} canWrite={canManage} onSaved={() => query.refetch()} />
            ) : (
              <div className="flex flex-col gap-4">
                <SettingsTab flagset={flagset} canWrite={canManage} onSaved={() => query.refetch()} />
                {/* Danger zone (delete flagset) is admin-only. */}
                {canManage && <DangerTab flagset={flagset} />}
              </div>
            )}
          </div>
        </div>
      </div>
    </ListView>
  );
}

FlagsetSettingsPage.displayName = "FlagsetSettingsPage";
