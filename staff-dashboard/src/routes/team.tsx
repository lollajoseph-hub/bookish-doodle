import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { TeamPanel } from "@/components/team-panel";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/team")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Add to team | ScaleSource Candidate Review Dashboard" },
      { name: "description", content: "Invite and manage ScaleSource admin accounts." },
      { property: "og:title", content: "Add to team | ScaleSource" },
      { property: "og:description", content: "Invite other admins to the ScaleSource dashboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AddToTeamPage,
});

function AddToTeamPage() {
  const { profile } = useAuth();
  return (
    <AppShell title="Add to team" description="Invite and manage admin accounts">
      <TeamPanel isAdmin={profile?.role === "admin"} />
    </AppShell>
  );
}
