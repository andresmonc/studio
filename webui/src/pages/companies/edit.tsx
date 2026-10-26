import { useEffect } from "react";
import { Navigate, useParams } from "react-router";
import { useActiveCompany } from "@/hooks/use-active-company";

export function CompanyEditPage() {
  const params = useParams<{ id: string }>();
  const { setActiveCompanyId } = useActiveCompany();

  useEffect(() => {
    if (params.id) {
      setActiveCompanyId(params.id);
    }
  }, [params.id, setActiveCompanyId]);

  if (!params.id) return <Navigate to="/companies" replace />;
  return <Navigate to="/company" replace />;
}

CompanyEditPage.displayName = "CompanyEditPage";
