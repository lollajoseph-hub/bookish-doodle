import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Star, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/shortlisted")({
  head: () => ({ meta: [{ title: "Shortlisted — Candidate Pool" }] }),
  component: () => (
    <AppShell>
      <ShortlistedPage />
    </AppShell>
  ),
});

interface ShortlistedRow {
  match_id: string;
  candidate_id: string;
  status: string | null;
  client_status: string | null;
  candidate_name: string | null;
  headline: string | null;
  availability: string | null;
  role_title: string | null;
  company_name: string | null;
  client_request_id: string;
  shortlisted_at: string | null;
  profile_photo_bucket: string | null;
  profile_photo_path: string | null;
  name_revealed: boolean | null;
}

async function signedUrl(bucket: string, path: string) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  if (error) return null;
  return data.signedUrl;
}

function availabilityLabel(v: string | null | undefined) {
  switch ((v ?? "").toLowerCase()) {
    case "available":
      return "Available Immediately";
    case "open_to_offers":
      return "Open to offers";
    case "not_available":
      return "Not available";
    default:
      return v ?? "—";
  }
}

function relativeDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.round(diffMs / 60000);
  const diffHours = Math.round(diffMs / 3600000);
  const diffDays = Math.round(diffMs / 86400000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function ShortlistedPage() {
  const [rows, setRows] = useState<ShortlistedRow[] | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string | null>>({});
  const [err, setErr] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = async () => {
    setRows(null);
    setErr(null);
    const { data, error } = await supabase.rpc("get_client_shortlisted_candidates");
    if (error) {
      setErr(error.message);
      setRows([]);
      return;
    }
    const list = (data ?? []) as ShortlistedRow[];
    list.sort((a, b) => {
      const ta = a.shortlisted_at ? new Date(a.shortlisted_at).getTime() : 0;
      const tb = b.shortlisted_at ? new Date(b.shortlisted_at).getTime() : 0;
      return tb - ta;
    });
    setRows(list);

    const entries = await Promise.all(
      list.map(async (r) => {
        if (r.profile_photo_bucket && r.profile_photo_path) {
          const u = await signedUrl(r.profile_photo_bucket, r.profile_photo_path);
          return [r.match_id, u] as const;
        }
        return [r.match_id, null] as const;
      })
    );
    setPhotoUrls(Object.fromEntries(entries));
  };

  useEffect(() => {
    load();
  }, []);

  async function unshortlist(matchId: string) {
    setActingId(matchId);
    const { error } = await supabase.rpc("client_shortlist_candidate", { p_match_id: matchId });
    setActingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Removed from shortlist");
    load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Shortlisted Candidates</h1>
        <p className="text-sm text-muted-foreground">
          Candidates you've shortlisted across all your requests. They'll move off this list once you schedule an interview or reject them.
        </p>
      </div>

      {err && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {err}
        </div>
      )}

      {rows === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Star className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">You haven't shortlisted anyone yet.</p>
            <p className="text-sm text-muted-foreground">
              Star a candidate from one of your requests to add them here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((r) => {
            const photo = photoUrls[r.match_id];
            const initial = (r.candidate_name ?? "?").slice(0, 1).toUpperCase();
            const revealedName = r.candidate_name ?? "Candidate";
            const displayName = r.name_revealed ? revealedName : revealedName.split(" ")[0];
            return (
              <Card key={r.match_id} className="relative rounded-2xl">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    {photo ? (
                      <img
                        src={photo}
                        alt=""
                        className="h-16 w-16 flex-none rounded-full object-cover ring-2 ring-teal-50"
                      />
                    ) : (
                      <div className="flex h-16 w-16 flex-none items-center justify-center rounded-full bg-teal-50 text-2xl font-semibold text-teal-700">
                        {initial}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      {!r.name_revealed && (
                        <div className="text-xs italic text-muted-foreground">Meet</div>
                      )}
                      <h3 className="truncate text-base font-semibold leading-tight">{displayName}</h3>
                      <p className="truncate text-sm text-muted-foreground">{r.headline ?? "—"}</p>
                    </div>
                  </div>

                  <div className="space-y-1 text-sm">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-foreground/80">
                      <span className="text-muted-foreground">Availability:</span>
                      <span>{availabilityLabel(r.availability)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-foreground/80">
                      <span className="text-muted-foreground">Request:</span>
                      <span>
                        {r.role_title ?? "—"} · {r.company_name ?? "—"}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-foreground/80">
                      <span className="text-muted-foreground">Shortlisted:</span>
                      <span>{relativeDate(r.shortlisted_at)}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                      disabled={actingId === r.match_id}
                      onClick={() => unshortlist(r.match_id)}
                    >
                      {actingId === r.match_id ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <Star className="mr-1.5 h-4 w-4 fill-amber-500 text-amber-500" />
                      )}
                      Unshortlist
                    </Button>
                    <Button asChild variant="secondary" size="sm">
                      <Link to="/requests/$id" params={{ id: r.client_request_id }}>
                        View request
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
