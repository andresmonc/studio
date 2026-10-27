import type { ReactNode } from "react";
import { useCustom, useOne, useTranslate } from "@refinedev/core";
import { Navigate, useNavigate } from "react-router";
import { Building2Icon, ServerIcon, SettingsIcon, UsersIcon, UsersRoundIcon } from "lucide-react";
import { ListView } from "@/components/refine-ui/views/list-view";
import { Button } from "@/components/ui/button";
import { PageBreadcrumb } from "@/components/ui/page-header";
import { useActiveCompany } from "@/hooks/use-active-company";
import { cn } from "@/lib/utils";
import { API_URL } from "@/providers/constants";
import type { Company, CompanyMember, Team } from "@/types/api";
import { CompanyDetailsCard } from "./details";
import { CompanyMembersCard } from "./members";
import { CompanyRelayProxyCard } from "./relay-proxy-card";
import { CompanyTeamsCard } from "./teams";

type Section = "details" | "members" | "teams" | "relayProxy";

const TAB_PATH: Record<Section, string> = {
  details: "/company",
  members: "/company/members",
  teams: "/company/teams",
  relayProxy: "/company/relay-proxy",
};

// Same layout as the flagset settings page: breadcrumb, title, side nav, and
// the section card. Sections are routes so they can be linked to.
export function CompanyPage({ section = "details" }: { section?: Section }) {
  const t = useTranslate();
  const navigate = useNavigate();
  const { activeCompanyId } = useActiveCompany();

  const { result: company } = useOne<Company>({
    resource: "companies",
    id: activeCompanyId ?? "",
    queryOptions: { enabled: !!activeCompanyId },
  });
  const { query: membersQuery } = useCustom<CompanyMember[]>({
    url: `${API_URL}/companies/${activeCompanyId}/members`,
    method: "get",
    queryOptions: {
      queryKey: ["company-members", activeCompanyId],
      enabled: !!activeCompanyId,
    },
  });
  const { query: teamsQuery } = useCustom<Team[]>({
    url: `${API_URL}/companies/${activeCompanyId}/teams`,
    method: "get",
    queryOptions: {
      queryKey: ["company-teams", activeCompanyId],
      enabled: !!activeCompanyId,
    },
  });
  const userCount = Array.isArray(membersQuery.data?.data)
    ? membersQuery.data!.data.length
    : 0;
  const teamCount = Array.isArray(teamsQuery.data?.data)
    ? teamsQuery.data!.data.length
    : 0;

  if (!activeCompanyId) {
    return <Navigate to="/" replace />;
  }

  const name = company?.displayName ?? "…";
  const tabs: { key: Section; label: string; icon: ReactNode; count?: number }[] = [
    { key: "details", label: t("nav.details"), icon: <SettingsIcon className="h-4 w-4" /> },
    { key: "members", label: t("nav.members"), icon: <UsersIcon className="h-4 w-4" />, count: userCount },
    { key: "teams", label: t("nav.teams"), icon: <UsersRoundIcon className="h-4 w-4" />, count: teamCount },
    { key: "relayProxy", label: t("nav.relayProxy"), icon: <ServerIcon className="h-4 w-4" /> },
  ];

  return (
    <ListView>
      <div className="flex flex-col gap-4">
        <PageBreadcrumb items={[{ label: t("nav.company"), to: "/company" }, { label: name }]} />

        <div className="flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
            <Building2Icon className="h-4 w-4" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-[184px_1fr]">
          <nav className="flex flex-col gap-1 md:sticky md:top-4 md:self-start">
            {tabs.map((tb) => (
              <Button
                key={tb.key}
                variant="ghost"
                aria-current={section === tb.key ? "page" : undefined}
                onClick={() => navigate(TAB_PATH[tb.key])}
                className={cn(
                  "justify-start font-normal text-muted-foreground",
                  section === tb.key && "bg-muted font-medium text-foreground",
                )}
              >
                {tb.icon}
                {tb.label}
                {tb.count !== undefined && (
                  <span className="ml-auto text-xs tabular-nums text-muted-foreground">{tb.count}</span>
                )}
              </Button>
            ))}
          </nav>

          <div className="min-w-0">
            {section === "members" ? (
              <CompanyMembersCard companyId={activeCompanyId} />
            ) : section === "teams" ? (
              <CompanyTeamsCard companyId={activeCompanyId} />
            ) : section === "relayProxy" ? (
              <CompanyRelayProxyCard companyId={activeCompanyId} />
            ) : (
              <CompanyDetailsCard companyId={activeCompanyId} />
            )}
          </div>
        </div>
      </div>
    </ListView>
  );
}

CompanyPage.displayName = "CompanyPage";
