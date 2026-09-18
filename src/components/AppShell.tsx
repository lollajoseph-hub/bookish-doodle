import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { useMembership } from "@/lib/membership";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "@/components/notifications-bell";
import { LogOut, PlusCircle, ListChecks, CalendarClock, Star, UsersRound } from "lucide-react";
import whiteBrandLogo from "@/assets/scalesource-logo-white.png.asset.json";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const { membership } = useMembership();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link to="/requests" className="flex items-center gap-2">
            <span className="flex h-9 w-32 items-center rounded-md bg-primary px-3">
              <img src={whiteBrandLogo.url} alt="ScaleSource" className="h-4 w-full object-contain object-left" />
            </span>
            <span className="font-semibold tracking-tight text-foreground">
              Candidate Pool
            </span>
          </Link>
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/requests">
                <ListChecks className="mr-1.5 h-4 w-4" />
                My Requests
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/shortlisted">
                <Star className="mr-1.5 h-4 w-4" />
                Shortlisted
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/interviews">
                <CalendarClock className="mr-1.5 h-4 w-4" />
                Interviews
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/new-request">
                <PlusCircle className="mr-1.5 h-4 w-4" />
                New Request
              </Link>
            </Button>
            {membership?.is_primary && (
              <Button asChild variant="ghost" size="sm">
                <Link to="/team">
                  <UsersRound className="mr-1.5 h-4 w-4" />
                  Team
                </Link>
              </Button>
            )}
            <NotificationsBell />
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await signOut();
                navigate({ to: "/login" });
              }}
            >
              <LogOut className="mr-1.5 h-4 w-4" />
              Logout
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
