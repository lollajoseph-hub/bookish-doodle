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

  const { data: items = [] } = useQuery({
    queryKey: ["notifications", profile?.id],
    queryFn: () => fetchNotifications(profile!.id),
    enabled: !!profile?.id,
    refetchInterval: 60_000,
  });

  const unread = items.filter((n) => !n.read).length;

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
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-amber px-1 text-[10px] font-semibold text-amber-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
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
                  className={`px-3 py-2.5 text-sm transition-colors hover:bg-primary-soft/60 ${
                    n.read ? "" : "bg-amber/10"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{n.title}</p>
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
        <div className="border-t px-3 py-2 text-center">
          <Link to="/notifications" className="text-xs text-primary hover:underline">
            View all notifications
          </Link>
          {unread > 0 && (
            <Badge variant="secondary" className="ml-2">
              {unread} unread
            </Badge>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
