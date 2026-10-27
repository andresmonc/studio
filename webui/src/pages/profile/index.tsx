import { useGetIdentity, useTranslate } from "@refinedev/core";
import { UserRound } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { User } from "@/types/api";
import { PageHeader } from "@/components/ui/page-header";

function formatDate(value?: string): string {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString();
}

export function ProfilePage() {
  const t = useTranslate();
  const { data: user, isLoading } = useGetIdentity<User>();

  return (
    <div className={cn("flex", "flex-col", "gap-6")}>
      <PageHeader title={t("profile.pageTitle")} />
      <Card className={cn("max-w-xl")}>
        <CardHeader>
          <CardTitle>{t("profile.settings")}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading || !user ? (
            <p className="text-muted-foreground">{t("common.loading")}</p>
          ) : (
            <div className={cn("flex", "flex-col", "gap-4")}>
              <div className={cn("flex", "items-center", "gap-3")}>
                <Avatar className={cn("h-14", "w-14")}>
                  {user.avatar && (
                    <AvatarImage src={user.avatar} alt={user.name} />
                  )}
                  <AvatarFallback>
                    <UserRound className="h-6 w-6 text-muted-foreground" />
                  </AvatarFallback>
                </Avatar>
                <div className={cn("flex", "flex-col", "min-w-0")}>
                  <span className={cn("text-lg", "font-medium", "truncate")}>
                    {user.name || user.email}
                  </span>
                  {user.isSuperAdmin && (
                    <Badge variant="secondary" className="w-fit">
                      {t("profile.superAdmin")}
                    </Badge>
                  )}
                </div>
              </div>
              <dl className={cn("grid", "grid-cols-3", "gap-2", "text-sm")}>
                <dt className="text-muted-foreground">{t("common.name")}</dt>
                <dd className="col-span-2">{user.name || "-"}</dd>
                <dt className="text-muted-foreground">{t("common.email")}</dt>
                <dd className="col-span-2">{user.email}</dd>
                <dt className="text-muted-foreground">{t("common.created")}</dt>
                <dd className="col-span-2">{formatDate(user.createdAt)}</dd>
                <dt className="text-muted-foreground">
                  {t("profile.lastLogin")}
                </dt>
                <dd className="col-span-2">{formatDate(user.lastLoginAt)}</dd>
              </dl>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

ProfilePage.displayName = "ProfilePage";
