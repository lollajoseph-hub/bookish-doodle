import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Admin action: invite a new ADMIN or RECRUITER into the ScaleSource Candidate
// Review Dashboard. Reuses Supabase Auth's invite-by-email flow (same pattern
// as VetFlow's admin-create-recruiter) and sets profiles.role accordingly.
// If the email already belongs to an existing profile with no staff role,
// that account is promoted in place instead of blocked.
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
const VALID_ROLES = ["admin", "recruiter"];

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
    const email = String(body?.email ?? "").trim().toLowerCase();
    const role = String(body?.role ?? "").trim().toLowerCase();
    if (!email) return json({ error: "email is required" }, 400);
    if (!VALID_ROLES.includes(role)) return json({ error: "role must be 'admin' or 'recruiter'" }, 400);
    const fullName = String(body?.full_name ?? "").trim() || null;

    const { data: existing } = await admin.from("profiles").select("id, role").eq("email", email).maybeSingle();
    if (existing?.id) {
      if (existing.role === "admin" || existing.role === "recruiter") {
        return json({ error: `This email already belongs to an existing ${existing.role} account.` }, 409);
      }
      // Existing non-staff account (e.g. a client contact) — promote in place.
      // No new invite email is sent since the account already has valid credentials.
      const { error: promoteErr } = await admin
        .from("profiles")
        .update({ role, full_name: fullName ?? undefined })
        .eq("id", existing.id);
      if (promoteErr) return json({ error: `Failed to promote existing account: ${promoteErr.message}` }, 400);
      return json({ ok: true, user_id: existing.id, invited: false, promoted: true });
    }

    const { data: inv, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName, role },
      redirectTo: `${STAFF_APP_URL}/reset-password`,
    });
    if (invErr || !inv?.user) return json({ error: `Invite failed: ${invErr?.message ?? "unknown"}` }, 400);
    const userId = inv.user.id;

    const { error: profErr } = await admin
      .from("profiles")
      .update({ role, full_name: fullName })
      .eq("id", userId);
    if (profErr) return json({ error: `Profile update failed: ${profErr.message}` }, 400);

    return json({ ok: true, user_id: userId, invited: true, promoted: false });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
