import { useMemo } from "react";
import { useForm } from "@refinedev/react-hook-form";
import {
  useTranslate,
  type BaseRecord,
  type HttpError as RefineHttpError,
} from "@refinedev/core";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { refreshIdentity } from "@/providers/auth";

type CompanyEditValues = {
  displayName: string;
  description?: string | null;
};

export function CompanyDetailsCard({ companyId }: { companyId: string }) {
  const t = useTranslate();
  const schema = useMemo(
    () =>
      z.object({
        displayName: z
          .string()
          .min(1, t("companies.edit.displayNameRequired"))
          .max(120),
        description: z
          .string()
          .nullish()
          .transform((v) => v ?? "")
          .refine((v) => v.length <= 500, {
            message: t("common.maxChars"),
          }),
      }),
    [t],
  );
  const form = useForm<BaseRecord, RefineHttpError, CompanyEditValues>({
    resolver: zodResolver(schema),
    defaultValues: { displayName: "", description: "" },
    refineCoreProps: {
      resource: "companies",
      action: "edit",
      id: companyId,
      redirect: false,
      successNotification: () => ({
        message: t("companies.edit.success"),
        type: "success",
      }),
      errorNotification: (error) => ({
        message:
          (error as HttpError | undefined)?.message ??
          t("companies.edit.error"),
        type: "error",
      }),
    },
  });

  const {
    refineCore: { onFinish, formLoading },
    handleSubmit,
    setError,
    control,
  } = form;

  const onSubmit = handleSubmit(async (values) => {
    try {
      await onFinish({
        displayName: values.displayName,
        description: values.description ?? "",
      });
      await refreshIdentity();
    } catch (err) {
      if (err instanceof HttpError && err.errors) {
        for (const [field, messages] of Object.entries(err.errors)) {
          setError(field as keyof CompanyEditValues, {
            type: "server",
            message: messages.join(", "),
          });
        }
      }
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("common.details")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={onSubmit} className="flex flex-col gap-4 max-w-xl">
            <FormField
              control={control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("common.displayName")}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("common.description")}</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={4}
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div>
              <Button type="submit" disabled={formLoading}>
                {formLoading ? t("common.saving") : t("common.save")}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
