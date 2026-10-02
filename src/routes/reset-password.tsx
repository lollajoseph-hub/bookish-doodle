import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set your password — Candidate Pool" },
      { name: "description", content: "Choose a password for your Candidate Pool account." },
      { property: "og:title", content: "Set your password — Candidate Pool" },
      { property: "og:description", content: "Choose a password for your Candidate Pool account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

type Phase = "verifying" | "ready" | "invalid" | "done";

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("verifying");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  // Establish the recovery/invite session from whatever form the email link used.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const url = new URL(window.location.href);
      const query = url.searchParams;
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));

      try {
        const code = query.get("code");
        const tokenHash = query.get("token_hash") ?? hash.get("token_hash");
        const type = (query.get("type") ?? hash.get("type")) as
          | "recovery"
          | "invite"
          | "signup"
          | "magiclink"
          | null;

        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        } else if (tokenHash && type) {
          await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        }
        // Implicit-flow links (#access_token=…) are consumed automatically by the
        // Supabase client via detectSessionInUrl, so nothing extra is needed there.

        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        setPhase(data.session ? "ready" : "invalid");
      } catch {
        if (!cancelled) setPhase("invalid");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Those passwords don't match.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }
    // The invite/recovery link already established a session — go straight into the app.
    setBusy(false);
    setPhase("done");
    setTimeout(() => navigate({ to: "/requests", replace: true }), 1800);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="card-amber w-full max-w-md rounded-[30px]">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-[0_14px_30px_-12px_rgb(67_24_103/0.7)]">
            {phase === "done" ? <CheckCircle2 className="h-6 w-6" /> : <Users className="h-6 w-6" />}
          </div>
          <CardTitle>
            {phase === "done" ? "Password set" : phase === "invalid" ? "Link expired" : "Set your password"}
          </CardTitle>
          <CardDescription>
            {phase === "verifying" && "Checking your link…"}
            {phase === "ready" && "Choose a password to finish setting up your account."}
            {phase === "invalid" &&
              "This link is no longer valid. Request a new one from the sign-in page."}
            {phase === "done" && "Taking you to your requests…"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {phase === "ready" && (
            <form className="space-y-4" onSubmit={submit}>
              <div className="space-y-1.5">
                <Label htmlFor="new-password">New password</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={show ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={show ? "Hide password" : "Show password"}
                    aria-pressed={show}
                    onClick={() => setShow((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">At least 8 characters.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input
                  id="confirm-password"
                  type={show ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  minLength={8}
                  required
                />
              </div>
              <Button type="submit" disabled={busy} className="h-11 w-full">
                {busy ? "Saving…" : "Set password"}
              </Button>
            </form>
          )}

          {(phase === "invalid" || phase === "done") && (
            <div className="text-center text-sm">
              <Link to={phase === "done" ? "/requests" : "/login"} className="text-primary hover:underline">
                {phase === "done" ? "Go to your requests →" : "Go to sign in →"}
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
