import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Candidate Review System" },
      { name: "description", content: "staff candidate review and recruiting workspace." },
      { property: "og:title", content: "Candidate Review System" },
      { property: "og:description", content: "staff candidate review and recruiting workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
