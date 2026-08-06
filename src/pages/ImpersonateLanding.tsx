// ──────────────────────────────────────────────────────────────────────────────
// IMPERSONATION LANDING
//
// Opened in a NEW TAB by the control plane. It exchanges the one-time token for
// a session AS the target tenant user, then drops into the ERP.
//
// Why the exchange happens here and not in the control-plane tab: supabase-js
// keeps one session per storage key per origin. Calling verifyOtp in the
// platform tab would REPLACE the platform session with the tenant user's —
// logging the operator out of the control plane and leaving no platform
// identity with which to end the grant.
//
// This page holds no privilege of its own. The token was minted server-side
// only after the edge function verified the operator's capability, confirmed
// the target is an active member of that organization, and wrote the grant
// row. If someone reaches this URL without a valid token, nothing happens.
// ──────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ShieldAlert, Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type State = "exchanging" | "done" | "error";

const ImpersonateLanding: React.FC = () => {
  const [params] = useSearchParams();
  const [state, setState] = useState<State>("exchanging");
  const [message, setMessage] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    // StrictMode double-invokes effects in development. The token is
    // single-use, so a second call would fail and show a spurious error.
    if (ran.current) return;
    ran.current = true;

    const token = params.get("token");
    const email = params.get("email");

    if (!token || !email) {
      setState("error");
      setMessage("Missing or malformed impersonation token.");
      return;
    }

    (async () => {
      // Sign out first: this tab may already hold a session, and verifyOtp
      // layering on top of one produces confusing, hard-to-debug states.
      await supabase.auth.signOut().catch(() => undefined);

      const { error } = await supabase.auth.verifyOtp({
        email,
        token_hash: token,
        type: "magiclink",
      });

      if (error) {
        setState("error");
        setMessage(error.message);
        return;
      }

      setState("done");
      // Full reload rather than client navigation: every provider must
      // re-resolve identity and organization from scratch, and a soft
      // navigation would leave the previous tenant's React Query cache in place.
      setTimeout(() => window.location.replace("/"), 900);
    })();
  }, [params]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full rounded-lg border border-amber-500/40 bg-amber-500/5 p-6 text-center space-y-3">
        <ShieldAlert className="h-7 w-7 mx-auto text-amber-500" />
        <h1 className="text-base font-semibold">Impersonation session</h1>

        {state === "exchanging" && (
          <>
            <p className="text-sm text-muted-foreground">
              Establishing a session as the requested user…
            </p>
            <Loader2 className="h-4 w-4 mx-auto animate-spin text-muted-foreground" />
          </>
        )}

        {state === "done" && (
          <p className="text-sm text-muted-foreground">
            Signed in. Every action you take is attributed to your platform account
            in the audit log, and the grant expires automatically.
          </p>
        )}

        {state === "error" && (
          <>
            <AlertTriangle className="h-5 w-5 mx-auto text-red-500" />
            <p className="text-sm text-muted-foreground">{message}</p>
            <p className="text-[11px] text-muted-foreground">
              Impersonation tokens are single-use and short-lived. Start a new session
              from the control plane.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default ImpersonateLanding;
