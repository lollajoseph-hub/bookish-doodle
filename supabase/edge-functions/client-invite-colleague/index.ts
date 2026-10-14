import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Self-serve action: the PRIMARY client contact invites a colleague onto their
// own company's account (role='client', is_primary=false). Deliberately not
// admin-only - this is what makes it "self-serve" per
// CandidatePoolReviewSystem_Requirements.md §13 (net-new vs VetPod, whose
// equivalent - admin-invite-clinic-member - is staff-only).
//
// Authorization: the target client_id is derived from the CALLER's own
// client_members row, never taken from the request body - a primary contact
// can only invite people into their own company, not anyone else's.
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

    const { data: callerMembership } = await admin
      .from("client_members")
      .select("client_id, is_primary")
      .eq("profile_id", caller.user.id)
      .maybeSingle();
    if (!callerMembership?.client_id) return json({ error: "Forbidden: not a client account" }, 403);
    if (!callerMembership.is_primary) return json({ error: "Forbidden: only the primary contact can invite colleagues" }, 403);
    const clientId = callerMembership.client_id;

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();
    if (!email) return json({ error: "Email is required" }, 400);
    const fullName = [body?.first_name, body?.last_name].filter(Boolean).join(" ").trim() || null;

    let userId: string;
    let invited = false;
    const { data: prof } = await admin.from("profiles").select("id, role").eq("email", email).maybeSingle();
    if (prof?.id) {
      if (prof.role === "admin" || prof.role === "recruiter") {
        return json({ error: "This email belongs to an existing staff account and cannot be added as a client contact." }, 409);
      }
      userId = prof.id;
    } else {
      const { data: inv, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName, role: "client" },
        redirectTo: `${APP_URL}/reset-password`,
      });
      if (invErr || !inv?.user) return json({ error: `Invite failed: ${invErr?.message ?? "unknown"}` }, 400);
      userId = inv.user.id;
      invited = true;
      await admin.from("profiles").update({ role: "client", full_name: fullName }).eq("id", userId);
    }

    const { data: existing } = await admin
      .from("client_members")
      .select("client_id")
      .eq("profile_id", userId)
      .maybeSingle();
    if (existing?.client_id === clientId) return json({ error: "This person is already on your team." }, 409);
    if (existing?.client_id) return json({ error: "This person already belongs to a different company account." }, 409);

    const { error: memberErr } = await admin.from("client_members").insert({
      client_id: clientId,
      profile_id: userId,
      is_primary: false,
      client_position: s(body?.position),
    });
    if (memberErr) return json({ error: `Adding to team failed: ${memberErr.message}` }, 400);

    return json({ ok: true, invited });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});