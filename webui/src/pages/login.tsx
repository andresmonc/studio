import { useLogin, useTranslate } from "@refinedev/core";
import { GoffLogo } from "@/components/goff-logo";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function LoginPage() {
  const t = useTranslate();
  const { mutate: login, isPending } = useLogin();

  return (
    <div
      className={cn(
        "flex",
        "min-h-svh",
        "items-center",
        "justify-center",
        "px-6",
        "py-8"
      )}
    >
      <Card className={cn("sm:w-[420px]", "p-8")}>
        <CardHeader className="px-0">
          <GoffLogo className="mb-4 h-20 w-auto justify-self-center" />
          <CardTitle className="text-2xl font-semibold">
            {t("login.title")}
          </CardTitle>
          <CardDescription>{t("login.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={isPending}
            onClick={() => login({})}
          >
            {t("login.signIn")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

LoginPage.displayName = "LoginPage";
