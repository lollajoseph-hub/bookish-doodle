import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { z } from "zod";
import { supabase, BRAND_LOGO_URL } from "@/lib/supabase";
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

  async function sendMagicLink() {
    if (!email) {
      toast.error("Enter your email first");
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) toast.error(error.message);
    else toast.success("Magic link sent — check your inbox");
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-primary-dark text-white p-10">
        <img src={BRAND_LOGO_URL} alt="ScaleSource" className="h-10 w-auto object-contain" />
        <div>
          <h2 className="text-3xl font-semibold leading-tight">Candidate Review Dashboard</h2>
          <p className="mt-3 max-w-md text-white/70">
            Review the ScaleSource candidate pool by role — CSR, sales support, bookkeeping,
            executive assistance, office support and marketing.
          </p>
        </div>
        <p className="text-xs text-white/50">ScaleSource Candidate Pool Review System</p>
      </div>

      <div className="flex items-center justify-center px-4 py-12 bg-background">
        <div className="w-full max-w-md rounded-2xl border bg-card shadow-sm p-8">
          <img
            src={BRAND_LOGO_URL}
            alt="ScaleSource"
            className="h-10 w-auto object-contain lg:hidden"
          />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            For ScaleSource admins and recruiters.
          </p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
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
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Sign in
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={sendMagicLink}>
              Email me a magic link
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
