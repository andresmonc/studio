import { useTranslate } from "@refinedev/core";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { apiFetch } from "@/providers/http";
import { refreshIdentity } from "@/providers/auth";
import type { Company } from "@/types/api";
import { cn } from "@/lib/utils";
import { CompanyForm, type CompanyFormValues } from "./company-form";

export function OnboardingCreateCompanyPage() {
  const t = useTranslate();
  const navigate = useNavigate();

  const onSubmit = async (values: CompanyFormValues) => {
    await apiFetch<Company>("/onboarding/company", {
      method: "POST",
      body: JSON.stringify(values),
    });
    await refreshIdentity();
    toast.success(t("onboarding.createCompany.success"));
    navigate("/", { replace: true });
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
          <CardTitle>{t("onboarding.createCompany.title")}</CardTitle>
          <CardDescription>
            {t("onboarding.createCompany.subtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CompanyForm
            submitLabel={t("onboarding.createCompany.submit")}
            submittingLabel={t("onboarding.createCompany.submitting")}
            onSubmit={onSubmit}
            onBack={() => navigate("/onboarding")}
          />
        </CardContent>
      </Card>
    </div>
  );
}

OnboardingCreateCompanyPage.displayName = "OnboardingCreateCompanyPage";
