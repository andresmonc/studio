import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getCachedMembership } from "@/providers/auth";
import type { TeamMembership } from "@/types/api";

const STORAGE_KEY = "activeTeamId";
const EVENT_NAME = "active-team-change";

type Ctx = {
  activeTeamId: string | null;
  setActiveTeamId: (id: string | null) => void;
  memberships: TeamMembership[];
};

const ActiveTeamContext = createContext<Ctx | null>(null);

function readStored(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function ActiveTeamProvider({ children }: PropsWithChildren) {
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

  const setActiveTeamId = useCallback((id: string | null) => {
    if (id === null) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, id);
    }
    window.dispatchEvent(new Event(EVENT_NAME));
  }, []);

  const memberships = getCachedMembership() ?? [];
  const activeTeamId = stored ?? memberships[0]?.teamId ?? null;

  return createElement(
    ActiveTeamContext.Provider,
    { value: { activeTeamId, setActiveTeamId, memberships } },
    children,
  );
}

export function useActiveTeam(): Ctx {
  const ctx = useContext(ActiveTeamContext);
  if (!ctx) {
    throw new Error("useActiveTeam must be used inside ActiveTeamProvider");
  }
  return ctx;
}
