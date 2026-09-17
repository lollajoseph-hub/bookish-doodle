import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Users,
  LogOut,
  Menu,
  ShieldCheck,
  Briefcase,
  UserCog,
  Building2,
  ClipboardList,
  BriefcaseBusiness,
  ScrollText,
} from "lucide-react";
import { NotificationsBell } from "@/components/notifications-bell";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth, isStaff } from "@/lib/auth";
import whiteBrandLogo from "@/assets/scalesource-logo-white.png.asset.json";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { fetchJobRoles } from "@/lib/queries";

type NavItem = {
  to: "/dashboard" | "/candidates" | "/clients" | "/requests" | "/placements" | "/roles" | "/recruiters" | "/audit-logs";
  label: string;
  icon: typeof LayoutDashboard;
};

const dashboardItem: NavItem = { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard };

const navGroups: Array<{ label: string; items: NavItem[]; adminOnly?: boolean }> = [
  { label: "Candidate Pool", items: [{ to: "/candidates", label: "Candidate Pool", icon: Users }] },
  {
    label: "Clients",
    items: [
      { to: "/clients", label: "Clients", icon: Building2 },
      { to: "/requests", label: "Client Requests", icon: ClipboardList },
    ],
  },
  { label: "Placements", items: [{ to: "/placements", label: "Placements", icon: BriefcaseBusiness }] },
  {
    label: "Admin Toolkit",
    adminOnly: true,
    items: [
      { to: "/roles", label: "Manage Roles", icon: Briefcase },
      { to: "/recruiters", label: "Team", icon: UserCog },
      { to: "/audit-logs", label: "Audit Logs", icon: ScrollText },
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
  const roleSearch = useRouterState({
    select: (s) => (s.location.search as { role?: string }).role,
  });
  const { data: roles = [] } = useQuery({ queryKey: ["job-roles"], queryFn: fetchJobRoles });
  const activeRoles = roles.filter((role) => role.is_active !== false);

  const renderItem = (item: NavItem) => {
    const active = path.startsWith(item.to);
    const Icon = item.icon;
    return (
      <Link
        key={item.to}
        to={item.to}
        search={item.to === "/candidates" ? {} : undefined}
        onClick={onNav}
        className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all ${
          active
            ? "bg-primary text-primary-foreground shadow-sm ring-1 ring-amber/70"
            : "text-sidebar-foreground/90 hover:bg-sidebar-accent hover:translate-x-0.5"
        }`}
      >
        <Icon className="h-4 w-4" />
        {item.label}
      </Link>
    );
  };

  return (
    <nav className="flex-1 space-y-1 px-3 py-4">
      {renderItem(dashboardItem)}
      {navGroups
        .filter((group) => !group.adminOnly || isAdmin)
        .map((group) => (
          <div key={group.label} className="mt-3 border-t border-sidebar-border pt-3">
            <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
              {group.label}
            </div>
            <div className="space-y-1">
              {group.items.map(renderItem)}
              {group.label === "Candidate Pool" && (
                <div className="space-y-0.5 pt-1">
                  <Link
                    to="/candidates"
                    search={{}}
                    onClick={onNav}
                    className={`block rounded-lg py-1.5 pl-9 pr-3 text-xs transition-colors ${
                      path.startsWith("/candidates") && !roleSearch
                        ? "bg-sidebar-accent text-sidebar-foreground font-semibold"
                        : "text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    }`}
                  >
                    All roles
                  </Link>
                  {activeRoles.map((role) => (
                    <Link
                      key={role.id}
                      to="/candidates"
                      search={{ role: role.id }}
                      onClick={onNav}
                      className={`block rounded-lg py-1.5 pl-9 pr-3 text-xs transition-colors ${
                        path.startsWith("/candidates") && roleSearch === role.id
                          ? "bg-sidebar-accent text-sidebar-foreground font-semibold"
                          : "text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                      }`}
                    >
                      {role.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
    </nav>
  );
}

function Brand({ role }: { role?: string | null }) {
  const subtitle =
    role === "admin" ? "Admin workspace" : role === "recruiter" ? "Recruiter workspace" : "Staff workspace";
  return (
    <div className="border-b border-sidebar-border px-5 py-5">
      <img
        src={whiteBrandLogo.url}
        alt="ScaleSource"
        className="h-auto w-full max-w-[190px] object-contain object-left drop-shadow-sm"
      />
      <div className="mt-2 text-[11px] uppercase tracking-wider text-sidebar-foreground/70">{subtitle}</div>
    </div>
  );
}

export function AppShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { profile, session, signOut, loading } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login", replace: true });
  }, [loading, session, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>
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
            The Candidate Review Dashboard is for ScaleSource staff (admins and recruiters). Your
            account doesn't have access.
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
      <div className="px-5 py-4 border-t border-sidebar-border text-[11px] text-sidebar-foreground/60">
        Candidate Pool Review System
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="hidden lg:flex w-64 shrink-0 flex-col">{sidebar}</aside>

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
            <div className="min-w-0">
              <h1 className="text-lg font-semibold truncate">{title}</h1>
              {description && (
                <p className="text-xs text-muted-foreground truncate">{description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {actions}
            <NotificationsBell />
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
                    <div className="text-sm font-medium">{profile?.full_name || profile?.email}</div>
                    <div className="text-[11px] text-muted-foreground capitalize">{profile?.role}</div>
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
                  <LogOut className="h-4 w-4 mr-2" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 px-4 lg:px-8 py-6">{children}</main>
      </div>
    </div>
  );
}
