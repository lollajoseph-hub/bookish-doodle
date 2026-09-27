import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import { useMembership } from "@/lib/membership";
import { useAuth } from "@/lib/auth";
import { MATCH_SELECT, type MatchRow } from "@/components/candidate-card";
import { ChatFeed, Composer, actionsFor, getLastRead, useThread, type ThreadTarget } from "@/components/request-messages";
import { displayName, formatDateTime } from "@/lib/matches";
import { usePollingRefresh } from "@/hooks/use-polling-refresh";
import { MessageSquare } from "lucide-react";

interface MessagesSearch {
  request?: string;
  candidate?: string;
  general?: boolean;
}

export const Route = createFileRoute("/messages")({
  validateSearch: (search: Record<string, unknown>): MessagesSearch => ({
    request: typeof search.request === "string" ? search.request : undefined,
    candidate: typeof search.candidate === "string" ? search.candidate : undefined,
    general: search.general === true || search.general === "true" ? true : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Messages — Candidate Pool" },
      { name: "description", content: "All your conversations with ScaleSource — general, per request, and per candidate — in one place." },
      { property: "og:title", content: "Messages — Candidate Pool" },
      { property: "og:description", content: "All your conversations with ScaleSource in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <MessagesPage />
    </AppShell>
  ),
});

interface RequestItem {
  id: string;
  status: string | null;
  job_roles: { name: string | null } | null;
}

interface LastMessage {
  body: string;
  created_at: string;
  sender_role: "staff" | "client";
}

interface Row {
  key: string;
  target: ThreadTarget;
  title: string;
  subtitle: string;
  matchStatus?: string | null;
  threadId: string | null;
  lastMessage: LastMessage | null;
  unread: boolean;
}

function statusText(s: string | null | undefined) {
  if (!s) return "";
  return s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function formatRelative(iso: string) {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function MessagesPage() {
  const { membership } = useMembership();
  const { user } = useAuth();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/messages" });
  const [requests, setRequests] = useState<RequestItem[] | null>(null);
  const [matches, setMatches] = useState<MatchRow[] | null>(null);
  const [threadByTarget, setThreadByTarget] = useState<Record<string, string>>({});
  const [lastByThread, setLastByThread] = useState<Record<string, LastMessage>>({});
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [reqRes, matchRes, threadRes] = await Promise.all([
      supabase.from("client_requests").select("id,status,job_roles(name)").order("created_at", { ascending: false }),
      supabase.from("candidate_matches").select(MATCH_SELECT).neq("status", "rejected"),
      supabase.from("threads").select("id,client_request_id,candidate_match_id,client_id,kind"),
    ]);
    if (reqRes.error || matchRes.error || threadRes.error) setErr((reqRes.error ?? matchRes.error ?? threadRes.error)!.message);
    else setErr(null);
    setRequests((reqRes.data ?? []) as unknown as RequestItem[]);
    setMatches((matchRes.data ?? []) as unknown as MatchRow[]);

    const targetMap: Record<string, string> = {};
    const threadIds: string[] = [];
    for (const t of threadRes.data ?? []) {
      const targetId = t.kind === "request" ? t.client_request_id : t.kind === "candidate" ? t.candidate_match_id : t.client_id;
      if (!targetId) continue;
      targetMap[`${t.kind}:${targetId}`] = t.id;
      threadIds.push(t.id);
    }
    setThreadByTarget(targetMap);

    if (threadIds.length === 0) {
      setLastByThread({});
      return;
    }
    const msgRes = await supabase
      .from("thread_messages")
      .select("thread_id,sender_id,sender_role,body,created_at")
      .in("thread_id", threadIds)
      .order("created_at", { ascending: false });
    const latest: Record<string, LastMessage> = {};
    for (const m of msgRes.data ?? []) {
      if (!latest[m.thread_id]) {
        latest[m.thread_id] = { body: m.body, created_at: m.created_at, sender_role: m.sender_role as "staff" | "client" };
      }
    }
    setLastByThread(latest);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  usePollingRefresh(load, 20000);

  const roleById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of requests ?? []) m[r.id] = r.job_roles?.name ?? "Hiring request";
    return m;
  }, [requests]);

  const enrich = useCallback(
    (base: Omit<Row, "threadId" | "lastMessage" | "unread">): Row => {
      const threadId = threadByTarget[base.key] ?? null;
      const lastMessage = threadId ? (lastByThread[threadId] ?? null) : null;
      const lastRead = threadId && user ? getLastRead(user.id, threadId) : null;
      const unread = !!lastMessage && lastMessage.sender_role === "staff" && (!lastRead || new Date(lastMessage.created_at) > new Date(lastRead));
      return { ...base, threadId, lastMessage, unread };
    },
    [threadByTarget, lastByThread, user]
  );

  const general: Row | null = membership?.client_id
    ? enrich({ key: `general:${membership.client_id}`, target: { kind: "general", id: membership.client_id }, title: "ScaleSource team", subtitle: "General conversation" })
    : null;
  const requestRows: Row[] = (requests ?? [])
    .map((r) =>
      enrich({
        key: `request:${r.id}`,
        target: { kind: "request", id: r.id },
        title: r.job_roles?.name ?? "Hiring request",
        subtitle: statusText(r.status),
      })
    )
    .filter((r) => r.threadId && r.lastMessage)
    .sort(byRecent);
  const candidateRows: Row[] = (matches ?? [])
    .map((m) =>
      enrich({
        key: `candidate:${m.id}`,
        target: { kind: "candidate", id: m.id },
        title: displayName(m.candidate_pool_profile?.full_name, m.status),
        subtitle: roleById[m.client_request_id] ?? "Hiring request",
        matchStatus: m.status,
      })
    )
    .filter((r) => r.threadId && r.lastMessage)
    .sort(byRecent);

  const selectedKey = search.candidate
    ? `candidate:${search.candidate}`
    : search.request
      ? `request:${search.request}`
      : general?.key ?? null;
  const all = [...(general ? [general] : []), ...requestRows, ...candidateRows];
  const selected = all.find((r) => r.key === selectedKey) ?? null;

  function select(row: Row) {
    const next: MessagesSearch =
      row.target.kind === "request" ? { request: row.target.id } : row.target.kind === "candidate" ? { candidate: row.target.id } : { general: true };
    navigate({ to: ".", search: next, replace: true });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
        <p className="text-sm text-muted-foreground">Every conversation with your ScaleSource team, in one place.</p>
      </div>
      {err && <p className="text-sm text-destructive">{err}</p>}
      <div className="grid h-[calc(100vh-14rem)] min-h-[480px] grid-cols-1 overflow-hidden rounded-xl border bg-card md:grid-cols-[300px_1fr]">
        <aside className="min-h-0 overflow-y-auto border-b md:border-b-0 md:border-r">
          <Section label="General" rows={general ? [general] : []} selectedKey={selectedKey} onSelect={select} empty="" />
          <Section label="Requests" rows={requestRows} selectedKey={selectedKey} onSelect={select} empty={requests === null ? "Loading…" : "No requests yet."} />
          <Section label="Candidates" rows={candidateRows} selectedKey={selectedKey} onSelect={select} empty={matches === null ? "Loading…" : "No candidates yet."} />
        </aside>
        <section className="flex min-h-0 flex-col">
          {selected ? (
            <ChatPane key={selected.key} row={selected} />
          ) : (
            <div className="grid flex-1 place-items-center p-8 text-center text-sm text-muted-foreground">
              {requests === null ? "Loading…" : "Select a conversation on the left."}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/** Rows with a message first, most recent first; the rest keep their order. */
function byRecent(a: Row, b: Row) {
  const ta = a.lastMessage?.created_at ?? null;
  const tb = b.lastMessage?.created_at ?? null;
  if (ta && tb) return tb.localeCompare(ta);
  if (ta) return -1;
  if (tb) return 1;
  return 0;
}

function Section({
  label,
  rows,
  selectedKey,
  onSelect,
  empty,
}: {
  label: string;
  rows: Row[];
  selectedKey: string | null;
  onSelect: (r: Row) => void;
  empty: string;
}) {
  if (rows.length === 0 && !empty) return null;
  return (
    <div className="py-2">
      <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      {rows.length === 0 ? (
        <p className="px-4 py-2 text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul>
          {rows.map((r) => (
            <ThreadListRow key={r.key} row={r} selected={r.key === selectedKey} onSelect={() => onSelect(r)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ThreadListRow({ row, selected, onSelect }: { row: Row; selected: boolean; onSelect: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`flex w-full items-start gap-2 px-4 py-2.5 text-left transition-colors ${
          selected ? "bg-primary-soft text-primary" : "hover:bg-muted"
        }`}
      >
        <MessageSquare className="mt-0.5 h-4 w-4 flex-none opacity-70" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-medium">{row.title}</span>
            {row.lastMessage && (
              <span className="flex-none text-[11px] text-muted-foreground">{formatRelative(row.lastMessage.created_at)}</span>
            )}
          </span>
          {row.subtitle && <span className="block truncate text-xs text-muted-foreground">{row.subtitle}</span>}
          {row.lastMessage && (
            <span className="block truncate text-xs text-muted-foreground">
              {row.lastMessage.sender_role === "client" ? "You: " : ""}
              {row.lastMessage.body}
            </span>
          )}
        </span>
        {row.unread && <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-amber-500" aria-label="Unread messages" />}
      </button>
    </li>
  );
}

function ChatPane({ row }: { row: Row }) {
  const { threadId, setThreadId, resolved, messages, err, latest, addMessage, userId } = useThread(row.target, true);
  return (
    <>
      <header className="border-b px-5 py-3">
        <h2 className="truncate font-semibold">{row.title}</h2>
        <p className="truncate text-xs text-muted-foreground">
          {row.subtitle}
          {latest ? ` · Last message ${formatDateTime(latest.created_at)}` : ""}
        </p>
      </header>
      {err && <p className="px-5 pt-3 text-xs text-destructive">{err}</p>}
      <ChatFeed messages={messages} userId={userId} />
      <Composer threadId={threadId} target={row.target} ready={resolved} onThreadCreated={setThreadId} actions={actionsFor(row.target.kind, row.matchStatus)} onSent={addMessage} />
    </>
  );
}
