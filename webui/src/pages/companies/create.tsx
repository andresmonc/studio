import { useMemo } from "react";
import { useForm } from "@refinedev/react-hook-form";
import {
  useTranslate,
  type BaseRecord,
  type HttpError as RefineHttpError,
} from "@refinedev/core";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  CreateView,
  CreateViewHeader,
} from "@/components/views/create-view";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { HttpError } from "@/providers/http";

export type CompanyCreateValues = {
  displayName: string;
  description: string;
  adminEmail: string;
};

export function CompanyCreatePage() {
  const t = useTranslate();
  const schema = useMemo(
    () =>
      z.object({
        displayName: z
          .string()
          .min(1, t("companies.create.displayNameRequired"))
          .max(120),
        description: z.string().max(500),
        adminEmail: z.string().email(t("companies.create.adminEmailRequired")),
      }),
    [t],
  );

  const form = useForm<BaseRecord, RefineHttpError, CompanyCreateValues>({
    resolver: zodResolver(schema),
    defaultValues: { displayName: "", description: "", adminEmail: "" },
    refineCoreProps: {
      resource: "companies",
      action: "create",
      redirect: "edit",
      successNotification: () => ({
        message: t("companies.create.success"),
        type: "success",
      }),
      errorNotification: (error) => ({
        message:
          (error as HttpError | undefined)?.message ??
          t("companies.create.error"),
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
      await onFinish(values);
    } catch (err) {
      if (err instanceof HttpError && err.errors) {
        for (const [field, messages] of Object.entries(err.errors)) {
          setError(field as keyof CompanyCreateValues, {
            type: "server",
            message: messages.join(", "),
          });
        }
      }
    }
  });

  return (
    <CreateView>
      <CreateViewHeader title={t("companies.create.title")} />
      <Form {...form}>
        <form onSubmit={onSubmit} className="flex flex-col gap-4 max-w-xl">
          <FormField
            control={control}
            name="displayName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("common.displayName")}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t("companies.create.displayNamePlaceholder")}
                    {...field}
                  />
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
                    placeholder={t("companies.create.descPlaceholder")}
                    rows={4}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="adminEmail"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("companies.create.adminEmail")}</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder={t("companies.create.adminEmailPlaceholder")}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {t("companies.create.adminEmailHint")}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <div>
            <Button type="submit" disabled={formLoading}>
              {formLoading
                ? t("companies.create.submitting")
                : t("companies.create.submit")}
            </Button>
          </div>
        </form>
      </Form>
    </CreateView>
  );
}

CompanyCreatePage.displayName = "CompanyCreatePage";
