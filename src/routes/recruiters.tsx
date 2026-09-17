import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Mail, Phone } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { fetchCandidates, fetchStaffProfiles } from "@/lib/queries";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/recruiters")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Team | ScaleSource Candidate Review Dashboard" },
      {
        name: "description",
        content: "ScaleSource recruiters and admins, with the candidates each one owns.",
      },
      { property: "og:title", content: "Team | ScaleSource" },
      { property: "og:description", content: "Recruiters and admins in the candidate review system." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TeamPage,
});

function TeamPage() {
  const { data: staff = [], isLoading } = useQuery({ queryKey: ["staff"], queryFn: fetchStaffProfiles });
  const { data: candidates = [] } = useQuery({ queryKey: ["candidates"], queryFn: fetchCandidates });

  return (
    <AppShell title="Team" description="Recruiters and admins">
      {isLoading && <p className="text-sm text-muted-foreground">Loading team…</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {staff.map((s) => {
          const owned = candidates.filter((c) => c.recruiter_id === s.id).length;
          return (
            <div
              key={s.id}
              className="rounded-2xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{s.full_name || s.email}</div>
                  <Badge variant="secondary" className="mt-1 capitalize">
                    {s.role}
                  </Badge>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-semibold text-primary-dark">{owned}</div>
                  <div className="text-[11px] text-muted-foreground">candidates</div>
                </div>
              </div>
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                {s.email && (
                  <div className="flex items-center gap-1.5 truncate">
                    <Mail className="h-3.5 w-3.5" /> {s.email}
                  </div>
                )}
                {s.phone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" /> {s.phone}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
