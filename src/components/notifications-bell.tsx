import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchRecentNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/queries";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function NotificationsBell({ userId, unread }: { userId: string; unread: number }) {
  const qc = useQueryClient();
  const listKey = ["notifications-recent", userId] as const;
  const unreadKey = ["unread-notifications", userId] as const;

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: listKey,
    queryFn: () => fetchRecentNotifications(userId, 10),
    enabled: !!userId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: unreadKey });
    qc.invalidateQueries({ queryKey: listKey });
  };

  const markOne = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: invalidate,
  });

  const markAll = useMutation({
    mutationFn: () => markAllNotificationsRead(userId),
    onSuccess: invalidate,
  });

  return (
    <Popover
      onOpenChange={(o) => {
        if (o) refetch();
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="text-sm font-semibold">Notifications</div>
          <Button
            variant="ghost"
            size="sm"
            disabled={unread === 0 || markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            Mark all read
          </Button>
        </div>
        <div className="max-h-[360px] overflow-y-auto">
          {isLoading || (isFetching && !data) ? (
            <div className="p-3 space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : isError ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              <div>Couldn't load notifications.</div>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          ) : !data || data.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              You're all caught up.
            </div>
          ) : (
            <ul className="divide-y">
              {data.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!n.read) markOne.mutate(n.id);
                    }}
                    className={`w-full text-left px-4 py-3 hover:bg-accent transition-colors flex gap-3 ${
                      n.read ? "" : "bg-primary/5"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        n.read ? "bg-transparent" : "bg-primary"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium truncate">
                          {n.title || "Notification"}
                        </div>
                        <div className="text-[11px] text-muted-foreground shrink-0">
                          {timeAgo(n.created_at)}
                        </div>
                      </div>
                      {n.message && (
                        <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                          {n.message}
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
