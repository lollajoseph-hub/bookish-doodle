import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Users,
  LogOut,
  Menu,
  Stethoscope,
  Clock,
  ShieldCheck,
  Building2,
  CalendarClock,
  HandCoins,
  HeartHandshake,
  Activity,
  UserCog,
  Wrench,
  Bell,
  BarChart3,
  BookOpen,
  FolderOpen,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth, isStaff } from "@/lib/auth";
import { fetchUnreadNotificationsCount } from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NotificationsBell } from "@/components/notifications-bell";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
};

const navGroups: Array<{ label?: string; items: NavItem[] }> = [
  { items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    label: "Pools",
    items: [
      { to: "/candidates", label: "Candidate Pool", icon: Users },
      { to: "/recruiters", label: "Recruiter Pool", icon: UserCog, adminOnly: true },
      { to: "/clinics", label: "Clinic Pool", icon: Building2, adminOnly: true },
    ],
  },
  {
    label: "Academy",
    items: [
      { to: "/courses", label: "Course Management", icon: BookOpen },
      { to: "/course-stats", label: "Course Statistics", icon: BarChart3 },
      { to: "/media-library", label: "Media Library", icon: FolderOpen },
    ],
  },
  {
    label: "Pipeline",
    items: [
      { to: "/interview-review", label: "Interview Review", icon: CalendarClock },
      { to: "/offer-review", label: "Offer Review", icon: HandCoins },
      { to: "/placements", label: "Placements", icon: ShieldCheck },
      { to: "/cs-queue", label: "CS Queue", icon: HeartHandshake, adminOnly: true },
    ],
  },
  {
    label: "Operations",
    items: [
      { to: "/admin-tools", label: "Admin Tools", icon: Wrench, adminOnly: true },
      { to: "/system-monitor", label: "System Monitor", icon: Activity, adminOnly: true },
      { to: "/reports", label: "Reports", icon: BarChart3, adminOnly: true },
    ],
  },
  {
    label: "Activity",
    items: [
      { to: "/notifications", label: "Notifications", icon: Bell, adminOnly: true },
      { to: "/recruiter-activity", label: "Recruiter Activity", icon: Activity, adminOnly: true },
      { to: "/activity", label: "Activity Log", icon: Clock },
    ],
  },
];

function initials(name?: string | null, email?: string | null) {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

function SidebarNav({ onNav, isAdmin }: { onNav?: () => void; isAdmin: boolean }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex-1 space-y-1 px-3 py-4">
      {navGroups.map((group, gi) => {
        const visible = group.items.filter((it) => !it.adminOnly || isAdmin);
        if (!visible.length) return null;
        return (
          <div key={gi} className={gi > 0 ? "pt-3 mt-3 border-t border-sidebar-border" : ""}>
            {group.label && (
              <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                {group.label}
              </div>
            )}
            {visible.map((item) => {
              const active = path.startsWith(item.to);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={onNav}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-sidebar-foreground hover:bg-sidebar-accent"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>

  );
}

function Brand({ role }: { role?: string | null }) {
  const subtitle =
    role === "admin"
      ? "Admin Workstation"
      : role === "recruiter"
        ? "Recruiter Workstation"
        : "Staff Workstation";
  return (
    <div className="flex items-center gap-2 px-5 py-5 border-b border-sidebar-border">
      <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center">
        <Stethoscope className="h-5 w-5 text-primary-foreground" />
      </div>
      <div className="leading-tight">
        <div className="text-sidebar-foreground font-semibold">VetPod</div>
        <div className="text-[11px] uppercase tracking-wider text-sidebar-foreground/60">
          {subtitle}
        </div>
      </div>
    </div>
  );
}

export function AppShell({ title, children }: { title: string; children: ReactNode }) {
  const { profile, session, signOut, loading } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login", replace: true });
  }, [loading, session, navigate]);

  const { data: unread = 0 } = useQuery({
    queryKey: ["unread-notifications", session?.user.id],
    queryFn: () => fetchUnreadNotificationsCount(session!.user.id),
    enabled: !!session,
    refetchInterval: 60_000,
  });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!session) return null;

  const isAdmin = profile?.role === "admin";

  if (!isStaff(profile)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-md text-center rounded-2xl border bg-card p-8 shadow-sm">
          <ShieldCheck className="mx-auto h-10 w-10 text-primary" />
          <h1 className="mt-4 text-xl font-semibold">Access restricted</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This console is for VetPod staff (admins and recruiters). Your account doesn't
            have access.
          </p>
          <Button
            className="mt-6"
            onClick={async () => {
              await signOut();
              navigate({ to: "/login", replace: true });
            }}
          >
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </div>
    );
  }

  const sidebar = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <Brand role={profile?.role} />
      <SidebarNav onNav={() => setMobileOpen(false)} isAdmin={isAdmin} />
      <div className="px-4 py-3 border-t border-sidebar-border text-[11px] text-sidebar-foreground/60">
        Operations console
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col">{sidebar}</aside>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-72 bg-sidebar border-sidebar-border">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          {sidebar}
        </SheetContent>
      </Sheet>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b bg-card/80 backdrop-blur px-4 lg:px-8 h-16">
          <div className="flex items-center gap-2 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-semibold truncate">{title}</h1>
          </div>
          <div className="flex items-center gap-1">
            <NotificationsBell userId={session.user.id} unread={unread} />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-2">
                  <Avatar className="h-8 w-8">
                    {profile?.avatar_url && <AvatarImage src={profile.avatar_url} />}
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      {initials(profile?.full_name, profile?.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden sm:block text-left leading-tight">
                    <div className="text-sm font-medium">
                      {profile?.full_name || profile?.email}
                    </div>
                    <div className="text-[11px] text-muted-foreground capitalize">
                      {profile?.role}
                    </div>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span className="font-medium">{profile?.full_name || "Staff"}</span>
                    <span className="text-xs text-muted-foreground">{profile?.email}</span>
                    <Badge className="mt-1 w-fit" variant="secondary">
                      {profile?.role}
                    </Badge>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    await signOut();
                    navigate({ to: "/login", replace: true });
                  }}
                >
                  <LogOut className="h-4 w-4 mr-2" /> Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 px-4 lg:px-8 py-6">{children}</main>
        <VersionFooter />
      </div>
    </div>
  );
}

const VERSION = "1.0.0";
const BUILD = "Phase 4C";
const BUILD_DATE = "2026-07-01";

function VersionFooter() {
  const { data } = useQuery({
    queryKey: ["system-version"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("system_version");
      if (error) throw error;
      return data as { db_migration?: string; db_migration_name?: string; migration_count?: number };
    },
    staleTime: 5 * 60_000,
  });
  const name = data?.db_migration_name ?? "—";
  const mig = data?.db_migration ?? "—";
  return (
    <footer className="border-t bg-card/50 px-4 lg:px-8 py-2 text-[11px] text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
      <span>VetPod v{VERSION}</span>
      <span>Migration: {name} ({mig})</span>
      <span>Build: {BUILD}</span>
      <span>Build date: {BUILD_DATE}</span>
    </footer>
  );
}
