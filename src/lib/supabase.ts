import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://vsvbnmswknkajantafma.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzdmJubXN3a25rYWphbnRhZm1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MDEyMjksImV4cCI6MjA5Nzk3NzIyOX0.NKIPnkpN0zg4ofvbVAenduTSBNg-rswv2QhdCJODP8U";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: typeof window !== "undefined",
    autoRefreshToken: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});
