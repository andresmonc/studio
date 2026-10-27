import { useEffect, useRef, useState } from "react";
import { useGetIdentity, useTranslate } from "@refinedev/core";
import { useNavigate } from "react-router";
import {
  CircleCheck,
  CircleX,
  Hourglass,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { apiFetch, HttpError } from "@/providers/http";
import { refreshIdentity } from "@/providers/auth";
import type { Company, Flagset, Team, User } from "@/types/api";
import { cn } from "@/lib/utils";
import { CompanyForm, type CompanyFormValues } from "./company-form";

type StepStatus = "pending" | "running" | "done" | "error";

const STEPS = ["company", "team", "flagset", "apiKey", "flag"] as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Ids created so far. Retry resumes from the failed step and reuses them.
type Created = { companyId?: string; teamId?: string; flagset?: Flagset };

const post = <T,>(path: string, body: unknown) =>
  apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) }).then(
    (r) => r.data as T,
  );

function StepIcon({ status }: { status: StepStatus }) {
  const cls = cn("size-5", "shrink-0");
  switch (status) {
    case "running":
      return <Loader2 className={cn(cls, "animate-spin", "text-primary")} />;
    case "done":
      return (
        <CircleCheck
          className={cn(
            cls,
            "text-success",
            "motion-safe:animate-in",
            "motion-safe:zoom-in",
            "motion-safe:duration-300",
          )}
        />
      );
    case "error":
      return <CircleX className={cn(cls, "text-destructive")} />;
    default:
      return <Hourglass className={cls} />;
  }
}

// OnboardingSetupPage is the mono company first-login flow for the super
// admin: name the company, then create company → team → flagset → API key →
// first flag in sequence. minStepMs paces each step so progress is readable.
export function OnboardingSetupPage({ minStepMs = 700 }: { minStepMs?: number }) {
  const t = useTranslate();
  const navigate = useNavigate();
  const { data: identity } = useGetIdentity<User>();
  const [values, setValues] = useState<CompanyFormValues | null>(null);
  const [statuses, setStatuses] = useState<StepStatus[]>(
    STEPS.map(() => "pending"),
  );
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const created = useRef<Created>({});

  const running = statuses.includes("running");
  const doneCount = statuses.filter((s) => s === "done").length;

  useEffect(() => {
    if (!running) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  const runStep = async (step: (typeof STEPS)[number], v: CompanyFormValues) => {
    const c = created.current;
    switch (step) {
      case "company":
        c.companyId = (await post<Company>("/onboarding/company", v)).id;
        return;
      case "team":
        c.teamId = (
          await post<Team>(`/companies/${c.companyId}/teams`, {
            // 115 + "-team" stays within the server's 120-character name limit.
            name: `${v.displayName.trim().slice(0, 115)}-team`,
            adminEmail: identity?.email,
          })
        ).id;
        return;
      case "flagset":
        c.flagset = await post<Flagset>(`/teams/${c.teamId}/flagsets`, {
          name: "default-flagset",
        });
        return;
      case "apiKey":
        // The server provisions a "default" key with every flagset.
        if (c.flagset?.apiKeyCount) return;
        await post(`/flagsets/${c.flagset?.id}/api-keys`, { label: "default" });
        return;
      case "flag":
        await post(`/flagsets/${c.flagset?.id}/flags`, {
          name: "my-first-feature-flag",
          payload: {
            variations: { enabled: true, disabled: false },
            defaultRule: { variation: "disabled" },
          },
        });
    }
  };

  const run = async (v: CompanyFormValues, from: number) => {
    setError(null);
    for (let i = from; i < STEPS.length; i++) {
      setStatuses((s) => s.map((x, j) => (j === i ? "running" : x)));
      try {
        await Promise.all([runStep(STEPS[i], v), sleep(minStepMs)]);
      } catch (err) {
        setStatuses((s) => s.map((x, j) => (j === i ? "error" : x)));
        setError(
          err instanceof HttpError ? err.message : t("onboarding.setup.error"),
        );
        return;
      }
      setStatuses((s) => s.map((x, j) => (j === i ? "done" : x)));
    }
    await refreshIdentity();
    window.localStorage.setItem("activeCompanyId", created.current.companyId!);
    window.localStorage.setItem("activeTeamId", created.current.teamId!);
    setFinished(true);
  };

  const start = async (v: CompanyFormValues) => {
    setValues(v);
    void run(v, 0);
  };

  return (
    <div
      className={cn(
        "flex",
        "min-h-svh",
        "items-center",
        "justify-center",
        "px-6",
        "py-12",
      )}
    >
      <Card className="w-full max-w-xl">
        {!values ? (
          <>
            <CardHeader>
              <CardTitle>{t("onboarding.setup.title")}</CardTitle>
              <CardDescription>{t("onboarding.setup.subtitle")}</CardDescription>
            </CardHeader>
            <CardContent>
              <CompanyForm
                submitLabel={t("onboarding.setup.submit")}
                submittingLabel={t("onboarding.createCompany.submitting")}
                onSubmit={start}
              />
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle>
                {t("onboarding.setup.creating", { name: values.displayName })}
              </CardTitle>
            </CardHeader>
            <CardContent className={cn("flex", "flex-col", "gap-4")}>
              <Progress value={(doneCount / STEPS.length) * 100} />
              <ol className={cn("flex", "flex-col", "gap-3")}>
                {STEPS.map((step, i) => (
                  <li
                    key={step}
                    data-status={statuses[i]}
                    style={{ animationDelay: `${i * 80}ms` }}
                    className={cn(
                      "flex",
                      "items-center",
                      "gap-3",
                      "transition-colors",
                      "motion-safe:animate-in",
                      "motion-safe:fade-in",
                      "motion-safe:slide-in-from-left-2",
                      "motion-safe:fill-mode-both",
                      statuses[i] === "pending" && "text-muted-foreground",
                      statuses[i] === "running" && "font-semibold",
                    )}
                  >
                    <StepIcon status={statuses[i]} />
                    <span>{t(`onboarding.setup.steps.${step}`)}</span>
                  </li>
                ))}
              </ol>
              {running && (
                <Alert>
                  <TriangleAlert />
                  <AlertDescription>
                    {t("onboarding.setup.doNotClose")}
                  </AlertDescription>
                </Alert>
              )}
              {error && (
                <Alert variant="destructive">
                  <CircleX />
                  <AlertDescription
                    className={cn("flex", "items-center", "justify-between", "gap-2")}
                  >
                    <span>{error}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void run(values, statuses.indexOf("error"))}
                    >
                      {t("onboarding.setup.retry")}
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
              {finished && (
                <Button
                  className={cn(
                    "self-end",
                    "motion-safe:animate-in",
                    "motion-safe:fade-in",
                    "motion-safe:duration-500",
                  )}
                  onClick={() => navigate("/flags")}
                >
                  {t("onboarding.setup.goToFlags")}
                </Button>
              )}
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}

OnboardingSetupPage.displayName = "OnboardingSetupPage";
