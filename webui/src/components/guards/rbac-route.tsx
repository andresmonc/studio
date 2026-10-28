import { CanAccess, useTranslate } from "@refinedev/core";
import { Navigate, useParams } from "react-router";
import { toast } from "sonner";
import type { PropsWithChildren } from "react";

type Props = PropsWithChildren<{
  resource: string;
  action: string;
  redirectTo?: string;
}>;

export function RbacRoute({
  resource,
  action,
  redirectTo = "/",
  children,
}: Props) {
  const t = useTranslate();
  const routeParams = useParams();
  const id = routeParams.teamId ?? routeParams.id;

  return (
    <CanAccess
      resource={resource}
      action={action}
      params={id ? { id } : undefined}
      fallback={<Navigate to={redirectTo} replace />}
      onUnauthorized={({ reason }) =>
        toast.error(t("rbac.forbidden", "Forbidden"), {
          description: reason
            ? t(reason, "Access denied.")
            : t("rbac.accessDenied", "Access denied."),
        })
      }
    >
      {children}
    </CanAccess>
  );
}
