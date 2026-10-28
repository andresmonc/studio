// TeamMembersCard: list team members, add members, change roles, and remove
// members (behind a confirmation dialog). Extracted from team-detail.tsx.

import { useMemo, useState } from "react";
import { useCustom, useCustomMutation, useTranslate } from "@refinedev/core";
import { useForm } from "@refinedev/react-hook-form";
import type { BaseRecord, HttpError as RefineHttpError } from "@refinedev/core";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Trash2Icon } from "lucide-react";
import { MemberCombobox } from "@/components/company/member-combobox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { API_URL } from "@/providers/constants";
import { errMessage } from "@/lib/errors";
import type { CompanyMember, Role, TeamMember } from "@/types/api";

type AddMemberValues = { email: string; role: Role };

const ROLES: Role[] = ["admin", "editor", "viewer"];

export function TeamMembersCard({
  teamId,
  editable,
}: {
  teamId: string;
  editable: boolean;
}) {
  const t = useTranslate();
  const membersUrl = `${API_URL}/teams/${teamId}/members`;

  const { query } = useCustom<TeamMember[]>({
    url: membersUrl,
    method: "get",
    queryOptions: { queryKey: ["team-members", teamId] },
  });
  const raw = query.data?.data;
  const members: TeamMember[] = Array.isArray(raw) ? raw : [];

  const { query: companyQuery } = useCustom<CompanyMember[]>({
    url: `${API_URL}/teams/${teamId}/addable-members`,
    method: "get",
    queryOptions: {
      queryKey: ["team-addable-members", teamId],
      enabled: editable,
    },
  });
  const companyMembers: CompanyMember[] = Array.isArray(companyQuery.data?.data)
    ? companyQuery.data!.data
    : [];
  const teamUserIds = new Set(members.map((m) => m.userId));
  const addableUsers = companyMembers.filter((u) => !teamUserIds.has(u.userId));

  const { mutate: customMutate } = useCustomMutation();

  const [pendingRemove, setPendingRemove] = useState<TeamMember | null>(null);
  const [removing, setRemoving] = useState(false);

  const addMemberSchema = useMemo(
    () =>
      z.object({
        email: z.string().email(t("team.detail.validEmail")),
        role: z.enum(["admin", "editor", "viewer"]),
      }),
    [t],
  );

  const addForm = useForm<BaseRecord, RefineHttpError, AddMemberValues>({
    resolver: zodResolver(addMemberSchema),
    defaultValues: { email: "", role: "viewer" },
  });

  const refetch = () => query.refetch();

  const onAdd = addForm.handleSubmit((values) => {
    customMutate(
      {
        url: membersUrl,
        method: "post",
        values,
        successNotification: false,
        errorNotification: false,
      },
      {
        onSuccess: () => {
          toast.success(t("team.detail.added"));
          addForm.reset({ email: "", role: "viewer" });
          refetch();
        },
        onError: (err) => {
          toast.error(t("team.detail.addError"), {
            description: errMessage(err),
          });
        },
      },
    );
  });

  const onChangeRole = (m: TeamMember, role: Role) => {
    if (role === m.role) return;
    customMutate(
      {
        url: `${membersUrl}/${m.userId}`,
        method: "patch",
        values: { role },
        successNotification: false,
        errorNotification: false,
      },
      {
        onSuccess: () => {
          toast.success(t("team.detail.roleUpdated"));
          refetch();
        },
        onError: (err) => {
          toast.error(t("team.detail.roleError"), {
            description: errMessage(err),
          });
        },
      },
    );
  };

  const onConfirmRemove = () => {
    if (!pendingRemove) return;
    setRemoving(true);
    customMutate(
      {
        url: `${membersUrl}/${pendingRemove.userId}`,
        method: "delete",
        values: {},
        successNotification: false,
        errorNotification: false,
      },
      {
        onSuccess: () => {
          toast.success(t("team.detail.removed"));
          setPendingRemove(null);
          setRemoving(false);
          refetch();
        },
        onError: (err) => {
          toast.error(t("team.detail.removeError"), {
            description: errMessage(err),
          });
          setRemoving(false);
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("team.detail.membersTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {editable && (
        <Form {...addForm}>
          <form
            onSubmit={onAdd}
            className="flex flex-col md:flex-row gap-3 md:items-end"
          >
            <FormField
              control={addForm.control}
              name="email"
              render={({ field }) => (
                <FormItem className="flex flex-1 flex-col">
                  <FormLabel>{t("team.detail.userLabel")}</FormLabel>
                  <MemberCombobox
                    members={addableUsers}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder={t("team.detail.selectUser")}
                    searchPlaceholder={t("team.detail.searchUsers")}
                    emptyText={t("team.detail.noUsers")}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={addForm.control}
              name="role"
              render={({ field }) => (
                <FormItem className="md:w-40">
                  <FormLabel>{t("common.role")}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit">{t("team.detail.addMember")}</Button>
          </form>
        </Form>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("common.email")}</TableHead>
              <TableHead>{t("common.name")}</TableHead>
              <TableHead className="w-40">{t("common.role")}</TableHead>
              {editable && (
                <TableHead className="w-16 text-right">
                  {t("company.members.removeHead")}
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.isLoading && (
              <TableRow>
                <TableCell colSpan={editable ? 4 : 3}>
                  {t("common.loading")}
                </TableCell>
              </TableRow>
            )}
            {!query.isLoading && members.length === 0 && (
              <TableRow>
                <TableCell colSpan={editable ? 4 : 3}>
                  {t("team.detail.noMembers")}
                </TableCell>
              </TableRow>
            )}
            {members.map((m) => (
              <TableRow key={m.userId}>
                <TableCell className="font-mono text-sm">{m.email}</TableCell>
                <TableCell>{m.name}</TableCell>
                <TableCell>
                  {editable ? (
                    <Select
                      value={m.role}
                      onValueChange={(v) => onChangeRole(m, v as Role)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="capitalize">{m.role}</span>
                  )}
                </TableCell>
                {editable && (
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("team.detail.removeAria")}
                      onClick={() => setPendingRemove(m)}
                    >
                      <Trash2Icon className="h-4 w-4" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <AlertDialog
          open={pendingRemove !== null}
          onOpenChange={(open) => !open && setPendingRemove(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("team.detail.removeTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("team.detail.removeDesc", { email: pendingRemove?.email })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={removing}>
                {t("common.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction onClick={onConfirmRemove} disabled={removing}>
                {removing ? t("common.removing") : t("common.remove")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
