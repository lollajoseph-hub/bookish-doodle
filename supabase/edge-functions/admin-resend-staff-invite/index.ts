import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Admin action: resend the login invite email to an admin/recruiter who
// hasn't confirmed/signed in yet. Reuses the same invite mechanism as
// admin-create-staff (Supabase Auth invite -> /reset-password).
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STAFF_APP_URL = (
  Deno.env.get("STAFF_APP_URL") ||
  "https://id-preview--dd812475-230d-4a19-86cd-d07299ce3d94.lovable.app"
).replace(/\/$/, "");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Missing authorization" }, 401);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: caller } = await admin.auth.getUser(token);
    if (!caller?.user) return json({ error: "Invalid session" }, 401);
    const { data: callerProfile } = await admin.from("profiles").select("role").eq("id", caller.user.id).maybeSingle();
    if (callerProfile?.role !== "admin") return json({ error: "Forbidden: admin only" }, 403);

    const body = await req.json().catch(() => ({}));
    const userId = String(body?.user_id ?? "").trim();
    if (!userId) return json({ error: "user_id is required" }, 400);

    const { data: profile } = await admin.from("profiles").select("id, email, full_name, role").eq("id", userId).maybeSingle();
    if (!profile?.email) return json({ error: "Staff profile has no email on file" }, 404);

    const { data: authUser, error: getUserErr } = await admin.auth.admin.getUserById(userId);
    if (getUserErr || !authUser?.user) return json({ error: `Could not load auth account: ${getUserErr?.message ?? "not found"}` }, 404);

    if (authUser.user.email_confirmed_at) {
      return json({ error: "This person has already signed in and set a password. Use password reset instead if they're locked out." }, 409);
    }

    const { error: invErr } = await admin.auth.admin.inviteUserByEmail(profile.email, {
      data: { full_name: profile.full_name, role: profile.role },
      redirectTo: `${STAFF_APP_URL}/reset-password`,
    });
    if (invErr) return json({ error: `Resend failed: ${invErr.message}` }, 400);

    return json({ ok: true, resent: true, email: profile.email });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
