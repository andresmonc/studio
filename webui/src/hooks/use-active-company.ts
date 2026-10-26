import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import { useGetIdentity } from "@refinedev/core";
import { useQueryClient } from "@tanstack/react-query";
import { getCachedCompany } from "@/providers/auth";
import type { User } from "@/types/api";

const STORAGE_KEY = "activeCompanyId";
const EVENT_NAME = "active-company-change";

type Ctx = {
  activeCompanyId: string | null;
  setActiveCompanyId: (id: string | null) => void;
  isSuperAdmin: boolean;
  source: "super-admin" | "membership" | "none";
};

const ActiveCompanyContext = createContext<Ctx | null>(null);

function readStored(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function ActiveCompanyProvider({ children }: PropsWithChildren) {
  const { data: identity } = useGetIdentity<User>();
  const isSuperAdmin = !!identity?.isSuperAdmin;
  const queryClient = useQueryClient();

  const [stored, setStored] = useState<string | null>(() => readStored());

  useEffect(() => {
    const handler = () => {
      setStored(readStored());
      queryClient.invalidateQueries({ queryKey: ["access"] });
    };
    window.addEventListener(EVENT_NAME, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVENT_NAME, handler);
      window.removeEventListener("storage", handler);
    };
  }, [queryClient]);

  const setActiveCompanyId = useCallback((id: string | null) => {
    if (id === null) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, id);
    }
    window.dispatchEvent(new Event(EVENT_NAME));
  }, []);

  const membershipCompanyId = getCachedCompany()?.companyId ?? null;
  // A super admin uses the stored pick, falling back to their own company.
  const activeCompanyId = isSuperAdmin
    ? (stored ?? membershipCompanyId)
    : membershipCompanyId;
  const source: Ctx["source"] =
    isSuperAdmin && stored
      ? "super-admin"
      : membershipCompanyId
        ? "membership"
        : "none";

  return createElement(
    ActiveCompanyContext.Provider,
    { value: { activeCompanyId, setActiveCompanyId, isSuperAdmin, source } },
    children
  );
}

export function useActiveCompany(): Ctx {
  const ctx = useContext(ActiveCompanyContext);
  if (!ctx) {
    throw new Error("useActiveCompany must be used inside ActiveCompanyProvider");
  }
  return ctx;
}
