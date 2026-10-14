import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const HOOK_SECRET = Deno.env.get("NOTIFICATION_HOOK_SECRET") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const LOGO_URL =
  "https://kjpozzjeddvctcabtnzg.supabase.co/storage/v1/object/public/brand-assets/scalesource-logo-transparent.png";
const BRAND_PURPLE = "#7A59A3";
const BRAND_PURPLE_DARK = "#5C4080";
const BRAND_PURPLE_LIGHT = "#F1EDF5";
const INK = "#1F2937";
const MUTED = "#64748B";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderEmail(title: string, message: string) {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message ?? "").replace(/\n/g, "<br/>");

  return `<!doctype html>
<html>
  <body style="margin:0; padding:0; background-color:${BRAND_PURPLE_LIGHT}; font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND_PURPLE_LIGHT}; padding: 32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:480px; background-color:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #E7E1EF;">
            <!-- Header -->
            <tr>
              <td align="center" style="background-color:#ffffff; padding: 28px 24px 20px 24px; border-bottom: 1px solid #F0ECF5;">
                <img src="${LOGO_URL}" width="140" alt="ScaleSource" style="display:block; max-width:140px; height:auto;" />
              </td>
            </tr>
            <!-- Body -->
            <tr>
              <td style="padding: 28px 32px 8px 32px;">
                <p style="color:${BRAND_PURPLE}; font-size:11px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; margin:0 0 10px 0;">
                  Candidate Pool Review System
                </p>
                <h2 style="color:${INK}; font-size:20px; line-height:1.3; margin:0 0 12px 0;">${safeTitle}</h2>
                <p style="color:${MUTED}; font-size:15px; line-height:1.6; margin:0 0 24px 0;">${safeMessage}</p>
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td style="background-color:${BRAND_PURPLE_DARK}; padding: 20px 32px;">
                <p style="color:#ffffff; font-size:13px; font-weight:600; margin:0 0 4px 0;">ScaleSource Candidates</p>
                <p style="color:#D8CCE6; font-size:12px; line-height:1.5; margin:0;">
                  You're receiving this because you have an account on the Candidate Pool Review System.
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

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const hookSecret = req.headers.get("x-hook-secret");
  if (!HOOK_SECRET || hookSecret !== HOOK_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }

  let notificationId: string | undefined;
  try {
    const body = await req.json();
    notificationId = body.notification_id;
  } catch {
    return json({ error: "invalid body" }, 400);
  }
  if (!notificationId) return json({ error: "missing notification_id" }, 400);

  const { data: notification, error: notifError } = await supabase
    .from("notifications")
    .select("id, recipient_id, title, message, type, email_sent_at")
    .eq("id", notificationId)
    .single();

  if (notifError || !notification) {
    return json({ error: "notification not found" }, 404);
  }

  if (notification.email_sent_at) {
    return json({ ok: true, skipped: "already sent" });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("id", notification.recipient_id)
    .single();

  if (profileError || !profile?.email) {
    return json({ error: "recipient not found" }, 404);
  }

  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY not set - cannot send email");
    return json({ error: "email not configured" }, 500);
  }

  const html = renderEmail(notification.title, notification.message ?? "");

  const resendResp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "ScaleSource Candidates <noreply@scalesource.com>",
      to: [profile.email],
      subject: notification.title,
      html,
    }),
  });

  if (!resendResp.ok) {
    const errText = await resendResp.text();
    console.error("Resend send failed:", resendResp.status, errText);
    return json({ error: "send failed", detail: errText }, 502);
  }

  await supabase
    .from("notifications")
    .update({ email_sent_at: new Date().toISOString() })
    .eq("id", notificationId);

  return json({ ok: true });
});
