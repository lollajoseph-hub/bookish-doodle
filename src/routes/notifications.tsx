import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Bell, Loader2, RefreshCw, Search, Send, ShieldCheck } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/notifications")({
  ssr: false,
  component: NotificationsPage,
});

type NotificationRow = {
  id: string;
  recipient_id: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  title: string | null;
  message: string | null;
  type: string | null;
  read: boolean | null;
  created_at: string;
};

function NotificationsPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  if (!isAdmin) {
    return (
      <AppShell title="Notifications">
        <div className="min-h-[60vh] flex items-center justify-center px-4">
          <div className="max-w-md text-center rounded-2xl border bg-card p-8 shadow-sm">
            <ShieldCheck className="mx-auto h-10 w-10 text-primary" />
            <h1 className="mt-4 text-xl font-semibold">Access restricted</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Notification Center is available to admins only.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [type, setType] = useState<string>("all");
  const [status, setStatus] = useState<"all" | "unread" | "read">("all");
  const [resendingId, setResendingId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const query = useQuery({
    queryKey: ["admin-notifications", search, type, status],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_notifications_list", {
        p_search: search || null,
        p_type: type === "all" ? null : type,
        p_read: status === "all" ? null : status,
        p_limit: 200,
      });
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
  });

  const rows = query.data ?? [];

  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.type) set.add(r.type);
    return Array.from(set).sort();
  }, [rows]);

  const handleResend = async (id: string) => {
    setResendingId(id);
    try {
      const { error } = await supabase.rpc("admin_resend_notification", { p_id: id });
      if (error) throw error;
      toast.success("Notification re-sent");
      query.refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to resend");
    } finally {
      setResendingId(null);
    }
  };

  const handleRefresh = async () => {
    await query.refetch();
    toast.success("Notifications refreshed");
  };

  return (
    <AppShell title="Notification Center">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" /> All notifications
            </h2>
            <p className="text-sm text-muted-foreground">
              Search, filter, and resend user-facing notifications.
            </p>
          </div>
          <Button variant="outline" onClick={handleRefresh} disabled={query.isFetching}>
            <RefreshCw
              className={`h-4 w-4 mr-2 ${query.isFetching ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[1fr_200px_180px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search recipient, title, or message"
                className="pl-9"
              />
            </div>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {typeOptions.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="unread">Unread</SelectItem>
                <SelectItem value="read">Read</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
          {query.isLoading ? (
            <div className="p-6 space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No notifications match.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium">{r.recipient_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.recipient_email ?? "—"}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate font-medium">
                        {r.title ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-[320px] truncate text-sm text-muted-foreground">
                        {r.message ?? "—"}
                      </TableCell>
                      <TableCell>
                        {r.type ? (
                          <Badge variant="secondary" className="capitalize">
                            {r.type.replace(/_/g, " ")}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        {r.read ? (
                          <span className="text-xs text-muted-foreground">Read</span>
                        ) : (
                          <Badge className="bg-primary text-primary-foreground">Unread</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleResend(r.id)}
                          disabled={resendingId === r.id}
                        >
                          {resendingId === r.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <>
                              <Send className="h-3.5 w-3.5 mr-1" /> Resend
                            </>
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
