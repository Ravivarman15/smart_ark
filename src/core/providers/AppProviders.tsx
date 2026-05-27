import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { StaffRightsProvider } from "@/contexts/StaffRightsContext";
import { AppDataProvider } from "@/contexts/AppDataContext";
import { RbacRealtimeProvider } from "@/features/rbac/providers/RbacRealtimeProvider";
import { HelpRealtimeProvider } from "@/features/help/providers/HelpRealtimeProvider";
import { AttendanceRealtimeProvider } from "@/features/students/providers/AttendanceRealtimeProvider";
import { FeesRealtimeProvider } from "@/features/fee/providers/FeesRealtimeProvider";
import { FinanceRealtimeProvider } from "@/features/finance/providers/FinanceRealtimeProvider";
import { EnquiriesRealtimeProvider } from "@/features/enquiries/providers/EnquiriesRealtimeProvider";
import { ThemeProvider } from "@/core/theme";
import { QueryProvider } from "./QueryProvider";

// Single composition root. Pages should never know which providers exist
// or in what order — they just render under <AppProviders>.
//
// Ordering rationale:
//   QueryProvider       → server state cache (must wrap anything that fetches)
//   Auth                → user identity (required by StaffRights + AppData)
//   StaffRights         → legacy permissions (required by AppData mutations)
//   RbacRealtime        → single supabase channel that invalidates RBAC queries
//                         + nudges StaffRightsContext on DB changes. Must wrap
//                         consumers of the React Query cache, hence inside
//                         QueryProvider but outside AppData.
//   AppData             → legacy mega-context (kept during migration; will shrink)
//   TooltipProvider     → UI primitive
//   Toasters            → outside layout tree so they survive route changes
export const AppProviders = ({ children }: { children: ReactNode }) => (
  <ThemeProvider>
    <QueryProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthProvider>
          <StaffRightsProvider>
            <RbacRealtimeProvider>
              <HelpRealtimeProvider>
                <AttendanceRealtimeProvider>
                  <FeesRealtimeProvider>
                    <FinanceRealtimeProvider>
                      <EnquiriesRealtimeProvider>
                        <AppDataProvider>{children}</AppDataProvider>
                      </EnquiriesRealtimeProvider>
                    </FinanceRealtimeProvider>
                  </FeesRealtimeProvider>
                </AttendanceRealtimeProvider>
              </HelpRealtimeProvider>
            </RbacRealtimeProvider>
          </StaffRightsProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryProvider>
  </ThemeProvider>
);
