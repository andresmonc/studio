// TeamDetailsCard: edit a team's name and description. Extracted from
// team-detail.tsx.

import { useMemo } from "react";
import { useCustom, useCustomMutation, useTranslate } from "@refinedev/core";
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
import type { Team } from "@/types/api";

type TeamValues = { name: string; description?: string | null };

export function TeamDetailsCard({
  teamId,
  editable,
}: {
  teamId: string;
  editable: boolean;
}) {
  const t = useTranslate();
  const teamUrl = `${API_URL}/teams/${teamId}`;

  const { query } = useCustom<Team>({
    url: teamUrl,
    method: "get",
    queryOptions: { queryKey: ["team", teamId] },
  });
  const team = query.data?.data;

  const { mutate: customMutate } = useCustomMutation();

  const teamSchema = useMemo(
    () =>
      z.object({
        name: z.string().min(1, t("team.detail.nameRequired")).max(120),
        description: z
          .string()
          .nullish()
          .transform((v) => v ?? "")
          .refine((v) => v.length <= 500, { message: t("common.maxChars") }),
      }),
    [t],
  );

  const form = useForm<BaseRecord, RefineHttpError, TeamValues>({
    resolver: zodResolver(teamSchema),
    defaultValues: { name: "", description: "" },
    values: team
      ? { name: team.name, description: team.description ?? "" }
      : undefined,
  });

  const onSubmit = form.handleSubmit((values) => {
    customMutate(
      {
        url: teamUrl,
        method: "patch",
        values: {
          name: values.name,
          description: values.description ?? "",
        },
        successNotification: false,
        errorNotification: false,
      },
      {
        onSuccess: () => {
          toast.success(t("team.detail.updated"));
          query.refetch();
        },
        onError: (err) => {
          toast.error(t("team.detail.updateError"), {
            description: errMessage(err),
          });
        },
      },
    );
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("team.detail.detailsTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <p className="text-muted-foreground">{t("common.loading")}</p>
        ) : (
          <Form {...form}>
            <form onSubmit={onSubmit} className="flex flex-col gap-3 max-w-xl">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("common.name")}</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={!editable} />
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
                        rows={3}
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                        disabled={!editable}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {editable && (
                <div>
                  <Button type="submit">{t("common.save")}</Button>
                </div>
              )}
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  );
}
