import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import whiteBrandLogo from "@/assets/scalesource-logo-white.png.asset.json";
import { AuroraBackdrop, SplitWords, useEntrance, useGlare, useMagnetic } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/login")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in | ScaleSource Candidate Review Dashboard" },
      {
        name: "description",
        content: "Sign in to the ScaleSource Candidate Pool Review System.",
      },
      { property: "og:title", content: "Sign in | ScaleSource Candidate Review" },
      {
        property: "og:description",
        content: "Sign in to the ScaleSource Candidate Pool Review System.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { redirect } = useSearch({ from: "/login" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const scope = useEntrance<HTMLDivElement>();
  const glare = useGlare<HTMLDivElement>();
  const submitRef = useMagnetic<HTMLButtonElement>();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate({ to: redirect || "/dashboard", replace: true });
  }

  return (
    <div ref={scope} className="grain relative min-h-screen overflow-hidden bg-[#1d0a2e] text-primary-foreground isolate">
      <AuroraBackdrop />
      <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-[1280px] grid-rows-[auto_1fr_auto] gap-8 px-4 pb-10 pt-8 sm:px-10 lg:px-14">
        <header data-rise>
          <img src={whiteBrandLogo.url} alt="ScaleSource" className="h-5 w-auto max-w-full object-contain" />
        </header>

        <main className="grid items-center gap-12 lg:grid-cols-[7fr_5fr] lg:gap-24">
          <section>
            <p data-rise className="mb-6 inline-flex items-center gap-2.5 text-[11px] uppercase tracking-[0.18em] text-amber before:h-px before:w-7 before:bg-current">
              Staff workstation
            </p>
            <h1 className="font-display text-[clamp(3.2rem,7vw,6.5rem)] font-medium leading-[0.95] tracking-[-0.02em]">
              <SplitWords text="Welcome!" className="italic text-amber" />
            </h1>
            <p data-rise className="mt-7 max-w-[44ch] text-base text-primary-foreground/70">
              Review the candidate pool, manage client requests, and track placements — everything
              you need in one place.
            </p>
          </section>

          <section aria-label="Sign in" data-pop className="glass-dark-edge w-full">
            <div ref={glare} className="glass-dark px-6 py-9 sm:px-10">
              <h2 className="font-display text-[40px] font-medium leading-none tracking-[-0.01em]">Sign in to your workstation</h2>
              <form onSubmit={onSubmit} className="mt-7 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-[12.5px] text-primary-foreground">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input-dark"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between">
                    <Label htmlFor="password" className="text-[12.5px] text-primary-foreground">Password</Label>
                    <Link to="/forgot-password" className="rounded text-[12.5px] font-medium text-amber hover:underline hover:underline-offset-4">
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="input-dark pr-12"
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
                </div>
                <Button ref={submitRef} type="submit" className="cta-gold h-[50px] w-full rounded-[14px] text-[14.5px]" disabled={submitting}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Submit
                </Button>
              </form>
            </div>
          </section>
        </main>

        <footer data-rise className="text-xs text-primary-foreground/60">ScaleSource Candidate Pool Review System</footer>
      </div>
    </div>
  );
}
