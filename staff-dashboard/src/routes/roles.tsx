import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { RolesPanel } from "@/components/roles-panel";

export const Route = createFileRoute("/roles")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Roles | ScaleSource Candidate Review Dashboard" },
      {
        name: "description",
        content: "Manage the roles candidates are grouped by, from CSR to marketing positions.",
      },
      { property: "og:title", content: "Roles | ScaleSource" },
      { property: "og:description", content: "Manage candidate roles in the ScaleSource pool." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RolesPage,
});

function RolesPage() {
  return (
    <AppShell title="Roles" description="Categories candidates are grouped by">
      <RolesPanel />
    </AppShell>
  );
}
