// GeneralTab: edit a flagset's name and description. Extracted from settings.tsx.

import { useMemo } from "react";
import { useCustomMutation, useTranslate } from "@refinedev/core";
import { useForm } from "@refinedev/react-hook-form";
import type { BaseRecord, HttpError as RefineHttpError } from "@refinedev/core";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
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
import { API_URL } from "@/providers/constants";
import { errMessage } from "@/lib/errors";
import type { Flagset } from "@/types/api";

type GeneralValues = { name: string; description?: string | null };

export function GeneralTab({
  flagset,
  canWrite,
  onSaved,
}: {
  flagset: Flagset;
  canWrite: boolean;
  onSaved: () => void;
}) {
  const t = useTranslate();
  const { mutate } = useCustomMutation();
  const schema = useMemo(
    () =>
      z.object({
        name: z.string().min(1, t("flagset.nameRequired")).max(120),
        description: z
          .string()
          .nullish()
          .transform((v) => v ?? "")
          .refine((v) => v.length <= 500, { message: t("common.maxChars") }),
      }),
    [t],
  );
  const form = useForm<BaseRecord, RefineHttpError, GeneralValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: flagset.name, description: flagset.description ?? "" },
    values: { name: flagset.name, description: flagset.description ?? "" },
  });

  const onSubmit = form.handleSubmit((values) => {
    mutate(
      {
        url: `${API_URL}/flagsets/${flagset.id}`,
        method: "patch",
        values: { name: values.name, description: values.description ?? "" },
        successNotification: false,
        errorNotification: false,
      },
      {
        onSuccess: () => {
          toast.success(t("flagset.settings.saved"));
          onSaved();
        },
        onError: (err) =>
          toast.error(t("flagset.updateError"), { description: errMessage(err) }),
      },
    );
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("flagset.settings.general")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-3">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("common.name")}</FormLabel>
                  <FormControl>
                    <Input {...field} className="font-mono" disabled={!canWrite} />
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
                  <FormLabel>{t("common.description")}</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={2}
                      disabled={!canWrite}
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
            {canWrite && (
              <div className="flex gap-2">
                <Button type="submit">{t("common.save")}</Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    form.reset({
                      name: flagset.name,
                      description: flagset.description ?? "",
                    })
                  }
                >
                  {t("common.cancel")}
                </Button>
              </div>
            )}
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
