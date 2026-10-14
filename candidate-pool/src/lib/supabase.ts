import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://kjpozzjeddvctcabtnzg.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqcG96emplZGR2Y3RjYWJ0bnpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NjQwODcsImV4cCI6MjEwNTE0MDA4N30.DR3NQJJOlfiPrRyImxB1w9ZhXCsx_iTzDdp_GMlKcuA";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: typeof window !== "undefined",
    autoRefreshToken: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});
