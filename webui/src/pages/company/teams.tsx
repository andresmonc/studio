import { useMemo, useRef, useState } from "react";
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
import { useNavigate } from "react-router";
import { ChevronDownIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MemberCombobox } from "@/components/company/member-combobox";
import { API_URL } from "@/providers/constants";
import { errMessage } from "@/lib/errors";
import type { CompanyMember, Team } from "@/types/api";

type TeamValues = {
  name: string;
  description?: string | null;
  adminEmail: string;
};

export function CompanyTeamsCard({ companyId }: { companyId: string }) {
  const t = useTranslate();
  const navigate = useNavigate();
  const teamsUrl = `${API_URL}/companies/${companyId}/teams`;
  const queryKey = ["company-teams", companyId];

  const { query } = useCustom<Team[]>({
    url: teamsUrl,
    method: "get",
    queryOptions: { queryKey },
  });
  const raw = query.data?.data;
  const teams: Team[] = Array.isArray(raw) ? raw : [];

  const { query: membersQuery } = useCustom<CompanyMember[]>({
    url: `${API_URL}/companies/${companyId}/members`,
    method: "get",
    queryOptions: { queryKey: ["company-members", companyId] },
  });
  const companyMembers: CompanyMember[] = Array.isArray(membersQuery.data?.data)
    ? membersQuery.data!.data
    : [];

  const { mutate: customMutate } = useCustomMutation();

  const teamSchema = useMemo(
    () =>
      z.object({
        name: z.string().min(1, t("company.teams.nameRequired")).max(120),
        description: z
          .string()
          .nullish()
          .transform((v) => v ?? "")
          .refine((v) => v.length <= 500, { message: t("common.maxChars") }),
        adminEmail: z
          .string()
          .min(1, t("company.teams.adminRequired"))
          .email(t("company.teams.adminRequired")),
      }),
    [t],
  );

  const form = useForm<BaseRecord, RefineHttpError, TeamValues>({
    resolver: zodResolver(teamSchema),
    defaultValues: { name: "", description: "", adminEmail: "" },
  });

  const [pendingDelete, setPendingDelete] = useState<Team | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const createRef = useRef<HTMLDivElement | null>(null);

  const openCreate = () => {
    setCreateOpen(true);
    requestAnimationFrame(() => {
      createRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const refetch = () => query.refetch();

  const teamUrl = (id: string) => `${API_URL}/teams/${id}`;

  const onConfirmDelete = () => {
    if (!pendingDelete) return;
    setDeleting(true);
    customMutate(
      {
        url: teamUrl(pendingDelete.id),
        method: "delete",
        values: {},
        successNotification: false,
        errorNotification: false,
      },
      {
        onSuccess: () => {
          toast.success(t("company.teams.deleted"));
          setPendingDelete(null);
          setDeleting(false);
          refetch();
        },
        onError: (err) => {
          toast.error(t("company.teams.deleteError"), {
            description: errMessage(err),
          });
          setDeleting(false);
        },
      }
    );
  };

  const onCreate = form.handleSubmit((values) => {
    customMutate(
      {
        url: teamsUrl,
        method: "post",
        values: {
          name: values.name,
          description: values.description ?? "",
          adminEmail: values.adminEmail,
        },
        successNotification: false,
        errorNotification: false,
      },
      {
        onSuccess: () => {
          toast.success(t("company.teams.created"));
          form.reset({ name: "", description: "", adminEmail: "" });
          refetch();
        },
        onError: (err) => {
          toast.error(t("company.teams.createError"), {
            description: errMessage(err),
          });
        },
      }
    );
  });

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("company.teams.cardTitle")}</CardTitle>
          <CardAction>
            <Button size="sm" onClick={openCreate}>
              <PlusIcon className="h-4 w-4" />
              {t("company.teams.newTeam")}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.name")}</TableHead>
                <TableHead>{t("common.description")}</TableHead>
                <TableHead>{t("common.created")}</TableHead>
                <TableHead className="w-28 text-right">
                  {t("common.actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isLoading && (
                <TableRow>
                  <TableCell colSpan={4}>{t("common.loading")}</TableCell>
                </TableRow>
              )}
              {!query.isLoading && teams.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>{t("company.teams.empty")}</TableCell>
                </TableRow>
              )}
              {teams.map((team) => (
                <TableRow key={team.id}>
                  <TableCell className="font-medium">{team.name}</TableCell>
                  <TableCell>{team.description}</TableCell>
                  <TableCell>
                    {team.createdAt
                      ? new Date(team.createdAt).toLocaleString()
                      : ""}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("company.teams.editAria")}
                        onClick={() => navigate(`/company/teams/${team.id}`)}
                      >
                        <PencilIcon className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("company.teams.deleteAria")}
                        onClick={() => setPendingDelete(team)}
                      >
                        <Trash2Icon className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div ref={createRef}>
        <Collapsible
          open={createOpen}
          onOpenChange={setCreateOpen}
          className="group"
        >
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="flex flex-row items-center justify-between cursor-pointer select-none">
                <CardTitle>{t("company.teams.createTitle")}</CardTitle>
                <ChevronDownIcon className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <Form {...form}>
                  <form
                    onSubmit={onCreate}
                    className="flex flex-col gap-3 max-w-xl"
                  >
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("common.name")}</FormLabel>
                          <FormControl>
                            <Input {...field} />
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
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="adminEmail"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>{t("company.teams.adminLabel")}</FormLabel>
                          <MemberCombobox
                            members={companyMembers}
                            value={field.value}
                            onChange={field.onChange}
                            placeholder={t("company.teams.selectAdmin")}
                            searchPlaceholder={t("company.teams.searchUsers")}
                            emptyText={t("company.teams.noUsers")}
                          />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div>
                      <Button type="submit">{t("common.create")}</Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </div>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("company.teams.deleteTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("company.teams.deleteDesc", { name: pendingDelete?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmDelete} disabled={deleting}>
              {deleting ? t("common.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
