import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import whiteBrandLogo from "@/assets/scalesource-logo-white.png.asset.json";
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
    <div className="relative min-h-screen overflow-hidden bg-primary text-primary-foreground">
      <div aria-hidden="true" className="login-panel-artwork">
        <span className="login-panel-arc login-panel-arc-one" />
        <span className="login-panel-arc login-panel-arc-two" />
        <span className="login-panel-arc login-panel-arc-three" />
        <span className="login-panel-line login-panel-line-one" />
        <span className="login-panel-line login-panel-line-two" />
        <span className="login-panel-plane" />
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center p-5 sm:p-8 lg:p-12">
        <main className="login-card-amber-border relative grid w-full max-w-6xl overflow-hidden rounded-2xl bg-primary-dark/45 shadow-2xl backdrop-blur-md lg:min-h-[620px] lg:grid-cols-[1.05fr_0.95fr]">
          <div aria-hidden="true" className="login-panel-artwork login-card-artwork">
            <span className="login-panel-arc login-panel-arc-one" />
            <span className="login-panel-arc login-panel-arc-two" />
            <span className="login-panel-arc login-panel-arc-three" />
            <span className="login-panel-line login-panel-line-one" />
            <span className="login-panel-line login-panel-line-two" />
            <span className="login-panel-plane" />
          </div>
          <section className="login-panel-enter relative z-10 flex min-h-[340px] flex-col justify-between p-7 sm:p-10 lg:min-h-0 lg:p-12">
            <img
              src={whiteBrandLogo.url}
              alt="ScaleSource"
              className="h-5 w-auto max-w-full self-start object-contain"
            />
            <div className="max-w-lg py-12 lg:py-8">
              <h1 className="text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">Welcome!</h1>
              <p className="mt-6 max-w-md text-primary-foreground/75">
                Review the candidate pool, manage client requests, and track placements — everything
                you need in one place.
              </p>
            </div>
            <p className="text-xs text-primary-foreground/60">
              ScaleSource Candidate Pool Review System
            </p>
          </section>

          <section className="relative z-10 flex items-center justify-center p-6 sm:p-10 lg:px-8 lg:py-12">
            <div className="login-form-enter w-full max-w-lg rounded-2xl border border-primary-foreground/20 bg-primary-foreground/10 p-8 shadow-xl backdrop-blur-xl sm:p-10">
            <h2 className="text-xl font-semibold leading-tight text-primary-foreground">Sign in to your workstation</h2>
            <form onSubmit={onSubmit} className="mt-5 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-primary-foreground">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="border-primary-foreground/25 bg-primary-foreground/10 text-primary-foreground placeholder:text-primary-foreground/50 focus-visible:ring-primary-foreground/60"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-primary-foreground">Password</Label>
                  <Link to="/forgot-password" className="text-xs text-primary-foreground/80 hover:text-primary-foreground hover:underline">
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
                    className="border-primary-foreground/25 bg-primary-foreground/10 pr-10 text-primary-foreground placeholder:text-primary-foreground/50 focus-visible:ring-primary-foreground/60"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-primary-foreground/65 hover:text-primary-foreground"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="login-submit-button w-full" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Submit
              </Button>
            </form>
            </div>
          </section>
          
        </main>
      </div>
    </div>
  );
}
