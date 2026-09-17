import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/forgot-password")({
  ssr: false,
  component: ForgotPage,
});

function ForgotPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSent(true);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/40 to-accent/40 px-4">
      <div className="w-full max-w-md rounded-2xl border bg-card shadow-xl p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Reset password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          We'll email you a recovery link.
        </p>
        {sent ? (
          <div className="mt-6 rounded-xl bg-secondary p-4 text-sm">
            If an account exists for <strong>{email}</strong>, a reset link is on its way.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Send reset link
            </Button>
          </form>
        )}
        <div className="mt-6 text-sm text-center">
          <Link to="/login" className="text-primary hover:underline">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
