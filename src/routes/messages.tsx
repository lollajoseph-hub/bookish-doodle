import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { MessageSquare, Send, CalendarClock, PhoneCall, FolderOpen } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { RequestStatusBadge } from "@/components/match-status";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  fetchInbox,
  fetchScratchpad,
  fetchThreadMessages,
  getLastRead,
  getOrCreateThread,
  markRead,
  sendThreadMessage,
  updateScratchpad,
  type InboxItem,
  type StructuredType,
  type ThreadMessageRow,
  type ThreadScratchpadRow,
} from "@/lib/messages-queries";

export const Route = createFileRoute("/messages")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Messages | Candidate Review System" },
      { name: "description", content: "Recruiter inbox for conversations with clients on each request." },
      { property: "og:title", content: "Messages | Candidate Review System" },
      { property: "og:description", content: "Chat with clients and keep shared hiring notes per request." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MessagesPage,
});

const QUICK_ACTIONS: Array<{
  type: StructuredType;
  label: string;
  body: string;
  icon: typeof Send;
  chip: string;
}> = [
  {
    type: "reschedule_request",
    label: "Request Reschedule",
    body: "Requesting to reschedule this interview.",
    icon: CalendarClock,
    chip: "bg-amber-soft text-amber-foreground border-amber/40",
  },
  {
    type: "call_me_asap",
    label: "Call Me ASAP",
    body: "Please call me as soon as possible.",
    icon: PhoneCall,
    chip: "bg-destructive/10 text-destructive border-destructive/30",
  },
  {
    type: "send_portfolio",
    label: "Send Portfolio",
    body: "Sending over the candidate's portfolio/work samples now.",
    icon: FolderOpen,
    chip: "bg-primary-soft text-primary border-primary/30",
  },
];

function MessagesPage() {
  const { session } = useAuth();
  const userId = session?.user.id ?? "";
  const queryClient = useQueryClient();
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [readTick, setReadTick] = useState(0);

  const { data: inbox = [], isLoading } = useQuery({
    queryKey: ["inbox"],
    queryFn: fetchInbox,
    refetchInterval: 30000,
  });

  // Refresh inbox whenever any message lands anywhere
  useEffect(() => {
    const ch = supabase
      .channel("inbox-all-messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "thread_messages" },
        () => queryClient.invalidateQueries({ queryKey: ["inbox"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [queryClient]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return inbox;
    return inbox.filter((i) =>
      [i.request.clientName, i.request.roleName, i.request.title]
        .filter(Boolean)
        .some((s) => s!.toLowerCase().includes(q)),
    );
  }, [inbox, search]);

  const selected = inbox.find((i) => i.request.id === selectedRequestId) ?? null;

  return (
    <AppShell title="Messages">
      <div className="grid h-[calc(100vh-10rem)] min-h-[560px] grid-cols-1 gap-4 lg:grid-cols-4">
        {/* Column 1: thread list */}
        <section className="card-amber flex min-h-0 flex-col rounded-2xl border bg-card lg:col-span-1">
          <div className="border-b p-3">
            <Input
              placeholder="Search client or role…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading ? (
              <p className="p-4 text-sm text-muted-foreground">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No conversations.</p>
            ) : (
              filtered.map((item) => (
                <ThreadListItem
                  key={item.request.id}
                  item={item}
                  userId={userId}
                  active={item.request.id === selectedRequestId}
                  readTick={readTick}
                  onClick={() => setSelectedRequestId(item.request.id)}
                />
              ))
            )}
          </div>
        </section>

        {selected ? (
          <ThreadWorkspace
            key={selected.request.id}
            item={selected}
            userId={userId}
            onRead={() => setReadTick((t) => t + 1)}
          />
        ) : (
          <section className="card-amber flex items-center justify-center rounded-2xl border bg-card p-8 text-center lg:col-span-3">
            <div className="text-muted-foreground">
              <MessageSquare className="mx-auto mb-2 h-8 w-8" />
              <p className="text-sm">Select a conversation to start messaging.</p>
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}

function ThreadListItem({
  item,
  userId,
  active,
  onClick,
}: {
  item: InboxItem;
  userId: string;
  active: boolean;
  readTick: number;
  onClick: () => void;
}) {
  const { request, thread, lastMessage } = item;
  const lastRead = thread && userId ? getLastRead(userId, thread.id) : null;
  const unread =
    !!lastMessage &&
    lastMessage.sender_id !== userId &&
    (!lastRead || lastRead < lastMessage.created_at);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "block w-full border-b px-4 py-3 text-left transition-colors hover:bg-muted",
        active && "bg-primary-soft",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cn("truncate text-sm", unread ? "font-bold" : "font-medium")}>
          {request.clientName ?? "Unknown client"}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {lastMessage ? formatDistanceToNow(new Date(lastMessage.created_at), { addSuffix: true }) : ""}
        </span>
      </div>
      <div className="truncate text-xs text-muted-foreground">
        {request.title || request.roleName || "Request"}
      </div>
      <div className="mt-1 flex items-center gap-2">
        {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-amber" />}
        <span
          className={cn(
            "truncate text-xs",
            unread ? "font-semibold text-foreground" : "text-muted-foreground",
          )}
        >
          {lastMessage
            ? `${lastMessage.sender_role === "staff" ? "You: " : ""}${lastMessage.body}`
            : "No messages yet"}
        </span>
      </div>
    </button>
  );
}

function ThreadWorkspace({
  item,
  userId,
  onRead,
}: {
  item: InboxItem;
  userId: string;
  onRead: () => void;
}) {
  const queryClient = useQueryClient();
  const requestId = item.request.id;

  const { data: thread, error: threadError } = useQuery({
    queryKey: ["thread", "request", requestId],
    queryFn: () => (item.thread ? Promise.resolve(item.thread) : getOrCreateThread(requestId)),
    staleTime: Infinity,
  });

  useEffect(() => {
    if (threadError) toast.error((threadError as Error).message);
  }, [threadError]);

  const threadId = thread?.id;

  const { data: messages = [] } = useQuery({
    queryKey: ["thread-messages", threadId],
    queryFn: () => fetchThreadMessages(threadId!),
    enabled: !!threadId,
  });

  // Live updates
  useEffect(() => {
    if (!threadId) return;
    const ch = supabase
      .channel(`thread-messages-${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "thread_messages",
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const msg = payload.new as ThreadMessageRow;
          queryClient.setQueryData<ThreadMessageRow[]>(["thread-messages", threadId], (old = []) =>
            old.some((m) => m.id === msg.id) ? old : [...old, msg],
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [threadId, queryClient]);

  // Mark as read whenever messages change while viewing
  useEffect(() => {
    if (!threadId || !userId) return;
    const last = messages[messages.length - 1];
    if (last) {
      markRead(userId, threadId, last.created_at);
      onRead();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, userId, messages]);

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const [draft, setDraft] = useState("");
  const send = useMutation({
    mutationFn: (v: { body: string; type: StructuredType | null }) =>
      sendThreadMessage(threadId!, v.body, v.type),
    onSuccess: (msg, v) => {
      if (!v.type) setDraft("");
      queryClient.setQueryData<ThreadMessageRow[]>(["thread-messages", threadId], (old = []) =>
        old.some((m) => m.id === msg.id) ? old : [...old, msg],
      );
      queryClient.invalidateQueries({ queryKey: ["inbox"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = () => {
    const body = draft.trim();
    if (!body || !threadId) return;
    send.mutate({ body, type: null });
  };

  return (
    <>
      {/* Column 2: chat */}
      <section className="card-amber flex min-h-0 flex-col rounded-2xl border bg-card lg:col-span-2">
        <div className="border-b px-5 py-3">
          <div className="font-semibold">{item.request.clientName ?? "Client"}</div>
          <div className="text-xs text-muted-foreground">
            {item.request.title || item.request.roleName}
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {!threadId ? (
            <p className="text-sm text-muted-foreground">Opening conversation…</p>
          ) : messages.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">
              No messages yet. Say hello to the client.
            </p>
          ) : (
            messages.map((m) => <MessageBubble key={m.id} m={m} />)
          )}
          <div ref={bottomRef} />
        </div>
        <div className="space-y-2 border-t p-3">
          <div className="flex flex-wrap gap-2">
            {QUICK_ACTIONS.map((a) => {
              const Icon = a.icon;
              return (
                <Button
                  key={a.type}
                  size="sm"
                  variant="outline"
                  disabled={!threadId || send.isPending}
                  onClick={() => send.mutate({ body: a.body, type: a.type })}
                >
                  <Icon className="mr-1 h-3.5 w-3.5" />
                  {a.label}
                </Button>
              );
            })}
          </div>
          <div className="flex items-end gap-2">
            <Textarea
              rows={2}
              placeholder="Write a message…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              className="min-h-[44px] resize-none"
            />
            <Button onClick={submit} disabled={!threadId || !draft.trim() || send.isPending}>
              <Send className="mr-1 h-4 w-4" /> Send
            </Button>
          </div>
        </div>
      </section>

      {/* Column 3: context + scratchpad */}
      <section className="flex min-h-0 flex-col gap-4 lg:col-span-1">
        <div className="card-amber rounded-2xl border bg-card p-5 text-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">Request details</h3>
            <Link
              to="/requests/$requestId"
              params={{ requestId }}
              className="text-xs font-medium text-primary hover:underline"
            >
              Open
            </Link>
          </div>
          <dl className="space-y-2">
            <Detail label="Client" value={item.request.clientName ?? "—"} />
            <Detail label="Role" value={item.request.roleName ?? "—"} />
            {item.request.title && <Detail label="Title" value={item.request.title} />}
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <RequestStatusBadge status={item.request.status} />
              </dd>
            </div>
            <Detail label="Candidates wanted" value={String(item.request.candidates_wanted)} />
            <Detail label="Matches" value={String(item.request.matchCount)} />
          </dl>
        </div>
        {threadId ? (
          <Scratchpad threadId={threadId} userId={userId} />
        ) : (
          <div className="card-amber flex-1 rounded-2xl border bg-card p-5" />
        )}
      </section>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate text-right font-medium">{value}</dd>
    </div>
  );
}

function MessageBubble({ m }: { m: ThreadMessageRow }) {
  const mine = m.sender_role === "staff";
  const action = m.structured_type ? QUICK_ACTIONS.find((a) => a.type === m.structured_type) : null;
  const time = format(new Date(m.created_at), "MMM d, h:mm a");

  if (action) {
    const Icon = action.icon;
    return (
      <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
        <div className="max-w-[80%]">
          <div
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold",
              action.chip,
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {action.label}
          </div>
          <p className={cn("mt-1 text-xs text-muted-foreground", mine && "text-right")}>
            {m.body} · {time}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div className="max-w-[75%]">
        <div
          className={cn(
            "whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm",
            mine
              ? "rounded-br-sm bg-primary text-primary-foreground"
              : "rounded-bl-sm bg-muted text-foreground",
          )}
        >
          {m.body}
        </div>
        <p className={cn("mt-1 text-[11px] text-muted-foreground", mine && "text-right")}>
          {mine ? "You" : "Client"} · {time}
        </p>
      </div>
    </div>
  );
}

function Scratchpad({ threadId, userId }: { threadId: string; userId: string }) {
  const [content, setContent] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [pendingRemote, setPendingRemote] = useState<string | null>(null);
  const focusedRef = useRef(false);
  const dirtyRef = useRef(false);
  const lastSavedRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchScratchpad(threadId)
      .then((row) => {
        if (cancelled) return;
        const c = row?.content ?? "";
        setContent(c);
        lastSavedRef.current = c;
        setLoaded(true);
      })
      .catch((e: Error) => toast.error(e.message));
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  useEffect(() => {
    const ch = supabase
      .channel(`thread-scratchpad-${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "thread_scratchpad",
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const row = payload.new as ThreadScratchpadRow;
          if (!row || row.updated_by === userId) return;
          const incoming = row.content ?? "";
          if (incoming === lastSavedRef.current) return;
          if (focusedRef.current || dirtyRef.current) {
            setPendingRemote(incoming);
            toast.info("Client updated the Hiring Huddle notes");
          } else {
            lastSavedRef.current = incoming;
            setContent(incoming);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [threadId, userId]);

  const save = async (value: string) => {
    setStatus("saving");
    try {
      await updateScratchpad(threadId, value);
      lastSavedRef.current = value;
      dirtyRef.current = false;
      setStatus("saved");
    } catch (e) {
      toast.error((e as Error).message);
      setStatus("idle");
    }
  };

  // Flush pending save on unmount/thread change
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const onChange = (v: string) => {
    setContent(v);
    dirtyRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => save(v), 800);
  };

  const applyRemote = () => {
    if (pendingRemote == null) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    lastSavedRef.current = pendingRemote;
    dirtyRef.current = false;
    setContent(pendingRemote);
    setPendingRemote(null);
  };

  return (
    <div className="card-amber flex min-h-0 flex-1 flex-col rounded-2xl border bg-card p-5">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">Hiring Huddle Notes</h3>
          <p className="text-xs text-muted-foreground">Shared with the client on this request.</p>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : ""}
        </span>
      </div>
      {pendingRemote != null && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-amber/40 bg-amber-soft px-3 py-1.5 text-xs text-amber-foreground">
          <span>Client made changes.</span>
          <button type="button" className="font-semibold underline" onClick={applyRemote}>
            Load latest
          </button>
        </div>
      )}
      <Textarea
        value={content}
        disabled={!loaded}
        placeholder="Jot down shared notes, next steps, feedback…"
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          focusedRef.current = true;
        }}
        onBlur={() => {
          focusedRef.current = false;
        }}
        className="min-h-[160px] flex-1 resize-none"
      />
    </div>
  );
}
