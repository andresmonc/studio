import { useTranslate } from "@refinedev/core";
import { useNavigate } from "react-router";
import { PlusCircleIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function OnboardingChoicePage() {
  const t = useTranslate();
  const navigate = useNavigate();

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
      <div className="flex flex-col gap-8 max-w-4xl w-full">
        <div className="text-center">
          <h1 className="text-3xl font-semibold">
            {t("onboarding.choice.title")}
          </h1>
          <p className="text-muted-foreground mt-2">
            {t("onboarding.choice.subtitle")}
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="flex flex-col">
            <CardHeader>
              <PlusCircleIcon className="size-8 mb-2" />
              <CardTitle>{t("onboarding.choice.createTitle")}</CardTitle>
              <CardDescription>
                {t("onboarding.choice.createDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="mt-auto">
              <Button
                className="w-full"
                onClick={() => navigate("/onboarding/create-company")}
              >
                {t("onboarding.choice.createBtn")}
              </Button>
            </CardContent>
          </Card>
          <Card className="flex flex-col">
            <CardHeader>
              <UsersIcon className="size-8 mb-2" />
              <CardTitle>{t("onboarding.choice.joinTitle")}</CardTitle>
              <CardDescription>
                {t("onboarding.choice.joinDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="mt-auto">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate("/onboarding/join")}
              >
                {t("onboarding.choice.joinBtn")}
              </Button>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}

OnboardingChoicePage.displayName = "OnboardingChoicePage";
