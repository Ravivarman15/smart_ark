import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
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

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch profile from Supabase.
  // If the auth user has no matching profile row, sign them out immediately —
  // leaving them in a half-authenticated state (auth session valid, user=null)
  // would cause a silent redirect loop back to /login with no error message.
  const fetchProfile = useCallback(async (userId: string, email: string) => {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, name, role, campus_id, campuses(name)")
      .eq("user_id", userId)
      .single();

    if (error || !profile) {
      console.error("[AuthContext] No profile found for user", userId, error?.message);
      // Sign out so they see /login with a clean state instead of an infinite loop.
      await supabase.auth.signOut();
      setUser(null);
      return;
    }

    setUser({
      id: userId,
      name: profile.name,
      email,
      role: profile.role as UserRole,
      profileId: profile.id,
      campusId: profile.campus_id || undefined,
      campus: (profile.campuses as any)?.name || undefined,
    });
  }, []);

  // Listen to auth state changes
  useEffect(() => {
    // Check existing session first — only set loading=false after profile is resolved
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        await fetchProfile(session.user.id, session.user.email || "");
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        // Use setTimeout to avoid Supabase deadlock on auth state change
        setTimeout(() => fetchProfile(session.user.id, session.user.email || ""), 0);
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) return false;
    await fetchProfile(data.user.id, email);
    // Best-effort onboarding: stamp last_login_at and, on the very first
    // password sign-in, flip onboarding to "completed". Never blocks login.
    void onboardingService.recordLogin(data.user.id);
    return true;
  }, [fetchProfile]);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

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
