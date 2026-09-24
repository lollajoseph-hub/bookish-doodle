import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bell, Check, Loader2 } from "lucide-react";
import { usePollingRefresh } from "@/hooks/use-polling-refresh";
import { formatDateTime } from "@/lib/matches";

interface NotificationRow {
  id: string;
  title: string | null;
  message: string | null;
  type: string | null;
  read: boolean | null;
  created_at: string;
}

const SELECT = "id,title,message,type,read,created_at";

export function NotificationsBell() {
  const { user } = useAuth();
  const [rows, setRows] = useState<NotificationRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("notifications")
      .select(SELECT)
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) {
      setErr(error.message);
      setRows([]);
      return;
    }
    setErr(null);
    setRows((data ?? []) as unknown as NotificationRow[]);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  usePollingRefresh(load, 20000);

  const unread = (rows ?? []).filter((n) => !n.read).length;

  async function markRead(ids: string[]) {
    if (ids.length === 0) return;
    setBusy(true);
    const { error } = await supabase.from("notifications").update({ read: true }).in("id", ids);
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setRows((prev) => (prev ?? []).map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)));
  }

  return (
    <Popover onOpenChange={(o) => o && void load()}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => markRead((rows ?? []).filter((n) => !n.read).map((n) => n.id))}
            >
              {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />}
              Mark all read
            </Button>
          )}
        </div>

        {err && <p className="px-3 py-2 text-xs text-destructive">{err}</p>}

        <ScrollArea className="max-h-80">
          {rows === null ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
          ) : (
            <ul className="divide-y">
              {rows.map((n) => (
                <li
                  key={n.id}
                  className={`cursor-pointer px-3 py-2.5 text-sm hover:bg-muted/60 ${n.read ? "" : "bg-primary/5"}`}
                  onClick={() => !n.read && void markRead([n.id])}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-amber-500" />}
                    <div className="min-w-0">
                      <p className="font-medium leading-snug">{n.title ?? "Update"}</p>
                      {n.message && <p className="text-muted-foreground">{n.message}</p>}
                      <p className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(n.created_at)}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
