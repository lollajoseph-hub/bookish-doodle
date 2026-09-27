import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  MessageSquare,
  Send,
  CalendarClock,
  PhoneCall,
  FolderOpen,
  Building2,
  UserRound,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { MatchStatusBadge, RequestStatusBadge } from "@/components/match-status";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  fetchCandidateThreadContext,
  fetchInbox,
  fetchThreadMessages,
  getLastRead,
  getOrCreateThread,
  markRead,
  sendThreadMessage,
  threadTargetKey,
  type CandidateInboxItem,
  type GeneralInboxItem,
  type InboxItem,
  type StructuredType,
  type ThreadMessageRow,
  type ThreadRow,
  type ThreadTarget,
} from "@/lib/messages-queries";

interface MessagesSearch {
  match?: string;
}

export const Route = createFileRoute("/messages")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): MessagesSearch => ({
    match: typeof search.match === "string" ? search.match : undefined,
  }),
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

interface StructuredMeta {
  label: string;
  body: string;
  icon: typeof Send;
  chip: string;
}

/** Display metadata for structured messages (older types kept so history still renders). */
const STRUCTURED_META: Record<StructuredType, StructuredMeta> = {
  reschedule_request: {
    label: "Request Reschedule",
    body: "Requesting to reschedule this interview.",
    icon: CalendarClock,
    chip: "bg-amber-soft text-amber-foreground border-amber/40",
  },
  call_me_asap: {
    label: "Call Me ASAP",
    body: "Please call me as soon as possible.",
    icon: PhoneCall,
    chip: "bg-destructive/10 text-destructive border-destructive/30",
  },
  send_portfolio: {
    label: "Send Portfolio",
    body: "Sending over the candidate's portfolio/work samples now.",
    icon: FolderOpen,
    chip: "bg-primary-soft text-primary border-primary/30",
  },
};

type Selection =
  | { kind: "request"; id: string }
  | { kind: "general"; id: string }
  | { kind: "candidate"; id: string };

function isUnread(thread: ThreadRow | null, lastMessage: ThreadMessageRow | null, userId: string) {
  if (!thread || !lastMessage || !userId || lastMessage.sender_role !== "client") return false;
  const lastRead = getLastRead(userId, thread.id);
  return !lastRead || lastRead < lastMessage.created_at;
}

function MessagesPage() {
  const { session } = useAuth();
  const userId = session?.user.id ?? "";
  const queryClient = useQueryClient();
  const search_ = Route.useSearch();
  const navigate = useNavigate();
  const [selection, setSelection] = useState<Selection | null>(
    search_.match ? { kind: "candidate", id: search_.match } : null,
  );
  const [search, setSearch] = useState("");
  const [readTick, setReadTick] = useState(0);
  const [activeTab, setActiveTab] = useState<Selection["kind"]>(search_.match ? "candidate" : "general");

  useEffect(() => {
    if (search_.match) {
      setSelection({ kind: "candidate", id: search_.match });
      setActiveTab("candidate");
    }
  }, [search_.match]);

  const select = (s: Selection) => {
    setSelection(s);
    setActiveTab(s.kind);
    if (search_.match) navigate({ to: "/messages", search: {}, replace: true });
  };

  const { data: inbox, isLoading } = useQuery({
    queryKey: ["inbox"],
    queryFn: fetchInbox,
    refetchInterval: 30000,
  });
  const requestItems = inbox?.requests ?? [];
  const generalItems = inbox?.generals ?? [];
  const candidateItems = inbox?.candidates ?? [];
  const unreadCounts = {
    general: generalItems.filter((i) => isUnread(i.thread, i.lastMessage, userId)).length,
    candidate: candidateItems.filter((i) => isUnread(i.thread, i.lastMessage, userId)).length,
    request: requestItems.filter((i) => isUnread(i.thread, i.lastMessage, userId)).length,
  };

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

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return requestItems;
    return requestItems.filter((i) =>
      [i.request.clientName, i.request.roleName, i.request.title]
        .filter(Boolean)
        .some((s) => s!.toLowerCase().includes(q)),
    );
  }, [requestItems, q]);
  const filteredGenerals = useMemo(
    () => (q ? generalItems.filter((g) => g.clientName.toLowerCase().includes(q)) : generalItems),
    [generalItems, q],
  );
  const filteredCandidates = useMemo(() => {
    if (!q) return candidateItems;
    return candidateItems.filter((c) =>
      [c.candidateName, c.clientName, c.requestTitle]
        .filter(Boolean)
        .some((s) => s!.toLowerCase().includes(q)),
    );
  }, [candidateItems, q]);

  const selectedRequest =
    selection?.kind === "request"
      ? (requestItems.find((i) => i.request.id === selection.id) ?? null)
      : null;
  const selectedGeneral =
    selection?.kind === "general"
      ? (generalItems.find((g) => g.clientId === selection.id) ?? null)
      : null;

  let workspace: ReactNode = null;
  if (selectedRequest) {
    workspace = (
      <RequestWorkspace
        key={`r-${selectedRequest.request.id}`}
        item={selectedRequest}
        userId={userId}
        onRead={() => setReadTick((t) => t + 1)}
      />
    );
  } else if (selectedGeneral) {
    workspace = (
      <GeneralWorkspace
        key={`g-${selectedGeneral.clientId}`}
        item={selectedGeneral}
        userId={userId}
        onRead={() => setReadTick((t) => t + 1)}
      />
    );
  } else if (selection?.kind === "candidate") {
    workspace = (
      <CandidateWorkspace
        key={`c-${selection.id}`}
        matchId={selection.id}
        userId={userId}
        onRead={() => setReadTick((t) => t + 1)}
      />
    );
  }

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
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as Selection["kind"])} className="flex min-h-0 flex-1 flex-col">
            <TabsList className="mx-2 mt-2 grid h-auto grid-cols-3 gap-0.5 p-0.5">
              {([ ["general", "General"], ["candidate", "Candidates"], ["request", "Requests"] ] as const).map(([kind, label]) => (
                <TabsTrigger key={kind} value={kind} className="min-w-0 gap-1 px-1 py-1.5 text-xs">
                  <span className="truncate">{label}</span>
                  {unreadCounts[kind] > 0 && (
                    <span className="grid h-4 min-w-4 shrink-0 place-items-center rounded-full bg-amber px-1 text-[10px] font-semibold text-amber-foreground">
                      {unreadCounts[kind] > 9 ? "9+" : unreadCounts[kind]}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading ? (
              <p className="p-4 text-sm text-muted-foreground">Loading…</p>
            ) : (
              <>
                <TabsContent value="general" className="m-0">
                  {filteredGenerals.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No conversations.</p> :
                    filteredGenerals.map((g) => (
                      <ThreadListRow
                        key={`g-${g.clientId}`}
                        icon={Building2}
                        title={`General — ${g.clientName}`}
                        subtitle="Client team channel"
                        thread={g.thread}
                        lastMessage={g.lastMessage}
                        userId={userId}
                        active={selection?.kind === "general" && selection.id === g.clientId}
                        readTick={readTick}
                        onClick={() => select({ kind: "general", id: g.clientId })}
                      />
                    ))}
                </TabsContent>
                <TabsContent value="candidate" className="m-0">
                  {filteredCandidates.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No conversations.</p> :
                    filteredCandidates.map((c) => (
                      <ThreadListRow
                        key={`c-${c.matchId}`}
                        icon={UserRound}
                        title={c.candidateName}
                        subtitle={
                          [c.clientName, c.requestTitle].filter(Boolean).join(" — ") || "Candidate conversation"
                        }
                        thread={c.thread}
                        lastMessage={c.lastMessage}
                        userId={userId}
                        active={selection?.kind === "candidate" && selection.id === c.matchId}
                        readTick={readTick}
                        onClick={() => select({ kind: "candidate", id: c.matchId })}
                      />
                    ))}
                </TabsContent>
                <TabsContent value="request" className="m-0">
                {filtered.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">No conversations.</p>
                ) : (
                  filtered.map((item) => (
                    <ThreadListRow
                      key={item.request.id}
                      title={item.request.clientName ?? "Unknown client"}
                      subtitle={item.request.title || item.request.roleName || "Request"}
                      thread={item.thread}
                      lastMessage={item.lastMessage}
                      userId={userId}
                      active={selection?.kind === "request" && selection.id === item.request.id}
                      readTick={readTick}
                      onClick={() => select({ kind: "request", id: item.request.id })}
                    />
                  ))
                )}
                </TabsContent>
              </>
            )}
          </div>
          </Tabs>
        </section>

        {workspace ?? (
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

function ThreadListRow({
  icon: Icon,
  title,
  subtitle,
  thread,
  lastMessage,
  userId,
  active,
  onClick,
}: {
  icon?: typeof Send;
  title: string;
  subtitle: string;
  thread: ThreadRow | null;
  lastMessage: ThreadMessageRow | null;
  userId: string;
  active: boolean;
  readTick: number;
  onClick: () => void;
}) {
  const unread = isUnread(thread, lastMessage, userId);

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
        <span
          className={cn(
            "flex min-w-0 items-center gap-1.5 truncate text-sm",
            unread ? "font-bold" : "font-medium",
          )}
        >
          {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />}
          <span className="truncate">{title}</span>
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {lastMessage ? formatDistanceToNow(new Date(lastMessage.created_at), { addSuffix: true }) : ""}
        </span>
      </div>
      <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
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

function RequestWorkspace({
  item,
  userId,
  onRead,
}: {
  item: InboxItem;
  userId: string;
  onRead: () => void;
}) {
  const requestId = item.request.id;
  return (
    <ThreadWorkspace
      target={{ kind: "request", clientRequestId: requestId }}
      initialThread={item.thread}
      title={item.request.clientName ?? "Client"}
      subtitle={item.request.title || item.request.roleName || ""}
      userId={userId}
      onRead={onRead}
      quickActions={[]}
      side={
        <div className="space-y-4">
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
        <CompanyCard clientId={item.request.client_id} clientName={item.request.clientName} />
        </div>
      }
    />
  );
}

function GeneralWorkspace({
  item,
  userId,
  onRead,
}: {
  item: GeneralInboxItem;
  userId: string;
  onRead: () => void;
}) {
  return (
    <ThreadWorkspace
      target={{ kind: "general", clientId: item.clientId }}
      initialThread={item.thread}
      title={`General — ${item.clientName}`}
      subtitle="Standing channel with this client's team"
      userId={userId}
      onRead={onRead}
      quickActions={[]}
      side={
        <CompanyCard clientId={item.clientId} clientName={item.clientName} />
      }
    />
  );
}

function CandidateWorkspace({
  matchId,
  userId,
  onRead,
}: {
  matchId: string;
  userId: string;
  onRead: () => void;
}) {
  const { data: ctx, error } = useQuery({
    queryKey: ["candidate-thread-context", matchId],
    queryFn: () => fetchCandidateThreadContext(matchId),
  });
  useEffect(() => {
    if (error) toast.error((error as Error).message);
  }, [error]);

  const quickActions: StructuredType[] =
    ctx?.status === "interview_confirmed" ? ["reschedule_request"] : [];

  return (
    <ThreadWorkspace
      target={{ kind: "candidate", candidateMatchId: matchId }}
      initialThread={null}
      title={ctx ? `${ctx.candidateName} — ${ctx.clientName ?? "Client"}` : "Candidate conversation"}
      subtitle={ctx?.requestTitle ?? ""}
      userId={userId}
      onRead={onRead}
      quickActions={quickActions}
      side={
        <div className="space-y-4">
        <div className="card-amber rounded-2xl border bg-card p-5 text-sm">
          <h3 className="mb-3 flex items-center gap-2 font-semibold">
            <UserRound className="h-4 w-4 text-primary" /> Candidate
          </h3>
          {ctx ? (
            <dl className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Candidate</dt>
                <dd>
                  <Link
                    to="/candidates/$candidateId"
                    params={{ candidateId: ctx.candidateId }}
                    className="font-medium text-primary hover:underline"
                  >
                    {ctx.candidateName}
                  </Link>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Request</dt>
                <dd>
                  <Link
                    to="/requests/$requestId"
                    params={{ requestId: ctx.clientRequestId }}
                    className="font-medium text-primary hover:underline"
                  >
                    {ctx.requestTitle || "Open"}
                  </Link>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <MatchStatusBadge status={ctx.status as never} />
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-muted-foreground">Loading…</p>
          )}
        </div>
        {ctx && <CompanyCard clientId={ctx.clientId} clientName={ctx.clientName} />}
        </div>
      }
    />
  );
}

function CompanyCard({ clientId, clientName }: { clientId: string | null | undefined; clientName: string | null | undefined }) {
  return (
    <div className="card-amber rounded-2xl border bg-card p-5 text-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold">
          <Building2 className="h-4 w-4 text-primary" /> Company
        </h3>
        {clientId && (
          <Link to="/clients/$clientId" params={{ clientId }} className="text-xs font-medium text-primary hover:underline">
            Open
          </Link>
        )}
      </div>
      <p className="font-medium">{clientName ?? "—"}</p>
    </div>
  );
}

function ThreadWorkspace({
  target,
  initialThread,
  title,
  subtitle,
  userId,
  onRead,
  quickActions,
  side,
}: {
  target: ThreadTarget;
  initialThread: ThreadRow | null;
  title: string;
  subtitle: string;
  userId: string;
  onRead: () => void;
  quickActions: StructuredType[];
  side: ReactNode;
}) {
  const queryClient = useQueryClient();

  const { data: thread, error: threadError } = useQuery({
    queryKey: ["thread", target.kind, threadTargetKey(target)],
    queryFn: () => (initialThread ? Promise.resolve(initialThread) : getOrCreateThread(target)),
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
    <section className="flex min-h-0 flex-col gap-4 lg:col-span-3 lg:overflow-y-auto">
      <div className="card-amber flex min-h-[400px] flex-1 flex-col rounded-2xl border bg-card">
        <div className="border-b px-5 py-3">
          <div className="font-semibold">{title}</div>
          {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
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
          {quickActions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {quickActions.map((type) => {
                const a = STRUCTURED_META[type];
                const Icon = a.icon;
                return (
                  <Button
                    key={type}
                    size="sm"
                    variant="outline"
                    disabled={!threadId || send.isPending}
                    onClick={() => send.mutate({ body: a.body, type })}
                  >
                    <Icon className="mr-1 h-3.5 w-3.5" />
                    {a.label}
                  </Button>
                );
              })}
            </div>
          )}
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
      </div>
      <div className="shrink-0">{side}</div>
    </section>
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
  const action = m.structured_type ? (STRUCTURED_META[m.structured_type] ?? null) : null;
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

