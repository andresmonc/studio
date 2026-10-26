import { useGetIdentity, useLogout, useTranslate } from "@refinedev/core";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { refreshIdentity } from "@/providers/auth";
import { isMonoCompany } from "@/providers/ui-config";
import type { User } from "@/types/api";
import { cn } from "@/lib/utils";

export function OnboardingJoinPage() {
  const t = useTranslate();
  const navigate = useNavigate();
  const { data: identity } = useGetIdentity<User>();
  const { mutate: logout } = useLogout();
  // Mono company: there is no company to pick, the user waits for a team.
  const mono = isMonoCompany();

  const checkAgain = async () => {
    await refreshIdentity();
    navigate("/");
  };

  return (
    <div
      className={cn(
        "flex",
        "min-h-svh",
        "items-center",
        "justify-center",
        "px-6",
        "py-12"
      )}
    >
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>
            {t(mono ? "onboarding.join.monoTitle" : "onboarding.join.title")}
          </CardTitle>
          <CardDescription>
            {t(
              mono ? "onboarding.join.monoSubtitle" : "onboarding.join.subtitle",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {identity?.email && (
            <div className="rounded-md border bg-muted p-4 font-mono text-sm">
              {identity.email}
            </div>
          )}
          <div className="flex justify-between gap-2">
            {mono ? (
              <Button variant="ghost" onClick={() => void checkAgain()}>
                {t("onboarding.join.checkAgain")}
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => navigate("/onboarding")}>
                {t("common.back")}
              </Button>
            )}
            <Button variant="outline" onClick={() => logout({})}>
              {t("onboarding.join.signOut")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

OnboardingJoinPage.displayName = "OnboardingJoinPage";
