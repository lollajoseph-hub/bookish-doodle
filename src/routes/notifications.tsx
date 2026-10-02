import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, Mail } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/lib/auth";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/crm-queries";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/notifications")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Notifications | ScaleSource Candidate Review Dashboard" },
      { name: "description", content: "Your alerts about candidate matches, requests and placements." },
      { property: "og:title", content: "Notifications | ScaleSource" },
      { property: "og:description", content: "Alerts for ScaleSource recruiters and admins." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["notifications", profile?.id],
    queryFn: () => fetchNotifications(profile!.id),
    enabled: !!profile?.id,
  });
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["notifications", profile?.id] });

  const readOne = useMutation({
    mutationFn: ({ id, read }: { id: string; read: boolean }) => markNotificationRead(id, read),
    onSuccess: invalidate,
  });
  const readAll = useMutation({
    mutationFn: () => markAllNotificationsRead(profile!.id),
    onSuccess: invalidate,
  });

  const unread = items.filter((n) => !n.read).length;

  return (
    <AppShell
      title="Notifications"
      description={unread ? `${unread} unread` : "You're all caught up"}
      actions={
        unread ? (
          <Button onClick={() => readAll.mutate()}>
            <Check className="mr-1 h-4 w-4" /> Mark all read
          </Button>
        ) : undefined
      }
    >
      {isLoading && (
        <div className="space-y-3" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-[92px] rounded-3xl bg-white/70" />
          <Skeleton className="h-[92px] rounded-3xl bg-white/70" />
          <Skeleton className="h-[92px] rounded-3xl bg-white/70" />
        </div>
      )}
      <div className="space-y-3">
        {items.map((n) => (
          <div
            key={n.id}
            className={`card-amber flex items-start justify-between gap-3 rounded-3xl p-5 transition-[box-shadow,border-color] duration-300 hover:border-[rgb(122_89_163/0.25)] hover:shadow-[0_22px_44px_-24px_rgb(46_16_73/0.5)] ${
              n.read ? "" : "border-[rgb(224_164_58/0.45)] bg-amber-soft/50"
            }`}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {!n.read && <span className="h-2 w-2 flex-none rounded-full bg-amber" />}
                <span className="font-medium">{n.title}</span>
                {n.type && <Badge variant="secondary" className="h-6 rounded-full border-transparent bg-primary-soft text-[11.5px] font-semibold text-primary">{n.type}</Badge>}
                {n.email_sent_at && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Mail className="h-3 w-3" /> emailed
                  </span>
                )}
              </div>
              {n.message && <p className="mt-1 text-sm text-muted-foreground">{n.message}</p>}
              <p className="mt-1.5 text-[11px] tabular-nums text-muted-foreground">
                {new Date(n.created_at).toLocaleString()}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => readOne.mutate({ id: n.id, read: !n.read })}
            >
              {n.read ? "Mark unread" : "Mark read"}
            </Button>
          </div>
        ))}
        {!isLoading && !items.length && (
          <div className="card-amber flex flex-col items-center gap-4 rounded-3xl border-dashed px-6 py-14 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-primary-soft to-amber-soft text-primary">
              <Bell className="h-7 w-7" />
            </div>
            <p className="font-display text-3xl font-medium">No notifications yet.</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
