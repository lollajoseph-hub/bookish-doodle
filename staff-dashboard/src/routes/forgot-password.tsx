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
  head: () => ({
    meta: [
      { title: "Reset Password | ScaleSource Candidate Review" },
      { name: "description", content: "Request a password recovery link for the ScaleSource Candidate Review Workstation." },
      { property: "og:title", content: "Reset Password | ScaleSource Candidate Review" },
      { property: "og:description", content: "Request a password recovery link for the ScaleSource Candidate Review Workstation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
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
    <div className="flex min-h-screen items-center justify-center bg-stone px-4">
      <div className="card-amber w-full max-w-md rounded-[30px] p-8 sm:p-10">
        <h1 className="font-display text-4xl font-semibold leading-none">Reset password</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          We'll email you a recovery link.
        </p>
        {sent ? (
          <div className="mt-6 rounded-2xl bg-primary/[0.06] p-4 text-sm text-primary">
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
            <Button type="submit" className="w-full rounded-full" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Send reset link
            </Button>
          </form>
        )}
        <div className="mt-6 text-sm text-center">
          <Link to="/login" className="font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
