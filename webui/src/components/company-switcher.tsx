import { useEffect } from "react";
import { useGetIdentity, useList, useTranslate } from "@refinedev/core";
import { BuildingIcon, CheckIcon, ChevronsUpDownIcon } from "lucide-react";
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
import { useActiveCompany } from "@/hooks/use-active-company";
import { isMonoCompany } from "@/providers/ui-config";
import type { Company, User } from "@/types/api";

export function CompanySwitcher() {
  // Mono company: nothing to switch, and no companies list to fetch.
  if (isMonoCompany()) return null;
  return <CompanySwitcherMenu />;
}

function CompanySwitcherMenu() {
  const t = useTranslate();
  const { data: identity } = useGetIdentity<User>();
  const { activeCompanyId, setActiveCompanyId, isSuperAdmin } =
    useActiveCompany();

  const { result, query } = useList<Company>({
    resource: "companies",
    pagination: { mode: "off" },
    queryOptions: { enabled: !!identity?.isSuperAdmin },
  });

  const companies = result?.data ?? [];
  const current = companies.find((c) => c.id === activeCompanyId);

  useEffect(() => {
    if (
      isSuperAdmin &&
      !query.isLoading &&
      activeCompanyId &&
      !current
    ) {
      setActiveCompanyId(null);
    }
  }, [isSuperAdmin, query.isLoading, activeCompanyId, current, setActiveCompanyId]);

  if (!isSuperAdmin) return null;

  const label = current?.displayName ?? t("company.switcher.select");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("gap-2", "min-w-[180px]", "justify-between")}
        >
          <span className={cn("flex", "items-center", "gap-2", "truncate")}>
            <BuildingIcon className="h-4 w-4 text-muted-foreground" />
            <span className="truncate">{label}</span>
          </span>
          <ChevronsUpDownIcon className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[260px]">
        <DropdownMenuLabel>{t("company.switcher.switch")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {query.isLoading && (
          <DropdownMenuItem disabled>{t("common.loading")}</DropdownMenuItem>
        )}
        {!query.isLoading && companies.length === 0 && (
          <DropdownMenuItem disabled>
            {t("company.switcher.none")}
          </DropdownMenuItem>
        )}
        {companies.map((c) => {
          const selected = c.id === activeCompanyId;
          return (
            <DropdownMenuItem
              key={c.id}
              onClick={() => setActiveCompanyId(c.id)}
              className="flex items-center justify-between gap-2"
            >
              <span className="truncate">{c.displayName}</span>
              {selected && <CheckIcon className="h-4 w-4" />}
            </DropdownMenuItem>
          );
        })}
        {activeCompanyId && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setActiveCompanyId(null)}>
              {t("company.switcher.clear")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

CompanySwitcher.displayName = "CompanySwitcher";
