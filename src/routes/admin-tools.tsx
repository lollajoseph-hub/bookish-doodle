import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { RefreshCw, Search, ShieldCheck, Wrench } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { fetchCandidates, type CandidateRow } from "@/lib/queries";

export const Route = createFileRoute("/admin-tools")({
  ssr: false,
  component: AdminToolsPage,
});

type Action = {
  key: string;
  label: string;
  description: string;
  needsCourse?: boolean;
  destructive?: boolean;
  run: (candidateId: string, courseId: string | null) => Promise<string>;
};

const ACTIONS: Action[] = [
  {
    key: "unlock_roleplay",
    label: "Unlock Roleplay",
    description: "Unlocks roleplay for the candidate on their current course.",
    needsCourse: true,
    run: async (p_candidate, p_course) => {
      const { data, error } = await supabase.rpc("admin_unlock_roleplay", { p_candidate, p_course });
      if (error) throw error;
      return typeof data === "string" ? data : "Roleplay unlocked";
    },
  },
  {
    key: "force_final",
    label: "Force Final Completion",
    description: "Marks the final assessment as complete via the training lifecycle.",
    needsCourse: true,
    destructive: true,
    run: async (p_candidate, p_course) => {
      const { data, error } = await supabase.rpc("admin_force_final_complete", { p_candidate, p_course });
      if (error) throw error;
      return typeof data === "string" ? data : "Final completion forced";
    },
  },
  {
    key: "force_roleplay",
    label: "Force Roleplay Completion",
    description: "Marks roleplay complete via the training lifecycle.",
    needsCourse: true,
    destructive: true,
    run: async (p_candidate, p_course) => {
      const { data, error } = await supabase.rpc("admin_force_roleplay_complete", { p_candidate, p_course });
      if (error) throw error;
      return typeof data === "string" ? data : "Roleplay completion forced";
    },
  },
  {
    key: "reset_roleplay",
    label: "Reset Roleplay Attempts",
    description:
      "Deletes ALL roleplay session records for the current course, including scenarios already passed — every assigned scenario starts over from zero, losing prior scores/audio/transcripts. Restores status if the candidate was training_failed. For a version that leaves passed scenarios untouched, use \"Reset Failed Roleplay Only\" instead.",
    needsCourse: true,
    destructive: true,
    run: async (p_candidate, p_course) => {
      const { data, error } = await supabase.rpc("admin_reset_roleplay", { p_candidate, p_course });
      if (error) throw error;
      return typeof data === "string" ? data : "Roleplay attempts reset";
    },
  },
  {
    key: "reset_failed_roleplay",
    label: "Reset Failed Roleplay Only",
    description:
      "Deletes roleplay session records ONLY for scenarios that were not passed (below passing score, or never completed). Scenarios the candidate already passed are left completely untouched — their score, transcript, and audio stay intact. Restores status if the candidate was training_failed.",
    needsCourse: true,
    destructive: true,
    run: async (p_candidate, p_course) => {
      const { data, error } = await supabase.rpc("admin_reset_failed_roleplay", { p_candidate, p_course });
      if (error) throw error;
      const d = (data ?? {}) as {
        reset_scenarios?: string[];
        kept_passed_scenarios?: string[];
        sessions_deleted?: number;
      };
      const reset = d.reset_scenarios ?? [];
      const kept = d.kept_passed_scenarios ?? [];
      if (reset.length === 0) {
        return `Nothing to reset — every attempted scenario is already passed (${kept.length} kept untouched)`;
      }
      return `Reset ${reset.length} failed scenario${reset.length === 1 ? "" : "s"} (${reset.join(", ")})${
        kept.length ? ` — ${kept.length} passed scenario${kept.length === 1 ? "" : "s"} kept untouched` : ""
      }`;
    },
  },
  {
    key: "reset_assessments",
    label: "Reset Assessment Attempts",
    description: "Resets assessment attempt counters for the current course.",
    needsCourse: true,
    destructive: true,
    run: async (p_candidate, p_course) => {
      const { data, error } = await supabase.rpc("admin_reset_assessments", { p_candidate, p_course });
      if (error) throw error;
      return typeof data === "string" ? data : "Assessment attempts reset";
    },
  },
  {
    key: "reset_final_exam",
    label: "Reset Final Examination",
    description:
      "Deletes ONLY the final certification exam attempts and, if the candidate was locked out (training failed), restores them so they can retake the final. Module assessments, roleplays and lesson progress are untouched.",
    needsCourse: true,
    destructive: true,
    run: async (p_candidate, p_course) => {
      const { data, error } = await supabase.rpc("admin_reset_final_exam", { p_candidate, p_course });
      if (error) throw error;
      const n = typeof data === "number" ? data : 0;
      return `Final exam reset — ${n} attempt${n === 1 ? "" : "s"} cleared`;
    },
  },

  {
    key: "regenerate_cert",
    label: "Regenerate Certificate",
    description: "Regenerates the candidate's latest certificate (same number).",
    run: async (p_candidate) => {
      const { data: cert, error: e1 } = await supabase
        .from("certificates")
        .select("id,status,certificate_number")
        .eq("candidate_id", p_candidate)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (e1) throw e1;
      if (!cert) return "No certificate found";
      const { error } = await supabase.rpc("regenerate_certificate", { p_certificate: cert.id, p_new_number: false });
      if (error) throw error;
      return `Certificate ${cert.certificate_number ?? ""} regeneration queued`;
    },
  },
  {
    key: "resend_invitation",
    label: "Resend Invitation",
    description: "Re-sends the candidate onboarding invitation email.",
    run: async (p_candidate) => {
      const { data, error } = await supabase.functions.invoke("resend-invitation", { body: { candidate_id: p_candidate } });
      if (error) throw error;
      return (data as any)?.status ?? (data as any)?.message ?? "Invitation resent";
    },
  },
  {
    key: "prepare_test_candidate",
    label: "Prepare Test Candidate",
    description:
      "Testing only. Marks every published lesson complete and inserts a passing attempt for each required assessment. The server refuses to run this on anyone who is not a designated test candidate (email ends @test.vetpod, or name begins [TEST]).",
    needsCourse: true,
    destructive: true,
    run: async (p_candidate, p_course) => {
      const { data, error } = await supabase.rpc("admin_prepare_test_candidate", { p_candidate, p_course });
      if (error) throw error;
      const d = (data ?? {}) as { lessons_completed?: number; attempts_cleared?: number; attempts_inserted?: number };
      const lessons = d.lessons_completed ?? 0;
      const passed = d.attempts_inserted ?? 0;
      return `Test candidate prepared — ${lessons} lesson${lessons === 1 ? "" : "s"} completed, ${passed} assessment${passed === 1 ? "" : "s"} passed`;
    },
  },
];

type RematchTarget = {
  request_id: string;
  clinic_name: string | null;
  role_title: string | null;
  request_status: string;
  presented_count: number;
  active_count: number;
  needs_rematch: boolean;
  created_at: string;
};

async function fetchRematchTargets(): Promise<RematchTarget[]> {
  const { data, error } = await supabase.rpc("admin_rematch_targets");
  if (error) throw error;
  return (data ?? []) as RematchTarget[];
}


function AdminToolsPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const qc = useQueryClient();

  const candidates = useQuery({ queryKey: ["candidates"], queryFn: fetchCandidates, enabled: isAdmin });
  const rematch = useQuery({ queryKey: ["rematch-targets"], queryFn: fetchRematchTargets, enabled: isAdmin });


  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [rematching, setRematching] = useState<string | null>(null);

  const filteredCandidates = useMemo(() => {
    const rows = candidates.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows.slice(0, 30);
    return rows.filter((c) =>
      (c.profile?.full_name ?? "").toLowerCase().includes(q) ||
      (c.profile?.email ?? "").toLowerCase().includes(q),
    ).slice(0, 30);
  }, [candidates.data, search]);

  const selected = useMemo(
    () => (candidates.data ?? []).find((c) => c.id === selectedId) ?? null,
    [candidates.data, selectedId],
  );
  const courseId = selected?.candidate_courses?.[0]?.course_id ?? null;

  const expiredEnrollment = useMemo(() => {
    const rows = (selected?.candidate_courses ?? []).filter((e) => e.status === "expired");
    if (!rows.length) return null;
    return [...rows].sort((a, b) => {
      const ta = a.enrolled_at ? new Date(a.enrolled_at).getTime() : 0;
      const tb = b.enrolled_at ? new Date(b.enrolled_at).getTime() : 0;
      return tb - ta;
    })[0];
  }, [selected]);

  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [reopenBusy, setReopenBusy] = useState(false);

  if (!isAdmin) {
    return (
      <AppShell title="Admin Tools">
        <div className="min-h-[60vh] flex items-center justify-center px-4">
          <div className="max-w-md text-center rounded-2xl border bg-card p-8 shadow-sm">
            <ShieldCheck className="mx-auto h-10 w-10 text-primary" />
            <h1 className="mt-4 text-xl font-semibold">Access restricted</h1>
            <p className="mt-2 text-sm text-muted-foreground">Admin Tools are available to admins only.</p>
          </div>
        </div>
      </AppShell>
    );
  }

  const runAction = async () => {
    if (!pending || !selected) return;
    setBusy(true);
    try {
      const msg = await pending.run(selected.id, courseId);
      toast.success(msg);
      await qc.invalidateQueries({ queryKey: ["candidate", selected.id] });
      await qc.invalidateQueries({ queryKey: ["certificate", selected.id] });
      setPending(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const runRematch = async (id: string) => {
    setRematching(id);
    try {
      const { data, error } = await supabase.rpc("rematch_request", { p_request: id });
      if (error) throw error;
      const n = typeof data === "number" ? data : 0;
      if (n > 0) toast.success(`Presented ${n} new candidate${n === 1 ? "" : "s"}`);
      else toast.info("No unseen candidates");
      await qc.invalidateQueries({ queryKey: ["rematch-targets"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Rematch failed");
    } finally {
      setRematching(null);
    }
  };

  const runReopenTraining = async () => {
    if (!selected || !expiredEnrollment) return;
    setReopenBusy(true);
    try {
      const reason = reopenReason.trim();
      const { data, error } = await supabase.rpc("admin_grant_training_access", {
        p_candidate_id: selected.id,
        p_course_id: expiredEnrollment.course_id,
        p_reason: reason.length ? reason : null,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      const expiry = (row as any)?.expiry_date as string | undefined;
      const expiryLabel = expiry ? format(new Date(expiry), "MMM d, yyyy h:mm a") : "the new deadline";
      toast.success(`Training window reopened — new expiry ${expiryLabel}`);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["candidates"] }),
        qc.invalidateQueries({ queryKey: ["candidate-detail", selected.id] }),
        qc.invalidateQueries({ queryKey: ["candidate", selected.id] }),
        qc.invalidateQueries({ queryKey: ["course-progress-detail", selected.id] }),
      ]);
      setReopenOpen(false);
      setReopenReason("");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to reopen training window");
    } finally {
      setReopenBusy(false);
    }
  };

  return (
    <AppShell title="Admin Tools">
      <div className="space-y-8">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Wrench className="h-5 w-5" /> Admin Tools
          </h2>
          <p className="text-sm text-muted-foreground">Centralized interventions for candidates and clinic requests.</p>
        </div>

        {/* SECTION A */}
        <section className="rounded-2xl border bg-card p-5 shadow-sm space-y-5">
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-semibold">Candidate interventions</h3>
              <p className="text-xs text-muted-foreground mt-1">Force actions cascade through the normal training lifecycle and are recorded in the audit log.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={candidates.isFetching}
              onClick={async () => { await candidates.refetch(); toast.success("Refreshed"); }}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${candidates.isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr),minmax(0,1.5fr)]">
            <div className="space-y-3">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search candidates…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="rounded-xl border max-h-[400px] overflow-y-auto divide-y">
                {candidates.isLoading ? (
                  <div className="p-3 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
                ) : !filteredCandidates.length ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">No candidates.</div>
                ) : filteredCandidates.map((c: CandidateRow) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full text-left p-3 text-sm transition-colors ${selectedId === c.id ? "bg-primary/10" : "hover:bg-muted/50"}`}
                  >
                    <div className="font-medium truncate">{c.profile?.full_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground truncate">{c.profile?.email ?? ""}</div>
                    <div className="text-[11px] text-muted-foreground mt-1 capitalize">{c.status.replace(/_/g, " ")}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {!selected ? (
                <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">
                  Select a candidate to run interventions.
                </div>
              ) : (
                <>
                  <div className="rounded-xl border p-4">
                    <div className="text-sm font-medium">{selected.profile?.full_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{selected.profile?.email ?? ""}</div>
                    <div className="mt-2 flex gap-2 flex-wrap text-xs">
                      <Badge variant="secondary" className="capitalize">{selected.status.replace(/_/g, " ")}</Badge>
                      {courseId ? (
                        <Badge variant="outline">Course: {selected.candidate_courses[0]?.course?.title ?? "assigned"}</Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-700 border-amber-500/40">No course assigned</Badge>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {expiredEnrollment && (
                      <Button
                        variant="outline"
                        onClick={() => setReopenOpen(true)}
                        className="justify-start border-amber-500/50 text-amber-700 hover:bg-amber-500/10 hover:text-amber-700 sm:col-span-2"
                      >
                        Reopen Training Window
                      </Button>
                    )}
                    {ACTIONS.map((a) => {
                      const disabled = a.needsCourse && !courseId;
                      return (
                        <Button
                          key={a.key}
                          variant={a.destructive ? "destructive" : "outline"}
                          disabled={disabled}
                          onClick={() => setPending(a)}
                          className="justify-start"
                        >
                          {a.label}
                        </Button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        {/* SECTION B */}
        <section className="rounded-2xl border bg-card p-5 shadow-sm space-y-4">
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-semibold">Clinic rematch</h3>
              <p className="text-xs text-muted-foreground mt-1">All requests that have had candidates presented. Rematch becomes available once all four presented candidates are rejected.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={rematch.isFetching}
              onClick={async () => { await rematch.refetch(); toast.success("Refreshed"); }}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${rematch.isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>

          {rematch.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : !rematch.data?.length ? (
            <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">No requests have candidates presented yet.</div>
          ) : (
            <ul className="space-y-2">
              {rematch.data.map((r) => {
                const canRematch = r.needs_rematch;
                return (
                  <li
                    key={r.request_id}
                    className={`rounded-xl border p-4 flex items-center justify-between gap-3 ${canRematch ? "border-amber-500/50 ring-1 ring-amber-500/30 bg-amber-500/5" : ""}`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">{r.clinic_name ?? "Clinic"}</span>
                        <Badge variant="secondary" className="capitalize text-[10px]">{r.request_status.replace(/_/g, " ")}</Badge>
                        {canRematch && (
                          <Badge className="bg-amber-500/15 text-amber-700 border border-amber-500/40 text-[10px]">Needs rematch</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {r.role_title ?? "—"} · {r.presented_count} presented · {format(new Date(r.created_at), "MMM d")}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      disabled={!canRematch || rematching === r.request_id}
                      title={canRematch ? undefined : "Available once all four presented candidates are rejected."}
                      onClick={() => runRematch(r.request_id)}
                    >
                      <RefreshCw className={`h-4 w-4 mr-2 ${rematching === r.request_id ? "animate-spin" : ""}`} /> Rematch
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

      </div>

      <Dialog open={!!pending} onOpenChange={(o) => { if (!o) setPending(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pending?.label}</DialogTitle>
            <DialogDescription>
              {pending?.description} This action will run against{" "}
              <span className="font-medium text-foreground">{selected?.profile?.full_name ?? "the selected candidate"}</span>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)} disabled={busy}>Cancel</Button>
            <Button
              variant={pending?.destructive ? "destructive" : "default"}
              onClick={runAction}
              disabled={busy}
            >
              {busy ? "Working…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={reopenOpen}
        onOpenChange={(o) => {
          if (reopenBusy) return;
          setReopenOpen(o);
          if (!o) setReopenReason("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reopen Training Window</DialogTitle>
            <DialogDescription>
              This gives{" "}
              <span className="font-medium text-foreground">
                {selected?.profile?.full_name ?? "the candidate"}
              </span>{" "}
              a fresh 90-hour window to finish their training. Their existing progress is kept and
              this does NOT use up one of their 2 attempts.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reopen-reason">Reason (optional)</Label>
            <Textarea
              id="reopen-reason"
              rows={3}
              placeholder="Why is this candidate being given another window?"
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              disabled={reopenBusy}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setReopenOpen(false);
                setReopenReason("");
              }}
              disabled={reopenBusy}
            >
              Cancel
            </Button>
            <Button onClick={runReopenTraining} disabled={reopenBusy}>
              {reopenBusy ? "Working…" : "Reopen training window"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
