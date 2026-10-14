// Supabase Edge Function: calendar-sync
// Reflects Candidate Pool interview state onto the dedicated interviewschedule@scalesource.com
// Google Calendar (one-way; app is source of truth). Fired by the trg_calendar_sync
// trigger via pg_net on interview_confirmed (create/patch) and cancellation.
//
// GATEKEEPING (v2 — split events): the client and candidate are NEVER put on the SAME
// Calendar event together, so neither ever sees the other's email address, even in the
// raw invite email / .ics attachment (which still lists every attendee's email regardless
// of the guestsCanSeeOtherGuests flag — that flag only hides the list inside the Google
// Calendar UI, it does not redact the .ics). Instead of one shared event, TWO real events
// are created, both organized by the recruiter's calendar and both pointing at the SAME
// Google Meet link:
//   - "client event"    -> attendees: recruiter + client contact
//   - "candidate event" -> attendees: recruiter + candidate
// Each invitee only ever appears alongside the recruiter (who already knows both parties),
// giving both a genuine Calendar invite with a proper timeZone field, so Google itself
// converts the displayed time to each invitee's own local settings automatically — the
// same behavior Calendar already gave the recruiter, now extended to the other two.
// The existing branded ScaleSource emails (with the Meet link + a plain-text local time)
// are sent on top of this, unchanged in spirit.
// Auth: x-calendar-hook-secret.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const G_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const G_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const G_REFRESH = Deno.env.get("GOOGLE_REFRESH_TOKEN") ?? "";
const G_CAL = Deno.env.get("GOOGLE_CALENDAR_ID") ?? "primary";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const DURATION_MIN = 45;

const LOGO_URL =
  "https://kjpozzjeddvctcabtnzg.supabase.co/storage/v1/object/public/brand-assets/scalesource-logo-transparent.png";
const BRAND_PURPLE = "#7A59A3";
const BRAND_PURPLE_DARK = "#5C4080";
const BRAND_PURPLE_LIGHT = "#F1EDF5";
const INK = "#1F2937";
const MUTED = "#64748B";

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInviteEmail(title: string, bodyLines: string[], meetUrl?: string | null) {
  const safeTitle = escapeHtml(title);
  const safeBody = bodyLines.map((l) => `<p style="color:${MUTED}; font-size:15px; line-height:1.6; margin:0 0 12px 0;">${escapeHtml(l)}</p>`).join("");
  const button = meetUrl
    ? `<a href="${meetUrl}" style="display:inline-block; margin-top:8px; background-color:${BRAND_PURPLE}; color:#ffffff; text-decoration:none; font-size:14px; font-weight:600; padding:12px 20px; border-radius:8px;">Join Google Meet</a>`
    : "";
  return `<!doctype html>
<html>
  <body style="margin:0; padding:0; background-color:${BRAND_PURPLE_LIGHT}; font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND_PURPLE_LIGHT}; padding: 32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:480px; background-color:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #E7E1EF;">
            <tr>
              <td align="center" style="background-color:#ffffff; padding: 28px 24px 20px 24px; border-bottom: 1px solid #F0ECF5;">
                <img src="${LOGO_URL}" width="140" alt="ScaleSource" style="display:block; max-width:140px; height:auto;" />
              </td>
            </tr>
            <tr>
              <td style="padding: 28px 32px 8px 32px;">
                <p style="color:${BRAND_PURPLE}; font-size:11px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; margin:0 0 10px 0;">
                  Candidate Pool Review System
                </p>
                <h2 style="color:${INK}; font-size:20px; line-height:1.3; margin:0 0 12px 0;">${safeTitle}</h2>
                ${safeBody}
                ${button}
              </td>
            </tr>
            <tr>
              <td style="background-color:${BRAND_PURPLE_DARK}; padding: 20px 32px; margin-top:20px;">
                <p style="color:#ffffff; font-size:13px; font-weight:600; margin:0 0 4px 0;">ScaleSource Candidates</p>
                <p style="color:#D8CCE6; font-size:12px; line-height:1.5; margin:0;">
                  Please coordinate any changes through your ScaleSource recruiter — do not contact other guests directly.
                  Questions? Reach us at
                  <a href="mailto:team@scalesource.com" style="color:#ffffff; text-decoration:underline;">team@scalesource.com</a>.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendInviteEmail(to: string, subject: string, bodyLines: string[], meetUrl?: string | null) {
  if (!RESEND_API_KEY || !to || !to.includes("@")) return { skipped: true, reason: !RESEND_API_KEY ? "no_api_key" : "bad_recipient" };
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: "ScaleSource Candidates <noreply@scalesource.com>",
        to: [to],
        subject,
        html: renderInviteEmail(subject, bodyLines, meetUrl),
      }),
    });
    const respText = await resp.text();
    if (!resp.ok) { console.error("invite email send failed:", resp.status, respText); return { skipped: false, ok: false, status: resp.status, body: respText }; }
    return { skipped: false, ok: true, status: resp.status, body: respText };
  } catch (e) {
    console.error("invite email send threw:", String(e));
    return { skipped: false, ok: false, threw: String(e) };
  }
}

function formatInTimezone(date: Date, tz: string | null | undefined) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz || "UTC",
      weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
    }).format(date) + (tz ? ` (${tz})` : " UTC");
  } catch {
    return date.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  }
}

const calBase = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(G_CAL)}/events`;

async function getAccessToken(): Promise<string> {
  const body = new URLSearchParams({
    client_id: G_CLIENT_ID, client_secret: G_CLIENT_SECRET,
    refresh_token: G_REFRESH, grant_type: "refresh_token",
  });
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error("token_exchange_failed: " + JSON.stringify(j));
  return j.access_token as string;
}

/** Minimal shape of the reusable parts of a created conference, copied verbatim onto the second event. */
type ReusableConferenceData = {
  conferenceId?: string;
  conferenceSolution?: unknown;
  entryPoints?: unknown;
};

function reusableConferenceData(cj: { conferenceData?: ReusableConferenceData }): ReusableConferenceData | undefined {
  const cd = cj.conferenceData;
  if (!cd || !cd.conferenceId) return undefined;
  return {
    conferenceId: cd.conferenceId,
    conferenceSolution: cd.conferenceSolution,
    entryPoints: cd.entryPoints,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const token = req.headers.get("x-calendar-hook-secret") ?? "";
  const { data: ok, error: vErr } = await admin.rpc("verify_calendar_hook", { p_token: token });
  if (vErr) return json({ error: "verify_failed", message: vErr.message }, 500);
  if (ok !== true) return json({ error: "unauthorized" }, 401);

  let payload: any = {};
  try { payload = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const action = String(payload.action ?? "");

  let accessToken: string;
  try { accessToken = await getAccessToken(); }
  catch (e) { return json({ error: "google_auth_failed", message: String(e) }, 502); }
  const gh = { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" };

  // SELFTEST — verifies token + calendar write + Meet creation. No attendees, no emails; auto-deletes.
  if (action === "selftest") {
    const start = new Date(Date.now() + 3600_000);
    const end = new Date(start.getTime() + 15 * 60000);
    const body = {
      summary: "ScaleSource calendar self-test (auto-deleted)",
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
      conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } },
    };
    const cr = await fetch(`${calBase}?conferenceDataVersion=1&sendUpdates=none`, { method: "POST", headers: gh, body: JSON.stringify(body) });
    const cj = await cr.json();
    if (!cr.ok) return json({ error: "calendar_create_failed", detail: cj }, 502);
    await fetch(`${calBase}/${cj.id}?sendUpdates=none`, { method: "DELETE", headers: gh });
    return json({ status: "selftest_ok", calendar: G_CAL, meet_created: !!cj.hangoutLink, event_id: cj.id });
  }

  // INSPECT — read-only: returns the gatekeeping flags stored on a given event (no writes, no emails).
  if (action === "inspect") {
    const eventId = String(payload.event_id ?? "");
    if (!eventId) return json({ error: "event_id required" }, 400);
    const gr = await fetch(`${calBase}/${encodeURIComponent(eventId)}`, { headers: gh });
    const gj = await gr.json();
    if (!gr.ok) return json({ error: "fetch_failed", detail: gj }, 502);
    return json({
      status: "inspected",
      summary: gj.summary ?? null,
      description: gj.description ?? null,
      guestsCanSeeOtherGuests: gj.guestsCanSeeOtherGuests ?? null,
      guestsCanInviteOthers: gj.guestsCanInviteOthers ?? null,
      guestsCanModify: gj.guestsCanModify ?? null,
      attendee_emails: Array.isArray(gj.attendees) ? gj.attendees.map((a: any) => a.email) : [],
      attendee_count: Array.isArray(gj.attendees) ? gj.attendees.length : 0,
      organizer: gj.organizer?.email ?? null,
      has_meet: !!gj.hangoutLink,
    });
  }

  const match_id = String(payload.match_id ?? "");
  if (!match_id) return json({ error: "match_id required" }, 400);

  const { data: p, error: pErr } = await admin.rpc("get_interview_calendar_payload", { p_match: match_id });
  if (pErr) return json({ error: "payload_failed", message: pErr.message }, 500);
  if (!p) return json({ error: "match_not_found" }, 404);

  async function deleteEventIfPresent(eventId: string | null | undefined) {
    if (!eventId) return;
    const dr = await fetch(`${calBase}/${eventId}?sendUpdates=all`, { method: "DELETE", headers: gh });
    if (!dr.ok && dr.status !== 404 && dr.status !== 410) {
      throw new Error(`calendar_cancel_failed: ${await dr.text()}`);
    }
  }

  if (action === "cancel") {
    const hadEvents = !!(p.client_event_id || p.candidate_event_id);
    try {
      await deleteEventIfPresent(p.client_event_id);
      await deleteEventIfPresent(p.candidate_event_id);
    } catch (e) {
      return json({ error: "calendar_cancel_failed", detail: String(e) }, 502);
    }
    if (hadEvents) {
      await admin.rpc("apply_calendar_event", {
        p_match: match_id, p_client_event_id: null, p_candidate_event_id: null, p_meet_url: null,
      });
    }
    const cancelSubject = `Interview cancelled — ${p.role_title ?? "ScaleSource role"}`;
    await Promise.all([
      sendInviteEmail(p.candidate_email, cancelSubject, [
        `Your interview for ${p.role_title ?? "this role"} has been cancelled.`,
        "Your ScaleSource recruiter will follow up with next steps.",
      ]),
      sendInviteEmail(p.client_email, cancelSubject, [
        `The interview with ${p.candidate_name ?? "the candidate"} has been cancelled.`,
        "Your ScaleSource recruiter will follow up with next steps.",
      ]),
    ]);
    return json({ status: hadEvents ? "cancelled" : "noop_no_event" });
  }

  if (!p.start) return json({ error: "no_interview_time" }, 400);
  const start = new Date(p.start);
  // Booked slots carry their own length; everything else keeps the original 45 minutes.
  const durationMin = typeof p.duration_minutes === "number" && p.duration_minutes > 0 ? p.duration_minutes : DURATION_MIN;
  const end = new Date(start.getTime() + durationMin * 60000);
  const tz = p.timezone || "UTC";
  const descLines = [
    `Role: ${p.role_title ?? "Candidate role"}`,
    p.client_name ? `Client: ${p.client_name}` : null,
    p.candidate_name ? `Candidate: ${p.candidate_name}` : null,
    p.mode ? `Mode: ${p.mode}` : null,
    "",
    "Scheduled via ScaleSource. Please coordinate any changes through your ScaleSource recruiter — do not contact other guests directly.",
  ].filter((x) => x !== null);

  const recruiterAttendee = typeof p.recruiter_email === "string" && p.recruiter_email.includes("@")
    ? [{ email: p.recruiter_email }] : [];
  const clientAttendees = [
    ...recruiterAttendee,
    ...(typeof p.client_email === "string" && p.client_email.includes("@") ? [{ email: p.client_email }] : []),
  ];
  const candidateAttendees = [
    ...recruiterAttendee,
    ...(typeof p.candidate_email === "string" && p.candidate_email.includes("@") ? [{ email: p.candidate_email }] : []),
  ];

  async function notifyCandidateAndClient(meetUrl: string | null, verb: "scheduled" | "rescheduled") {
    const subject = `Interview ${verb} — ${p.role_title ?? "ScaleSource role"}`;
    const [candResult, clientResult] = await Promise.all([
      sendInviteEmail(
        p.candidate_email,
        subject,
        [
          `Your interview for ${p.role_title ?? "this role"} is ${verb} for ${formatInTimezone(start, p.timezone)}.`,
          "You've also been sent a Google Calendar invite for this meeting — it will show automatically in your own local time.",
          "Join using the button below at the scheduled time.",
        ],
        meetUrl,
      ),
      sendInviteEmail(
        p.client_email,
        subject,
        [
          `Your interview with ${p.candidate_name ?? "the candidate"} for ${p.role_title ?? "this role"} is ${verb} for ${formatInTimezone(start, p.client_timezone ?? null)}.`,
          "You've also been sent a Google Calendar invite for this meeting — it will show automatically in your own local time.",
          "Join using the button below at the scheduled time.",
        ],
        meetUrl,
      ),
    ]);
    console.log("notifyCandidateAndClient results:", JSON.stringify({ candResult, clientResult }));
    return { candResult, clientResult };
  }

  if (action === "create") {
    // 1. Client event first — this one requests a NEW Meet conference.
    const clientBody = {
      summary: `ScaleSource Interview — ${p.candidate_name ?? "Candidate"} × ${p.client_name ?? "Client"}`,
      description: descLines.join("\n"),
      start: { dateTime: start.toISOString(), timeZone: tz },
      end: { dateTime: end.toISOString(), timeZone: tz },
      attendees: clientAttendees,
      guestsCanSeeOtherGuests: false,
      guestsCanInviteOthers: false,
      guestsCanModify: false,
      conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } },
      reminders: { useDefault: true },
    };
    const cr1 = await fetch(`${calBase}?conferenceDataVersion=1&sendUpdates=all`, { method: "POST", headers: gh, body: JSON.stringify(clientBody) });
    const cj1 = await cr1.json();
    if (!cr1.ok) return json({ error: "calendar_create_failed", detail: cj1, which: "client" }, 502);

    // 2. Candidate event — reuses the SAME conference (no createRequest), so it's the same Meet room.
    const reused = reusableConferenceData(cj1);
    const candidateBody = {
      summary: `ScaleSource Interview — ${p.candidate_name ?? "Candidate"} × ${p.client_name ?? "Client"}`,
      description: descLines.join("\n"),
      start: { dateTime: start.toISOString(), timeZone: tz },
      end: { dateTime: end.toISOString(), timeZone: tz },
      attendees: candidateAttendees,
      guestsCanSeeOtherGuests: false,
      guestsCanInviteOthers: false,
      guestsCanModify: false,
      ...(reused ? { conferenceData: reused } : {}),
      reminders: { useDefault: true },
    };
    const cr2 = await fetch(`${calBase}?conferenceDataVersion=1&sendUpdates=all`, { method: "POST", headers: gh, body: JSON.stringify(candidateBody) });
    const cj2 = await cr2.json();
    if (!cr2.ok) {
      // Roll back the client event so we don't leave an orphaned half-scheduled interview.
      await deleteEventIfPresent(cj1.id).catch(() => {});
      return json({ error: "calendar_create_failed", detail: cj2, which: "candidate" }, 502);
    }

    const meetUrl = cj1.hangoutLink ?? cj2.hangoutLink ?? null;
    await admin.rpc("apply_calendar_event", {
      p_match: match_id, p_client_event_id: cj1.id, p_candidate_event_id: cj2.id, p_meet_url: meetUrl,
    });
    const emailResults = await notifyCandidateAndClient(meetUrl, "scheduled");
    return json({ status: "created", client_event_id: cj1.id, candidate_event_id: cj2.id, meet: meetUrl, email_results: emailResults });
  }

  if (action === "patch") {
    if (!p.client_event_id && !p.candidate_event_id) return json({ error: "no_event_to_patch" }, 400);

    const commonPatch = {
      summary: `ScaleSource Interview — ${p.candidate_name ?? "Candidate"} × ${p.client_name ?? "Client"}`,
      description: descLines.join("\n"),
      start: { dateTime: start.toISOString(), timeZone: tz },
      end: { dateTime: end.toISOString(), timeZone: tz },
      guestsCanSeeOtherGuests: false,
    };

    let clientEventId = p.client_event_id ?? null;
    let candidateEventId = p.candidate_event_id ?? null;
    let meetUrl: string | null = p.meet_url ?? null;

    if (clientEventId) {
      const ur = await fetch(`${calBase}/${clientEventId}?conferenceDataVersion=1&sendUpdates=all`, {
        method: "PATCH", headers: gh, body: JSON.stringify({ ...commonPatch, attendees: clientAttendees }),
      });
      const uj = await ur.json();
      if (!ur.ok) return json({ error: "calendar_patch_failed", detail: uj, which: "client" }, 502);
      clientEventId = uj.id;
      meetUrl = uj.hangoutLink ?? meetUrl;
    }
    if (candidateEventId) {
      const ur = await fetch(`${calBase}/${candidateEventId}?conferenceDataVersion=1&sendUpdates=all`, {
        method: "PATCH", headers: gh, body: JSON.stringify({ ...commonPatch, attendees: candidateAttendees }),
      });
      const uj = await ur.json();
      if (!ur.ok) return json({ error: "calendar_patch_failed", detail: uj, which: "candidate" }, 502);
      candidateEventId = uj.id;
      meetUrl = uj.hangoutLink ?? meetUrl;
    }

    await admin.rpc("apply_calendar_event", {
      p_match: match_id, p_client_event_id: clientEventId, p_candidate_event_id: candidateEventId, p_meet_url: meetUrl,
    });
    const emailResults = await notifyCandidateAndClient(meetUrl, "rescheduled");
    return json({ status: "patched", client_event_id: clientEventId, candidate_event_id: candidateEventId, meet: meetUrl, email_results: emailResults });
  }

  return json({ error: "unknown_action", action }, 400);
});
