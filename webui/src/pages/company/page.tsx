import { useCustom, useTranslate } from "@refinedev/core";
import { Navigate, useNavigate } from "react-router";
import { useActiveCompany } from "@/hooks/use-active-company";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { API_URL } from "@/providers/constants";
import type { CompanyMember, Team } from "@/types/api";
import { CompanyDetailsCard } from "./details";
import { CompanyMembersCard } from "./members";
import { CompanyTeamsCard } from "./teams";

type Section = "details" | "members" | "teams";

const TAB_PATH: Record<Section, string> = {
  details: "/company",
  members: "/company/members",
  teams: "/company/teams",
};

export function CompanyPage({ section = "details" }: { section?: Section }) {
  const t = useTranslate();
  const navigate = useNavigate();
  const { activeCompanyId } = useActiveCompany();

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

  const stats: { label: string; value: number; target: Section }[] = [
    { label: t("company.stats.users"), value: userCount, target: "members" },
    { label: t("company.stats.teams"), value: teamCount, target: "teams" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("nav.company")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("company.subtitle", { users: userCount, teams: teamCount })}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:max-w-lg">
        {stats.map((s) => (
          <Card
            key={s.label}
            role="button"
            tabIndex={0}
            onClick={() => navigate(TAB_PATH[s.target])}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                navigate(TAB_PATH[s.target]);
              }
            }}
            className="cursor-pointer transition-colors hover:bg-accent/50 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2"
          >
            <CardContent className="flex flex-col gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {s.label}
              </span>
              <span className="text-3xl font-bold">{s.value}</span>
            </CardContent>
          </Card>
        ))}
      </div>
      <Tabs
        value={section}
        onValueChange={(v) => navigate(TAB_PATH[v as Section])}
      >
        <TabsList>
          <TabsTrigger value="details">{t("nav.details")}</TabsTrigger>
          <TabsTrigger value="members">{t("nav.members")}</TabsTrigger>
          <TabsTrigger value="teams">{t("nav.teams")}</TabsTrigger>
        </TabsList>
        <TabsContent value="details">
          <CompanyDetailsCard companyId={activeCompanyId} />
        </TabsContent>
        <TabsContent value="members">
          <CompanyMembersCard companyId={activeCompanyId} />
        </TabsContent>
        <TabsContent value="teams">
          <CompanyTeamsCard companyId={activeCompanyId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

CompanyPage.displayName = "CompanyPage";
