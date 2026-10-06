import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { useMembership } from "@/lib/membership";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "@/components/notifications-bell";
import { MessagesWidget } from "@/components/messages-widget";
import { MessagesWidgetProvider } from "@/lib/messages-widget";
import { LogOut, PlusCircle, ListChecks, CalendarClock, Star, UsersRound, Menu, X } from "lucide-react";
import { toast } from "sonner";
import whiteBrandLogo from "@/assets/scalesource-logo-white.png.asset.json";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const { membership, notMember } = useMembership();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  // The Candidate Pool is for client company accounts only. Staff accounts would otherwise see
  // every client's data (staff database access) and staff notifications, so sign them out.
  useEffect(() => {
    if (!user || !notMember) return;
    toast.error("This account isn't linked to a client company. ScaleSource staff should use the Candidate Review Dashboard.");
    void signOut().then(() => navigate({ to: "/login" }));
  }, [user, notMember, signOut, navigate]);

  if (loading || !user || notMember) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  const navLinks = (
    <>
      <NavItem to="/requests" icon={<ListChecks />} label="My Requests" onNavigate={() => setMenuOpen(false)} />
      <NavItem to="/shortlisted" icon={<Star />} label="Shortlisted" onNavigate={() => setMenuOpen(false)} />
      <NavItem to="/interviews" icon={<CalendarClock />} label="Interviews" onNavigate={() => setMenuOpen(false)} />
      <NavItem to="/new-request" search={{}} icon={<PlusCircle />} label="New Request" onNavigate={() => setMenuOpen(false)} />
      {membership?.is_primary && (
        <NavItem to="/team" icon={<UsersRound />} label="Team" onNavigate={() => setMenuOpen(false)} />
      )}
    </>
  );

  const logout = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  return (
    <MessagesWidgetProvider>
    <div className="min-h-screen bg-background">
      <header className="sticky top-3 z-20 px-3 pt-3 sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 rounded-full bg-white/65 py-1.5 pl-2 pr-2 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.85),0_0_0_1px_rgb(26_19_32/0.06),0_10px_40px_-16px_rgb(46_16_73/0.35)] backdrop-blur-xl backdrop-saturate-150">
          <Link to="/requests" className="flex items-center gap-2.5 rounded-full">
            <span className="flex h-9 w-28 items-center rounded-full bg-primary px-3.5">
              <img src={whiteBrandLogo.url} alt="ScaleSource" className="h-3.5 w-full object-contain object-left" />
            </span>
            <span className="font-display hidden text-xl font-semibold leading-none text-foreground sm:inline">
              Candidate Pool
            </span>
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
            {navLinks}
          </nav>
          <div className="flex items-center gap-1">
            <NotificationsBell />
            <Button variant="outline" size="sm" className="hidden lg:inline-flex" onClick={logout}>
              <LogOut className="mr-1.5 h-4 w-4" />
              Logout
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? <X /> : <Menu />}
            </Button>
          </div>
        </div>
        {menuOpen && (
          <nav
            id="mobile-menu"
            aria-label="Main"
            className="mx-auto mt-2 flex max-w-6xl flex-col gap-1 rounded-3xl bg-white/85 p-3 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.9),0_0_0_1px_rgb(26_19_32/0.06),0_24px_60px_-24px_rgb(46_16_73/0.45)] backdrop-blur-xl lg:hidden [&_a]:justify-start [&_a]:h-11 [&_a]:text-sm"
          >
            {navLinks}
            <Button variant="outline" className="mt-1 h-11 justify-start" onClick={logout}>
              <LogOut className="mr-1.5 h-4 w-4" />
              Logout
            </Button>
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>
      <MessagesWidget />
    </div>
    </MessagesWidgetProvider>
  );
}

/** Main navigation link. TanStack Router marks the active route with data-status="active" and aria-current="page". */
function NavItem({
  to,
  search,
  icon,
  label,
  onNavigate,
}: {
  to: "/requests" | "/shortlisted" | "/interviews" | "/new-request" | "/team";
  search?: Record<string, never>;
  icon: ReactNode;
  label: string;
  onNavigate: () => void;
}) {
  return (
    <Button
      asChild
      variant="ghost"
      size="sm"
      className="h-9 px-3.5 text-[13px] font-medium text-secondary-foreground data-[status=active]:bg-primary data-[status=active]:text-primary-foreground data-[status=active]:shadow-[0_6px_18px_-6px_rgb(67_24_103/0.6)] [&_svg]:size-4"
    >
      <Link to={to} search={search as never} onClick={onNavigate}>
        {icon}
        {label}
      </Link>
    </Button>
  );
}
