import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { SkillsPanel } from "@/components/skills-panel";

export const Route = createFileRoute("/skills")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Manage Skills | ScaleSource Candidate Review Dashboard" },
      {
        name: "description",
        content:
          "Clean up the skills catalog — rename, recategorize, merge duplicate skill tags and remove unused ones.",
      },
      { property: "og:title", content: "Manage Skills | ScaleSource" },
      {
        property: "og:description",
        content: "Rename, recategorize and merge duplicate skills in the ScaleSource catalog.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SkillsPage,
});

function SkillsPage() {
  return (
    <AppShell title="Manage Skills" description="Tidy up the skills catalog">
      <SkillsPanel />
    </AppShell>
  );
}
