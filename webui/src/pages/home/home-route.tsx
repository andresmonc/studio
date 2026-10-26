import { useGetIdentity } from "@refinedev/core";
import { NavigateToResource } from "@refinedev/react-router";
import type { User } from "@/types/api";

export function HomeRoute() {
  const { data: identity, isLoading } = useGetIdentity<User>();

  if (isLoading || !identity) return null;

  if (identity.isSuperAdmin) {
    return <NavigateToResource resource="teams" />;
  }

  return <NavigateToResource resource="flags" />;
}

HomeRoute.displayName = "HomeRoute";
