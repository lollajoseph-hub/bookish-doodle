import { useCallback, useEffect, useRef, useState } from "react";
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

  // Ring the bell straight away whenever the unread count goes up (new notifications arrived).
  // While anything is unread it also gives a short reminder ring every few seconds (CSS, see .bell-ring).
  const [ringKey, setRingKey] = useState(0);
  const prevUnread = useRef<number | null>(null);
  useEffect(() => {
    if (rows === null) return;
    if (prevUnread.current !== null && unread > prevUnread.current) setRingKey((k) => k + 1);
    prevUnread.current = unread;
  }, [rows, unread]);

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
          <span key={ringKey} className={unread > 0 ? "bell-ring inline-flex" : "inline-flex"}>
            <Bell className="h-4 w-4" />
          </span>
          {unread > 0 && (
            <span
              key={`badge-${ringKey}`}
              className="bell-badge absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-amber px-1 text-[10px] font-bold text-amber-foreground"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 overflow-hidden rounded-3xl border-[rgb(26_19_32/0.06)] bg-white p-0 shadow-[0_30px_70px_-30px_rgb(46_16_73/0.55)]">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="font-display text-xl font-semibold leading-none">Notifications</span>
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
                  className={`cursor-pointer px-4 py-3 text-sm transition-colors hover:bg-primary/[0.04] ${n.read ? "" : "bg-primary/[0.05]"}`}
                  onClick={() => !n.read && void markRead([n.id])}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-amber" />}
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
