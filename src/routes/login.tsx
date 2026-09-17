import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import colorBrandLogo from "@/assets/scalesource-logo-color.png.asset.json";
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

      <div className="relative z-10 grid min-h-screen lg:grid-cols-2">
        <div className="login-panel-enter hidden p-6 lg:flex lg:flex-col lg:justify-between lg:p-8">
          <img
            src={whiteBrandLogo.url}
            alt="ScaleSource"
            className="h-7 w-auto max-w-full self-start object-contain"
          />
          <div className="max-w-lg pb-8">
            <h1 className="text-5xl font-bold leading-tight lg:text-6xl">Welcome to ScaleSource</h1>
            <div className="mt-6 h-1 w-16 rounded-full bg-amber" aria-hidden="true" />
            <p className="mt-6 max-w-md text-primary-foreground/75">
              Review the candidate pool, manage client requests, and track placements — everything
              you need in one place.
            </p>
          </div>
          <p className="text-xs text-primary-foreground/60">
            ScaleSource Candidate Pool Review System
          </p>
        </div>

        <div className="flex items-center justify-center p-6 sm:p-10 lg:justify-end lg:p-12">
          <div className="login-form-enter w-full max-w-sm rounded-2xl border border-primary-foreground/20 bg-primary-foreground/10 p-6 shadow-xl backdrop-blur-xl sm:p-8">
            <img
              src={colorBrandLogo.url}
              alt="ScaleSource"
              className="mb-8 h-12 w-auto max-w-full object-contain object-left drop-shadow-sm lg:hidden"
            />
            <h2 className="text-lg font-semibold leading-tight text-primary-foreground">Sign in</h2>
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
        </div>
      </div>
    </div>
  );
}
