import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ScaleSource Candidate Review Dashboard" },
      { name: "description", content: "ScaleSource staff candidate review and recruiting workspace." },
      { property: "og:title", content: "ScaleSource Candidate Review Dashboard" },
      { property: "og:description", content: "ScaleSource staff candidate review and recruiting workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
