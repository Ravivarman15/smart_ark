import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
// Imported from the service file directly (not the feature barrel) to avoid a
// circular import — staff components depend on this AuthContext.
import { onboardingService } from "@/features/staff/services/onboarding.service";

export type UserRole = "teacher" | "admin" | "management" | "coordinator";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  campus?: string;
  profileId?: string;
  campusId?: string;
}

// Minimal session bookkeeping. The reactive role/name/campus live in the
// React Query cache (`current-profile` key) so the realtime layer can refresh
// them without an explicit setUser call.
interface AuthSession {
  authUserId: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Public so the realtime layer can invalidate the same key.
export const CURRENT_PROFILE_QUERY_KEY = ["current-profile"] as const;

interface DbProfile {
  id: string;
  name: string;
  role: string;
  campus_id: string | null;
  campuses: { name: string | null } | { name: string | null }[] | null;
}

async function loadProfileByAuthId(authUserId: string): Promise<DbProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, role, campus_id, campuses(name)")
    .eq("user_id", authUserId)
    .single();
  if (error || !data) return null;
  return data as unknown as DbProfile;
}

const pickCampusName = (c: DbProfile["campuses"]): string | undefined => {
  const row = Array.isArray(c) ? c[0] : c;
  return row?.name ?? undefined;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const qc = useQueryClient();

  // Live profile. The realtime layer invalidates CURRENT_PROFILE_QUERY_KEY
  // whenever the user's `profiles` row changes — so role/name/campus updates
  // propagate without logout.
  const profileQuery = useQuery({
    queryKey: session ? [...CURRENT_PROFILE_QUERY_KEY, session.authUserId] : CURRENT_PROFILE_QUERY_KEY,
    queryFn: () => loadProfileByAuthId(session!.authUserId),
    enabled: !!session,
    staleTime: 60_000,
  });

  // Sign out on missing profile — a session without a profile causes a silent
  // redirect loop. Behave the same way the old fetchProfile did.
  useEffect(() => {
    if (!session) return;
    if (profileQuery.isLoading) return;
    if (!profileQuery.data && profileQuery.isFetched) {
      console.error("[AuthContext] No profile found for user", session.authUserId);
      void supabase.auth.signOut();
      setSession(null);
    }
  }, [session, profileQuery.data, profileQuery.isLoading, profileQuery.isFetched]);

  const user = useMemo<User | null>(() => {
    if (!session || !profileQuery.data) return null;
    const p = profileQuery.data;
    return {
      id: session.authUserId,
      name: p.name,
      email: session.email,
      role: p.role as UserRole,
      profileId: p.id,
      campusId: p.campus_id || undefined,
      campus: pickCampusName(p.campuses),
    };
  }, [session, profileQuery.data]);

  // Listen to auth state changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (s?.user) setSession({ authUserId: s.user.id, email: s.user.email || "" });
      setBootstrapping(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      if (s?.user) {
        // setTimeout avoids Supabase deadlock on auth state change.
        setTimeout(() => setSession({ authUserId: s.user.id, email: s.user.email || "" }), 0);
      } else {
        setSession(null);
        // Drop any cached profile so a re-login doesn't briefly show the old user.
        qc.removeQueries({ queryKey: CURRENT_PROFILE_QUERY_KEY });
      }
    });

    return () => subscription.unsubscribe();
  }, [qc]);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) return false;
    setSession({ authUserId: data.user.id, email });
    void onboardingService.recordLogin(data.user.id);
    return true;
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    qc.removeQueries({ queryKey: CURRENT_PROFILE_QUERY_KEY });
  }, [qc]);

  const loading = bootstrapping || (!!session && profileQuery.isLoading);

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
