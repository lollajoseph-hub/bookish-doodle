import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Building2, Loader2, Plus, Trash2, Mail, Phone } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { RequestStatusBadge } from "@/components/match-status";
import {
  addClientMember,
  fetchClientDetail,
  labelize,
  removeClientMember,
  updateClient,
} from "@/lib/crm-queries";
import { fetchJobRoles } from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/clients/$clientId")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Client | ScaleSource Candidate Review Dashboard" },
      { name: "description", content: "Client company profile: contacts, open requests and placements." },
      { property: "og:title", content: "Client | ScaleSource" },
      { property: "og:description", content: "Client profile in the ScaleSource Candidate Pool Review System." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientDetailPage,
});

function ClientDetailPage() {
  const { clientId } = useParams({ from: "/clients/$clientId" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [memberOpen, setMemberOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [memberProfile, setMemberProfile] = useState("");
  const [memberPosition, setMemberPosition] = useState("");
  const [memberPrimary, setMemberPrimary] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["client", clientId],
    queryFn: () => fetchClientDetail(clientId),
  });
  const { data: roles = [] } = useQuery({ queryKey: ["job-roles"], queryFn: fetchJobRoles });
  const { data: people = [] } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => {
      const { data: rows, error: err } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .order("full_name", { ascending: true });
      if (err) throw err;
      return rows ?? [];
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["client", clientId] });

  const addMember = useMutation({
    mutationFn: async () => {
      if (!memberProfile) throw new Error("Pick a person");
      await addClientMember({
        client_id: clientId,
        profile_id: memberProfile,
        client_position: memberPosition,
        is_primary: memberPrimary,
      });
    },
    onSuccess: () => {
      toast.success("Contact added");
      setMemberOpen(false);
      setMemberProfile("");
      setMemberPosition("");
      setMemberPrimary(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dropMember = useMutation({
    mutationFn: (profileId: string) => removeClientMember(clientId, profileId),
    onSuccess: () => {
      toast.success("Contact removed");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendInvite = useMutation({
    mutationFn: async () => {
      const { data: res, error: err } = await supabase.functions.invoke(
        "admin-send-pending-client-invite",
        { body: { client_id: clientId } },
      );
      const serverError =
        res && typeof res === "object" && "error" in res ? (res as { error?: string }).error : null;
      if (serverError) throw new Error(serverError);
      if (err) throw new Error(err.message || "Could not send invite");
    },
    onSuccess: () => {
      toast.success("Invite sent");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const saveClient = useMutation({
    mutationFn: () =>
      updateClient(clientId, {
        name,
        industry,
        parent_client_id: data?.client.parent_client_id ?? null,
        is_franchise_brand: data?.client.is_franchise_brand ?? false,
      }),
    onSuccess: () => {
      toast.success("Client updated");
      setEditOpen(false);
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <AppShell title="Client">
        <p className="text-sm text-muted-foreground">Loading client…</p>
      </AppShell>
    );
  }
  if (error || !data) {
    return (
      <AppShell title="Client">
        <div className="card-amber rounded-2xl border bg-card p-8 text-center">
          <p className="font-medium">Client not found</p>
          <Button className="mt-4" onClick={() => navigate({ to: "/clients" })}>
            Back to clients
          </Button>
        </div>
      </AppShell>
    );
  }

  const c = data.client;

  return (
    <AppShell
      title={c.name}
      description={c.industry ?? "Client company"}
      actions={
        <Button
          variant="outline"
          onClick={() => {
            setName(c.name);
            setIndustry(c.industry ?? "");
            setEditOpen(true);
          }}
        >
          Edit client
        </Button>
      }
    >
      <div className="space-y-6">
        <Link to="/clients" className="inline-flex items-center text-sm text-primary hover:underline">
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to clients
        </Link>

        {c.pending_contact && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber bg-amber/10 p-4">
            <div className="flex items-start gap-3">
              <Mail className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <p className="font-semibold">Invite pending</p>
                <p className="text-sm text-muted-foreground">
                  {[c.pending_contact.first_name, c.pending_contact.last_name].filter(Boolean).join(" ") ||
                    "The primary contact"}
                  {c.pending_contact.email ? ` (${c.pending_contact.email})` : ""} hasn't been invited
                  yet because the first request had no candidates. Add a candidate to the request, then
                  send the invite.
                </p>
              </div>
            </div>
            <Button onClick={() => sendInvite.mutate()} disabled={sendInvite.isPending}>
              {sendInvite.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send invite now
            </Button>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <section className="card-amber rounded-2xl border bg-card p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-primary-dark">
                  Open requests
                </h2>
                <Link to="/requests" className="text-xs text-primary hover:underline">
                  All requests
                </Link>
              </div>
              <div className="mt-3 space-y-2">
                {data.requests.length ? (
                  data.requests.map((r) => (
                    <Link
                      key={r.id}
                      to="/requests/$requestId"
                      params={{ requestId: r.id }}
                      className="block rounded-xl border p-3 transition-all hover:border-amber hover:bg-amber/5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">
                          {r.title || roles.find((x) => x.id === r.role_id)?.name || "Request"}
                        </span>
                        <RequestStatusBadge status={r.status} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {roles.find((x) => x.id === r.role_id)?.name ?? "Role"} ·{" "}
                        {labelize(r.engagement_type)} · {r.candidates_wanted} candidates for{" "}
                        {r.hires_needed} hire{r.hires_needed === 1 ? "" : "s"}
                      </p>
                    </Link>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No requests raised yet.</p>
                )}
              </div>
            </section>

            <section className="card-amber rounded-2xl border bg-card p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-primary-dark">
                Placements
              </h2>
              <div className="mt-3 space-y-2">
                {data.placements.length ? (
                  data.placements.map((p) => (
                    <div key={p.id} className="rounded-xl border p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{p.seat_title || "Seat"}</span>
                        <Badge variant="secondary">{labelize(p.status)}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {p.billing_start_date ? `Billing from ${p.billing_start_date}` : "No billing date"}
                        {p.monthly_rate != null ? ` · ${p.monthly_rate}/mo` : ""}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No placements yet.</p>
                )}
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className="card-amber rounded-2xl border bg-card p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-primary-dark">
                  Contacts
                </h2>
                <Button size="sm" variant="ghost" onClick={() => setMemberOpen(true)}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add
                </Button>
              </div>
              <div className="mt-3 space-y-3">
                {data.members.length ? (
                  data.members.map((m) => (
                    <div key={m.profile_id} className="rounded-xl bg-primary-soft/60 p-3 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium">
                            {m.profile?.full_name || m.profile?.email || "Contact"}
                          </div>
                          {m.client_position && (
                            <div className="text-xs text-muted-foreground">{m.client_position}</div>
                          )}
                          {m.profile?.email && (
                            <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                              <Mail className="h-3 w-3" /> {m.profile.email}
                            </div>
                          )}
                          {m.profile?.phone && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Phone className="h-3 w-3" /> {m.profile.phone}
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {m.is_primary && <Badge className="bg-amber text-amber-foreground">Primary</Badge>}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label="Remove contact"
                            onClick={() => dropMember.mutate(m.profile_id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No contacts linked yet.</p>
                )}
              </div>
            </section>

            <section className="card-amber rounded-2xl border bg-card p-5 text-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-primary-dark">
                Company
              </h2>
              <div className="mt-3 space-y-1 text-muted-foreground">
                <p className="flex items-center gap-2 text-foreground">
                  <Building2 className="h-4 w-4 text-primary" /> {c.name}
                </p>
                <p>Industry: {c.industry || "—"}</p>
                <p>Parent: {data.parent?.name || "—"}</p>
                <p>Franchise brand: {c.is_franchise_brand ? "Yes" : "No"}</p>
              </div>
            </section>
          </div>
        </div>
      </div>

      <Dialog open={memberOpen} onOpenChange={setMemberOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add contact</DialogTitle>
            <DialogDescription>Link a person to {c.name} and note their position there.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Person</Label>
              <Select value={memberProfile} onValueChange={setMemberProfile}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a person" />
                </SelectTrigger>
                <SelectContent>
                  {people.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name || p.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="position">Position at client</Label>
              <Input
                id="position"
                placeholder="Operations Manager"
                value={memberPosition}
                onChange={(e) => setMemberPosition(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border p-3">
              <Label htmlFor="primary">Primary contact</Label>
              <Switch id="primary" checked={memberPrimary} onCheckedChange={setMemberPrimary} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMemberOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => addMember.mutate()} disabled={addMember.isPending}>
              {addMember.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Add contact
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit client</DialogTitle>
            <DialogDescription>Update the company details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Company name</Label>
              <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-industry">Industry</Label>
              <Input id="edit-industry" value={industry} onChange={(e) => setIndustry(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => saveClient.mutate()} disabled={saveClient.isPending}>
              {saveClient.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
