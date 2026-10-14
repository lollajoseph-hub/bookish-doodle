// Supabase Edge Function: capture-meeting-notes
// Runs on a schedule (every 30 min, via pg_cron -> pg_net) and:
//  1. Lists recently-created files in interviewschedule@scalesource.com's Google Drive
//     looking for Gemini "Notes by Gemini" docs and Meet recording videos.
//  2. Matches each one to a candidate_matches row whose interview already happened
//     but hasn't had notes/recording captured yet, by checking whether the Drive
//     file's name contains that interview's candidate name and client name (Gemini
//     names notes/recording files after the calendar event title, which we already
//     set to "ScaleSource Interview — {candidate} × {client}" in calendar-sync).
//  3. For a matched notes doc: exports its plain text and stores the text + a
//     view link.
//  4. For a matched recording: grants the client contact's email direct "reader"
//     access to the file (silently, no native Google sharing email — the client
//     finds out via our own UI instead), and stores its view link.
// Auth: x-meeting-capture-hook-secret.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const G_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const G_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const G_REFRESH = Deno.env.get("GOOGLE_REFRESH_TOKEN") ?? "";

// How far back to look for newly-created Drive files each run. Generous window
// (a few hours either side of a 30-minute poll cadence) to tolerate Drive/Gemini
// processing lag after a meeting ends.
const LOOKBACK_HOURS = 6;

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
}

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

type DriveFile = { id: string; name: string; mimeType: string; webViewLink?: string; createdTime?: string };

async function listRecentDriveFiles(accessToken: string, query: string): Promise<DriveFile[]> {
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("q", query);
  url.searchParams.set("fields", "files(id,name,mimeType,webViewLink,createdTime)");
  url.searchParams.set("pageSize", "100");
  url.searchParams.set("orderBy", "createdTime desc");
  const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  const j = await r.json();
  if (!r.ok) throw new Error("drive_list_failed: " + JSON.stringify(j));
  return (j.files ?? []) as DriveFile[];
}

async function exportDocText(accessToken: string, fileId: string): Promise<string> {
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!r.ok) throw new Error(`export_failed_${fileId}: ${await r.text()}`);
  return await r.text();
}

async function shareFileWithReader(accessToken: string, fileId: string, email: string): Promise<void> {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions?sendNotificationEmail=false`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "user", emailAddress: email }),
  });
  if (!r.ok) {
    const detail = await r.text();
    // Already shared is fine — anything else is a real failure.
    if (!detail.includes("already") ) throw new Error(`share_failed_${fileId}: ${detail}`);
  }
}

/** Loose match: does this Drive file's name contain BOTH the candidate's and client's name? */
function nameMatches(fileName: string, candidateName: string | null, clientName: string | null): boolean {
  const n = fileName.toLowerCase();
  const okCandidate = !candidateName || n.includes(candidateName.toLowerCase());
  const okClient = !clientName || n.includes(clientName.toLowerCase());
  return okCandidate && okClient && (!!candidateName || !!clientName);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const token = req.headers.get("x-meeting-capture-hook-secret") ?? "";
  const { data: ok, error: vErr } = await admin.rpc("verify_meeting_capture_hook", { p_token: token });
  if (vErr) return json({ error: "verify_failed", message: vErr.message }, 500);
  if (ok !== true) return json({ error: "unauthorized" }, 401);

  let accessToken: string;
  try { accessToken = await getAccessToken(); }
  catch (e) { return json({ error: "google_auth_failed", message: String(e) }, 502); }

  const { data: pending, error: pErr } = await admin.rpc("get_pending_meeting_captures");
  if (pErr) return json({ error: "pending_lookup_failed", message: pErr.message }, 500);
  const pendingMatches = (pending ?? []) as Array<{
    match_id: string; candidate_name: string | null; client_name: string | null; client_email: string | null;
  }>;
  if (!pendingMatches.length) return json({ status: "noop", pending: 0 });

  const since = new Date(Date.now() - LOOKBACK_HOURS * 3600_000).toISOString();

  let notesFiles: DriveFile[] = [];
  let recordingFiles: DriveFile[] = [];
  try {
    notesFiles = await listRecentDriveFiles(
      accessToken,
      `mimeType='application/vnd.google-apps.document' and name contains 'Notes by Gemini' and createdTime > '${since}' and trashed = false`,
    );
    recordingFiles = await listRecentDriveFiles(
      accessToken,
      `mimeType contains 'video/' and createdTime > '${since}' and trashed = false`,
    );
  } catch (e) {
    return json({ error: "drive_list_failed", message: String(e) }, 502);
  }

  const results: Array<Record<string, unknown>> = [];

  for (const m of pendingMatches) {
    const entry: Record<string, unknown> = { match_id: m.match_id };
    let notesDocUrl: string | null = null;
    let notesText: string | null = null;
    let recordingUrl: string | null = null;

    const notesHit = notesFiles.find((f) => nameMatches(f.name, m.candidate_name, m.client_name));
    if (notesHit) {
      try {
        notesText = await exportDocText(accessToken, notesHit.id);
        notesDocUrl = notesHit.webViewLink ?? null;
        entry.notes_matched = notesHit.name;
      } catch (e) {
        entry.notes_error = String(e);
      }
    }

    const recordingHit = recordingFiles.find((f) => nameMatches(f.name, m.candidate_name, m.client_name));
    if (recordingHit) {
      recordingUrl = recordingHit.webViewLink ?? null;
      entry.recording_matched = recordingHit.name;
      if (m.client_email) {
        try {
          await shareFileWithReader(accessToken, recordingHit.id, m.client_email);
        } catch (e) {
          entry.share_error = String(e);
        }
      }
    }

    if (notesDocUrl || recordingUrl) {
      const { error: aErr } = await admin.rpc("apply_meeting_capture", {
        p_match: m.match_id,
        p_notes_doc_url: notesDocUrl,
        p_notes_text: notesText,
        p_recording_url: recordingUrl,
      });
      if (aErr) entry.apply_error = aErr.message;
      else entry.applied = true;
    } else {
      entry.applied = false;
    }
    results.push(entry);
  }

  return json({ status: "done", pending: pendingMatches.length, results });
});
