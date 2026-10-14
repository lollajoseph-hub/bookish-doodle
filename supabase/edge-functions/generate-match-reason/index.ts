// Supabase Edge Function: generate-match-reason
// BACKEND-ONLY. Generates a real, per-match "why this candidate" explanation for
// candidate_matches.match_reason, replacing the previous hardcoded placeholder string.
// Fired (async, via pg_net) by an AFTER INSERT trigger on candidate_matches.
// Auth: verify_jwt=false; hook secret checked via verify_resume_hook() (same shared
// internal-hook secret already used by process-resume -- no new secret needed).
// STRICT-TRUTH: the explanation must be grounded ONLY in facts read from the DB
// (skills actually matched/missing, years experience, role fit, AI profile highlights)
// -- never invent a duty or qualification the candidate doesn't have on file.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") ?? "";
const GROQ = "https://api.groq.com/openai/v1";
const LLM_MODEL = Deno.env.get("GROQ_RESUME_MODEL") ?? "openai/gpt-oss-120b";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-resume-hook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const SYSTEM_PROMPT = `You are ScaleSource's internal recruiter-facing match-explanation engine. You are given ONE candidate-to-request match's facts (already computed by a structured scoring algorithm) and must write a short, honest internal note explaining why this candidate was surfaced for this request.

STRICT TRUTH -- HIGHEST PRIORITY:
- Use ONLY the facts given to you in the user message (matched required skills, missing required skills, years of experience vs. the request's minimum, whether this is the candidate's primary vs. secondary role, and the candidate's AI-generated recruiter summary/highlights if present). Do NOT invent skills, experience, or duties not listed.
- If matched skills are few or none, say so plainly rather than padding -- do not oversell a weak match.
- Do NOT mention numeric match scores in the prose (the score is shown separately in the UI).
- Keep it to 2-3 sentences, internal-recruiter tone (candid, not salesy), no bullet points, no markdown.

OUTPUT FORMAT -- respond with ONLY the 2-3 sentence explanation as plain text. No JSON, no quotes, no preamble.`;

Deno.serve(async (httpReq: Request) => {
  if (httpReq.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (httpReq.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!GROQ_API_KEY) return json({ error: "missing_groq_key" }, 500);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = httpReq.headers.get("x-resume-hook-secret") ?? "";
  const { data: ok, error: vErr } = await admin.rpc("verify_resume_hook", { p_token: token });
  if (vErr) return json({ error: "auth_check_failed", detail: vErr.message }, 500);
  if (ok !== true) return json({ error: "unauthorized" }, 401);

  let body: Record<string, unknown> = {};
  try { body = await httpReq.json(); } catch { return json({ error: "bad_request" }, 400); }
  const matchId = String(body.match_id ?? "");
  if (!matchId) return json({ error: "match_id required" }, 400);

  const { data: match, error: mErr } = await admin
    .from("candidate_matches")
    .select("id, candidate_id, client_request_id, match_score")
    .eq("id", matchId)
    .maybeSingle();
  if (mErr || !match) return json({ error: "match_not_found", detail: mErr?.message ?? null }, 404);

  const [{ data: candidate }, { data: reqData }, { data: aiProfile }, { data: candRoles }] = await Promise.all([
    admin.from("candidates").select("full_name, years_experience, headline").eq("id", match.candidate_id).maybeSingle(),
    admin.from("client_requests").select("title, role_id, years_experience_min").eq("id", match.client_request_id).maybeSingle(),
    admin.from("candidate_ai_profiles").select("recruiter_summary, highlights").eq("candidate_id", match.candidate_id).maybeSingle(),
    admin.from("candidate_roles").select("is_primary, role_id, job_roles(name)").eq("candidate_id", match.candidate_id),
  ]);

  const roleRows = (candRoles ?? []) as Array<{ is_primary: boolean; role_id: string; job_roles: { name: string | null } | null }>;
  const matchedRole = roleRows.find((r) => r.role_id === (reqData as { role_id?: string } | null)?.role_id);
  const roleName = matchedRole?.job_roles?.name ?? "the requested role";
  const isPrimary = !!matchedRole?.is_primary;

  const [{ data: requiredSkills }, { data: candidateSkills }] = await Promise.all([
    admin.from("client_request_skills").select("is_required, skills(name)").eq("request_id", match.client_request_id),
    admin.from("candidate_skills").select("skills(name)").eq("candidate_id", match.candidate_id),
  ]);

  const requiredNames = ((requiredSkills ?? []) as Array<{ is_required: boolean; skills: { name: string | null } | null }>)
    .filter((r) => r.is_required && r.skills?.name)
    .map((r) => r.skills!.name as string);
  const candidateNameSet = new Set(
    ((candidateSkills ?? []) as Array<{ skills: { name: string | null } | null }>)
      .map((r) => r.skills?.name)
      .filter((n): n is string => !!n)
  );
  const matchedSkills = requiredNames.filter((n) => candidateNameSet.has(n));
  const missingSkills = requiredNames.filter((n) => !candidateNameSet.has(n));

  const cand = (candidate ?? {}) as { full_name?: string; years_experience?: number; headline?: string };
  const reqInfo = (reqData ?? {}) as { title?: string | null; years_experience_min?: number | null };
  const ai = (aiProfile ?? {}) as { recruiter_summary?: string | null; highlights?: unknown };

  const facts = [
    `Candidate: ${cand.full_name ?? "Unknown"}${cand.headline ? ` (${cand.headline})` : ""}`,
    `Role fit: ${isPrimary ? "primary" : "secondary"} role match for "${roleName}"`,
    `Request: ${reqInfo.title ?? "Untitled request"}`,
    `Candidate years of experience: ${cand.years_experience ?? "not on file"}; request's minimum required: ${reqInfo.years_experience_min ?? "none specified"}`,
    `Required skills matched: ${matchedSkills.length ? matchedSkills.join(", ") : "none"}`,
    `Required skills missing: ${missingSkills.length ? missingSkills.join(", ") : "none"}`,
    ai.recruiter_summary ? `Candidate AI recruiter summary on file: ${ai.recruiter_summary}` : `No AI recruiter summary on file yet.`,
    Array.isArray(ai.highlights) && ai.highlights.length ? `Highlights on file: ${(ai.highlights as string[]).join("; ")}` : "",
  ].filter(Boolean).join("\n");

  let reason = "";
  try {
    const r = await fetch(`${GROQ}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL,
        temperature: 0.2,
        max_completion_tokens: 400,
        reasoning_effort: "low",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: facts },
        ],
      }),
    });
    if (!r.ok) return json({ error: "groq_error", status: r.status, detail: (await r.text()).slice(0, 400) }, 502);
    const data = await r.json();
    reason = String(data?.choices?.[0]?.message?.content ?? "").trim();
  } catch (e) {
    return json({ error: "groq_call_failed", detail: String(e) }, 502);
  }
  if (!reason) return json({ error: "empty_reason" }, 502);

  const { error: aErr } = await admin.rpc("apply_match_reason", { p_match_id: matchId, p_reason: reason });
  if (aErr) return json({ error: "apply_failed", detail: aErr.message }, 500);

  return json({ ok: true, match_id: matchId, reason });
});
