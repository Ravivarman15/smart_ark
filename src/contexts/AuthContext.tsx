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

/**
 * A parent principal — a `parent_auth_accounts` row backed by a real
 * auth.users session, NOT a `profiles` row.
 *
 * Kept deliberately separate from `User`: every staff surface in the app reads
 * `user` and branches on `user.role`, so widening that union would have forced
 * a "parent" case into ~200 call sites. A parent instead leaves `user === null`
 * and surfaces here, which means the staff portals are structurally incapable
 * of rendering for a parent.
 */
export interface ParentIdentity {
  /** parent_auth_accounts.id */
  accountId: string;
  /** auth.users.id */
  userId: string;
  name: string;
  email: string;
  mobile?: string;
}

/** Which portal the current session belongs to. */
export type PortalKind = "staff" | "parent";

// Minimal session bookkeeping. The reactive role/name/campus live in the
// React Query cache (`current-profile` key) so the realtime layer can refresh
// them without an explicit setUser call.
interface AuthSession {
  authUserId: string;
  email: string;
}

interface AuthContextType {
  /** The STAFF principal. `null` for a parent session — see ParentIdentity. */
  user: User | null;
  /** The PARENT principal. `null` for a staff session. */
  parent: ParentIdentity | null;
  /** Which portal this session belongs to; `null` while signed out. */
  portal: PortalKind | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  /** True for a STAFF session only — preserves every existing call site. */
  isAuthenticated: boolean;
  /** True for a PARENT session only. */
  isParentAuthenticated: boolean;
  /**
   * A Supabase session exists, regardless of whether it resolved to a staff
   * profile or a parent account.
   *
   * `isAuthenticated` means "holds a profiles row", which is right for every
   * ERP call site but leaves one person invisible: someone who signed up and
   * confirmed their email but has not yet named their organization. Phase 0's
   * handle_new_user() deliberately creates NO profile for a signup carrying no
   * staff role, so they are signed in at Supabase and "not authenticated" here
   * — and "/" silently showed them the marketing page instead of the step they
   * were mid-way through.
   */
  hasSession: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Public so the realtime layer can invalidate the same key.
export const CURRENT_PROFILE_QUERY_KEY = ["current-profile"] as const;
export const CURRENT_PARENT_QUERY_KEY = ["current-parent"] as const;

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

interface DbParentAccount {
  id: string;
  name: string | null;
  email: string | null;
  login_email: string | null;
  mobile: string | null;
  status: string | null;
}

/**
 * Resolve the parent account behind an auth session.
 *
 * Only an `active` account resolves — a disabled or locked parent is treated
 * exactly like an unknown user and gets signed out, matching the RLS helper
 * `current_parent_account_id()` which also filters on status. The two must
 * agree, otherwise a suspended parent would hold a UI session that reads
 * nothing and shows empty pages instead of being logged out.
 *
 * Returns `undefined` before the auth tables are migrated so a pre-migration
 * database degrades to "staff only" instead of erroring on every login.
 */
async function loadParentByAuthId(authUserId: string): Promise<DbParentAccount | null> {
  const { data, error } = await supabase
    .from("parent_auth_accounts" as never)
    .select("id, name, email, login_email, mobile, status")
    .eq("user_id", authUserId)
    .eq("status", "active")
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as DbParentAccount;
}

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

  // Parent fallback. Only runs once the profile lookup has settled EMPTY, so a
  // staff login still costs exactly one round trip — the overwhelmingly common
  // case pays nothing for the portal existing.
  const noProfile = !!session && profileQuery.isFetched && !profileQuery.data;
  const parentQuery = useQuery({
    queryKey: session
      ? [...CURRENT_PARENT_QUERY_KEY, session.authUserId]
      : CURRENT_PARENT_QUERY_KEY,
    queryFn: () => loadParentByAuthId(session!.authUserId),
    enabled: noProfile,
    staleTime: 60_000,
  });

  // ── A SESSION WITH NEITHER A PROFILE NOR A PARENT ACCOUNT IS NOT SIGNED OUT ─
  //
  // There used to be a force-signOut() here for exactly that case, on the
  // reasoning that an orphaned auth.users row would otherwise cause a silent
  // redirect loop.
  //
  // Self-serve signup creates precisely that shape ON PURPOSE. Phase 0's
  // handle_new_user() gives a signup carrying no staff role NO profile, so
  // every new customer is profile-less between confirming their email and
  // naming their organization. The sign-out made provisioning impossible: login
  // succeeded, this effect destroyed the session a moment later, and /signup —
  // finding no session — restarted at step 1. From the outside it looked like
  // the password was wrong, and no amount of fixing the wizard could help,
  // because the wizard was being handed a signed-out client.
  //
  // Removing it is safe, verified against the live database rather than
  // assumed: a session with no profiles row reads ZERO rows from students,
  // profiles, fees, attendance, exam results, payroll, leads, message_queue,
  // campuses, batches and organization_users. is_staff() is false, and every
  // tenant policy carries a role check on top of the organization conjunct.
  // The only readable row is the organization record itself.
  //
  // The redirect loop it guarded against is now prevented properly rather than
  // by ejecting the user: RootRoute sends a profile-less session to /signup,
  // which is a terminal destination, and ProtectedRoute still sends it to
  // /login. Neither bounces back.

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

  const parent = useMemo<ParentIdentity | null>(() => {
    if (!session || !parentQuery.data) return null;
    const p = parentQuery.data;
    return {
      accountId: p.id,
      userId: session.authUserId,
      name: p.name || "Parent",
      email: p.email || p.login_email || session.email,
      mobile: p.mobile || undefined,
    };
  }, [session, parentQuery.data]);

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
        // Drop any cached identity so a re-login doesn't briefly show the old
        // user — and, more importantly, so a staff login immediately after a
        // parent logout can never inherit the parent's cached account.
        qc.removeQueries({ queryKey: CURRENT_PROFILE_QUERY_KEY });
        qc.removeQueries({ queryKey: CURRENT_PARENT_QUERY_KEY });
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
    qc.removeQueries({ queryKey: CURRENT_PARENT_QUERY_KEY });
  }, [qc]);

  // Stay "loading" through the parent fallback too, otherwise a parent session
  // would momentarily present as fully-resolved-and-unauthenticated and every
  // ProtectedRoute would bounce it to /login before the account resolved.
  const loading =
    bootstrapping ||
    (!!session && profileQuery.isLoading) ||
    (noProfile && parentQuery.isLoading);

  const portal: PortalKind | null = user ? "staff" : parent ? "parent" : null;

  return (
    <AuthContext.Provider
      value={{
        user,
        parent,
        portal,
        login,
        logout,
        isAuthenticated: !!user,
        isParentAuthenticated: !!parent,
        hasSession: !!session,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
