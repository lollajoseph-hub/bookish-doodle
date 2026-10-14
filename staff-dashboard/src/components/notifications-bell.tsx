import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell, Check } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/crm-queries";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

export function NotificationsBell() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: items = [], isSuccess } = useQuery({
    queryKey: ["notifications", profile?.id],
    queryFn: () => fetchNotifications(profile!.id),
    enabled: !!profile?.id,
    refetchInterval: 60_000,
  });

  const unread = items.filter((n) => !n.read).length;

  // Ring the bell straight away whenever the unread count goes up (new notifications arrived).
  // While anything is unread it also gives a short reminder ring every few seconds (CSS, see .bell-ring).
  const [ringKey, setRingKey] = useState(0);
  const prevUnread = useRef<number | null>(null);
  useEffect(() => {
    if (!isSuccess) return;
    if (prevUnread.current !== null && unread > prevUnread.current) setRingKey((k) => k + 1);
    prevUnread.current = unread;
  }, [isSuccess, items, unread]);

  const readOne = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", profile?.id] }),
  });
  const readAll = useMutation({
    mutationFn: () => markAllNotificationsRead(profile!.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", profile?.id] }),
  });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <span key={ringKey} className={unread > 0 ? "bell-ring inline-flex" : "inline-flex"}>
            <Bell className="h-5 w-5" />
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
            <Button variant="ghost" size="sm" onClick={() => readAll.mutate()}>
              <Check className="mr-1 h-3.5 w-3.5" /> Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-80">
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing yet.</p>
          ) : (
            <ul className="divide-y">
              {items.slice(0, 12).map((n) => (
                <li
                  key={n.id}
                  className={`px-4 py-3 text-sm transition-colors hover:bg-primary/[0.04] ${
                    n.read ? "" : "bg-primary/[0.05]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium leading-snug">{n.title}</p>
                      {n.message && <p className="text-xs text-muted-foreground">{n.message}</p>}
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {new Date(n.created_at).toLocaleString()}
                      </p>
                    </div>
                    {!n.read && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        aria-label="Mark read"
                        onClick={() => readOne.mutate(n.id)}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
        <div className="border-t px-4 py-3 text-center">
          <Link to="/notifications" className="text-xs text-primary hover:underline">
            View all notifications
          </Link>
          {unread > 0 && (
            <Badge variant="secondary" className="ml-2 rounded-full bg-amber-soft text-[11.5px] font-semibold text-gold-ink">
              {unread} unread
            </Badge>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
