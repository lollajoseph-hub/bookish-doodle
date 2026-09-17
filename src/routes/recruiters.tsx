import { Fragment } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Mail, Pencil, Plus, RefreshCw, ShieldCheck, UserCog } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/recruiters")({
  ssr: false,
  component: RecruitersPage,
});

type Row = {
  recruiter_id: string;
  recruiter_name: string | null;
  agency: string | null;
  seniority: string | null;
  sourced: number;
  qualified: number;
  interviews: number;
  offers: number;
  placements: number;
  placement_rate: number | null;
};

async function fetchPerf(): Promise<Row[]> {
  const { data, error } = await supabase.rpc("admin_recruiter_performance");
  if (error) throw error;
  return (data ?? []) as Row[];
}

type Candidate = {
  id: string;
  status: string;
  created_at: string;
  profile: { full_name: string | null; email: string | null } | null;
};

async function fetchRecruiterCandidates(recruiterId: string): Promise<Candidate[]> {
  const { data, error } = await supabase
    .from("candidates")
    .select("id,status,created_at,profile:profiles!candidates_profile_id_fkey(full_name,email)")
    .eq("recruiter_id", recruiterId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Candidate[];
}

function CandidatePanel({ recruiterId }: { recruiterId: string }) {
  const q = useQuery({
    queryKey: ["recruiter-candidates", recruiterId],
    queryFn: () => fetchRecruiterCandidates(recruiterId),
  });
  if (q.isLoading) return <div className="p-4"><Skeleton className="h-16 w-full" /></div>;
  if (q.isError) return <div className="p-4 text-sm text-destructive">Failed to load candidates.</div>;
  if (!q.data?.length) return <div className="p-4 text-sm text-muted-foreground">No candidates for this recruiter.</div>;
  return (
    <div className="p-4 bg-muted/30">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {q.data.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-medium">{c.profile?.full_name ?? "—"}</TableCell>
              <TableCell>{c.profile?.email ?? "—"}</TableCell>
              <TableCell><Badge variant="secondary" className="capitalize">{c.status.replace(/_/g, " ")}</Badge></TableCell>
              <TableCell className="text-muted-foreground text-xs">{format(new Date(c.created_at), "MMM d, yyyy")}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function RecruitersPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const q = useQuery({ queryKey: ["recruiter-perf"], queryFn: fetchPerf, enabled: isAdmin });
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [agency, setAgency] = useState("");
  const [seniority, setSeniority] = useState("");
  const [creating, setCreating] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editRecruiterId, setEditRecruiterId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAgency, setEditAgency] = useState("");
  const [editSeniority, setEditSeniority] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const openEdit = (r: Row) => {
    setEditRecruiterId(r.recruiter_id);
    setEditName(r.recruiter_name ?? "");
    setEditAgency(r.agency ?? "");
    setEditSeniority(r.seniority ?? "");
    setEditOpen(true);
  };

  const submitEdit = async () => {
    if (!editRecruiterId) return;
    setSavingEdit(true);
    try {
      const { error } = await supabase.rpc("admin_update_recruiter", {
        p_recruiter_id: editRecruiterId,
        p_full_name: editName.trim() || null,
        p_agency_name: editAgency.trim() || null,
        p_seniority: editSeniority.trim() || null,
      });
      if (error) throw error;
      toast.success("Recruiter updated");
      setEditOpen(false);
      await qc.invalidateQueries({ queryKey: ["recruiter-perf"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update recruiter");
    } finally {
      setSavingEdit(false);
    }
  };

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const resendInvite = async (r: Row) => {
    setResendingId(r.recruiter_id);
    try {
      const { data, error } = await supabase.functions.invoke("admin-resend-recruiter-invite", {
        body: { recruiter_id: r.recruiter_id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Invite resent — they'll receive a new login email");
    } catch (e: any) {
      let message = e?.message ?? "Failed to resend invite";
      if (e?.context && typeof e.context.json === "function") {
        try {
          const body = await e.context.json();
          if (body?.error) message = body.error;
        } catch {
          // ignore parse failure, fall back to generic message
        }
      }
      toast.error(message);
    } finally {
      setResendingId(null);
    }
  };


  const resetCreate = () => {
    setFirstName(""); setLastName(""); setEmail(""); setAgency(""); setSeniority("");
  };

  const submitCreate = async () => {
    if (!emailValid) return;
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-recruiter", {
        body: {
          email: email.trim(),
          first_name: firstName.trim() || undefined,
          last_name: lastName.trim() || undefined,
          agency_name: agency.trim() || undefined,
          seniority: seniority.trim() || undefined,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Recruiter invited — they'll receive a login email");
      setCreateOpen(false);
      resetCreate();
      await qc.invalidateQueries({ queryKey: ["recruiter-perf"] });
    } catch (e: any) {
      let message = e?.message ?? "Failed to create recruiter";
      if (e?.context && typeof e.context.json === "function") {
        try {
          const body = await e.context.json();
          if (body?.error) message = body.error;
        } catch {
          // ignore parse failure, fall back to generic message
        }
      }
      toast.error(message);
    } finally {
      setCreating(false);
    }
  };

  if (!isAdmin) {
    return (
      <AppShell title="Recruiter Pool">

        <div className="min-h-[60vh] flex items-center justify-center px-4">
          <div className="max-w-md text-center rounded-2xl border bg-card p-8 shadow-sm">
            <ShieldCheck className="mx-auto h-10 w-10 text-primary" />
            <h1 className="mt-4 text-xl font-semibold">Access restricted</h1>
            <p className="mt-2 text-sm text-muted-foreground">Recruiter management is available to admins only.</p>
          </div>
        </div>
      </AppShell>
    );
  }

  const rows = q.data ?? [];
  const totals = rows.reduce(
    (acc, r) => ({
      sourced: acc.sourced + (r.sourced ?? 0),
      qualified: acc.qualified + (r.qualified ?? 0),
      placements: acc.placements + (r.placements ?? 0),
    }),
    { sourced: 0, qualified: 0, placements: 0 },
  );

  return (
    <AppShell title="Recruiter Pool">
      <div className="space-y-5">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Recruiter Pool</h2>
            <p className="text-sm text-muted-foreground">Performance across the sourcing pipeline.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={q.isFetching}
              onClick={async () => { await q.refetch(); toast.success("Refreshed"); }}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${q.isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Add Recruiter
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="text-sm text-muted-foreground">Total Sourced</div>
            <div className="text-2xl font-semibold mt-1">{totals.sourced}</div>
          </div>
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="text-sm text-muted-foreground">Total Qualified</div>
            <div className="text-2xl font-semibold mt-1">{totals.qualified}</div>
          </div>
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="text-sm text-muted-foreground">Total Placements</div>
            <div className="text-2xl font-semibold mt-1">{totals.placements}</div>
          </div>
        </div>

        <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
          {q.isLoading ? (
            <div className="p-4 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : q.isError ? (
            <div className="p-8 text-center text-sm text-destructive">Failed to load. {(q.error as Error)?.message}</div>
          ) : !rows.length ? (
            <div className="p-12 text-center text-sm text-muted-foreground flex flex-col items-center gap-3">
              <UserCog className="h-8 w-8 text-muted-foreground/60" />
              No recruiters.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Recruiter</TableHead>
                  <TableHead>Agency</TableHead>
                  <TableHead className="text-right">Sourced</TableHead>
                  <TableHead className="text-right">Qualified</TableHead>
                  <TableHead className="text-right">Interviews</TableHead>
                  <TableHead className="text-right">Offers</TableHead>
                  <TableHead className="text-right">Placements</TableHead>
                  <TableHead className="text-right">Placement Rate</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const open = expanded === r.recruiter_id;
                  return (
                    <Fragment key={r.recruiter_id}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() => setExpanded(open ? null : r.recruiter_id)}
                      >
                        <TableCell>{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                        <TableCell className="font-medium">{r.recruiter_name ?? "—"}</TableCell>
                        <TableCell>{r.agency ?? "—"}</TableCell>
                        <TableCell className="text-right">{r.sourced ?? 0}</TableCell>
                        <TableCell className="text-right">{r.qualified ?? 0}</TableCell>
                        <TableCell className="text-right">{r.interviews ?? 0}</TableCell>
                        <TableCell className="text-right">{r.offers ?? 0}</TableCell>
                        <TableCell className="text-right">{r.placements ?? 0}</TableCell>
                        <TableCell className="text-right">{r.placement_rate ?? 0}%</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label="Resend invite"
                              disabled={resendingId === r.recruiter_id}
                              onClick={(e) => { e.stopPropagation(); resendInvite(r); }}
                            >
                              {resendingId === r.recruiter_id ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                              ) : (
                                <Mail className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label="Edit recruiter"
                              onClick={(e) => { e.stopPropagation(); openEdit(r); }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {open && (
                        <TableRow>
                          <TableCell colSpan={10} className="p-0">
                            <CandidatePanel recruiterId={r.recruiter_id} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetCreate(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Recruiter</DialogTitle>
            <DialogDescription>Invite a new recruiter. They'll receive a login email.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>First name</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Last name</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Agency</Label>
              <Input value={agency} onChange={(e) => setAgency(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Seniority</Label>
              <Input value={seniority} onChange={(e) => setSeniority(e.target.value)} placeholder="e.g. Senior, Lead" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</Button>
            <Button onClick={submitCreate} disabled={creating || !emailValid}>
              {creating ? "Sending…" : "Send invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Recruiter</DialogTitle>
            <DialogDescription>Update this recruiter's profile details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Full name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Agency</Label>
              <Input value={editAgency} onChange={(e) => setEditAgency(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Seniority</Label>
              <Input value={editSeniority} onChange={(e) => setEditSeniority(e.target.value)} placeholder="e.g. Senior, Lead" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={savingEdit}>Cancel</Button>
            <Button onClick={submitEdit} disabled={savingEdit}>
              {savingEdit ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
