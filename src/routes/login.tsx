import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Stethoscope, Loader2 } from "lucide-react";
import { toast } from "sonner";

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/login")({
  ssr: false,
  validateSearch: searchSchema,
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
      toast.error(friendlyAuthError(error.message));
      return;
    }
    navigate({ to: redirect || "/dashboard", replace: true });
  }

  function friendlyAuthError(message: string) {
    if (message.toLowerCase().includes("banned")) return "Login credentials expired.";
    return message;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/40 to-accent/40 px-4">
      <div className="w-full max-w-md rounded-2xl border bg-card shadow-xl p-8">
        <div className="flex items-center gap-2 mb-6">
          <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
            <Stethoscope className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <div className="font-semibold">VetPod</div>
            <div className="text-xs text-muted-foreground">Candidate Pool</div>
          </div>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Sign in to VetPod Candidate Pool</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Operations console for admins, recruiters, and clients.
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
              <Link
                to="/forgot-password"
                className="text-xs text-primary hover:underline"
              >
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
                aria-pressed={showPassword}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
