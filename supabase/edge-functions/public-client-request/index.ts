import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Public (unauthenticated) NEW-COMPANY hiring-request intake.
// Existing clients never hit this path - they use the single-stage /new-request
// form (direct authenticated insert, RLS-scoped to their own client_id).
// This is stage 1+2+3 of the public wizard collapsed into one call: company,
// primary contact, and the first hiring request, submitted together.
//
// Schema note: languages are skills with category='Languages' in the shared
// skills catalogue, chosen from a fixed dropdown (~80 seeded languages).
//
// FIXED 2026-09-27 (role-scoped must-have skills): must-have skills are no longer purely
// free-typed. The wizard now shows a dropdown scoped to the selected role (via the public
// get_role_skills RPC) and sends real skill IDs for anything picked from that list under
// must_have_skill_ids. Anything the visitor typed into "+ Add a skill not listed" (not yet a
// real skill) arrives separately as plain names under must_have_skill_names, because the
// wizard is unauthenticated and can't call add_or_get_skill_for_role directly (that RPC is
// authenticated-only, on purpose). This function resolves each of those names server-side
// (via its service-role client, which bypasses that restriction) using
// add_or_get_skill_for_role(role_id, name, 'Other') - which both resolves-or-creates the skill
// AND tags it onto the role's role_skills list, so it shows up in the dropdown for the next
// person picking the same role. Both id sources end up in client_request_skills
// (is_required=true) alongside languages, so they keep feeding rank_and_match's scoring;
// nice-to-haves are separate (is_required=false).
//
// Auth note: new primary contacts are created via admin.generateLink(type:
// 'invite') rather than inviteUserByEmail(). generateLink does NOT send an
// email itself - it returns a hashed_token we hand back to the client so the
// wizard can call supabase.auth.verifyOtp() immediately and drop the user
// straight into a "set your password" step, no email round-trip required.
// If they abandon before finishing, the login page's "email me a secure
// login link" (client-magic-link) is the recovery path.
//
// Matching note: rank_and_match runs automatically right after the request
// and its skills are fully inserted, so matches exist the moment the request
// is created - staff never have to manually trigger the first pass. It's
// call is best-effort: if it errors (e.g. no eligible candidates yet), the
// request is still created successfully; staff can always re-run/reshuffle
// matching later from the dashboard.
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
const n = (v: unknown) => (v === undefined || v === null || v === "" ? null : Number(v));
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x) : []);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const company = body?.company ?? {};
    const contact = body?.contact ?? {};
    const request = body?.request ?? {};

    const companyName = String(company?.name ?? "").trim();
    const email = String(contact?.email ?? "").trim().toLowerCase();
    const primaryName = [contact?.first_name, contact?.last_name].filter(Boolean).join(" ").trim() || null;
    const roleId = s(request?.role_id);
    const engagementType = s(request?.engagement_type);
    const hoursNeeded = s(request?.hours_needed);
    const daysOfWeek = arr(request?.days_of_week_needed);
    const mustHaveSkillIds = arr(request?.must_have_skill_ids);
    const mustHaveSkillNames = arr(request?.must_have_skill_names);
    const requiredLanguageIds = arr(request?.required_skill_ids);
    const niceToHaveSkillIds = arr(request?.nice_to_have_skill_ids);
    const timezoneRequirement = s(request?.timezone_requirement);

    if (!companyName) return json({ error: "Company name is required" }, 400);
    if (!email) return json({ error: "Contact email is required" }, 400);
    if (!roleId) return json({ error: "Role is required" }, 400);
    if (!engagementType) return json({ error: "Engagement type is required" }, 400);
    if (!hoursNeeded) return json({ error: "Hours needed is required" }, 400);
    if (daysOfWeek.length === 0) return json({ error: "At least one day of the week is required" }, 400);
    if (mustHaveSkillIds.length === 0 && mustHaveSkillNames.length === 0) {
      return json({ error: "At least one must-have skill is required" }, 400);
    }
    if (requiredLanguageIds.length === 0) return json({ error: "At least one required language is required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

    // Resolve each freely-typed "not listed" must-have skill name server-side: resolve-or-create
    // the skill AND tag it onto this role's curated list, so it shows up in the dropdown for the
    // next visitor who picks the same role. Real dropdown-picked ids (mustHaveSkillIds) need no
    // resolution - they're already valid skill ids from get_role_skills.
    const resolvedNameIds: string[] = [];
    for (const name of mustHaveSkillNames) {
      const { data: newId, error: addErr } = await admin.rpc("add_or_get_skill_for_role", {
        p_role_id: roleId,
        p_skill_name: name,
        p_category: "Other",
      });
      if (addErr || !newId) {
        return json({ error: `Couldn't process must-have skill "${name}": ${addErr?.message ?? "unknown error"}` }, 400);
      }
      resolvedNameIds.push(newId as string);
    }
    const allMustHaveSkillIds = [...new Set([...mustHaveSkillIds, ...resolvedNameIds])];

    // Resolve or invite the primary contact.
    let ownerId: string;
    let invited = false;
    let inviteToken: string | null = null;
    const { data: existingProfile } = await admin.from("profiles").select("id, role").eq("email", email).maybeSingle();
    if (existingProfile?.id) {
      if (existingProfile.role === "admin" || existingProfile.role === "recruiter") {
        return json({ error: "This email belongs to an existing staff account and cannot be used as a client contact." }, 409);
      }
      ownerId = existingProfile.id;
    } else {
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: "invite",
        email,
        options: {
          data: { full_name: primaryName, role: "client" },
          redirectTo: `${APP_URL}/reset-password`,
        },
      });
      if (linkErr || !linkData?.user) return json({ error: `Invite failed: ${linkErr?.message ?? "unknown"}` }, 400);
      ownerId = linkData.user.id;
      invited = true;
      inviteToken = linkData.properties?.hashed_token ?? null;
      await admin.from("profiles").update({ role: "client", full_name: primaryName }).eq("id", ownerId);
    }

    // If this email already has a client account, don't spin up a duplicate company -
    // reuse their existing membership instead (mirrors clinic-request's dedupe logic).
    let clientId: string;
    const { data: existingMember } = await admin
      .from("client_members")
      .select("client_id")
      .eq("profile_id", ownerId)
      .limit(1)
      .maybeSingle();

    if (existingMember?.client_id) {
      clientId = existingMember.client_id;
    } else {
      const { data: clientRow, error: clientErr } = await admin
        .from("clients")
        .insert({ name: companyName, industry: s(company?.industry) })
        .select("id")
        .single();
      if (clientErr || !clientRow) return json({ error: `Company creation failed: ${clientErr?.message}` }, 400);
      clientId = clientRow.id;

      const { error: memberErr } = await admin.from("client_members").insert({
        client_id: clientId,
        profile_id: ownerId,
        is_primary: true,
        client_position: s(contact?.position),
      });
      if (memberErr) return json({ error: `Company created, but linking the contact failed: ${memberErr.message}` }, 400);
    }

    const { data: reqRow, error: reqErr } = await admin
      .from("client_requests")
      .insert({
        client_id: clientId,
        role_id: roleId,
        engagement_type: engagementType,
        hours_needed: hoursNeeded,
        days_of_week_needed: daysOfWeek,
        hires_needed: n(request?.hires_needed) ?? 1,
        years_experience_min: n(request?.years_experience_min),
        desired_start_date: s(request?.desired_start_date),
        notes: s(request?.notes),
        timezone_requirement: timezoneRequirement,
        created_by: ownerId,
      })
      .select("id")
      .single();
    if (reqErr || !reqRow) return json({ error: `Request creation failed: ${reqErr?.message}` }, 400);

    const skillRows = [
      ...allMustHaveSkillIds.map((skill_id) => ({ request_id: reqRow.id, skill_id, is_required: true })),
      ...requiredLanguageIds.map((skill_id) => ({ request_id: reqRow.id, skill_id, is_required: true })),
      ...niceToHaveSkillIds.map((skill_id) => ({ request_id: reqRow.id, skill_id, is_required: false })),
    ];
    if (skillRows.length > 0) {
      const { error: skillErr } = await admin.from("client_request_skills").insert(skillRows);
      if (skillErr) return json({ error: `Request created, but skill tagging failed: ${skillErr.message}` }, 400);
    }

    // Auto-match: run immediately so matches exist as soon as the request does.
    // Best-effort - never fail the whole request over a matching hiccup.
    try {
      await admin.rpc("rank_and_match", { p_request_id: reqRow.id, p_limit: 6 });
    } catch (matchErr) {
      console.error("auto-match failed", matchErr);
    }

    return json({
      ok: true,
      invited,
      invite_token: inviteToken,
      client_id: clientId,
      request_id: reqRow.id,
      message: invited ? "Set a password to finish setting up your account" : "Request created for existing account",
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});