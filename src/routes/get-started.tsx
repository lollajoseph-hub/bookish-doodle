import { PENDING_PREFIX } from "@/components/role-skill-select";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Building2,
  CalendarClock,
  Eye,
  EyeOff,
  ListChecks,
  Loader2,
  User,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { useCatalog, INDUSTRIES, POSITIONS } from "@/lib/catalog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Field,
  RequestRoleFields,
  RequestScheduleFields,
  RequestRequirementsFields,
  emptyRequestForm,
  requestPayload,
  validateRequestForm,
  validateRoleFields,
  validateScheduleFields,
  type RequestForm,
} from "@/components/request-fields";
import { toast } from "sonner";
import whiteBrandLogo from "@/assets/scalesource-logo-white.png.asset.json";
import { SplitWords, useEntrance } from "@/lib/motion";
import { buildRequestRecap, RequestRecap } from "@/components/request-recap";
import { SuccessFlourish } from "@/components/success-flourish";

export const Route = createFileRoute("/get-started")({
  ssr: false,
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

const STAGES: Array<{ label: string; icon: LucideIcon }> = [
  { label: "Company", icon: Building2 },
  { label: "Your info", icon: User },
  { label: "Role", icon: Briefcase },
  { label: "Schedule", icon: CalendarClock },
  { label: "Requirements", icon: ListChecks },
];

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
  const progress = ((stage + 1) / STAGES.length) * 100;
  return (
    <div className="relative overflow-hidden rounded-[26px] bg-white/65 px-4 pb-4 pt-5 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.9),0_0_0_1px_rgb(26_19_32/0.06),0_18px_40px_-28px_rgb(46_16_73/0.45)] backdrop-blur-md sm:px-8">
      <ol className="relative flex items-start">
      {STAGES.map(({ label, icon: Icon }, i) => {
        const state = i < stage ? "done" : i === stage ? "current" : "todo";
        return (
          <li key={label} className="relative flex flex-1 flex-col items-center gap-2 text-center">
            {i < STAGES.length - 1 && (
              <span className="absolute left-1/2 top-5 h-px w-full border-t border-dashed border-primary/25" />
            )}
            <span
              className={
                "relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full border transition-[background-color,color,box-shadow,transform] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] " +
                (state === "todo"
                  ? "border-foreground/10 bg-white text-muted-foreground"
                  : state === "current"
                    ? "scale-110 border-primary bg-primary text-primary-foreground shadow-[0_8px_20px_-8px_rgb(67_24_103/0.7)] ring-4 ring-amber/30"
                    : "border-transparent bg-primary-soft text-primary")
              }
            >
              <Icon className="h-4 w-4" />
            </span>
            {state === "current" && <span className="h-1.5 w-1.5 rounded-full bg-amber" />}
            <span
              className={
                "hidden text-[11px] sm:inline " +
                (state === "todo" ? "text-muted-foreground" : "font-medium text-foreground")
              }
            >
              {label}
            </span>
          </li>
        );
      })}
      </ol>
      <div className="absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-foreground/[0.06]">
        <div
          className="wizard-progress-fill h-full transition-[width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function SetPasswordForm() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Those passwords don't match.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }
    navigate({ to: "/requests" });
  }

  return (
    <form onSubmit={submit} className="w-full space-y-4 text-left">
      <div className="space-y-1.5">
        <Label htmlFor="wizard-new-password">New password</Label>
        <div className="relative">
          <Input
            id="wizard-new-password"
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
            className="pr-10"
          />
          <button
            type="button"
            tabIndex={-1}
            aria-label={show ? "Hide password" : "Show password"}
            aria-pressed={show}
            onClick={() => setShow((v) => !v)}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground transition-colors hover:text-foreground"
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">At least 8 characters.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="wizard-confirm-password">Confirm password</Label>
        <Input
          id="wizard-confirm-password"
          type={show ? "text" : "password"}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          minLength={8}
          required
        />
      </div>
      <Button type="submit" disabled={busy} className="h-11 w-full">
        {busy ? "Saving…" : "Set password and continue"}
      </Button>
    </form>
  );
}

function GetStartedPage() {
  const catalog = useCatalog();
  const [stage, setStage] = useState(0);
  const scope = useEntrance<HTMLFormElement>();
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ invited: boolean } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (result && !result.invited) {
      const t = setTimeout(() => navigate({ to: "/login" }), 2000);
      return () => clearTimeout(t);
    }
  }, [result, navigate]);

  const [company, setCompany] = useState<CompanyForm>({ name: "", industry: "" });
  const [industryIsOther, setIndustryIsOther] = useState(false);
  const [positionIsOther, setPositionIsOther] = useState(false);
  const [contact, setContact] = useState<ContactForm>({
    first_name: "",
    last_name: "",
    email: "",
    position: "",
  });
  const [request, setRequest] = useState<RequestForm>(emptyRequestForm);
  const allItems = buildRequestRecap({ company, contact, request, catalog });

  function next(event?: React.MouseEvent<HTMLButtonElement>) {
    event?.preventDefault();
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
    const requestError = stage === 2 ? validateRoleFields(request) : stage === 3 ? validateScheduleFields(request) : null;
    if (requestError) {
      toast.error(requestError);
      return;
    }
    setDirection("forward");
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
          must_have_skill_ids: request.must_have_skill_ids.filter((id) => !id.startsWith(PENDING_PREFIX)),
          must_have_skill_names: request.must_have_skill_ids
            .filter((id) => id.startsWith(PENDING_PREFIX))
            .map((id) => id.slice(PENDING_PREFIX.length)),
          required_skill_ids: request.language_skill_ids,
        },
      },
    });
    setBusy(false);

    let payloadError = (data as { error?: string } | null)?.error ?? null;
    if (error && !payloadError) {
      // Non-2xx responses surface as FunctionsHttpError; the useful message is in the response body.
      const response = (error as { context?: Response }).context;
      if (response && typeof response.json === "function") {
        try {
          const body = (await response.clone().json()) as { error?: string };
          payloadError = body?.error ?? null;
        } catch {
          payloadError = null;
        }
      }
    }
    if (error || payloadError) {
      toast.error(payloadError || "We couldn't submit your request. Please try again.");
      return;
    }
    const invited = Boolean((data as { invited?: boolean } | null)?.invited);
    const inviteToken = (data as { invite_token?: string } | null)?.invite_token ?? null;
    if (invited && inviteToken) {
      const { error: otpError } = await supabase.auth.verifyOtp({ token_hash: inviteToken, type: "invite" });
      if (otpError) {
        // The account exists but we couldn't open a session here; fall back to the emailed link.
        setResult({ invited: false });
        return;
      }
      setResult({ invited: true });
      return;
    }
    setResult({ invited: false });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-3 z-20 px-3 pt-3 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-full bg-white/65 py-1.5 pl-2 pr-4 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.85),0_0_0_1px_rgb(26_19_32/0.06),0_10px_40px_-16px_rgb(46_16_73/0.35)] backdrop-blur-xl">
          <Link to="/login" className="flex items-center gap-2.5 rounded-full">
             <span className="flex h-9 w-28 items-center rounded-full bg-primary px-3.5">
               <img src={whiteBrandLogo.url} alt="ScaleSource" className="h-3.5 w-full object-contain object-left" />
            </span>
            <span className="font-display hidden text-xl font-semibold leading-none text-foreground sm:inline">Candidate Pool</span>
          </Link>
          <Link to="/login" className="rounded text-sm text-muted-foreground hover:text-foreground">
            Already have an account? Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        {result ? (
          <Card className="card-amber overflow-hidden rounded-[30px]">
            <CardContent className="flex flex-col items-center gap-6 px-6 py-12 text-center sm:px-12">
              <SuccessFlourish />
              <div>
                <h1 className="font-display text-5xl font-medium leading-none">
                  {result.invited ? "We're creating your dashboard" : "Your request is submitted!"}
                </h1>
              <p className="mt-3 max-w-md text-muted-foreground">
                {result.invited
                  ? "Set up your password here to get started."
                  : "Your request has been added — taking you to sign in…"}
              </p>
              </div>
              {!result.invited && (
                <div className="w-full rounded-3xl bg-stone/90 p-5 text-left shadow-[inset_0_0_0_1px_rgb(26_19_32/0.08)]">
                  <RequestRecap items={allItems} expanded />
                </div>
              )}
              {result.invited ? (
                <SetPasswordForm />
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Redirecting you to sign in…
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <form ref={scope} onSubmit={submit} className="space-y-6">
            <div>
              <h1 className="font-display text-5xl font-medium leading-none tracking-[-0.02em] sm:text-6xl">
                <SplitWords text="Get" /> <SplitWords text="started" className="italic text-primary" />
              </h1>
              <p data-rise className="mt-3 text-sm text-muted-foreground">
                 Five focused steps and we'll start matching candidates for you.
              </p>
            </div>

            <div data-rise><Stepper stage={stage} /></div>

            {catalog.error && stage >= 2 && (
              <div className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/[0.06] p-4 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  We couldn't load the role and skill options. Please refresh, or contact us if this keeps happening.
                </span>
              </div>
            )}

            <Card data-rise className="card-amber overflow-hidden rounded-[30px]">
            <div key={stage} className={direction === "forward" ? "wizard-forward-enter" : "wizard-back-enter"}>
            {stage === 0 && (
              <>
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
                    <Select
                      value={industryIsOther ? "Other" : company.industry}
                      onValueChange={(v) => {
                        if (v === "Other") {
                          setIndustryIsOther(true);
                          setCompany({ ...company, industry: "" });
                        } else {
                          setIndustryIsOther(false);
                          setCompany({ ...company, industry: v });
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select an industry (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {INDUSTRIES.map((i) => (
                          <SelectItem key={i} value={i}>
                            {i}
                          </SelectItem>
                        ))}
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    {industryIsOther && (
                      <Input
                        className="mt-2"
                        value={company.industry}
                        onChange={(e) => setCompany({ ...company, industry: e.target.value })}
                        placeholder="Tell us your industry"
                      />
                    )}
                  </Field>
                </CardContent>
              </>
            )}

            {stage === 1 && (
              <>
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
                    <Select
                      value={positionIsOther ? "Other" : contact.position}
                      onValueChange={(v) => {
                        if (v === "Other") {
                          setPositionIsOther(true);
                          setContact({ ...contact, position: "" });
                        } else {
                          setPositionIsOther(false);
                          setContact({ ...contact, position: v });
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select your position (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {POSITIONS.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    {positionIsOther && (
                      <Input
                        className="mt-2"
                        value={contact.position}
                        onChange={(e) => setContact({ ...contact, position: e.target.value })}
                        placeholder="Tell us your position"
                      />
                    )}
                  </Field>
                </CardContent>
              </>
            )}

            {stage === 2 && (
              <>
                <CardHeader>
                  <CardTitle>The role</CardTitle>
                  <CardDescription>What kind of person are you looking to hire?</CardDescription>
                </CardHeader>
                <CardContent>
                  <RequestRoleFields value={request} onChange={setRequest} catalog={catalog} roleScopedSkills localSkillAdd />
                </CardContent>
              </>
            )}
            {stage === 3 && (
              <><CardHeader><CardTitle>Schedule</CardTitle><CardDescription>When and how much support do you need?</CardDescription></CardHeader><CardContent><RequestScheduleFields value={request} onChange={setRequest} catalog={catalog} /></CardContent></>
            )}
            {stage === 4 && (
              <><CardHeader><CardTitle>Requirements</CardTitle><CardDescription>Tell us what matters most in your ideal candidate.</CardDescription></CardHeader><CardContent><RequestRequirementsFields value={request} onChange={setRequest} catalog={catalog} roleScopedSkills localSkillAdd /></CardContent></>
            )}
            </div>

            </Card>

            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => { setDirection("back"); setStage((s) => Math.max(s - 1, 0)); }}
                disabled={stage === 0}
                className="h-11 px-5"
              >
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Back
              </Button>
              {stage < STAGES.length - 1 ? (
                <Button type="button" className="h-11 px-6" onClick={next}>
                  Continue
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              ) : (
                <Button type="submit" className="h-11 px-6" disabled={busy}>
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
