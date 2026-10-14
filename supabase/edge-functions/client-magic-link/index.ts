import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Public (unauthenticated) magic-link login for EXISTING clients.
// Frontend: login.tsx's "email me a secure login link" form invokes this
// with { email }. To avoid account enumeration, when the email simply
// doesn't match any client account we still return ok:true (same generic
// success the frontend already shows: "If your email is registered with a
// client company, a secure login link has been sent."). Genuine
// infrastructure failures (missing RESEND_API_KEY, Resend API errors,
// generateLink errors) return a real error instead, so failures are visible
// and debuggable rather than silently swallowed.
//
// Staff (admin/recruiter) accounts are never covered here - they always use
// standard email/password login.
//
// The email links straight to Supabase's own /auth/v1/verify redirect
// (linkData.properties.action_link from generateLink), which on click
// verifies the token server-side and 302s the browser to redirectTo with
// the session already established - the client picks it up automatically
// via supabase-js's default detectSessionInUrl:true, landing signed-in on
// /requests. No separate callback route needed.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const APP_URL = (
  Deno.env.get("CLIENT_APP_URL") ||
  "https://id-preview--9bb87a23-4c8e-4915-a47e-592e80a787d2.lovable.app"
).replace(/\/$/, "");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(b: unknown, st = 200) {
  return new Response(JSON.stringify(b), { status: st, headers: { ...cors, "Content-Type": "application/json" } });
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const LOGO_URL =
  "https://kjpozzjeddvctcabtnzg.supabase.co/storage/v1/object/public/brand-assets/scalesource-logo-transparent.png";
const BRAND_PURPLE = "#7A59A3";
const BRAND_PURPLE_DARK = "#5C4080";
const BRAND_PURPLE_LIGHT = "#F1EDF5";
const INK = "#1F2937";
const MUTED = "#64748B";

function renderEmail(actionLink: string) {
  const safeLink = escapeHtml(actionLink);
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
                <h2 style="color:${INK}; font-size:20px; line-height:1.3; margin:0 0 12px 0;">Your secure login link</h2>
                <p style="color:${MUTED}; font-size:15px; line-height:1.6; margin:0 0 24px 0;">
                  Click the button below to sign in to your Candidate Pool account. This link expires shortly and can only be used once.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 0 8px 0;">
                  <tr>
                    <td style="border-radius:8px; background-color:${BRAND_PURPLE};">
                      <a href="${safeLink}" style="display:inline-block; padding:12px 24px; color:#ffffff; font-size:15px; font-weight:600; text-decoration:none;">Sign in to Candidate Pool</a>
                    </td>
                  </tr>
                </table>
                <p style="color:${MUTED}; font-size:12px; line-height:1.5; margin:16px 0 0 0;">
                  If you didn't request this, you can safely ignore this email.
                </p>
              </td>
            </tr>
            <tr>
              <td style="background-color:${BRAND_PURPLE_DARK}; padding: 20px 32px;">
                <p style="color:#ffffff; font-size:13px; font-weight:600; margin:0 0 4px 0;">ScaleSource Candidates</p>
                <p style="color:#D8CCE6; font-size:12px; line-height:1.5; margin:0;">
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
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();
    if (!email) return json({ error: "Email is required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // No matching client account: return the same generic success the
    // frontend already shows, so we never confirm/deny which emails exist.
    const { data: profile } = await admin
      .from("profiles")
      .select("id, role")
      .eq("email", email)
      .maybeSingle();
    if (!profile?.id || profile.role !== "client") {
      return json({ ok: true });
    }

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: `${APP_URL}/requests` },
    });
    if (linkErr || !linkData?.properties?.action_link) {
      console.error("generateLink failed", linkErr);
      return json({ error: `Couldn't generate a login link: ${linkErr?.message ?? "unknown error"}` }, 500);
    }

    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY not set - cannot send magic link email");
      return json({ error: "Email sending isn't configured" }, 500);
    }

    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: "ScaleSource Candidates <noreply@scalesource.com>",
        to: [email],
        subject: "Your secure login link",
        html: renderEmail(linkData.properties.action_link),
      }),
    });
    if (!resendResp.ok) {
      const errText = await resendResp.text();
      console.error("Resend send failed:", resendResp.status, errText);
      return json({ error: "Couldn't send the login link email" }, 502);
    }

    return json({ ok: true });
  } catch (e) {
    console.error("client-magic-link error", e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
