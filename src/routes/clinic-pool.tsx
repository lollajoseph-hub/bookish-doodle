import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/clinic-pool")({
  beforeLoad: () => {
    throw redirect({ to: "/clinics" });
  },
  component: () => null,
});
