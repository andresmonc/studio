import { useMemo, useState } from "react";
import {
  useCustom,
  useCustomMutation,
  useTranslate,
} from "@refinedev/core";
import { useForm } from "@refinedev/react-hook-form";
import type { BaseRecord, HttpError as RefineHttpError } from "@refinedev/core";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Trash2Icon } from "lucide-react";
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
import { isMonoCompany } from "@/providers/ui-config";
import { errMessage } from "@/lib/errors";
import type { CompanyMember, CompanyRole } from "@/types/api";

type AddMemberValues = { email: string; role: CompanyRole };

const ROLES: CompanyRole[] = ["admin", "member"];

export function CompanyMembersCard({ companyId }: { companyId: string }) {
  const t = useTranslate();
  const addMemberSchema = useMemo(
    () =>
      z.object({
        email: z.string().email(t("company.members.validEmail")),
        role: z.enum(["admin", "member"]),
      }),
    [t],
  );
  const membersUrl = `${API_URL}/companies/${companyId}/members`;
  const queryKey = ["company-members", companyId];

  const { query } = useCustom<CompanyMember[]>({
    url: membersUrl,
    method: "get",
    queryOptions: { queryKey },
  });
  const rawMembers = query.data?.data;
  const members: CompanyMember[] = Array.isArray(rawMembers) ? rawMembers : [];

  const { mutate: customMutate } = useCustomMutation();

  const [pendingRemove, setPendingRemove] = useState<CompanyMember | null>(
    null
  );
  const [removing, setRemoving] = useState(false);

  const addForm = useForm<BaseRecord, RefineHttpError, AddMemberValues>({
    resolver: zodResolver(addMemberSchema),
    defaultValues: { email: "", role: "member" },
  });

  const refetchMembers = () => query.refetch();

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
          toast.success(t("company.members.added"));
          addForm.reset({ email: "", role: "member" });
          refetchMembers();
        },
        onError: (err) => {
          toast.error(t("company.members.addError"), {
            description: errMessage(err),
          });
        },
      }
    );
  });

  const onChangeRole = (m: CompanyMember, role: CompanyRole) => {
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
          toast.success(t("company.members.roleUpdated"));
          refetchMembers();
        },
        onError: (err) => {
          toast.error(t("company.members.roleError"), {
            description: errMessage(err),
          });
        },
      }
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
          toast.success(t("company.members.removed"));
          setPendingRemove(null);
          setRemoving(false);
          refetchMembers();
        },
        onError: (err) => {
          toast.error(t("company.members.removeError"), {
            description: errMessage(err),
          });
          setRemoving(false);
        },
      }
    );
  };


  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("nav.members")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <Form {...addForm}>
          <form
            onSubmit={onAdd}
            className="flex flex-col md:flex-row gap-3 md:items-end"
          >
            <FormField
              control={addForm.control}
              name="email"
              render={({ field }) => (
                <FormItem className="flex-1">
                  <FormLabel>{t("common.email")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("company.members.emailPlaceholder")}
                      {...field}
                    />
                  </FormControl>
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
                          {t(`company.roles.${r}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit">{t("company.members.add")}</Button>
          </form>
        </Form>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("common.email")}</TableHead>
              <TableHead>{t("common.name")}</TableHead>
              <TableHead className="w-40">{t("common.role")}</TableHead>
              <TableHead className="w-16 text-right">
                {t("company.members.removeHead")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.isLoading && (
              <TableRow>
                <TableCell colSpan={4}>{t("common.loading")}</TableCell>
              </TableRow>
            )}
            {!query.isLoading && members.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>{t("company.members.empty")}</TableCell>
              </TableRow>
            )}
            {members.map((m) => (
              <TableRow key={m.userId}>
                <TableCell className="font-mono text-sm">{m.email}</TableCell>
                <TableCell>{m.name}</TableCell>
                <TableCell>
                  <Select
                    value={m.role}
                    onValueChange={(v) => onChangeRole(m, v as CompanyRole)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {t(`company.roles.${r}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right">
                  {/* Mono company: the server refuses removals (access is
                      revoked at the identity provider instead). */}
                  {!isMonoCompany() && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("company.members.removeAria")}
                      onClick={() => setPendingRemove(m)}
                    >
                      <Trash2Icon className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
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
                {t("company.members.removeTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("company.members.removeDesc", {
                  email: pendingRemove?.email,
                })}
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
