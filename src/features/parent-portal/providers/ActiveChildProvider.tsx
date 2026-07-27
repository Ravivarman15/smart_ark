// ── Parent Portal — active child selection ───────────────────────────────────
//
// A parent with several children navigates one child at a time. Holding the
// selection in context (rather than in each page's state or in the URL) means
// switching child on the Fees page keeps you on the Fees page — which is what
// a parent expects, and what PowerSchool / Teachmint do.
//
// The choice persists to localStorage so a reload does not silently switch
// which child's fees you are looking at.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useParentChildren } from "../hooks/useParentChildren";
import type { ParentChild } from "../types/parentPortal.types";

const STORAGE_KEY = "ark.parent.activeChild";

interface ActiveChildContextValue {
  children: ParentChild[];
  activeChild: ParentChild | null;
  setActiveChildId: (studentId: string) => void;
  isLoading: boolean;
  error: Error | null;
}

const ActiveChildContext = createContext<ActiveChildContextValue | undefined>(undefined);

export const ActiveChildProvider = ({ children: node }: { children: ReactNode }) => {
  const { parent } = useAuth();
  const { data: kids = [], isLoading, error } = useParentChildren(parent?.accountId);
  const [activeId, setActiveId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  // Reconcile the remembered id against what the parent may actually see. A
  // stale id (child unlinked, or a different parent on a shared device) must
  // fall back to the first child rather than render an empty portal.
  const activeChild = useMemo(() => {
    if (kids.length === 0) return null;
    return kids.find((k) => k.student.id === activeId) ?? kids[0];
  }, [kids, activeId]);

  useEffect(() => {
    if (!activeChild) return;
    if (activeChild.student.id === activeId) return;
    setActiveId(activeChild.student.id);
  }, [activeChild, activeId]);

  useEffect(() => {
    if (!activeId) return;
    try {
      localStorage.setItem(STORAGE_KEY, activeId);
    } catch {
      /* private mode / quota — selection simply won't persist */
    }
  }, [activeId]);

  const value = useMemo<ActiveChildContextValue>(
    () => ({
      children: kids,
      activeChild,
      setActiveChildId: setActiveId,
      isLoading,
      error: (error as Error) ?? null,
    }),
    [kids, activeChild, isLoading, error],
  );

  return <ActiveChildContext.Provider value={value}>{node}</ActiveChildContext.Provider>;
};

export const useActiveChild = () => {
  const ctx = useContext(ActiveChildContext);
  if (!ctx) throw new Error("useActiveChild must be used within ActiveChildProvider");
  return ctx;
};
