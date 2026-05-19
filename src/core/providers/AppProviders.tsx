import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { StaffRightsProvider } from "@/contexts/StaffRightsContext";
import { AppDataProvider } from "@/contexts/AppDataContext";
import { QueryProvider } from "./QueryProvider";

// Single composition root. Pages should never know which providers exist
// or in what order — they just render under <AppProviders>.
//
// Ordering rationale:
//   QueryProvider     → server state cache (must wrap anything that fetches)
//   Auth              → user identity (required by StaffRights + AppData)
//   StaffRights       → permissions (required by AppData mutations)
//   AppData           → legacy mega-context (kept during migration; will shrink)
//   TooltipProvider   → UI primitive
//   Toasters          → outside layout tree so they survive route changes
export const AppProviders = ({ children }: { children: ReactNode }) => (
  <QueryProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <StaffRightsProvider>
          <AppDataProvider>{children}</AppDataProvider>
        </StaffRightsProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryProvider>
);
