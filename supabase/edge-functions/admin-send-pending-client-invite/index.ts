import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Admin action: manually send the deferred invite for a client whose
// pending_contact is still set (i.e. their first request came back with zero
// matched candidates at creation time, so the invite was withheld). Staff
// call this once they've fixed that up — added a candidate manually, or
// matching has since found someone.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = (
  Deno.env.get("CLIENT_APP_URL") ||
  "https://candidatepool.scalesource.com"
).replace(/\/$/, "");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(b: unknown, st = 200) {
  return new Response(JSON.stringify(b), { status: st, headers: { ...cors, "Content-Type": "application/json" } });
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
    const clientId = String(body?.client_id ?? "").trim();
    if (!clientId) return json({ error: "client_id is required" }, 400);

    const { data: clientRow, error: clientErr } = await admin
      .from("clients")
      .select("id, pending_contact")
      .eq("id", clientId)
      .maybeSingle();
    if (clientErr) return json({ error: clientErr.message }, 400);
    if (!clientRow) return json({ error: "Client not found" }, 404);

    const pending = clientRow.pending_contact as { first_name?: string; last_name?: string; email?: string; position?: string } | null;
    if (!pending?.email) return json({ error: "This client has no pending invite to send." }, 400);

    const email = pending.email.trim().toLowerCase();
    const fullName = [pending.first_name, pending.last_name].filter(Boolean).join(" ").trim() || null;

    let ownerId: string;
    let invited = false;
    const { data: existingProfile } = await admin.from("profiles").select("id, role").eq("email", email).maybeSingle();
    if (existingProfile?.id) {
      if (existingProfile.role === "admin" || existingProfile.role === "recruiter") {
        return json({ error: "This email now belongs to an existing staff account and cannot be used as a client contact." }, 409);
      }
      ownerId = existingProfile.id;
    } else {
      const { data: inv, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName, role: "client" },
        redirectTo: `${APP_URL}/reset-password`,
      });
      if (invErr || !inv?.user) return json({ error: `Invite failed: ${invErr?.message ?? "unknown"}` }, 400);
      ownerId = inv.user.id;
      invited = true;
      await admin.from("profiles").update({ role: "client", full_name: fullName }).eq("id", ownerId);
    }

    const { data: existingMember } = await admin
      .from("client_members")
      .select("profile_id")
      .eq("client_id", clientId)
      .eq("profile_id", ownerId)
      .maybeSingle();
    if (!existingMember) {
      const { error: memberErr } = await admin.from("client_members").insert({
        client_id: clientId,
        profile_id: ownerId,
        client_position: pending.position || null,
        is_primary: true,
      });
      if (memberErr) return json({ error: `Invite sent, but linking the contact failed: ${memberErr.message}` }, 400);
    }

    await admin.from("clients").update({ pending_contact: null }).eq("id", clientId);

    return json({ ok: true, invited });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});