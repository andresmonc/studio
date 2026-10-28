import { useCustom, useTranslate } from "@refinedev/core";
import { useNavigate } from "react-router";
import { CheckIcon, ChevronsUpDownIcon, UsersRoundIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useActiveTeam } from "@/hooks/use-active-team";
import { useActiveCompany } from "@/hooks/use-active-company";
import { getCachedCompany, getCachedUser } from "@/providers/auth";
import { API_URL } from "@/providers/constants";
import type { Team } from "@/types/api";

type TeamOption = { teamId: string; teamName: string };

export function TeamSwitcher() {
  const t = useTranslate();
  const navigate = useNavigate();
  const { activeTeamId, setActiveTeamId, memberships } = useActiveTeam();
  const { activeCompanyId } = useActiveCompany();

  const isAdmin =
    !!getCachedUser()?.isSuperAdmin || getCachedCompany()?.role === "admin";
  const useCompanyTeams = isAdmin && !!activeCompanyId;

  const { query } = useCustom<Team[]>({
    url: `${API_URL}/companies/${activeCompanyId}/teams`,
    method: "get",
    queryOptions: {
      queryKey: ["company-teams", activeCompanyId],
      enabled: useCompanyTeams,
    },
  });
  const companyTeams: Team[] = Array.isArray(query.data?.data)
    ? query.data!.data
    : [];

  const options: TeamOption[] = useCompanyTeams
    ? companyTeams.map((t) => ({ teamId: t.id, teamName: t.name }))
    : memberships.map((m) => ({ teamId: m.teamId, teamName: m.teamName }));

  if (options.length <= 1) return null;

  const current = options.find((o) => o.teamId === activeTeamId);
  const label = current?.teamName ?? t("team.switcher.select");

  const onSelect = (teamId: string) => {
    setActiveTeamId(teamId);
    navigate("/");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("w-full", "gap-2", "justify-between")}
        >
          <span className={cn("flex", "items-center", "gap-2", "truncate")}>
            <UsersRoundIcon className="h-4 w-4 text-muted-foreground" />
            <span className="truncate">{label}</span>
          </span>
          <ChevronsUpDownIcon className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[240px]">
        <DropdownMenuLabel>{t("team.switcher.switch")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((o) => {
          const selected = o.teamId === activeTeamId;
          return (
            <DropdownMenuItem
              key={o.teamId}
              onClick={() => onSelect(o.teamId)}
              className="flex items-center justify-between gap-2"
            >
              <span className="truncate">{o.teamName}</span>
              {selected && <CheckIcon className="h-4 w-4" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

TeamSwitcher.displayName = "TeamSwitcher";
