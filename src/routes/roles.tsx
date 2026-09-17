import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { RolesPanel } from "@/components/roles-panel";

export const Route = createFileRoute("/roles")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Roles | Candidate Review System" },
      {
        name: "description",
        content: "Manage the roles candidates are grouped by, from CSR to marketing positions.",
      },
      { property: "og:title", content: "Roles | Candidate Review System" },
      { property: "og:description", content: "Manage candidate roles in the pool." },
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
