import { useMemo, useState } from "react";
import { useTranslate } from "@refinedev/core";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { HttpError } from "@/providers/http";
import { cn } from "@/lib/utils";

export type CompanyFormValues = { displayName: string; description: string };

type Props = {
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (values: CompanyFormValues) => Promise<void>;
  // Renders a Back button on the left of the submit button when set.
  onBack?: () => void;
};

// CompanyForm is the company name + description form shared by the onboarding
// pages. Server-side field errors thrown by onSubmit land on their fields.
export function CompanyForm({
  submitLabel,
  submittingLabel,
  onSubmit,
  onBack,
}: Props) {
  const t = useTranslate();
  const [submitting, setSubmitting] = useState(false);
  const schema = useMemo(
    () =>
      z.object({
        displayName: z
          .string()
          .min(1, t("onboarding.createCompany.nameRequired"))
          .max(120),
        description: z.string().max(500),
      }),
    [t],
  );
  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { displayName: "", description: "" },
  });

  const submit = form.handleSubmit(async (values) => {
    setSubmitting(true);
    try {
      await onSubmit(values);
    } catch (err) {
      if (err instanceof HttpError && err.errors) {
        for (const [field, messages] of Object.entries(err.errors)) {
          form.setError(field as keyof CompanyFormValues, {
            type: "server",
            message: messages.join(", "),
          });
        }
      }
      toast.error(
        err instanceof HttpError
          ? err.message
          : t("onboarding.createCompany.error"),
      );
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="displayName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("onboarding.createCompany.nameLabel")}</FormLabel>
              <FormControl>
                <Input
                  placeholder={t("onboarding.createCompany.namePlaceholder")}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("onboarding.createCompany.descLabel")}</FormLabel>
              <FormControl>
                <Textarea
                  placeholder={t("onboarding.createCompany.descPlaceholder")}
                  rows={4}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div
          className={cn("flex", "gap-2", onBack ? "justify-between" : "justify-end")}
        >
          {onBack && (
            <Button
              type="button"
              variant="ghost"
              onClick={onBack}
              disabled={submitting}
            >
              {t("common.back")}
            </Button>
          )}
          <Button type="submit" disabled={submitting}>
            {submitting ? submittingLabel : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}

CompanyForm.displayName = "CompanyForm";
