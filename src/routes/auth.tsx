import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — Candidate Pool" }] }),
  component: AuthPage,
});

function AuthPage() {
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
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md rounded-2xl shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <Users className="h-6 w-6" />
          </div>
          <CardTitle>Candidate Pool</CardTitle>
          <CardDescription>Sign in to manage your hiring requests</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const { error } = await signIn(email, password);
              setBusy(false);
              if (error) toast.error(error);
              else navigate({ to: "/requests" });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
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
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <div className="mt-6 border-t pt-4">
            {!magicOpen ? (
              <button
                type="button"
                onClick={() => {
                  setMagicOpen(true);
                  setMagicSent(false);
                  setMagicEmail(email);
                }}
                className="w-full text-center text-sm text-primary hover:underline"
              >
                Already requested staff? Email me a secure login link
              </button>
            ) : magicSent ? (
              <p className="text-center text-sm text-muted-foreground">
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
                      toast.error("We couldn't send the login link right now. Please try again shortly, or contact support if this keeps happening.");
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
                  <Label htmlFor="magic-email">Email</Label>
                  <Input
                    id="magic-email"
                    type="email"
                    value={magicEmail}
                    onChange={(e) => setMagicEmail(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" disabled={magicBusy} className="w-full">
                  {magicBusy ? "Sending…" : "Send login link"}
                </Button>
              </form>
            )}
          </div>
          <div className="mt-4 text-center text-sm">
            <Link to="/get-started" className="text-primary hover:underline">
              New here? Submit a hiring request →
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
