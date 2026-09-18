import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (loading) return;
    navigate({ to: user ? "/requests" : "/login", replace: true });
  }, [user, loading, navigate]);
  return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
}
