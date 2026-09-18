import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Users, CheckCircle2, ArrowLeft, ArrowRight, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { useCatalog } from "@/lib/catalog";
import {
  Field,
  RequestFields,
  emptyRequestForm,
  requestPayload,
  validateRequestForm,
  type RequestForm,
} from "@/components/request-fields";
import { toast } from "sonner";

export const Route = createFileRoute("/get-started")({
  head: () => ({
    meta: [
      { title: "Get started — Candidate Pool" },
      {
        name: "description",
        content: "Tell us about your company and the role you need filled, and we'll match candidates for you.",
      },
      { property: "og:title", content: "Get started — Candidate Pool" },
      {
        property: "og:description",
        content: "Tell us about your company and the role you need filled, and we'll match candidates for you.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GetStartedPage,
});

const STAGES = ["Company", "Your info", "Hiring request"];

interface CompanyForm {
  name: string;
  industry: string;
}
interface ContactForm {
  first_name: string;
  last_name: string;
  email: string;
  position: string;
}

function Stepper({ stage }: { stage: number }) {
  return (
    <ol className="flex items-center gap-2">
      {STAGES.map((label, i) => {
        const state = i < stage ? "done" : i === stage ? "current" : "todo";
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={
                "grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold " +
                (state === "done"
                  ? "bg-primary text-primary-foreground"
                  : state === "current"
                    ? "bg-primary/15 text-primary ring-2 ring-primary"
                    : "bg-muted text-muted-foreground")
              }
            >
              {state === "done" ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
            </span>
            <span
              className={
                "hidden text-sm sm:inline " +
                (state === "todo" ? "text-muted-foreground" : "font-medium text-foreground")
              }
            >
              {label}
            </span>
            {i < STAGES.length - 1 && <span className="h-px flex-1 bg-border" />}
          </li>
        );
      })}
    </ol>
  );
}

function GetStartedPage() {
  const catalog = useCatalog();
  const [stage, setStage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ invited: boolean } | null>(null);

  const [company, setCompany] = useState<CompanyForm>({ name: "", industry: "" });
  const [contact, setContact] = useState<ContactForm>({
    first_name: "",
    last_name: "",
    email: "",
    position: "",
  });
  const [request, setRequest] = useState<RequestForm>(emptyRequestForm);

  function next() {
    if (stage === 0 && !company.name.trim()) {
      toast.error("Enter your company name.");
      return;
    }
    if (stage === 1) {
      if (!contact.first_name.trim() || !contact.last_name.trim()) {
        toast.error("Enter your first and last name.");
        return;
      }
      if (!contact.email.trim()) {
        toast.error("Enter your email address.");
        return;
      }
    }
    setStage((s) => Math.min(s + 1, STAGES.length - 1));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const invalid = validateRequestForm(request);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("public-client-request", {
      body: {
        company: {
          name: company.name.trim(),
          industry: company.industry.trim() || null,
        },
        contact: {
          first_name: contact.first_name.trim(),
          last_name: contact.last_name.trim(),
          email: contact.email.trim().toLowerCase(),
          position: contact.position.trim() || null,
        },
        request: {
          ...requestPayload(request),
          required_skill_ids: [...request.must_have_skill_ids, ...request.language_skill_ids],
          nice_to_have_skill_ids: request.nice_to_have_skill_ids,
        },
      },
    });
    setBusy(false);

    const payloadError = (data as { error?: string } | null)?.error;
    if (error || payloadError) {
      toast.error(payloadError || error?.message || "We couldn't submit your request. Please try again.");
      return;
    }
    setResult({ invited: Boolean((data as { invited?: boolean } | null)?.invited) });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3">
          <Link to="/login" className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Users className="h-5 w-5" />
            </span>
            <span className="font-semibold tracking-tight text-foreground">Candidate Pool</span>
          </Link>
          <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">
            Already have an account? Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        {result ? (
          <Card className="rounded-2xl">
            <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">Request received</h1>
              <p className="max-w-md text-muted-foreground">
                {result.invited
                  ? "Check your email to set your password and get started."
                  : "Your request has been added — log in to view it."}
              </p>
              <Button asChild>
                <Link to="/login">Go to sign in</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <form onSubmit={submit} className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Get started</h1>
              <p className="text-sm text-muted-foreground">
                Three quick steps and we'll start matching candidates for you.
              </p>
            </div>

            <Stepper stage={stage} />

            {catalog.error && stage === 2 && (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  We couldn't load the role and skill options. Please refresh, or contact us if this keeps happening.
                </span>
              </div>
            )}

            {stage === 0 && (
              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle>Your company</CardTitle>
                  <CardDescription>Who are we hiring for?</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="Company name" required>
                    <Input
                      value={company.name}
                      onChange={(e) => setCompany({ ...company, name: e.target.value })}
                    />
                  </Field>
                  <Field label="Industry">
                    <Input
                      value={company.industry}
                      onChange={(e) => setCompany({ ...company, industry: e.target.value })}
                      placeholder="Optional"
                    />
                  </Field>
                </CardContent>
              </Card>
            )}

            {stage === 1 && (
              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle>Your info</CardTitle>
                  <CardDescription>So we know who to send candidates to</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="First name" required>
                    <Input
                      value={contact.first_name}
                      onChange={(e) => setContact({ ...contact, first_name: e.target.value })}
                    />
                  </Field>
                  <Field label="Last name" required>
                    <Input
                      value={contact.last_name}
                      onChange={(e) => setContact({ ...contact, last_name: e.target.value })}
                    />
                  </Field>
                  <Field label="Email" required>
                    <Input
                      type="email"
                      value={contact.email}
                      onChange={(e) => setContact({ ...contact, email: e.target.value })}
                    />
                  </Field>
                  <Field label="Position" hint="Your role at the company">
                    <Input
                      value={contact.position}
                      onChange={(e) => setContact({ ...contact, position: e.target.value })}
                      placeholder="Optional"
                    />
                  </Field>
                </CardContent>
              </Card>
            )}

            {stage === 2 && (
              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle>Your hiring request</CardTitle>
                  <CardDescription>What does the role look like?</CardDescription>
                </CardHeader>
                <CardContent>
                  <RequestFields value={request} onChange={setRequest} catalog={catalog} />
                </CardContent>
              </Card>
            )}

            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStage((s) => Math.max(s - 1, 0))}
                disabled={stage === 0}
              >
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Back
              </Button>
              {stage < STAGES.length - 1 ? (
                <Button type="button" onClick={next}>
                  Continue
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              ) : (
                <Button type="submit" disabled={busy}>
                  {busy ? "Submitting…" : "Submit request"}
                </Button>
              )}
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
