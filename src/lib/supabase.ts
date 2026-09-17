import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  "https://kjpozzjeddvctcabtnzg.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  "sb_publishable_lFEdb3EyFQozdpgTla7Yug_70iMmIrr";

const isBrowser = typeof window !== "undefined";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: isBrowser,
    autoRefreshToken: isBrowser,
    detectSessionInUrl: isBrowser,
    storage: isBrowser ? window.localStorage : undefined,
    storageKey: "scalesource-candidate-review-auth",
  },
});

export { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY };

export type StaffRole = "admin" | "recruiter";
export type AppRole = StaffRole | "client" | "candidate";

export interface Profile {
  id: string;
  role: AppRole;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
}
