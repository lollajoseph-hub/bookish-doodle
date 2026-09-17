import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Mail } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/lib/auth";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/crm-queries";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/notifications")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Notifications | Candidate Review System" },
      { name: "description", content: "Your alerts about candidate matches, requests and placements." },
      { property: "og:title", content: "Notifications | Candidate Review System" },
      { property: "og:description", content: "Alerts for recruiters and admins." },
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
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      <div className="space-y-2">
        {items.map((n) => (
          <div
            key={n.id}
            className={`flex items-start justify-between gap-3 rounded-2xl border bg-card p-4 transition-all hover:border-primary/50 ${
              n.read ? "" : "border-amber/60 bg-amber/5"
            }`}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{n.title}</span>
                {n.type && <Badge variant="secondary">{n.type}</Badge>}
                {n.email_sent_at && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Mail className="h-3 w-3" /> emailed
                  </span>
                )}
              </div>
              {n.message && <p className="mt-1 text-sm text-muted-foreground">{n.message}</p>}
              <p className="mt-1 text-[11px] text-muted-foreground">
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
          <p className="text-sm text-muted-foreground">No notifications yet.</p>
        )}
      </div>
    </AppShell>
  );
}
