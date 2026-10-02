import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import whiteBrandLogo from "@/assets/scalesource-logo-white.png.asset.json";
import { AuroraBackdrop, SplitWords, useEntrance, useGlare, useMagnetic } from "@/lib/motion";

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

type Mode = "password" | "magic" | "reset";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function LoginPage() {
  const { signIn, user, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  // password: normal sign in. magic: secure login link (client-magic-link edge function).
  // reset: password reset email (addition approved by the owner; same call as the staff app's /forgot-password).
  const [mode, setMode] = useState<Mode>("password");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [emailError, setEmailError] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const scope = useEntrance<HTMLDivElement>();
  const glare = useGlare<HTMLDivElement>();
  const submitRef = useMagnetic<HTMLButtonElement>();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/requests" });
  }, [loading, user, navigate]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setSentTo(null);
    setPasswordError(false);
  };

  const title = mode === "reset" ? "Reset password" : "Sign in";
  const lede = mode === "reset" ? "We'll email you a link to choose a new one." : "Review your requests and candidates.";
  const submitLabel = mode === "reset" ? "Email me a reset link" : mode === "magic" ? "Email me a link" : "Sign in";
  const busyLabel = mode === "password" ? "Signing in…" : "Sending…";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    const badEmail = !EMAIL_PATTERN.test(trimmed);
    const badPassword = mode === "password" && password.length === 0;
    setEmailError(badEmail);
    setPasswordError(badPassword);
    if (badEmail) {
      document.getElementById("email")?.focus();
      return;
    }
    if (badPassword) {
      document.getElementById("password")?.focus();
      return;
    }
    setBusy(true);
    if (mode === "password") {
      const { error } = await signIn(trimmed, password);
      setBusy(false);
      if (error) toast.error(error);
      else navigate({ to: "/requests" });
      return;
    }
    if (mode === "magic") {
      let sendFailed = false;
      try {
        const { error } = await supabase.functions.invoke("client-magic-link", {
          body: { email: trimmed.toLowerCase() },
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
      setBusy(false);
      if (!sendFailed) setSentTo(trimmed);
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSentTo(trimmed);
  }

  return (
    <div ref={scope} className="grain relative min-h-screen overflow-hidden bg-[#1d0a2e] text-primary-foreground isolate">
      <AuroraBackdrop />
      <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-[1280px] grid-rows-[auto_1fr_auto] gap-8 px-4 pb-10 pt-8 sm:px-10 lg:px-14">
        <header data-rise className="flex flex-wrap items-center justify-between gap-4">
          <img src={whiteBrandLogo.url} alt="ScaleSource" className="h-5 w-auto max-w-full object-contain" />
          <Link to="/get-started" className="rounded-md text-[13px] text-primary-foreground/70 hover:text-primary-foreground">
            New company? Submit a hiring request
          </Link>
        </header>

        <main className="grid items-center gap-12 lg:grid-cols-[7fr_5fr] lg:gap-24">
          <section aria-labelledby="hero-h">
            <p data-rise className="mb-6 inline-flex items-center gap-2.5 text-[11px] uppercase tracking-[0.18em] text-amber before:h-px before:w-7 before:bg-current">
              Candidate Pool
            </p>
            <h1 id="hero-h" className="font-display text-[clamp(2.9rem,7vw,6.5rem)] font-medium leading-[0.95] tracking-[-0.02em]">
              <SplitWords text="Talent," /> <SplitWords text="selected" className="italic text-amber" />{" "}
              <SplitWords text="for the way you work." />
            </h1>
            <p data-rise className="mt-7 max-w-[44ch] text-base text-primary-foreground/70">
              Every person on your shortlist has been screened, interviewed and assessed by the ScaleSource team before you see them.
            </p>
            <ol aria-label="How it works" className="mt-10 hidden flex-wrap gap-7 md:flex">
              {[
                ["01", "You describe the role"],
                ["02", "We select a shortlist"],
                ["03", "You interview and hire"],
              ].map(([n, label]) => (
                <li key={n} data-rise className="grid gap-0.5">
                  <span className="font-display text-4xl font-medium leading-none text-primary-foreground">{n}</span>
                  <span className="text-xs text-primary-foreground/70">{label}</span>
                </li>
              ))}
            </ol>
          </section>

          <section aria-label="Sign in" data-pop className="glass-dark-edge w-full">
            <div ref={glare} className="glass-dark px-6 py-9 sm:px-10">
              <h2 className="font-display text-[40px] font-medium leading-none tracking-[-0.01em]">{title}</h2>
              <p className="mb-6 mt-2 text-sm text-primary-foreground/70">{lede}</p>

              {sentTo && (
                <div role="status" className="mb-4 grid gap-1 rounded-xl border border-[#e9f2ea]/25 bg-[#e9f2ea]/10 px-4 py-3.5 text-[13px]">
                  <strong>Check your inbox</strong>
                  <span className="text-primary-foreground/80">
                    {mode === "magic"
                      ? `If ${sentTo} is registered with a client company, a secure login link has been sent.`
                      : `If an account exists for ${sentTo}, a reset link is on its way.`}
                  </span>
                </div>
              )}

              <form noValidate className="space-y-4" onSubmit={onSubmit}>
                <div className="grid gap-2">
                  <Label htmlFor="email" className="text-[12.5px] text-primary-foreground">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@company.com"
                    value={email}
                    aria-invalid={emailError}
                    aria-describedby="email-error"
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (emailError) setEmailError(false);
                    }}
                    className="input-dark aria-[invalid=true]:!border-[#f0a29e]"
                  />
                  {emailError && (
                    <p id="email-error" className="text-[12.5px] text-[#f6b8b4]">
                      Enter your email, like name@company.com.
                    </p>
                  )}
                </div>

                {mode === "password" && (
                  <div className="grid gap-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <Label htmlFor="password" className="text-[12.5px] text-primary-foreground">Password</Label>
                      <button
                        type="button"
                        onClick={() => switchMode("reset")}
                        className="rounded text-[12.5px] font-medium text-amber hover:underline hover:underline-offset-4"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        autoComplete="current-password"
                        aria-invalid={passwordError}
                        aria-describedby="password-error"
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (passwordError) setPasswordError(false);
                        }}
                        className="input-dark pr-12 aria-[invalid=true]:!border-[#f0a29e]"
                      />
                      <button
                        type="button"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground"
                      >
                        {showPassword ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
                      </button>
                    </div>
                    {passwordError && (
                      <p id="password-error" className="text-[12.5px] text-[#f6b8b4]">
                        Enter your password.
                      </p>
                    )}
                  </div>
                )}

                <Button ref={submitRef} type="submit" disabled={busy} className="cta-gold h-[50px] w-full rounded-[14px] text-[14.5px]">
                  {busy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {busyLabel}
                    </>
                  ) : (
                    <>
                      {submitLabel}
                      <span aria-hidden="true" className="grid h-[26px] w-[26px] place-items-center rounded-full bg-[#1d0a2e]/[0.12]">
                        <ArrowRight className="!size-3.5" />
                      </span>
                    </>
                  )}
                </Button>
              </form>

              <div className="my-5 flex items-center gap-3 text-[11.5px] text-primary-foreground/70 before:h-px before:flex-1 before:bg-primary-foreground/15 after:h-px after:flex-1 after:bg-primary-foreground/15">
                or
              </div>
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => switchMode(mode === "password" ? "magic" : "password")}
                  className="rounded text-[13px] font-medium text-amber hover:underline hover:underline-offset-4"
                >
                  {mode === "password" ? "Email me a sign-in link instead" : "Sign in with a password instead"}
                </button>
              </div>
            </div>
          </section>
        </main>

        <footer data-rise className="text-xs text-primary-foreground/60">ScaleSource Candidate Pool</footer>
      </div>
    </div>
  );
}
