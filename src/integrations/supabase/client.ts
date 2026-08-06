// Supabase client — single instance shared across the app.
// Env values are baked in at build time from .env (VITE_* keys); the
// PUBLISHABLE_KEY is the anon key, so it is safe to ship. RLS policies
// in the database are what enforce row-level authorization.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Fail loud if the environment wasn't wired up — silently constructing a
// broken client causes every request to 401 with a confusing error later.
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  const missing = [
    !SUPABASE_URL && "VITE_SUPABASE_URL",
    !SUPABASE_PUBLISHABLE_KEY && "VITE_SUPABASE_PUBLISHABLE_KEY",
  ].filter(Boolean).join(", ");
  throw new Error(
    `[supabase] Missing required environment variable(s): ${missing}. ` +
    `Create a .env file at the project root (see .env.example).`
  );
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
    // MUST stay true. Public signup (/signup) calls signUp() with
    // emailRedirectTo, and GoTrue sends the confirmed user back carrying the
    // session in the URL — `?code=` under PKCE, or a `#access_token=` fragment.
    // With this off the client discarded that entirely, so no session was ever
    // established: getSession() returned null, the signup wizard could not tell
    // a verified user from a brand-new one, and clicking "I have verified"
    // dropped people back to step 1 forever. Nobody could ever create an
    // organization.
    //
    // It was previously disabled on the rationale that the app has no OAuth or
    // magic links. That was true of the staff ERP and stopped being true when
    // self-serve signup shipped.
    detectSessionInUrl: true,
  },
});
