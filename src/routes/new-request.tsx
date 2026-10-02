import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, Building2, Copy } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useCatalog } from "@/lib/catalog";
import {
  RequestFields,
  emptyRequestForm,
  requestPayload,
  validateRequestForm,
  type RequestForm,
} from "@/components/request-fields";
import { toast } from "sonner";
import { buildRequestRecap, RequestRecap } from "@/components/request-recap";
import { SuccessFlourish } from "@/components/success-flourish";
import { SplitWords, useEntrance } from "@/lib/motion";

export const Route = createFileRoute("/new-request")({
  validateSearch: (search: Record<string, unknown>): { clone?: string } => ({
    ...(typeof search.clone === "string" && search.clone ? { clone: search.clone } : {}),
  }),
  head: () => ({
    meta: [
      { title: "New hiring request — Candidate Pool" },
      { name: "description", content: "Submit a new hiring request for your company." },
      { property: "og:title", content: "New hiring request — Candidate Pool" },
      { property: "og:description", content: "Submit a new hiring request for your company." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <NewRequest />
    </AppShell>
  ),
});

interface Membership {
  client_id: string;
  client_name: string;
}

function NewRequest() {
  const navigate = useNavigate();
  const { clone } = Route.useSearch();
  const { user } = useAuth();
  const catalog = useCatalog();
  const [membership, setMembership] = useState<Membership | null>(null);
  const [membershipLoading, setMembershipLoading] = useState(true);
  const [membershipError, setMembershipError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState<RequestForm>(emptyRequestForm);
  const [submittedRequestId, setSubmittedRequestId] = useState<string | null>(null);
  const scope = useEntrance<HTMLFormElement>();

  // Resolve the signed-in user's company from their own client_members row.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("client_members")
        .select("client_id, clients(name)")
        .eq("profile_id", user.id)
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setMembershipError(error.message);
      } else if (!data) {
        setMembershipError("We couldn't find a company linked to your account.");
      } else {
        const client = (data as { client_id: string; clients: { name: string } | { name: string }[] | null })
          .clients;
        const name = Array.isArray(client) ? client[0]?.name : client?.name;
        setMembership({ client_id: data.client_id as string, client_name: name ?? "Your company" });
      }
      setMembershipLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Clone prefill: carry over the source request's fields; the start date is
  // cleared on purpose so a stale date isn't copied into the new request.
  useEffect(() => {
    if (!clone || catalog.loading) return;
    let cancelled = false;
    (async () => {
      const [reqRes, skillsRes] = await Promise.all([
        supabase
          .from("client_requests")
          .select(
            "role_id,engagement_type,hours_needed,days_of_week_needed,timezone_requirement,hires_needed,years_experience_min,notes"
          )
          .eq("id", clone)
          .maybeSingle(),
        supabase
          .from("client_request_skills")
          .select("skills(id,name)")
          .eq("request_id", clone)
          .eq("is_required", true),
      ]);
      if (cancelled) return;
      const req = reqRes.data as
        | {
            role_id: string | null;
            engagement_type: string | null;
            hours_needed: string | null;
            days_of_week_needed: string[] | null;
            timezone_requirement: string | null;
            hires_needed: number | null;
            years_experience_min: number | null;
            notes: string | null;
          }
        | null;
      if (reqRes.error || !req) {
        toast.error("We couldn't load the request you want to clone.");
        return;
      }
      const languageIds = new Set(catalog.languageSkills.map((s) => s.id));
      const mustHaveNames: string[] = [];
      const mustHaveIds: string[] = [];
      const language_skill_ids: string[] = [];
      for (const row of (skillsRes.data ?? []) as unknown as { skills: { id: string; name: string | null } | null }[]) {
        const skill = row.skills;
        if (!skill?.id) continue;
        if (languageIds.has(skill.id)) language_skill_ids.push(skill.id);
        else {
          mustHaveIds.push(skill.id);
          mustHaveNames.push(skill.name ?? "Skill");
        }
      }
      setF({
        ...emptyRequestForm,
        role_id: req.role_id ?? "",
        engagement_type: req.engagement_type ?? "",
        hours_needed: req.hours_needed ?? "",
        days_of_week_needed: req.days_of_week_needed ?? [],
        timezone_requirement: req.timezone_requirement ?? "",
        must_have_skill_names: mustHaveNames,
        must_have_skill_ids: mustHaveIds,
        language_skill_ids,
        hires_needed: String(req.hires_needed ?? 1),
        years_experience_min: req.years_experience_min ? String(req.years_experience_min) : "",
        notes: req.notes ?? "",
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [clone, catalog.loading, catalog.languageSkills]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!membership || !user) return;
    const invalid = validateRequestForm(f);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setBusy(true);

    // must_have_skill_names is resolved to skill IDs separately — not a client_requests column.
    const { must_have_skill_names: _names, ...requestColumns } = requestPayload(f);
    const { data: inserted, error } = await supabase
      .from("client_requests")
      .insert({
        client_id: membership.client_id,
        created_by: user.id,
        ...requestColumns,
      })
      .select("id")
      .single();

    if (error || !inserted) {
      setBusy(false);
      toast.error(error?.message ?? "We couldn't save your request.");
      return;
    }

    const requestId = (inserted as { id: string }).id;

    const skillRows = [...new Set([...f.must_have_skill_ids, ...f.language_skill_ids])].map(
      (skill_id) => ({
        request_id: requestId,
        skill_id,
        is_required: true,
      }),
    );

    if (skillRows.length > 0) {
      const { error: skillsError } = await supabase.from("client_request_skills").insert(skillRows);
      if (skillsError) {
        setBusy(false);
        toast.error(`Request saved, but the skills didn't attach: ${skillsError.message}`);
        navigate({ to: "/requests/$id", params: { id: requestId } });
        return;
      }
    }

    // Best-effort automatic matching — the request is considered created
    // regardless of whether candidates were found.
    void (async () => {
      const { error: matchError } = await supabase.rpc("rank_and_match", {
        p_request_id: requestId,
        p_limit: 6,
      });
      if (matchError) console.warn("Automatic matching skipped:", matchError.message);
    })().catch((err: unknown) => console.warn("Automatic matching skipped:", err));

    setBusy(false);
    setSubmittedRequestId(requestId);
  }

  if (submittedRequestId) {
    const recap = buildRequestRecap({
      request: f,
      catalog,
      company: { name: membership?.client_name ?? "", industry: "" },
    });
    return (
      <Card className="card-amber overflow-hidden rounded-[30px]">
        <CardContent className="flex flex-col items-center gap-6 px-6 py-12 text-center sm:px-12">
          <SuccessFlourish />
          <div>
            <h1 className="font-display text-5xl font-medium leading-none">Your request is submitted!</h1>
            <p className="mt-3 text-muted-foreground">We're matching candidates now.</p>
          </div>
          <div className="w-full rounded-3xl bg-stone/90 p-5 text-left shadow-[inset_0_0_0_1px_rgb(26_19_32/0.08)]">
            <RequestRecap items={recap} expanded />
          </div>
          <Button
            type="button"
            className="h-11 px-6"
            onClick={() => navigate({ to: "/requests/$id", params: { id: submittedRequestId } })}
          >
            View request
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <form ref={scope} onSubmit={submit} className="space-y-6">
      <div>
        <h1 className="font-display text-5xl font-medium leading-none tracking-[-0.02em] sm:text-6xl">
          <SplitWords text="New" /> <SplitWords text="hiring request" className="italic text-primary" />
        </h1>
        <p data-rise className="mt-3 text-sm text-muted-foreground">Tell us about the role you need filled.</p>
      </div>

      <Card data-rise className="card-amber rounded-3xl">
        <CardContent className="flex items-center gap-4 py-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary-soft to-amber-soft text-primary">
            <Building2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Company
            </div>
            {membershipLoading ? (
              <Skeleton className="mt-1 h-5 w-48" />
            ) : (
              <div className="font-display truncate text-2xl font-semibold leading-tight text-foreground">
                {membership?.client_name ?? "—"}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {(membershipError || catalog.error) && (
        <div className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/[0.06] p-4 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {membershipError
              ? "We couldn't find a company linked to your account. Please contact your ScaleSource representative."
              : "We couldn't load the role and skill options. Please refresh and try again."}
          </span>
        </div>
      )}

      {clone && (
        <div className="flex items-start gap-2 rounded-2xl bg-primary/[0.06] p-4 text-sm text-primary">
          <Copy className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            You&apos;re cloning a previous request — everything is filled in for you. Review the details and pick a
            new start date before submitting.
          </span>
        </div>
      )}

      <Card data-rise className="card-amber rounded-[30px]">
        <CardHeader className="p-6 sm:p-8">
          <CardTitle>Role requirements</CardTitle>
          <CardDescription>What does the role look like?</CardDescription>
        </CardHeader>
        <CardContent className="px-6 pb-8 sm:px-8">
          <RequestFields value={f} onChange={setF} catalog={catalog} roleScopedSkills />
        </CardContent>
      </Card>

      <div data-rise className="flex justify-end gap-2">
        <Button type="button" variant="outline" className="h-11 px-5" onClick={() => navigate({ to: "/requests" })}>
          Cancel
        </Button>
        <Button type="submit" className="h-11 px-6" disabled={busy || membershipLoading || !membership}>
          {busy ? "Submitting…" : "Submit request"}
        </Button>
      </div>
    </form>
  );
}
