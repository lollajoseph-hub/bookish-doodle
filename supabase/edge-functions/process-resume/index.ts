// Supabase Edge Function: process-resume
// BACKEND-ONLY resume understanding pipeline for ScaleSource's Candidate Pool Review System.
// STRICT-TRUTH: every field must be directly evidenced by the resume; the engine must NOT
// invent duties or a role the candidate has not actually held.
// Fired (async, via pg_net) by an AFTER INSERT trigger on candidate_files (file_type='resume'),
// AND by an AFTER INSERT/UPDATE/DELETE trigger on candidate_roles (so the analysis is
// regenerated whenever a candidate's assigned role(s) change, even if that happens after the
// resume was already processed); downloads the PDF (service role), extracts text
// (column-aware, see extractOrderedText), looks up the candidate's currently assigned role(s)
// so the summary can be targeted to them, calls GROQ, writes via apply_resume_profile().
// Auth: verify_jwt=false; hook secret checked via verify_resume_hook().
//
// rank_score (added 2026-09-27): a candidate-quality signal (0-15) computed here from
// resume-evidenced facts only (years of relevant experience, breadth of evidenced
// transferable/software skills, certifications/achievements, resume completeness/clarity).
// It is candidate-level, not request-specific, and feeds into rank_and_match()'s match_score
// formula as a flat bonus on top of role fit / required-skill / experience-threshold points.
// Strict-truth rules apply to it exactly as they do to every other field: never invent a high
// score for a thin resume.
//
// rank_score_breakdown (added 2026-09-27): so staff can see the full AI-score rationale (not
// just the 0-15 total) in the match score breakdown popover, GROQ now outputs each of the 4
// sub-component point values individually (rank_score_experience_pts 0-5, rank_score_skills_pts
// 0-5, rank_score_certifications_pts 0-3, rank_score_completeness_pts 0-2). rank_score itself is
// then computed server-side as the sum of these clamped components, rather than trusted as a
// separately-output total — this guarantees the total always matches the parts shown to staff,
// with no risk of the model's stated total drifting from its own stated sub-scores.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";

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

/**
 * Many resume templates (Canva-style, multi-column with sidebars) place text in the PDF content
 * stream in an order that has nothing to do with visual layout, so a naive top-to-bottom text
 * dump interleaves lines from different columns (e.g. a "Key Skills" sidebar bleeding into the
 * middle of a job description one word at a time). This walks pdf.js's raw positioned text
 * items per page, finds genuine empty vertical bands (gutters) that run through most of the
 * page height using an x-coverage density histogram, splits the page into that many columns
 * (2, 3, or more — not hardcoded to 2), and emits each column's text fully, left to right, top
 * to bottom within each column, instead of trusting content-stream order.
 */
async function extractOrderedText(pdf: {
  numPages: number;
  getPage: (n: number) => Promise<{
    getViewport: (o: { scale: number }) => { width: number };
    getTextContent: () => Promise<{ items: unknown[] }>;
  }>;
}): Promise<string> {
  type Item = { str: string; x: number; y: number; w: number };
  const pageTexts: string[] = [];

  function lineKey(y: number) {
    return Math.round(y / 3);
  }

  function buildColumnText(colItems: Item[]): string {
    const byLine = new Map<number, Item[]>();
    for (const it of colItems) {
      const k = lineKey(it.y);
      const arr = byLine.get(k) ?? [];
      arr.push(it);
      byLine.set(k, arr);
    }
    return Array.from(byLine.entries())
      .sort((a, b) => b[0] - a[0]) // higher y = nearer top of page, first
      .map(([, arr]) => arr.sort((a, b) => a.x - b.x).map((i) => i.str).join(" "))
      .join("\n");
  }

  /** Find column x-ranges via an x-coverage density histogram (handles 1..N columns). */
  function detectColumns(items: Item[], pageWidth: number): Array<[number, number]> {
    const step = 2;
    const bins = Math.max(1, Math.ceil(pageWidth / step));
    const density = new Array(bins).fill(0);
    for (const it of items) {
      const startBin = Math.max(0, Math.floor(it.x / step));
      const endBin = Math.min(bins - 1, Math.ceil((it.x + Math.max(it.w, 1)) / step));
      for (let b = startBin; b <= endBin; b++) density[b]++;
    }
    const maxDensity = Math.max(...density, 1);
    const threshold = Math.max(1, maxDensity * 0.06);
    const minGutterBins = Math.ceil(14 / step); // ~14pt minimum gutter width

    // Find contiguous low-density runs (candidate gutters), away from the page edges.
    const gutters: Array<[number, number]> = [];
    let runStart = -1;
    for (let b = 0; b < bins; b++) {
      const low = density[b] <= threshold;
      if (low && runStart === -1) runStart = b;
      if (!low && runStart !== -1) {
        if (b - runStart >= minGutterBins) gutters.push([runStart, b - 1]);
        runStart = -1;
      }
    }
    if (runStart !== -1 && bins - runStart >= minGutterBins) gutters.push([runStart, bins - 1]);
    // Drop gutters that touch the very edge of the page (leading/trailing margin, not a real column split).
    const realGutters = gutters.filter(([s, e]) => s > 2 && e < bins - 3);

    if (!realGutters.length) return [[0, pageWidth]];

    const segments: Array<[number, number]> = [];
    let prevEnd = 0;
    for (const [gs, ge] of realGutters) {
      const segEnd = gs * step;
      if (segEnd - prevEnd >= 20) segments.push([prevEnd, segEnd]);
      prevEnd = (ge + 1) * step;
    }
    if (pageWidth - prevEnd >= 20) segments.push([prevEnd, pageWidth]);
    return segments.length ? segments : [[0, pageWidth]];
  }

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const pageWidth = viewport.width;
    const content = await page.getTextContent();
    const items: Item[] = [];
    for (const raw of content.items as Array<{ str?: string; transform?: number[]; width?: number }>) {
      const str = (raw.str ?? "").toString();
      if (!str.trim() || !raw.transform) continue;
      items.push({ str, x: raw.transform[4], y: raw.transform[5], w: raw.width ?? 0 });
    }
    if (!items.length) continue;

    const columns = detectColumns(items, pageWidth);
    if (columns.length <= 1) {
      pageTexts.push(buildColumnText(items));
      continue;
    }
    const centerOf = (i: Item) => i.x + i.w / 2;
    const colTexts = columns.map(([lo, hi], idx) => {
      const isLast = idx === columns.length - 1;
      const inCol = items.filter((i) => {
        const c = centerOf(i);
        return isLast ? c >= lo : c >= lo && c < hi;
      });
      return buildColumnText(inCol);
    });
    pageTexts.push(colTexts.filter((t) => t.trim()).join("\n"));
  }
  return pageTexts.join("\n\n");
}

const SYSTEM_PROMPT = `You are ScaleSource's resume-understanding engine. ScaleSource places candidates into remote, client-facing and administrative roles for outsourcing clients — for example customer service / CSR, virtual assistance, bookkeeping and finance support, marketing support, and similar remote professional-services roles. Candidates are NOT expected to already have experience in the specific role or industry of every client they might be placed with. Read ONE candidate's resume text and return a clean, structured profile.

WORK HISTORY ATTRIBUTION — HIGHEST PRIORITY, READ CAREFULLY:
- The resume text may have jumbled reading order (PDF text extraction from multi-column or multi-section layouts often interleaves lines from different jobs, sidebars, or the education section into the middle of a job block, and section headers or taglines may repeat at odd points). Do NOT assume the text arrives in clean top-to-bottom order.
- Before writing ANY work_history entry, first identify every distinct employer block by its own explicit anchors: the organization name, the job title, and the date range written immediately around them in the source. Treat these three as one unit.
- Only assign a duty/achievement sentence to a job if that sentence appears in the SAME block as that job's own organization name and date range in the source text. Never borrow, move, or blend a sentence into a different job's block just because it appears nearby in the extracted text or seems generically to fit.
- Ignore stray repeated tokens that are clearly template chrome, not content — e.g. a lone repeated word like "EXPERIENCE", a repeated name/tagline banner, or a stray country/city word with no surrounding context. These are layout artifacts, not job data.
- Also ignore skill/tool lists that appear letter-spaced or oddly spaced (e.g. "K e y S k i l l s", "A I & A u t o m a t i o n") — these are a separate skills sidebar, NOT job duties. Never fold them into a work_history description; instead read them as skill names for software_skills / core_competencies (join the spaced-out letters back into normal words first).
- If a duty or achievement's employer/date anchor is ambiguous or you cannot confidently tell which job block it belongs to, OMIT it entirely rather than guessing. A shorter, correctly-attributed work_history is required over a longer but muddled one.
- Double-check every entry once you have drafted it: does every sentence in this job's description actually appear near THIS job's own organization name and dates in the source text, and not near a different job's? If not, fix or remove it before finalizing.
- Do not reorder, merge, or split employer blocks. Each distinct organization + date range the resume lists should map to exactly one work_history entry, with only the duties genuinely anchored to it.

EDUCATION DATE ACCURACY — HIGH PRIORITY:
- For each education/certification entry, use ONLY the date(s) written next to THAT specific institution/qualification in the source text. Do not reuse a date from a different entry, and do not guess a plausible-looking date.
- The source often states a MONTH alongside the year for an education/certification entry (e.g. "(Oct, 2025)", "(Nov., 2020)"). When a month is written, you MUST include it in start_date/end_date as "YYYY-MM" — do NOT drop it and report a bare year when the source actually specifies a month. Only fall back to a bare "YYYY" when the source truly gives no month for that entry.
- If a single date is given (e.g. a certificate completed at one point in time), set start_date and end_date to that same value. If a range is given (e.g. a multi-year degree), set start_date and end_date to the two ends of that exact range as written, each keeping its own month if the source states one.
- If no date at all is stated for an entry, leave start_date and end_date as empty strings rather than inventing one.
- Keep each education entry's qualification/field text concise (a few words) rather than long descriptive sentences, so the whole education list stays compact.

STRICT TRUTH — HIGHEST PRIORITY (overrides every other instruction, including role positioning and tone, whenever they conflict):
- Every headline, summary sentence, skill, strength, competency, certification, achievement and highlight MUST be directly and explicitly supported by the resume text. Do NOT elaborate, stretch, infer, extrapolate, generalise, or add canonical job duties.
- The candidate may have NEVER worked in customer service, bookkeeping, virtual assistance, or marketing. Do NOT state or imply they have performed duties from any of these fields — such as handling client calls, managing books, scheduling, or running campaigns — UNLESS the resume explicitly shows the candidate did that exact work.
- "Transferable" means a skill the resume ACTUALLY evidences that would ALSO be useful in a remote client-facing or administrative role, expressed in the candidate's real terms. It does NOT mean rewriting their background into duties they never performed.
- When in doubt, leave it out. A shorter, fully truthful profile is REQUIRED over a longer embellished one. Never pad a list to look more complete.
- ONE NARROW EXCEPTION to "explicit only": LANGUAGE. If the resume is written in English, you may record "English" as a language even if not stated outright, because writing the resume in English evidences English proficiency. This exception applies to English (or another language the resume is plainly written in) ONLY — never infer any other language.

TONE (apply to professional_summary, recruiter_summary and client_summary, ALWAYS within STRICT TRUTH):
- Write in a WARM, natural, confident, human voice — like a strong professional profile, not a robotic data dump.
- Present the candidate positively as a capable professional whose genuine, demonstrated strengths (communication, organisation, reliability, technical skill, etc.) provide a strong foundation for a remote client-facing or administrative role.
- Avoid stiff or hedging phrasing ("seeks to", "hopes to", "aims to", "no experience", "limited background").

ROLE ORIENTATION (apply ONLY within the bounds of STRICT TRUTH):
- Where the resume genuinely evidences client-facing, communication, organisational, technical, or administrative strengths, you MAY note that these could transfer to a remote customer-service, virtual-assistance, bookkeeping, or marketing-support role.
- NEVER penalise the candidate for lacking a specific industry background, and NEVER write phrases like "no experience" or "limited background". Simply present what is true. Do NOT claim the candidate has experience or training they do not have.

ROLE TARGETING — HIGH PRIORITY (apply ONLY within the bounds of STRICT TRUTH; this replaces generic ROLE ORIENTATION framing whenever an ASSIGNED ROLE(S) list is given in the user message):
- If the user message includes an "ASSIGNED ROLE(S)" list, the professional_summary, recruiter_summary and client_summary MUST speak directly and specifically to the candidate's fit for THOSE role(s) — name the role(s) naturally in the text, rather than writing a generic remote-professional summary that could apply to any candidate.
- If exactly ONE role is listed, the summary should read as a clear case for that specific role, grounded in the candidate's genuinely-evidenced strengths.
- If MORE THAN ONE role is listed, the summary MUST explicitly address the candidate's ability to excel across ALL of the listed roles — do not write a summary that only fits one of them. Call out which real, evidenced strengths support each role, so a client reading it understands the candidate's versatility across the whole set.
- If NO role list is given in the user message (e.g. the candidate has not yet been assigned a role), fall back to the general ROLE ORIENTATION framing above.
- This never overrides STRICT TRUTH: only connect the candidate to a listed role where the resume genuinely evidences a relevant, transferable strength — never claim direct experience in a role the candidate has not held, even if it is in the assigned list.

HEADLINE:
- Reflect the candidate's genuine, strongest professional identity from the resume. If they have actually worked in a relevant role (e.g. customer service, admin, bookkeeping, marketing), use an accurate title from that background.
- If they have not held a directly relevant role, use an honest, general professional headline based on their real background (e.g. their most recent real job title, or a neutral descriptor like "Customer-Focused Professional") — never a role they have not held.
- Keep an existing resume title only if it is accurate. Set headline_present_in_resume true if the resume itself had a headline/title, else false.

PII — CRITICAL:
- The summaries and all text fields you output MUST NOT contain phone numbers, email addresses, home/street address, date of birth, government IDs, or reference contact details. Strip them out. Keep only professional information.

RANK SCORE — HIGH PRIORITY, STRICT TRUTH APPLIES IN FULL:
- You will output the AI resume-quality score as FOUR SEPARATE sub-component values (not a single total — the total is computed downstream by summing these, so each must be independently correct). This score represents this candidate's general professional strength AS EVIDENCED BY THE RESUME ALONE (not tied to any specific job requisition) and is combined with other, separate factors elsewhere (role fit, specific required skills, years-of-experience threshold).
- rank_score_experience_pts (0-5 integer): 0 pts for 0 years, roughly 1 pt per year of genuine customer-facing/administrative/professional-services experience evidenced, capped at 5 pts for 5+ years. Use the same years_relevant_experience value you compute elsewhere in this response.
- rank_score_skills_pts (0-5 integer): count distinct, genuinely evidenced entries across software_skills, core_competencies and transferable_skills combined — 0 pts for none, roughly 1 pt per 2 distinct skills, capped at 5 pts for 10+.
- rank_score_certifications_pts (0-3 integer): 0 pts for none, 1 pt for one genuine certification or quantified achievement, 2 pts for two, 3 pts for three or more — all must be explicitly stated in the resume, never inferred.
- rank_score_completeness_pts (0-2 integer): 2 pts if the resume gives clear work history AND education with real dates and organization names; 1 pt if only one of those is present or dates are mostly missing; 0 pts if the resume is very thin (e.g. only a skills list with no real work/education detail).
- Never inflate any of these to be encouraging — each must reflect only what the resume genuinely evidences, exactly like every other field in this schema. A thin, entry-level resume should score low across these components (that is the correct, honest output, not a failure).
- Do not let ROLE TARGETING or TONE influence these numbers — they are evidence-based arithmetic, not a narrative judgment.

OUTPUT FORMAT — respond with ONLY a single minified JSON object (no markdown, no code fences, no commentary). Use exactly these keys (use empty string / empty array when genuinely absent; do not fabricate):
{
  "headline": string,
  "headline_present_in_resume": boolean,
  "professional_summary": string,
  "recruiter_summary": string,
  "client_summary": string,
  "key_strengths": string[],
  "transferable_skills": string[],
  "core_competencies": string[],
  "communication_skills": string[],
  "software_skills": string[],
  "languages": string[],
  "certifications": string[],
  "achievements": string[],
  "career_highlights": string[],
  "years_relevant_experience": number,
  "rank_score_experience_pts": number,
  "rank_score_skills_pts": number,
  "rank_score_certifications_pts": number,
  "rank_score_completeness_pts": number,
  "work_history": [ { "job_title": string, "organization": string, "start_date": string, "end_date": string, "is_current": boolean, "description": string } ],
  "education": [ { "institution": string, "qualification": string, "field_of_study": string, "start_date": string, "end_date": string } ]
}

GUIDANCE (ALL subject to WORK HISTORY ATTRIBUTION, EDUCATION DATE ACCURACY, STRICT TRUTH, TONE and ROLE TARGETING above):
- professional_summary: 2-3 sentences describing the candidate truthfully from the resume, in a warm and natural voice, presenting their genuinely-evidenced strengths as a strong foundation for the assigned role(s) if given (see ROLE TARGETING), else for a remote client-facing or administrative role in general. No invented duties; no robotic or hedging phrasing.
- recruiter_summary: 2-4 sentence internal overview of the candidate's ACTUAL background and demonstrated strengths, noting honestly how they relate to the assigned role(s) if given, else the kinds of roles ScaleSource places candidates in generally. Warm but candid.
- client_summary: 2-3 sentence polished, warm, client-facing overview shown to hiring clients — reads naturally and confidently, like an employer-friendly profile, targeted to the assigned role(s) if given (see ROLE TARGETING). Truthful and positive, based ONLY on demonstrated strengths. Do NOT fabricate a track record or duties the candidate never performed. PII-free.
- transferable_skills: list ONLY skills the resume actually evidences that are relevant to a remote client-facing / administrative role (or the assigned role(s) if given), named in the candidate's real terms. Do NOT convert them into duties the candidate never performed. If directly-relevant experience is limited, return a short honest list.
- key_strengths / core_competencies: the candidate's strongest attributes AS EVIDENCED by the resume; do not invent.
- communication_skills: client-facing / communication abilities ACTUALLY evidenced by the resume.
- software_skills: software the candidate actually used (record truthfully). If the source lists letter-spaced tool names (e.g. "O p e n A I A P I"), rejoin them into the normal tool name (e.g. "OpenAI API").
- languages: include "English" if the resume is written in English or English proficiency is evident; include any OTHER language ONLY if the resume explicitly states it. Never fabricate languages.
- certifications / achievements / career_highlights: ONLY those explicitly stated in the resume.
- work_history dates: use "YYYY-MM" or "YYYY" when known; use "" if unknown. Set is_current true only if the resume indicates the role is current. Descriptions: 1-3 short factual sentences drawn ONLY from the resume, correctly attributed per WORK HISTORY ATTRIBUTION above; do not invent, reword, or borrow duties from a different job.
- education dates: use "YYYY-MM" whenever the source states a month next to that entry, else bare "YYYY"; use "" if genuinely undated. See EDUCATION DATE ACCURACY above — never borrow a date from a different entry.
- years_relevant_experience: count ONLY genuine customer-facing / administrative / professional-services experience the resume evidences; use 0 if none or undeterminable.
- rank_score_experience_pts / rank_score_skills_pts / rank_score_certifications_pts / rank_score_completeness_pts: see RANK SCORE section above — compute each as arithmetic from the same evidenced facts, each an integer within its own stated range.
- Do NOT include any experience the candidate does not have.
- Keep every text field as concise as the guidance above allows so the full JSON response fits well within budget; never let the JSON itself get cut off.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!GROQ_API_KEY) return json({ error: "missing_groq_key" }, 500);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = req.headers.get("x-resume-hook-secret") ?? "";
  const { data: ok, error: vErr } = await admin.rpc("verify_resume_hook", { p_token: token });
  if (vErr) return json({ error: "auth_check_failed", detail: vErr.message }, 500);
  if (ok !== true) return json({ error: "unauthorized" }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }

  const candidateId = String(body.candidate_id ?? "");
  if (!candidateId) return json({ error: "candidate_id required" }, 400);
  let bucketId = body.bucket_id ? String(body.bucket_id) : "";
  let storagePath = body.storage_path ? String(body.storage_path) : "";

  if (!storagePath) {
    const { data: f } = await admin.from("candidate_files")
      .select("bucket_id, storage_path")
      .eq("candidate_id", candidateId)
      .eq("file_type", "resume")
      .order("created_at", { ascending: false })
      .limit(1).maybeSingle();
    if (!f) return json({ error: "no_resume_found" }, 404);
    bucketId = (f as { bucket_id?: string }).bucket_id || "candidate-resumes";
    storagePath = (f as { storage_path: string }).storage_path;
  }
  if (!bucketId) bucketId = "candidate-resumes";

  // Look up the candidate's currently assigned role(s) so the summary can be targeted to them
  // (see ROLE TARGETING in the system prompt). Always read live from the DB rather than trusting
  // a payload field, so this stays correct regardless of which trigger fired the request.
  let roleTitles: string[] = [];
  try {
    const { data: roleRows } = await admin
      .from("candidate_roles")
      .select("is_primary, job_roles(name)")
      .eq("candidate_id", candidateId);
    const rows = (roleRows ?? []) as Array<{ is_primary: boolean | null; job_roles: { name: string | null } | null }>;
    roleTitles = rows
      .slice()
      .sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0))
      .map((r) => r.job_roles?.name)
      .filter((n): n is string => !!n && n.trim().length > 0);
  } catch {
    roleTitles = [];
  }

  const { data: blob, error: dErr } = await admin.storage.from(bucketId).download(storagePath);
  if (dErr || !blob) return json({ error: "download_failed", detail: dErr?.message ?? null }, 502);

  let text = "";
  let extractionMode = "column-aware";
  try {
    const buf = new Uint8Array(await blob.arrayBuffer());
    const pdf = await getDocumentProxy(buf);
    try {
      // deno-lint-ignore no-explicit-any
      text = await extractOrderedText(pdf as any);
    } catch {
      extractionMode = "fallback";
    }
    if (!text || text.trim().length < 30) {
      extractionMode = "fallback";
      const res = await extractText(pdf, { mergePages: true });
      text = (Array.isArray((res as { text: unknown }).text)
        ? ((res as { text: string[] }).text).join("\n")
        : (res as { text: string }).text) ?? "";
    }
  } catch (e) {
    return json({ error: "extract_failed", detail: String(e) }, 422);
  }
  text = text.replace(/\u0000/g, " ").replace(/[ \t]+/g, " ").trim();
  if (text.length < 30) return json({ error: "empty_or_unreadable_pdf" }, 422);

  const roleContext = roleTitles.length
    ? `ASSIGNED ROLE(S) this candidate is being evaluated for at ScaleSource: ${roleTitles.join(", ")}\n(See ROLE TARGETING in your instructions — tailor professional_summary, recruiter_summary and client_summary to these role(s); if more than one, address the candidate's ability to excel across all of them.)\n\n`
    : "";

  let profile: Record<string, unknown>;
  try {
    const r = await fetch(`${GROQ}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL,
        temperature: 0.1,
        max_completion_tokens: 8000,
        reasoning_effort: "medium",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: roleContext + "RESUME TEXT (source of truth):\n\n" + text.slice(0, 24000) },
        ],
      }),
    });
    if (!r.ok) return json({ error: "groq_error", status: r.status, detail: (await r.text()).slice(0, 400) }, 502);
    const data = await r.json();
    let content = String(data?.choices?.[0]?.message?.content ?? "").trim();
    content = content.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const s = content.indexOf("{");
    const e = content.lastIndexOf("}");
    if (s >= 0 && e > s) content = content.slice(s, e + 1);
    profile = JSON.parse(content);
  } catch (e) {
    return json({ error: "groq_parse_failed", detail: String(e) }, 502);
  }

  // Clamp each rank-score sub-component defensively even though the prompt already bounds them —
  // never trust raw model output for numbers that feed directly into match scoring.
  const clamp = (v: unknown, max: number) => {
    const num = Number(v);
    return Number.isFinite(num) ? Math.min(max, Math.max(0, Math.round(num))) : 0;
  };
  const experiencePts = clamp(profile.rank_score_experience_pts, 5);
  const skillsPts = clamp(profile.rank_score_skills_pts, 5);
  const certificationsPts = clamp(profile.rank_score_certifications_pts, 3);
  const completenessPts = clamp(profile.rank_score_completeness_pts, 2);
  profile.rank_score_experience_pts = experiencePts;
  profile.rank_score_skills_pts = skillsPts;
  profile.rank_score_certifications_pts = certificationsPts;
  profile.rank_score_completeness_pts = completenessPts;
  // rank_score is always the sum of the (clamped) sub-components — computed here, never trusted
  // as a separate model-stated total, so it can never drift from the breakdown shown to staff.
  profile.rank_score = experiencePts + skillsPts + certificationsPts + completenessPts;

  profile.model_version = "groq/" + LLM_MODEL;
  profile.source_file_id = body.file_id ?? null;
  profile.extracted_at = new Date().toISOString();

  const { error: aErr } = await admin.rpc("apply_resume_profile", {
    p_candidate_id: candidateId,
    p_profile: profile,
  });
  if (aErr) return json({ error: "apply_failed", detail: aErr.message }, 500);

  return json({
    ok: true,
    candidate_id: candidateId,
    headline: profile.headline ?? null,
    role_titles: roleTitles,
    rank_score: profile.rank_score,
    rank_score_breakdown: {
      experience_pts: experiencePts,
      skills_pts: skillsPts,
      certifications_pts: certificationsPts,
      completeness_pts: completenessPts,
    },
    languages: profile.languages ?? [],
    counts: {
      work_history: Array.isArray(profile.work_history) ? profile.work_history.length : 0,
      education: Array.isArray(profile.education) ? profile.education.length : 0,
      software_skills: Array.isArray(profile.software_skills) ? profile.software_skills.length : 0,
      languages: Array.isArray(profile.languages) ? profile.languages.length : 0,
    },
  });
});
