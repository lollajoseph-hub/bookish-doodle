import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Admin action: create a CLIENT company AND its first hiring request (standard
// or staff-curated) in one step, populate the request with candidates, and
// ONLY THEN invite the primary contact — so the client's first login always
// has something waiting for them instead of an empty dashboard.
//
// FIXED 2026-09-27 (role-scoped must-have skills): staff are authenticated in the Dashboard
// app, so its New client + request wizard now resolves must-have skills client-side via
// add_or_get_skill_for_role (which both resolves-or-creates the skill and tags it onto the
// role's role_skills list) and sends real skill ids directly under must_have_skill_ids —
// mirroring how required languages (language_skill_ids) already work. This function no longer
// calls resolve_or_create_skills for must-have skills; it just uses the ids as-is.
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
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x) : []);

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
    const primaryFirst = String(body?.primary_contact?.first_name ?? "").trim();
    const primaryLast = String(body?.primary_contact?.last_name ?? "").trim();
    const primaryName = [primaryFirst, primaryLast].filter(Boolean).join(" ").trim() || null;
    const primaryPosition = s(body?.primary_contact?.position);
    if (!primaryEmail) return json({ error: "Primary contact email is required" }, 400);
    if (!primaryFirst || !primaryLast) return json({ error: "Primary contact first and last name are required" }, 400);

    const request = body?.request ?? {};
    const source = request?.source === "staff_curated" ? "staff_curated" : "standard";
    const roleId = s(request?.role_id);
    if (!roleId) return json({ error: "Request role is required" }, 400);
    const engagementType = String(request?.engagement_type ?? "full_time");

    let candidateIds: string[] = [];
    if (source === "staff_curated") {
      candidateIds = arr(request?.candidate_ids);
      if (!candidateIds.length) {
        return json({ error: "Pick at least one candidate for a custom request" }, 400);
      }
    }

    const mustHaveSkillIds = arr(request?.must_have_skill_ids);
    const requiredLanguageIds = arr(request?.language_skill_ids);
    const niceToHaveSkillIds = arr(request?.nice_to_have_skill_ids);
    if (source === "standard" && requiredLanguageIds.length === 0) {
      return json({ error: "At least one required language is required" }, 400);
    }

    // Guard against an existing staff/recruiter email being reused as a client contact.
    const { data: existingProfileCheck } = await admin
      .from("profiles")
      .select("id, role")
      .eq("email", primaryEmail)
      .maybeSingle();
    if (existingProfileCheck?.id && (existingProfileCheck.role === "admin" || existingProfileCheck.role === "recruiter")) {
      return json({ error: "This email belongs to an existing staff account and cannot be used as a client contact." }, 409);
    }

    // 1. Create the client company.
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
    const clientId = clientRow.id as string;

    // 2. Create the request.
    const candidatesWanted = source === "staff_curated" ? candidateIds.length : Math.max(4, Number(request?.hires_needed ?? 1) * 4);
    const { data: reqRow, error: reqErr } = await admin
      .from("client_requests")
      .insert({
        client_id: clientId,
        role_id: roleId,
        title: s(request?.title),
        candidates_wanted: candidatesWanted,
        hires_needed: Number(request?.hires_needed ?? 1) || 1,
        engagement_type: engagementType,
        hours_needed: s(request?.hours_needed),
        timezone_requirement: s(request?.timezone_requirement),
        years_experience_min: request?.years_experience_min != null && request?.years_experience_min !== "" ? Number(request.years_experience_min) : null,
        desired_start_date: s(request?.desired_start_date),
        days_of_week_needed: Array.isArray(request?.days_of_week_needed) && request.days_of_week_needed.length ? request.days_of_week_needed : null,
        notes: s(request?.notes),
        status: "open",
        source,
        created_by: caller.user.id,
      })
      .select("id")
      .single();
    if (reqErr) return json({ error: `Client created, but request insert failed: ${reqErr.message}` }, 400);
    const requestId = reqRow.id as string;

    // 2b. Tag skills (standard only — matches public-client-request's scoring inputs).
    if (source === "standard") {
      const skillRows = [
        ...mustHaveSkillIds.map((skill_id) => ({ request_id: requestId, skill_id, is_required: true })),
        ...requiredLanguageIds.map((skill_id) => ({ request_id: requestId, skill_id, is_required: true })),
        ...niceToHaveSkillIds.map((skill_id) => ({ request_id: requestId, skill_id, is_required: false })),
      ];
      if (skillRows.length > 0) {
        const { error: skillErr } = await admin.from("client_request_skills").insert(skillRows);
        if (skillErr) {
          return json({ error: `Client and request created, but skill tagging failed: ${skillErr.message}`, client_id: clientId, request_id: requestId }, 400);
        }
      }
    }

    // 3. Populate it.
    let matchedCount = 0;
    if (source === "standard") {
      const { data: matches, error: matchErr } = await admin.rpc("rank_and_match", {
        p_request_id: requestId,
        p_limit: candidatesWanted,
      });
      if (matchErr) {
        return json({ error: `Client and request created, but matching failed: ${matchErr.message}`, client_id: clientId, request_id: requestId }, 400);
      }
      matchedCount = Array.isArray(matches) ? matches.length : 0;
    } else {
      const rows = candidateIds.map((cid) => ({
        client_request_id: requestId,
        candidate_id: cid,
        match_reason: "Hand-picked by our recruiting team",
        status: "recommended" as const,
      }));
      const { error: insErr } = await admin.from("candidate_matches").insert(rows);
      if (insErr) {
        return json({ error: `Client and request created, but adding candidates failed: ${insErr.message}`, client_id: clientId, request_id: requestId }, 400);
      }
      matchedCount = candidateIds.length;
    }

    // 4. Only now decide whether to invite.
    if (matchedCount > 0) {
      let ownerId: string;
      let invited = false;
      if (existingProfileCheck?.id) {
        ownerId = existingProfileCheck.id;
      } else {
        const { data: inv, error: invErr } = await admin.auth.admin.inviteUserByEmail(primaryEmail, {
          data: { full_name: primaryName, role: "client" },
          redirectTo: `${APP_URL}/reset-password`,
        });
        if (invErr || !inv?.user) {
          return json({
            error: `Client, request and ${matchedCount} candidate(s) are ready, but the invite failed to send: ${invErr?.message ?? "unknown"}. Client id ${clientId}, request id ${requestId}.`,
            client_id: clientId,
            request_id: requestId,
            matched_count: matchedCount,
          }, 400);
        }
        ownerId = inv.user.id;
        invited = true;
        await admin.from("profiles").update({ role: "client", full_name: primaryName }).eq("id", ownerId);
      }

      const { error: memberErr } = await admin.from("client_members").insert({
        client_id: clientId,
        profile_id: ownerId,
        client_position: primaryPosition,
        is_primary: true,
      });
      if (memberErr) {
        return json({
          error: `Client, request and candidates are ready and the contact was invited, but linking them to the client failed: ${memberErr.message}`,
          client_id: clientId,
          request_id: requestId,
          matched_count: matchedCount,
        }, 400);
      }

      return json({ ok: true, client_id: clientId, request_id: requestId, matched_count: matchedCount, invited, needs_manual_match: false });
    }

    // 5. Zero matches (standard only — custom always requires >=1 candidate up front).
    //    Defer the invite: store the pending contact on the client row instead of
    //    inviting into an empty dashboard.
    await admin
      .from("clients")
      .update({
        pending_contact: {
          first_name: primaryFirst,
          last_name: primaryLast,
          email: primaryEmail,
          position: primaryPosition,
        },
      })
      .eq("id", clientId);

    return json({
      ok: true,
      client_id: clientId,
      request_id: requestId,
      matched_count: 0,
      invited: false,
      needs_manual_match: true,
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});