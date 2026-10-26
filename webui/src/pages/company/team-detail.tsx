import { useCustom, useTranslate } from "@refinedev/core";
import { ArrowLeftIcon, Home } from "lucide-react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
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
import { Button } from "@/components/ui/button";
import { TeamDetailsCard } from "./team-details-card";
import { TeamMembersCard } from "./team-members-card";
import { API_URL } from "@/providers/constants";
import { useActiveCompany } from "@/hooks/use-active-company";
import { canEditTeam, canSync } from "@/providers/access-control";
import type { Team } from "@/types/api";

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
                {showCompanyCrumbs && (
                  <>
                    <BreadcrumbItem>
                      <BreadcrumbLink asChild>
                        <Link to="/company">{t("nav.company")}</Link>
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbLink asChild>
                        <Link to="/company/teams">{t("nav.teams")}</Link>
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                  </>
                )}
                <BreadcrumbItem>
                  <BreadcrumbPage>{teamName}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <Separator className="absolute left-0 right-0 z-[1]" />
        </div>
        <div className="flex items-center gap-1 -ml-2.5">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("common.back")}
            onClick={() => navigate(showCompanyCrumbs ? "/company/teams" : "/")}
          >
            <ArrowLeftIcon className="h-4 w-4" />
          </Button>
          <h2 className="text-2xl font-bold">{teamName}</h2>
        </div>
      </div>
      <TeamDetailsCard teamId={teamId} editable={editable} />
      <TeamMembersCard teamId={teamId} editable={editable} />
    </ListView>
  );
}

TeamDetailPage.displayName = "TeamDetailPage";
