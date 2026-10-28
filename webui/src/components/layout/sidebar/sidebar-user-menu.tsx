import { Link } from "react-router";
import {
  useGetIdentity,
  useLogout,
  useTranslate,
} from "@refinedev/core";
import {
  BookOpen,
  Building,
  Building2,
  ChevronsUpDownIcon,
  CircleUser,
  LifeBuoy,
  LogOutIcon,
  UserRound,
  UsersRound,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSidebar } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { useActiveTeam } from "@/hooks/use-active-team";
import { canEditTeam, canSync, effectiveTeamRole } from "@/providers/access-control";
import { getCachedCompany } from "@/providers/auth";
import { isMonoCompany } from "@/providers/ui-config";
import { cn } from "@/lib/utils";
import type { CompanyRole, Role, User } from "@/types/api";

const DOCS_URL = "https://gofeatureflag.org/docs";
const SUPPORT_URL = "https://github.com/thomaspoignant/go-feature-flag/issues";

function roleLabel(
  user: User,
  activeTeamId: string | null,
  t: (key: string, fallback?: string) => string,
): string {
  if (user.isSuperAdmin) return t("profile.superAdmin");
  const role: CompanyRole | Role | undefined =
    getCachedCompany()?.role ?? effectiveTeamRole(activeTeamId ?? undefined);
  return role ? role.charAt(0).toUpperCase() + role.slice(1) : "-";
}

function MenuAvatar({
  user,
  className,
}: {
  user: Pick<User, "name" | "avatar">;
  className?: string;
}) {
  return (
    <Avatar className={cn("h-8", "w-8", className)}>
      {user.avatar && <AvatarImage src={user.avatar} alt={user.name} />}
      <AvatarFallback>
        <UserRound className={cn("h-4", "w-4", "text-muted-foreground")} />
      </AvatarFallback>
    </Avatar>
  );
}

export function SidebarUserMenu() {
  const t = useTranslate();
  const { open } = useSidebar();
  const { data: user, isLoading } = useGetIdentity<User>();
  const { mutate: logout, isPending: isLoggingOut } = useLogout();
  const { activeTeamId } = useActiveTeam();

  if (isLoading || !user) {
    return (
      <div className={cn("px-1", "py-1")}>
        <Skeleton className={cn("h-10", "w-full", "rounded-md")} />
      </div>
    );
  }

  const canCompanySettings = canSync("list", {
    requiresCompanyAdmin: true,
  }).can;
  const canTeamSettings = !!activeTeamId && canEditTeam(activeTeamId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "w-full",
            "h-auto",
            "py-2",
            "gap-2",
            open ? "justify-between px-2" : "justify-center px-0",
          )}
        >
          <span className={cn("flex", "items-center", "gap-2", "min-w-0")}>
            <MenuAvatar user={user} />
            {open && (
              <span className={cn("flex", "flex-col", "min-w-0", "text-left")}>
                <span className={cn("text-sm", "font-medium", "truncate")}>
                  {user.name || user.email}
                </span>
                <span
                  className={cn(
                    "text-xs",
                    "text-muted-foreground",
                    "truncate",
                  )}
                >
                  {roleLabel(user, activeTeamId, t)}
                </span>
              </span>
            )}
          </span>
          {open && (
            <ChevronsUpDownIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        className={cn("w-[260px]")}
      >
        <DropdownMenuLabel
          className={cn("flex", "items-center", "gap-2", "py-2")}
        >
          <MenuAvatar user={user} className={cn("h-10", "w-10")} />
          <span className={cn("flex", "flex-col", "min-w-0")}>
            <span className={cn("text-sm", "font-semibold", "truncate")}>
              {user.name || user.email}
            </span>
            <span
              className={cn("text-xs", "text-muted-foreground", "truncate")}
            >
              {user.email}
            </span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className={cn("px-2", "py-1.5")}>
          <ThemeSwitcher />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/profile">
            <CircleUser className="h-4 w-4" />
            <span>{t("profile.settings")}</span>
          </Link>
        </DropdownMenuItem>
        {canCompanySettings && (
          <DropdownMenuItem asChild>
            <Link to="/company">
              <Building2 className="h-4 w-4" />
              <span>{t("profile.companySettings")}</span>
            </Link>
          </DropdownMenuItem>
        )}
        {canTeamSettings && (
          <DropdownMenuItem asChild>
            <Link to={`/company/teams/${activeTeamId}`}>
              <UsersRound className="h-4 w-4" />
              <span>{t("profile.teamSettings")}</span>
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <a href={DOCS_URL} target="_blank" rel="noreferrer">
            <BookOpen className="h-4 w-4" />
            <span>{t("profile.documentation")}</span>
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={SUPPORT_URL} target="_blank" rel="noreferrer">
            <LifeBuoy className="h-4 w-4" />
            <span>{t("profile.support")}</span>
          </a>
        </DropdownMenuItem>
        {user.isSuperAdmin && !isMonoCompany() && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel
              className={cn("text-xs", "font-normal", "text-muted-foreground")}
            >
              {t("profile.admin")}
            </DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link to="/companies">
                <Building className="h-4 w-4" />
                <span>{t("profile.manageCompanies")}</span>
              </Link>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => logout()}>
          <LogOutIcon className={cn("text-destructive")} />
          <span className={cn("text-destructive")}>
            {isLoggingOut ? t("header.loggingOut") : t("header.logout")}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

SidebarUserMenu.displayName = "SidebarUserMenu";
