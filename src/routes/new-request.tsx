import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, Building2 } from "lucide-react";
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

export const Route = createFileRoute("/new-request")({
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
  const { user } = useAuth();
  const catalog = useCatalog();
  const [membership, setMembership] = useState<Membership | null>(null);
  const [membershipLoading, setMembershipLoading] = useState(true);
  const [membershipError, setMembershipError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState<RequestForm>(emptyRequestForm);

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!membership || !user) return;
    const invalid = validateRequestForm(f);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setBusy(true);

    const { data: inserted, error } = await supabase
      .from("client_requests")
      .insert({
        client_id: membership.client_id,
        created_by: user.id,
        ...requestPayload(f),
      })
      .select("id")
      .single();

    if (error || !inserted) {
      setBusy(false);
      toast.error(error?.message ?? "We couldn't save your request.");
      return;
    }

    const requestId = (inserted as { id: string }).id;

    const { data: mustHaveIds, error: resolveError } = await supabase.rpc(
      "resolve_or_create_skills",
      { p_names: f.must_have_skill_names },
    );
    if (resolveError) {
      setBusy(false);
      toast.error(`Request saved, but the must-have skills didn't attach: ${resolveError.message}`);
      navigate({ to: "/requests/$id", params: { id: requestId } });
      return;
    }

    const skillRows = [
      ...[...((mustHaveIds as string[] | null) ?? []), ...f.language_skill_ids].map((skill_id) => ({
        request_id: requestId,
        skill_id,
        is_required: true,
      })),
      ...f.nice_to_have_skill_ids.map((skill_id) => ({
        request_id: requestId,
        skill_id,
        is_required: false,
      })),
    ];

    if (skillRows.length > 0) {
      const { error: skillsError } = await supabase.from("client_request_skills").insert(skillRows);
      if (skillsError) {
        setBusy(false);
        toast.error(`Request saved, but the skills didn't attach: ${skillsError.message}`);
        navigate({ to: "/requests/$id", params: { id: requestId } });
        return;
      }
    }

    setBusy(false);
    toast.success("Request submitted — we're matching candidates now");
    navigate({ to: "/requests/$id", params: { id: requestId } });
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New hiring request</h1>
        <p className="text-sm text-muted-foreground">Tell us about the role you need filled.</p>
      </div>

      <Card className="rounded-2xl">
        <CardContent className="flex items-center gap-3 py-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Building2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Company
            </div>
            {membershipLoading ? (
              <Skeleton className="mt-1 h-5 w-48" />
            ) : (
              <div className="truncate text-base font-medium text-foreground">
                {membership?.client_name ?? "—"}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {(membershipError || catalog.error) && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {membershipError
              ? "We couldn't find a company linked to your account. Please contact your ScaleSource representative."
              : "We couldn't load the role and skill options. Please refresh and try again."}
          </span>
        </div>
      )}

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Role requirements</CardTitle>
          <CardDescription>What does the role look like?</CardDescription>
        </CardHeader>
        <CardContent>
          <RequestFields value={f} onChange={setF} catalog={catalog} />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => navigate({ to: "/requests" })}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || membershipLoading || !membership}>
          {busy ? "Submitting…" : "Submit request"}
        </Button>
      </div>
    </form>
  );
}
