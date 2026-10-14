import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Admin action: create a CLIENT company and invite its primary contact
// (role='client'). Mirrors VetFlow's admin-create-clinic pattern: the contact
// gets a Supabase Auth invite email to set their password, and is linked as
// the primary member of the new client record.
//
// Superseded in the Dashboard frontend by admin-create-client-with-request
// (which creates the client + first request together), but left live/fixed
// in case anything still calls this directly.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Client invites must always land on the CLIENT-facing app, never the staff
// Dashboard. No fallback to a staff app URL here, on purpose.
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
const s = (v: unknown) => (v === undefined || v === null || v === "" ? null : String(v));

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
    const name = String(body?.name ?? "").trim();
    if (!name) return json({ error: "Company name is required" }, 400);

    const primaryEmail = String(body?.primary_contact?.email ?? "").trim().toLowerCase();
    const primaryName = [body?.primary_contact?.first_name, body?.primary_contact?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || null;
    if (!primaryEmail) return json({ error: "Primary contact email is required" }, 400);

    let ownerId: string;
    let invited = false;
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id, role")
      .eq("email", primaryEmail)
      .maybeSingle();

    if (existingProfile?.id) {
      if (existingProfile.role === "admin" || existingProfile.role === "recruiter") {
        return json({ error: "This email belongs to an existing staff account and cannot be used as a client contact." }, 409);
      }
      ownerId = existingProfile.id;
    } else {
      const { data: inv, error: invErr } = await admin.auth.admin.inviteUserByEmail(primaryEmail, {
        data: { full_name: primaryName, role: "client" },
        redirectTo: `${APP_URL}/reset-password`,
      });
      if (invErr || !inv?.user) return json({ error: `Invite failed: ${invErr?.message ?? "unknown"}` }, 400);
      ownerId = inv.user.id;
      invited = true;
      await admin.from("profiles").update({ role: "client", full_name: primaryName }).eq("id", ownerId);
    }

    const { data: clientRow, error: clientErr } = await admin
      .from("clients")
      .insert({
        name,
        industry: s(body?.industry),
        parent_client_id: s(body?.parent_client_id),
        is_franchise_brand: !!body?.is_franchise_brand,
      })
      .select("id")
      .single();
    if (clientErr) return json({ error: `Client insert failed: ${clientErr.message}` }, 400);

    const { error: memberErr } = await admin.from("client_members").insert({
      client_id: clientRow.id,
      profile_id: ownerId,
      client_position: s(body?.primary_contact?.position),
      is_primary: true,
    });
    if (memberErr) return json({ error: `Client created, but linking the contact failed: ${memberErr.message}` }, 400);

    return json({ ok: true, client_id: clientRow.id, invited });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});