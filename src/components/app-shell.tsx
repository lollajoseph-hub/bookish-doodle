import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Users, LogOut, Menu, ShieldCheck, Briefcase, UserCog } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth, isStaff } from "@/lib/auth";
import { BRAND_LOGO_URL } from "@/lib/supabase";
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

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
};

const navItems: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/candidates", label: "Candidate Pool", icon: Users },
  { to: "/roles", label: "Roles", icon: Briefcase },
  { to: "/recruiters", label: "Team", icon: UserCog, adminOnly: true },
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
      {navItems
        .filter((it) => !it.adminOnly || isAdmin)
        .map((item) => {
          const active = path.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
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
        })}
    </nav>
  );
}

function Brand({ role }: { role?: string | null }) {
  const subtitle =
    role === "admin" ? "Admin workspace" : role === "recruiter" ? "Recruiter workspace" : "Staff workspace";
  return (
    <div className="flex items-center gap-3 px-5 py-5 border-b border-sidebar-border">
      <img
        src={BRAND_LOGO_URL}
        alt="ScaleSource"
        className="h-9 w-9 rounded-xl bg-white object-contain p-1"
      />
      <div className="leading-tight">
        <div className="text-sidebar-foreground font-semibold">ScaleSource</div>
        <div className="text-[11px] uppercase tracking-wider text-sidebar-foreground/60">{subtitle}</div>
      </div>
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
