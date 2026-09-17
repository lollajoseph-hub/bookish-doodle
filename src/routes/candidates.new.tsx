import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { CandidateForm } from "@/components/candidate-form";

export const Route = createFileRoute("/candidates/new")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Add candidate | Candidate Review System" },
      {
        name: "description",
        content: "Add a new candidate to the pool with contact details, skills and documents.",
      },
      { property: "og:title", content: "Add candidate | ScaleSource" },
      {
        property: "og:description",
        content: "Create a candidate record with documents and an introduction video.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewCandidatePage,
});

function NewCandidatePage() {
  const navigate = useNavigate();

  return (
    <AppShell title="Add candidate" description="Create a new candidate record">
      <div className="space-y-6">
        <Link to="/candidates" className="inline-flex items-center text-sm text-primary hover:underline">
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to candidate pool
        </Link>
        <div className="rounded-2xl border bg-card p-5 sm:p-6">
          <CandidateForm
            onCancel={() => navigate({ to: "/candidates" })}
            onSaved={(id) => navigate({ to: "/candidates/$candidateId", params: { candidateId: id } })}
          />
        </div>
      </div>
    </AppShell>
  );
}
