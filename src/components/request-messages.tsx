import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CalendarClock, FileText, Loader2, MessageSquare, PhoneCall, Send } from "lucide-react";
import { formatDateTime } from "@/lib/matches";

type StructuredType = "reschedule_request" | "call_me_asap" | "send_portfolio";

export interface ThreadMessage {
  id: string;
  thread_id: string;
  sender_id: string | null;
  sender_role: "staff" | "client";
  body: string | null;
  structured_type: StructuredType | null;
  created_at: string;
}

export interface QuickAction {
  type: StructuredType;
  label: string;
  /** Message body sent with the action. */
  body: string;
  icon: typeof PhoneCall;
  tone: string;
}

/** Display metadata for every structured type (including legacy ones in old messages). */
export const ACTION_META: Record<StructuredType, QuickAction> = {
  reschedule_request: { type: "reschedule_request", label: "Request Reschedule", body: "Request Reschedule", icon: CalendarClock, tone: "bg-amber-100 text-amber-800 border-amber-300" },
  call_me_asap: { type: "call_me_asap", label: "Call Me ASAP", body: "Please call me as soon as possible.", icon: PhoneCall, tone: "bg-destructive/10 text-destructive border-destructive/30" },
  send_portfolio: { type: "send_portfolio", label: "Send Portfolio", body: "Send Portfolio", icon: FileText, tone: "bg-primary-soft text-primary border-primary/30" },
};

export type ThreadTarget =
  | { kind: "request"; id: string }
  | { kind: "candidate"; id: string }
  | { kind: "general"; id: string };

function lastReadKey(userId: string, threadId: string) {
  return `cp:thread-last-read:${userId}:${threadId}`;
}

/** Stored last-read timestamp for a thread, or null if never read. */
export function getLastRead(userId: string, threadId: string): string | null {
  return window.localStorage.getItem(lastReadKey(userId, threadId));
}

/**
 * Resolves (get_or_create_thread) a thread, loads its messages with realtime,
 * and tracks unread staff messages via a localStorage last-read marker.
 * Pass `null` to skip. `active` marks the thread read while true.
 */
export function useThread(target: ThreadTarget | null, active = false) {
  const { user } = useAuth();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [lastRead, setLastRead] = useState<string | null>(null);
  const kind = target?.kind ?? null;
  const targetId = target?.id ?? null;

  useEffect(() => {
    setThreadId(null);
    setMessages(null);
    setErr(null);
    if (!user || !kind || !targetId) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.rpc("get_or_create_thread", {
        p_client_request_id: kind === "request" ? targetId : null,
        p_candidate_match_id: kind === "candidate" ? targetId : null,
        p_client_id: kind === "general" ? targetId : null,
      });
      if (cancelled) return;
      if (error) {
        setErr(error.message);
        setMessages([]);
        return;
      }
      const row = (Array.isArray(data) ? data[0] : data) as { id: string } | string | null;
      const tid = typeof row === "string" ? row : row?.id;
      if (tid) setThreadId(tid);
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, targetId, user]);

  useEffect(() => {
    if (!user || !threadId) return;
    setLastRead(window.localStorage.getItem(lastReadKey(user.id, threadId)));
  }, [user, threadId]);

  useEffect(() => {
    if (!threadId) return;
    let cancelled = false;
    void supabase
      .from("thread_messages")
      .select("id,thread_id,sender_id,sender_role,body,structured_type,created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        setErr(error ? error.message : null);
        setMessages((data ?? []) as ThreadMessage[]);
      });
    const channel = supabase
      .channel(`thread-messages-${threadId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "thread_messages", filter: `thread_id=eq.${threadId}` },
        (payload) => {
          const m = payload.new as ThreadMessage;
          setMessages((prev) => ((prev ?? []).some((x) => x.id === m.id) ? prev : [...(prev ?? []), m]));
        }
      )
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [threadId]);

  const latest = messages && messages.length > 0 ? messages[messages.length - 1] : null;

  useEffect(() => {
    if (!active || !user || !threadId || !latest) return;
    window.localStorage.setItem(lastReadKey(user.id, threadId), latest.created_at);
    setLastRead(latest.created_at);
  }, [active, user, threadId, latest]);

  const unread = (messages ?? []).filter(
    (m) => m.sender_role === "staff" && (!lastRead || new Date(m.created_at) > new Date(lastRead))
  ).length;

  const addMessage = (m: ThreadMessage) =>
    setMessages((prev) => ((prev ?? []).some((x) => x.id === m.id) ? prev : [...(prev ?? []), m]));

  return { threadId, messages, err, unread, latest, addMessage, userId: user?.id ?? null };
}

function MessagesButton({
  target,
  label,
  search,
  variant = "outline",
}: {
  target: ThreadTarget;
  label: string;
  search: { request?: string; candidate?: string; general?: boolean };
  variant?: "outline" | "ghost";
}) {
  const navigate = useNavigate();
  const { unread } = useThread(target);
  return (
    <Button variant={variant} size="sm" className="relative" onClick={() => navigate({ to: "/messages", search })}>
      <MessageSquare className="mr-1.5 h-4 w-4" />
      {label}
      {unread > 0 && (
        <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Button>
  );
}

/** Opens the request thread in the unified Messages page. */
export function RequestMessages({ requestId }: { requestId: string }) {
  return <MessagesButton target={{ kind: "request", id: requestId }} label="Talk to us about this request" search={{ request: requestId }} />;
}

/** Opens the general ScaleSource thread in the unified Messages page. */
export function GeneralMessages({ clientId }: { clientId: string }) {
  return <MessagesButton target={{ kind: "general", id: clientId }} label="Messages" search={{ general: true }} variant="ghost" />;
}

/** Opens the candidate thread in the unified Messages page. */
export function CandidateMessages({
  matchId,
  candidateName,
}: {
  matchId: string;
  matchStatus?: string | null;
  candidateName: string;
}) {
  const firstName = candidateName.split(" ")[0] || candidateName;
  return <MessagesButton target={{ kind: "candidate", id: matchId }} label={`Talk to us about ${firstName}`} search={{ candidate: matchId }} />;
}

/** Quick actions available for a thread kind. */
export function actionsFor(kind: ThreadTarget["kind"], matchStatus?: string | null): QuickAction[] {
  if (kind === "general") return [ACTION_META.call_me_asap];
  if (kind === "candidate" && matchStatus === "interview_confirmed") return [ACTION_META.reschedule_request];
  return [];
}

export function ChatFeed({ messages, userId }: { messages: ThreadMessage[] | null; userId: string | null }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages?.length]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      {messages === null ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading messages…</p>
      ) : messages.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No messages yet — say hello to your recruiter.</p>
      ) : (
        <ul className="space-y-3">
          {messages.map((m) => {
            const mine = m.sender_role === "client" && (!userId || !m.sender_id || m.sender_id === userId);
            const action = m.structured_type ? ACTION_META[m.structured_type] ?? null : null;
            return (
              <li key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                <span className="mb-1 text-xs text-muted-foreground">
                  {mine ? "You" : m.sender_role === "client" ? "Your team" : "ScaleSource Team"} ·{" "}
                  {formatDateTime(m.created_at)}
                </span>
                {action ? (
                  <div className={`inline-flex max-w-[85%] flex-col gap-1 rounded-xl border px-3 py-2 text-sm ${action.tone}`}>
                    <span className="inline-flex items-center gap-1.5 font-semibold">
                      <action.icon className="h-3.5 w-3.5 flex-none" />
                      {action.label}
                    </span>
                    {m.body && m.body !== action.label && m.body !== action.body && <span className="whitespace-pre-line">{m.body}</span>}
                  </div>
                ) : (
                  <div
                    className={`max-w-[85%] whitespace-pre-line break-words rounded-2xl px-3.5 py-2 text-sm ${
                      mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted text-foreground"
                    }`}
                  >
                    {m.body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div ref={endRef} />
    </div>
  );
}

export function Composer({
  threadId,
  actions,
  onSent,
}: {
  threadId: string | null;
  actions: QuickAction[];
  onSent: (m: ThreadMessage) => void;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState<string | null>(null);

  async function send(text: string, structured: StructuredType | null) {
    if (!threadId || sending) return;
    const trimmed = text.trim();
    if (!trimmed && !structured) return;
    setSending(structured ?? "text");
    const { data, error } = await supabase.rpc("send_thread_message", {
      p_thread_id: threadId,
      p_body: trimmed,
      p_structured_type: structured,
    });
    setSending(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!structured) setBody("");
    const row = (Array.isArray(data) ? data[0] : data) as ThreadMessage | null;
    if (row?.id) onSent(row);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(body, null);
    }
  }

  return (
    <div className="space-y-2 border-t px-5 py-3">
      {actions.length > 0 && (
      <div className="flex flex-wrap gap-1.5">
        {actions.map((a) => (
          <button
            key={a.type}
            type="button"
            disabled={!threadId || sending !== null}
            onClick={() => void send(a.body, a.type)}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-50 ${a.tone}`}
          >
            {sending === a.type ? <Loader2 className="h-3 w-3 animate-spin" /> : <a.icon className="h-3 w-3" />}
            {a.label}
          </button>
        ))}
      </div>
      )}
      <div className="flex items-end gap-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Write a message…"
          rows={2}
          className="min-h-[44px] resize-none"
          disabled={!threadId}
        />
        <Button size="icon" aria-label="Send" disabled={!threadId || !body.trim() || sending !== null} onClick={() => void send(body, null)}>
          {sending === "text" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">Enter to send · Shift+Enter for a new line</p>
    </div>
  );
}
