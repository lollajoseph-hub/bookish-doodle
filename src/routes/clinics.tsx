import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Building2, ChevronDown, ChevronRight, Plus, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { Label } from "@/components/ui/label";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/clinics")({
  ssr: false,
  component: ClinicsPage,
});

type ClinicRow = {
  clinic_id: string;
  clinic_name: string | null;
  status: string;
  members: number;
  requests: number;
  open_requests: number;
  filled: number;
  placements: number;
};

type ClinicDetail = {
  clinic: {
    id: string;
    name: string | null;
    address: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    status: string;
    created_at: string;
  };
  members: Array<{ profile_id: string; full_name: string | null; email: string | null; is_primary: boolean; created_at: string }>;
  requests: Array<{
    id: string;
    role: string | null;
    status: string;
    headcount: number | null;
    created_at: string;
    candidates?: Array<{
      match_id: string;
      candidate_id: string;
      name: string | null;
      status: string | null;
      label: string | null;
      shortlisted: boolean | null;
      rejected: boolean | null;
      interview_at: string | null;
      interview_confirmed: boolean | null;
      roleplay_score: number | null;
      course_score: number | null;
    }>;
  }>;
  placements: Array<{ id: string; candidate: string | null; position_title: string | null; status: string; placement_date: string | null }>;
};

async function fetchClinics(): Promise<ClinicRow[]> {
  const { data, error } = await supabase.rpc("admin_clinic_activity");
  if (error) throw error;
  return (data ?? []) as ClinicRow[];
}

async function fetchDetail(id: string): Promise<ClinicDetail> {
  const { data, error } = await supabase.rpc("admin_clinic_detail", { p_clinic: id });
  if (error) throw error;
  return data as ClinicDetail;
}

function statusBadge(s: string) {
  if (s === "active") return <Badge className="bg-emerald-500/15 text-emerald-700 border-0">Active</Badge>;
  return <Badge className="bg-muted text-muted-foreground border-0 capitalize">{s}</Badge>;
}

function fmt(d: string | null) {
  if (!d) return "—";
  try { return format(new Date(d), "MMM d, yyyy"); } catch { return d; }
}

type CandidateOutcome = {
  label: string | null;
  shortlisted: boolean | null;
  rejected: boolean | null;
  interview_at: string | null;
};

function candidateOutcomeBadge(c: CandidateOutcome) {
  const label = c.label ?? "";
  if (label === "Placed") return <Badge className="bg-emerald-500/15 text-emerald-700 border-0">Placed</Badge>;
  if (label.startsWith("Offer")) return <Badge className="bg-indigo-500/15 text-indigo-700 border-0">{label}</Badge>;
  if (label === "Interview confirmed") return <Badge className="bg-teal-500/15 text-teal-700 border-0">Interview confirmed</Badge>;
  if (label === "Interview scheduled") return <Badge className="bg-sky-500/15 text-sky-700 border-0">Interview scheduled</Badge>;
  if (label === "Interview completed") return <Badge className="bg-sky-500/15 text-sky-700 border-0">Interview completed</Badge>;
  if (c.rejected || label === "Rejected") return <Badge className="bg-red-500/15 text-red-700 border-0">Rejected</Badge>;
  if (c.shortlisted || label === "Shortlisted") return <Badge className="bg-amber-500/15 text-amber-700 border-0">Shortlisted</Badge>;
  return <Badge variant="secondary">{label || "Under review"}</Badge>;
}

function ClinicsPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin-clinics"], queryFn: fetchClinics, enabled: isAdmin });
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [cName, setCName] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [cAddress, setCAddress] = useState("");
  const [pcEmail, setPcEmail] = useState("");
  const [pcFirst, setPcFirst] = useState("");
  const [pcLast, setPcLast] = useState("");
  const [creating, setCreating] = useState(false);
  const [expandedReqId, setExpandedReqId] = useState<string | null>(null);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [mEmail, setMEmail] = useState("");
  const [mFirst, setMFirst] = useState("");
  const [mLast, setMLast] = useState("");
  const [mBusy, setMBusy] = useState(false);

  const resetMember = () => { setMEmail(""); setMFirst(""); setMLast(""); };
  const resetCreate = () => {
    setCName(""); setCEmail(""); setCPhone(""); setCAddress("");
    setPcEmail(""); setPcFirst(""); setPcLast("");
  };

  const submitAddMember = async () => {
    if (!selectedId || !mEmail.trim()) return;
    setMBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-invite-clinic-member", {
        body: {
          clinic_id: selectedId,
          email: mEmail.trim(),
          first_name: mFirst.trim() || undefined,
          last_name: mLast.trim() || undefined,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success((data as any)?.invited === false ? "Member added" : "Member invited");
      setAddMemberOpen(false);
      resetMember();
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-clinic-detail", selectedId] }),
        qc.invalidateQueries({ queryKey: ["admin-clinics"] }),
      ]);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to add member");
    } finally {
      setMBusy(false);
    }
  };


  const submitCreate = async () => {
    if (!cName.trim()) return;
    setCreating(true);
    try {
      const primaryEmail = pcEmail.trim();
      const { data, error } = await supabase.functions.invoke("admin-create-clinic", {
        body: {
          name: cName.trim(),
          contact_email: cEmail.trim() || undefined,
          contact_phone: cPhone.trim() || undefined,
          address: cAddress.trim() || undefined,
          primary_contact: primaryEmail
            ? { email: primaryEmail, first_name: pcFirst.trim() || undefined, last_name: pcLast.trim() || undefined }
            : undefined,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(primaryEmail ? "Clinic created — invite sent" : "Clinic created");
      setCreateOpen(false);
      resetCreate();
      await qc.invalidateQueries({ queryKey: ["admin-clinics"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to create clinic");
    } finally {
      setCreating(false);
    }
  };

  const detail = useQuery({
    queryKey: ["admin-clinic-detail", selectedId],
    queryFn: () => fetchDetail(selectedId!),
    enabled: !!selectedId && isAdmin,
  });

  const filtered = useMemo(() => {
    const rows = list.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => (r.clinic_name ?? "").toLowerCase().includes(q));
  }, [list.data, search]);

  if (!isAdmin) {
    return (
      <AppShell title="Clinic Pool">
        <div className="min-h-[60vh] flex items-center justify-center px-4">
          <div className="max-w-md text-center rounded-2xl border bg-card p-8 shadow-sm">
            <ShieldCheck className="mx-auto h-10 w-10 text-primary" />
            <h1 className="mt-4 text-xl font-semibold">Access restricted</h1>
            <p className="mt-2 text-sm text-muted-foreground">Clinic management is available to admins only.</p>
          </div>
        </div>
      </AppShell>
    );
  }

  const currentStatus = detail.data?.clinic.status;
  const nextStatus = currentStatus === "active" ? "inactive" : "active";

  const toggleStatus = async () => {
    if (!selectedId) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("admin_set_clinic_status", {
        p_clinic: selectedId,
        p_status: nextStatus,
      });
      if (error) throw error;
      toast.success(`Clinic ${nextStatus === "active" ? "activated" : "deactivated"}`);
      setConfirmOpen(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-clinics"] }),
        qc.invalidateQueries({ queryKey: ["admin-clinic-detail", selectedId] }),
      ]);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell title="Clinic Pool">
      <div className="space-y-5">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Clinic Pool</h2>
            <p className="text-sm text-muted-foreground">{list.data ? `${list.data.length} clinics` : "Loading…"}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={list.isFetching}
              onClick={async () => { await list.refetch(); toast.success("Refreshed"); }}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${list.isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Add Clinic
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search clinics…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
          {list.isLoading ? (
            <div className="p-4 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : list.isError ? (
            <div className="p-8 text-center text-sm text-destructive">Failed to load.</div>
          ) : !filtered.length ? (
            <div className="p-12 text-center text-sm text-muted-foreground flex flex-col items-center gap-3">
              <Building2 className="h-8 w-8 text-muted-foreground/60" />
              No clinics.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Clinic</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Members</TableHead>
                  <TableHead className="text-right">Requests</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                  <TableHead className="text-right">Filled</TableHead>
                  <TableHead className="text-right">Placements</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.clinic_id} className="cursor-pointer" onClick={() => setSelectedId(r.clinic_id)}>
                    <TableCell className="font-medium">{r.clinic_name ?? "—"}</TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                    <TableCell className="text-right">{r.members}</TableCell>
                    <TableCell className="text-right">{r.requests}</TableCell>
                    <TableCell className="text-right">{r.open_requests}</TableCell>
                    <TableCell className="text-right">{r.filled}</TableCell>
                    <TableCell className="text-right">{r.placements}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <Sheet open={!!selectedId} onOpenChange={(o) => { if (!o) setSelectedId(null); }}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{detail.data?.clinic.name ?? "Clinic"}</SheetTitle>
            <SheetDescription>
              {detail.data ? statusBadge(detail.data.clinic.status) : null}
            </SheetDescription>
          </SheetHeader>

          {detail.isLoading ? (
            <div className="space-y-3 mt-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : detail.isError ? (
            <div className="mt-4 text-sm text-destructive">Failed to load clinic detail.</div>
          ) : detail.data ? (
            <div className="mt-6 space-y-6">
              <section className="rounded-xl border p-4 space-y-1 text-sm">
                <div className="font-semibold mb-2">Contact</div>
                <div><span className="text-muted-foreground">Address:</span> {detail.data.clinic.address ?? "—"}</div>
                <div><span className="text-muted-foreground">Email:</span> {detail.data.clinic.contact_email ?? "—"}</div>
                <div><span className="text-muted-foreground">Phone:</span> {detail.data.clinic.contact_phone ?? "—"}</div>
                <div><span className="text-muted-foreground">Created:</span> {fmt(detail.data.clinic.created_at)}</div>
                <div className="pt-3 flex flex-wrap gap-2">
                  <Button
                    variant={currentStatus === "active" ? "destructive" : "default"}
                    onClick={() => setConfirmOpen(true)}
                  >
                    {currentStatus === "active" ? "Deactivate clinic" : "Activate clinic"}
                  </Button>
                  {(() => {
                    const members = detail.data?.members ?? [];
                    const target = members.find((m) => m.is_primary) ?? members[0];
                    const email = target?.email ?? null;
                    return (
                      <Button
                        variant="outline"
                        disabled={!email || busy}
                        onClick={async () => {
                          if (!email) return;
                          setBusy(true);
                          try {
                            const { error } = await supabase.functions.invoke("clinic-magic-link", { body: { email } });
                            if (error) throw error;
                            toast.success(`Magic link sent to ${email}`);
                          } catch (e: any) {
                            toast.error(e?.message ?? "Failed to send magic link");
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Resend Magic Link
                      </Button>
                    );
                  })()}
                </div>
              </section>

              <section>
                <div className="mb-2 flex items-center justify-between">
                  <div className="font-semibold text-sm">Members ({detail.data.members.length})</div>
                  <Button size="sm" variant="outline" onClick={() => setAddMemberOpen(true)}>
                    <Plus className="h-4 w-4 mr-1" /> Add Member
                  </Button>
                </div>
                {detail.data.members.length ? (
                  <ul className="rounded-xl border divide-y">
                    {detail.data.members.map((m) => (
                      <li key={m.profile_id} className="p-3 flex items-center justify-between text-sm">
                        <div>
                          <div className="font-medium">{m.full_name ?? "—"} {m.is_primary && <Badge variant="secondary" className="ml-2">Primary</Badge>}</div>
                          <div className="text-xs text-muted-foreground">{m.email ?? ""}</div>
                        </div>
                        <div className="text-xs text-muted-foreground">{fmt(m.created_at)}</div>
                      </li>
                    ))}
                  </ul>
                ) : <div className="text-sm text-muted-foreground">No members.</div>}
              </section>

              <section>
                <div className="font-semibold mb-2 text-sm">Hiring Requests ({detail.data.requests.length})</div>
                {detail.data.requests.length ? (
                  <ul className="rounded-xl border divide-y">
                    {detail.data.requests.map((r) => {
                      const isOpen = expandedReqId === r.id;
                      const cands = r.candidates ?? [];
                      return (
                        <li key={r.id} className="text-sm">
                          <button
                            type="button"
                            className="w-full p-3 flex items-center justify-between gap-2 text-left hover:bg-muted/40 cursor-pointer"
                            onClick={() => setExpandedReqId(isOpen ? null : r.id)}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                              <div className="min-w-0">
                                <div className="font-medium truncate">{r.role ?? "—"}</div>
                                <div className="text-xs text-muted-foreground">Headcount: {r.headcount ?? 1} · {fmt(r.created_at)}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {r.status === "needs_rematch" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    try {
                                      const { data, error } = await supabase.rpc("rematch_request", { p_request: r.id });
                                      if (error) throw error;
                                      const n = Number((data as any) ?? 0);
                                      toast.success(n > 0 ? `Presented ${n} new candidates` : "No unseen candidates available");
                                      await Promise.all([
                                        qc.invalidateQueries({ queryKey: ["admin-clinic-detail", selectedId] }),
                                        qc.invalidateQueries({ queryKey: ["admin-clinics"] }),
                                      ]);
                                    } catch (err: any) {
                                      toast.error(err?.message ?? "Failed to rematch");
                                    }
                                  }}
                                >
                                  Rematch
                                </Button>
                              )}
                              <Badge variant="secondary" className="capitalize">{r.status.replace(/_/g, " ")}</Badge>
                            </div>
                          </button>
                          {isOpen && (
                            <div className="border-t bg-muted/20 p-3 space-y-2">
                              {cands.length ? cands.map((c) => (
                                <div key={c.match_id} className="flex items-center justify-between gap-2 rounded-md border bg-card p-2 text-sm">
                                  <div className="min-w-0">
                                    <div className="font-medium truncate">{c.name ?? "—"}</div>
                                    <div className="text-xs text-muted-foreground">
                                      {c.roleplay_score != null ? `Roleplay ${Math.round(c.roleplay_score)}%` : "Roleplay —"}
                                      {" · "}
                                      {c.course_score != null ? `Course ${Math.round(c.course_score)}%` : "Course —"}
                                      {c.interview_at ? ` · ${fmt(c.interview_at)}` : ""}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {c.shortlisted && c.label !== "Shortlisted" && (
                                      <Badge className="bg-amber-500/15 text-amber-700 border-0">Shortlisted</Badge>
                                    )}
                                    {candidateOutcomeBadge(c)}
                                  </div>
                                </div>
                              )) : (
                                <div className="text-xs text-muted-foreground italic px-1">No candidates matched yet.</div>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : <div className="text-sm text-muted-foreground">No requests.</div>}
              </section>


              <section>
                <div className="font-semibold mb-2 text-sm">Placements ({detail.data.placements.length})</div>
                {detail.data.placements.length ? (
                  <ul className="rounded-xl border divide-y">
                    {detail.data.placements.map((p) => (
                      <li key={p.id} className="p-3 flex items-center justify-between text-sm">
                        <div>
                          <div className="font-medium">{p.candidate ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{p.position_title ?? "—"} · {fmt(p.placement_date)}</div>
                        </div>
                        <Badge variant="secondary" className="capitalize">{p.status.replace(/_/g, " ")}</Badge>
                      </li>
                    ))}
                  </ul>
                ) : <div className="text-sm text-muted-foreground">No placements.</div>}
              </section>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{currentStatus === "active" ? "Deactivate clinic?" : "Activate clinic?"}</DialogTitle>
            <DialogDescription>
              {currentStatus === "active"
                ? "The clinic will no longer be able to submit new requests."
                : "Reactivating restores the clinic's ability to submit requests."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={busy}>Cancel</Button>
            <Button
              variant={currentStatus === "active" ? "destructive" : "default"}
              onClick={toggleStatus}
              disabled={busy}
            >
              {busy ? "Working…" : (currentStatus === "active" ? "Deactivate" : "Activate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetCreate(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Clinic</DialogTitle>
            <DialogDescription>Create a new clinic. Optionally invite a primary contact.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Clinic name *</Label>
              <Input value={cName} onChange={(e) => setCName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Contact email</Label>
                <Input type="email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Contact phone</Label>
                <Input value={cPhone} onChange={(e) => setCPhone(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input value={cAddress} onChange={(e) => setCAddress(e.target.value)} />
            </div>
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">Primary contact (invite to VetPod Connect)</summary>
              <div className="mt-3 space-y-3">
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input type="email" value={pcEmail} onChange={(e) => setPcEmail(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>First name</Label>
                    <Input value={pcFirst} onChange={(e) => setPcFirst(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Last name</Label>
                    <Input value={pcLast} onChange={(e) => setPcLast(e.target.value)} />
                  </div>
                </div>
              </div>
            </details>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</Button>
            <Button onClick={submitCreate} disabled={creating || !cName.trim()}>
              {creating ? "Creating…" : "Create clinic"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addMemberOpen} onOpenChange={(o) => { setAddMemberOpen(o); if (!o) resetMember(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Member</DialogTitle>
            <DialogDescription>Invite a clinic member to VetPod Connect.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input type="email" value={mEmail} onChange={(e) => setMEmail(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>First name</Label>
                <Input value={mFirst} onChange={(e) => setMFirst(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Last name</Label>
                <Input value={mLast} onChange={(e) => setMLast(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMemberOpen(false)} disabled={mBusy}>Cancel</Button>
            <Button onClick={submitAddMember} disabled={mBusy || !mEmail.trim()}>
              {mBusy ? "Working…" : "Add member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </AppShell>

  );
}
