import { useCustom, useTranslate } from "@refinedev/core";
import { ArrowLeftIcon } from "lucide-react";
import { Navigate, useNavigate, useParams } from "react-router";
import { ListView } from "@/components/refine-ui/views/list-view";
import { Button } from "@/components/ui/button";
import { TeamDetailsCard } from "./team-details-card";
import { TeamMembersCard } from "./team-members-card";
import { API_URL } from "@/providers/constants";
import { useActiveCompany } from "@/hooks/use-active-company";
import { canEditTeam, canSync } from "@/providers/access-control";
import type { Team } from "@/types/api";
import { PageBreadcrumb } from "@/components/ui/page-header";

export function TeamDetailPage() {
  const t = useTranslate();
  const { activeCompanyId } = useActiveCompany();
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();

  const { query } = useCustom<Team>({
    url: `${API_URL}/teams/${teamId}`,
    method: "get",
    queryOptions: { queryKey: ["team", teamId], enabled: !!teamId },
  });
  const teamName = query.data?.data?.name ?? t("team.detail.title");

  if (!activeCompanyId || !teamId) {
    return <Navigate to="/company/teams" replace />;
  }

  const editable = canEditTeam(teamId);
  const showCompanyCrumbs = canSync("list", { requiresCompanyAdmin: true }).can;

  return (
    <ListView>
      <div className="flex flex-col gap-4">
        <PageBreadcrumb
          items={[
            ...(showCompanyCrumbs
              ? [
                  { label: t("nav.company"), to: "/company" },
                  { label: t("nav.teams"), to: "/company/teams" },
                ]
              : []),
            { label: teamName },
          ]}
        />
        <div className="flex items-center gap-1 -ml-2.5">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("common.back")}
            onClick={() => navigate(showCompanyCrumbs ? "/company/teams" : "/")}
          >
            <ArrowLeftIcon className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">{teamName}</h1>
        </div>
      </div>
      <TeamDetailsCard teamId={teamId} editable={editable} />
      <TeamMembersCard teamId={teamId} editable={editable} />
    </ListView>
  );
}

TeamDetailPage.displayName = "TeamDetailPage";
