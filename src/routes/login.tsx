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
    <div className="flex min-h-screen items-center justify-center bg-primary-soft p-6 lg:p-12">
      <div className="grid w-full max-w-6xl overflow-hidden rounded-3xl bg-card shadow-xl lg:min-h-[680px] lg:grid-cols-2">
        <div className="login-panel-enter relative hidden overflow-hidden bg-primary p-6 text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-8">
        <div aria-hidden="true" className="login-panel-artwork">
          <span className="login-panel-arc login-panel-arc-one" />
          <span className="login-panel-arc login-panel-arc-two" />
          <span className="login-panel-arc login-panel-arc-three" />
          <span className="login-panel-line login-panel-line-one" />
          <span className="login-panel-line login-panel-line-two" />
          <span className="login-panel-plane" />
        </div>
        <img
          src={whiteBrandLogo.url}
          alt="ScaleSource"
          className="relative z-10 h-7 w-auto max-w-full self-start object-contain"
        />
        <div className="relative z-10 max-w-lg pb-8">
          <h1 className="text-5xl font-bold leading-tight lg:text-6xl">Welcome to ScaleSource</h1>
          <div className="mt-6 h-1 w-16 rounded-full bg-amber" aria-hidden="true" />
          <p className="mt-6 max-w-md text-primary-foreground/75">
            Review the candidate pool, manage client requests, and track placements — everything
            you need in one place.
          </p>
        </div>
        <p className="relative z-10 text-xs text-primary-foreground/60">
          ScaleSource Candidate Pool Review System
        </p>
        </div>

        <div className="login-form-enter flex items-center justify-center bg-card px-6 py-12 sm:px-10 lg:px-12">
          <div className="w-full max-w-md">
          <img
            src={colorBrandLogo.url}
            alt="ScaleSource"
            className="mb-8 h-12 w-auto max-w-full object-contain object-left drop-shadow-sm lg:hidden"
          />
          <h2 className="text-lg font-semibold leading-tight">Sign in</h2>
          <form onSubmit={onSubmit} className="mt-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link to="/forgot-password" className="text-xs text-primary hover:underline">
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
                  className="pr-10"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="login-submit-button w-full" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Submit
            </Button>
          </form>
          </div>
        </div>
      </div>
    </div>
  );
}
