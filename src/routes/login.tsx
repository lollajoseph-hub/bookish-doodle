import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import whiteBrandLogo from "@/assets/scalesource-logo-white.png.asset.json";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Candidate Pool" },
      { name: "description", content: "Sign in to review your matched candidates and hiring requests." },
      { property: "og:title", content: "Sign in — Candidate Pool" },
      { property: "og:description", content: "Sign in to review your matched candidates and hiring requests." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { signIn, user, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [magicOpen, setMagicOpen] = useState(false);
  const [magicEmail, setMagicEmail] = useState("");
  const [magicBusy, setMagicBusy] = useState(false);
  const [magicSent, setMagicSent] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/requests" });
  }, [loading, user, navigate]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-primary text-primary-foreground">
      <div aria-hidden="true" className="login-panel-artwork">
        <span className="login-panel-arc login-panel-arc-one" /><span className="login-panel-arc login-panel-arc-two" />
        <span className="login-panel-arc login-panel-arc-three" /><span className="login-panel-line login-panel-line-one" />
        <span className="login-panel-line login-panel-line-two" /><span className="login-panel-plane" />
      </div>
      <div className="relative z-10 flex min-h-screen items-center justify-center p-5 sm:p-8 lg:p-12">
        <main className="login-card-amber-border relative grid w-full max-w-6xl overflow-hidden rounded-2xl bg-primary-dark/45 shadow-2xl backdrop-blur-md lg:min-h-[620px] lg:grid-cols-[1.05fr_0.95fr] lg:gap-6">
          <div aria-hidden="true" className="login-panel-artwork login-card-artwork">
            <span className="login-panel-arc login-panel-arc-one" /><span className="login-panel-arc login-panel-arc-two" />
            <span className="login-panel-arc login-panel-arc-three" /><span className="login-panel-line login-panel-line-one" />
            <span className="login-panel-line login-panel-line-two" /><span className="login-panel-plane" />
          </div>
          <section className="login-panel-enter relative z-10 flex min-h-[300px] flex-col justify-between p-7 sm:p-10 lg:min-h-0 lg:px-16 lg:py-12">
            <img src={whiteBrandLogo.url} alt="ScaleSource" className="h-5 w-auto max-w-full self-start object-contain" />
            <div className="max-w-lg py-10 lg:py-8">
              <h1 className="text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">Welcome back</h1>
              <p className="mt-6 max-w-md text-primary-foreground/75">Track your hiring requests, review matched candidates, and move great people forward.</p>
            </div>
            <p className="text-xs text-primary-foreground/60">ScaleSource Candidate Pool</p>
          </section>
          <section className="relative z-10 flex items-center justify-center p-6 sm:p-10 lg:px-14 lg:py-12">
            <div className="login-form-enter w-full max-w-md rounded-2xl border border-primary-foreground/20 bg-primary-foreground/10 p-8 shadow-xl backdrop-blur-xl sm:p-10">
              <h2 className="text-xl font-semibold leading-tight text-primary-foreground">Sign in to Candidate Pool</h2>
              <p className="mt-1 text-sm text-primary-foreground/65">Manage your requests and candidates.</p>
          <form
            className="mt-6 space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const { error } = await signIn(email.trim(), password);
              setBusy(false);
              if (error) toast.error(error);
              else navigate({ to: "/requests" });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-primary-foreground">Email</Label>
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="border-primary-foreground/25 bg-primary-foreground/10 text-primary-foreground placeholder:text-primary-foreground/50 focus-visible:ring-primary-foreground/60" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-primary-foreground">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="border-primary-foreground/25 bg-primary-foreground/10 pr-10 text-primary-foreground focus-visible:ring-primary-foreground/60"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-primary-foreground/65 hover:text-primary-foreground"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" disabled={busy} className="login-submit-button w-full">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}{busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <div className="mt-6 border-t border-primary-foreground/15 pt-4">
            {!magicOpen ? (
              <button
                type="button"
                onClick={() => {
                  setMagicOpen(true);
                  setMagicSent(false);
                  setMagicEmail(email);
                }}
                className="w-full text-center text-sm text-primary-foreground/80 hover:text-primary-foreground hover:underline"
              >
                Already submitted a request? Email me a secure login link
              </button>
            ) : magicSent ? (
              <p className="text-center text-sm text-primary-foreground/70">
                If your email is registered with a client company, a secure login link has been sent.
              </p>
            ) : (
              <form
                className="space-y-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setMagicBusy(true);
                  let sendFailed = false;
                  try {
                    const { error } = await supabase.functions.invoke("client-magic-link", {
                      body: { email: magicEmail.trim().toLowerCase() },
                    });
                    if (error) {
                      sendFailed = true;
                      toast.error(
                        "We couldn't send the login link right now. Please try again shortly, or contact support if this keeps happening.",
                      );
                    }
                  } catch {
                    sendFailed = true;
                    toast.error("Network error. Please try again.");
                  }
                  setMagicBusy(false);
                  if (!sendFailed) setMagicSent(true);
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="magic-email" className="text-primary-foreground">Email</Label>
                  <Input
                    id="magic-email"
                    type="email"
                    value={magicEmail}
                    onChange={(e) => setMagicEmail(e.target.value)}
                    required
                    className="border-primary-foreground/25 bg-primary-foreground/10 text-primary-foreground focus-visible:ring-primary-foreground/60"
                  />
                </div>
                <Button type="submit" disabled={magicBusy} className="login-submit-button w-full">
                  {magicBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}{magicBusy ? "Sending…" : "Send login link"}
                </Button>
              </form>
            )}
          </div>

          <div className="mt-4 text-center text-sm">
            <Link to="/get-started" className="text-primary-foreground/80 hover:text-primary-foreground hover:underline">
              New company? Submit a hiring request →
            </Link>
          </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
